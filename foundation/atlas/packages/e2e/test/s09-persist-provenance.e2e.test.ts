// @atlas/e2e — S9 · Persistence is secret-scrubbed, provenance round-trips verifiably, work is metered,
//              and the transcript store is a faithful content-addressed round-trip.
// AXIS: SECURITY (redact-at-source + verifiable provenance) + EFFICIENCY (metering / accounting).
//
// STORY. Everything Atlas persists must be trustworthy on four fronts, all at once:
//   (1) a raw credential can NEVER land in the immutable, content-addressed record — `scrub` redacts the
//       credential SHAPE at source, and the write gate `admitToBuffer` scrubs a chunk BEFORE it enters the
//       transcript buffer (redact-at-source, not a post-hoc scan), preserving every non-secret byte,
//   (2) per-commit provenance is a verifiable round-trip — `deserialize(serialize(dossier))` reproduces the
//       whole `Dossier` and every one of the five `Trailer` fields, and the read is TOTAL (malformed /
//       empty input ⇒ `null`, never a throw),
//   (3) an agent's work is fully accounted — `meter(wp)` yields a COMPLETE 11-field record with 0
//       `undefined` field, even for an opaque / empty / absent `wp`,
//   (4) the large-object transcript store is a lossless content-addressed round-trip — `put` is idempotent,
//       `fetch` returns byte-identical bytes, and a missing `fetch` FAILS CLOSED (throws), while the
//       attach surface resolves a body by content hash and returns `undefined` (never throws) on a miss.
//
// This composes the REAL wired runtime of @atlas/persist across the package seam (barrel imports), with all
// content-addressing flowing through the SEALED @atlas/kernel `id` / `asHash` seam — no hand-rolled digest,
// no fabricated hex. Fixtures mirror the proven `packages/persist/test` universe (Dossier/Trailer/Metering/
// Transcript), never re-derived.
//
// NON-GOAL (explicit, per recon): only the GitHub-token credential family ships in `scrub`. This story does
// NOT assert general PII / email redaction — that ≥2-engine scanner backstop is billy's FR-12 domain, not on
// the S9 path. Source-portability / re-invoke (persist/ref/{source,reinvoke}.ts, OWNER-DEFINE) are OFF-path
// and untouched here.

import { describe, it, expect } from "vitest"
import { asHash } from "@atlas/kernel"
import type { CasObject } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import {
  scrub,
  admitToBuffer,
  serialize,
  deserialize,
  meter,
  createTranscriptStore,
  toGitPointer,
  createAttach,
} from "@atlas/persist"
import type { Dossier, Trailer, Metering } from "@atlas/persist"

const enc = new TextEncoder()
const dec = new TextDecoder()
// TextEncoder yields Uint8Array<ArrayBufferLike>; the persist buffers are Uint8Array<ArrayBuffer> — copy into a fresh ArrayBuffer-backed view.
const bytes = (s: string): Uint8Array => new Uint8Array(enc.encode(s))

/** Count raw-secret occurrences in a byte body (fixtures are ASCII text). */
function occurrences(bytes: Uint8Array, needle: string): number {
  return dec.decode(bytes).split(needle).length - 1
}

// ── fixtures (mirror packages/persist/test; SYMBOLIC ids through the sealed seam) ─────────────────────
// A GitHub-token-shaped credential (ghp_ + ≥6 token chars) — matched by SHAPE, never a hard-coded literal.
const SECRET = "ghp_A1B2C3D4E5F6"

const trailer9: Trailer = {
  WP: "WP-9",
  Model: "opus-4-8",
  Gates: "fmt,clippy,test",
  Verdict: "APPROVE",
  TranscriptSha: asHash("id-tr09"),
}
const dossier9: Dossier = { trailer: trailer9 }

const meteringFields: readonly (keyof Metering)[] = [
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

describe("S9 · persistence — scrubbed, verifiably provenanced, metered, faithfully content-addressed", () => {
  // ── 1 · SECRET SCRUB (security — redact-at-source, byte-preserving) ─────────────────────────────────
  it("redacts a credential SHAPE at source and never admits it into the persisted buffer", () => {
    const seeded = bytes(`call log: agent used token ${SECRET} at line 7`)

    const scrubbed = scrub(seeded)
    // the credential bytes become `[REDACTED]`; every surrounding byte is byte-identical (0 over-redaction).
    expect(dec.decode(scrubbed)).toBe("call log: agent used token [REDACTED] at line 7")
    expect(occurrences(scrubbed, SECRET)).toBe(0)

    // the write gate scrubs the chunk BEFORE it lands in the transcript buffer (not a post-hoc scan).
    const buffer = admitToBuffer(new Uint8Array(0), bytes(`about to write ${SECRET} into transcript`))
    // teeth (breaks-on "a credential-shaped token survives into the persisted buffer"):
    expect(occurrences(buffer, SECRET)).toBe(0)
    expect(dec.decode(buffer)).not.toContain(SECRET)
    // redaction, not a dropped write — the non-secret framing survives verbatim.
    expect(dec.decode(buffer)).toBe("about to write [REDACTED] into transcript")
  })

  // ── 2 · VERIFIABLE PROVENANCE ROUND-TRIP (security — the trailer is the verifiable record) ──────────
  it("round-trips the whole Dossier with all five trailer fields, and reads TOTAL (malformed ⇒ null)", () => {
    const back = deserialize(serialize(dossier9))
    expect(back).not.toBeNull()
    // the whole dossier is reproduced, and each of the five trailer fields survives verbatim.
    expect(back).toEqual(dossier9)
    expect(back?.trailer.WP).toBe("WP-9")
    expect(back?.trailer.Model).toBe("opus-4-8")
    expect(back?.trailer.Gates).toBe("fmt,clippy,test")
    expect(back?.trailer.Verdict).toBe("APPROVE")
    expect(back?.trailer.TranscriptSha).toBe(asHash("id-tr09"))

    // TOTAL read: malformed / empty / no-trailer input yields null, NEVER a throw.
    // teeth (breaks-on "provenance loses a trailer field, or throws instead of returning null on malformed input"):
    expect(() => deserialize("not a dossier")).not.toThrow()
    expect(deserialize("not a dossier")).toBeNull()
    expect(() => deserialize("")).not.toThrow()
    expect(deserialize("")).toBeNull()
    expect(deserialize("{}")).toBeNull() // structurally-incomplete (no trailer) ⇒ honest null
  })

  // ── 3 · METERING TOTAL (efficiency — the accounting record is never partial) ────────────────────────
  it("meters a WP into a COMPLETE 11-field record, and stays total for an opaque / absent WP", () => {
    const wp9 = {
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
      transcriptSha: asHash("id-tr09"),
    }
    const rec = meter(wp9)
    // every accounting field is populated from the WP.
    expect(rec.retries).toBe(1)
    expect(rec.reworks).toBe(2)
    expect(rec.tokensCache).toBe(300)
    expect(rec.gates).toEqual(["fmt", "clippy", "test"])

    // teeth (breaks-on "a metering field is undefined — the accounting record is partial"):
    // total over opaque / empty / absent WP — every field defined, never a throw.
    for (const wp of [wp9, {}, undefined, null, 42]) {
      const r = meter(wp)
      for (const f of meteringFields) {
        expect(r[f], `field ${f} must be present for wp=${String(wp)}`).not.toBeUndefined()
      }
    }
  })

  // ── 4 · CAS ROUND-TRIP + FAIL-CLOSED MISS (efficiency — faithful content-addressed store) ───────────
  it("round-trips the transcript store idempotently and fails CLOSED on a missing fetch", () => {
    const store = createTranscriptStore()
    const body = bytes("seat brief\nLLM: reasoned\ntool: read(x)\nresult: 0..255 bytes retained in full\n")

    const h1 = store.put(body)
    const h2 = store.put(body) // same body ⇒ same content hash (idempotent)
    expect(h2).toBe(h1)

    const got = store.fetch(toGitPointer(h1))
    // byte-identity round-trip — never truncated, never lossily abridged.
    expect(got).toEqual(body)
    expect(Array.from(got)).toEqual(Array.from(body))
    expect(got.length).toBe(body.length)

    // teeth (breaks-on "the store returns wrong/partial bytes, or silently succeeds on a missing fetch"):
    // a never-put pointer fails CLOSED — throws, never returns wrong/empty bytes.
    const neverPut = toGitPointer(asHash("never-put-pointer"))
    expect(() => store.fetch(neverPut)).toThrow()
  })

  it("attaches a body as a content-hash pointer that round-trips, and returns undefined on a miss", () => {
    const att = createAttach()
    const bodyB: CasObject = { kind: "blob", role: "large-body", payload: "SENTINEL-B-".repeat(64) }

    const pointer = att.attach(bodyB)
    // what is attached is the hashed pointer alone — the body is resolvable from the single CAS by hash.
    expect(Object.keys(pointer)).toEqual(["hash"])
    expect(att.get(pointer.hash)).toEqual(bodyB)

    // teeth (breaks-on "the store returns wrong/partial bytes, or silently succeeds on a missing fetch"):
    // a never-attached hash resolves to an honest `undefined` handle — no throw (total, fail-soft on read).
    const unknownHash: Hash = asHash("never-attached-hash")
    expect(() => att.get(unknownHash)).not.toThrow()
    expect(att.get(unknownHash)).toBeUndefined()
  })
})
