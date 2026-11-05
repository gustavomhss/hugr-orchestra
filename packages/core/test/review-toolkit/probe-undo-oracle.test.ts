import { expect, test } from "bun:test"
import path from "path"
import { mkdir, readdir, readFile, readlink, writeFile } from "fs/promises"
import { Effect, Exit, Fiber, Option, Scheduler } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ReviewProbe } from "../../src/review-toolkit/probe"
import { ReviewScratch } from "../../src/review-toolkit/scratch-copy"
import { ReleaseObserver, Writer } from "../../src/review-toolkit/snapshot-mutation"
import { expectSpawn } from "../fixture/omni-expect"
import { git } from "../fixture/git"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"
import { jail } from "../lib/sandbox-host"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))

/** Linux and macOS must run this oracle. Every other platform, including Windows, is explicitly unsupported. */
const supportedOraclePlatform = (platform: string) => platform === "linux" || platform === "darwin"

/** A missing jail on a supported host is a named failure, never a skip. `acquired` is the caller's real jail, not a stand-in. */
function oracleJail(platform: string, acquired: boolean): "run" | "unsupported" | "conformance-missing" {
  if (!supportedOraclePlatform(platform)) return "unsupported"
  if (!acquired) return "conformance-missing"
  return "run"
}

// Platform only. A missing jail is not a skip; the body fails conformance-missing before any IO.
const live = supportedOraclePlatform(process.platform) ? it.live : it.live.skip

test("a missing jail is conformance-missing on linux and macOS, and unsupported on Windows", () => {
  expect(oracleJail("linux", false)).toBe("conformance-missing")
  expect(oracleJail("darwin", false)).toBe("conformance-missing")
  expect(oracleJail("linux", true)).toBe("run")
  expect(oracleJail("darwin", true)).toBe("run")
  expect(oracleJail("win32", false)).toBe("unsupported")
  expect(oracleJail("win32", true)).toBe("unsupported")
  expect(supportedOraclePlatform("linux")).toBe(true)
  expect(supportedOraclePlatform("darwin")).toBe(true)
  expect(supportedOraclePlatform("win32")).toBe(false)
})

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

const enteredOrDone = <A, E>(entered: Promise<void>, first: Fiber.Fiber<A, E>) =>
  Effect.gen(function* () {
    const outcome = yield* Effect.raceFirst(Effect.promise(() => entered), Fiber.await(first)).pipe(Effect.timeoutOption("90 seconds"))
    if (Option.isNone(outcome)) return yield* Effect.fail(new Error("probe mutation rendezvous timed out"))
    if (outcome.value !== undefined)
      return yield* Effect.fail(new Error(`probe completed before mutation rendezvous: ${JSON.stringify(outcome.value)}`))
  })

/** Records every dispatcher this scheduler creates. Flush drains those, not a dispatcher made only for the check. */
const trackDispatchers = (underlying: Scheduler.Scheduler) => {
  const dispatchers: Scheduler.SchedulerDispatcher[] = []
  const scheduler: Scheduler.Scheduler = {
    executionMode: underlying.executionMode,
    shouldYield: (fiber) => underlying.shouldYield(fiber),
    makeDispatcher: () => {
      const dispatcher = underlying.makeDispatcher()
      dispatchers.push(dispatcher)
      return dispatcher
    },
  }
  return {
    scheduler,
    dispatchers,
    flush: () => { for (const dispatcher of dispatchers) dispatcher.flush() },
  }
}

for (const name of ["reverted hunk", "borrowed base test"] as const) {
  live(`undo of the ${name} parks before the restore write; the release observer stays pending until that write`, () =>
    Effect.gen(function* () {
      const decision = oracleJail(process.platform, jail !== undefined)
      if (decision !== "run") return yield* Effect.fail(new Error(decision))
      expectSpawn(import.meta.path)
      const fixture = yield* repo
      const before = yield* Effect.promise(() => image(fixture.root))
      const tracked = trackDispatchers(new Scheduler.MixedScheduler("sync"))
      yield* Effect.scoped(Effect.gen(function* () {
        const base = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD~1" })
        const head = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD" })
        const context: ReviewProbe.Context = {
          reviewID: "review_undo_oracle", head, base,
          offered: { c1: ["probe:regress"], c2: ["probe:test"] },
          cap: 3, hunks: [HUNK], ledger: ReviewProbe.ledger(), timeoutSeconds: 60,
        }
        const queued = { ...context, head: name === "reverted hunk" ? head : base }
        const target = name === "reverted hunk" ? path.join(head.root, "src", "a.ts") : path.join(base.root, "src", "a.test.ts")
        const temporary = name === "reverted hunk" ? BASE : HEAD_TEST
        const entered = Promise.withResolvers<void>()
        const gate = Promise.withResolvers<void>()
        const wrote = Promise.withResolvers<void>()
        const phase = { pending: true }
        const observations: string[] = []
        let calls = 0
        const writer = async (file: string, content: string | Uint8Array) => {
          if (file !== target) {
            await Bun.write(file, content)
            return
          }
          calls += 1
          if (calls === 1) {
            await Bun.write(file, content)
            return
          }
          entered.resolve()
          await gate.promise
          await Bun.write(file, content)
          phase.pending = false
          wrote.resolve()
        }
        yield* Effect.scoped(Effect.gen(function* () {
          const first = yield* Effect.gen(function* () {
            yield* Effect.yieldNow
            return yield* ReviewProbe.run({
              candidate: "c1", option: "probe:regress",
              target: {
                test: { file: "src/a.test.ts", name: "limit" },
                ...(name === "reverted hunk" ? { hunk: { path: "src/a.ts", startLine: 1, endLine: 1 } } : {}),
              },
            }, context)
          }).pipe(
            Effect.provideService(Writer, writer),
            Effect.provideService(ReleaseObserver, () => { observations.push(phase.pending ? "pending" : "restored") }),
            Effect.provideService(Scheduler.Scheduler, tracked.scheduler),
            Effect.provideService(Scheduler.PreventSchedulerYield, true),
            Effect.forkScoped,
          )
          yield* enteredOrDone(entered.promise, first)
          expect(calls).toBe(2)
          expect(yield* Effect.promise(() => Bun.file(target).text())).toBe(temporary)
          first.interruptUnsafe()
          if (tracked.dispatchers.length === 0)
            return yield* Effect.fail(new Error("undo oracle dispatcher handshake missing"))
          let ran = false
          for (const dispatcher of tracked.dispatchers) dispatcher.scheduleTask(() => { ran = true }, 0)
          tracked.flush()
          if (!ran) return yield* Effect.fail(new Error("undo oracle flush did not run a scheduled task"))
          tracked.flush()
          expect(observations, "release observer ran while the restore write was still pending").toEqual([])
          expect(yield* Effect.promise(() => Bun.file(target).text())).toBe(temporary)
          const second = yield* ReviewProbe.run({
            candidate: "c2", option: "probe:test", target: { test: { file: "src/a.test.ts", name: "limit" } },
          }, queued).pipe(Effect.forkScoped)
          gate.resolve()
          yield* Effect.promise(() => wrote.promise.then(() => Promise.resolve()))
          tracked.flush()
          expect(observations).toEqual(["restored"])
          expect(phase.pending).toBe(false)
          const interrupted = yield* Fiber.await(first)
          expect(Exit.isFailure(interrupted)).toBe(true)
          expect(Exit.hasInterrupts(interrupted)).toBe(true)
          const result = yield* Fiber.join(second)
          expect(result.result.status, result.artifact.text).toBe("pass")
          expect(result.result.excerpt).toContain(name === "reverted hunk" ? "HEAD_TEST_EXECUTED" : "BASE_TEST_EXECUTED")
          expect(result.result.excerpt).not.toContain(name === "reverted hunk" ? "BASE_TEST_EXECUTED" : "HEAD_TEST_EXECUTED")
          expect(yield* Effect.promise(() => Bun.file(path.join(head.root, "src", "a.ts")).text())).toBe(HEAD)
          expect(yield* Effect.promise(() => Bun.file(path.join(base.root, "src", "a.test.ts")).text())).toBe(BASE_TEST)
          expect(yield* Effect.promise(() => image(fixture.root))).toEqual(before)
        }).pipe(Effect.ensuring(Effect.sync(() => gate.resolve()))))
      }))
      expect(yield* Effect.promise(() => image(fixture.root))).toEqual(before)
    }), 240_000,
  )
}
