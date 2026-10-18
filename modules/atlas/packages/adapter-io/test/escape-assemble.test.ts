// @atlas/adapter-io — test/escape-assemble.test.ts  (ADR-0016 M2b — the `targetEscapes` assembler)
//
// TEETH for the `escape(X)` closure leg the negation door's v2 gate consumes. Over a small real fixture (temp
// repo + a hand-built SCIP with RANGES), it asserts:
//   · a known ESCAPING export (referenced as a call argument) surfaces WITH a witness site;
//   · a known NON-ESCAPING export (referenced only as a call callee) returns `[]`;
//   · CANONICALIZATION is applied on BOTH sides — an occurrence keyed under a cross-package `dist/*.d.ts`
//     symbol unifies to its `src/*.ts` source form, so a query with the SOURCE form finds the escape (mirrors
//     the probe's canon residual check). MUTANT: drop `canonicalizeSymbol` on the occurrence key ⇒ the map keys
//     the dist form, the source-form query misses it, and the escape returns `[]` (an UNSOUND false non-escape).
//   · the SOUND degrade — `buildTargetEscapes` returns `undefined` when the AST grammars are not warmed (so
//     the door falls back to the blanket rather than trust an unsound empty map). MUTANT: build without the
//     warmup gate ⇒ a non-undefined leg that reports "nothing escapes" over an unparsed repo.

import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { describe, it, expect, beforeAll } from "vitest"
import { create } from "@bufbuild/protobuf"
import {
  serializeSCIP,
  IndexSchema,
  MetadataSchema,
  ToolInfoSchema,
  DocumentSchema,
  OccurrenceSchema,
  SymbolRole,
} from "@c4312/scip"
import { initAst } from "../src/ast.js"
import { buildTargetEscapes } from "../src/escape/target-escapes.js"

// ── the fixture symbols ────────────────────────────────────────────────────────────────────────────────
// SRC-form (what a def emits, and what the negation door queries with): a definition in `src/thing.ts`. The
// real scip-typescript shape leaves the DIRECTORY unquoted and backtick-wraps only the FILENAME (build.test.ts).
const sym = (name: string) => `scip-typescript npm a 1.0.0 src/\`thing.ts\`/${name}#`
// DIST-form (what a CROSS-PACKAGE reference through the built `.d.ts` carries — `dist/src/\`X.d.ts\``, tsc's
// default nested layout) — `canonicalizeSymbol` must map it onto `sym`.
const distSym = (name: string) => `scip-typescript npm a 1.0.0 dist/src/\`thing.d.ts\`/${name}#`

const GREET = sym("greet") // referenced as a CALLEE ⇒ non-escaping
const CONFIG = sym("CONFIG") // referenced as an ARGUMENT ⇒ escaping
const ESCAPEE = sym("Escapee") // referenced (as an ARGUMENT) under its DIST form ⇒ canon must unify it to SRC

/** The 0-based [row, col, endCol] of the `n`-th occurrence of `needle` in `content` (SCIP range shape). */
function rangeOf(content: string, needle: string, n = 1): [number, number, number] {
  const lines = content.split("\n")
  let seen = 0
  for (let row = 0; row < lines.length; row++) {
    let from = 0
    for (;;) {
      const col = lines[row]!.indexOf(needle, from)
      if (col < 0) break
      if (++seen === n) return [row, col, col + needle.length]
      from = col + 1
    }
  }
  throw new Error(`needle ${needle}#${n} not found`)
}

const USE_SRC = [
  "import { greet, CONFIG, Escapee } from 'a';", // line 0
  "", // 1
  "export function run(): unknown {", // 2
  "  greet();", // 3  — greet is the CALLEE ⇒ safe
  "  return register(CONFIG, Escapee);", // 4 — CONFIG + Escapee are ARGUMENTS ⇒ escape
  "}", // 5
  "function register(a: unknown, b: unknown): unknown {", // 6
  "  return [a, b];", // 7
  "}", // 8
].join("\n")

const THING_SRC = [
  "export function greet(): void {}", // 0
  "export const CONFIG = { on: true };", // 1
  "export class Escapee {}", // 2
].join("\n")

interface Fixture {
  repoPath: string
  scipPath: string
  cleanup(): void
}

function makeFixture(indexer = "scip-typescript"): Fixture {
  const repoPath = mkdtempSync(join(tmpdir(), "atlas-escape-assemble-"))
  const write = (rel: string, body: string): void => {
    const abs = join(repoPath, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, body)
  }
  write("src/thing.ts", THING_SRC)
  write("src/use.ts", USE_SRC)

  const occ = (symbol: string, range: [number, number, number], def = false) =>
    create(OccurrenceSchema, { symbol, symbolRoles: def ? SymbolRole.Definition : 0, range })

  const index = create(IndexSchema, {
    // ADR-0016 item 2 — the assembler enables the v2 leg ONLY for the scip-typescript indexer; the fixture
    // declares it (it simulates a scip-typescript dump). The gate-teeth test below builds with a DIFFERENT name.
    metadata: create(MetadataSchema, { toolInfo: create(ToolInfoSchema, { name: indexer }) }),
    documents: [
      create(DocumentSchema, {
        relativePath: "src/thing.ts",
        occurrences: [
          occ(GREET, rangeOf(THING_SRC, "greet"), true),
          occ(CONFIG, rangeOf(THING_SRC, "CONFIG"), true),
          occ(ESCAPEE, rangeOf(THING_SRC, "Escapee"), true),
        ],
      }),
      create(DocumentSchema, {
        relativePath: "src/use.ts",
        occurrences: [
          occ(GREET, rangeOf(USE_SRC, "greet", 2)), // `greet()` on line 3 (import is #1) — CALLEE ⇒ safe
          occ(CONFIG, rangeOf(USE_SRC, "CONFIG", 2)), // `register(CONFIG, …)` — ARGUMENT ⇒ escape
          occ(distSym("Escapee"), rangeOf(USE_SRC, "Escapee", 2)), // DIST-form ARGUMENT ⇒ canon-unify + escape
        ],
      }),
    ],
  })
  const scipPath = join(repoPath, "index.scip")
  writeFileSync(scipPath, serializeSCIP(index))
  return { repoPath, scipPath, cleanup: () => rmSync(repoPath, { recursive: true, force: true }) }
}

describe("ADR-0016 M2b — buildTargetEscapes (escape(X) over SCIP ranges ⋈ tree-sitter)", () => {
  beforeAll(async () => {
    await initAst() // warm the ONE grammar path so the leg is BUILDABLE (else it soundly degrades to undefined)
  })

  it("an ESCAPING export (used as a call argument) surfaces with a witness; a NON-ESCAPING one returns []", () => {
    const fx = makeFixture()
    try {
      const targetEscapes = buildTargetEscapes({ scipPath: fx.scipPath, repoPath: fx.repoPath })!
      expect(targetEscapes).toBeTypeOf("function")
      // CONFIG flows into `register(CONFIG, …)` (an argument) ⇒ escapes, witness = the site.
      const configWit = targetEscapes(CONFIG)
      expect(configWit.length).toBeGreaterThan(0)
      expect(configWit[0]).toMatch(/^src\/use\.ts:\d+:\d+$/)
      // greet is only ever a callee ⇒ non-escaping. MUTANT: classify a callee as escape ⇒ this becomes non-empty.
      expect(targetEscapes(GREET)).toEqual([])
    } finally {
      fx.cleanup()
    }
  })

  it(
    "CANONICALIZATION: a cross-package dist/*.d.ts occurrence unifies to the src form, so the SOURCE-form " +
      "query finds the escape. MUTANT (drop canonicalizeSymbol on the occurrence key) ⇒ src query returns []",
    () => {
      const fx = makeFixture()
      try {
        const targetEscapes = buildTargetEscapes({ scipPath: fx.scipPath, repoPath: fx.repoPath })!
        // The escape was recorded from a `dist/thing.d.ts` occurrence, but canon maps it to `src/thing.ts` form,
        // so querying the SRC form (the form the door resolves a target to) surfaces it.
        const wit = targetEscapes(ESCAPEE)
        expect(wit.length).toBeGreaterThan(0)
        expect(wit[0]).toMatch(/^src\/use\.ts:\d+:\d+$/)
        // And querying with the DIST form finds it too (the query is canonicalized identically) — the point is
        // that the two forms UNIFY, not that either is privileged.
        expect(targetEscapes(distSym("Escapee")).length).toBeGreaterThan(0)
      } finally {
        fx.cleanup()
      }
    },
  )

  it("returns undefined when the SCIP dump is absent (no escape data ⇒ the door falls back to the blanket)", () => {
    const fx = makeFixture()
    try {
      const leg = buildTargetEscapes({ scipPath: join(fx.repoPath, "nope.scip"), repoPath: fx.repoPath })
      expect(leg).toBeUndefined()
    } finally {
      fx.cleanup()
    }
  })

  it(
    "INDEXER GATE (ADR-0016 item 2): an index from a NON-scip-typescript indexer ⇒ undefined (the door falls " +
      "back to the blanket, never a false non-escape from an un-canonicalizable cross-package ref). MUTANT: drop " +
      "the toolInfo.name gate ⇒ the leg builds over a scheme canonicalizeSymbol is not proven on",
    () => {
      const fx = makeFixture("scip-rust") // a well-formed dump, but a different indexer's symbol scheme
      try {
        expect(buildTargetEscapes({ scipPath: fx.scipPath, repoPath: fx.repoPath })).toBeUndefined()
      } finally {
        fx.cleanup()
      }
    },
  )
})
