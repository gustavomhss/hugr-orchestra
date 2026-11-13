import { expect, test } from "bun:test"
import path from "path"
import { mkdir, readFile, writeFile } from "fs/promises"
import { Effect, Ref } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewAnalyze } from "../../src/review-toolkit/analyze"
import { ReviewItem } from "../../src/review-toolkit/item"
import { ReviewNoise } from "../../src/review-toolkit/noise"
import { ReviewSarif } from "../../src/review-toolkit/sarif"
import { git } from "../fixture/git"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const catalog = ReviewCatalog.current
const FILE = "src/app.ts"
const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))

function entry(input: {
  pack?: string
  rule?: string
  path?: string
  line: number
  endLine?: number
  snippet?: string
  status?: ReviewItem.RuleStatus
  suppressions?: ReviewSarif.Suppression[]
}): ReviewSarif.Entry {
  const pack = input.pack ?? "opengrep"
  const rule = input.rule ?? "js.eval"
  const itemPath = input.path ?? FILE
  const digest = ReviewItem.snippetDigest(input.snippet ?? `snippet at ${input.line}`)
  return {
    item: {
      fingerprint: ReviewItem.fingerprint({ pack, rule, path: itemPath, snippetDigest: digest }),
      class: "security.boundary", lens: "security", pack, rule,
      ruleStatus: input.status ?? "probation", severity: "P2", path: itemPath, line: input.line,
      ...(input.endLine === undefined ? {} : { endLine: input.endLine }),
      snippetDigest: digest, sources: [{ pack, rule }], triage: "triage", onChangedLine: false,
    },
    suppressions: input.suppressions ?? [],
  }
}

const seen = (result: ReviewNoise.Result) => [...Object.values(result.items).flat(), ...result.retained.items, ...result.debt]
const budget = () => {
  const tier = catalog.route.tiers.find((item) => item.id === "standard")
  return catalog.route.tiers.find((item) => item.id === tier?.runs)?.budget.itemsPerLens
}

test("repository pipeline keeps an in-list finding when head equals base and changed is empty", () => {
  const finding = entry({ line: 10, snippet: "eval(req.body)" })
  const result = ReviewNoise.pipeline({ repositoryFiles: [FILE], head: [finding], base: [finding], changed: {}, tier: "standard", catalog })
  const items = Object.values(result.items).flat()
  expect(items.map((item) => item.fingerprint)).toEqual([finding.item.fingerprint])
  expect(items.every((item) => item.onChangedLine === false)).toBe(true)
  expect(items[0]?.ruleStatus).toBe(finding.item.ruleStatus)
  expect(result.debt).toEqual([])
})

test("repository mode ignores base, blast, added suppressions, accidental changed, and non-exact paths", () => {
  const kept = entry({ line: 4, snippet: "kept" })
  const result = ReviewNoise.pipeline({
    repositoryFiles: [FILE],
    head: [
      kept,
      entry({ path: "src/app.ts.bak", line: 4, snippet: "prefix" }),
      entry({ path: "src/app", line: 4, snippet: "sibling" }),
      entry({ path: "src", line: 4, snippet: "ancestor" }),
      entry({ path: "src/other.ts", line: 5, snippet: "blast-only" }),
      entry({ line: 12, snippet: "dropped", status: "dropped" }),
      entry({ line: 14, snippet: "suppressed", suppressions: [{ kind: "inSource", status: "accepted" }] }),
    ],
    base: [kept, entry({ line: 8, snippet: "base-only" })],
    changed: { [FILE]: [{ start: 1, end: 1000 }], "src/app.ts.bak": [{ start: 1, end: 9 }] },
    blastRadius: { "src/other.ts": [{ start: 1, end: 1000 }] },
    addedSuppressions: [{ path: FILE, line: 3, rule: "js.eval", snippet: "guardrail-ignore" }],
    tier: "deep", catalog,
  })
  const items = seen(result)
  expect(items.map((item) => item.fingerprint)).toEqual([kept.item.fingerprint])
  expect(items.every((item) => item.onChangedLine === false && item.lens !== ReviewNoise.CHANGE_LENS)).toBe(true)
  expect(result.debt).toEqual([])
  expect(items.some((item) => item.ruleStatus === "dropped")).toBe(false)
})

test("an empty repository file list leaks nothing", () => {
  const result = ReviewNoise.pipeline({
    repositoryFiles: [], head: [entry({ line: 2, snippet: "should not leak" })],
    changed: { [FILE]: [{ start: 1, end: 1000 }] }, tier: "standard", catalog,
  })
  expect(seen(result)).toEqual([])
  expect(result.retained.total).toBe(0)
  expect(result.debt).toEqual([])
})

test("dedup, demoted retention, caps, and status stay on the catalog path", () => {
  const cap = budget()
  expect(typeof cap).toBe("number")
  const overlapA = entry({ line: 10, endLine: 12, snippet: "overlap" })
  const overlapB = entry({ pack: "semgrep", rule: "eval-use", line: 11, snippet: "overlap" })
  const demoted = entry({ line: 30, snippet: "demoted", status: "demoted" })
  const active = entry({ line: 2, snippet: "active", status: "active" })
  const extras = Array.from({ length: cap! + 1 }, (_, index) => entry({ line: 40 + index, snippet: `cap ${index}` }))
  const result = ReviewNoise.pipeline({
    repositoryFiles: [FILE], head: [active, overlapA, overlapB, demoted, ...extras],
    changed: { [FILE]: [{ start: 1, end: 1000 }] }, tier: "standard", catalog,
  })
  const shown = Object.values(result.items).flat()
  expect(shown).toHaveLength(cap!)
  expect(shown.some((item) => item.sources.length === 2)).toBe(true)
  expect(shown.some((item) => item.ruleStatus === "active")).toBe(true)
  expect(shown.every((item) => item.onChangedLine === false && item.ruleStatus !== "demoted")).toBe(true)
  expect(result.retained.items.some((item) => item.fingerprint === demoted.item.fingerprint && item.ruleStatus === "demoted")).toBe(true)
  expect(result.retained.items.filter((item) => item.ruleStatus !== "demoted")).toHaveLength(3)
  expect(result.debt).toEqual([])
})

test("omitting repositoryFiles keeps diff debt and changed-line controls", () => {
  const finding = entry({ line: 10, snippet: "pre-existing" })
  const fresh = entry({ line: 80, snippet: "fresh" })
  const off = entry({ line: 2, snippet: "off-change" })
  const result = ReviewNoise.pipeline({
    head: [finding, fresh, off], base: [finding], changed: { [FILE]: [{ start: 10, end: 90 }] }, tier: "standard", catalog,
  })
  expect(Object.values(result.items).flat().map((item) => item.fingerprint)).toEqual([fresh.item.fingerprint])
  expect(Object.values(result.items).flat()[0]?.onChangedLine).toBe(true)
  expect(result.debt.map((item) => item.fingerprint)).toEqual([finding.item.fingerprint])
  expect(seen(result).some((item) => item.fingerprint === off.item.fingerprint)).toBe(false)
})

// This packs:[] admission seam runs no application subprocess; Git setup uses the existing allowlisted fixture.
const seat = Effect.acquireRelease(Effect.promise(async () => {
  const dir = await tmpdir()
  const root = path.join(dir.path, "repo")
  await mkdir(path.join(root, "src"), { recursive: true })
  await git(root, "init", "-q")
  await git(root, "config", "user.email", "repo@example.com")
  await git(root, "config", "user.name", "Repo")
  await writeFile(path.join(root, "src", "app.ts"), "export const a = 1\n")
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "same")
  const pointer = (await readFile(path.join(root, ".git", "HEAD"), "utf8")).trim()
  const oid = pointer.startsWith("ref: ") ? (await readFile(path.join(root, ".git", pointer.slice(5)), "utf8")).trim() : pointer
  const store = path.join(dir.path, "store")
  await mkdir(store)
  return { dir, root, oid, store }
}), (made) => Effect.promise(() => made.dir[Symbol.asyncDispose]()))

const admit = (input: ReviewAnalyze.RunInput) => Effect.gen(function* () {
  const called = yield* Ref.make(false)
  const forwarded = yield* Ref.make<ReviewNoise.Input | undefined>(undefined)
  const pipeline: typeof ReviewNoise.pipeline = (value) => {
    Effect.runSync(Ref.set(called, true))
    Effect.runSync(Ref.set(forwarded, value))
    return ReviewNoise.pipeline(value)
  }
  const verdict = yield* ReviewAnalyze.run(input, pipeline).pipe(
    Effect.match({
      onFailure: (error: unknown) => (error instanceof ReviewAnalyze.Failed ? error.reason : "other"),
      onSuccess: () => "success",
    }),
    Effect.catchCause(() => Effect.succeed("defect")),
  )
  return { verdict, called: yield* Ref.get(called), forwarded: yield* Ref.get(forwarded) }
})

it.live("analyze admits only a valid repository scope and refuses the rest before pipeline", () => Effect.gen(function* () {
  const made = yield* seat
  expect(made.oid).toMatch(/^[0-9a-f]{40}$/)
  const valid = (profile: string): ReviewAnalyze.RunInput => ({
    worktree: made.root, base: made.oid, head: made.oid, tier: "standard", profile, store: made.store,
    changed: {}, trusted: true, lane: "repo", packs: [], scope: "files", files: [FILE], repositoryFiles: [FILE],
  })
  for (const profile of ["audit", "diligence", "artifact", "compliance"]) {
    const admitted = yield* admit(valid(profile))
    expect(admitted.verdict).toBe("success")
    expect(admitted.called).toBe(true)
    expect(admitted.forwarded?.repositoryFiles).toEqual([FILE])
  }
  const wide = { ...valid("audit"), base: "a".repeat(64), head: "a".repeat(64) }
  const accepted64 = yield* admit(wide)
  expect(accepted64.verdict).toBe("success")
  expect(accepted64.forwarded?.repositoryFiles).toEqual([FILE])
  const bad: ReviewAnalyze.RunInput[] = [
    { ...valid("audit"), base: "a".repeat(39), head: "a".repeat(39) },
    { ...valid("audit"), base: "a".repeat(41), head: "a".repeat(41) },
    { ...valid("audit"), scope: "diff" },
    { ...valid("audit"), head: undefined },
    { ...valid("audit"), head: "abc" },
    { ...valid("audit"), head: made.oid.toUpperCase(), base: made.oid.toUpperCase() },
    { ...valid("audit"), base: "b".repeat(40) },
    { ...valid("audit"), profile: undefined },
    { ...valid("audit"), profile: "release" },
    { ...valid("audit"), files: [FILE, FILE] },
    { ...valid("audit"), repositoryFiles: [FILE, FILE], files: [FILE, FILE] },
    { ...valid("audit"), files: ["/etc/passwd"], repositoryFiles: ["/etc/passwd"] },
    { ...valid("audit"), files: ["C:/src/app.ts"], repositoryFiles: ["C:/src/app.ts"] },
    { ...valid("audit"), files: ["../src/app.ts"], repositoryFiles: ["../src/app.ts"] },
    { ...valid("audit"), files: ["src/../app.ts"], repositoryFiles: ["src/../app.ts"] },
    { ...valid("audit"), files: ["src/other.ts"] },
    { ...valid("audit"), changed: { [FILE]: [{ start: 1, end: 1 }] } },
    { ...valid("audit"), files: [], repositoryFiles: [] },
    { ...valid("audit"), files: ["src\\app.ts"], repositoryFiles: ["src\\app.ts"] },
    { ...valid("audit"), files: ["src//app.ts"], repositoryFiles: ["src//app.ts"] },
    { ...valid("audit"), files: ["."], repositoryFiles: ["."] },
    { ...valid("audit"), files: ["src/\0app.ts"], repositoryFiles: ["src/\0app.ts"] },
  ]
  for (const input of bad) {
    const refused = yield* admit(input)
    expect(refused.verdict).toBe("repository-scope-invalid")
    expect(refused.called).toBe(false)
  }
}))
