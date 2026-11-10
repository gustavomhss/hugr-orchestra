import { expect } from "bun:test"
import path from "path"
import { chmod, mkdir, readdir, readFile, readlink, rm, writeFile } from "fs/promises"
import { Effect } from "effect"
import { BackendToolkit } from "../../src/backend-toolkit"
import { BackendToolkitLauncher } from "../../src/backend-toolkit/launcher"
import { RUNTIMES } from "../../src/backend-toolkit/manifest"
import { BackendToolkitTarget } from "../../src/backend-toolkit/target"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ReviewAnalyze } from "../../src/review-toolkit/analyze"
import type { ReviewItem } from "../../src/review-toolkit/item"
import { ReviewPackAstGrep } from "../../src/review-toolkit/packs/ast-grep"
import { ReviewPackGitleaks } from "../../src/review-toolkit/packs/gitleaks"
import { ReviewPackRepo } from "../../src/review-toolkit/packs/repo"
import { withAstGrep } from "../fixture/lucy-astgrep/catalog"
import { provision } from "../fixture/lucy-astgrep/host"
import { testEffect } from "../lib/effect"
import { jail } from "../lib/sandbox-host"
import { expectSpawn } from "../fixture/omni-expect"
import { git } from "../fixture/git"
import { tmpdir } from "../fixture/tmpdir"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
// Analyzers run only inside the host's real jail; where there is none they are not-run, never unconfined.
const live = jail ? it.live : it.live.skip

const SCRIPTS = {
  lint: "echo written > written.txt",
  typecheck: "exit 3",
  test: "echo never",
}

/** Base and head commits declaring three gates, a dirty edit, and empty toolkit and artifact roots. */
const fixture = Effect.acquireRelease(Effect.promise(async () => {
  const dir = await tmpdir()
  const root = path.join(dir.path, "repo")
  await mkdir(path.join(root, "src"), { recursive: true })
  await git(root, "init", "-q")
  await git(root, "config", "user.email", "analyze@example.com")
  await git(root, "config", "user.name", "Analyze")
  await writeFile(path.join(root, "package.json"), JSON.stringify({ scripts: SCRIPTS }))
  await writeFile(path.join(root, "bun.lock"), "")
  await writeFile(path.join(root, "src", "a.ts"), "export const a = 1\n")
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "base")
  await git(root, "tag", "base")
  await writeFile(path.join(root, "src", "a.ts"), "export const a = 2\n")
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "head")
  await writeFile(path.join(root, "src", "a.ts"), "export const a = 3\n")
  await mkdir(path.join(dir.path, "toolkit"))
  await mkdir(path.join(dir.path, "store"))
  return { dir, root, base: "base", toolkit: path.join(dir.path, "toolkit"), store: path.join(dir.path, "store") }
}), (made) => Effect.promise(() => made.dir[Symbol.asyncDispose]()))

const input = (made: { root: string; base: string; store: string }, extra: Partial<ReviewAnalyze.RunInput>): ReviewAnalyze.RunInput => ({
  worktree: made.root, base: made.base, tier: "standard", store: made.store, changed: {}, trusted: true,
  lane: "repo", packs: [], scope: "diff", ...extra,
})

/** An installed gitleaks in `toolkit` that writes `report` wherever the template points it. */
async function installGitleaks(toolkit: string, report: string) {
  const host = BackendToolkitTarget.detect()
  if (!("target" in host)) throw new Error(host.unsupported)
  const manifest = ReviewPackGitleaks.manifest
  const directory = path.join(toolkit, "engines", manifest.id, `${manifest.version}-${host.target}`)
  await mkdir(directory, { recursive: true })
  const executable = BackendToolkitLauncher.executable(manifest, directory, host.target)
  await writeFile(executable, [
    "#!/bin/sh",
    `while [ "$#" -gt 0 ]; do if [ "$1" = "--report-path" ]; then printf '%s' '${report}' > "$2"; fi; shift; done`,
    "",
  ].join("\n"))
  await chmod(executable, 0o755)
  await writeFile(path.join(directory, ".complete"), "")
  await mkdir(path.join(toolkit, "bin"), { recursive: true })
  const shim = path.join(toolkit, "bin", manifest.id)
  await writeFile(shim, BackendToolkitLauncher.launchText(toolkit, manifest, RUNTIMES, directory, host.target))
  await chmod(shim, 0o755)
}

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

const item = (lens: string, line: number): ReviewItem.ToolItem => ({
  fingerprint: `${lens}-${line}`, class: `${lens}.kind`, lens, pack: "gitleaks", rule: "generic-api-key", ruleStatus: "probation",
  severity: "P1", path: "src/a.ts", line, snippetDigest: `digest-${line}`, sources: [{ pack: "gitleaks", rule: "generic-api-key" }],
  triage: "triage", onChangedLine: true,
})

it.live("a pinned tool that is not installed is not-run, and nothing is fetched", () =>
  Effect.gen(function* () {
    const made = yield* fixture
    const result = yield* ReviewAnalyze.run(input(made, { packs: ["gitleaks"] })).pipe(Effect.provideService(BackendToolkit.Root, made.toolkit))
    expect(result.checks).toEqual([
      { id: "gitleaks", pack: "gitleaks", version: ReviewPackGitleaks.manifest.version, lane: "no-build", status: "not-run", reason: "gitleaks absent", workspaceExecuted: false },
    ])
    expect(yield* Effect.promise(() => readdir(made.toolkit))).toEqual([])
  }),
)

it.live("a pack above the run's lane, an unknown pack and an untrusted target's gates are not-run", () =>
  Effect.gen(function* () {
    const made = yield* fixture
    const lane = yield* ReviewAnalyze.run(input(made, { lane: "no-build", packs: ["repo", "semgrep"] }))
    expect(lane.checks.map((entry) => [entry.id, entry.status, entry.reason])).toEqual([
      ["repo", "not-run", "lane: repo is above no-build"],
      ["semgrep", "not-run", "unknown pack"],
    ])
    const untrusted = yield* ReviewAnalyze.run(input(made, { trusted: false, packs: ["repo"] }))
    expect(untrusted.checks).toMatchObject([{ status: "not-run", reason: "untrusted target: repository code does not run (D6)", workspaceExecuted: true }])
  }),
)

live("a report that does not parse is acquisition-error, its raw output is kept, and the worktree is untouched", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* fixture
    yield* Effect.promise(() => installGitleaks(made.toolkit, "not a report"))
    const before = yield* Effect.promise(() => image(made.root))
    const result = yield* ReviewAnalyze.run(input(made, { packs: ["gitleaks"] })).pipe(Effect.provideService(BackendToolkit.Root, made.toolkit))
    expect(result.checks).toMatchObject([{ id: "gitleaks", status: "acquisition-error", reason: "malformed-json", workspaceExecuted: false }])
    const uri = result.checks[0].uri!
    expect(uri).toMatch(/^review:[0-9a-f-]{36}\/raw\/gitleaks-head\.sarif$/)
    const raw = path.join(made.store, uri.slice("review:".length))
    expect(yield* Effect.promise(() => readFile(raw, "utf8"))).toBe("not a report")
    expect(result.retained.total).toBe(0)
    expect(yield* Effect.promise(() => image(made.root))).toEqual(before)
  }), 120_000,
)

live("the base revision's gates run confined in the head copy; tests are not-run; the worktree is untouched", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* fixture
    const before = yield* Effect.promise(() => image(made.root))
    const result = yield* ReviewAnalyze.run(input(made, { packs: ["repo"] }))
    expect(result.checks.map((entry) => [entry.id, entry.status, entry.reason, entry.workspaceExecuted, entry.version])).toEqual([
      ["repo:bun run lint", "pass", undefined, true, made.base],
      ["repo:bun run typecheck", "fail", "exit 3", true, made.base],
      ["repo:bun run test", "not-run", ReviewPackRepo.TESTS, true, made.base],
    ])
    expect(yield* Effect.promise(() => image(made.root))).toEqual(before)
  }), 120_000,
)

it.live("page returns only the caller's lens of the retained artifact, filtered and in pages", () =>
  Effect.gen(function* () {
    const made = yield* fixture
    const retained = [...Array.from({ length: 25 }, (_, index) => item("security", index + 1)), item("tests", 1)]
    const result = yield* ReviewAnalyze.run(input(made, {}), () => ({
      items: {},
      retained: { total: retained.length, unread: { security: 25, tests: 1 }, items: retained },
      debt: [],
    }))
    expect(result.retained).toMatchObject({ total: 26, unread: { security: 25, tests: 1 } })
    const first = yield* ReviewAnalyze.page({ store: made.store, uri: result.retained.uri, lens: "security" })
    expect(first.items).toHaveLength(20)
    expect(first.items.every((entry) => entry.lens === "security")).toBe(true)
    const second = yield* ReviewAnalyze.page({ store: made.store, uri: result.retained.uri, lens: "security", cursor: first.cursor })
    expect(second.items.map((entry) => entry.line)).toEqual([21, 22, 23, 24, 25])
    expect(second.cursor).toBeUndefined()
    const tests = yield* ReviewAnalyze.page({ store: made.store, uri: result.retained.uri, lens: "tests" })
    expect(tests.items.map((entry) => entry.lens)).toEqual(["tests"])
    const filtered = yield* ReviewAnalyze.page({ store: made.store, uri: result.retained.uri, lens: "security", filter: { class: "tests.kind" } })
    expect(filtered.items).toEqual([])
    const outside = yield* ReviewAnalyze.page({ store: made.store, uri: "review:../../etc/retained.json", lens: "security" }).pipe(Effect.flip)
    expect(outside.reason).toBe("artifact-unknown: review:../../etc/retained.json")
  }),
)

it.live("ast-grep that is not installed is not-run, and nothing is fetched", () =>
  Effect.gen(function* () {
    const made = yield* fixture
    const result = yield* ReviewAnalyze.run(input(made, { packs: ["ast-grep"], catalog: withAstGrep() })).pipe(
      Effect.provideService(BackendToolkit.Root, made.toolkit),
    )
    expect(result.checks).toEqual([{
      id: "ast-grep", pack: "ast-grep", version: ReviewPackAstGrep.manifest.version, lane: "no-build",
      status: "not-run", reason: "ast-grep absent", workspaceExecuted: false,
    }])
    expect(yield* Effect.promise(() => readdir(made.toolkit))).toEqual([])
  }),
)

live("an unreadable ast-grep report is acquisition-error, its stdout is kept, and the worktree is untouched", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* fixture
    yield* Effect.promise(() => installAstGrep(made.toolkit, "#!/bin/sh\nprintf '%s' 'not a report'\nexit 0\n"))
    const before = yield* Effect.promise(() => image(made.root))
    const result = yield* ReviewAnalyze.run(input(made, { packs: ["ast-grep"], catalog: withAstGrep() })).pipe(
      Effect.provideService(BackendToolkit.Root, made.toolkit),
    )
    expect(result.checks).toMatchObject([{ id: "ast-grep", status: "acquisition-error", reason: "malformed-json", workspaceExecuted: false }])
    const uri = result.checks[0].uri!
    expect(uri).toMatch(/^review:[0-9a-f-]{36}\/raw\/ast-grep-head\.json$/)
    expect(yield* Effect.promise(() => readFile(path.join(made.store, uri.slice("review:".length)), "utf8"))).toBe("not a report")
    expect(yield* Effect.promise(() => image(made.root))).toEqual(before)
  }), 120_000,
)

live("an invalid base ast-grep report keeps the base artifact, not the head one", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* fixture
    const invalid = JSON.stringify([{ ruleId: "", file: "a.js", range: { start: { line: 0 } } }])
    yield* Effect.promise(() => installAstGrep(made.toolkit, [
      "#!/bin/sh",
      "root=",
      "for arg in \"$@\"; do if [ -f \"$arg/src/a.ts\" ]; then root=\"$arg\"; fi; done",
      "if [ -n \"$root\" ] && grep -q \"a = 1\" \"$root/src/a.ts\"; then printf '%s' '" + invalid + "'; exit 0; fi",
      "printf '%s' '[]'",
      "exit 0",
      "",
    ].join("\n")))
    const result = yield* ReviewAnalyze.run(input(made, { packs: ["ast-grep"], catalog: withAstGrep() })).pipe(
      Effect.provideService(BackendToolkit.Root, made.toolkit),
    )
    expect(result.checks[0]).toMatchObject({ status: "acquisition-error", reason: "base: empty-rule" })
    expect(result.checks[0].status).not.toBe("pass")
    const uri = result.checks[0].uri!
    expect(uri).toMatch(/^review:[0-9a-f-]{36}\/raw\/ast-grep-base\.json$/)
    expect(yield* Effect.promise(() => readFile(path.join(made.store, uri.slice("review:".length)), "utf8"))).toBe(invalid)
  }), 120_000,
)

live("an invalid ast-grep row is acquisition-error, its raw report is kept, and it is not a pass", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* fixture
    const empty = JSON.stringify([{ ruleId: "", file: "a.js", range: { start: { line: 0 } } }])
    yield* Effect.promise(() => installAstGrep(made.toolkit, `#!/bin/sh\nprintf '%s' '${empty}'\nexit 0\n`))
    const emptyResult = yield* ReviewAnalyze.run(input(made, { packs: ["ast-grep"], catalog: withAstGrep() })).pipe(
      Effect.provideService(BackendToolkit.Root, made.toolkit),
    )
    expect(emptyResult.checks[0]).toMatchObject({ status: "acquisition-error", reason: "empty-rule", workspaceExecuted: false })
    expect(emptyResult.checks[0].status).not.toBe("pass")
    expect(emptyResult.items.security).toBeUndefined()
    expect(yield* Effect.promise(() => readFile(path.join(made.store, emptyResult.checks[0].uri!.slice("review:".length)), "utf8"))).toBe(empty)
    const unknown = JSON.stringify([{
      ruleId: "hostile-const", file: "src/a.ts", message: "hostile", text: "const kept = 1",
      range: { start: { line: 0, column: 0 }, end: { line: 0, column: 14 } },
    }])
    yield* Effect.promise(() => installAstGrep(made.toolkit, `#!/bin/sh\nprintf '%s' '${unknown}'\nexit 0\n`))
    const unknownResult = yield* ReviewAnalyze.run(input(made, { packs: ["ast-grep"], catalog: withAstGrep() })).pipe(
      Effect.provideService(BackendToolkit.Root, made.toolkit),
    )
    expect(unknownResult.checks[0]).toMatchObject({ status: "acquisition-error", reason: "unknown-rule:hostile-const" })
    expect(unknownResult.checks[0].status).not.toBe("pass")
    expect(yield* Effect.promise(() => readFile(path.join(made.store, unknownResult.checks[0].uri!.slice("review:".length)), "utf8"))).toBe(unknown)
  }), 120_000,
)

live("conformance: pinned ast-grep keeps new evals, debts unchanged ones, and leaves the worktree", () =>
  Effect.gen(function* () {
    expect(jail, "conformance-missing: sandbox").toBeTruthy()
    expectSpawn(import.meta.path)
    const made = yield* astTree
    const installed = yield* provision(path.join(made.dir.path, "toolkit"))
    const before = yield* Effect.promise(() => image(made.root))
    const result = yield* ReviewAnalyze.run(input(made, {
      packs: ["ast-grep"], catalog: withAstGrep(), lane: "no-build",
      changed: { "fresh.js": [{ start: 1, end: 1 }] },
    })).pipe(Effect.provideService(BackendToolkit.Root, installed.root))
    expect(result.checks[0]).toMatchObject({ id: "ast-grep", status: "fail", workspaceExecuted: false })
    expect(result.items.security?.map((entry) => [entry.path, entry.rule, entry.line, entry.class, entry.lens])).toEqual([
      ["fresh.js", "lucy-js-eval", 1, "security.boundary", "security"],
    ])
    const debt = JSON.parse(yield* Effect.promise(() => readFile(path.join(made.store, result.debt.uri.slice("review:".length)), "utf8")))
    expect(debt.map((entry: { path: string }) => entry.path)).toEqual(["stable.js"])
    const raw = yield* Effect.promise(() => readFile(path.join(made.store, result.checks[0].uri!.slice("review:".length)), "utf8"))
    expect(raw).toContain("lucy-js-eval")
    expect(raw).not.toContain("hostile-const")
    expect(yield* Effect.promise(() => image(made.root))).toEqual(before)
  }), 600_000,
)

const astTree = Effect.acquireRelease(Effect.promise(async () => {
  const dir = await tmpdir()
  const root = path.join(dir.path, "repo")
  await mkdir(root, { recursive: true })
  await git(root, "init", "-q")
  await git(root, "config", "user.email", "analyze@example.com")
  await git(root, "config", "user.name", "Analyze")
  await writeFile(path.join(root, "stable.js"), "const kept = 1\neval(kept)\n")
  await writeFile(path.join(root, "gone.js"), "eval(gone)\n")
  await mkdir(path.join(root, "rules"))
  await writeFile(path.join(root, "sgconfig.yml"), "ruleDirs:\n  - rules\n")
  await writeFile(path.join(root, "rules", "catch.yml"), "id: hostile-const\nlanguage: JavaScript\nseverity: error\nmessage: hostile\nrule:\n  pattern: const $NAME = $VALUE\n")
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "base")
  await git(root, "tag", "base")
  await rm(path.join(root, "gone.js"))
  await writeFile(path.join(root, "fresh.js"), "eval(fresh)\n")
  await writeFile(path.join(root, "look.js"), "// eval(fresh)\nconst text = \"eval(fresh)\"\n")
  await git(root, "add", "-A")
  await git(root, "commit", "-q", "-m", "head")
  await mkdir(path.join(dir.path, "store"))
  return { dir, root, base: "base", store: path.join(dir.path, "store") }
}), (made) => Effect.promise(() => made.dir[Symbol.asyncDispose]()))

async function installAstGrep(toolkit: string, script: string) {
  const host = BackendToolkitTarget.detect()
  if (!("target" in host)) throw new Error(host.unsupported)
  const manifest = ReviewPackAstGrep.manifest
  const directory = path.join(toolkit, "engines", manifest.id, `${manifest.version}-${host.target}`)
  await mkdir(directory, { recursive: true })
  const executable = BackendToolkitLauncher.executable(manifest, directory, host.target)
  await writeFile(executable, script)
  await chmod(executable, 0o755)
  await writeFile(path.join(directory, ".complete"), "")
  await mkdir(path.join(toolkit, "bin"), { recursive: true })
  const shim = path.join(toolkit, "bin", manifest.id)
  await writeFile(shim, BackendToolkitLauncher.launchText(toolkit, manifest, RUNTIMES, directory, host.target))
  await chmod(shim, 0o755)
}
