// @atlas/cli — test/render-data.test.ts   (WIRE-LOOP Seam-2: CLI renders verdict.data, closes GAP-B)
//
// The CLI used to DROP `verdict.data` entirely — an emitted fact / a resolved pack / the derived subsumes
// were invisible at the user surface. `renderVerdict` now appends a DETERMINISTIC `data:` block for a known
// `ok` data shape, byte-identical per verdict (CLI-3c), and NOTHING for an unknown/absent shape (back-compat:
// the pre-existing status/next/invariant bytes are untouched). Each tooth NAMES the mutant it kills.

import { describe, it, expect } from "vitest"
import type { Verdict } from "@atlas/tools"
import { renderVerdict } from "../src/render.js"

const guidance = { next: "do the next thing", invariant: "the governing invariant" }

/** The fixed status/next/invariant prefix every render carries — a data block is APPENDED after it. */
const PREFIX = "status: ok\nnext: do the next thing\ninvariant: the governing invariant\n"

describe("renderVerdict — Seam-2 deterministic data: block", () => {
  it("query envelope { pack, subsumes } → inv lines + stale + subsumes (kills the drop-verdict.data mutant)", () => {
    const v: Verdict = {
      ok: true,
      data: {
        pack: {
          territory: "t",
          axisHash: "a",
          tokenEstimate: 0,
          stale: false,
          advisory: [{ tier: "T2", nodeId: "n3", claim: "a proposal" }],
          advisoryDropped: 4,
          invariants: [
            { tier: "T1", nodeId: "n1", claim: "claim one", freshness: "FRESH" },
            { tier: "T0", nodeId: "n2", claim: "claim two", freshness: "DRIFTED" },
          ],
        },
        subsumes: [{ broader: "b1", narrower: "q1" }],
      } as unknown,
      guidance,
    }
    const { stdout } = renderVerdict(v)
    // TEETH: the original render printed ONLY status/next/invariant — none of the below appeared (GAP-B).
    // N12: `tokenEstimate` now rides the CLI query block too (CLI/MCP parity), after `stale`, before subsumes.
    // [ENTRY-CLI-6, gained lines] `territory`/`axisHash` (the two remaining `Pack` fields) now render as
    // trailing lines AFTER `subsumes` — APPENDED, the pre-existing lines above them are byte-unchanged.
    expect(stdout).toBe(
      PREFIX +
        // [ADR-0013] the GOVERNING band keeps the `inv` verb and gains its per-row verdict; the ADVISORY band
        // gets its OWN verb and is never interleaved; the truncation ledger rides out beside the data (#130).
        "data:\n  inv T1 n1 [FRESH]: claim one\n  inv T0 n2 [DRIFTED]: claim two\n" +
        "  advisory T2 n3 [?]: a proposal\n  advisoryDropped: 4\n  stale: false\n  tokenEstimate: 0\n  subsumes b1 ⊃ q1\n" +
        "  territory: t\n  axisHash: a\n",
    )
  })

  it("the query data block is BYTE-IDENTICAL across two renders of the same verdict (CLI-3c determinism)", () => {
    const v: Verdict = {
      ok: true,
      data: {
        pack: {
          territory: "t",
          axisHash: "a",
          tokenEstimate: 0,
          stale: true,
          invariants: [{ tier: "T1", nodeId: "n", claim: "c" }],
        },
        subsumes: [],
      } as unknown,
      guidance,
    }
    // TEETH: a clock/nonce/path leaked into the block would make two renders differ.
    expect(renderVerdict(v).stdout).toBe(renderVerdict(v).stdout)
    expect(renderVerdict(v).stdout).toContain("  stale: true\n")
  })

  it("emit { id } → an id line (kills the mutant that never surfaces the persisted CAS id)", () => {
    const v: Verdict = { ok: true, data: { emitted: true, id: "abc123" } as unknown, guidance }
    expect(renderVerdict(v).stdout).toBe(PREFIX + "data:\n  id: abc123\n")
  })

  it("emit { id, nodeKey } → a nodeKey line APPENDED after id (ENTRY-CLI-6 / AUTHOR-14, additive)", () => {
    const v: Verdict = { ok: true, data: { emitted: true, id: "abc123", nodeKey: "nk1" } as unknown, guidance }
    expect(renderVerdict(v).stdout).toBe(PREFIX + "data:\n  id: abc123\n  nodeKey: nk1\n")
  })

  it("init { territories } → territory lines SORTED by name (kills the insertion-order mutant)", () => {
    const v: Verdict = {
      ok: true,
      data: { territories: [{ name: "zeta" }, { name: "alpha" }], blastRadius: [], t0Candidates: [] } as unknown,
      guidance,
    }
    expect(renderVerdict(v).stdout).toBe(PREFIX + "data:\n  territory: alpha\n  territory: zeta\n")
  })

  // ── SCN-CLI-6b-1 — the init regression witness ──────────────────────────────────────────────────────
  it("SCN-CLI-6b-1: init { territories, blastRadius, t0Candidates } — ALL THREE fields render (the regression witness: exit_predicate — two of three InitOut fields used to be dropped)", () => {
    const v: Verdict = {
      ok: true,
      data: {
        territories: [{ name: "src" }],
        blastRadius: ["nodeA", "nodeB"],
        t0Candidates: ["auth/"],
      } as unknown,
      guidance,
    }
    const { stdout } = renderVerdict(v)
    // TEETH: breaks-on a render that returns after the first recognised field (territories) — the mutant
    // named in the golden — since blastRadius/t0Candidates would then never reach a user.
    expect(stdout).toBe(
      PREFIX + "data:\n  territory: src\n  blastRadius: nodeA\n  blastRadius: nodeB\n  t0Candidate: auth/\n",
    )
    expect(stdout).toContain("blastRadius")
    expect(stdout).toContain("t0Candidate")
  })

  it("reconcile { drift, mechanical, semantic, regroundedCount, reauthorCount, exitCode } → every field rendered (ENTRY-CLI-6, was previously an UNKNOWN shape with NO block at all)", () => {
    const v: Verdict = {
      ok: true,
      data: {
        drift: [{ fact: "f1", class: "mechanical", anchorWas: {}, anchorNow: {} }],
        mechanical: ["f1"],
        semantic: ["f2"],
        regroundedCount: 1,
        reauthorCount: 1,
        exitCode: 2,
      } as unknown,
      guidance,
    }
    const { stdout } = renderVerdict(v)
    // TEETH: before ENTRY-CLI-6 this shape rendered NOTHING — every one of these six fields was a silent drop.
    // `exitCode:2` derives `status: rejected` (CLI-2/deriveStatus — a semantic drift flip), not `ok`; the
    // `data:` block still renders because `v.ok` (the wrapping Verdict) stays `true` (renderAs gates on that).
    expect(stdout).toBe(
      "status: rejected\nnext: do the next thing\ninvariant: the governing invariant\n" +
        "data:\n  reconcile: exitCode 2 — 1 mechanical, 1 semantic\n  drift mechanical f1\n" +
        "  mechanical: f1\n  semantic: f2\n  regroundedCount: 1\n  reauthorCount: 1\n",
    )
  })

  it("anchors { rev, units, holes } → each unit gains an unit-path line (ENTRY-CLI-6, AnchorUnit.path was previously dropped)", () => {
    const v: Verdict = {
      ok: true,
      data: {
        rev: "deadbeef",
        units: [{ qualifiedPath: "src/foo.ts", kind: "file", subtreeHash: "h1", path: "src/foo.ts" }],
        holes: [],
      } as unknown,
      guidance,
    }
    const { stdout } = renderVerdict(v)
    // TEETH: the pre-existing `unit` line's bytes are UNCHANGED — `path` rides a SEPARATE trailing line.
    expect(stdout).toBe(
      PREFIX +
        "data:\n  anchors: rev deadbeef — 1 unit(s), 0 hole(s)\n  unit file src/foo.ts [h1]\n  unit-path src/foo.ts: src/foo.ts\n",
    )
  })

  it("a truly UNKNOWN/unenumerated data shape appends NO block — back-compat bytes unchanged (kills the always-emit mutant)", () => {
    const v: Verdict = { ok: true, data: { somethingElse: 1, another: "x" } as unknown, guidance }
    // TEETH: a mutant that always prints a `data:` header would break every non-enumerated shape.
    expect(renderVerdict(v).stdout).toBe(PREFIX)
    expect(renderVerdict(v).stdout).not.toContain("data:")
  })

  it("ABSENT data (ok, no data) and a REJECTED verdict both append no block (existing output unchanged)", () => {
    const okNoData: Verdict = { ok: true, guidance }
    expect(renderVerdict(okNoData).stdout).toBe(PREFIX)
    const rejected: Verdict = { ok: false, rejected: "nope", guidance }
    // status derives to 'error' for ok:false; the data block never renders on a non-ok verdict.
    expect(renderVerdict(rejected).stdout).not.toContain("data:")
  })
})
