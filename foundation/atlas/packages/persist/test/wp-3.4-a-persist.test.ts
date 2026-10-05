// @atlas/persist — test/wp-3.4-a-persist.test.ts  (WP-3.4-a.PERSIST · EPIC-4-a)
//
// RED→GREEN transcription of the VISIBLE `-1` goldens for the provenance trailer+note (de)serializer
// (PERSIST-3), the index-as-attachment over the single CAS (PERSIST-4), and the full per-agent metering
// constructor (PERSIST-6). Facets are imported DIRECTLY from ../src/* (the barrel is wired by the lead at
// SEAL). All hashing/identity flows through the SEALED @atlas/kernel seam (`id` / `createStore` / `asHash`)
// — never a hand-rolled digest. Golden ids/hashes are SYMBOLIC, so every hash assertion is RELATIONAL
// (compared to the sealed `id` seam), never a hard-coded hex. Held-out `-2` fixtures are NOT transcribed.

import { describe, it, expect } from "vitest"
import { id, asHash } from "@atlas/kernel"
import type { CasObject } from "@atlas/kernel"
import type { Dossier, Trailer, Metering } from "../src/types.js"
import type { ProvenanceApi } from "../src/provenance.js"
import type { AttachApi } from "../src/attach.js"
import type { MeteringApi } from "../src/metering.js"
import { serialize, deserialize } from "../src/provenance.js"
import { createAttach } from "../src/attach.js"
import { meter } from "../src/metering.js"

// ---- fixtures (SYMBOLIC ids, per the goldens-pst concrete universe) -------------------------------------

const trailer7: Trailer = {
  WP: "WP-7",
  Model: "opus-4-8",
  Gates: "fmt,clippy,test",
  Verdict: "APPROVE",
  TranscriptSha: asHash("id-tr01"),
}

const dossier7: Dossier = { trailer: trailer7 }

// ======================================================================================================
// PERSIST-3 — provenance committed to trailer + note (differential vs ProvenanceApi)
// ======================================================================================================
describe("PERSIST-3 — trailer + note (de)serializer (visible goldens)", () => {
  // differential-vs-oracle: the facet conforms to the frozen ProvenanceApi surface.
  const prov: ProvenanceApi = { serialize, deserialize }

  it("SCN-PERSIST-3a-1: the trailer block round-trips all five provenance fields (0 missing)", () => {
    const back = prov.deserialize(prov.serialize(dossier7))
    expect(back).not.toBeNull()
    // all FIVE trailer fields read back exactly — teeth: a dropped Transcript-SHA would fail here.
    expect(back?.trailer).toEqual(trailer7)
    expect(back?.trailer.WP).toBe("WP-7")
    expect(back?.trailer.Model).toBe("opus-4-8")
    expect(back?.trailer.Gates).toBe("fmt,clippy,test")
    expect(back?.trailer.Verdict).toBe("APPROVE")
    expect(back?.trailer.TranscriptSha).toBe(asHash("id-tr01"))
  })

  it("SCN-PERSIST-3b-1: the note carries the same fields and reads back TOTAL (absent ⇒ null, never throws)", () => {
    // the note carries the same five fields (Note = Dossier) — round-trips identically.
    const note = prov.serialize(dossier7)
    expect(prov.deserialize(note)?.trailer).toEqual(trailer7)
    // total read: a commit with NO note yields null, never a throw (mirrors readDossierNote).
    expect(() => prov.deserialize("")).not.toThrow()
    expect(prov.deserialize("")).toBeNull()
    expect(prov.deserialize("   ")).toBeNull()
    expect(() => prov.deserialize("{not-json")).not.toThrow()
    expect(prov.deserialize("{not-json")).toBeNull()
    // a structurally-empty object (no trailer) is also an honest null, never a partial dossier.
    expect(prov.deserialize("{}")).toBeNull()
    // malformed trailer payloads are also absent, never partial provenance records.
    expect(prov.deserialize('{"trailer":[]}')).toBeNull()
    expect(prov.deserialize('{"trailer":{"WP":"WP-7"}}')).toBeNull()
  })
})

// ======================================================================================================
// PERSIST-4 — attachment = CAS pointers, content in the CAS (differential vs AttachApi)
// ======================================================================================================
describe("PERSIST-4 — index-as-attachment over the single CAS (visible goldens)", () => {
  const bodyB: CasObject = { kind: "blob", role: "large-body", payload: "SENTINEL-B-".repeat(64) }

  it("SCN-PERSIST-4a-1: a large body attaches as a `{hash}` pointer only (hash = sealed id(B))", () => {
    const att: AttachApi = createAttach()
    const pointer = att.attach(bodyB)
    // what is attached is the hashed index — the pointer, NOT B's bytes.
    expect(pointer).toEqual({ hash: id(bodyB) })
    // pointer carries ONLY the hash — teeth: inlining B would add body fields / bytes here.
    expect(Object.keys(pointer)).toEqual(["hash"])
    expect(JSON.stringify(pointer)).not.toContain("SENTINEL-B-")
  })

  it("SCN-PERSIST-4b-1: the body resolves from the single CAS by its content hash", () => {
    const att: AttachApi = createAttach()
    const pointer = att.attach(bodyB)
    expect(att.get(pointer.hash)).toEqual(bodyB)
  })

  it("SCN-PERSIST-4c-1 (guard): a large body is never inlined as a git object — attachment is pointer-only", () => {
    const att: AttachApi = createAttach()
    const pointer = att.attach(bodyB)
    // the size-gate: the only git-storable attachment is the pointer; it never contains B inlined.
    const attachmentBytes = JSON.stringify(pointer)
    expect(attachmentBytes).not.toContain("SENTINEL-B-")
    expect(attachmentBytes.length).toBeLessThan(JSON.stringify(bodyB).length)
    // and the body IS resolvable from the CAS (canonical container = CAS, not the git object).
    expect(att.get(pointer.hash)).toEqual(bodyB)
  })
})

// ======================================================================================================
// PERSIST-6 — full per-agent metering recorded (differential vs MeteringApi total-schema check)
// ======================================================================================================
describe("PERSIST-6 — complete per-agent Metering constructor (visible golden)", () => {
  const meterApi: MeteringApi = { meter }

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

  it("SCN-PERSIST-6-1: a recorded WP carries a complete Metering record (every field non-undefined)", () => {
    const wp7 = {
      model: "opus-4-8",
      tokensIn: 1200,
      tokensOut: 800,
      tokensCache: 300,
      toolUses: 7,
      wallTime: 4200,
      retries: 1,
      reworks: 2,
      gates: ["fmt", "clippy", "test"],
      verdict: "APPROVE",
      transcriptSha: asHash("id-tr01"),
    }
    const rec = meterApi.meter(wp7)
    // every required field present and non-`undefined` — teeth: an omitted retries/reworks reads undefined.
    for (const f of requiredFields) {
      expect(rec[f], `field ${f} must be present`).not.toBeUndefined()
    }
    expect(rec.retries).toBe(1)
    expect(rec.reworks).toBe(2)
    expect(rec.tokensCache).toBe(300)
    expect(rec.gates).toEqual(["fmt", "clippy", "test"])
  })

  it("SCN-PERSIST-6-1 (totality): even an opaque/empty WP yields a full schema — 0 undefined field", () => {
    for (const wp of [{}, undefined, null, 42, "x"]) {
      const rec = meterApi.meter(wp)
      for (const f of requiredFields) {
        expect(rec[f], `field ${f} must be present for wp=${String(wp)}`).not.toBeUndefined()
      }
    }
  })
})
