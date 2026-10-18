import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { CodeIndex } from "@orchestra/core/research-toolkit/code-index/types"
import { answer } from "@/tool/code-query"

const ref = (name: string, file: string, start: number, end: number): CodeIndex.SymbolRef =>
  ({ symbol: `s:${name}`, name, kind: "function", range: { path: file, startLine: start, endLine: end }, nameLine: start, exported: true })
const basis: CodeIndex.Basis = {
  basis: { commit: "0123456789abcdef", shards: [{ id: "a", language: "ts", project: "core", indexer: "scip-typescript", version: "1" }] },
  execution: { op: "x", ms: 3 },
  coverage: { documents: 10, skipped: [], languagesMissing: [], opaqueSites: 0, complete: true },
  freshness: "fresh",
  bounds: { limit: 50, truncated: false },
}

// The engine is stubbed: it records every query and answers by op.
function stub(overrides: Partial<CodeIndex.CodeQueryResult> = {}) {
  const calls: CodeIndex.CodeQuery[] = []
  const engine = {
    query: (_: string, input: CodeIndex.CodeQuery) => {
      calls.push(input)
      const base = { resolved: undefined, candidates: [], hits: [], basis }
      if (input.op === "callers") return Effect.succeed({ ...base, hits: [{ range: { path: "src/b.ts", startLine: 5, endLine: 9 }, role: "call" as const, via: ref("run", "src/b.ts", 5, 9), sites: [7, 8] }] })
      if (input.op === "imports") return Effect.succeed({ ...base, hits: [{ range: { path: "src/a.ts", startLine: 1, endLine: 1 }, role: "import" as const }] })
      return Effect.succeed({ ...base, resolved: ref("assemble", "src/a.ts", 10, 40), ...overrides })
    },
  }
  return { engine, calls }
}

describe("code_query", () => {
  test("definition answers with its callers and imports in one call", async () => {
    const { engine, calls } = stub({ hits: [{ range: { path: "src/a.ts", startLine: 10, endLine: 40 }, role: "definition" }] })
    const out = await Effect.runPromise(answer(engine, "/w", { op: "definition", name: "assemble" }))
    expect(calls.map((call) => call.op)).toEqual(["definition", "callers", "imports"])
    expect(out).toContain("definition: assemble function exported src/a.ts:10-40")
    expect(out).toContain("src/b.ts:5-9 call in run lines 7,8")
    expect(out).toContain("imports of src/a.ts")
    expect(out).toContain("basis: commit 0123456789ab")
  })

  test("an ambiguous name lists candidates and runs no follow-up", async () => {
    const { engine, calls } = stub({ resolved: undefined, candidates: [ref("a", "x.ts", 1, 2), ref("a", "y.ts", 3, 4)] })
    const out = await Effect.runPromise(answer(engine, "/w", { op: "definition", name: "a" }))
    expect(calls).toHaveLength(1)
    expect(out).toContain("ambiguous, 2 candidates")
    expect(out).toContain("id=s:a")
  })

  test("incomplete coverage and truncation stay visible, and next is the page cursor", async () => {
    const { engine } = stub({ next: 50, basis: { ...basis, freshness: "stale",
      coverage: { ...basis.coverage, complete: false, skipped: [{ path: "src/c.ts", reason: "changed-since-index" }] },
      bounds: { limit: 50, truncated: true } } })
    const out = await Effect.runPromise(answer(engine, "/w", { op: "references", name: "assemble" }))
    expect(out).toContain("next: offset=50")
    expect(out).toContain("INCOMPLETE")
    expect(out).toContain("src/c.ts (changed-since-index)")
    expect(out).toContain("TRUNCATED")
    expect(out).toContain("stale")
  })

  test("a path outside the worktree fails reference_invalid before the engine runs", async () => {
    const { engine, calls } = stub()
    for (const input of [{ op: "imports" as const, path: "../secret.ts" }, { op: "symbols" as const, path: "/etc/passwd" }]) {
      const exit = await Effect.runPromise(answer(engine, "/w", input).pipe(Effect.flip))
      expect(exit.code).toBe("reference_invalid")
    }
    expect(calls).toHaveLength(0)
  })

  test("an absolute path inside the worktree reaches the engine relative", async () => {
    const { engine, calls } = stub()
    await Effect.runPromise(answer(engine, "/w", { op: "imports", path: "/w/src/a.ts" }))
    expect(calls[0]).toMatchObject({ op: "imports", path: "src/a.ts" })
  })
})
