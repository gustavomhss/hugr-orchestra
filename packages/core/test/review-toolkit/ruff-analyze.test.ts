import { expect } from "bun:test"
import { createHash } from "node:crypto"
import path from "node:path"
import { access, lstat, mkdir, readFile, readdir, readlink, rm, symlink, writeFile } from "node:fs/promises"
import { Effect, Schema } from "effect"
import { BackendToolkit } from "../../src/backend-toolkit"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewAnalyze } from "../../src/review-toolkit/analyze"
import type { ReviewItem } from "../../src/review-toolkit/item"
import { ReviewPackRuff } from "../../src/review-toolkit/packs/ruff"
import { testEffect } from "../lib/effect"
import { jail } from "../lib/sandbox-host"
import { expectSpawn } from "../fixture/omni-expect"
import { tmpdir } from "../fixture/tmpdir"

// Curated Ruff through ReviewAnalyze.run. Provisioning, including the full notice, happens outside the review.
// A native cell names diagnostics, so an unsupported host or a missing Linux jail fails conformance-missing there.
// The suite's Linux jail cell is the other hard failure. Sandbox denial is not-run, not acquisition-error.
// Windows asserts the named refusal only and makes no native claim. A warning is not confirmation of project binding.
// Catalog registration is not this file. Path normalization and the base symlink walk are the analyzer's, not this fixture's.

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const NOTICE = "2597d854122b77ddc71971564ca2350a37608575ce324adc5650a2b2051c8f18"
const F821 = "print(missing_name)\n"
const F823 = "x = 1\ndef foo():\n    x += 1\n"
const BENIGN = "value = 1\n"
const NOQA = "print(missing_name)  # noqa: F821\n"
const HOSTILE = "[tool.ruff.lint]\nignore = [\"F821\", \"F823\"]\n"
const CHANGED = { "missing.py": [{ start: 1, end: 1 }], "shadow.py": [{ start: 1, end: 4 }] }

const localPack = {
  id: "ruff",
  tool: "ruff",
  version: ReviewPackRuff.manifest.version,
  pin: {
    source: "backend-toolkit/packs/ruff",
    integrity: Object.fromEntries(Object.entries(ReviewPackRuff.manifest.targets).map(([id, target]) => [id, target.artifact.integrity])),
  },
  licence: "pinned",
  backend: "pinned",
  languages: ["python"],
  detection: { manifests: [], extensions: [".py", ".pyi"], absent: [] },
  lane: "no-build",
  tiers: ["standard", "deep"],
  output: { format: "json", parser: "ruff" },
  cost: "low",
  network: { kind: "none" },
  scratchWrites: false,
  template: ReviewPackRuff.templateId,
  lenses: ["correctness-logic"],
  status: "probation",
} satisfies ReviewCatalog.Catalog["packs"][number]

function catalog(changes: { rule: string; status: "dropped" | "demoted" | "probation" | "active" }[] = []) {
  const currentPack = ReviewCatalog.current.packs.find((entry) => entry.id === "ruff")
  const pack = currentPack ?? localPack
  const packs = [...ReviewCatalog.current.packs.filter((entry) => entry.id !== "ruff"), pack]
  const currentRules = ReviewCatalog.current.rules.filter((entry) => entry.pack === "ruff")
  const authored = currentRules.length > 0 ? currentRules : ReviewPackRuff.RULES.map((rule) => Schema.decodeUnknownSync(ReviewCatalog.Rule)({
    pack: "ruff",
    rule,
    class: "logic.invariant",
    lens: "correctness-logic",
    severity: { "*": "P2" },
    triage: "A warning is not confirmation; project binding and the called function stay host triage.",
    status: "probation",
  }))
  const rules = [
    ...ReviewCatalog.current.rules.filter((entry) => entry.pack !== "ruff"),
    ...authored.map((entry) => {
      const change = changes.find((item) => item.rule === entry.rule)
      return change ? { ...entry, status: change.status } : entry
    }),
  ]
  const known = new Set(packs.map((entry) => entry.id))
  expect(rules.filter((rule) => !known.has(rule.pack)).map((rule) => `${rule.pack}/${rule.rule}`)).toEqual([])
  expect(packs.filter((entry) => entry.id === "ruff")).toHaveLength(1)
  return { ...ReviewCatalog.current, packs, rules }
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
  it.live("windows refuses curated ruff before lookup and makes no native claim", () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const made = yield* held()
      const root = yield* repo(path.join(made.path, "win"), { "README.md": "no python\n" })
      const result = yield* analyze(made, root)
      expect(result.checks[0]).toMatchObject({
        pack: "ruff",
        status: "not-run",
        reason: "ruff unsupported: windows-api-unqualified",
        workspaceExecuted: false,
      })
      expect(result.checks[0].status).not.toBe("pass")
      expect(items(result)).toEqual([])
      expect(result.checks[0].reason).not.toContain("F821")
    }),
  )
}

it.live("the analyzer fixture keeps one ruff pack and both curated rules", () =>
  Effect.sync(() => {
    const built = catalog()
    expect(built.packs.filter((entry) => entry.id === "ruff")).toHaveLength(1)
    expect(built.rules.filter((entry) => entry.pack === "ruff").map((entry) => entry.rule).sort()).toEqual(["F821", "F823"])
    expect(built.packs.find((entry) => entry.id === "ruff")?.output).toEqual({ format: "json", parser: "ruff" })
  }),
)

if (process.platform !== "win32") it.live("a new head fires F821 and F823, an unchanged warning is debt, and hostile config is not the scan", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    const freshRoot = yield* repo(path.join(made.path, "fresh"), { "missing.py": BENIGN, "shadow.py": BENIGN }, {
      "missing.py": F821, "shadow.py": F823,
    })
    yield* ready(made.toolkit)
    const before = yield* Effect.promise(() => image(freshRoot))
    const fresh = yield* analyze(made, freshRoot, { changed: CHANGED })
    expect(fresh.checks[0]).toMatchObject({ status: "fail", workspaceExecuted: false, version: "0.17.3" })
    const freshCodes = codes(yield* Effect.promise(() => readRaw(made.store, fresh.checks[0].uri)))
    expect(freshCodes, "positive control: F821 and F823 must fire before any later absence").toEqual(expect.arrayContaining(["F821", "F823"]))
    expect(items(fresh).some((item) => item.pack === "ruff" && item.rule === "F821" && item.class === "logic.invariant" && item.severity === "P2" && item.lens === "correctness-logic")).toBe(true)
    expect(items(fresh).some((item) => item.rule === "F823" && item.class === "logic.invariant" && item.lens === "correctness-logic")).toBe(true)
    expect(Object.keys(fresh.items)).toEqual(["correctness-logic"])
    expect(fresh.debt.total).toBe(0)
    expect(yield* Effect.promise(() => image(freshRoot))).toEqual(before)

    const sameRoot = yield* repo(path.join(made.path, "same"), { "missing.py": F821 }, { "missing.py": F821 }, true)
    const same = yield* analyze(made, sameRoot, { changed: { "missing.py": [{ start: 1, end: 1 }] } })
    expect(same.checks[0]).toMatchObject({ status: "fail", workspaceExecuted: false })
    expect(codes(yield* Effect.promise(() => readRaw(made.store, same.checks[0].uri)))).toContain("F821")
    expect(items(same)).toEqual([])
    expect(same.debt.total).toBeGreaterThan(0)

    const cleanRoot = yield* repo(path.join(made.path, "clean"), { "clean.py": BENIGN }, { "clean.py": "value = 2\n" })
    const clean = yield* analyze(made, cleanRoot, { changed: { "clean.py": [{ start: 1, end: 1 }] } })
    expect(clean.checks[0]).toMatchObject({ status: "pass", workspaceExecuted: false })
    expect(codes(yield* Effect.promise(() => readRaw(made.store, clean.checks[0].uri)))).toEqual([])
    expect(items(clean)).toEqual([])

    const hostileRoot = yield* repo(path.join(made.path, "hostile"), { "missing.py": BENIGN, "shadow.py": BENIGN }, {
      "missing.py": NOQA, "shadow.py": F823, "pyproject.toml": HOSTILE,
    })
    const shot = yield* Effect.promise(() => image(hostileRoot))
    const poison = path.join(made.path, "diverted.json")
    const cache = path.join(made.path, "poison-cache")
    yield* dirtyEnv(poison, cache, path.join(made.path, "poison-python"))
    const hostile = yield* analyze(made, hostileRoot, { changed: CHANGED })
    const hostileCodes = codes(yield* Effect.promise(() => readRaw(made.store, hostile.checks[0].uri)))
    expect(hostile.checks[0].status).toBe("fail")
    expect(hostile.checks[0].reason).not.toBe("configuration-error")
    expect(hostileCodes).toEqual(expect.arrayContaining(["F821", "F823"]))
    expect(items(hostile).some((item) => item.rule === "F821")).toBe(true)
    expect(items(hostile).some((item) => item.rule === "F823")).toBe(true)
    const after = yield* Effect.promise(() => image(hostileRoot))
    expect(after).toEqual(shot)
    expect(after.some((line) => line.includes(".ruff_cache"))).toBe(false)
    expect(yield* Effect.promise(() => exists(poison))).toBe(false)
    expect(yield* Effect.promise(() => exists(cache))).toBe(false)
  }), 600_000,
)

if (process.platform !== "win32") it.live("a first Python file keeps base metadata invoked false, and a head with no input is not-run", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    const root = yield* repo(path.join(made.path, "first"), { "README.md": "no python\n" }, { "new.py": F821 })
    yield* ready(made.toolkit)
    const added = yield* analyze(made, root, { changed: { "new.py": [{ start: 1, end: 1 }] } })
    expect(added.checks[0]).toMatchObject({ status: "fail", workspaceExecuted: false })
    expect(added.checks[0].uri).toMatch(/^review:[0-9a-f-]{36}\/raw\/ruff-head\.json$/)
    expect(codes(yield* Effect.promise(() => readRaw(made.store, added.checks[0].uri)))).toContain("F821")
    expect(items(added).some((item) => item.rule === "F821" && item.path === "new.py")).toBe(true)
    expect(added.debt.total).toBe(0)
    const base = JSON.parse(yield* Effect.promise(() => readRaw(made.store, baseUri(added.checks[0].uri)))) as { invoked?: unknown }
    expect(base.invoked).toBe(false)
    const empty = yield* repo(path.join(made.path, "empty"), { "README.md": "no python\n" })
    const none = yield* analyze(made, empty)
    expect(none.checks[0]).toMatchObject({ status: "not-run", reason: "no-input", workspaceExecuted: false })
    expect(none.checks[0].status).not.toBe("pass")
    expect(items(none)).toEqual([])
  }), 600_000,
)

if (process.platform !== "win32") it.live("a different file selection on the same base does not turn an old warning into a new item", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    const root = yield* repo(path.join(made.path, "pair"), { "a.py": F821, "b.py": BENIGN })
    yield* ready(made.toolkit)
    const other = yield* analyze(made, root, { scope: "files", files: ["b.py"] })
    expect(other.checks[0]).toMatchObject({ status: "pass", workspaceExecuted: false })
    expect(items(other)).toEqual([])
    const old = yield* analyze(made, root, {
      scope: "files",
      files: ["a.py"],
      changed: { "a.py": [{ start: 1, end: 1 }] },
    })
    expect(old.checks[0]).toMatchObject({ status: "fail", workspaceExecuted: false })
    expect(codes(yield* Effect.promise(() => readRaw(made.store, old.checks[0].uri)))).toContain("F821")
    expect(items(old)).toEqual([])
    expect(old.debt.total).toBeGreaterThan(0)
    expect(old.checks[0].uri).not.toBe(other.checks[0].uri)
  }), 600_000,
)

if (process.platform !== "win32") it.live("dropped F821 is absent from raw while F823 fires, and demoted F821 stays out of page", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    const root = yield* repo(path.join(made.path, "rules"), { "missing.py": BENIGN, "shadow.py": BENIGN }, {
      "missing.py": F821, "shadow.py": F823,
    })
    yield* ready(made.toolkit)
    const shot = yield* Effect.promise(() => image(root))
    const before = yield* analyze(made, root, { changed: CHANGED })
    const beforeCodes = codes(yield* Effect.promise(() => readRaw(made.store, before.checks[0].uri)))
    expect(beforeCodes, "positive control: both codes must fire before a drop is claimed").toEqual(expect.arrayContaining(["F821", "F823"]))
    expect(items(before).some((item) => item.rule === "F821")).toBe(true)
    expect(items(before).some((item) => item.rule === "F823")).toBe(true)
    const dropped = yield* analyze(made, root, { changed: CHANGED, catalog: catalog([{ rule: "F821", status: "dropped" }]) })
    expect(yield* Effect.promise(() => image(root))).toEqual(shot)
    expect(dropped.checks[0].uri).not.toBe(before.checks[0].uri)
    const droppedCodes = codes(yield* Effect.promise(() => readRaw(made.store, dropped.checks[0].uri)))
    expect(droppedCodes).not.toContain("F821")
    expect(droppedCodes).toContain("F823")
    expect(items(dropped).some((item) => item.rule === "F821")).toBe(false)
    expect(items(dropped).some((item) => item.rule === "F823")).toBe(true)
    const demoted = yield* analyze(made, root, { changed: CHANGED, catalog: catalog([{ rule: "F821", status: "demoted" }]) })
    expect(demoted.checks[0].uri).not.toBe(dropped.checks[0].uri)
    const demotedCodes = codes(yield* Effect.promise(() => readRaw(made.store, demoted.checks[0].uri)))
    expect(demotedCodes).toContain("F821")
    expect(demotedCodes).toContain("F823")
    expect(items(demoted).some((item) => item.rule === "F821")).toBe(false)
    expect(items(demoted).some((item) => item.rule === "F823")).toBe(true)
    expect(demoted.retained.uri).toMatch(/^review:[0-9a-f-]{36}\/retained\.json$/)
    const retained = JSON.parse(yield* Effect.promise(() => readRaw(made.store, demoted.retained.uri))) as {
      items?: ReadonlyArray<{ rule?: string; ruleStatus?: string }>
    }
    expect(retained.items?.some((item) => item.rule === "F821" && item.ruleStatus === "demoted")).toBe(true)
    const page = yield* ReviewAnalyze.page({ store: made.store, uri: demoted.retained.uri, lens: "correctness-logic" })
    expect(page.items.some((item) => item.rule === "F821")).toBe(false)
  }), 600_000,
)

if (process.platform !== "win32") it.live("selected paths bind to the copied tree, and a base or head symlink is refused", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    const root = yield* repo(path.join(made.path, "paths"), { "missing.py": BENIGN }, { "missing.py": F821 })
    yield* ready(made.toolkit)
    const changed = { "missing.py": [{ start: 1, end: 1 }] }
    const relative = yield* analyze(made, root, { scope: "files", files: ["missing.py"], changed })
    expect(codes(yield* Effect.promise(() => readRaw(made.store, relative.checks[0].uri)))).toContain("F821")
    expect(items(relative).some((item) => item.rule === "F821" && item.path === "missing.py")).toBe(true)
    // Original worktree path. The analyzer normalizes it onto the copy; this test does not invent a scratch path.
    const original = path.join(root, "missing.py")
    expect(path.isAbsolute(original)).toBe(true)
    expect(original.startsWith(root + path.sep)).toBe(true)
    const selected = yield* analyze(made, root, { scope: "files", files: [original], changed })
    expect(codes(yield* Effect.promise(() => readRaw(made.store, selected.checks[0].uri)))).toContain("F821")
    expect(items(selected).some((item) => item.rule === "F821" && item.path === "missing.py" && item.class === "logic.invariant")).toBe(true)
    expect(items(selected).every((item) => item.path === "missing.py")).toBe(true)
    const outside = path.join(made.path, "outside.py")
    expect(path.isAbsolute(outside)).toBe(true)
    expect(outside.startsWith(root + path.sep)).toBe(false)
    const escaped = yield* analyze(made, root, { scope: "files", files: [outside] })
    expect(escaped.checks[0]).toMatchObject({ status: "not-run", reason: "path-outside", workspaceExecuted: false })
    expect(escaped.checks[0].status).not.toBe("pass")
    expect(items(escaped)).toEqual([])
    const linked = yield* danglingBase(path.join(made.path, "dangling"))
    const refused = yield* analyze(made, linked, {
      scope: "files", files: ["link/a.py"], changed: { "link/a.py": [{ start: 1, end: 1 }] },
    })
    expect(refused.checks[0]).toMatchObject({ status: "not-run", workspaceExecuted: false })
    expect(refused.checks[0].reason).toContain("symlink")
    expect(refused.checks[0].status).not.toBe("pass")
    expect(items(refused).some((item) => item.rule === "F821")).toBe(false)
    expect(items(refused)).toEqual([])
    const head = yield* headLink(path.join(made.path, "head-link"))
    const link = yield* analyze(made, head, { scope: "files", files: ["alias.py"] })
    expect(link.checks[0]).toMatchObject({ status: "not-run", reason: "symlink", workspaceExecuted: false })
    expect(link.checks[0].status).not.toBe("pass")
    expect(items(link)).toEqual([])
    const gone = yield* analyze(made, head, { scope: "files", files: ["gone.py"] })
    expect(gone.checks[0]).toMatchObject({ status: "not-run", reason: "missing", workspaceExecuted: false })
    expect(gone.checks[0].status).not.toBe("pass")
    expect(items(gone)).toEqual([])
  }), 600_000,
)

function ready(toolkit: string) {
  return Effect.gen(function* () {
    const states = yield* BackendToolkit.status<string>("ruff").pipe(
      Effect.provideService(BackendToolkit.Root, toolkit),
      Effect.provideService(BackendToolkit.Manifest, { [ReviewPackRuff.manifest.id]: ReviewPackRuff.manifest }),
    )
    const state = states[0]
    if (state?.status === "unsupported") return yield* Effect.die(new Error(`conformance-missing: ruff unsupported: ${state.reason}`))
    yield* provision(toolkit)
    if (process.platform === "linux" && !jail) return yield* Effect.die(new Error("conformance-missing: sandbox"))
  })
}

function provision(root: string) {
  return Effect.gen(function* () {
    const readyInstall = yield* BackendToolkit.ensure<string>("ruff").pipe(
      Effect.provideService(BackendToolkit.Root, root),
      Effect.provideService(BackendToolkit.Manifest, { [ReviewPackRuff.manifest.id]: ReviewPackRuff.manifest }),
      Effect.catch((error) => Effect.die(new Error(`conformance-missing: ruff ${ReviewPackRuff.manifest.version}: ${error.reason}`))),
    )
    expect(readyInstall.executable.includes(ReviewPackRuff.manifest.version)).toBe(true)
    const states = yield* BackendToolkit.status<string>("ruff").pipe(
      Effect.provideService(BackendToolkit.Root, root),
      Effect.provideService(BackendToolkit.Manifest, { [ReviewPackRuff.manifest.id]: ReviewPackRuff.manifest }),
    )
    const installed = states[0]
    if (installed?.status !== "ready") return yield* Effect.die(new Error("ruff-install-not-ready"))
    const notice = yield* Effect.promise(() => readFile(path.join(installed.directory, "notices", "ruff-0.17.3-license.txt")))
    expect(createHash("sha256").update(notice).digest("hex")).toBe(NOTICE)
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
    lane: "no-build", packs: ["ruff"], scope: "diff", catalog: catalog(),
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
    yield* git(root, ["config", "user.email", "ruff@example.com"])
    yield* git(root, ["config", "user.name", "Ruff"])
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
      await writeFile(path.join(root, "link", "a.py"), F821)
    })
    expect((yield* Effect.promise(() => lstat(path.join(root, "link", "a.py")))).isFile()).toBe(true)
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
    yield* Effect.promise(() => symlink("nowhere", path.join(root, "alias.py")))
    expect((yield* Effect.promise(() => lstat(path.join(root, "alias.py")))).isSymbolicLink()).toBe(true)
    yield* git(root, ["add", "--", "alias.py"])
    expect((yield* git(root, ["ls-files", "-s", "--", "alias.py"])).toString()).toContain("120000")
    yield* git(root, ["commit", "-q", "-m", "head"])
    const missing = yield* Effect.promise(() => lstat(path.join(root, "gone.py")).then(() => "present", (error: NodeJS.ErrnoException) => error.code))
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

function dirtyEnv(poison: string, cache: string, python: string) {
  return Effect.acquireRelease(Effect.sync(() => {
    const saved = {
      RUFF_OUTPUT_FILE: process.env.RUFF_OUTPUT_FILE,
      RUFF_OUTPUT_FORMAT: process.env.RUFF_OUTPUT_FORMAT,
      RUFF_CACHE_DIR: process.env.RUFF_CACHE_DIR,
      PYTHONPATH: process.env.PYTHONPATH,
    }
    process.env.RUFF_OUTPUT_FILE = poison
    process.env.RUFF_OUTPUT_FORMAT = "text"
    process.env.RUFF_CACHE_DIR = cache
    process.env.PYTHONPATH = python
    return saved
  }), (saved) => Effect.sync(() => {
    restore("RUFF_OUTPUT_FILE", saved.RUFF_OUTPUT_FILE)
    restore("RUFF_OUTPUT_FORMAT", saved.RUFF_OUTPUT_FORMAT)
    restore("RUFF_CACHE_DIR", saved.RUFF_CACHE_DIR)
    restore("PYTHONPATH", saved.PYTHONPATH)
  }))
}

function restore(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key]
    return
  }
  process.env[key] = value
}

function baseUri(uri: string | undefined) {
  if (!uri || !/^review:[0-9a-f-]{36}\/raw\/ruff-head\.json$/.test(uri)) throw new Error(`missing ruff head artifact: ${uri}`)
  return uri.replace(/\/raw\/ruff-head\.json$/, "/raw/ruff-base.json")
}

function readRaw(store: string, uri: string | undefined) {
  if (!uri?.startsWith("review:")) throw new Error(`missing raw uri: ${uri}`)
  return readFile(path.join(store, uri.slice("review:".length)), "utf8")
}

function codes(text: string) {
  const json = JSON.parse(text) as unknown
  if (!Array.isArray(json)) throw new Error("ruff raw is not an array")
  return json.flatMap((row) => {
    if (row === null || typeof row !== "object" || !("code" in row) || typeof row.code !== "string") return []
    return [row.code]
  })
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
