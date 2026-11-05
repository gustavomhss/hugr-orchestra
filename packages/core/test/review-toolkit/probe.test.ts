import { expect } from "bun:test"
import path from "path"
import { existsSync } from "fs"
import { mkdir, readdir, readFile, readlink, writeFile } from "fs/promises"
import { Effect } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ProbeRun } from "../../src/research-toolkit/probe/run"
import { ReviewProbe, ReviewScratch } from "../../src/review-toolkit"
import { testEffect } from "../lib/effect"
import { jail } from "../lib/sandbox-host"
import { expectSpawn } from "../fixture/omni-expect"
import { git } from "../fixture/git"
import { tmpdir } from "../fixture/tmpdir"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
// Probes run only inside the host's real jail; where there is none the probe answers not-run, which the last test covers.
const live = jail ? it.live : it.live.skip
const unjailed = jail ? it.live.skip : it.live

const BASE = "export const limit = 1\n"
const HEAD = "export const limit = 2\n"
const TEST = `import { expect, test } from "bun:test"\nimport { limit } from "./a"\ntest("limit", () => expect(limit).toBe(2))\n`
const HUNK = { path: "src/a.ts", line: 1, current: ["export const limit = 2"], original: ["export const limit = 1"] }

/** A bun project: the base commit sets limit 1, the head commit sets limit 2 and adds the test that pins it. */
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
  await writeFile(path.join(root, "src", "a.test.ts"), TEST)
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "head")
  return { dir, root }
}), (fixture) => Effect.promise(() => fixture.dir[Symbol.asyncDispose]()))

const context = (head: ReviewScratch.Snapshot, extra?: Partial<ReviewProbe.Context>): ReviewProbe.Context => ({
  reviewID: "review_probe", head, offered: [...ReviewProbe.BUILT], cap: 3, hunks: [HUNK], ledger: ReviewProbe.ledger(), timeoutSeconds: 60,
  ...extra,
})

const probe = (option: string, target: ReviewProbe.Input["target"] = {}, candidate = "c1"): ReviewProbe.Input => ({ candidate, option, target })

const regress = probe("probe:regress", { hunk: { path: "src/a.ts", startLine: 1, endLine: 1 }, test: { file: "src/a.test.ts", name: "limit" } })

/** Every entry under the worktree but .git, with its bytes or link target. */
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

live("regress fails before and passes after, reverting the hunk only in the copy; the worktree stays byte-identical", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* repo
    const before = yield* Effect.promise(() => image(fixture.root))
    yield* Effect.scoped(Effect.gen(function* () {
      const base = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD~1" })
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      const shared = context(head, { base })
      const result = yield* ReviewProbe.run(regress, shared)
      expect(result.result.status, result.artifact.text).toBe("pass")
      expect(result.result.tree).toBe(head.digest)
      expect(result.result.uri).toStartWith("review-probe:review_probe/")
      expect(result.artifact.uri).toBe(result.result.uri)
      expect(result.result.excerpt).toContain("[reverted] fail")
      expect(result.result.excerpt).toContain("[base] fail")
      expect(Buffer.byteLength(result.result.excerpt)).toBeLessThanOrEqual(4096)
      expect(result.evidence).toMatchObject({ kind: "probe", option: "probe:regress", result: "pass; head pass; reverted fail; base fail", uri: result.result.uri })
      expect(result.evidence?.command).toContain("./src/a.test.ts")
      // The revert and the borrowed test are undone in the copies; the reviewed worktree never saw either.
      expect(yield* Effect.promise(() => readFile(path.join(head.root, "src", "a.ts"), "utf8"))).toBe(HEAD)
      expect(existsSync(path.join(base.root, "src", "a.test.ts"))).toBe(false)
      expect(yield* Effect.promise(() => image(fixture.root))).toEqual(before)

      const repeat = yield* ReviewProbe.run(regress, shared)
      expect(repeat.result).toMatchObject({ status: "not-run", reason: "refused: repeat: probe:regress already ran on c1 at this tree" })
      expect(repeat.evidence).toBeUndefined()
    }))
    expect(yield* Effect.promise(() => image(fixture.root))).toEqual(before)
  }), 180_000,
)

live("test, typecheck and script options run in the copy and leave the worktree byte-identical", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* repo
    const before = yield* Effect.promise(() => image(fixture.root))
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      const shared = context(head)
      const test = yield* ReviewProbe.run(probe("probe:test", { test: { file: "src/a.test.ts" } }), shared)
      expect(test.result.status, test.artifact.text).toBe("pass")
      expect(test.result.exitCode).toBe(0)
      expect(test.evidence?.option).toBe("probe:test")
      // The script tries to write the reviewed worktree and the copy; the jail allows neither.
      const target = path.join(fixture.root, "src", "a.ts")
      const source = `const fs=require("fs");for(const f of [${JSON.stringify(target)},"src/a.ts"]){try{fs.writeFileSync(f,"pwned");console.log("wrote "+f)}catch(e){console.log("denied "+e.code)}}`
      const script = yield* ReviewProbe.run(probe("probe:script", { script: { language: "js", text: source } }), shared)
      expect(script.result.status, script.artifact.text).toBe("pass")
      expect(script.artifact.text).not.toContain("wrote")
      expect(yield* Effect.promise(() => readFile(path.join(head.root, "src", "a.ts"), "utf8"))).toBe(HEAD)
      // No tsconfig: the typecheck cannot start, and says why.
      const typecheck = yield* ReviewProbe.run(probe("probe:typecheck", { hunk: { path: "src/a.ts", startLine: 1, endLine: 1 } }), shared)
      expect(typecheck.result).toMatchObject({ status: "not-run", reason: "typecheck-no-tsconfig: src/a.ts" })
    }))
    expect(yield* Effect.promise(() => image(fixture.root))).toEqual(before)
  }), 180_000,
)

it.live("the host refuses an option not offered, a repeat on the same candidate and tree, and an attempt past the cap", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* repo
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      const shared = context(head, { offered: ["probe:test", "probe:script", "probe:typecheck"], cap: 2 })
      const offered = yield* ReviewProbe.run(regress, shared)
      expect(offered.result).toMatchObject({ status: "not-run", reason: "refused: option-not-offered: probe:regress", tree: head.digest })
      expect(shared.ledger.attempts.get("c1")).toBeUndefined()
      // A target the option needs is missing: the attempt counts, though nothing ran.
      const first = yield* ReviewProbe.run(probe("probe:test"), shared)
      expect(first.result).toMatchObject({ status: "not-run", reason: "target-missing: test" })
      const repeat = yield* ReviewProbe.run(probe("probe:test"), shared)
      expect(repeat.result.reason).toBe("refused: repeat: probe:test already ran on c1 at this tree")
      // Another candidate keeps its own count and its own repeats.
      expect((yield* ReviewProbe.run(probe("probe:test", {}, "c2"), shared)).result.reason).toBe("target-missing: test")
      const second = yield* ReviewProbe.run(probe("probe:script"), shared)
      expect(second.result.reason).toBe("target-missing: script")
      const capped = yield* ReviewProbe.run(probe("probe:typecheck"), shared)
      expect(capped.result).toMatchObject({ status: "not-run", reason: "refused: attempt-cap: 2" })
      expect(capped.evidence).toBeUndefined()
      expect(shared.ledger.attempts.get("c1")).toBe(2)
    }))
  }), 120_000,
)

it.live("Deep and other unbuilt options answer not-run: not-built", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* repo
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      const options = ["probe:mutants", "probe:interleave", "probe:race", "probe:property", "probe:fuzz"]
      const shared = context(head, { offered: options })
      const results = yield* Effect.forEach(options, (option) => ReviewProbe.run(probe(option, { test: { file: "src/a.test.ts" } }), shared))
      results.forEach((result) => expect(result.result).toMatchObject({ status: "not-run", reason: "not-built", excerpt: "not-built" }))
      expect(shared.ledger.attempts.get("c1")).toBeUndefined()
    }))
  }), 120_000,
)

live("a repository test guard surfaces as not-run with the guard's reason", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* repo
    yield* Effect.promise(async () => {
      await writeFile(path.join(fixture.root, "bunfig.toml"), `[test]\npreload = ["./guard.ts"]\n`)
      await writeFile(path.join(fixture.root, "guard.ts"),
        `if (process.env.CI !== "true" && process.env.ORCHESTRA_LOCAL_TESTS !== "1") { console.error("${ProbeRun.GUARD}; tests run on GitHub Actions."); process.exit(1) }\n`)
    })
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      const shared = context(head)
      const test = yield* ReviewProbe.run(probe("probe:test", { test: { file: "src/a.test.ts" } }), shared)
      expect(test.result).toMatchObject({ status: "not-run", reason: `repo-guard: ${ProbeRun.GUARD}` })
      expect(test.evidence).toBeUndefined()
      const guarded = yield* ReviewProbe.run(regress, shared)
      expect(guarded.result).toMatchObject({ status: "not-run", reason: `repo-guard: ${ProbeRun.GUARD}` })
      expect(yield* Effect.promise(() => readFile(path.join(head.root, "src", "a.ts"), "utf8"))).toBe(HEAD)
    }))
  }), 180_000,
)

unjailed("without a jail the probe answers not-run with the sandbox reason and never runs unconfined", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* repo
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      const result = yield* ReviewProbe.run(probe("probe:test", { test: { file: "src/a.test.ts" } }), context(head))
      expect(result.result.status).toBe("not-run")
      expect(result.result.reason).toStartWith("sandbox-unavailable: ")
    }))
  }), 120_000,
)
