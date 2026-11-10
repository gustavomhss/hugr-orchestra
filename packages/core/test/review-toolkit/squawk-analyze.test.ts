import { expect } from "bun:test"
import path from "node:path"
import { chmod, lstat, mkdir, readFile, writeFile } from "node:fs/promises"
import { Effect, Schema } from "effect"
import { BackendToolkit } from "../../src/backend-toolkit"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewAnalyze } from "../../src/review-toolkit/analyze"
import type { ReviewItem } from "../../src/review-toolkit/item"
import { ReviewPackSquawk } from "../../src/review-toolkit/packs/squawk"
import { testEffect } from "../lib/effect"
import { jail } from "../lib/sandbox-host"
import { expectSpawn } from "../fixture/omni-expect"
import { provision } from "../fixture/lucy-squawk/host"
import { tmpdir } from "../fixture/tmpdir"

// Binary integration runs inside the host jail. Linux never skips: a missing jail fails the named conformance check.
// Other hosts without a jail skip. Provisioning is outside the review; locate stays status-only. Not a Windows shell proof.

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const live = jail || process.platform === "linux" ? it.live : it.live.skip
const UNSAFE = "-- café\nALTER TABLE \"core_recipe\" ADD COLUMN \"foo\" integer NOT NULL;\n"
const BENIGN = "SELECT 1;\n"
const INVALID = "ALTER TABLE foo ALTER CONSTRAINT bar RENAME TO quux;\n"
const CHANGED = { "db/a.sql": [{ start: 1, end: 20 }] }

const squawkPack = {
  id: "squawk",
  tool: "squawk",
  version: "2.67.0",
  licence: "pinned",
  backend: "pinned",
  languages: ["sql"],
  detection: { manifests: [], extensions: [".sql"], absent: [] },
  lane: "no-build",
  tiers: ["standard", "deep"],
  output: { format: "json", parser: "squawk" },
  cost: "low",
  network: { kind: "none" },
  scratchWrites: false,
  template: "squawk-json",
  lenses: ["contracts"],
  status: "probation",
} satisfies ReviewCatalog.Catalog["packs"][number]

function catalog(): ReviewCatalog.Catalog {
  const packs = [...ReviewCatalog.current.packs.filter((entry) => entry.id !== squawkPack.id), squawkPack]
  const rules = [
    ...ReviewCatalog.current.rules.filter((entry) => entry.pack !== squawkPack.id),
    ...ReviewPackSquawk.RULES.map((rule) => Schema.decodeUnknownSync(ReviewCatalog.Rule)({
      pack: squawkPack.id,
      rule,
      class: "contracts.data",
      lens: "contracts",
      severity: { "*": "P2" },
      triage: "warns candidate not confirmed",
      status: "probation",
    })),
  ]
  const known = new Set(packs.map((pack) => pack.id))
  expect(rules.filter((rule) => !known.has(rule.pack)).map((rule) => `${rule.pack}/${rule.rule}`)).toEqual([])
  return { ...ReviewCatalog.current, packs, rules }
}

function items(result: { readonly items: Readonly<Record<string, readonly ReviewItem.ToolItem[]>> }) {
  return Object.values(result.items).flat()
}

it.live("the test catalog keeps one squawk pack and no rule for an unknown pack", () =>
  Effect.sync(() => {
    const built = catalog()
    expect(built.packs.filter((entry) => entry.id === squawkPack.id)).toHaveLength(1)
    expect(built.rules.some((rule) => rule.pack === squawkPack.id)).toBe(true)
  }),
)

it.live("an absent squawk is not-run and is not installed", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    const root = yield* repo(made.path, BENIGN, BENIGN)
    const before = yield* Effect.promise(() => shot(path.join(root, "db", "a.sql")))
    const result = yield* ReviewAnalyze.run(runInput(made, root)).pipe(Effect.provideService(BackendToolkit.Root, made.toolkit))
    expect(result.checks[0]).toMatchObject({ pack: "squawk", status: "not-run", reason: "squawk absent", workspaceExecuted: false })
    expect(result.checks[0].status).not.toBe("pass")
    expect(items(result)).toEqual([])
    expect(yield* Effect.promise(() => shot(path.join(root, "db", "a.sql")))).toBe(before)
  }),
)

live("a new squawk warning is an item, an unchanged one is not, and a hostile config is not the scan", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    yield* provision(made.toolkit)
    const run = (name: string, baseSql: string, headSql: string, extra: Partial<ReviewAnalyze.RunInput> = {}) =>
      Effect.gen(function* () {
        const root = yield* repo(path.join(made.path, name), baseSql, headSql)
        return yield* ReviewAnalyze.run({ ...runInput(made, root), ...extra }).pipe(Effect.provideService(BackendToolkit.Root, made.toolkit))
      })
    const fresh = yield* run("fresh", BENIGN, UNSAFE, { changed: CHANGED })
    expect(fresh.checks[0]).toMatchObject({ status: "fail", workspaceExecuted: false, version: "2.67.0" })
    expect(items(fresh).some((item) => item.pack === "squawk" && item.class === "contracts.data" && item.severity === "P2" && item.lens === "contracts")).toBe(true)
    expect(Object.keys(fresh.items)).toEqual(["contracts"])
    const same = yield* run("same", UNSAFE, UNSAFE, { changed: CHANGED })
    expect(items(same)).toEqual([])
    expect(same.debt.total).toBeGreaterThan(0)
    const clean = yield* run("clean", BENIGN, BENIGN)
    expect(clean.checks[0]).toMatchObject({ status: "pass", workspaceExecuted: false })
    expect(items(clean)).toEqual([])
    const hostileRoot = yield* repo(path.join(made.path, "hostile"), BENIGN, UNSAFE, true)
    const before = yield* Effect.promise(() => shot(path.join(hostileRoot, "db", "a.sql")))
    const hostile = yield* ReviewAnalyze.run({ ...runInput(made, hostileRoot), changed: CHANGED }).pipe(
      Effect.provideService(BackendToolkit.Root, made.toolkit),
    )
    expect(hostile.checks[0].status).toBe("fail")
    expect(hostile.checks[0].reason).not.toBe("configuration-error")
    expect(items(hostile).some((item) => item.pack === "squawk")).toBe(true)
    expect(Object.keys(hostile.items)).toEqual(["contracts"])
    expect(yield* Effect.promise(() => shot(path.join(hostileRoot, "db", "a.sql")))).toBe(before)
    const broken = yield* run("broken", BENIGN, INVALID)
    expect(broken.checks[0]).toMatchObject({ status: "acquisition-error", reason: "syntax-error", workspaceExecuted: false })
    expect(items(broken)).toEqual([])
    const raw = broken.checks[0].uri
    expect(raw).toMatch(/^review:[0-9a-f-]{36}\/raw\/squawk-head\.json$/)
    expect(yield* Effect.promise(() => readFile(path.join(made.store, raw!.slice("review:".length)), "utf8"))).toContain("syntax-error")
    const empty = yield* plain(path.join(made.path, "empty"))
    const none = yield* ReviewAnalyze.run(runInput(made, empty)).pipe(Effect.provideService(BackendToolkit.Root, made.toolkit))
    expect(none.checks[0]).toMatchObject({ status: "not-run", reason: "no-input" })
    expect(none.checks[0].status).not.toBe("pass")
    const escaped = yield* run("escaped", BENIGN, UNSAFE, { scope: "files", files: ["../outside.sql"] })
    expect(escaped.checks[0]).toMatchObject({ status: "not-run", reason: "path-outside" })
    expect(items(escaped)).toEqual([])
  }), 600_000,
)

it.live("linux conformance requires the jail", () =>
  Effect.sync(() => {
    if (process.platform !== "linux") return
    expect(jail, "conformance-missing: sandbox").toBeTruthy()
  }),
)

live("an unreadable copied SQL directory is not-run, not a pass", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    expect(process.getuid?.() === 0, "conformance-missing: non-root uid required to obtain EACCES").toBe(false)
    const made = yield* held()
    yield* provision(made.toolkit)
    const root = yield* repo(path.join(made.path, "sealed"), BENIGN, BENIGN)
    const result = yield* ReviewAnalyze.run(runInput(made, root)).pipe(
      Effect.provideService(BackendToolkit.Root, made.toolkit),
      Effect.provideService(ReviewAnalyze.BeforeSqlSelection, sealCopiedSql),
    )
    expect(result.checks[0]).toMatchObject({
      status: "not-run",
      reason: "sql-input-unavailable: EACCES",
      workspaceExecuted: false,
    })
    expect(result.checks[0].status).not.toBe("pass")
    expect(items(result)).toEqual([])
  }), 600_000,
)

live("a first SQL file against an empty base is a new warning and the base scanner is not invoked", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    yield* provision(made.toolkit)
    const root = yield* firstSql(made.path)
    const changed = { "db/new.sql": [{ start: 1, end: 20 }] }
    const added = yield* ReviewAnalyze.run({ ...runInput(made, root), changed }).pipe(
      Effect.provideService(BackendToolkit.Root, made.toolkit),
    )
    expect(added.checks[0]).toMatchObject({
      status: "fail",
      reason: "base: no eligible SQL input; no base scanner invocation",
      workspaceExecuted: false,
    })
    expect(items(added).some((item) => item.pack === "squawk" && item.path === "db/new.sql")).toBe(true)
    expect(Object.keys(added.items)).toEqual(["contracts"])
    expect(added.debt.total).toBe(0)
    const selected = yield* ReviewAnalyze.run({
      ...runInput(made, root), scope: "files", files: ["db/new.sql"], changed,
    }).pipe(Effect.provideService(BackendToolkit.Root, made.toolkit))
    expect(selected.checks[0]).toMatchObject({
      status: "fail",
      reason: "base: no eligible SQL input; no base scanner invocation",
    })
    expect(items(selected).some((item) => item.pack === "squawk" && item.path === "db/new.sql")).toBe(true)
    expect(Object.keys(selected.items)).toEqual(["contracts"])
    const missing = yield* ReviewAnalyze.run({
      ...runInput(made, root), scope: "files", files: ["db/missing.sql"],
    }).pipe(Effect.provideService(BackendToolkit.Root, made.toolkit))
    expect(missing.checks[0]).toMatchObject({ status: "not-run", reason: "missing" })
    expect(items(missing)).toEqual([])
  }), 600_000,
)

live("a head with no eligible SQL stays not-run", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    yield* provision(made.toolkit)
    const root = yield* plain(path.join(made.path, "empty"))
    const result = yield* ReviewAnalyze.run(runInput(made, root)).pipe(Effect.provideService(BackendToolkit.Root, made.toolkit))
    expect(result.checks[0]).toMatchObject({ status: "not-run", reason: "no-input", workspaceExecuted: false })
    expect(result.checks[0].status).not.toBe("pass")
    expect(items(result)).toEqual([])
  }), 600_000,
)

live("a different file selection on the same base tree does not turn an old warning into a new one", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    yield* provision(made.toolkit)
    const root = yield* paired(made.path)
    const other = yield* ReviewAnalyze.run({
      ...runInput(made, root), scope: "files", files: ["db/b.sql"],
    }).pipe(Effect.provideService(BackendToolkit.Root, made.toolkit))
    expect(other.checks[0]).toMatchObject({ status: "pass", workspaceExecuted: false })
    expect(items(other)).toEqual([])
    const old = yield* ReviewAnalyze.run({
      ...runInput(made, root),
      scope: "files",
      files: ["db/a.sql"],
      changed: { "db/a.sql": [{ start: 1, end: 20 }] },
    }).pipe(Effect.provideService(BackendToolkit.Root, made.toolkit))
    expect(old.checks[0]).toMatchObject({ status: "fail", workspaceExecuted: false })
    expect(items(old)).toEqual([])
    expect(old.debt.total).toBeGreaterThan(0)
  }), 600_000,
)

live("a contained selection is scanned and a lexical escape is refused before invocation", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    yield* provision(made.toolkit)
    const root = yield* repo(path.join(made.path, "select"), BENIGN, UNSAFE)
    const run = (files: readonly string[]) =>
      ReviewAnalyze.run({
        ...runInput(made, root), scope: "files", files: [...files], changed: CHANGED,
      }).pipe(Effect.provideService(BackendToolkit.Root, made.toolkit))
    const expectedRule = "prefer-robust-stmts"
    const readRaw = (uri: string | undefined) => {
      if (!uri) throw new Error("missing squawk head raw")
      return readFile(path.join(made.store, uri.slice("review:".length)), "utf8")
    }
    const relative = yield* run(["db/a.sql"])
    expect(relative.checks[0]).toMatchObject({ status: "fail", workspaceExecuted: false })
    const relativeUri = relative.checks[0].uri
    if (!relativeUri) throw new Error("missing squawk head raw")
    expect(relativeUri).toMatch(/^review:[0-9a-f-]{36}\/raw\/squawk-head\.json$/)
    const relativeRules = squawkRules(yield* Effect.promise(() => readRaw(relativeUri)))
    expect(relativeRules.filter((rule) => rule === expectedRule), "positive control: prefer-robust-stmts must be in the native raw before a refusal is claimed").toEqual([expectedRule])
    const relativeItem = items(relative).find((item) => item.pack === "squawk" && item.path === "db/a.sql" && item.rule === expectedRule)
    if (!relativeItem) throw new Error("missing prefer-robust-stmts model item")
    expect(relativeItem).toMatchObject({ pack: "squawk", path: "db/a.sql", rule: expectedRule, class: "contracts.data", severity: "P2", lens: "contracts" })
    const original = path.join(root, "db", "a.sql")
    const contained = yield* run([original])
    const containedUri = contained.checks[0].uri
    if (!containedUri) throw new Error("missing squawk head raw")
    expect(squawkRules(yield* Effect.promise(() => readRaw(containedUri))).filter((rule) => rule === expectedRule)).toEqual([expectedRule])
    const containedItem = items(contained).find((item) => item.fingerprint === relativeItem.fingerprint)
    if (!containedItem) throw new Error("absolute selection lost prefer-robust-stmts identity")
    expect(containedItem).toEqual(relativeItem)
    const refused = (files: readonly string[], reason: string) => Effect.gen(function* () {
      const result = yield* run(files)
      expect(result.checks[0]).toMatchObject({ status: "not-run", reason, workspaceExecuted: false })
      expect(result.checks[0].status).not.toBe("pass")
      expect(result.checks[0].uri).toBeUndefined()
      expect(items(result)).toEqual([])
    })
    // `db/../db/a.sql` resolves to the real file. Refusal is before lookup and copy, not a scanned warning dropped by the filter.
    yield* refused(["db/../db/a.sql"], "path-outside")
    yield* refused([path.join(made.path, "outside.sql")], "path-outside")
    yield* refused([""], "path-outside")
    yield* refused(["db/a.sql\0"], "nul")
  }), 600_000,
)

const sealCopiedSql = (root: string) => Effect.gen(function* () {
  const dir = path.join(root, "db")
  yield* Effect.promise(() => chmod(dir, 0o000))
  yield* Effect.addFinalizer(() => Effect.promise(() => chmod(dir, 0o755)))
})

function held() {
  return Effect.acquireRelease(Effect.promise(async () => {
    const dir = await tmpdir()
    await mkdir(path.join(dir.path, "toolkit"), { recursive: true })
    await mkdir(path.join(dir.path, "store"), { recursive: true })
    return { path: dir.path, toolkit: path.join(dir.path, "toolkit"), store: path.join(dir.path, "store"), dir }
  }), (made) => Effect.promise(() => made.dir[Symbol.asyncDispose]()))
}

function runInput(made: { store: string }, root: string): ReviewAnalyze.RunInput {
  return {
    worktree: root, base: "base", tier: "standard", store: made.store, changed: {}, trusted: true,
    lane: "no-build", packs: ["squawk"], scope: "diff", catalog: catalog(),
  }
}

const git = (root: string, args: ReadonlyArray<string>) => ResearchProcess.git(root, args)

const identity = (root: string) =>
  Effect.gen(function* () {
    yield* git(root, ["init", "-q"])
    yield* git(root, ["config", "user.email", "squawk@example.com"])
    yield* git(root, ["config", "user.name", "Squawk"])
  })

const repo = Effect.fn("SquawkAnalyze.repo")(function* (dir: string, baseSql: string, headSql: string, hostile = false) {
  const root = path.join(dir, "repo")
  yield* Effect.promise(() => mkdir(path.join(root, "db"), { recursive: true }))
  yield* identity(root)
  yield* Effect.promise(() => writeFile(path.join(root, "db", "a.sql"), baseSql))
  if (hostile) yield* Effect.promise(() => writeFile(path.join(root, ".squawk.toml"), "included_rules = [\n"))
  yield* git(root, ["add", "."])
  yield* git(root, ["commit", "-q", "-m", "base"])
  yield* git(root, ["tag", "base"])
  yield* Effect.promise(() => writeFile(path.join(root, "db", "a.sql"), headSql))
  yield* git(root, ["add", "."])
  // Same bytes are an intentional empty head, not a forced SQL edit.
  yield* git(root, ["commit", "-q", ...(baseSql === headSql ? ["--allow-empty"] : []), "-m", "head"])
  return root
})

const firstSql = Effect.fn("SquawkAnalyze.firstSql")(function* (dir: string) {
  const root = path.join(dir, "repo")
  yield* Effect.promise(() => mkdir(root, { recursive: true }))
  yield* identity(root)
  yield* Effect.promise(() => writeFile(path.join(root, "README.md"), "no sql\n"))
  yield* git(root, ["add", "."])
  yield* git(root, ["commit", "-q", "-m", "base"])
  yield* git(root, ["tag", "base"])
  yield* Effect.promise(() => mkdir(path.join(root, "db"), { recursive: true }))
  yield* Effect.promise(() => writeFile(path.join(root, "db", "new.sql"), UNSAFE))
  yield* git(root, ["add", "."])
  yield* git(root, ["commit", "-q", "-m", "head"])
  return root
})

const paired = Effect.fn("SquawkAnalyze.paired")(function* (dir: string) {
  const root = path.join(dir, "repo")
  yield* Effect.promise(() => mkdir(path.join(root, "db"), { recursive: true }))
  yield* identity(root)
  yield* Effect.promise(() => writeFile(path.join(root, "db", "a.sql"), UNSAFE))
  yield* Effect.promise(() => writeFile(path.join(root, "db", "b.sql"), BENIGN))
  yield* git(root, ["add", "."])
  yield* git(root, ["commit", "-q", "-m", "base"])
  yield* git(root, ["tag", "base"])
  return root
})

const plain = Effect.fn("SquawkAnalyze.plain")(function* (dir: string) {
  const root = path.join(dir, "repo")
  yield* Effect.promise(() => mkdir(root, { recursive: true }))
  yield* identity(root)
  yield* Effect.promise(() => writeFile(path.join(root, "README.md"), "no sql\n"))
  yield* git(root, ["add", "."])
  yield* git(root, ["commit", "-q", "-m", "base"])
  yield* git(root, ["tag", "base"])
  return root
})

function squawkRules(text: string) {
  const json = JSON.parse(text) as { rule_name?: string }[]
  if (!Array.isArray(json)) throw new Error("squawk raw is not an array")
  return json.flatMap((row) => typeof row.rule_name === "string" ? [row.rule_name] : [])
}

async function shot(file: string) {
  const info = await lstat(file)
  return `${info.mode}:${info.nlink}:${await readFile(file, "utf8")}`
}
