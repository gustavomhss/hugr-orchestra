// harness/gates/adr-citation-guard.test.mjs — the TEETH of adr-citation-guard.
//
// `gate-directory.test.mjs` already proves this file's subject exits non-zero on an EMPTY tree. That proves
// a reachable failure path and nothing else: a gate can fail on a missing directory and still be vacuous on
// the real corpus, which is the exact shape of the two non-gates #172 removed. This file is what covers the
// rest — every refusal branch reached by its OWN fixture, and the dangling-citation report checked against
// a HAND-WRITTEN expected set rather than against a second copy of the gate's own regex.
//
// Fixtures are built in a temp tree and the gate is pointed at them with `ADR_CITATION_GUARD_ROOT`. Exit
// codes come from `execFileSync`'s thrown `status` — never from a shell pipeline, which reports the LAST
// command's status and has already bought this repo two false greens.
//
// SECOND CORPUS (#192). The gate now walks `packages/**/*.ts` beside `docs/**/*.md`, so every docs-focused
// fixture below also lays down a minimal `packages/` floor (`pkgFloor`) — without it the gate correctly
// refuses A-4 and the fixture would be testing the wrong branch. The floor cites NOTHING on purpose: a docs
// fixture's hand-written expected report must not silently gain rows from the scaffolding around it.
// This file owns the `docs/**` teeth, the exact-report shape and the four ORIGINAL refusals (A-0..A-3).
// The `packages/**` teeth, the A4 fixture exclusion and A-4/A-5 are the sibling twin
// `adr-citation-guard.packages.test.mjs`; the scratch-tree plumbing both use is `harness/lib/
// adr-citation-fixtures.mjs`, so the two twins cannot drift into meaning different things by the same name.

import { describe, it, expect, afterAll } from "vitest"
import { cpSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { adr, pkgFloor, refusal, reported, runGate, scratchPool } from "../lib/adr-citation-fixtures.mjs"

const GATES = dirname(fileURLToPath(import.meta.url))
const REPO = join(GATES, "..", "..")
const GATE = join(GATES, "adr-citation-guard.mjs")

const pool = scratchPool()
const scratch = () => pool.scratch()
const run = (root) => runGate(GATE, root)
afterAll(() => pool.cleanup())

describe("adr-citation-guard — the real corpus", () => {
  it("passes on the repository as it stands, and says what it checked", () => {
    const { code, out } = run(REPO)
    expect(code, out).toBe(0)
    expect(out).toMatch(
      /^adr-citation-guard: OK — \d+ `ADR-<NNNN>` citation\(s\) across \d+ file\(s\) \(\d+ docs\/\*\*\/\*\.md \+ \d+ packages\/\*\*\/\*\.ts\)/,
    )
    // the widened sweep is NON-VACUOUS on the real tree: both legs must have found files.
    const [, nDocs, nPkgs] = /\((\d+) docs\/\*\*\/\*\.md \+ (\d+) packages\/\*\*\/\*\.ts\)/.exec(out)
    expect(Number(nDocs)).toBeGreaterThan(0)
    expect(Number(nPkgs)).toBeGreaterThan(0)
  })

  it("FAILS when a real, heavily-cited ADR is removed — and names EVERY occurrence, not the first", () => {
    const root = scratch()
    cpSync(join(REPO, "docs"), join(root, "docs"), { recursive: true })
    pkgFloor(root)
    unlinkSync(join(root, "docs", "adr", "ADR-0013-the-pack-has-two-bands-governing-and-advisory.md"))

    const { code, out } = run(root)
    expect(code).toBe(1)

    const hits = reported(out)
    // Every reported occurrence is the removed ADR, cited from more than one file and more than one line —
    // "names every occurrence" is a claim about MULTIPLICITY, so it is checked as one.
    expect(hits.length).toBeGreaterThan(1)
    expect([...new Set(hits.map((h) => h.split(" → ")[1]))]).toEqual(["ADR-0013"])
    expect(new Set(hits.map((h) => h.split(":")[0])).size).toBeGreaterThan(1)
    // The two RATIFIED invariant-register rows are the citations that make this a governance defect rather
    // than a broken link, so they are named explicitly instead of left to a count.
    expect(hits.filter((h) => h.startsWith("docs/requirements/invariant-register.md:")).length).toBe(2)
    expect(out).toMatch(/dangling citation\(s\) across \d+ file\(s\), naming 1 absent ADR\(s\): ADR-0013\./)
  })
})

describe("adr-citation-guard — the report is exact", () => {
  it("reports precisely the hand-written expected set: file:line → id, one line per OCCURRENCE", () => {
    const root = scratch()
    adr(root, "0001", "the-one-that-exists")
    pkgFloor(root)
    mkdirSync(join(root, "docs", "requirements"), { recursive: true })
    writeFileSync(
      join(root, "docs", "requirements", "req-x.md"),
      [
        "line 1 cites ADR-0001, which exists.", // resolves
        "line 2 cites ADR-0042 and ADR-0043.", // TWO occurrences on ONE line
        "line 3 is quiet.",
        "line 4 cites ADR-0042 again — the same id, a second occurrence.", // not deduped by id
        "line 5 cites ADR-00421 and ADR-042 and xADR-0042, none of which is a citation.", // word boundaries
      ].join("\n"),
    )
    // A second file, so file-level ordering is exercised: the walk is sorted, `adr/` sorts before `requirements/`.
    writeFileSync(join(root, "docs", "adr", "ADR-0001-the-one-that-exists.md"), "# ADR-0001\nsee ADR-0042 below\n")

    const { code, out } = run(root)
    expect(code).toBe(1)
    expect(reported(out)).toEqual([
      "docs/adr/ADR-0001-the-one-that-exists.md:2 → ADR-0042",
      "docs/requirements/req-x.md:2 → ADR-0042",
      "docs/requirements/req-x.md:2 → ADR-0043",
      "docs/requirements/req-x.md:4 → ADR-0042",
    ])
  })

  it("a citation inside a fenced block is still a citation (a fence is not a hiding place)", () => {
    const root = scratch()
    adr(root, "0001", "exists")
    pkgFloor(root)
    writeFileSync(join(root, "docs", "note.md"), "```\nADR-0099\n```\n")
    const { code, out } = run(root)
    expect(code).toBe(1)
    expect(reported(out)).toEqual(["docs/note.md:2 → ADR-0099"])
  })

  it("passes — and is therefore not a gate that merely always fails — when every citation resolves", () => {
    const root = scratch()
    adr(root, "0001", "alpha")
    adr(root, "0002", "beta")
    pkgFloor(root)
    writeFileSync(join(root, "docs", "note.md"), "ADR-0001 amends ADR-0002.\n")
    const { code, out } = run(root)
    expect(code, out).toBe(0)
    expect(out).toContain("naming 2 distinct ADR(s)")
  })

  it("a nested file under docs/adr/ does NOT satisfy a citation (the index is flat by declaration)", () => {
    const root = scratch()
    adr(root, "0001", "exists")
    pkgFloor(root)
    mkdirSync(join(root, "docs", "adr", "archive"), { recursive: true })
    writeFileSync(join(root, "docs", "adr", "archive", "ADR-0077-buried.md"), "# ADR-0077\n")
    writeFileSync(join(root, "docs", "note.md"), "ADR-0077 is cited here.\n")
    const { code, out } = run(root)
    expect(code).toBe(1)
    expect(reported(out)).toContain("docs/note.md:1 → ADR-0077")
  })
})

describe("adr-citation-guard — anti-vacuity: every way of checking nothing is a NAMED refusal", () => {
  it("A-0 — docs/ missing", () => {
    const { code, out } = run(scratch())
    expect(code).toBe(1)
    expect(refusal(out)).toBe("A-0")
  })

  it("A-2 — docs/adr/ missing, with a populated corpus that cites ADRs", () => {
    const root = scratch()
    mkdirSync(join(root, "docs"), { recursive: true })
    writeFileSync(join(root, "docs", "note.md"), "ADR-0001 is cited here.\n")
    const { code, out } = run(root)
    expect(code).toBe(1)
    expect(refusal(out)).toBe("A-2")
  })

  it("A-1 — the docs walk resolves EMPTY (reachable only because the walk is checked before the index)", () => {
    const root = scratch()
    mkdirSync(join(root, "docs", "adr"), { recursive: true })
    const { code, out } = run(root)
    expect(code).toBe(1)
    expect(refusal(out)).toBe("A-1")
  })

  it("A-3 — docs/adr/ exists and holds ZERO ADR files, over a corpus that has prose in it", () => {
    const root = scratch()
    mkdirSync(join(root, "docs", "adr"), { recursive: true })
    writeFileSync(join(root, "docs", "adr", "README.md"), "index of decisions\n")
    writeFileSync(join(root, "docs", "note.md"), "no citations at all here.\n")
    const { code, out } = run(root)
    // Zero citations, so "all resolve" would be VACUOUSLY true. It refuses anyway — that is the point.
    expect(code).toBe(1)
    expect(refusal(out)).toBe("A-3")
  })

  it("all four refusal codes are distinct and reachable (no branch is dead)", () => {
    const roots = []
    const a0 = scratch()
    roots.push(a0)
    const a2 = scratch()
    mkdirSync(join(a2, "docs"), { recursive: true })
    writeFileSync(join(a2, "docs", "x.md"), "x\n")
    roots.push(a2)
    const a1 = scratch()
    mkdirSync(join(a1, "docs", "adr"), { recursive: true })
    roots.push(a1)
    const a3 = scratch()
    mkdirSync(join(a3, "docs", "adr"), { recursive: true })
    writeFileSync(join(a3, "docs", "x.md"), "x\n")
    roots.push(a3)

    expect(roots.map((r) => refusal(run(r).out))).toEqual(["A-0", "A-2", "A-1", "A-3"])
  })
})
