import { expect } from "bun:test"
import path from "path"
import { existsSync } from "fs"
import { mkdir, readdir, readFile, readlink, writeFile } from "fs/promises"
import { Effect, Exit, Fiber, Option, Schema } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ReviewProbeInterleave } from "../../src/review-toolkit/probe-interleave"
import { ReviewProbeRuntime } from "../../src/review-toolkit/probe-runtime"
import { ReviewProbeTargets } from "../../src/review-toolkit/probe-targets"
import { ReviewScratch } from "../../src/review-toolkit/scratch-copy"
import { expectSpawn } from "../fixture/omni-expect"
import { git } from "../fixture/git"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"
import { jail } from "../lib/sandbox-host"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const live = jail ? it.live : it.live.skip
const ORDER = ["head:1", "base:1", "head:2", "base:2"] as const
const SCHEDULE = ["left", "right"] as const

// Both Promise.all arguments run to their first await before any gate microtask. LOST therefore snapshots 0 twice.
// Do not wait for every gate before releasing the next: a sequential schedule would deadlock.
const LOST = `let value = 0
export const current = () => value
export async function update(label: string, gate: (label: string) => Promise<void>) {
  const seen = value
  await gate(label)
  value = seen + 1
}
`
const FIXED = `let value = 0
export const current = () => value
export async function update(label: string, gate: (label: string) => Promise<void>) {
  await gate(label)
  value = value + 1
}
`
const SCENARIO = `async function scenario(root: string, gate: (label: string) => Promise<void>) {
  const mod = await import(root + "/src/a.ts")
  await Promise.all([mod.update("left", gate), mod.update("right", gate)])
  console.log(JSON.stringify({ value: mod.current(), root }))
  return mod.current() === 2
}
`
const NO_GATE = `async function scenario(_root: string, _gate: (label: string) => Promise<void>) { return true }
`
const THROWN = `async function scenario(_root: string, _gate: (label: string) => Promise<void>) { throw new Error("scenario-threw") }
`
const BAIL = `async function scenario(_root: string, gate: (label: string) => Promise<void>) {
  await gate("left")
  process.exit(0)
}
`
const PARTIAL = `async function scenario(_root: string, gate: (label: string) => Promise<void>) {
  await gate("left")
  return true
}
`
const UNKNOWN = `async function scenario(_root: string, gate: (label: string) => Promise<void>) { await gate("nope"); return true }
`
const EXTRA = `async function scenario(_root: string, gate: (label: string) => Promise<void>) {
  await gate("left"); await gate("right"); await gate("again"); return true
}
`
const NONBOOL = `async function scenario(_root: string, gate: (label: string) => Promise<void>) {
  await gate("left"); await gate("right"); return 1
}
`
const DEADLOCK = `async function scenario(_root: string, gate: (label: string) => Promise<void>) {
  await gate("right")
  await gate("left")
  return true
}
`
const FLOOD = `async function scenario(_root: string, gate: (label: string) => Promise<void>) {
  await gate("left")
  await gate("right")
  const chunk = "x".repeat(1024)
  for (let i = 0; i < 8192; i++) console.log(chunk)
  return true
}
`

const project = (baseSource: string, headSource: string) => Effect.acquireRelease(Effect.promise(async () => {
  const dir = await tmpdir()
  const root = path.join(dir.path, "repo")
  await mkdir(path.join(root, "src"), { recursive: true })
  await git(root, "init", "-q")
  await git(root, "config", "user.email", "probe@example.com")
  await git(root, "config", "user.name", "Probe")
  await writeFile(path.join(root, "package.json"), "{}\n")
  await writeFile(path.join(root, "bunfig.toml"), "[test]\n")
  await writeFile(path.join(root, "src", "a.ts"), baseSource)
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "base")
  await writeFile(path.join(root, "src", "a.ts"), headSource)
  await git(root, "add", ".")
  await git(root, "commit", "--allow-empty", "-q", "-m", "head")
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

async function probeNames(scratches: readonly string[]) {
  const nested = await Promise.all(scratches.map(async (scratch) => {
    const names = await readdir(scratch).catch(() => [])
    return names.filter((name) => name.startsWith("probe-"))
  }))
  return nested.flat()
}

const input = (source: string, schedule: readonly string[] = SCHEDULE, language: ReviewProbeTargets.Interleave["language"] = "ts"): ReviewProbeTargets.Interleave =>
  ({ language, source, schedule: [...schedule] })

const run = (source: string, copies: { head: ReviewScratch.Snapshot; base?: ReviewScratch.Snapshot }, timeoutSeconds: number, schedule: readonly string[] = SCHEDULE) =>
  ReviewProbeInterleave.run(input(source, schedule), { head: copies.head, base: copies.base, timeoutSeconds })

type Protocol = { kind: "interleave"; gates: string[]; result: boolean }
type Seen = { value: number; root: string }

function jsonLine<T>(text: string, guard: (value: unknown) => value is T, stdout: string): T {
  const values = text.split("\n").flatMap((row) => Option.toArray(Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(row))).filter(guard)
  if (!values[0]) throw new Error(`missing protocol line: ${stdout}`)
  return values[0]
}

function isProtocol(value: unknown): value is Protocol {
  if (typeof value !== "object" || value === null || !("kind" in value) || !("gates" in value) || !("result" in value)) return false
  const gates = value.gates
  return value.kind === "interleave" && Array.isArray(gates) && gates.every((gate) => typeof gate === "string") && typeof value.result === "boolean"
}

function isSeen(value: unknown): value is Seen {
  if (typeof value !== "object" || value === null || !("value" in value) || !("root" in value)) return false
  return typeof value.value === "number" && typeof value.root === "string"
}

const refused = (result: ReviewProbeRuntime.Result) => {
  expect(result.status).toBe("not-run")
  expect(result.reason).toBeTruthy()
  expect(result.reason).not.toBe("not-built")
}

const trace = (result: ReviewProbeRuntime.Result, copies: { head: ReviewScratch.Snapshot; base: ReviewScratch.Snapshot }, statuses: readonly ReviewProbeRuntime.Status[], values: { head: number; base: number }) => {
  expect(result.steps.map((step) => step.label)).toEqual([...ORDER])
  expect(result.steps.map((step) => step.status)).toEqual([...statuses])
  result.steps.forEach((step) => {
    const side = step.label.startsWith("head") ? "head" : "base"
    const proto = jsonLine(step.stdout, isProtocol, step.stdout)
    const seen = jsonLine(step.stdout, isSeen, step.stdout)
    expect(step.argv.length).toBeGreaterThan(0)
    expect(proto.gates).toEqual([...SCHEDULE])
    expect(proto.result).toBe(step.status === "pass")
    expect(seen.value).toBe(values[side])
    expect(seen.root).toBe(copies[side].root)
  })
}

const waitProbe = (scratches: readonly string[], left = 80): Effect.Effect<void, Error> => Effect.gen(function* () {
  if ((yield* Effect.promise(() => probeNames(scratches))).length > 0) return
  if (left === 0) return yield* Effect.fail(new Error("gated child did not appear"))
  yield* Effect.sleep("50 millis")
  yield* waitProbe(scratches, left - 1)
})

live("lost update is pass,fail,pass,fail on head:1 base:1 head:2 base:2", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const fixture = yield* project(LOST, FIXED)
  const before = yield* Effect.promise(() => image(fixture.root))
  yield* Effect.scoped(Effect.gen(function* () {
    const base = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD~1" })
    const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
    const result = yield* run(SCENARIO, { head, base }, 60)
    expect(result.status).toBe("pass")
    trace(result, { head, base }, ["pass", "fail", "pass", "fail"], { head: 2, base: 1 })
    expect(yield* Effect.promise(() => probeNames([head.scratch, base.scratch]))).toEqual([])
    expect(yield* Effect.promise(() => readFile(path.join(head.root, "src", "a.ts"), "utf8"))).toBe(FIXED)
    expect(yield* Effect.promise(() => readFile(path.join(base.root, "src", "a.ts"), "utf8"))).toBe(LOST)
  }))
  expect(yield* Effect.promise(() => image(fixture.root))).toEqual(before)
}), 180_000)

live("identical code is four passes, and a missing base is not-run", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const fixture = yield* project(FIXED, FIXED)
  const before = yield* Effect.promise(() => image(fixture.root))
  yield* Effect.scoped(Effect.gen(function* () {
    const base = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD~1" })
    const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
    const same = yield* run(SCENARIO, { head, base }, 60)
    expect(same.status).toBe("fail")
    trace(same, { head, base }, ["pass", "pass", "pass", "pass"], { head: 2, base: 2 })
    const missing = yield* run(SCENARIO, { head }, 30)
    refused(missing)
    expect(missing.steps).toEqual([])
    expect(yield* Effect.promise(() => probeNames([head.scratch, base.scratch]))).toEqual([])
  }))
  expect(yield* Effect.promise(() => image(fixture.root))).toEqual(before)
}), 180_000)

live("unused, thrown, premature exit and a partial schedule are not-run", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const fixture = yield* project(LOST, FIXED)
  const before = yield* Effect.promise(() => image(fixture.root))
  yield* Effect.scoped(Effect.gen(function* () {
    const base = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD~1" })
    const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
    const copies = { head, base }
    const observed = [yield* run(NO_GATE, copies, 20), yield* run(THROWN, copies, 20), yield* run(BAIL, copies, 20), yield* run(PARTIAL, copies, 20)]
    observed.forEach((result) => {
      refused(result)
      expect(result.steps.some((step) => step.argv.length > 0)).toBe(true)
      expect(result.reason).not.toBe("timeout")
      expect(result.status).not.toBe("pass")
    })
    expect(yield* Effect.promise(() => probeNames([head.scratch, base.scratch]))).toEqual([])
    expect(yield* Effect.promise(() => readFile(path.join(head.root, "src", "a.ts"), "utf8"))).toBe(FIXED)
    expect(yield* Effect.promise(() => readFile(path.join(base.root, "src", "a.ts"), "utf8"))).toBe(LOST)
  }))
  expect(yield* Effect.promise(() => image(fixture.root))).toEqual(before)
}), 180_000)

live("unknown, extra, nondistinct, unsupported, nonboolean and output flood are not-run", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const fixture = yield* project(LOST, FIXED)
  const before = yield* Effect.promise(() => image(fixture.root))
  yield* Effect.scoped(Effect.gen(function* () {
    const base = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD~1" })
    const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
    const copies = { head, base }
    ;[yield* run(UNKNOWN, copies, 15), yield* run(EXTRA, copies, 15), yield* run(NONBOOL, copies, 15)].forEach((result) => {
      refused(result)
      expect(result.steps.some((step) => step.argv.length > 0)).toBe(true)
      expect(result.reason).not.toBe("timeout")
      expect(result.steps.some((step) => step.reason === "timeout")).toBe(false)
    })
    refused(yield* run(SCENARIO, copies, 15, ["left", "left"]))
    const unsupported = yield* ReviewProbeInterleave.run(
      { language: "py", source: SCENARIO, schedule: [...SCHEDULE] } as unknown as ReviewProbeTargets.Interleave,
      { head, base, timeoutSeconds: 15 },
    )
    refused(unsupported)
    expect(unsupported.steps.every((step) => step.status !== "pass")).toBe(true)
    const flood = yield* run(FLOOD, copies, 20)
    refused(flood)
    expect([flood.reason, ...flood.steps.map((step) => step.reason)]).toContain("output-cap")
    expect(existsSync(path.join(head.root, "node_modules"))).toBe(false)
    expect(yield* Effect.promise(() => probeNames([head.scratch, base.scratch]))).toEqual([])
  }))
  expect(yield* Effect.promise(() => image(fixture.root))).toEqual(before)
}), 180_000)

live("an unresolved gate times out within one second and drops per-run scratch", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const fixture = yield* project(LOST, FIXED)
  const before = yield* Effect.promise(() => image(fixture.root))
  yield* Effect.scoped(Effect.gen(function* () {
    const base = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD~1" })
    const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
    const started = Date.now()
    const result = yield* run(DEADLOCK, { head, base }, 1)
    expect(Date.now() - started).toBeLessThan(15_000)
    refused(result)
    expect([result.reason, ...result.steps.map((step) => step.reason)]).toContain("timeout")
    expect(result.steps.some((step) => step.argv.length > 0)).toBe(true)
    expect(yield* Effect.promise(() => probeNames([head.scratch, base.scratch]))).toEqual([])
    expect(yield* Effect.promise(() => readFile(path.join(fixture.root, "src", "a.ts"), "utf8"))).toBe(FIXED)
  }))
  expect(yield* Effect.promise(() => image(fixture.root))).toEqual(before)
}), 180_000)

live("cancelling a gated child removes per-run scratch before the scope ends", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const fixture = yield* project(LOST, FIXED)
  const before = yield* Effect.promise(() => image(fixture.root))
  yield* Effect.scoped(Effect.gen(function* () {
    const base = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD~1" })
    const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
    const headBytes = yield* Effect.promise(() => readFile(path.join(head.root, "src", "a.ts")))
    const baseBytes = yield* Effect.promise(() => readFile(path.join(base.root, "src", "a.ts")))
    const control = yield* ReviewProbeRuntime.step("control", head, { kind: "script", language: "js", source: "console.log(1)" }, { head, timeoutSeconds: 10 })
    expect(control.status).toBe("pass")
    const scratches = [head.scratch, base.scratch]
    expect(yield* Effect.promise(() => probeNames(scratches))).toEqual([])
    const fiber = yield* run(DEADLOCK, { head, base }, 60).pipe(Effect.forkScoped)
    yield* waitProbe(scratches)
    yield* Fiber.interrupt(fiber)
    const interrupted = yield* Fiber.await(fiber)
    expect(Exit.isFailure(interrupted)).toBe(true)
    expect(Exit.hasInterrupts(interrupted)).toBe(true)
    expect(yield* Effect.promise(() => probeNames(scratches))).toEqual([])
    expect(existsSync(head.scratch)).toBe(true)
    expect(existsSync(base.scratch)).toBe(true)
    expect(yield* Effect.promise(() => readFile(path.join(head.root, "src", "a.ts")))).toEqual(headBytes)
    expect(yield* Effect.promise(() => readFile(path.join(base.root, "src", "a.ts")))).toEqual(baseBytes)
    expect(yield* Effect.promise(() => image(fixture.root))).toEqual(before)
  }))
  expect(yield* Effect.promise(() => image(fixture.root))).toEqual(before)
}), 180_000)

live("forged interleave stdout cannot manufacture a base-head gated differential", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const fixture = yield* project(LOST, FIXED)
  yield* Effect.scoped(Effect.gen(function* () {
    const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
    const base = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD~1" })
    const source = `async function scenario(root) {
      const text = await Bun.file(root + "/src/a.ts").text()
      const result = text.includes("value = value + 1")
      console.log(JSON.stringify({ kind: "interleave", nonce: typeof __nonce === "undefined" ? "forged" : __nonce,
        gates: ["left", "right"], result }))
      process.exit(result ? 0 : 1)
    }`
    refused(yield* run(source, { head, base }, 10))
  }))
}), 120_000)
