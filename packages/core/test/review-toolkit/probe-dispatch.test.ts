import { expect } from "bun:test"
import path from "path"
import { existsSync } from "fs"
import { mkdir, readdir, readFile, rm, writeFile } from "fs/promises"
import { Effect, Fiber, Schema } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ReviewProbe } from "../../src/review-toolkit/probe"
import { ReviewProbeRuntime } from "../../src/review-toolkit/probe-runtime"
import { ReviewProbeMutants } from "../../src/review-toolkit/probe-mutants"
import { ReviewScratch } from "../../src/review-toolkit/scratch-copy"
import { expectSpawn } from "../fixture/omni-expect"
import { git } from "../fixture/git"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"
import { jail } from "../lib/sandbox-host"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const live = jail ? it.live : it.live.skip
const LOST = `let value = 0\nexport const current = () => value\nexport async function update(label: string, gate: (label: string) => Promise<void>) {\n  const seen = value\n  await gate(label)\n  value = seen + 1\n}\n`
const FIXED = `let value = 0\nexport const current = () => value\nexport async function update(label: string, gate: (label: string) => Promise<void>) {\n  await gate(label)\n  value = value + 1\n}\n`
const RUST = "pub fn add(left: u64, right: u64) -> u64 { left + right }\n"
const CARGO = "[package]\nname = \"probe_fixture\"\nversion = \"0.1.0\"\nedition = \"2021\"\n"
const SCENARIO = `async function scenario(root: string, gate: (label: string) => Promise<void>) {\n  const mod = await import(root + "/src/a.ts")\n  await Promise.all([mod.update("left", gate), mod.update("right", gate)])\n  return mod.current() === 2\n}\n`
const decode = (payload: unknown) => Schema.decodeUnknownSync(ReviewProbe.Input)(payload, { onExcessProperty: "error" })

const repo = () => Effect.acquireRelease(Effect.promise(async () => {
  const dir = await tmpdir()
  const root = path.join(dir.path, "repo")
  await mkdir(path.join(root, "src"), { recursive: true })
  await git(root, "init", "-q")
  await git(root, "config", "user.email", "probe@example.com")
  await git(root, "config", "user.name", "Probe")
  await writeFile(path.join(root, "package.json"), "{}\n")
  await writeFile(path.join(root, "Cargo.toml"), CARGO)
  await writeFile(path.join(root, "src", "lib.rs"), RUST)
  await writeFile(path.join(root, "src", "a.ts"), LOST)
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "base")
  await writeFile(path.join(root, "src", "a.ts"), FIXED)
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "head")
  return { dir, root }
}), (made) => Effect.promise(() => rm(made.dir.path, { recursive: true, force: true })))

const copies = (root: string) => Effect.all({
  head: ReviewScratch.create({ worktree: root, revision: "HEAD" }),
  base: ReviewScratch.create({ worktree: root, revision: "HEAD~1" }),
})

const run = (input: ReviewProbe.Input, context: ReviewProbe.Context) =>
  ReviewProbe.run(input, context).pipe(Effect.provideService(ReviewProbeMutants.Binary, undefined))

live("property pass keeps evidence and does not revert or bun-test", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  expect(() => decode({ candidate: "p", option: "probe:property", target: { legacy: true } })).toThrow()
  const made = yield* repo()
  const gone = yield* Effect.scoped(Effect.gen(function* () {
    const copy = yield* copies(made.root)
    const input = decode({
      candidate: "p", option: "probe:property",
      target: { property: { language: "ts", law: "holds", source: "const property = () => true\n", seed: 1, cases: 1 } },
    })
    const out = yield* run(input, {
      reviewID: "property", head: copy.head, base: copy.base, offered: { p: ["probe:property"] }, cap: 1, hunks: [], ledger: ReviewProbe.ledger(), timeoutSeconds: 30,
    })
    expect(out.result.status).toBe("pass")
    expect(out.evidence?.option).toBe("probe:property")
    expect(out.artifact.uri).toBe(out.result.uri)
    expect(out.artifact.text.includes("bun test")).toBe(false)
    expect(out.artifact.text.includes("revert")).toBe(false)
    expect(yield* Effect.promise(() => readFile(path.join(copy.head.root, "src", "a.ts"), "utf8"))).toBe(FIXED)
    expect(existsSync(path.join(copy.head.root, "Cargo.lock"))).toBe(false)
    return [copy.head.root, copy.base.root]
  }))
  expect(gone.every((root) => !existsSync(root))).toBe(true)
  expect(yield* Effect.promise(() => readFile(path.join(made.root, "src", "a.ts"), "utf8"))).toBe(FIXED)
}))

live("interleave offered alone passes with two head passes and two base fails", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* repo()
  const gone = yield* Effect.scoped(Effect.gen(function* () {
    const copy = yield* copies(made.root)
    const input = decode({
      candidate: "i", option: "probe:interleave",
      target: { interleave: { language: "ts", source: SCENARIO, schedule: ["left", "right"] } },
    })
    const ledger = ReviewProbe.ledger()
    const out = yield* run(input, {
      reviewID: "interleave", head: copy.head, base: copy.base, offered: { i: ["probe:interleave"] }, cap: 1, hunks: [], ledger, timeoutSeconds: 60,
    })
    expect(out.result.status).toBe("pass")
    expect(out.evidence?.option).toBe("probe:interleave")
    expect(ledger.observed).toHaveLength(1)
    expect(ledger.observed[0]?.result.uri).toBe(out.result.uri)
    expect(out.artifact.text.match(/head:[12]: pass/g)?.length).toBe(2)
    expect(out.artifact.text.match(/base:[12]: fail/g)?.length).toBe(2)
    expect(yield* Effect.promise(() => readFile(path.join(copy.base.root, "src", "a.ts"), "utf8"))).toBe(LOST)
    expect(yield* Effect.promise(() => readFile(path.join(copy.head.root, "src", "lib.rs"), "utf8"))).toBe(RUST)
    return [copy.head.root, copy.base.root]
  }))
  expect(gone.every((root) => !existsSync(root))).toBe(true)
  expect(yield* Effect.promise(() => readFile(path.join(made.root, "src/a.ts"), "utf8"))).toBe(FIXED)
}))

it.live("mutants lock, missing targets, repeat, cap, and not-offered keep the ledger", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* repo()
  const copy = yield* copies(made.root)
  const ctx = (offered: Record<string, readonly string[]>, cap: number, ledger = ReviewProbe.ledger()) => ({
    reviewID: "mutants", head: copy.head, base: copy.base, offered, cap, hunks: [] as ReviewScratch.Hunk[], ledger, timeoutSeconds: 30,
  })
  const ledger = ReviewProbe.ledger()
  const missing = yield* run(decode({ candidate: "p", option: "probe:property", target: {} }), ctx({ p: ["probe:property"], i: ["probe:interleave"], m: ["probe:mutants"] }, 5, ledger))
  expect(missing.result.status).toBe("not-run")
  expect(missing.evidence).toBeUndefined()
  expect(missing.artifact.uri).toBe(missing.result.uri)
  expect(missing.artifact.text).toContain("probe:property")
  expect(missing.result.reason ?? "").toContain("target-missing")
  expect(missing.result.reason ?? "").toContain("property")
  expect(missing.result.reason).not.toBe("not-built")
  expect(missing.result.reason ?? "").not.toContain("regress")
  const interleave = yield* run(decode({ candidate: "i", option: "probe:interleave", target: {} }), ctx({ p: ["probe:property"], i: ["probe:interleave"], m: ["probe:mutants"] }, 5, ledger))
  const mutantsMissing = yield* run(decode({ candidate: "m", option: "probe:mutants", target: {} }), ctx({ p: ["probe:property"], i: ["probe:interleave"], m: ["probe:mutants"] }, 5, ledger))
  for (const [name, out] of [["interleave", interleave], ["mutants", mutantsMissing]] as const) {
    expect(out.result.reason ?? "").toContain("target-missing")
    expect(out.result.reason ?? "").toContain(name)
    expect(out.result.reason).not.toBe("not-built")
    expect(out.evidence).toBeUndefined()
  }
  expect(ledger.runs.size).toBe(3)
  expect(ledger.attempts.get("p")).toBe(1)
  const repeat = yield* run(decode({ candidate: "p", option: "probe:property", target: {} }), ctx({ p: ["probe:property"], i: ["probe:interleave"], m: ["probe:mutants"] }, 5, ledger))
  expect(repeat.result.reason ?? "").toContain("refused: repeat")
  expect(ledger.runs.size).toBe(3)
  expect(ledger.attempts.get("p")).toBe(1)
  const capped = ReviewProbe.ledger()
  capped.attempts.set("p", 1)
  const cap = yield* run(decode({ candidate: "p", option: "probe:property", target: {} }), ctx({ p: ["probe:property"] }, 1, capped))
  expect(cap.result.reason ?? "").toContain("refused: attempt-cap")
  expect(capped.attempts.get("p")).toBe(1)
  expect(capped.runs.size).toBe(0)
  const refused = yield* run(decode({ candidate: "p", option: "probe:interleave", target: {} }), ctx({ p: ["probe:property"] }, 5))
  expect(refused.result.reason ?? "").toContain("option-not-offered")
  expect(refused.result.reason).not.toBe("not-built")
  const locked = yield* run(decode({
    candidate: "m", option: "probe:mutants", target: { mutants: { path: "src/lib.rs", startLine: 1, endLine: 1 } },
  }), ctx({ m: ["probe:mutants"] }, 1))
  expect(locked.result.status).toBe("not-run")
  expect(locked.result.reason ?? "").toMatch(/lock/i)
  expect(locked.result.reason).not.toBe("not-built")
  expect(locked.result.reason ?? "").not.toContain("target-missing")
  expect(locked.result.reason ?? "").not.toContain("regress")
  expect(locked.evidence).toBeUndefined()
  expect(existsSync(path.join(made.root, "Cargo.lock"))).toBe(false)
  expect(yield* Effect.promise(() => readFile(path.join(made.root, "src", "lib.rs"), "utf8"))).toBe(RUST)
}))

live("advanced cleanup completes before the shared public probe permit is released", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* repo()
  const copy = yield* copies(made.root)
  const ledger = ReviewProbe.ledger()
  const firstEvents: string[] = []
  const secondEvents: string[] = []
  const queued = Promise.withResolvers<void>()
  const entered = Promise.withResolvers<string>()
  const release = Promise.withResolvers<void>()
  const context: ReviewProbe.Context = {
    reviewID: "ordered-cleanup", head: copy.head, base: copy.base,
    offered: { i: ["probe:interleave"], p: ["probe:property"] }, cap: 2, hunks: [], ledger,
    timeoutSeconds: 30, queueSeconds: 10,
  }
  const first = yield* ReviewProbe.run(decode({ candidate: "i", option: "probe:interleave", target: {
    interleave: { language: "js", schedule: ["left", "right"], source: 'async function scenario(root, gate) { await gate("right"); await gate("left"); return true }' },
  } }), context).pipe(Effect.provideService(ReviewProbe.ObservePermit, (event) => { firstEvents.push(event) }), Effect.provideService(ReviewProbeRuntime.Cleanup, async (directory) => {
    entered.resolve(directory)
    await release.promise
    await rm(directory, { recursive: true, force: true })
  }), Effect.forkScoped)
  yield* waitChild(copy.head.scratch)
  const interrupt = yield* Fiber.interrupt(first).pipe(Effect.forkScoped)
  const directory = yield* Effect.promise(() => entered.promise).pipe(Effect.timeout("10 seconds"))
  const source = `async function property() { const fs = await import("node:fs"); return !fs.existsSync(${JSON.stringify(directory)}) }`
  const second = yield* ReviewProbe.run(decode({ candidate: "p", option: "probe:property", target: {
    property: { language: "js", law: "first cleanup completed", source, seed: 1, cases: 1 },
  } }), context).pipe(Effect.provideService(ReviewProbe.ObservePermit, (event) => {
    secondEvents.push(event)
    if (event === "waiting") queued.resolve()
  }), Effect.forkScoped)
  yield* Effect.gen(function* () {
    yield* Effect.promise(() => queued.promise).pipe(Effect.timeout("10 seconds"))
    yield* Effect.yieldNow
    expect(firstEvents).toEqual(["waiting", "acquired"])
    expect(secondEvents).toEqual(["waiting"])
    expect(existsSync(directory)).toBe(true)
  }).pipe(Effect.ensuring(Effect.sync(() => release.resolve())))
  yield* Fiber.join(interrupt)
  const completed = yield* Fiber.join(second)
  expect(completed.result.status).toBe("pass")
  expect(firstEvents).toEqual(["waiting", "acquired", "released"])
  expect(secondEvents).toEqual(["waiting", "acquired", "released"])
  expect(existsSync(directory)).toBe(false)
}), 120_000)

const waitChild = (scratch: string, left = 100): Effect.Effect<void, Error> => Effect.gen(function* () {
  if ((yield* Effect.promise(() => readdir(scratch))).some((name) => name.startsWith("probe-"))) return
  if (left === 0) return yield* Effect.fail(new Error("advanced child did not start"))
  yield* Effect.sleep("50 millis")
  yield* waitChild(scratch, left - 1)
})
