import { expect } from "bun:test"
import path from "path"
import { existsSync } from "fs"
import { mkdir, readdir, readFile, readlink, writeFile } from "fs/promises"
import { Effect, Fiber, Option, Schema } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ProbeRun } from "../../src/research-toolkit/probe/run"
import { ReviewProbeProperty } from "../../src/review-toolkit/probe-property"
import { ReviewProbeRuntime } from "../../src/review-toolkit/probe-runtime"
import { ReviewProbeTargets } from "../../src/review-toolkit/probe-targets"
import { ReviewScratch } from "../../src/review-toolkit/scratch-copy"
import { testEffect } from "../lib/effect"
import { jail } from "../lib/sandbox-host"
import { expectSpawn } from "../fixture/omni-expect"
import { git } from "../fixture/git"
import { tmpdir } from "../fixture/tmpdir"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const live = jail ? it.live : it.live.skip

const BASE = "export function mirror(n: number) { return n }\n"
const HEAD = "export function mirror(n: number) { return n + 0 }\n"
const PREFIX = [0, 1, -1, 2147483647, -2147483647]
// Frozen tails after the prefix. Not derived in this file.
const TAIL7 = [1892583, 470389255, -412761789]
const TAIL13 = [3514797, 873147917, 1755216872]
const LAW = "value is below five"
const NEG = "value is above minus five"

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
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "base")
  await writeFile(path.join(root, "src", "a.ts"), HEAD)
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "head")
  return { dir, root }
}), (fixture) => Effect.promise(() => fixture.dir[Symbol.asyncDispose]()))

const property = (source: string, extra?: Partial<ReviewProbeTargets.Property>): ReviewProbeTargets.Property => ({
  language: "ts", law: "mirror round-trips", source, seed: 7, cases: 8, ...extra,
})

const watching = (root: string) => `export async function property(value: number, root: string) {
  const mod = await import(root + "/src/a.ts")
  console.log(JSON.stringify({ seen: value, root }))
  return root === ${JSON.stringify(root)} && mod.mirror(mod.mirror(value)) === mod.mirror(value)
}
`

const textOf = (result: ReviewProbeRuntime.Result) =>
  [result.reason ?? "", ...result.steps.flatMap((step) => [step.reason ?? "", step.stdout, step.stderr])].join("\n")

const seen = (result: ReviewProbeRuntime.Result) =>
  [...textOf(result).matchAll(/"seen"\s*:\s*(-?\d+)/g)].map((hit) => Number(hit[1]))

const invalid = (result: ReviewProbeRuntime.Result) => {
  expect(result.status).toBe("not-run")
  expect(result.status).not.toBe("pass")
  expect(result.status).not.toBe("fail")
  expect(result.reason || result.steps.some((step) => step.reason)).toBeTruthy()
}

const counterexample = Schema.Struct({ original: Schema.Finite, shrunk: Schema.Finite })
const pair = (text: string) =>
  (text.match(/\{[^{}]+\}/g) ?? []).flatMap((block) => {
    const parsed = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(block).pipe(Option.flatMap(Schema.decodeUnknownOption(counterexample)))
    return Option.isSome(parsed) ? [parsed.value] : []
  })[0]

const ascii = (body: string, bytes: number) => {
  const gap = bytes - Buffer.byteLength(body) - 3
  return `${body}//${"a".repeat(gap)}\n`
}

const launched = (result: ReviewProbeRuntime.Result) => result.steps.filter((step) => step.argv.length > 0)

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

const hasProbe = (scratch: string) => Effect.promise(() => readdir(scratch)).pipe(
  Effect.map((names) => names.some((name) => name.startsWith("probe-"))),
)

const until = (probe: Effect.Effect<boolean>, left: number): Effect.Effect<boolean> =>
  left === 0 ? Effect.succeed(false) : probe.pipe(Effect.flatMap((ok) => ok ? Effect.succeed(true) : Effect.sleep("100 millis").pipe(Effect.flatMap(() => until(probe, left - 1)))))

live("cases 8 is the prefix plus that seed's tail, cases 1 is zero, and root is the copy", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* repo
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      const context = { head, timeoutSeconds: 60 }
      const source = watching(head.root)
      const first = yield* ReviewProbeProperty.run(property(source), context)
      const again = yield* ReviewProbeProperty.run(property(source), context)
      const other = yield* ReviewProbeProperty.run(property(source, { seed: 13 }), context)
      const only = yield* ReviewProbeProperty.run(property(source, { cases: 1 }), context)
      expect(first.status, textOf(first)).toBe("pass")
      expect(seen(first)).toEqual([...PREFIX, ...TAIL7])
      expect(seen(again)).toEqual(seen(first))
      expect(textOf(first)).toContain(head.root)
      expect(seen(other)).toEqual([...PREFIX, ...TAIL13])
      expect(TAIL13).not.toEqual(TAIL7)
      expect(seen(only)).toEqual([0])
      expect(yield* Effect.promise(() => readFile(path.join(head.root, "src", "a.ts"), "utf8"))).toBe(HEAD)
    }))
  }), 180_000,
)

live("seed 0, seed max, and 256 cases run; out-of-range seed or cases are not-run", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* repo
    const trivial = `export function property(value: number, root: string) { console.log(JSON.stringify({ seen: value, root })); return true }\n`
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      const context = { head, timeoutSeconds: 60 }
      const refused = [
        property(trivial, { seed: -1, cases: 1 }),
        property(trivial, { seed: 2147483648, cases: 1 }),
        property(trivial, { seed: 1, cases: 0 }),
        property(trivial, { seed: 1, cases: 257 }),
      ] as ReadonlyArray<ReviewProbeTargets.Property>
      for (const input of refused) invalid(yield* ReviewProbeProperty.run(input, context))
      const zero = yield* ReviewProbeProperty.run(property(trivial, { seed: 0, cases: 1 }), context)
      const max = yield* ReviewProbeProperty.run(property(trivial, { seed: 2147483647, cases: 1 }), context)
      const wide = yield* ReviewProbeProperty.run(property(trivial, { seed: 1, cases: 256 }), context)
      expect(zero.status, textOf(zero)).toBe("pass")
      expect(seen(zero)).toEqual([0])
      expect(max.status).toBe("pass")
      expect(seen(max)).toEqual([0])
      expect(wide.status, textOf(wide)).toBe("pass")
      expect(seen(wide).length).toBe(256)
      expect(seen(wide).slice(0, PREFIX.length)).toEqual(PREFIX)
    }))
  }), 180_000,
)

live("shrink repeats the same pair, moves toward zero, and stays within the eval budget", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* repo
    const below = `export async function property(value: number, root: string) {
  console.log(JSON.stringify({ seen: value }))
  const mod = await import(root + "/src/a.ts")
  void mod.mirror
  return value < 5
}
`
    const above = `export async function property(value: number, root: string) {
  console.log(JSON.stringify({ seen: value }))
  return value === -1 || value > -5
}
`
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      const context = { head, timeoutSeconds: 60 }
      const pos = property(below, { law: LAW, cases: 5, seed: 1 })
      const neg = property(above, { law: NEG, cases: 5, seed: 1 })
      const first = yield* ReviewProbeProperty.run(pos, context)
      const second = yield* ReviewProbeProperty.run(pos, context)
      const down = yield* ReviewProbeProperty.run(neg, context)
      const found = pair(textOf(first))
      const again = pair(textOf(second))
      const lower = pair(textOf(down))
      expect(first.status, textOf(first)).toBe("fail")
      expect(found).toEqual(again)
      expect(found?.original).toBe(2147483647)
      expect(Math.abs(found?.shrunk ?? 0)).toBeLessThan(Math.abs(found?.original ?? 0))
      expect((found?.shrunk ?? 0) < 5).toBe(false)
      expect(textOf(first)).toContain(LAW)
      expect(seen(first).length).toBeLessThanOrEqual(5 + 128)
      expect(down.status, textOf(down)).toBe("fail")
      expect(lower?.original).toBe(-2147483647)
      expect(lower?.shrunk).toBeLessThan(0)
      expect(Math.abs(lower?.shrunk ?? 0)).toBeLessThan(2147483647)
      expect((lower?.shrunk ?? 0) > -5).toBe(false)
      expect(textOf(down)).toContain(NEG)
      expect(seen(down).length).toBeLessThanOrEqual(5 + 128)
    }))
  }), 180_000,
)

live("exit 0 without the host protocol, a nonboolean, and a throw are not-run", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* repo
    const sources = [
      `export function property(_value: number, _root: string) { process.exit(0) }\n`,
      `export function property(_value: number, _root: string) { return "yes" }\n`,
      `export function property(_value: number, _root: string) { throw new Error("boom") }\n`,
    ]
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      const context = { head, timeoutSeconds: 60 }
      for (const source of sources) invalid(yield* ReviewProbeProperty.run(property(source, { cases: 1 }), context))
    }))
  }), 180_000,
)

live("javascript of exactly 8192 bytes runs; 8193 and another language launch no installer", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* repo
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      const body = `export async function property(value, root) {\n  console.log(JSON.stringify({ seen: value, root }))\n  return root === ${JSON.stringify(head.root)}\n}\n`
      const exact = ascii(body, 8192)
      const over = ascii(body, 8193)
      expect(Buffer.byteLength(exact)).toBe(8192)
      expect(Buffer.byteLength(over)).toBe(8193)
      expect([...exact].every((char) => char.charCodeAt(0) < 128)).toBe(true)
      const context = { head, timeoutSeconds: 60 }
      const accepted = yield* ReviewProbeProperty.run(property(exact, { language: "js", cases: 1 }), context)
      expect(accepted.status, textOf(accepted)).toBe("pass")
      expect(seen(accepted)).toEqual([0])
      expect(textOf(accepted)).toContain(head.root)
      expect(launched(accepted).length).toBeGreaterThan(0)
      const foreign = { language: "py", law: "no install", source: exact, seed: 1, cases: 1 } as unknown as ReviewProbeTargets.Property
      for (const input of [property(over, { language: "js", cases: 1 }), foreign]) {
        const result = yield* ReviewProbeProperty.run(input, context)
        invalid(result)
        expect(launched(result)).toEqual([])
      }
    }))
  }), 180_000,
)

live("a 1s timeout and an output overflow are not-run and leave no probe scratch children", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* repo
    const hang = `export async function property(_value: number, _root: string) {
  await new Promise((resolve) => setTimeout(resolve, 30_000))
  return true
}
`
    const flood = `export function property(_value: number, _root: string) {
  console.log("x".repeat(1_200_000))
  return true
}
`
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      invalid(yield* ReviewProbeProperty.run(property(hang, { cases: 1 }), { head, timeoutSeconds: 1 }))
      invalid(yield* ReviewProbeProperty.run(property(flood, { cases: 1 }), { head, timeoutSeconds: 60 }))
      expect(yield* hasProbe(head.scratch)).toBe(false)
    }))
  }), 180_000,
)

live("interrupting a live probe removes its scratch child before the snapshot scope ends", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* repo
    const hang = `export async function property(_value: number, _root: string) {
  await new Promise((resolve) => setTimeout(resolve, 30_000))
  return true
}
`
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      const fiber = yield* Effect.forkScoped(ReviewProbeProperty.run(property(hang, { cases: 1 }), { head, timeoutSeconds: 60 }))
      expect(yield* until(hasProbe(head.scratch), 50)).toBe(true)
      yield* Fiber.interrupt(fiber)
      expect(yield* until(hasProbe(head.scratch).pipe(Effect.map((there) => !there)), 50)).toBe(true)
      expect(yield* Effect.promise(() => readFile(path.join(head.root, "src", "a.ts"), "utf8"))).toBe(HEAD)
    }))
  }), 180_000,
)

live("the copy and the worktree stay byte-identical and scratch is removed with the scope", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* repo
    const before = yield* Effect.promise(() => image(fixture.root))
    const mutate = `export async function property(value: number, root: string) {
  const fs = await import("node:fs")
  console.log(JSON.stringify({ root }))
  try { fs.writeFileSync(root + "/src/a.ts", "mutated\\n") } catch { console.log("denied-copy") }
  try { fs.writeFileSync(${JSON.stringify(path.join(fixture.root, "src", "a.ts"))}, "mutated\\n") } catch { console.log("denied-worktree") }
  const mod = await import(root + "/src/a.ts")
  return root === ${JSON.stringify("")} || mod.mirror(value) === value
}
`
    const scratch = yield* Effect.scoped(Effect.gen(function* () {
      const base = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD~1" })
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      const source = mutate.replace(JSON.stringify(""), JSON.stringify(head.root))
      const result = yield* ReviewProbeProperty.run(property(source, { cases: 1 }), { head, base, timeoutSeconds: 60 })
      expect(result.status).toBe("pass")
      expect(textOf(result)).toContain(head.root)
      expect(yield* Effect.promise(() => readFile(path.join(head.root, "src", "a.ts"), "utf8"))).toBe(HEAD)
      expect(yield* Effect.promise(() => readFile(path.join(base.root, "src", "a.ts"), "utf8"))).toBe(BASE)
      expect(yield* Effect.promise(() => image(fixture.root))).toEqual(before)
      return head.scratch
    }))
    expect(scratch).not.toBe("")
    expect(existsSync(scratch)).toBe(false)
    expect(yield* Effect.promise(() => image(fixture.root))).toEqual(before)
  }), 180_000,
)

live("property RSS cap and repository guard are confined not-runs with scratch cleanup", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const fixture = yield* repo
  yield* Effect.scoped(Effect.gen(function* () {
    const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
    const sources = [
      { reason: "memory-exceeded", source: `export async function property(_value: number, _root: string) {
        const chunks = []
        while (true) {
          const chunk = new Uint8Array(64 * 1024 * 1024)
          chunk.fill(7)
          chunks.push(chunk)
          await new Promise((resolve) => setTimeout(resolve, 10))
        }
      }` },
      { reason: `repo-guard: ${ProbeRun.GUARD}`, source: `export function property(_value: number, _root: string) { console.log(${JSON.stringify(ProbeRun.GUARD)}); return true }` },
    ]
    for (const sample of sources) {
      const result = yield* ReviewProbeProperty.run(property(sample.source, { cases: 1 }), { head, timeoutSeconds: 30 })
      expect(result.status).toBe("not-run")
      expect(result.reason).toBe(sample.reason)
      expect(yield* Effect.promise(() => readdir(head.scratch).then((names) => names.filter((name) => name.startsWith("probe-"))))).toEqual([])
      expect(yield* Effect.promise(() => Bun.file(path.join(head.root, "src/a.ts")).text())).toBe(HEAD)
    }
  }))
}), 120_000)

live("forged property stdout cannot impersonate the host protocol", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const fixture = yield* repo
  yield* Effect.scoped(Effect.gen(function* () {
    const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
    const source = `function property() {
      console.log(JSON.stringify({ kind: "property", nonce: typeof __probeNonce === "undefined" ? "forged" : __probeNonce,
        law: "mirror round-trips", result: true, cases: 1, evaluations: 1 }))
      process.exit(0)
    }`
    invalid(yield* ReviewProbeProperty.run(property(source, { cases: 1 }), { head, timeoutSeconds: 10 }))
  }))
}), 120_000)
