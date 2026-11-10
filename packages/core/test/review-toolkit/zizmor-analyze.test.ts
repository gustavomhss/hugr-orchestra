import { expect, test } from "bun:test"
import path from "node:path"
import { lstat, mkdir, readFile, symlink, writeFile } from "node:fs/promises"
import { Effect } from "effect"
import { BackendToolkit } from "../../src/backend-toolkit"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewRoute } from "../../src/review/route"
import { ReviewAnalyze } from "../../src/review-toolkit/analyze"
import type { ReviewItem } from "../../src/review-toolkit/item"
import { ReviewPackZizmor } from "../../src/review-toolkit/packs/zizmor"
import { ReviewZizmorResult } from "../../src/review-toolkit/packs/zizmor-result"
import { ReviewSarif } from "../../src/review-toolkit/sarif"
import { testEffect } from "../lib/effect"
import { jail } from "../lib/sandbox-host"
import { expectSpawn } from "../fixture/omni-expect"
import { tmpdir } from "../fixture/tmpdir"

// Curated zizmor through ReviewAnalyze.run. The pack id comes from ReviewRoute.route, not a literal.
// Provisioning happens outside the review. A missing binary or jail is conformance-missing, not a passing refusal.
// Fabricated SARIF below proves only the refusal chain. It is not native execution proof.

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const WORKFLOW = ".github/workflows/ci.yml"
const NOTE = ".github/workflows/note.yml"
const WARNING = ".github/workflows/warning.yml"
const ERROR = ".github/workflows/error.yml"
const CLEAN = "name: CI\non: push\npermissions: {}\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n"
const NOTE_BODY = "name: note\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v6\n"
const WARNING_BODY = "name: warning\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n"
const ERROR_BODY = "name: error\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/upload-artifact@v4\n        with:\n          path: .\n"
const POISON = "jobs: [deliberately invalid YAML\n"
const qualified = process.platform === "linux" && process.arch === "x64"

function route(tier: string, file: string) {
  return ReviewRoute.route(
    { stage: "code", tier, settings: { acceptedUnavailable: [] } },
    { files: ["package.json"] },
    { files: [file], changes: [{ path: file, added: [{ line: 1, text: "name: CI" }], removed: 0 }] },
    ReviewCatalog.current,
  )
}

function selected(file: string) {
  return route("deep", file).packs.filter((entry) => entry.id === "zizmor" && entry.status === "routed").map((entry) => entry.id)
}

function catalog(changes: { rule: string; status: "dropped" | "demoted" }[] = []) {
  const rules = ReviewCatalog.current.rules.map((entry) => {
    if (entry.pack !== "zizmor") return entry
    const change = changes.find((item) => item.rule === entry.rule || item.rule === "*")
    return change ? { ...entry, status: change.status } : entry
  })
  return { ...ReviewCatalog.current, rules }
}

function items(result: { readonly items: Readonly<Record<string, readonly ReviewItem.ToolItem[]>> }) {
  return Object.values(result.items).flat()
}

test("the production route selects zizmor only for an eligible workflow on Standard or Deep", () => {
  for (const tier of ["standard", "deep"]) {
    expect(route(tier, WORKFLOW).packs).toContainEqual({ id: "zizmor", source: "catalog", lane: "no-build", status: "routed" })
  }
  expect(route("deep", WORKFLOW).tier.requested ?? route("deep", WORKFLOW).tier.id).toBe("deep")
  expect(route("quick", WORKFLOW).packs.some((entry) => entry.id === "zizmor")).toBe(false)
  expect(route("standard", "src/file.ts").packs.some((entry) => entry.id === "zizmor")).toBe(false)
  expect(route("standard", "README.md").packs.some((entry) => entry.id === "zizmor")).toBe(false)
  expect(selected(WORKFLOW)).toEqual(["zizmor"])
  expect(selected("src/file.ts")).toEqual([])
})

test("a missing level fails normalization and an invalid level is refused before a priority", () => {
  const lookup = ReviewAnalyze.rules(ReviewCatalog.current)
  const row = (level?: string) => ({
    kind: "fail",
    ...(level === undefined ? {} : { level }),
    ruleId: "zizmor/artipacked",
    message: { text: "persisted credential" },
    locations: [{ physicalLocation: { artifactLocation: { uri: WORKFLOW }, region: { startLine: 6 } } }],
  })
  const report = (level?: string) => JSON.stringify({
    version: "2.1.0",
    runs: [{ tool: { driver: { name: "zizmor", version: ReviewPackZizmor.manifest.version } }, results: [row(level)] }],
  })
  const outcome = (text: string): ResearchProcess.Outcome => ({
    exitCode: 0, durationMs: 1, timedOut: false, overflow: false, memoryExceeded: false,
    stdout: { data: Buffer.from(text), bytes: Buffer.byteLength(text), truncated: false },
    stderr: { data: Buffer.from(""), bytes: 0, truncated: false },
  })
  const options = { root: "/repo", paths: [{ file: WORKFLOW, path: WORKFLOW }], rules: ReviewPackZizmor.RULES }
  const missing = ReviewZizmorResult.settle(outcome(report()), options)
  if (missing.status !== "ok") throw new Error(missing.reason)
  expect(missing.results[0]?.nativeSeverity).toBeUndefined()
  expect(ReviewSarif.bind(missing.results, lookup)).toEqual({ failed: "severity-unmapped", unresolved: missing.results })
  expect(ReviewZizmorResult.settle(outcome(report("critical")), options)).toEqual({ status: "acquisition-error", reason: "native-level-invalid" })
})

it.live("linux conformance requires the jail", () =>
  Effect.sync(() => {
    if (!qualified) return
    expect(jail, "conformance-missing: sandbox").toBeTruthy()
  }),
)

if (!qualified) it.live("an unqualified runtime refuses zizmor before a native claim", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    const root = yield* repo(path.join(made.path, "other"), { "README.md": "no workflow\n" })
    const result = yield* analyze(made, root, WORKFLOW)
    expect(selected(WORKFLOW)).toEqual(["zizmor"])
    expect(result.checks.find((check) => check.pack === "zizmor")).toMatchObject({
      status: "not-run",
      reason: "zizmor unsupported: native-runtime-unqualified",
      workspaceExecuted: false,
    })
    expect(result.checks.find((check) => check.pack === "zizmor")?.status).not.toBe("pass")
    expect(items(result)).toEqual([])
  }),
)

if (qualified) it.live("the routed controller keeps artipacked note warning and error from the pinned binary", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    expect(selected(NOTE)).toEqual(["zizmor"])
    const made = yield* held()
    const root = yield* repo(path.join(made.path, "levels"), { "README.md": "no workflow\n" }, {
      [NOTE]: NOTE_BODY,
      [WARNING]: WARNING_BODY,
      [ERROR]: ERROR_BODY,
      ".github/zizmor.yml": POISON,
    })
    yield* ready(made.toolkit)
    const before = yield* Effect.promise(() => readFile(path.join(root, NOTE), "utf8"))
    const result = yield* analyze(made, root, NOTE, {
      scope: "files",
      files: [NOTE, WARNING, ERROR],
      changed: {
        [NOTE]: [{ start: 1, end: 20 }],
        [WARNING]: [{ start: 1, end: 20 }],
        [ERROR]: [{ start: 1, end: 20 }],
      },
    })
    const check = result.checks.find((entry) => entry.pack === "zizmor")
    expect(check).toMatchObject({ status: "fail", workspaceExecuted: false, version: ReviewPackZizmor.manifest.version })
    expect(check?.status).not.toBe("not-built")
    expect(check?.reason).toContain("head path map:")
    const raw = JSON.parse(yield* Effect.promise(() => readRaw(made.store, check?.uri))) as {
      runs: { results: { ruleId?: string; level?: string }[] }[]
    }
    const levels = raw.runs[0]?.results.filter((row) => row.ruleId === "zizmor/artipacked").map((row) => row.level).sort()
    expect(levels).toEqual(["error", "note", "warning"])
    const artipacked = items(result).filter((item) => item.rule === "zizmor/artipacked")
    expect(artipacked.find((item) => item.path === NOTE)).toMatchObject({ severity: "P3", class: "security.secret" })
    expect(artipacked.find((item) => item.path === WARNING)).toMatchObject({ severity: "P2", class: "security.secret" })
    expect(artipacked.find((item) => item.path === ERROR)).toMatchObject({ severity: "P1", class: "security.secret" })
    expect(yield* Effect.promise(() => readFile(path.join(root, NOTE), "utf8"))).toBe(before)
    expect(yield* Effect.promise(() => readFile(path.join(root, ".github/zizmor.yml"), "utf8"))).toBe(POISON)
  }), 600_000,
)

if (qualified) it.live("an unchanged finding is debt, a first workflow records invoked false, and no input is not-run", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    yield* ready(made.toolkit)
    const sameRoot = yield* repo(path.join(made.path, "same"), { [WARNING]: WARNING_BODY }, { [WARNING]: WARNING_BODY }, true)
    const same = yield* analyze(made, sameRoot, WARNING, { changed: { [WARNING]: [{ start: 1, end: 20 }] } })
    expect(same.checks.find((entry) => entry.pack === "zizmor")).toMatchObject({ status: "fail", workspaceExecuted: false })
    expect(items(same).some((item) => item.rule === "zizmor/artipacked")).toBe(false)
    expect(same.debt.total).toBeGreaterThan(0)
    const first = yield* repo(path.join(made.path, "first"), { "README.md": "no workflow\n" }, { [WARNING]: WARNING_BODY })
    const added = yield* analyze(made, first, WARNING, { changed: { [WARNING]: [{ start: 1, end: 20 }] } })
    expect(items(added).some((item) => item.rule === "zizmor/artipacked" && item.path === WARNING && item.severity === "P2")).toBe(true)
    expect(added.debt.total).toBe(0)
    const base = JSON.parse(yield* Effect.promise(() => readRaw(made.store, baseUri(added.checks.find((entry) => entry.pack === "zizmor")?.uri)))) as { invoked?: unknown }
    expect(base.invoked).toBe(false)
    const empty = yield* repo(path.join(made.path, "empty"), { "README.md": "no workflow\n" })
    const none = yield* analyze(made, empty, WORKFLOW)
    expect(none.checks.find((entry) => entry.pack === "zizmor")).toMatchObject({ status: "not-run", reason: "no-input", workspaceExecuted: false })
    expect(none.checks.find((entry) => entry.pack === "zizmor")?.status).not.toBe("pass")
    expect(items(none)).toEqual([])
  }), 600_000,
)

if (qualified) it.live("a dropped rule is refused before zizmor runs, and no active rules stay refused", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    yield* ready(made.toolkit)
    const root = yield* repo(path.join(made.path, "drop"), { "README.md": "no workflow\n" }, { [WARNING]: WARNING_BODY })
    const before = yield* analyze(made, root, WARNING, { changed: { [WARNING]: [{ start: 1, end: 20 }] } })
    const raw = JSON.parse(yield* Effect.promise(() => readRaw(made.store, before.checks.find((entry) => entry.pack === "zizmor")?.uri))) as {
      runs: { results: { ruleId?: string }[] }[]
    }
    expect(raw.runs[0]?.results.some((row) => row.ruleId === "zizmor/artipacked")).toBe(true)
    const dropped = yield* analyze(made, root, WARNING, {
      changed: { [WARNING]: [{ start: 1, end: 20 }] },
      catalog: catalog([{ rule: "zizmor/artipacked", status: "dropped" }]),
    })
    expect(dropped.checks.find((entry) => entry.pack === "zizmor")).toMatchObject({
      status: "not-run", reason: "native-rule-selection-unsupported", workspaceExecuted: false,
    })
    expect(dropped.checks.find((entry) => entry.pack === "zizmor")?.uri).toBeUndefined()
    expect(items(dropped)).toEqual([])
    const none = yield* analyze(made, root, WARNING, {
      catalog: catalog(ReviewPackZizmor.RULES.map((rule) => ({ rule, status: "dropped" as const }))),
    })
    expect(none.checks.find((entry) => entry.pack === "zizmor")).toMatchObject({ status: "not-run", reason: "no-active-rules", workspaceExecuted: false })
    expect(none.checks.find((entry) => entry.pack === "zizmor")?.status).not.toBe("pass")
  }), 600_000,
)

if (qualified) it.live("a workflow symlink or an outside path is refused", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    yield* ready(made.toolkit)
    const linked = yield* headLink(path.join(made.path, "link"))
    const refused = yield* analyze(made, linked, WORKFLOW, { scope: "files", files: [WORKFLOW] })
    expect(refused.checks.find((entry) => entry.pack === "zizmor")?.status).toBe("not-run")
    expect(refused.checks.find((entry) => entry.pack === "zizmor")?.reason).toContain("symlink")
    expect(refused.checks.find((entry) => entry.pack === "zizmor")?.status).not.toBe("pass")
    expect(items(refused)).toEqual([])
    const root = yield* repo(path.join(made.path, "inside"), { [WARNING]: WARNING_BODY })
    const outside = path.join(made.path, "outside.yml")
    const escaped = yield* analyze(made, root, WORKFLOW, { scope: "files", files: [outside] })
    expect(escaped.checks.find((entry) => entry.pack === "zizmor")).toMatchObject({ status: "not-run", reason: "path-outside", workspaceExecuted: false })
    expect(items(escaped)).toEqual([])
  }), 600_000,
)

function ready(toolkit: string) {
  return Effect.gen(function* () {
    if (!jail) return yield* Effect.die(new Error("conformance-missing: sandbox"))
    yield* BackendToolkit.ensure<string>("zizmor").pipe(
      Effect.provideService(BackendToolkit.Root, toolkit),
      Effect.provideService(BackendToolkit.Manifest, { [ReviewPackZizmor.manifest.id]: ReviewPackZizmor.manifest }),
      Effect.catch((error) => Effect.die(new Error(`conformance-missing: zizmor ${ReviewPackZizmor.manifest.version}: ${error.reason}`))),
    )
  })
}

function analyze(
  made: { toolkit: string; store: string },
  root: string,
  file: string,
  extra: Partial<ReviewAnalyze.RunInput> = {},
) {
  const packs = selected(file)
  return ReviewAnalyze.run({
    worktree: root, base: "base", tier: "standard", store: made.store, changed: {}, trusted: true,
    lane: "no-build", packs, scope: "diff", ...extra,
  }).pipe(Effect.provideService(BackendToolkit.Root, made.toolkit))
}

function held() {
  return Effect.acquireRelease(Effect.promise(async () => {
    const dir = await tmpdir()
    await mkdir(path.join(dir.path, "toolkit"), { recursive: true })
    await mkdir(path.join(dir.path, "store"), { recursive: true })
    return { path: dir.path, toolkit: path.join(dir.path, "toolkit"), store: path.join(dir.path, "store"), dir }
  }), (made) => Effect.promise(() => made.dir[Symbol.asyncDispose]()))
}

const git = (root: string, args: ReadonlyArray<string>) => ResearchProcess.git(root, args)

function repo(dir: string, base: Record<string, string>, head?: Record<string, string>, allowEmpty = false) {
  return Effect.gen(function* () {
    const root = path.join(dir, "repo")
    yield* Effect.promise(() => mkdir(root, { recursive: true }))
    yield* git(root, ["init", "-q"])
    yield* git(root, ["config", "user.email", "zizmor@example.com"])
    yield* git(root, ["config", "user.name", "Zizmor"])
    yield* git(root, ["config", "commit.gpgsign", "false"])
    yield* git(root, ["config", "core.autocrlf", "false"])
    yield* writeTree(root, base)
    yield* git(root, ["add", "."])
    yield* git(root, ["commit", "-q", "-m", "base"])
    yield* git(root, ["tag", "base"])
    if (!head) return root
    yield* writeTree(root, head)
    yield* git(root, ["add", "."])
    yield* git(root, ["commit", "-q", ...(allowEmpty ? ["--allow-empty"] : []), "-m", "head"])
    return root
  })
}

function headLink(dir: string) {
  return Effect.gen(function* () {
    const root = path.join(dir, "repo")
    yield* Effect.promise(() => mkdir(path.join(root, ".github/workflows"), { recursive: true }))
    yield* git(root, ["init", "-q"])
    yield* git(root, ["config", "user.email", "zizmor@example.com"])
    yield* git(root, ["config", "user.name", "Zizmor"])
    yield* git(root, ["config", "commit.gpgsign", "false"])
    yield* git(root, ["config", "core.symlinks", "true"])
    yield* Effect.promise(() => writeFile(path.join(root, "README.md"), "no workflow\n"))
    yield* git(root, ["add", "."])
    yield* git(root, ["commit", "-q", "-m", "base"])
    yield* git(root, ["tag", "base"])
    yield* Effect.promise(() => symlink("nowhere", path.join(root, WORKFLOW)))
    expect((yield* Effect.promise(() => lstat(path.join(root, WORKFLOW)))).isSymbolicLink()).toBe(true)
    yield* git(root, ["add", "--", WORKFLOW])
    yield* git(root, ["commit", "-q", "-m", "head"])
    return root
  })
}

function writeTree(root: string, files: Record<string, string>) {
  return Effect.forEach(Object.entries(files), ([name, text]) => Effect.promise(async () => {
    const file = path.join(root, name)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, text)
  }))
}

function readRaw(store: string, uri: string | undefined) {
  const match = uri?.match(/^review:([^/]+)\/(.+)$/)
  if (!match) throw new Error(`missing owned artifact: ${uri}`)
  return readFile(path.join(store, match[1], match[2]), "utf8")
}

function baseUri(uri: string | undefined) {
  return uri?.replace("zizmor-head.sarif", "zizmor-base.sarif")
}
