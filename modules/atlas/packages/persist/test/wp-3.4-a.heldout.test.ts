// @atlas/persist — test/wp-3.4-a.heldout.test.ts  (HELD-OUT `-2` gate · WP-3.4-a.PERSIST · EPIC-4-a)
//
// Cold-review held-out gate: the `-2` (held_out:true) goldens for PERSIST-3a/3b/4a/4b/4c/6, authored by the
// reviewer against the EXISTING src (never seen by the builder). Independent data (WP-9, body B2) with the
// goldens' OWN teeth mutants. Hashes are RELATIONAL vs the sealed `id` seam — never hard-coded hex.

import { describe, it, expect } from "vitest"
import { id, asHash } from "@atlas/kernel"
import type { CasObject } from "@atlas/kernel"
import type { Dossier, Trailer, Metering } from "../src/types.js"
import { serialize, deserialize } from "../src/provenance.js"
import { createAttach } from "../src/attach.js"
import { meter } from "../src/metering.js"

// ---- held-out fixtures (WP-9 / B2, per the `-2` goldens) -------------------------------------------------

const trailer9: Trailer = {
  WP: "WP-9",
  Model: "sonnet-4-5",
  Gates: "fmt,test,linux-validation",
  Verdict: "REWORK",
  TranscriptSha: asHash("id-tr47"),
}
const dossier9: Dossier = { trailer: trailer9 }

// ======================================================================================================
// SCN-PERSIST-3a-2 (held-out) — WP-9 trailer round-trips all five fields; teeth = dropped Verdict
// ======================================================================================================
describe("SCN-PERSIST-3a-2 (held-out)", () => {
  it("WP-9 trailer round-trips all five provenance fields (0 missing)", () => {
    const back = deserialize(serialize(dossier9))
    expect(back).not.toBeNull()
    expect(back?.trailer).toEqual(trailer9)
    expect(back?.trailer.WP).toBe("WP-9")
    expect(back?.trailer.Model).toBe("sonnet-4-5")
    expect(back?.trailer.Gates).toBe("fmt,test,linux-validation")
    // teeth: a dropped Verdict would fail here — WP-9's REWORK must survive.
    expect(back?.trailer.Verdict).toBe("REWORK")
    expect(back?.trailer.TranscriptSha).toBe(asHash("id-tr47"))
  })
})

// ======================================================================================================
// SCN-PERSIST-3b-2 (held-out) — WP-9 note carries same fields; note-absent parent reads back total (null)
// ======================================================================================================
describe("SCN-PERSIST-3b-2 (held-out)", () => {
  it("note yields the same five fields and the note-absent read is total (null, never throws)", () => {
    const note = serialize(dossier9)
    expect(deserialize(note)?.trailer).toEqual(trailer9)
    // teeth: omitted Gates would fail equality above.
    expect(deserialize(note)?.trailer.Gates).toBe("fmt,test,linux-validation")
    // total read on WP-9's parent commit that has NO note.
    expect(() => deserialize("")).not.toThrow()
    expect(deserialize("")).toBeNull()
    expect(deserialize("   ")).toBeNull()
    expect(deserialize("{}")).toBeNull()
  })
})

// ======================================================================================================
// SCN-PERSIST-4a-2 / 4b-2 / 4c-2 (held-out) — independent body B2 (a rendered-report blob)
// ======================================================================================================
describe("SCN-PERSIST-4a-2 / 4b-2 / 4c-2 (held-out)", () => {
  const bodyB2: CasObject = {
    kind: "blob",
    role: "rendered-report",
    payload: "REPORT-B2-".repeat(96),
  }

  it("SCN-PERSIST-4a-2: B2 attaches as a `{hash}` pointer only (hash = sealed id(B2))", () => {
    const att = createAttach()
    const pointer = att.attach(bodyB2)
    expect(pointer).toEqual({ hash: id(bodyB2) })
    expect(Object.keys(pointer)).toEqual(["hash"])
    expect(JSON.stringify(pointer)).not.toContain("REPORT-B2-")
  })

  it("SCN-PERSIST-4b-2: B2 resolves from the single CAS by its content hash", () => {
    const att = createAttach()
    const pointer = att.attach(bodyB2)
    expect(att.get(pointer.hash)).toEqual(bodyB2)
  })

  it("SCN-PERSIST-4c-2 (guard): B2 is never inlined — the attachment is pointer-only", () => {
    const att = createAttach()
    const pointer = att.attach(bodyB2)
    const attachmentBytes = JSON.stringify(pointer)
    expect(attachmentBytes).not.toContain("REPORT-B2-")
    expect(attachmentBytes.length).toBeLessThan(JSON.stringify(bodyB2).length)
    expect(att.get(pointer.hash)).toEqual(bodyB2)
  })
})

// ======================================================================================================
// SCN-PERSIST-6-2 (held-out) — WP-9 metering; teeth = omitted tokens.cache
// ======================================================================================================
describe("SCN-PERSIST-6-2 (held-out)", () => {
  const requiredFields: readonly (keyof Metering)[] = [
    "model",
    "tokensIn",
    "tokensOut",
    "tokensCache",
    "toolUses",
    "wallTime",
    "retries",
    "reworks",
    "gates",
    "verdict",
    "transcriptSha",
  ]

  it("WP-9 carries a complete Metering record (every field non-undefined; cache metered)", () => {
    const wp9 = {
      model: "sonnet-4-5",
      tokensIn: 900,
      tokensOut: 450,
      tokensCache: 175,
      toolUses: 4,
      wallTime: 3100,
      retries: 2,
      reworks: 1,
      gates: ["fmt", "test", "linux-validation"],
      verdict: "REWORK",
      transcriptSha: asHash("id-tr47"),
    }
    const rec = meter(wp9)
    for (const f of requiredFields) {
      expect(rec[f], `field ${f} must be present`).not.toBeUndefined()
    }
    // teeth: an omitted tokensCache would read back undefined — WP-9's cache must be metered.
    expect(rec.tokensCache).toBe(175)
    expect(rec.retries).toBe(2)
    expect(rec.reworks).toBe(1)
    expect(rec.gates).toEqual(["fmt", "test", "linux-validation"])
    expect(rec.verdict).toBe("REWORK")
  })
})
