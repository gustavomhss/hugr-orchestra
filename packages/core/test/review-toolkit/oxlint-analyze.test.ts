import { expect, test } from "bun:test"
import path from "node:path"
import { access, lstat, mkdir, readFile, readdir, readlink, rm, symlink, writeFile } from "node:fs/promises"
import { Effect } from "effect"
import { BackendToolkit } from "../../src/backend-toolkit"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewAnalyze } from "../../src/review-toolkit/analyze"
import type { ReviewItem } from "../../src/review-toolkit/item"
import { ReviewPackOxlint } from "../../src/review-toolkit/packs/oxlint"
import { testEffect } from "../lib/effect"
import { jail } from "../lib/sandbox-host"
import { expectSpawn } from "../fixture/omni-expect"
import { tmpdir } from "../fixture/tmpdir"

// Curated oxlint through ReviewAnalyze.run. Provisioning, including the full notice, happens outside the review.
// A native cell names diagnostics, so an unsupported host or a missing Linux jail fails conformance-missing there.
// The suite's Linux jail cell is the other hard failure. Sandbox denial is not-run, not acquisition-error.
// Windows asserts the named refusal only and makes no native claim. A warning is not confirmation of project binding.

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const DEBUGGER = "debugger;\n"
const EXPLICIT_ANY = "const value: any = 1;\n"
const BENIGN = "const answer = 42;\n"
const OXLINTRC = "{"
const HOSTILE = "{ \"rules\": { \"no-debugger\": \"off\" } }\n"
const CHANGED = { "broken.js": [{ start: 1, end: 1 }], "any.ts": [{ start: 1, end: 1 }] }

function catalog(changes: { rule: string; status: "dropped" | "demoted" | "probation" | "active" }[] = []) {
  const pack = ReviewCatalog.current.packs.find((entry) => entry.id === "oxlint")
  if (!pack) throw new Error("oxlint catalog missing")
  const currentRules = ReviewCatalog.current.rules.filter((entry) => entry.pack === "oxlint")
  const rules = [
    ...ReviewCatalog.current.rules.filter((entry) => entry.pack !== "oxlint"),
    ...currentRules.map((entry) => {
      const change = changes.find((item) => item.rule === entry.rule)
      return change ? { ...entry, status: change.status } : entry
    }),
  ]
  return { ...ReviewCatalog.current, rules }
}

function items(result: { readonly items: Readonly<Record<string, readonly ReviewItem.ToolItem[]>> }) {
  return Object.values(result.items).flat()
}

it.live("linux conformance requires the jail", () =>
  Effect.sync(() => {
    if (process.platform !== "linux") return
    expect(jail, "conformance-missing: sandbox").toBeTruthy()
  }),
)

if (process.platform === "win32") {
  it.live("windows refuses curated oxlint before lookup and makes no native claim", () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const made = yield* held()
      const root = yield* repo(path.join(made.path, "win"), { "README.md": "no source\n" })
      const result = yield* analyze(made, root)
      expect(result.checks[0]).toMatchObject({
        pack: "oxlint",
        status: "not-run",
        reason: "oxlint unsupported: native-runtime-unqualified",
        workspaceExecuted: false,
      })
      expect(result.checks[0].status).not.toBe("pass")
      expect(items(result)).toEqual([])
    }),
  )
}

it.live("the analyzer fixture keeps one oxlint pack and both curated rules", () =>
  Effect.sync(() => {
    const built = catalog()
    expect(built.packs.filter((entry) => entry.id === "oxlint")).toHaveLength(1)
    expect(built.rules.filter((entry) => entry.pack === "oxlint").map((entry) => entry.rule).sort()).toEqual(["eslint(no-debugger)", "typescript(no-explicit-any)"])
    expect(built.packs.find((entry) => entry.id === "oxlint")?.output).toEqual({ format: "sarif" })
  }),
)

if (process.platform !== "win32") it.live("a new head fires no-debugger and no-explicit-any, an unchanged warning is debt, and hostile config is not the scan", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    const freshRoot = yield* repo(path.join(made.path, "fresh"), { "broken.js": BENIGN, "any.ts": BENIGN }, {
      "broken.js": DEBUGGER, "any.ts": EXPLICIT_ANY,
    })
    yield* ready(made.toolkit)
    const before = yield* Effect.promise(() => image(freshRoot))
    const fresh = yield* analyze(made, freshRoot, { changed: CHANGED })
    expect(fresh.checks[0]).toMatchObject({ status: "fail", workspaceExecuted: false, version: "1.91.0" })
    const freshRules = rules(yield* Effect.promise(() => readRaw(made.store, fresh.checks[0].uri)))
    expect(freshRules, "positive control: both rules must fire before any later absence").toEqual(expect.arrayContaining(["eslint(no-debugger)", "typescript(no-explicit-any)"]))
    expect(items(fresh).some((item) => item.pack === "oxlint" && item.rule === "eslint(no-debugger)" && item.class === "logic.invariant" && item.severity === "P2" && item.lens === "correctness-logic")).toBe(true)
    expect(items(fresh).some((item) => item.rule === "typescript(no-explicit-any)" && item.class === "logic.contract" && item.lens === "correctness-logic")).toBe(true)
    expect(Object.keys(fresh.items)).toEqual(["correctness-logic"])
    expect(fresh.debt.total).toBe(0)
    expect(yield* Effect.promise(() => image(freshRoot))).toEqual(before)

    const sameRoot = yield* repo(path.join(made.path, "same"), { "broken.js": DEBUGGER }, { "broken.js": DEBUGGER }, true)
    const same = yield* analyze(made, sameRoot, { changed: { "broken.js": [{ start: 1, end: 1 }] } })
    expect(same.checks[0]).toMatchObject({ status: "fail", workspaceExecuted: false })
    expect(rules(yield* Effect.promise(() => readRaw(made.store, same.checks[0].uri)))).toContain("eslint(no-debugger)")
    expect(items(same)).toEqual([])
    expect(same.debt.total).toBeGreaterThan(0)

    const cleanRoot = yield* repo(path.join(made.path, "clean"), { "clean.js": BENIGN }, { "clean.js": "const other = 1\n" })
    const clean = yield* analyze(made, cleanRoot, { changed: { "clean.js": [{ start: 1, end: 1 }] } })
    expect(clean.checks[0]).toMatchObject({ status: "pass", workspaceExecuted: false })
    expect(rules(yield* Effect.promise(() => readRaw(made.store, clean.checks[0].uri)))).toEqual([])
    expect(items(clean)).toEqual([])

    const hostileRoot = yield* repo(path.join(made.path, "hostile"), { "broken.js": BENIGN, "any.ts": BENIGN }, {
      "broken.js": DEBUGGER, "any.ts": EXPLICIT_ANY, ".oxlintrc.json": HOSTILE,
    })
    const shot = yield* Effect.promise(() => image(hostileRoot))
    const hostile = yield* analyze(made, hostileRoot, { changed: CHANGED })
    const hostileRules = rules(yield* Effect.promise(() => readRaw(made.store, hostile.checks[0].uri)))
    expect(hostile.checks[0].status).toBe("fail")
    expect(hostileRules).toEqual(expect.arrayContaining(["eslint(no-debugger)", "typescript(no-explicit-any)"]))
    expect(items(hostile).some((item) => item.rule === "eslint(no-debugger)")).toBe(true)
    expect(items(hostile).some((item) => item.rule === "typescript(no-explicit-any)")).toBe(true)
    expect(yield* Effect.promise(() => image(hostileRoot))).toEqual(shot)
  }), 600_000,
)

if (process.platform !== "win32") it.live("a first source file keeps base metadata invoked false, and a head with no input is not-run", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    const root = yield* repo(path.join(made.path, "first"), { "README.md": "no source\n" }, { "new.js": DEBUGGER })
    yield* ready(made.toolkit)
    const added = yield* analyze(made, root, { changed: { "new.js": [{ start: 1, end: 1 }] } })
    expect(added.checks[0]).toMatchObject({ status: "fail", workspaceExecuted: false })
    expect(added.checks[0].uri).toMatch(/^review:[0-9a-f-]{36}\/raw\/oxlint-head\.sarif$/)
    expect(rules(yield* Effect.promise(() => readRaw(made.store, added.checks[0].uri)))).toContain("eslint(no-debugger)")
    expect(items(added).some((item) => item.rule === "eslint(no-debugger)" && item.path === "new.js")).toBe(true)
    expect(added.debt.total).toBe(0)
    const base = JSON.parse(yield* Effect.promise(() => readRaw(made.store, baseUri(added.checks[0].uri)))) as { invoked?: unknown }
    expect(base.invoked).toBe(false)
    const empty = yield* repo(path.join(made.path, "empty"), { "README.md": "no source\n" })
    const none = yield* analyze(made, empty)
    expect(none.checks[0]).toMatchObject({ status: "not-run", reason: "no-input", workspaceExecuted: false })
    expect(none.checks[0].status).not.toBe("pass")
    expect(items(none)).toEqual([])
  }), 600_000,
)

if (process.platform !== "win32") it.live("dropped no-debugger is absent from raw while no-explicit-any fires, and demoted stays out of page", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    const root = yield* repo(path.join(made.path, "rules"), { "broken.js": BENIGN, "any.ts": BENIGN }, {
      "broken.js": DEBUGGER, "any.ts": EXPLICIT_ANY,
    })
    yield* ready(made.toolkit)
    const shot = yield* Effect.promise(() => image(root))
    const before = yield* analyze(made, root, { changed: CHANGED })
    const beforeRules = rules(yield* Effect.promise(() => readRaw(made.store, before.checks[0].uri)))
    expect(beforeRules, "positive control: both rules must fire before a drop is claimed").toEqual(expect.arrayContaining(["eslint(no-debugger)", "typescript(no-explicit-any)"]))
    expect(items(before).some((item) => item.rule === "eslint(no-debugger)")).toBe(true)
    expect(items(before).some((item) => item.rule === "typescript(no-explicit-any)")).toBe(true)
    const dropped = yield* analyze(made, root, { changed: CHANGED, catalog: catalog([{ rule: "eslint(no-debugger)", status: "dropped" }]) })
    expect(yield* Effect.promise(() => image(root))).toEqual(shot)
    expect(dropped.checks[0].uri).not.toBe(before.checks[0].uri)
    const droppedRules = rules(yield* Effect.promise(() => readRaw(made.store, dropped.checks[0].uri)))
    expect(droppedRules).not.toContain("eslint(no-debugger)")
    expect(droppedRules).toContain("typescript(no-explicit-any)")
    expect(items(dropped).some((item) => item.rule === "eslint(no-debugger)")).toBe(false)
    expect(items(dropped).some((item) => item.rule === "typescript(no-explicit-any)")).toBe(true)
    const demoted = yield* analyze(made, root, { changed: CHANGED, catalog: catalog([{ rule: "eslint(no-debugger)", status: "demoted" }]) })
    expect(demoted.checks[0].uri).not.toBe(dropped.checks[0].uri)
    const demotedRules = rules(yield* Effect.promise(() => readRaw(made.store, demoted.checks[0].uri)))
    expect(demotedRules).toContain("eslint(no-debugger)")
    expect(demotedRules).toContain("typescript(no-explicit-any)")
    expect(items(demoted).some((item) => item.rule === "eslint(no-debugger)")).toBe(false)
    expect(items(demoted).some((item) => item.rule === "typescript(no-explicit-any)")).toBe(true)
    expect(demoted.retained.uri).toMatch(/^review:[0-9a-f-]{36}\/retained\.json$/)
    const retained = JSON.parse(yield* Effect.promise(() => readRaw(made.store, demoted.retained.uri))) as {
      items?: ReadonlyArray<{ rule?: string; ruleStatus?: string }>
    }
    expect(retained.items?.some((item) => item.rule === "eslint(no-debugger)" && item.ruleStatus === "demoted")).toBe(true)
    const page = yield* ReviewAnalyze.page({ store: made.store, uri: demoted.retained.uri, lens: "correctness-logic" })
    expect(page.items.some((item) => item.rule === "eslint(no-debugger)")).toBe(false)
  }), 600_000,
)

if (process.platform !== "win32") it.live("selected paths bind to the copied tree, and a base or head symlink is refused", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    const root = yield* repo(path.join(made.path, "paths"), { "broken.js": BENIGN }, { "broken.js": DEBUGGER })
    yield* ready(made.toolkit)
    const changed = { "broken.js": [{ start: 1, end: 1 }] }
    const relative = yield* analyze(made, root, { scope: "files", files: ["broken.js"], changed })
    expect(rules(yield* Effect.promise(() => readRaw(made.store, relative.checks[0].uri)))).toContain("eslint(no-debugger)")
    expect(items(relative).some((item) => item.rule === "eslint(no-debugger)" && item.path === "broken.js")).toBe(true)
    const original = path.join(root, "broken.js")
    expect(path.isAbsolute(original)).toBe(true)
    expect(original.startsWith(root + path.sep)).toBe(true)
    const selected = yield* analyze(made, root, { scope: "files", files: [original], changed })
    expect(rules(yield* Effect.promise(() => readRaw(made.store, selected.checks[0].uri)))).toContain("eslint(no-debugger)")
    expect(items(selected).some((item) => item.rule === "eslint(no-debugger)" && item.path === "broken.js" && item.class === "logic.invariant")).toBe(true)
    expect(items(selected).every((item) => item.path === "broken.js")).toBe(true)
    const outside = path.join(made.path, "outside.js")
    expect(path.isAbsolute(outside)).toBe(true)
    expect(outside.startsWith(root + path.sep)).toBe(false)
    const escaped = yield* analyze(made, root, { scope: "files", files: [outside] })
    expect(escaped.checks[0]).toMatchObject({ status: "not-run", reason: "path-outside", workspaceExecuted: false })
    expect(escaped.checks[0].status).not.toBe("pass")
    expect(items(escaped)).toEqual([])
    const linked = yield* danglingBase(path.join(made.path, "dangling"))
    const refused = yield* analyze(made, linked, {
      scope: "files", files: ["link/a.js"], changed: { "link/a.js": [{ start: 1, end: 1 }] },
    })
    expect(refused.checks[0]).toMatchObject({ status: "not-run", workspaceExecuted: false })
    expect(refused.checks[0].reason).toContain("symlink")
    expect(refused.checks[0].status).not.toBe("pass")
    expect(items(refused).some((item) => item.rule === "eslint(no-debugger)")).toBe(false)
    expect(items(refused)).toEqual([])
    const head = yield* headLink(path.join(made.path, "head-link"))
    const link = yield* analyze(made, head, { scope: "files", files: ["alias.js"] })
    expect(link.checks[0]).toMatchObject({ status: "not-run", reason: "symlink", workspaceExecuted: false })
    expect(link.checks[0].status).not.toBe("pass")
    expect(items(link)).toEqual([])
    const gone = yield* analyze(made, head, { scope: "files", files: ["gone.js"] })
    expect(gone.checks[0]).toMatchObject({ status: "not-run", reason: "missing", workspaceExecuted: false })
    expect(gone.checks[0].status).not.toBe("pass")
    expect(items(gone)).toEqual([])
  }), 600_000,
)

function ready(toolkit: string) {
  return Effect.gen(function* () {
    const states = yield* BackendToolkit.status<string>("oxlint").pipe(
      Effect.provideService(BackendToolkit.Root, toolkit),
      Effect.provideService(BackendToolkit.Manifest, { [ReviewPackOxlint.manifest.id]: ReviewPackOxlint.manifest }),
    )
    const state = states[0]
    if (state?.status === "unsupported") return yield* Effect.die(new Error(`conformance-missing: oxlint unsupported: ${state.reason}`))
    yield* provision(toolkit)
    if (process.platform === "linux" && !jail) return yield* Effect.die(new Error("conformance-missing: sandbox"))
  })
}

function provision(root: string) {
  return Effect.gen(function* () {
    const readyInstall = yield* BackendToolkit.ensure<string>("oxlint").pipe(
      Effect.provideService(BackendToolkit.Root, root),
      Effect.provideService(BackendToolkit.Manifest, { [ReviewPackOxlint.manifest.id]: ReviewPackOxlint.manifest }),
      Effect.catch((error) => Effect.die(new Error(`conformance-missing: oxlint ${ReviewPackOxlint.manifest.version}: ${error.reason}`))),
    )
    expect(readyInstall.executable.includes(ReviewPackOxlint.manifest.version)).toBe(true)
    const states = yield* BackendToolkit.status<string>("oxlint").pipe(
      Effect.provideService(BackendToolkit.Root, root),
      Effect.provideService(BackendToolkit.Manifest, { [ReviewPackOxlint.manifest.id]: ReviewPackOxlint.manifest }),
    )
    const installed = states[0]
    if (installed?.status !== "ready") return yield* Effect.die(new Error("oxlint-install-not-ready"))
  })
}

function analyze(
  made: { toolkit: string; store: string },
  root: string,
  extra: Partial<ReviewAnalyze.RunInput> = {},
) {
  return ReviewAnalyze.run({ ...runInput(made, root), ...extra }).pipe(Effect.provideService(BackendToolkit.Root, made.toolkit))
}

function runInput(made: { store: string }, root: string): ReviewAnalyze.RunInput {
  return {
    worktree: root, base: "base", tier: "standard", store: made.store, changed: {}, trusted: true,
    lane: "no-build", packs: ["oxlint"], scope: "diff", catalog: catalog(),
  }
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

function identity(root: string) {
  return Effect.gen(function* () {
    yield* git(root, ["init", "-q"])
    yield* git(root, ["config", "user.email", "oxlint@example.com"])
    yield* git(root, ["config", "user.name", "Oxlint"])
    yield* git(root, ["config", "commit.gpgsign", "false"])
    yield* git(root, ["config", "core.autocrlf", "false"])
  })
}

function repo(dir: string, base: Record<string, string>, head?: Record<string, string>, allowEmpty = false) {
  return Effect.gen(function* () {
    const root = path.join(dir, "repo")
    yield* Effect.promise(() => mkdir(root, { recursive: true }))
    yield* identity(root)
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

function danglingBase(dir: string) {
  return Effect.gen(function* () {
    const root = path.join(dir, "repo")
    yield* Effect.promise(() => mkdir(root, { recursive: true }))
    yield* identity(root)
    yield* git(root, ["config", "core.symlinks", "true"])
    yield* Effect.promise(() => symlink("missing-dir", path.join(root, "link")))
    expect((yield* Effect.promise(() => lstat(path.join(root, "link")))).isSymbolicLink()).toBe(true)
    yield* git(root, ["add", "--", "link"])
    expect((yield* git(root, ["ls-files", "-s", "--", "link"])).toString()).toContain("120000")
    yield* git(root, ["commit", "-q", "-m", "base"])
    yield* git(root, ["tag", "base"])
    yield* Effect.promise(async () => {
      await rm(path.join(root, "link"))
      await mkdir(path.join(root, "link"))
      await writeFile(path.join(root, "link", "a.js"), DEBUGGER)
    })
    expect((yield* Effect.promise(() => lstat(path.join(root, "link", "a.js")))).isFile()).toBe(true)
    yield* git(root, ["add", "-A"])
    yield* git(root, ["commit", "-q", "-m", "head"])
    return root
  })
}

function headLink(dir: string) {
  return Effect.gen(function* () {
    const root = path.join(dir, "repo")
    yield* Effect.promise(() => mkdir(root, { recursive: true }))
    yield* identity(root)
    yield* git(root, ["config", "core.symlinks", "true"])
    yield* Effect.promise(() => writeFile(path.join(root, "README.md"), "no selection\n"))
    yield* git(root, ["add", "."])
    yield* git(root, ["commit", "-q", "-m", "base"])
    yield* git(root, ["tag", "base"])
    yield* Effect.promise(() => symlink("nowhere", path.join(root, "alias.js")))
    expect((yield* Effect.promise(() => lstat(path.join(root, "alias.js")))).isSymbolicLink()).toBe(true)
    yield* git(root, ["add", "--", "alias.js"])
    expect((yield* git(root, ["ls-files", "-s", "--", "alias.js"])).toString()).toContain("120000")
    yield* git(root, ["commit", "-q", "-m", "head"])
    const missing = yield* Effect.promise(() => lstat(path.join(root, "gone.js")).then(() => "present", (error: NodeJS.ErrnoException) => error.code))
    expect(missing).toBe("ENOENT")
    return root
  })
}

function writeTree(root: string, files: Record<string, string>) {
  return Effect.forEach(Object.entries(files), ([name, text]) => Effect.promise(async () => {
    const file = path.join(root, name)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, text)
  }), { discard: true })
}

function baseUri(uri: string | undefined) {
  if (!uri || !/^review:[0-9a-f-]{36}\/raw\/oxlint-head\.sarif$/.test(uri)) throw new Error(`missing oxlint head artifact: ${uri}`)
  return uri.replace(/\/raw\/oxlint-head\.sarif$/, "/raw/oxlint-base.sarif")
}

function readRaw(store: string, uri: string | undefined) {
  if (!uri?.startsWith("review:")) throw new Error(`missing raw uri: ${uri}`)
  return readFile(path.join(store, uri.slice("review:".length)), "utf8")
}

function rules(text: string) {
  const sarif = JSON.parse(text) as { runs?: ReadonlyArray<{ results?: ReadonlyArray<{ ruleId?: string }> }> }
  return (sarif.runs ?? []).flatMap((run) => (run.results ?? []).flatMap((result) => result.ruleId ? [result.ruleId] : []))
}

async function image(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true })
  return (await Promise.all(entries.filter((entry) => entry.name !== ".git").map(async (entry) => {
    const relative = path.join(prefix, entry.name)
    const file = path.join(root, relative)
    const stat = await lstat(file)
    if (entry.isSymbolicLink()) return [`${relative}->${await readlink(file)}`]
    if (entry.isDirectory()) return [`${relative}/`, ...await image(root, relative)]
    return [`${relative}:${stat.mode}:${(await readFile(file)).toString("base64")}`]
  }))).flat().sort()
}

const exists = (file: string) => access(file).then(() => true, () => false)
