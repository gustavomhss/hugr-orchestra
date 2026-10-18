import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Research } from "@orchestra/schema/research"
import { CodeIndex } from "../src/research-toolkit/code-index/types"
import { Locate } from "../src/research-toolkit/locate"

// L1 (search) and X3 (index query) are stubbed by their frozen J2/J3 result types.

const basis = (over: Partial<CodeIndex.Basis> = {}): CodeIndex.Basis => ({
  basis: { commit: "c0ffee", shards: [] },
  execution: { op: "test", ms: 0 },
  coverage: { documents: 3, skipped: [], languagesMissing: [], opaqueSites: 0, complete: true },
  freshness: "fresh",
  bounds: { limit: 50, truncated: false },
  ...over,
})

const FILES: Record<string, string> = {
  "src/assemble.ts": ["import { x } from './x'", "", "export function assemble() {", "  return citationCheck(x)", "}", ""].join("\n"),
  "src/check.ts": ["export function citationCheck(x: number) {", "  return x", "}"].join("\n"),
  "src/use.ts": ["import { assemble } from './assemble'", "assemble()"].join("\n"),
}

const assemble: CodeIndex.SymbolRef = {
  symbol: "s assemble", name: "assemble", kind: "function", nameLine: 3, exported: true,
  range: { path: "src/assemble.ts", startLine: 3, endLine: 5 },
}

const empty = (): CodeIndex.CodeQueryResult => ({ resolved: undefined, candidates: [], hits: [], basis: basis() })

// Locate passes the ref through untouched, so its shape is opaque here.
const REF = { artifact: { id: "art_locate" }, representation: "text", digest: "sha256:0" } as unknown as Research.SourceRef

function sources(over: Partial<Locate.Sources> = {}, files: Record<string, string> = FILES) {
  const calls = { search: [] as CodeIndex.SearchInput[], query: [] as CodeIndex.CodeQuery[], retained: [] as string[] }
  const value: Locate.Sources = {
    search: (input) => Effect.sync(() => {
      calls.search.push(input)
      const matches = Object.entries(files).flatMap(([path, text]) => text.split("\n").flatMap((line, index) => {
        const found = input.caseSensitive ? line.includes(input.pattern) : line.toLowerCase().includes(input.pattern.toLowerCase())
        return found ? [{ path, line: index + 1, text: line }] : []
      }))
      return { matches, basis: basis() }
    }),
    query: (query) => Effect.sync(() => {
      calls.query.push(query)
      if (query.op === "map")
        return { ...empty(), hits: Object.keys(files).map((path) => ({ range: { path, startLine: 1, endLine: 1 }, role: "definition" as const })) }
      if (query.op === "definition" && query.name === "assemble") return { ...empty(), resolved: assemble }
      if (query.op === "importers" && query.path === "src/assemble.ts")
        return { ...empty(), hits: [{ range: { path: "src/use.ts", startLine: 1, endLine: 1 }, role: "import" as const }] }
      return empty()
    }),
    read: (path) => Effect.succeed(files[path]),
    retain: (snapshot) => Effect.sync(() => {
      calls.retained.push(snapshot)
      return REF
    }),
    ...over,
  }
  return { value, calls }
}

const run = (input: CodeIndex.LocateInput, value: Locate.Sources) => Effect.runPromise(Locate.run(input, value))

describe("code_locate", () => {
  test("fuses a definition and a lexical hit inside it into one verified range", async () => {
    const fake = sources()
    const result = await run({ symbols: ["assemble"], terms: ["citationCheck"] }, fake.value)
    const top = result.ranges.find((range) => range.path === "src/assemble.ts")
    expect(top).toMatchObject({ startLine: 3, endLine: 5, symbol: "assemble" })
    expect(top?.why).toEqual(expect.arrayContaining(["def:assemble", "rg:citationCheck"]))
    expect(result.ranges[0].path).toBe("src/assemble.ts")
    expect(result.ranges.some((range) => range.path === "src/use.ts" && range.why.includes("importer-of:src/assemble.ts"))).toBe(true)
    expect(result.searches.map((search) => search.kind)).toEqual(expect.arrayContaining(["definition", "lexical", "lexical-wide", "neighbors"]))
    expect(result.evidence).toBe(REF)
    expect(result.basis.coverage.discarded).toBe(0)
    expect(result.basis.execution.semantic).toBe("absent")
    expect(fake.calls.retained[0]).toContain("==> src/assemble.ts:3-5")
    expect(fake.calls.retained[0]).toContain("4:   return citationCheck(x)")
  })

  test("drops a range whose hit no longer matches the current file and counts it", async () => {
    const stale = { ...FILES, "src/check.ts": ["export function renamed(x: number) {", "  return x", "}"].join("\n") }
    const result = await run({ terms: ["citationCheck"] }, sources({ read: (path) => Effect.succeed(stale[path]) }).value)
    expect(result.ranges.some((range) => range.path === "src/check.ts")).toBe(false)
    expect(result.basis.coverage.discarded).toBeGreaterThan(0)
  })

  test("drops a definition whose name is not on its declared line", async () => {
    const moved = { ...FILES, "src/assemble.ts": ["", "", "", "export function assemble() {", "}"].join("\n") }
    const fake = sources({ read: (path) => Effect.succeed(moved[path]), search: () => Effect.succeed({ matches: [], basis: basis() }) })
    const result = await run({ symbols: ["assemble"] }, fake.value)
    expect(result.ranges.some((range) => range.symbol === "assemble")).toBe(false)
    expect(result.basis.coverage.discarded).toBeGreaterThan(0)
  })

  test("runs at most 32 searches per call", async () => {
    const fake = sources()
    const names = Array.from({ length: 16 }, (_, index) => `name${index}`)
    const result = await run({ terms: names, symbols: names.map((name) => `Sym${name}`) }, fake.value)
    expect(fake.calls.search.length + fake.calls.query.length).toBeLessThanOrEqual(Locate.MAX_SEARCHES)
    expect(result.searches.length + 1).toBeLessThanOrEqual(Locate.MAX_SEARCHES)
    expect(result.searches.length).toBeGreaterThan(16)
  })

  test("without an index runs the lexical lists only and declares the languages it reached", async () => {
    const result = await run({ symbols: ["assemble"] }, sources({ query: undefined }).value)
    expect(new Set(result.searches.map((search) => search.kind))).toEqual(new Set(["lexical", "lexical-wide"]))
    expect(result.ranges.some((range) => range.path === "src/assemble.ts" && range.startLine <= 3 && 3 <= range.endLine)).toBe(true)
    expect(result.basis.freshness).toBe("fresh")
    expect(result.basis.coverage.languagesMissing).toContain("ts")
    expect(result.basis.coverage.complete).toBe(false)
  })

  test("an index still building degrades to the lexical lists", async () => {
    const fake = sources({ query: () => Effect.fail(new Research.Error({ code: "index_building", message: "building" })) })
    const result = await run({ terms: ["assemble"] }, fake.value)
    expect(result.searches.every((search) => search.kind.startsWith("lexical"))).toBe(true)
    expect(result.ranges.length).toBeGreaterThan(0)
  })

  test("fails with index_unavailable when ripgrep is unavailable", async () => {
    const fake = sources({ search: () => Effect.fail(new Research.Error({ code: "index_unavailable", message: "no ripgrep" })) })
    expect((await Effect.runPromise(Effect.flip(Locate.run({ terms: ["assemble"] }, fake.value)))).code).toBe("index_unavailable")
  })

  test("refuses a call with no question, terms or symbols", async () => {
    expect((await Effect.runPromise(Effect.flip(Locate.run({ paths: ["src/**"] }, sources().value)))).code).toBe("unsupported")
  })

  test("keeps at most 3 ranges per file and honours limit", async () => {
    const many: Record<string, string> = { "src/a.ts": Array.from({ length: 80 }, (_, index) => index % 10 === 0 ? "needle" : "x").join("\n") }
    const fake = sources({ query: undefined }, many)
    expect((await run({ terms: ["needle"] }, fake.value)).ranges.length).toBe(3)
    expect((await run({ terms: ["needle"], limit: 2 }, fake.value)).ranges.length).toBe(2)
  })

  test("extracts identifiers, paths, quoted strings and content words from a question", () => {
    const terms = Locate.extract('Where does citationCheck in O/maestro/discovery-result.ts handle "retained source" and max_bytes for read-dedup?')
    expect(terms).toEqual(expect.arrayContaining(["citationCheck", "O/maestro/discovery-result.ts", "retained source", "max_bytes", "read-dedup", "handle"]))
    expect(terms).not.toContain("does")
    expect(terms).not.toContain("Where")
  })
})
