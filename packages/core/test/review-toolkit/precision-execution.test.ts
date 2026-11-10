import { expect } from "bun:test"
import { createHash } from "node:crypto"
import path from "node:path"
import { mkdir, readdir, readFile, readlink, writeFile } from "node:fs/promises"
import { Effect, Schema } from "effect"
import { BackendToolkit } from "../../src/backend-toolkit"
import { BackendToolkitManifest } from "../../src/backend-toolkit/manifest"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ReviewCatalog } from "../../src/review/catalog"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { ReviewAnalyze } from "../../src/review-toolkit/analyze"
import type { ReviewItem } from "../../src/review-toolkit/item"
import { testEffect } from "../lib/effect"
import { jail } from "../lib/sandbox-host"
import { expectSpawn } from "../fixture/omni-expect"
import { tmpdir } from "../fixture/tmpdir"

// Native exclusion is proved on the tool's own report, not on the item filter. Linux never skips: a missing jail
// fails the named conformance check. Other hosts without a jail skip. Provisioning is outside the review.

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const live = jail || process.platform === "linux" ? it.live : it.live.skip
const AWS = "AKIA" + "ABCDEFGHIJKLMNOP"
// Tagged gitleaks 8.30.1 global allowlist stopword includes alphabetabcdefghijklmnopqrstuvwxyz.
// A body that lowercases into that sequence is an allowlisted example, not a native miss. Hex is not that stopword.
const GITHUB = "ghp_" + createHash("sha256").update("lucy-github-native-control-v1").digest("hex").slice(0, 36)
const HOSTILE_GITLEAKS = "[extend]\nuseDefault = true\ndisabledRules = [ \"aws-access-token\", \"github-pat\"]\n"

function items(result: { readonly items: Readonly<Record<string, readonly ReviewItem.ToolItem[]>> }) {
  return Object.values(result.items).flat()
}

function catalog(changes: { pack: string; rule: string; status: "dropped" | "demoted" | "probation" | "active" }[] = []) {
  const rules = ReviewCatalog.current.rules.map((entry) => {
    const change = changes.find((item) => item.pack === entry.pack && item.rule === entry.rule)
    return change ? { ...entry, status: change.status } : entry
  })
  const extra = changes
    .filter((item) => !ReviewCatalog.current.rules.some((entry) => entry.pack === item.pack && entry.rule === item.rule))
    .map((item) => Schema.decodeUnknownSync(ReviewCatalog.Rule)({
      pack: item.pack,
      rule: item.rule,
      class: item.pack === "squawk" ? "contracts.data" : "security.secret",
      lens: item.pack === "squawk" ? "contracts" : "security",
      severity: { "*": item.pack === "gitleaks" ? "P1" : "P2" },
      triage: "precision execution test rule",
      status: item.status,
    }))
  const built = { ...ReviewCatalog.current, rules: [...rules, ...extra] }
  const known = new Set<string>(built.packs.map((pack) => pack.id))
  expect(built.rules.filter((rule) => !known.has(rule.pack)).map((rule) => rule.pack)).toEqual([])
  return built
}

it.live("linux conformance requires the jail", () =>
  Effect.sync(() => {
    if (process.platform !== "linux") return
    expect(jail, "conformance-missing: sandbox").toBeTruthy()
  }),
)

it.live("a dropped wildcard over an open native set is not-run, not a partial filter", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    const root = yield* planted(made.path)
    const result = yield* ReviewAnalyze.run(run(made, root, ["gitleaks"], catalog([
      { pack: "gitleaks", rule: "*", status: "dropped" },
      { pack: "gitleaks", rule: "aws-access-token", status: "probation" },
    ]))).pipe(Effect.provideService(BackendToolkit.Root, made.toolkit))
    expect(result.checks[0]).toMatchObject({ status: "not-run", reason: "wildcard-dropped", workspaceExecuted: false })
    expect(result.checks[0].status).not.toBe("pass")
    expect(items(result)).toEqual([])
  }),
)

it.live("a dropped native id that contains a star is not an exclusion", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    const root = yield* planted(made.path)
    const result = yield* ReviewAnalyze.run(run(made, root, ["gitleaks"], catalog([
      { pack: "gitleaks", rule: "github-*", status: "dropped" },
    ]))).pipe(Effect.provideService(BackendToolkit.Root, made.toolkit))
    expect(result.checks[0]).toMatchObject({ status: "not-run", reason: "native-rule-pattern", workspaceExecuted: false })
    expect(result.checks[0].status).not.toBe("pass")
    expect(items(result)).toEqual([])
  }),
)

it.live("dropping every host ast-grep rule is not-run, not a clean pass", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    const root = yield* planted(made.path)
    const result = yield* ReviewAnalyze.run(run(made, root, ["ast-grep"], catalog([
      { pack: "ast-grep", rule: "lucy-js-eval", status: "dropped" },
      { pack: "ast-grep", rule: "lucy-ts-eval", status: "dropped" },
    ]), { "a.js": [{ start: 1, end: 2 }] })).pipe(Effect.provideService(BackendToolkit.Root, made.toolkit))
    expect(result.checks[0]).toMatchObject({ status: "not-run", reason: "no-active-rules", workspaceExecuted: false })
    expect(result.checks[0].status).not.toBe("pass")
    expect(items(result)).toEqual([])
  }),
)

live("a dropped repo rule does not stop a declared gate", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    const root = yield* planted(made.path, { base: async (dir) => {
      await writeFile(path.join(dir, "package.json"), JSON.stringify({ scripts: { lint: "echo ok" } }))
      await writeFile(path.join(dir, "bun.lock"), "")
    } })
    const result = yield* ReviewAnalyze.run({
      ...run(made, root, ["repo"], catalog([{ pack: "repo", rule: "lint", status: "dropped" }])),
      lane: "repo",
    }).pipe(Effect.provideService(BackendToolkit.Root, made.toolkit))
    expect(result.checks.some((check) => check.pack === "repo" && check.status === "pass")).toBe(true)
    expect(result.checks.some((check) => check.reason === "dropped" || check.reason === "wildcard-dropped")).toBe(false)
  }),
)

live("gitleaks fires a known secret before a drop, then omits only that rule from the raw report", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    yield* provision("gitleaks", made.toolkit)
    const root = yield* planted(made.path, { head: async (dir) => {
      await writeFile(path.join(dir, "secrets.txt"), `AWS_ACCESS_KEY_ID=${AWS}\nGITHUB_TOKEN=${GITHUB}\n`)
      await writeFile(path.join(dir, ".gitleaks.toml"), HOSTILE_GITLEAKS)
    } })
    const changed = { "secrets.txt": [{ start: 1, end: 3 }] }
    const shot = yield* Effect.promise(() => image(root))
    const before = yield* ReviewAnalyze.run(run(made, root, ["gitleaks"], catalog(), changed)).pipe(
      Effect.provideService(BackendToolkit.Root, made.toolkit),
    )
    expect(yield* Effect.promise(() => image(root))).toEqual(shot)
    const beforeRaw = yield* Effect.promise(() => readRaw(made.store, before.checks[0].uri))
    const beforeRules = sarifRules(beforeRaw)
    expect(beforeRules, "positive control: the secret must fire before a drop is claimed").toContain("aws-access-token")
    expect(beforeRules).toContain("github-pat")
    expect(items(before).some((item) => item.rule === "aws-access-token")).toBe(true)
    expect(before.debt.total).toBe(0)
    const after = yield* ReviewAnalyze.run(run(made, root, ["gitleaks"], catalog([
      { pack: "gitleaks", rule: "aws-access-token", status: "dropped" },
    ]), changed)).pipe(Effect.provideService(BackendToolkit.Root, made.toolkit))
    expect(yield* Effect.promise(() => image(root))).toEqual(shot)
    const afterRules = sarifRules(yield* Effect.promise(() => readRaw(made.store, after.checks[0].uri)))
    expect(afterRules).not.toContain("aws-access-token")
    expect(afterRules).toContain("github-pat")
    expect(items(after).some((item) => item.rule === "aws-access-token")).toBe(false)
    expect(items(after).some((item) => item.rule === "github-pat")).toBe(true)
    const demoted = yield* ReviewAnalyze.run(run(made, root, ["gitleaks"], catalog([
      { pack: "gitleaks", rule: "github-pat", status: "demoted" },
    ]), changed)).pipe(Effect.provideService(BackendToolkit.Root, made.toolkit))
    expect(yield* Effect.promise(() => image(root))).toEqual(shot)
    expect(sarifRules(yield* Effect.promise(() => readRaw(made.store, demoted.checks[0].uri)))).toContain("github-pat")
    expect(items(demoted).some((item) => item.rule === "github-pat")).toBe(false)
  }), 600_000,
)

live("ast-grep omits a dropped rule from the host rule file and still fires the other language", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    yield* provision("ast-grep", made.toolkit)
    const root = yield* planted(made.path, { head: async (dir) => {
      await writeFile(path.join(dir, "a.js"), "eval(input)\n")
      await writeFile(path.join(dir, "a.ts"), "eval(input)\n")
      await writeFile(path.join(dir, "sgconfig.yml"), "ruleDirs:\n  - hostile\n")
    } })
    const changed = { "a.js": [{ start: 1, end: 2 }], "a.ts": [{ start: 1, end: 2 }] }
    const shot = yield* Effect.promise(() => image(root))
    const before = yield* ReviewAnalyze.run(run(made, root, ["ast-grep"], catalog(), changed)).pipe(
      Effect.provideService(BackendToolkit.Root, made.toolkit),
    )
    expect(yield* Effect.promise(() => image(root))).toEqual(shot)
    const beforeRules = astRules(yield* Effect.promise(() => readRaw(made.store, before.checks[0].uri)))
    expect(beforeRules, "positive control: both language rules must fire before a drop").toEqual(expect.arrayContaining(["lucy-js-eval", "lucy-ts-eval"]))
    expect(items(before).some((item) => item.rule === "lucy-js-eval")).toBe(true)
    expect(before.debt.total).toBe(0)
    const after = yield* ReviewAnalyze.run(run(made, root, ["ast-grep"], catalog([
      { pack: "ast-grep", rule: "lucy-js-eval", status: "dropped" },
    ]), changed)).pipe(Effect.provideService(BackendToolkit.Root, made.toolkit))
    expect(yield* Effect.promise(() => image(root))).toEqual(shot)
    const afterRules = astRules(yield* Effect.promise(() => readRaw(made.store, after.checks[0].uri)))
    expect(afterRules).not.toContain("lucy-js-eval")
    expect(afterRules).toContain("lucy-ts-eval")
    expect(items(after).some((item) => item.rule === "lucy-js-eval")).toBe(false)
    expect(items(after).some((item) => item.rule === "lucy-ts-eval")).toBe(true)
    const kept = yield* ReviewAnalyze.run(run(made, root, ["ast-grep"], catalog([
      { pack: "ast-grep", rule: "*", status: "dropped" },
      { pack: "ast-grep", rule: "lucy-js-eval", status: "dropped" },
    ]), changed)).pipe(Effect.provideService(BackendToolkit.Root, made.toolkit))
    const keptRules = astRules(yield* Effect.promise(() => readRaw(made.store, kept.checks[0].uri)))
    expect(keptRules).not.toContain("lucy-js-eval")
    expect(keptRules).toContain("lucy-ts-eval")
    expect(items(kept).some((item) => item.rule === "lucy-ts-eval")).toBe(true)
  }), 600_000,
)

live("squawk excludes a dropped rule in the host config and still fires a different rule", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    yield* provision("squawk", made.toolkit)
    const root = yield* planted(made.path, { head: async (dir) => {
      await mkdir(path.join(dir, "db"), { recursive: true })
      await writeFile(path.join(dir, "db", "concurrent.sql"), "CREATE INDEX idx_a ON t (a);\n")
      await writeFile(path.join(dir, "db", "required.sql"), "ALTER TABLE t ADD COLUMN c integer NOT NULL;\n")
      await writeFile(path.join(dir, ".squawk.toml"), "excluded_rules = [\"require-concurrent-index-creation\", \"adding-required-field\"]\n")
    } })
    const changed = {
      "db/concurrent.sql": [{ start: 1, end: 2 }],
      "db/required.sql": [{ start: 1, end: 2 }],
    }
    const shot = yield* Effect.promise(() => image(root))
    const before = yield* ReviewAnalyze.run(run(made, root, ["squawk"], catalog(), changed)).pipe(
      Effect.provideService(BackendToolkit.Root, made.toolkit),
    )
    expect(yield* Effect.promise(() => image(root))).toEqual(shot)
    const beforeRules = squawkRules(yield* Effect.promise(() => readRaw(made.store, before.checks[0].uri)))
    expect(beforeRules, "positive control: both SQL rules must fire before a drop").toEqual(expect.arrayContaining([
      "require-concurrent-index-creation", "adding-required-field",
    ]))
    expect(items(before).some((item) => item.rule === "require-concurrent-index-creation")).toBe(true)
    expect(before.debt.total).toBe(0)
    const after = yield* ReviewAnalyze.run(run(made, root, ["squawk"], catalog([
      { pack: "squawk", rule: "require-concurrent-index-creation", status: "dropped" },
    ]), changed)).pipe(Effect.provideService(BackendToolkit.Root, made.toolkit))
    expect(yield* Effect.promise(() => image(root))).toEqual(shot)
    const afterRules = squawkRules(yield* Effect.promise(() => readRaw(made.store, after.checks[0].uri)))
    expect(afterRules).not.toContain("require-concurrent-index-creation")
    expect(afterRules).toContain("adding-required-field")
    expect(items(after).some((item) => item.rule === "require-concurrent-index-creation")).toBe(false)
    expect(items(after).some((item) => item.rule === "adding-required-field")).toBe(true)
    const empty = yield* planted(path.join(made.path, "empty"))
    const none = yield* ReviewAnalyze.run(run(made, empty, ["squawk"], catalog())).pipe(
      Effect.provideService(BackendToolkit.Root, made.toolkit),
    )
    expect(none.checks[0]).toMatchObject({ status: "not-run", reason: "no-input", workspaceExecuted: false })
    expect(none.checks[0].status).not.toBe("pass")
    expect(items(none)).toEqual([])
  }), 600_000,
)

it.live("a dropped squawk wildcard with an explicit keeper is not-run", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    const root = yield* planted(made.path)
    const result = yield* ReviewAnalyze.run(run(made, root, ["squawk"], catalog([
      { pack: "squawk", rule: "*", status: "dropped" },
    ]))).pipe(Effect.provideService(BackendToolkit.Root, made.toolkit))
    expect(result.checks[0]).toMatchObject({ status: "not-run", reason: "wildcard-dropped", workspaceExecuted: false })
    expect(result.checks[0].status).not.toBe("pass")
    expect(items(result)).toEqual([])
  }),
)

it.live("a dropped ast-grep wildcard cannot keep a rule the host file does not author", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held()
    const root = yield* planted(made.path)
    const result = yield* ReviewAnalyze.run(run(made, root, ["ast-grep"], catalog([
      { pack: "ast-grep", rule: "*", status: "dropped" },
      { pack: "ast-grep", rule: "not-a-host-rule", status: "probation" },
    ]))).pipe(Effect.provideService(BackendToolkit.Root, made.toolkit))
    expect(result.checks[0]).toMatchObject({ status: "not-run", reason: "wildcard-dropped", workspaceExecuted: false })
    expect(result.checks[0].status).not.toBe("pass")
    expect(items(result)).toEqual([])
  }),
)

function provision(id: "gitleaks" | "ast-grep" | "squawk", root: string) {
  const engine = BackendToolkitManifest.ENGINES[id]
  return BackendToolkit.ensure(id).pipe(
    Effect.provideService(BackendToolkit.Root, root),
    Effect.provideService(BackendToolkit.Manifest, { [engine.id]: engine }),
    Effect.catch((error) => Effect.die(new Error(`conformance-missing: ${id} ${engine.version}: ${error.reason}`))),
    Effect.flatMap((ready) => ready.executable.includes(engine.version)
      ? Effect.succeed(ready)
      : Effect.die(new Error(`conformance-missing: ${id} ${engine.version}: install is not the pinned artifact`))),
  )
}

function run(
  made: { store: string },
  root: string,
  packs: string[],
  built: ReviewCatalog.Catalog,
  changed: ReviewAnalyze.RunInput["changed"] = {},
): ReviewAnalyze.RunInput {
  return {
    worktree: root, base: "base", tier: "standard", store: made.store, changed, trusted: true,
    lane: "no-build", packs, scope: "diff", catalog: built,
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

function planted(dir: string, plant: {
  base?: (root: string) => Promise<void>
  head?: (root: string) => Promise<void>
} = {}) {
  return Effect.gen(function* () {
    const root = path.join(dir, "repo")
    yield* Effect.promise(() => mkdir(root, { recursive: true }))
    yield* ResearchProcess.git(root, ["init", "-q"])
    yield* ResearchProcess.git(root, ["config", "user.email", "precision@example.com"])
    yield* ResearchProcess.git(root, ["config", "user.name", "Precision"])
    yield* Effect.promise(() => (plant.base ?? ((directory: string) => writeFile(path.join(directory, "README.md"), "benign\n")))(root))
    yield* ResearchProcess.git(root, ["add", "."])
    yield* ResearchProcess.git(root, ["commit", "-q", "-m", "base"])
    yield* ResearchProcess.git(root, ["tag", "base"])
    if (!plant.head) return root
    yield* Effect.promise(() => plant.head!(root))
    yield* ResearchProcess.git(root, ["add", "."])
    yield* ResearchProcess.git(root, ["commit", "-q", "-m", "head"])
    return root
  })
}

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

function readRaw(store: string, uri: string | undefined) {
  if (!uri) throw new Error("missing raw uri")
  return readFile(path.join(store, uri.slice("review:".length)), "utf8")
}

function sarifRules(text: string) {
  const json = JSON.parse(text) as { runs?: { results?: { ruleId?: string; rule?: { id?: string } }[] }[] }
  return (json.runs ?? []).flatMap((run) => (run.results ?? []).map((result) => result.ruleId ?? result.rule?.id).filter((id): id is string => Boolean(id)))
}

function astRules(text: string) {
  const json = JSON.parse(text) as { ruleId?: string }[]
  return json.map((row) => row.ruleId).filter((id): id is string => Boolean(id))
}

function squawkRules(text: string) {
  const json = JSON.parse(text) as { rule_name?: string }[]
  return json.map((row) => row.rule_name).filter((id): id is string => Boolean(id))
}
