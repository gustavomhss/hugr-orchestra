import { expect } from "bun:test"
import { createHash } from "crypto"
import { existsSync } from "fs"
import { mkdir, rm, writeFile } from "fs/promises"
import path from "path"
import { Effect, Exit, Fiber } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ResearchToolkit } from "../../src/research-toolkit"
import { ReviewProbe } from "../../src/review-toolkit/probe"
import { ReviewProbeRuntime } from "../../src/review-toolkit/probe-runtime"
import { ReviewScopedTypecheck } from "../../src/review-toolkit/scoped-typecheck"
import { ReviewScratch } from "../../src/review-toolkit/scratch-copy"
import { expectSpawn } from "../fixture/omni-expect"
import { git } from "../fixture/git"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"
import { jail } from "../lib/sandbox-host"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const linux = process.platform === "linux" && process.arch === "x64"
const SOURCE = "export const count: string = '42'\n"
const MARKER = "REVIEW_PERMIT_CONTROL_EXECUTED"

function input() {
  const bytes = Buffer.from(SOURCE)
  return { path: "input.ts", bytes, oid: createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") }
}

const fixture = Effect.acquireRelease(Effect.promise(async () => {
  const directory = await tmpdir()
  const worktree = path.join(directory.path, "repo")
  await mkdir(worktree)
  await git(worktree, "init", "-q")
  await git(worktree, "config", "user.email", "probe@example.com")
  await git(worktree, "config", "user.name", "Probe")
  await writeFile(path.join(worktree, "package.json"), "{}\n")
  await writeFile(path.join(worktree, "input.ts"), SOURCE)
  await git(worktree, "add", ".")
  await git(worktree, "commit", "-q", "-m", "scoped probe permit fixture")
  return { directory, worktree, toolkit: path.join(directory.path, "toolkit") }
}), (value) => Effect.promise(() => value.directory[Symbol.asyncDispose]()))

function legacy(head: ReviewScratch.Snapshot, reviewID: string) {
  return ReviewProbe.run({ candidate: "control", option: "probe:script",
    target: { script: { language: "js", text: `console.log('${MARKER}')\n` } } }, {
    reviewID, head, offered: { control: ["probe:script"] }, cap: 1, hunks: [],
    ledger: ReviewProbe.ledger(), timeoutSeconds: 30, queueSeconds: 30,
  })
}

const prepared = Effect.gen(function* () {
  expect(jail, "conformance-missing: sandbox").toBeTruthy()
  const value = yield* fixture
  yield* ResearchToolkit.ensure("typescript").pipe(Effect.provideService(ResearchToolkit.Root, value.toolkit))
  const compiler = yield* ReviewScopedTypecheck.run(input()).pipe(Effect.provideService(ResearchToolkit.Root, value.toolkit))
  expect(compiler.status, `conformance-missing: scoped compiler ${JSON.stringify(compiler)}`).toBe("pass")
  const head = yield* ReviewScratch.create({ worktree: value.worktree, revision: "HEAD" })
  const control = yield* legacy(head, "permit-positive-control")
  expect(control.result.status, control.artifact.text).toBe("pass")
  expect(control.result.excerpt).toContain(MARKER)
  return { ...value, head }
})

/** A real spawn wins on the old implementation; an actual permit wait must win on the corrected one. */
function admission<A, E>(signal: Promise<"waiting" | "spawned">, fiber: Fiber.Fiber<A, E>) {
  return Effect.raceFirst(
    Effect.promise(() => signal),
    Fiber.await(fiber).pipe(Effect.flatMap((exit) => Effect.fail(new Error(`probe completed before admission rendezvous: ${JSON.stringify(exit)}`)))),
  ).pipe(Effect.timeout("20 seconds"))
}

it.live("a scoped compiler waits for an existing review probe's real cleanup before spawning", () => Effect.gen(function* () {
  if (!linux) {
    expect(yield* ReviewScopedTypecheck.run(input())).toEqual({ status: "not-run", reason: "unsupported-platform" })
    return
  }
  expectSpawn(import.meta.path)
  const value = yield* prepared
  const processes = yield* AppProcess.Service
  const entered = Promise.withResolvers<string>()
  const release = Promise.withResolvers<void>()
  const waiting = Promise.withResolvers<"waiting" | "spawned">()
  const ownerEvents: string[] = []
  const scopedEvents: string[] = []
  const order: string[] = []
  const observed = AppProcess.Service.of({ ...processes,
    spawn: (command) => processes.spawn(command).pipe(Effect.tap(() => Effect.sync(() => {
      order.push("scoped:spawn")
      waiting.resolve("spawned")
    }))),
  })
  yield* Effect.scoped(Effect.gen(function* () {
    const owner = yield* legacy(value.head, "legacy-owner").pipe(
      Effect.provideService(ReviewProbe.ObservePermit, (event) => { ownerEvents.push(event); order.push(`owner:${event}`) }),
      Effect.provideService(ReviewProbeRuntime.Cleanup, async (directory) => {
        entered.resolve(directory)
        await release.promise
        await rm(directory, { recursive: true, force: true })
        order.push("owner:cleaned")
      }),
      Effect.forkScoped,
    )
    const scratch = yield* Effect.promise(() => entered.promise).pipe(Effect.timeout("20 seconds"))
    expect(ownerEvents).toEqual(["waiting", "acquired"])
    expect(existsSync(scratch)).toBe(true)
    const scoped = yield* ReviewScopedTypecheck.run(input()).pipe(
      Effect.provideService(ResearchToolkit.Root, value.toolkit),
      Effect.provideService(AppProcess.Service, observed),
      Effect.provideService(ReviewProbe.ObservePermit, (event) => {
        scopedEvents.push(event)
        order.push(`scoped:${event}`)
        if (event === "waiting") waiting.resolve("waiting")
      }),
      Effect.forkScoped,
    )
    expect(yield* admission(waiting.promise, scoped)).toBe("waiting")
    expect(scopedEvents).toEqual(["waiting"])
    expect(order).not.toContain("scoped:spawn")
    expect(existsSync(scratch)).toBe(true)
    release.resolve()
    const original = yield* Fiber.join(owner)
    expect(original.result.status, original.artifact.text).toBe("pass")
    expect(original.result.excerpt).toContain(MARKER)
    expect((yield* Fiber.join(scoped)).status).toBe("pass")
    expect(ownerEvents).toEqual(["waiting", "acquired", "released"])
    expect(scopedEvents).toEqual(["waiting", "acquired", "released"])
    expect(order.indexOf("owner:cleaned")).toBeLessThan(order.indexOf("owner:released"))
    expect(order.indexOf("owner:released")).toBeLessThan(order.indexOf("scoped:acquired"))
    expect(order.indexOf("scoped:acquired")).toBeLessThan(order.indexOf("scoped:spawn"))
    expect(existsSync(scratch)).toBe(false)
  }).pipe(Effect.ensuring(Effect.sync(() => release.resolve()))))
}), 300_000)

it.live("cancelling a waiting scoped compiler preserves the owner's permit and admits the next real review probe only after release", () => Effect.gen(function* () {
  if (!linux) {
    expect(yield* ReviewScopedTypecheck.run(input())).toEqual({ status: "not-run", reason: "unsupported-platform" })
    return
  }
  expectSpawn(import.meta.path)
  const value = yield* prepared
  const processes = yield* AppProcess.Service
  const entered = Promise.withResolvers<string>()
  const release = Promise.withResolvers<void>()
  const waiting = Promise.withResolvers<"waiting" | "spawned">()
  const peerWaiting = Promise.withResolvers<void>()
  const ownerEvents: string[] = []
  const cancelledEvents: string[] = []
  const peerEvents: string[] = []
  const order: string[] = []
  const ownerProcesses = AppProcess.Service.of({ ...processes,
    spawn: (command) => processes.spawn(command).pipe(Effect.tap(() => Effect.gen(function* () {
      if (!ChildProcess.isStandardCommand(command) || !command.options.cwd) return yield* Effect.die("missing real compiler cwd")
      order.push("owner:spawn")
      entered.resolve(command.options.cwd)
      // The real native process has been started; only returning its handle is held.
      yield* Effect.promise(() => release.promise)
    }))),
  })
  const waiterProcesses = AppProcess.Service.of({ ...processes,
    spawn: (command) => processes.spawn(command).pipe(Effect.tap(() => Effect.sync(() => {
      order.push("cancelled:spawn")
      waiting.resolve("spawned")
    }))),
  })
  const peerProcesses = AppProcess.Service.of({ ...processes,
    spawn: (command) => processes.spawn(command).pipe(Effect.tap(() => Effect.sync(() => { order.push("peer:spawn") }))),
  })
  yield* Effect.scoped(Effect.gen(function* () {
    const owner = yield* ReviewScopedTypecheck.run(input()).pipe(
      Effect.provideService(ResearchToolkit.Root, value.toolkit),
      Effect.provideService(AppProcess.Service, ownerProcesses),
      Effect.provideService(ReviewProbe.ObservePermit, (event) => { ownerEvents.push(event); order.push(`owner:${event}`) }),
      Effect.forkScoped,
    )
    const scratch = yield* Effect.promise(() => entered.promise).pipe(Effect.timeout("20 seconds"))
    expect(existsSync(scratch)).toBe(true)
    const cancelled = yield* ReviewScopedTypecheck.run(input()).pipe(
      Effect.provideService(ResearchToolkit.Root, value.toolkit),
      Effect.provideService(AppProcess.Service, waiterProcesses),
      Effect.provideService(ReviewProbe.ObservePermit, (event) => {
        cancelledEvents.push(event)
        order.push(`cancelled:${event}`)
        if (event === "waiting") waiting.resolve("waiting")
      }),
      Effect.forkScoped,
    )
    expect(yield* admission(waiting.promise, cancelled)).toBe("waiting")
    yield* Fiber.interrupt(cancelled)
    expect(Exit.hasInterrupts(yield* Fiber.await(cancelled))).toBe(true)
    expect(cancelledEvents).toEqual(["waiting"])
    expect(order).not.toContain("cancelled:spawn")
    expect(ownerEvents).toEqual(["waiting", "acquired"])
    expect(owner.pollUnsafe()).toBeUndefined()
    expect(existsSync(scratch)).toBe(true)
    const peer = yield* legacy(value.head, "legacy-after-cancelled-scoped").pipe(
      Effect.provideService(AppProcess.Service, peerProcesses),
      Effect.provideService(ReviewProbe.ObservePermit, (event) => {
        peerEvents.push(event)
        order.push(`peer:${event}`)
        if (event === "waiting") peerWaiting.resolve()
      }),
      Effect.forkScoped,
    )
    yield* Effect.promise(() => peerWaiting.promise).pipe(Effect.timeout("20 seconds"))
    expect(peerEvents).toEqual(["waiting"])
    expect(order).not.toContain("peer:spawn")
    expect(owner.pollUnsafe()).toBeUndefined()
    release.resolve()
    expect((yield* Fiber.join(owner)).status).toBe("pass")
    const result = yield* Fiber.join(peer)
    expect(result.result.status, result.artifact.text).toBe("pass")
    expect(result.result.excerpt).toContain(MARKER)
    expect(ownerEvents).toEqual(["waiting", "acquired", "released"])
    expect(peerEvents).toEqual(["waiting", "acquired", "released"])
    expect(order.indexOf("owner:released")).toBeLessThan(order.indexOf("peer:acquired"))
    expect(order.indexOf("peer:acquired")).toBeLessThan(order.indexOf("peer:spawn"))
    expect(existsSync(scratch)).toBe(false)
  }).pipe(Effect.ensuring(Effect.sync(() => release.resolve()))))
}), 300_000)
