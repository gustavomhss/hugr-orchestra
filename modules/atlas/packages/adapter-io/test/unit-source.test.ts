// @atlas/adapter-io — test/unit-source.test.ts  (#182 S2/S3 — the reader and the span narrow to the UNIT)
//
// WHAT WAS WRONG. `createFileSourceReader` reads the WHOLE FILE for every anchor, including a `symbol` one.
// `PromptFactory.evidenceSpan` then mints `mintSpan(bytes, 0, bytes.length)` over whatever the reader
// returned, so a `symbol` site's "evidence" was the entire module. `prompt.ts` said so honestly in its own
// prose — and that honesty was the blocker on emitting sub-file sites at all, because a claim true of the
// file would have been attributed to the symbol.
//
// THE FIX IS STRUCTURAL, NOT DOCUMENTARY, and these cases are written to tell the difference. The unit
// reader re-runs `foldAstUnits` — the SAME function, over the SAME file bytes — and returns the `content`
// of the node whose path IS the site's `qualifiedPath`. It therefore CANNOT return more than the unit: the
// unit's bytes are the only thing it holds. The span shape is untouched (`mintSpan(bytes, 0, bytes.length)`
// — S3 changes what `bytes` ARE, not how they are addressed), which is why no offset conversion appears
// anywhere: units of position are never transported across a boundary here, only bytes.
//
// ASSERTIONS ARE EXACT VALUES, never substrings and never lengths. `toContain` cannot tell a unit's bytes
// from the file that contains them — the containment is precisely what is under test — and a length can be
// equal by accident. `contentHash` is compared against the digest recomputed from the exact expected bytes
// through the SAME `defaultEncoder` seam the product uses.

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { asSubtreeHash, defaultEncoder } from "@atlas/kernel"
import { bindSpan } from "@atlas/grounding"
import type { StructRef } from "@atlas/contracts"
import type { Candidate, MinedSignals } from "@atlas/genesis"

import { initAst } from "../src/ast.js"
import { createPromptFactory, PromptError, createFileSourceReader } from "../src/prompt.js"
import { createUnitSourceReader } from "../src/unit-source.js"

// The fold is a total NO-OP until the grammar is warmed, so without this every case below would pass
// vacuously by refusing everything. (`ast.test.ts` pins that no-op property itself.)
beforeAll(async () => {
  await initAst()
}, 60_000)

const repos: string[] = []
afterEach(() => {
  while (repos.length > 0) rmSync(repos.pop()!, { recursive: true, force: true })
})

function repoWith(files: Readonly<Record<string, string>>): string {
  const d = mkdtempSync(join(tmpdir(), "atlas-unitsrc-"))
  repos.push(d)
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(d, rel)
    mkdirSync(join(abs, ".."), { recursive: true })
    writeFileSync(abs, body)
  }
  return d
}

const NO_SIGNALS: MinedSignals = { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] }
const siteAt = (qualifiedPath: string, kind: StructRef["kind"] = "symbol"): StructRef => ({
  kind,
  qualifiedPath,
  subtreeHash: asSubtreeHash("st-unit-fixture"),
})
const candAt = (qualifiedPath: string, kind: StructRef["kind"] = "symbol"): Candidate => ({
  site: siteAt(qualifiedPath, kind),
  signals: NO_SIGNALS,
  ppr: 0,
  rank: 1,
})

/**
 * The digest of exactly these bytes, through the SAME seam `evidenceSpan` mints through (GROUND-10).
 *
 * `0, bytes.length` — NOT `0, 1`, which is what this was and which is a vacuity trap rather than a style
 * point: `mintSpan` REFUSES a boundary that splits a code point, so with `end = 1` any text whose first
 * character is multi-byte mints `undefined`, `String(undefined?.contentHash)` is the literal `'undefined'`,
 * and `expect(String(span?.contentHash)).toBe(digestOf(x))` then passes by comparing `'undefined'` to
 * `'undefined'` — i.e. an assertion that a span was NOT minted, wearing the shape of one that it was. Every
 * fixture here happens to lead with ASCII, so the trap is not live today; the multi-byte case below is one
 * fixture edit away from making it live, and that case is the one whose entire purpose is the hazard.
 */
const digestOf = (text: string): string => {
  const bytes = new TextEncoder().encode(text)
  const span = bindSpan(defaultEncoder).mintSpan(bytes, 0, bytes.length)
  if (span === undefined) throw new Error(`the fixture bytes could not be spanned: ${JSON.stringify(text)}`)
  return String(span.contentHash)
}

// ── the corpus ────────────────────────────────────────────────────────────────────────────────────────
// One exported function holding one closure, plus a second declaration, so a UNIT is a strict subset of
// its FILE and a BLOCK is a strict subset of its ITEM. The `::` addresses are the ones `ast.ts` `unitPath`
// mints; they are written out literally so a change to the minting rule fails here loudly rather than
// being tracked by a helper that recomputes them the same way the producer does.
const CHARGE = "function charge(): number {\n  const apply = (n: number): number => n * 2;\n  return apply(21);\n}"
const REFUND = "function refund(): void {}"
const FILE = `export ${CHARGE}\n${REFUND}\n`
const CLOSURE = "(n: number): number => n * 2"

// THE ITEM'S BYTES DO NOT CONTAIN THE WORD `export`, and that is measured, not assumed: `unwrapExport`
// returns the INNER declaration and `ast.ts` slices `[decl.startIndex, decl.endIndex)`, so the wrapper is
// outside the unit. It is the reason export-ness has to be CARRIED (#182 `UnitPrior`) and could never have
// been recovered downstream by looking at the unit's own slice.
const P_FILE = "src/a.ts"
const P_ITEM = "src/a.ts::function_declaration:0:charge"
// No `:apply` segment: an anonymous closure has no `name` field, and `unitPath` OMITS an empty name rather
// than rendering a trailing `:` that would read back as a boundary in the wrong place.
const P_BLOCK = "src/a.ts::function_declaration:0:charge::arrow_function:0"

// ── S2 — the reader returns the UNIT ──────────────────────────────────────────────────────────────────

describe("#182 S2 — createUnitSourceReader serves the anchored unit, never the file around it", () => {
  it("an ITEM site reads the item's exact bytes — a strict subset of the file", () => {
    // teeth (breaks-on "the reader falls back to the file for a `::` site"): the mutant returns FILE here,
    // which is a different exact string. The two `not.toBe` lines are what a substring assertion could not
    // have said: CHARGE is a genuine prefix-substring of FILE.
    const repo = repoWith({ [P_FILE]: FILE })
    expect(createUnitSourceReader(repo).read(siteAt(P_ITEM))).toBe(CHARGE)
    expect(CHARGE).not.toBe(FILE)
    expect(FILE.includes(CHARGE)).toBe(true) // strict subset — the containment this narrows away from
  })

  it("a BLOCK site reads the block's exact bytes — a strict subset of its own ITEM (C2)", () => {
    const repo = repoWith({ [P_FILE]: FILE })
    expect(createUnitSourceReader(repo).read(siteAt(P_BLOCK, "block"))).toBe(CLOSURE)
    expect(CHARGE.includes(CLOSURE)).toBe(true)
    expect(CLOSURE).not.toBe(CHARGE)
  })

  it("a FILE site is byte-identical to the shipped reader — arm FILE sees exactly master's bytes", () => {
    // This is what lets ONE binary run both A/B arms: the wider reader is a strict refinement, so an
    // unchanged arm cannot be blamed for a difference this card introduced.
    const repo = repoWith({ [P_FILE]: FILE })
    expect(createUnitSourceReader(repo).read(siteAt(P_FILE, "file"))).toBe(
      createFileSourceReader(repo).read(siteAt(P_FILE, "file")),
    )
    expect(createUnitSourceReader(repo).read(siteAt(P_FILE, "file"))).toBe(FILE)
  })
})

describe("#182 S2 — an unresolvable unit key REFUSES; it never degrades to the file", () => {
  it("an unknown `::` address reads null, and the prompt factory turns that into `source-unreadable`", () => {
    // THE FAIL-CLOSED CASE. Falling back to the file would mean showing the model a whole module and
    // telling it those bytes are one function — the exact mis-attribution S2 exists to remove — and it
    // would do so SILENTLY, since a prompt would still be produced.
    const repo = repoWith({ [P_FILE]: FILE })
    const source = createUnitSourceReader(repo)
    expect(source.read(siteAt("src/a.ts::function_declaration:9:ghost"))).toBeNull()

    const factory = createPromptFactory({ source })
    let refusal: PromptError | undefined
    try {
      factory.build(candAt("src/a.ts::function_declaration:9:ghost"))
    } catch (e) {
      refusal = e as PromptError
    }
    expect(refusal?.refusal).toBe("source-unreadable")
    expect(factory.evidenceSpan(candAt("src/a.ts::function_declaration:9:ghost"))).toBeNull()
  })

  it("a file that does not parse yields NO units, so every `::` site under it refuses", () => {
    const repo = repoWith({ "src/broken.ts": "export function ( { { {" })
    expect(createUnitSourceReader(repo).read(siteAt("src/broken.ts::function_declaration:0:x"))).toBeNull()
    expect(createUnitSourceReader(repo).read(siteAt("src/broken.ts", "file"))).toBe("export function ( { { {")
  })

  it("a `::` suffix does NOT bypass the repo-escape and symlink guards", () => {
    // The security half. The unit reader adds a SLICE, not a second door: the bytes still come from
    // `createFileSourceReader`, so appending a unit chain to an escaping path must not change the verdict.
    // teeth (breaks-on "the unit reader opens its own file handle"): the mutant reads the parent's file.
    const parent = mkdtempSync(join(tmpdir(), "atlas-unitsrc-outer-"))
    repos.push(parent)
    writeFileSync(join(parent, "outside.ts"), "export function secret(): void {}")
    const repo = join(parent, "inner")
    mkdirSync(join(repo, "src"), { recursive: true })
    writeFileSync(join(repo, "src", "a.ts"), FILE)
    symlinkSync(join(parent, "outside.ts"), join(repo, "src", "link.ts"))

    const source = createUnitSourceReader(repo)
    expect(source.read(siteAt("../outside.ts::function_declaration:0:secret"))).toBeNull()
    expect(source.read(siteAt("src/link.ts::function_declaration:0:secret"))).toBeNull()
    expect(source.read(siteAt("/etc/passwd::function_declaration:0:x"))).toBeNull()
    expect(source.read(siteAt(P_ITEM))).toBe(CHARGE) // CONTROL: the legitimate read still works
  })
})

// ── S3 — the evidence span addresses the unit's bytes ─────────────────────────────────────────────────

describe("#182 S3 (I2) — the evidence span narrows with the reader, and no offset is transported", () => {
  it("an ITEM site's `contentHash` IS the digest of the unit's bytes and is NOT the file's", () => {
    // I2, asserted on EXACT digests in both directions. A one-sided assertion ("equals the unit hash")
    // would pass on a fixture where the unit happens to be the whole file, and this repo has been bitten
    // by exactly that shape of vacuous golden.
    const repo = repoWith({ [P_FILE]: FILE })
    const factory = createPromptFactory({ source: createUnitSourceReader(repo) })

    const span = factory.evidenceSpan(candAt(P_ITEM))
    expect(String(span?.contentHash)).toBe(digestOf(CHARGE))
    expect(String(span?.contentHash)).not.toBe(digestOf(FILE))
  })

  it("the span covers the WHOLE unit and nothing else — `[0, unit.length)` in the unit's own bytes", () => {
    // The shape S3 keeps: `mintSpan(bytes, 0, bytes.length)`. What changed is what `bytes` are, so the
    // offsets stay trivially in-bounds and no tree-sitter index crosses a module boundary to get here.
    const repo = repoWith({ [P_FILE]: FILE })
    const factory = createPromptFactory({ source: createUnitSourceReader(repo) })
    const unitBytes = new TextEncoder().encode(CHARGE)

    const span = factory.evidenceSpan(candAt(P_ITEM))!
    expect(span.start).toBe(0)
    expect(span.end).toBe(unitBytes.length)
    // …and it really re-derives: `readSpan` refuses any bytes that are not the ones cited.
    const read = bindSpan(defaultEncoder).readSpan(span, unitBytes)
    expect(read === undefined ? null : new TextDecoder().decode(read)).toBe(CHARGE)
    expect(bindSpan(defaultEncoder).readSpan(span, new TextEncoder().encode(FILE))).toBeUndefined()
  })

  it("a BLOCK site's span addresses the block, distinct from BOTH its item and its file (C2)", () => {
    const repo = repoWith({ [P_FILE]: FILE })
    const factory = createPromptFactory({ source: createUnitSourceReader(repo) })

    const span = factory.evidenceSpan(candAt(P_BLOCK, "block"))
    expect(String(span?.contentHash)).toBe(digestOf(CLOSURE))
    expect(String(span?.contentHash)).not.toBe(digestOf(CHARGE))
    expect(String(span?.contentHash)).not.toBe(digestOf(FILE))
  })

  it("THE UTF-16 HAZARD IS DEFUSED, not dodged: a unit after a multi-byte prefix still cites itself", () => {
    // `grounding/src/types.ts` records the measured hazard: `web-tree-sitter` reports `startIndex`/
    // `endIndex` in UTF-16 CODE UNITS, so a producer handing those straight to `mintSpan` — whose offsets
    // are BYTES — cites the wrong bytes silently, and `splitsCodePoint` does not catch it because the
    // wrong offset can still be a valid boundary. Its rule: "any producer supplying INTERIOR offsets
    // (symbol-granular sites, #182) MUST convert UTF-16 → UTF-8 byte offsets before minting."
    //
    // THIS PRODUCER SUPPLIES NO INTERIOR OFFSETS. It transports BYTES and mints `0..length` over the
    // unit's own bytes, so the precondition of that rule is never met and no conversion exists to get
    // wrong. teeth: the file below puts `café ☕`/`🚀` ahead of the anchored unit, so UTF-16 and UTF-8
    // offsets diverge by exactly the kind of margin the note measured; an offset-carrying producer would
    // cite a shifted window here and this digest would not match.
    const prefix = 'const banner = "café ☕ 🚀 — a multi-byte prefix";\n'
    const unit = "function anchored(): number {\n  return 42;\n}"
    const repo = repoWith({ "src/u.ts": `${prefix}export ${unit}\n` })
    const factory = createPromptFactory({ source: createUnitSourceReader(repo) })
    const site = "src/u.ts::function_declaration:0:anchored"

    // The UTF-16 length and the UTF-8 byte length of what precedes the unit really do differ.
    expect(prefix.length).not.toBe(new TextEncoder().encode(prefix).length)
    expect(createUnitSourceReader(repo).read(siteAt(site))).toBe(unit)
    expect(String(factory.evidenceSpan(candAt(site))?.contentHash)).toBe(digestOf(unit))
    expect(factory.evidenceSpan(candAt(site))?.end).toBe(new TextEncoder().encode(unit).length)
  })

  it("a FILE site's span is UNCHANGED — the file's own digest, exactly as master mints it", () => {
    const repo = repoWith({ [P_FILE]: FILE })
    const factory = createPromptFactory({ source: createUnitSourceReader(repo) })
    expect(String(factory.evidenceSpan(candAt(P_FILE, "file"))?.contentHash)).toBe(digestOf(FILE))
  })

  it("the PROMPT the model is sent carries the unit's bytes, not the file's", () => {
    // The span and the prompt must agree, or the evidence would address bytes the model never saw.
    const repo = repoWith({ [P_FILE]: FILE })
    const built = createPromptFactory({ source: createUnitSourceReader(repo) }).build(candAt(P_ITEM))

    expect(built.includes(CHARGE)).toBe(true)
    expect(built.includes(REFUND)).toBe(false) // the rest of the file is NOT in the prompt
  })
})
