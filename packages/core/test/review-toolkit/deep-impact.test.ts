import { expect, test } from "bun:test"
import { Effect } from "effect"
import { Research } from "@orchestra/schema/research"
import type { CodeIndex } from "../../src/research-toolkit/code-index/types"
import { ReviewImpact } from "../../src/review-toolkit/impact"

const commit = "a".repeat(40)
const symbol: CodeIndex.SymbolRef = { symbol: "scip pkg changed().", name: "changed", kind: "function", range: { path: "src/a.ts", startLine: 1, endLine: 10 }, nameLine: 1, exported: true }
const unchanged: CodeIndex.SymbolRef = { ...symbol, symbol: "scip pkg unchanged().", name: "unchanged", range: { path: "src/a.ts", startLine: 20, endLine: 30 } }
const caller: CodeIndex.Hit = { role: "call", range: { path: "src/caller.ts", startLine: 40, endLine: 44 } }
const input = { worktree: "/review", commit, changed: { "src/a.ts": [{ start: 5, end: 6 }, { start: 7, end: 8 }] } }

function response(values: Partial<CodeIndex.CodeQueryResult> = {}): CodeIndex.CodeQueryResult {
  return {
    resolved: undefined, candidates: [], hits: [],
    basis: {
      basis: { commit, shards: [{ id: "ts", language: "js-ts", project: ".", indexer: "scip-typescript", version: "fixture" }] },
      execution: { op: "fixture", ms: 0 },
      coverage: { documents: 3, skipped: [], languagesMissing: [], opaqueSites: 0, complete: true },
      freshness: "fresh", bounds: { limit: 200, truncated: false },
    },
    ...values,
  }
}
const outline = response({ hits: [symbol, unchanged].map((via) => ({ role: "definition", range: via.range, via })) })
const callers = response({ resolved: symbol, hits: [caller, caller, { role: "reference", range: { path: "src/module.ts", startLine: 9, endLine: 9 } }] })

test("host collector resolves only changed symbols, deduplicates and orders caller ranges", async () => {
  const calls: CodeIndex.CodeQuery[] = []
  const result = await Effect.runPromise(ReviewImpact.collect(input, (root, query) => {
    expect(root).toBe("/review")
    calls.push(query)
    return Effect.succeed(query.op === "symbols" ? outline : callers)
  }))
  expect(calls).toEqual([{ op: "symbols", path: "src/a.ts", limit: 200 }, { op: "callers", symbol: symbol.symbol, path: "src/a.ts", limit: 200 }])
  expect(result).toEqual({ status: "pass", queries: 2, ranges: { "src/caller.ts": [{ start: 40, end: 44 }], "src/module.ts": [{ start: 9, end: 9 }] } })
})

test("both outline and caller answers require fresh complete unambiguous revision-bound evidence", async () => {
  const good = response()
  const bad: CodeIndex.CodeQueryResult[] = [
    { ...good, basis: { ...good.basis, freshness: "stale" } },
    { ...good, basis: { ...good.basis, freshness: "dirty-overlay" } },
    { ...good, basis: { ...good.basis, basis: { ...good.basis.basis, commit: "b".repeat(40) } } },
    { ...good, basis: { ...good.basis, basis: { ...good.basis.basis, dirtyDigest: "dirty" } } },
    { ...good, basis: { ...good.basis, coverage: { ...good.basis.coverage, complete: false } } },
    { ...good, basis: { ...good.basis, coverage: { ...good.basis.coverage, opaqueSites: 1 } } },
    { ...good, basis: { ...good.basis, coverage: { ...good.basis.coverage, skipped: [{ path: "src/skipped.ts", reason: "unsupported" }] } } },
    { ...good, basis: { ...good.basis, coverage: { ...good.basis.coverage, languagesMissing: ["python"] } } },
    { ...good, basis: { ...good.basis, bounds: { limit: 200, truncated: true } } },
    { ...good, next: 200 },
  ]
  for (const phase of ["symbols", "callers"]) {
    for (const invalid of bad) {
      const result = await Effect.runPromise(ReviewImpact.collect(input, (_, query) => Effect.succeed(query.op === phase
        ? { ...(phase === "symbols" ? outline : callers), basis: invalid.basis, ...(invalid.next === undefined ? {} : { next: invalid.next }) }
        : query.op === "symbols" ? outline : callers)))
      expect(result.status).toBe("not-run")
      expect(result.ranges).toEqual({})
      expect(result.reason).toStartWith("index-")
    }
  }
  const ambiguous = await Effect.runPromise(ReviewImpact.collect(input, (_, query) => Effect.succeed(query.op === "symbols" ? outline : response({ candidates: [symbol, unchanged], hits: [caller] }))))
  expect(ambiguous).toMatchObject({ status: "not-run", ranges: {}, reason: "index-ambiguous" })
  const unresolved = await Effect.runPromise(ReviewImpact.collect(input, (_, query) => Effect.succeed(query.op === "symbols" ? outline : response({ hits: [caller] }))))
  expect(unresolved).toMatchObject({ status: "not-run", ranges: {}, reason: "index-unresolved" })
  const failed = await Effect.runPromise(ReviewImpact.collect(input, (_, query) => query.op === "symbols" ? Effect.succeed(outline) : Effect.fail(new Research.Error({ code: "reference_invalid", message: "invalid" }))))
  expect(failed).toMatchObject({ status: "not-run", ranges: {}, reason: "index-reference-invalid" })
  const absent = await Effect.runPromise(ReviewImpact.collect(input, () => Effect.fail(new Research.Error({ code: "index_unavailable", message: "absent" }))))
  expect(absent).toMatchObject({ status: "not-run", ranges: {}, reason: "index-unavailable" })
})

test("unsafe, opaque and invalid caller ranges cannot broaden the review", async () => {
  const invalid: CodeIndex.Hit[] = [
    { ...caller, opaque: true },
    { ...caller, range: { ...caller.range, path: "../outside.ts" } },
    { ...caller, range: { ...caller.range, path: "src/../outside.ts" } },
    { ...caller, range: { ...caller.range, path: "/absolute.ts" } },
    { ...caller, range: { ...caller.range, path: "src\\outside.ts" } },
    { ...caller, range: { ...caller.range, startLine: 0 } },
    { ...caller, range: { ...caller.range, startLine: 44, endLine: 40 } },
    { ...caller, range: { ...caller.range, endLine: Number.MAX_SAFE_INTEGER + 1 } },
    { ...caller, role: "import" },
    { ...caller, role: "write" },
  ]
  for (const hit of invalid) {
    const result = await Effect.runPromise(ReviewImpact.collect(input, (_, query) => Effect.succeed(query.op === "symbols" ? outline : response({ resolved: symbol, hits: [caller, hit] }))))
    expect(result.status).toBe("not-run")
    expect(result.ranges).toEqual({})
    expect(result.queries).toBe(2)
  }
})

test("host budgets fail closed and non-source files require no index query", async () => {
  const scope = { ...input, changed: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`src/${i}.ts`, [{ start: 1, end: 1 }]])) }
  const over = await Effect.runPromise(ReviewImpact.collect(scope, () => Effect.die("budget must stop before query")))
  expect(over).toEqual({ status: "not-run", ranges: {}, queries: 0, reason: "impact-budget" })
  const many = response({ hits: Array.from({ length: 33 }, (_, i) => ({ role: "definition" as const, range: symbol.range, via: { ...symbol, symbol: `symbol${i}` } })) })
  const symbols = await Effect.runPromise(ReviewImpact.collect(input, () => Effect.succeed(many)))
  expect(symbols).toEqual({ status: "not-run", ranges: {}, queries: 1, reason: "impact-budget" })
  const none = await Effect.runPromise(ReviewImpact.collect({ ...input, changed: { "README.md": [{ start: 1, end: 2 }] } }, () => Effect.die("no source must not query")))
  expect(none).toEqual({ status: "pass", ranges: {}, queries: 0 })
})


test("global hit budget counts across symbols and target identity must match", async () => {
  for (const resolved of [unchanged, { ...symbol, range: { ...symbol.range, path: "src/other.ts" } }]) {
    const result = await Effect.runPromise(ReviewImpact.collect(input, (_, query) => Effect.succeed(query.op === "symbols" ? outline : response({ resolved, hits: [caller] }))))
    expect(result).toMatchObject({ status: "not-run", ranges: {}, reason: "index-ambiguous" })
  }
  const second = { ...symbol, symbol: "scip pkg second()." }
  const both = response({ hits: [symbol, second].map((via) => ({ role: "definition", range: via.range, via })) })
  const result = await Effect.runPromise(ReviewImpact.collect(input, (_, query) => Effect.succeed(query.op === "symbols" ? both : response({ resolved: query.op === "callers" && query.symbol === second.symbol ? second : symbol, hits: Array.from({ length: 101 }, () => caller) }))))
  expect(result).toEqual({ status: "not-run", ranges: {}, queries: 3, reason: "impact-budget" })
})

test("source order, overlap edges, symbol-path dedup and range ordering are deterministic", async () => {
  const at = (startLine: number, endLine: number) => ({ ...symbol, range: { ...symbol.range, startLine, endLine } })
  const lower = at(1, 5)
  const upper = { ...at(8, 12), symbol: "scip pkg upper()." }
  const outside = { ...at(9, 12), symbol: "scip pkg outside()." }
  const twin = { ...symbol, range: { ...symbol.range, path: "src/z.ts" } }
  const calls: CodeIndex.CodeQuery[] = []
  const run = (bad: boolean) => Effect.runPromise(ReviewImpact.collect({ ...input, changed: { "src/z.ts": [{ start: 5, end: 8 }], ...input.changed } }, (_, query) => {
    calls.push(query)
    if (query.op === "symbols") return Effect.succeed(response({ hits: (query.path === "src/a.ts" ? [lower, lower, upper, outside] : [twin]).map((via) => ({ role: "definition", range: via.range, via })) }))
    const resolved = query.op === "callers" && query.path === "src/z.ts" ? twin : query.op === "callers" && query.symbol === upper.symbol ? upper : lower
    return Effect.succeed(response({ resolved, hits: bad && resolved === twin ? [{ ...caller, opaque: true }] : [caller, { ...caller, range: { ...caller.range, startLine: 2, endLine: 3 } }, caller] }))
  }))
  const result = await run(false)
  expect(calls.filter((query) => query.op === "symbols").map((query) => query.path)).toEqual(["src/a.ts", "src/z.ts"])
  expect(calls.flatMap((query) => query.op === "callers" ? [[query.symbol, query.path]] : [])).toEqual([[symbol.symbol, "src/a.ts"], [upper.symbol, "src/a.ts"], [symbol.symbol, "src/z.ts"]])
  expect(result).toEqual({ status: "pass", queries: 5, ranges: { "src/caller.ts": [{ start: 2, end: 3 }, { start: 40, end: 44 }] } })
  expect(await run(true)).toMatchObject({ status: "not-run", ranges: {} })
})


test("exact budgets admit 200 hits and deduplicated symbols but refuse 201", async () => {
  const duplicate = response({ hits: Array.from({ length: 33 }, () => ({ role: "definition" as const, range: symbol.range, via: symbol })) })
  const dedup = await Effect.runPromise(ReviewImpact.collect(input, (_, query) => Effect.succeed(query.op === "symbols" ? duplicate : callers)))
  expect(dedup.status).toBe("pass")
  expect(dedup.queries).toBe(2)
  for (const count of [200, 201]) {
    const result = await Effect.runPromise(ReviewImpact.collect(input, (_, query) => Effect.succeed(query.op === "symbols" ? outline : response({ resolved: symbol, hits: Array.from({ length: count }, () => caller) }))))
    expect(result.status).toBe(count === 200 ? "pass" : "not-run")
    expect(result.ranges).toEqual(count === 200 ? { "src/caller.ts": [{ start: 40, end: 44 }] } : {})
  }
})


test("reusing a collector Effect keeps independent query budgets", async () => {
  const effect = ReviewImpact.collect(input, (_, query) => Effect.succeed(query.op === "symbols" ? outline : callers))
  const results = await Effect.runPromise(Effect.all([effect, effect], { concurrency: "unbounded" }))
  expect(results.map((result) => [result.status, result.queries])).toEqual([["pass", 2], ["pass", 2]])
})


test("caller file names cannot collide with object prototypes", async () => {
  const result = await Effect.runPromise(ReviewImpact.collect(input, (_, query) => Effect.succeed(query.op === "symbols" ? outline : response({ resolved: symbol, hits: [{ ...caller, range: { ...caller.range, path: "__proto__" } }] }))))
  expect(result.status).toBe("pass")
  expect(Object.keys(result.ranges)).toEqual(["__proto__"])
  expect(Object.getOwnPropertyDescriptor(result.ranges, "__proto__")?.value).toEqual([{ start: 40, end: 44 }])
})
