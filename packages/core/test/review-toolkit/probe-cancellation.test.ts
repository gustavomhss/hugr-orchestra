import { expect } from "bun:test"
import path from "path"
import { existsSync } from "fs"
import { mkdir, readdir, readFile, readlink, writeFile } from "fs/promises"
import { Effect, Exit, Fiber, Option } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ReviewProbe } from "../../src/review-toolkit/probe"
import { ReviewScratch } from "../../src/review-toolkit/scratch-copy"
import { Writer } from "../../src/review-toolkit/snapshot-mutation"
import { expectSpawn } from "../fixture/omni-expect"
import { git } from "../fixture/git"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"
import { jail } from "../lib/sandbox-host"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
// These cases need real sandboxed test execution; an unavailable jail is a skip, not a passing probe.
const live = jail ? it.live : it.live.skip
const BASE = "export const limit = 1\n"
const HEAD = "export const limit = 2\n"
const BASE_TEST = `import { expect, test } from "bun:test"\nimport { limit } from "./a"\ntest("limit", () => { console.log("BASE_TEST_EXECUTED"); expect(limit).toBe(1) })\n`
const HEAD_TEST = `import { expect, test } from "bun:test"\nimport { limit } from "./a"\ntest("limit", () => { console.log("HEAD_TEST_EXECUTED"); expect(limit).toBe(2) })\n`
const HUNK = { path: "src/a.ts", line: 1, current: [HEAD.trim()], original: [BASE.trim()] }

const repo = Effect.acquireRelease(Effect.promise(async () => {
  const dir = await tmpdir()
  const root = path.join(dir.path, "repo")
  await mkdir(path.join(root, "src"), { recursive: true })
  await git(root, "init", "-q")
  await git(root, "config", "user.email", "probe@example.com")
  await git(root, "config", "user.name", "Probe")
  await writeFile(path.join(root, "package.json"), "{}\n")
  await writeFile(path.join(root, "bunfig.toml"), "[test]\n")
  await writeFile(path.join(root, "src", "a.ts"), BASE)
  await writeFile(path.join(root, "src", "a.test.ts"), BASE_TEST)
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "base")
  await writeFile(path.join(root, "src", "a.ts"), HEAD)
  await writeFile(path.join(root, "src", "a.test.ts"), HEAD_TEST)
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "head")
  return { dir, root }
}), (fixture) => Effect.promise(() => fixture.dir[Symbol.asyncDispose]()))

/** All reviewed worktree bytes and link targets, excluding Git's own metadata. */
async function image(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true })
  const nested = await Promise.all(entries.filter((entry) => entry.name !== ".git").map(async (entry) => {
    const relative = path.join(prefix, entry.name)
    if (entry.isSymbolicLink()) return [`${relative} -> ${await readlink(path.join(root, relative))}`]
    if (entry.isDirectory()) return [`${relative}/`, ...await image(root, relative)]
    return [`${relative}: ${(await readFile(path.join(root, relative))).toString("base64")}`]
  }))
  return nested.flat().sort()
}

const mutationRendezvous = <A, E>(paused: Promise<void>, first: Fiber.Fiber<A, E>) =>
  Effect.gen(function* () {
    const outcome = yield* Effect.raceFirst(
      Effect.promise(() => paused),
      Fiber.await(first),
    ).pipe(Effect.timeoutOption("90 seconds"))
    if (Option.isNone(outcome)) return yield* Effect.fail(new Error("probe mutation rendezvous timed out"))
    if (outcome.value !== undefined)
      return yield* Effect.fail(new Error(`probe completed before mutation rendezvous: ${JSON.stringify(outcome.value)}`))
  })

it.live("mutation rendezvous reports an actual pre-writer not-run result immediately and cleans up its snapshots", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* repo
    const snapshots = yield* Effect.scoped(Effect.gen(function* () {
      const base = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD~1" })
      const head = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD" })
      const paused = Promise.withResolvers<void>()
      const release = Promise.withResolvers<void>()
      const writes: string[] = []
      yield* Effect.scoped(Effect.gen(function* () {
        // This public probe refuses the offered, unbuilt option before any runner or writer; no jail is needed.
        const first = yield* ReviewProbe.run({ candidate: "c1", option: "probe:mutants", target: {} }, {
          reviewID: "review_probe_early", head, base,
          offered: { c1: ["probe:mutants"] },
          cap: 3, hunks: [], ledger: ReviewProbe.ledger(), timeoutSeconds: 60,
        }).pipe(
          Effect.provideService(Writer, async (file, content) => {
            await Bun.write(file, content)
            writes.push(file)
            paused.resolve()
            await release.promise
          }),
          Effect.forkScoped,
        )
        const early = yield* mutationRendezvous(paused.promise, first).pipe(Effect.flip)
        // A timeout must fail before awaiting the original fiber, so gate release and scoped interruption can run.
        expect(early.message.startsWith("probe completed before mutation rendezvous: ")).toBe(true)
        const completed = yield* Fiber.await(first)
        if (Exit.isFailure(completed)) throw new Error(`early probe failed: ${JSON.stringify(completed)}`)
        expect(completed.value.result).toMatchObject({ status: "not-run", reason: "not-built" })
        expect(early.message).toBe(`probe completed before mutation rendezvous: ${JSON.stringify(completed)}`)
        expect(writes).toEqual([])
      }).pipe(Effect.ensuring(Effect.sync(() => release.resolve()))))
      return [head.scratch, base.scratch]
    }))
    // The probe was awaited, its fiber scope closed, then both snapshot finalizers ran.
    expect(snapshots.map((scratch) => existsSync(scratch))).toEqual([false, false])
  }), 180_000,
)

for (const name of ["reverted hunk", "borrowed base test"] as const) {
  live(`cancelling the ${name} with its write Promise pending restores the copy before a queued review probe runs`, () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const fixture = yield* repo
      const before = yield* Effect.promise(() => image(fixture.root))
      yield* Effect.scoped(Effect.gen(function* () {
        const base = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD~1" })
        const head = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD" })
        const context: ReviewProbe.Context = {
          reviewID: "review_probe_cancel", head, base,
          offered: { c1: ["probe:regress"], c2: ["probe:test"] },
          cap: 3, hunks: [HUNK], ledger: ReviewProbe.ledger(), timeoutSeconds: 60,
        }
        const queued = { ...context, head: name === "reverted hunk" ? head : base }
        const target = name === "reverted hunk" ? path.join(head.root, "src", "a.ts") : path.join(base.root, "src", "a.test.ts")
        const paused = Promise.withResolvers<void>()
        const release = Promise.withResolvers<void>()
        const seen = new Set<string>()
        const delayedActualWriter = async (file: string, content: string | Uint8Array) => {
          await Bun.write(file, content)
          if (file !== target || seen.has(file)) return
          seen.add(file)
          // The real write is complete; only its Promise return (and therefore acquisition) is held here.
          paused.resolve()
          await release.promise
        }
        // Release the gate in the scope body before closing the scope, whose forkScoped finalizers interrupt and await all fibers.
        yield* Effect.scoped(Effect.gen(function* () {
          const first = yield* ReviewProbe.run({
            candidate: "c1", option: "probe:regress",
            target: {
              test: { file: "src/a.test.ts", name: "limit" },
              ...(name === "reverted hunk" ? { hunk: { path: "src/a.ts", startLine: 1, endLine: 1 } } : {}),
            },
          }, context).pipe(Effect.provideService(Writer, delayedActualWriter), Effect.forkScoped)
          yield* mutationRendezvous(paused.promise, first)
          expect(yield* Effect.promise(() => Bun.file(target).text())).toBe(name === "reverted hunk" ? BASE : HEAD_TEST)
          const interrupt = yield* Fiber.interrupt(first).pipe(Effect.forkScoped)
          yield* Effect.yieldNow
          const second = yield* ReviewProbe.run({
            candidate: "c2", option: "probe:test", target: { test: { file: "src/a.test.ts", name: "limit" } },
          }, queued).pipe(Effect.forkScoped)
          yield* Effect.yieldNow
          // This is recorded before HOST.take: the second actual probe has reached shared-permit admission.
          expect(queued.ledger.attempts.get("c2")).toBe(1)
          release.resolve()
          yield* Fiber.join(interrupt)
          const interrupted = yield* Fiber.await(first)
          expect(Exit.isFailure(interrupted)).toBe(true)
          expect(Exit.hasInterrupts(interrupted)).toBe(true)
          const result = yield* Fiber.join(second)
          expect(result.result.status, result.artifact.text).toBe("pass")
          expect(result.result.exitCode).toBe(0)
          expect(result.result.excerpt).toContain(name === "reverted hunk" ? "HEAD_TEST_EXECUTED" : "BASE_TEST_EXECUTED")
          expect(result.result.excerpt).not.toContain(name === "reverted hunk" ? "BASE_TEST_EXECUTED" : "HEAD_TEST_EXECUTED")
          expect(yield* Effect.promise(() => Bun.file(path.join(head.root, "src", "a.ts")).text())).toBe(HEAD)
          expect(yield* Effect.promise(() => Bun.file(path.join(base.root, "src", "a.test.ts")).text())).toBe(BASE_TEST)
          expect(yield* Effect.promise(() => image(fixture.root))).toEqual(before)
        }).pipe(Effect.ensuring(Effect.sync(() => release.resolve()))))
      }))
      expect(yield* Effect.promise(() => image(fixture.root))).toEqual(before)
    }), 180_000,
  )
}

// Not the cases above: those hold the writer Promise after kernel IO. These pause before the undo write.
//
// Negative control, do not apply. In snapshot-mutation.ts replace the release with
// `() => Effect.forkDetach(undo, { startImmediately: true }).pipe(Effect.asVoid)`.
// The promise-pending cases still pass: their undo write is an ungated Bun.write that finishes before the
// queued jailed test reads the copy. These fail: the first fiber's exit is published, and therefore the shared
// permit is released, while this gate still holds the restore write and the copy bytes are still temporary.
// `() => Effect.interruptible(undo)` also fails here (interruptUnsafe completes that fiber before Bun.write);
// it fails the promise-pending cases too, because their interrupt is already pending when release starts.
for (const name of ["reverted hunk", "borrowed base test"] as const) {
  live(`interrupting during undo of the ${name} before the restore write awaits restoration before the shared permit is released`, () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const fixture = yield* repo
      const before = yield* Effect.promise(() => image(fixture.root))
      yield* Effect.scoped(Effect.gen(function* () {
        const base = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD~1" })
        const head = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD" })
        const context: ReviewProbe.Context = {
          reviewID: "review_probe_undo", head, base,
          offered: { c1: ["probe:regress"], c2: ["probe:test"] },
          cap: 3, hunks: [HUNK], ledger: ReviewProbe.ledger(), timeoutSeconds: 60,
        }
        const queued = { ...context, head: name === "reverted hunk" ? head : base }
        const target = name === "reverted hunk" ? path.join(head.root, "src", "a.ts") : path.join(base.root, "src", "a.test.ts")
        const temporary = name === "reverted hunk" ? BASE : HEAD_TEST
        const restored = name === "reverted hunk" ? HEAD : BASE_TEST
        const paused = Promise.withResolvers<void>()
        const release = Promise.withResolvers<void>()
        // False until the forked probe fiber is visible. A missing fiber is a leak, not a pass.
        const probeHeld = { read: () => false }
        const io = { calls: 0, kernel: 0 }
        const pendingRestore: string[] = []
        const order: string[] = []
        const gatedUndoWriter = async (file: string, content: string | Uint8Array) => {
          if (file !== target) {
            await Bun.write(file, content)
            return
          }
          io.calls += 1
          if (io.calls === 1) {
            await Bun.write(file, content)
            io.kernel += 1
            return
          }
          if (io.calls > 2) {
            await Bun.write(file, content)
            return
          }
          pendingRestore.push(typeof content === "string" ? content : new TextDecoder().decode(content))
          // Undo has been asked for; the temporary bytes stay until this gate opens.
          paused.resolve()
          await release.promise
          order.push(probeHeld.read() ? "held" : "released")
          await Bun.write(file, content)
          io.kernel += 1
        }
        yield* Effect.scoped(Effect.gen(function* () {
          const first = yield* ReviewProbe.run({
            candidate: "c1", option: "probe:regress",
            target: {
              test: { file: "src/a.test.ts", name: "limit" },
              ...(name === "reverted hunk" ? { hunk: { path: "src/a.ts", startLine: 1, endLine: 1 } } : {}),
            },
          }, context).pipe(Effect.provideService(Writer, gatedUndoWriter), Effect.forkScoped)
          probeHeld.read = () => first.pollUnsafe() === undefined
          yield* mutationRendezvous(paused.promise, first)
          expect(io).toEqual({ calls: 2, kernel: 1 })
          expect(pendingRestore).toEqual([restored])
          expect(yield* Effect.promise(() => Bun.file(target).text())).toBe(temporary)
          // Synchronous: an interruptible release completes this fiber before the next yield. A forked
          // Fiber.interrupt would only set the flag on a later turn, and a poll then can miss it.
          first.interruptUnsafe()
          yield* Effect.yieldNow
          const leaked = first.pollUnsafe()
          if (leaked !== undefined)
            return yield* Effect.fail(new Error(`undo release finished before the restore write: ${JSON.stringify(leaked)}`))
          expect(yield* Effect.promise(() => Bun.file(target).text())).toBe(temporary)
          const interrupt = yield* Fiber.interrupt(first).pipe(Effect.forkScoped)
          const second = yield* ReviewProbe.run({
            candidate: "c2", option: "probe:test", target: { test: { file: "src/a.test.ts", name: "limit" } },
          }, queued).pipe(Effect.forkScoped)
          yield* Effect.yieldNow
          // Recorded before HOST.take. The first fiber has not exited, so its permit finalizer has not run.
          expect(queued.ledger.attempts.get("c2")).toBe(1)
          const stillHeld = first.pollUnsafe()
          if (stillHeld !== undefined)
            return yield* Effect.fail(new Error(`shared permit released while the undo write was gated: ${JSON.stringify(stillHeld)}`))
          const queuedEarly = second.pollUnsafe()
          if (queuedEarly !== undefined)
            return yield* Effect.fail(new Error(`queued probe finished while the undo write was gated: ${JSON.stringify(queuedEarly)}`))
          expect(yield* Effect.promise(() => Bun.file(target).text())).toBe(temporary)
          release.resolve()
          yield* Fiber.join(interrupt)
          const interrupted = yield* Fiber.await(first)
          expect(order).toEqual(["held"])
          expect(Exit.isFailure(interrupted)).toBe(true)
          expect(Exit.hasInterrupts(interrupted)).toBe(true)
          const result = yield* Fiber.join(second)
          expect(result.result.status, result.artifact.text).toBe("pass")
          expect(result.result.exitCode).toBe(0)
          expect(result.result.excerpt).toContain(name === "reverted hunk" ? "HEAD_TEST_EXECUTED" : "BASE_TEST_EXECUTED")
          expect(result.result.excerpt).not.toContain(name === "reverted hunk" ? "BASE_TEST_EXECUTED" : "HEAD_TEST_EXECUTED")
          expect(yield* Effect.promise(() => Bun.file(path.join(head.root, "src", "a.ts")).text())).toBe(HEAD)
          expect(yield* Effect.promise(() => Bun.file(path.join(base.root, "src", "a.test.ts")).text())).toBe(BASE_TEST)
          expect(yield* Effect.promise(() => image(fixture.root))).toEqual(before)
        }).pipe(Effect.ensuring(Effect.sync(() => release.resolve()))))
      }))
      expect(yield* Effect.promise(() => image(fixture.root))).toEqual(before)
    }), 180_000,
  )
}
