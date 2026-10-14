// @atlas/tools — test/wp-7.32-tools.test.ts   (WP-7.32.TOOLS — EPIC-32 — TOOLS-16, INV-TOOLS-16)
//
// RED→GREEN transcription of the VISIBLE `-1` goldens for `atlas-diff` — the READ-ONLY version-delta
// projection (EPIC-32). One facet under test, imported DIRECTLY from source (the barrel is wired by the
// lead at SEAL):
//   • ../src/diff.js — the read-only projection of the @atlas/persist PERSIST-14 delta over CLI ≡ MCP,
//                      opening NO write path and carrying NO write authority (SCN-TOOLS-16a-1 / 16b-1 /
//                      16c-1 / 16d-1 / 16e-1). The governance write surface is EXACTLY the two governed doors atlas-emit + atlas-link.
//
// The write surface is read STRUCTURALLY from ../src/handler.js (`GOVERNANCE_SURFACE` / `WRITE_PATHS`,
// the 7.26-a constants, byte-intact) — `atlas-diff` is a read projection like node (TOOLS-10) / doctor
// (TOOLS-12), NOT a fifth member. The CLI≡MCP ∀-input determinism arm is DELEGATED to the TOOLS-3 PBT
// over the one handler; these `-1` goldens conformance-test the projection surface. Held-out `-2`
// fixtures are NOT transcribed — the GATE runs those.

import { describe, it, expect } from "vitest"
import type { Hash } from "@atlas/contracts"
import type { VersionDelta } from "@atlas/persist"
import { GOVERNANCE_SURFACE, WRITE_PATHS } from "../src/handler.js"
import { createAtlasDiff } from "../src/diff.js"
import type { DiffSource } from "../src/diff.js"

// ── the reference diff fixture: the PERSIST-14 delta over two shas of the finance atlas ────────────────

const shaA = "cas:aaaa" as Hash
const shaB = "cas:bbbb" as Hash

// Δ = diff(shaA, shaB) — each entry carries its `prov` (the WP/commit that produced it).
const Δ: VersionDelta = {
  added: [{ fact: "claim:acme-ceo", provenance: "WP-3.1@commit-a" }],
  edited: [{ fact: "claim:acme-arr-2024", provenance: "WP-3.2@commit-b" }],
  superseded: [{ fact: "pred:auth-token-ttl", provenance: "WP-3.3@commit-c" }],
  decayed: [{ fact: "claim:acme-hq-2019", provenance: "WP-3.4@commit-d" }],
}

/** The injected @atlas/persist read-only version-delta source (`persist/ref/diff.ts`). atlas-diff READS
 *  this delta; it does NOT compute the fold-diff (that is @atlas/persist / WP-7.32.PERSIST). */
const source: DiffSource = {
  diff: (a, b) => (a === shaA && b === shaB ? Δ : { added: [], edited: [], superseded: [], decayed: [] }),
}

// the two transport adapters — both delegate to the ONE projection core, so they cannot diverge.
const withDiff = () => {
  const d = createAtlasDiff(source)
  return {
    d,
    cli: (a: unknown, b: unknown) => d.render("cli", a, b),
    mcp: (a: unknown, b: unknown) => d.render("mcp", a, b),
  }
}

// ── REQ-TOOLS-16a — atlas-diff surfaces the version delta read-only ─────────────────────────────────

describe("WP-7.32.TOOLS — atlas-diff renders the four-class delta as a read-only projection", () => {
  it("SCN-TOOLS-16a-1: it surfaces Δ (added/edited/superseded/decayed, each with prov), nothing written", () => {
    const { d } = withDiff()
    const out = d.diff(shaA, shaB)

    // faithful to the PERSIST-14 delta — every partition surfaced with its provenance.
    expect(out.added).toEqual([{ fact: "claim:acme-ceo", provenance: "WP-3.1@commit-a" }])
    expect(out.edited).toEqual([{ fact: "claim:acme-arr-2024", provenance: "WP-3.2@commit-b" }])
    expect(out.superseded).toEqual([{ fact: "pred:auth-token-ttl", provenance: "WP-3.3@commit-c" }])
    // teeth (breaks-on "atlas-diff drops the `decayed` partition"): the steward still sees acme-hq-2019 fell out.
    expect(out.decayed).toEqual([{ fact: "claim:acme-hq-2019", provenance: "WP-3.4@commit-d" }])
    // read-only projection: the surfaced delta is byte-faithful to the source delta (nothing added/dropped).
    expect(JSON.stringify(out)).toBe(JSON.stringify(Δ))
  })
})

// ── REQ-TOOLS-16b — atlas-diff CLI and MCP parity ────────────────────────────────────────────────────

describe("WP-7.32.TOOLS — atlas-diff returns byte-identical results over CLI and MCP", () => {
  it("SCN-TOOLS-16b-1: cli(shaA,shaB) ≡ mcp(shaA,shaB) — byte-identical delta, one handler behind both", () => {
    const { cli, mcp } = withDiff()
    const c = cli(shaA, shaB)
    const m = mcp(shaA, shaB)

    expect(c.ok).toBe(true)
    expect(c.data).toEqual(Δ)
    // teeth (breaks-on "the MCP adapter wraps the delta in a transport envelope {mcp:{…}}"): byte-identical.
    expect(JSON.stringify(m)).toBe(JSON.stringify(c))
  })
})

// ── REQ-TOOLS-16c — atlas-diff CLI and MCP must not diverge (guard) ─────────────────────────────────

describe("WP-7.32.TOOLS — a bad-sha input rejects identically on both transports", () => {
  it("SCN-TOOLS-16c-1: cli(shaA,42) and mcp(shaA,42) return the SAME structured rejection", () => {
    const { cli, mcp } = withDiff()
    const c = cli(shaA, 42) // 42 is a number where a sha string is required
    const m = mcp(shaA, 42)

    // teeth (breaks-on "the MCP adapter coerces 42→\"42\" and resolves an empty diff while the CLI rejects"):
    expect(c.ok).toBe(false)
    expect(m.ok).toBe(false)
    expect(c.rejected).toBeTruthy()
    // the two transports do not diverge in behavior or contract on the identical input.
    expect(JSON.stringify(m)).toBe(JSON.stringify(c))
  })
})

// ── REQ-TOOLS-16d — atlas-diff adds no write path (guard) ───────────────────────────────────────────

describe("WP-7.32.TOOLS — a write attempted through the diff projection is refused", () => {
  it("SCN-TOOLS-16d-1: the diff handle exposes NO store-mutating method — read/subscribe only", () => {
    const { d } = withDiff()
    // the projection resolves the delta (read-only)…
    expect(d.render("cli", shaA, shaB).ok).toBe(true)

    // teeth (breaks-on "the atlas-diff handle grows a .write()/.apply()/.applyInto() method"): none exists.
    const handle = d as unknown as Record<string, unknown>
    expect(handle.write).toBeUndefined()
    expect(handle.apply).toBeUndefined()
    expect(handle.applyInto).toBeUndefined()
    expect(handle.set).toBeUndefined()
    expect(handle.put).toBeUndefined()
    // writes still funnel through the GOVERNED write doors (atlas-emit + atlas-link + atlas-memory-emit,
    // WP-SAMEAS + WP-11.W8) — atlas-diff (a read projection) adds none.
    expect([...WRITE_PATHS].sort()).toEqual(["atlas-emit", "atlas-link", "atlas-memory-emit"])
  })
})

// ── REQ-TOOLS-16e — atlas-diff is not a write tool (guard) ────────────────────────────────────

describe("WP-7.32.TOOLS — atlas-diff does not grow the governance write surface", () => {
  it("SCN-TOOLS-16e-1: the governance surface is the six governed tools; atlas-diff carries no write authority", () => {
    // teeth (breaks-on "atlas-diff is registered on the governance write surface as another write tool"):
    expect(GOVERNANCE_SURFACE.length).toBe(6) // WP-11.W8: atlas-memory-emit is the sixth governed tool
    expect([...GOVERNANCE_SURFACE].sort()).toEqual([
      "atlas-emit",
      "atlas-init",
      "atlas-link",
      "atlas-memory-emit",
      "atlas-query",
      "atlas-reconcile",
    ])
    expect(GOVERNANCE_SURFACE).not.toContain("atlas-diff") // a read projection, not a governance member
    expect(WRITE_PATHS.length).toBe(3) // writePaths == 3 (atlas-emit + atlas-link + atlas-memory-emit)
    expect(WRITE_PATHS).not.toContain("atlas-diff") // atlas-diff opens no write door
  })
})
