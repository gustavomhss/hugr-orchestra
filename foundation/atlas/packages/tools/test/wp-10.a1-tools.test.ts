// @atlas/tools — test/wp-10.a1-tools.test.ts   (WP-10.A1.TOOLS — CAMPAIGN-10, ADR-0004)
//
// RED→GREEN realization of the FIVE acceptance goldens for the authoring TOOLS layer (the port freeze + the
// read-only `anchors` DISCOVERY planner). Facets under test, imported DIRECTLY from source:
//   • ../src/anchors.js  — the `GroundingComputer` PORT + `createAnchors` leg (AUTHOR-1/2/3)
//   • ../src/handler.js  — the two FROZEN governed surface constants (GOVERNANCE_SURFACE / WRITE_PATHS)
//
// The `GroundingComputer` port is UNIMPLEMENTED here (WP-10.A1.ADAPTER implements it over the real index).
// These goldens exercise the leg against an INJECTED fake computer — the port is satisfied by injection,
// exactly as the shipped adapter will satisfy it. No door reaches a store; a planner persists nothing.
//
// Goldens (docs/requirements/goldens-authoring.md): SCN-AUTH-2b-1 / 2c-1 / 2e-1 / 3c-1 / 3d-1.

import { describe, it, expect } from "vitest"
import { createAnchors } from "../src/anchors.js"
import type { GroundingComputer } from "../src/anchors.js"
import { GOVERNANCE_SURFACE, WRITE_PATHS } from "../src/handler.js"
import type { AnchorsOut } from "../src/types.js"

// ── the frozen surface constants, transcribed here as the ORACLE the goldens compare against ────────────
// (byte-for-byte the values ADR-0003 / ADR-0004 pin; the campaign is READ-ONLY over both).
// [EXTENDED — WP-11.W8] `atlas-memory-emit` joins as a THIRD, genuinely new write door — not touched by
// THIS campaign (ADR-0004's authoring planners), but the oracle below must track the shipped constant.
const CANONICAL_WRITE_PATHS = ["atlas-emit", "atlas-link", "atlas-memory-emit"] as const
const CANONICAL_GOVERNANCE_SURFACE = [
  "atlas-init",
  "atlas-query",
  "atlas-emit",
  "atlas-reconcile",
  "atlas-link",
  "atlas-memory-emit",
] as const

// The four authoring doors (ADR-0004) — planners, ZERO write authority; NOT governed members.
const AUTHORING_DOORS = ["anchors", "slots", "draft", "check"] as const

/** The write-surface conformance predicate the spec-conformance guard enforces (the CODE-SURFACE PIN):
 *  `WRITE_PATHS` must deep-equal the frozen two-door set, IN ORDER. Adding any door breaks it. */
const writePathsConform = (paths: readonly string[]): boolean =>
  paths.length === CANONICAL_WRITE_PATHS.length && paths.every((p, i) => p === CANONICAL_WRITE_PATHS[i])

/** A fake `GroundingComputer` — the injected seat WP-10.A1.ADAPTER will fill with the real index. The
 *  `anchorsUnder` listing is parameterized per test; `groundingFor` is not exercised by these goldens. */
const fakeComputer = (listing: (path: string) => AnchorsOut): GroundingComputer => ({
  anchorsUnder: listing,
  groundingFor: () => ({ kind: "file", qualifiedPath: "", subtreeHash: "" as never }),
})

describe("WP-10.A1.TOOLS — the authoring surface adds NO governed write authority", () => {
  // SCN-AUTH-2b-1 — the write surface is still two.
  it("SCN-AUTH-2b-1 — WRITE_PATHS deep-equals [atlas-emit, atlas-link] (byte-unchanged)", () => {
    expect([...WRITE_PATHS]).toEqual([...CANONICAL_WRITE_PATHS])
    // GOVERNANCE_SURFACE is likewise byte-unchanged — the campaign touches neither constant.
    expect([...GOVERNANCE_SURFACE]).toEqual([...CANONICAL_GOVERNANCE_SURFACE])
  })

  // SCN-AUTH-2c-1 — no authoring door is a governed member.
  it("SCN-AUTH-2c-1 — no authoring door is a member of WRITE_PATHS or GOVERNANCE_SURFACE", () => {
    for (const door of AUTHORING_DOORS) {
      expect((WRITE_PATHS as readonly string[]).includes(door)).toBe(false)
      expect((GOVERNANCE_SURFACE as readonly string[]).includes(door)).toBe(false)
    }
  })

  // SCN-AUTH-2e-1 — registration guard fires: a mutant that adds `atlas-draft` to WRITE_PATHS FAILS the
  // surface conformance check. The shipped WRITE_PATHS passes it; the mutant does not.
  it("SCN-AUTH-2e-1 — adding an authoring door to WRITE_PATHS fails the surface conformance check", () => {
    expect(writePathsConform(WRITE_PATHS)).toBe(true)
    const mutant = [...WRITE_PATHS, "atlas-draft"]
    expect(writePathsConform(mutant)).toBe(false)
  })
})

describe("WP-10.A1.TOOLS — the anchors DISCOVERY planner", () => {
  // SCN-AUTH-3c-1 — anchors report the rev. Given fix-author @ R1, `anchors src` reports rev == R1.
  it("SCN-AUTH-3c-1 — anchors reports the rev the unit set was computed at", () => {
    const { anchors } = createAnchors(
      fakeComputer((path) => ({
        rev: "R1",
        units: [{ qualifiedPath: `${path}/app.ts`, kind: "file", subtreeHash: "h", path: `${path}/app.ts` }],
        holes: [],
      })),
    )
    const out = anchors("src")
    expect(out.rev).toBe("R1")
    expect(out.units.length).toBeGreaterThan(0)
    expect(out.reason).toBeUndefined() // a populated set carries NO reason (a reason there would be a lie)
  })

  // SCN-AUTH-3d-1 — honest empty with a reason. Given `not-a-repo/`, `anchors not-a-repo` returns an empty
  // unit set AND a reason (never a throw). The leg supplies the floor reason when the computer names none.
  it("SCN-AUTH-3d-1 — a non-groundable path yields an empty unit set WITH a reason", () => {
    const { anchors } = createAnchors(fakeComputer((_path) => ({ rev: "R1", units: [], holes: [] })))
    const out = anchors("not-a-repo")
    expect(out.units).toEqual([])
    expect(out.reason).toBeDefined()
    expect(out.reason).not.toBe("")
  })
})
