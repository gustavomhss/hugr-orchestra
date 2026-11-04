import { expect } from "bun:test"
import path from "path"
import { mkdir, readdir, readFile, readlink, writeFile } from "fs/promises"
import { Effect, Exit, Fiber } from "effect"
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

for (const name of ["reverted hunk", "borrowed base test"] as const) {
  live(`cancelling the actual ${name} acquisition restores the copy before a queued review probe runs`, () =>
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
          paused.resolve()
          await release.promise
        }
        yield* Effect.gen(function* () {
          const first = yield* ReviewProbe.run({
            candidate: "c1", option: "probe:regress",
            target: {
              test: { file: "src/a.test.ts", name: "limit" },
              ...(name === "reverted hunk" ? { hunk: { path: "src/a.ts", startLine: 1, endLine: 1 } } : {}),
            },
          }, context).pipe(Effect.provideService(Writer, delayedActualWriter), Effect.forkChild)
          yield* Effect.promise(() => paused.promise)
          expect(yield* Effect.promise(() => Bun.file(target).text())).toBe(name === "reverted hunk" ? BASE : HEAD_TEST)
          const interrupt = yield* Fiber.interrupt(first).pipe(Effect.forkChild)
          yield* Effect.yieldNow
          const second = yield* ReviewProbe.run({
            candidate: "c2", option: "probe:test", target: { test: { file: "src/a.test.ts", name: "limit" } },
          }, queued).pipe(Effect.forkChild)
          yield* Effect.yieldNow
          // This is recorded before HOST.take: the second actual probe has reached shared-permit admission.
          expect(queued.ledger.attempts.get("c2")).toBe(1)
          release.resolve()
          expect(Exit.isFailure(yield* Fiber.join(interrupt))).toBe(true)
          const result = yield* Fiber.join(second)
          expect(result.result.status, result.artifact.text).toBe("pass")
          expect(result.result.exitCode).toBe(0)
          expect(result.result.excerpt).toContain(name === "reverted hunk" ? "HEAD_TEST_EXECUTED" : "BASE_TEST_EXECUTED")
          expect(result.result.excerpt).not.toContain(name === "reverted hunk" ? "BASE_TEST_EXECUTED" : "HEAD_TEST_EXECUTED")
          expect(yield* Effect.promise(() => Bun.file(path.join(head.root, "src", "a.ts")).text())).toBe(HEAD)
          expect(yield* Effect.promise(() => Bun.file(path.join(base.root, "src", "a.test.ts")).text())).toBe(BASE_TEST)
          expect(yield* Effect.promise(() => image(fixture.root))).toEqual(before)
        }).pipe(Effect.ensuring(Effect.sync(() => release.resolve())))
      }))
      expect(yield* Effect.promise(() => image(fixture.root))).toEqual(before)
    }), 180_000,
  )
}
