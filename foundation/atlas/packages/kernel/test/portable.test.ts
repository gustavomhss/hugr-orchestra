// @atlas/kernel — test/portable.test.ts
//
// RED→GREEN transcription of the VISIBLE goldens for the OKF (open-JSON) CAS export/import
// (KERNEL-6a/6b) plus the ∀-law PROP-KERNEL-6 (portability). The CAS store IMPL is built by another WP
// in parallel, so the CAS snapshot is HAND-CONSTRUCTED here from the frozen ref/types.ts (a `Map`), and
// the facet is imported DIRECTLY from ../src/portable.js (the barrel is wired by the lead at SEAL).
// Content-addressed keys use the sealed `id` seam (never a hand-rolled digest). Golden ids are SYMBOLIC,
// so every assertion is RELATIONAL / round-trip — never a specific hex digest. Held-out `-2` fixtures are
// NOT transcribed (GATE runs those).

import { describe, it, expect } from "vitest"
import fc from "fast-check"
import type { Hash } from "@atlas/contracts"
// NOTE: this was `from '../ref/types.js'` — a path that does NOT exist in this repo (there is no
// `packages/kernel/ref/`). As a type-only import esbuild erased it outright, so vitest never saw the
// missing module and `Cas`/`CasObject` were never checked against anything. The real declarations are in
// src/types.ts (where `CasObject = unknown`, so the annotations below are permissive by construction).
import type { Cas, CasObject } from "../src/types.js"
import type { NodeKey } from "@atlas/contracts"
import { eventId } from "../src/log.js"
import { id } from "../src/index.js"
import { asHash } from "../src/brand.js"
import { exportCas, importCas, makePortable } from "../src/portable.js"

// Markers that a self-contained, host-independent dump MUST NOT carry: absolute host paths, a file://
// URL, a Windows drive path, or an on-disk db reference — every one breaks a cross-machine replay.
const HOST_REF = /\/Users\/|\/home\/|file:\/\/|[A-Za-z]:\\|\.db\b/
// A proprietary / binary encoding leak (the dump must be plain UTF-8 open JSON, not an opaque blob).
const PROPRIETARY = /\0|application\/octet-stream|;base64,/

describe("KERNEL-6 — OKF open-JSON export/import of the CAS (visible goldens)", () => {
  it("SCN-KERNEL-6a-1: export→import round-trips 1:1 (deepEqual) into a fresh store", () => {
    // A CAS holding {N, K, M} — a structural node, a knowledge fact, a memory entry (opaque bodies).
    const N: CasObject = { kind: "StructuralNode", anchor: "pkg/mod", slot: "decl", children: [1, 2] }
    const K: CasObject = { kind: "KnowledgeFact", subject: "s", predicate: "is", object: "y" }
    const M: CasObject = { kind: "MemoryEntry", seat: "forge", note: "observed", tags: ["a", "b"] }
    const cas: Cas = new Map<Hash, CasObject>([
      [id(N), N],
      [id(K), K],
      [id(M), M],
    ])

    const round = importCas(exportCas(cas))

    // the open-JSON dump replays 1:1 into a fresh store (a brand-new Map), content-key preserved
    expect(round).toEqual(cas)
    expect(round).toBeInstanceOf(Map)
    expect(round).not.toBe(cas) // a fresh store, not the same reference
    // teeth (breaks-on "export omits the version map — import(export(cas)) loses M and ≠ cas"):
    // every entry survives — all three keys present, M recovered under its exact content id.
    expect(round.size).toBe(3)
    expect(round.get(id(M))).toEqual(M)
  })

  it("SCN-KERNEL-6b-1: export carries no host/external/proprietary reference", () => {
    const cas: Cas = new Map<Hash, CasObject>([
      [id({ kind: "StructuralNode", anchor: "a/b" }), { kind: "StructuralNode", anchor: "a/b" }],
      [id({ kind: "MemoryEntry", note: "n" }), { kind: "MemoryEntry", note: "n" }],
    ])

    const dump = exportCas(cas)

    // the dump is plain, self-contained open JSON (it parses; no host dependency to resolve)
    expect(() => JSON.parse(dump) as unknown).not.toThrow()
    // teeth (breaks-on "export embeds an absolute host path `/Users/…/atlas.db`"): the scan finds 0.
    expect(dump).not.toMatch(HOST_REF)
    // no external reference / proprietary binary encoding leaks — the dump is UTF-8 JSON text only.
    expect(dump).not.toMatch(PROPRIETARY)
  })

  it("makePortable conforms to the frozen PortableApi and round-trips 1:1", () => {
    const obj: CasObject = { kind: "KnowledgeFact", v: 1 }
    const cas: Cas = new Map<Hash, CasObject>([[id(obj), obj]])
    const api = makePortable(cas)
    // both the free-function path and the frozen-interface path replay identically
    expect(importCas(api.export())).toEqual(cas)
    expect(api.import(api.export())).toEqual(cas)
  })
})

// Bounded generators for the portability ∀-law: a random CAS = fake content-hash keys (lower-hex) mapped
// to host-path-free JSON bodies (drawn from a pool with no `/`, `:`, `\`, so no generated body can spell
// a host path — the law tests what the SERIALIZER adds, never the user's data).
const hexKeyArb = fc
  .stringOf(fc.constantFrom(..."0123456789abcdef".split("")), { minLength: 8, maxLength: 16 })
  .map(asHash)
const leafArb = fc.oneof(
  fc.constant(null),
  fc.boolean(),
  fc.integer(),
  fc.stringOf(fc.constantFrom(..."abcdefghij0123456789 ".split("")), { maxLength: 8 }),
)
const bodyArb = fc.oneof(
  leafArb,
  fc.array(leafArb, { maxLength: 4 }),
  fc.dictionary(fc.stringOf(fc.constantFrom(..."abcdef".split("")), { minLength: 1, maxLength: 4 }), leafArb, {
    maxKeys: 4,
  }),
)
const casArb: fc.Arbitrary<Cas> = fc
  .array(fc.tuple(hexKeyArb, bodyArb), { maxLength: 8 })
  .map((entries) => new Map<Hash, CasObject>(entries))

describe("PROP-KERNEL-6 — portability (∀-law)", () => {
  it("∀ cas C: deepEqual(C, import(export(C))) ∧ export adds 0 host/external/proprietary refs", () => {
    fc.assert(
      fc.property(casArb, (cas) => {
        const dump = exportCas(cas)
        expect(importCas(dump)).toEqual(cas) // replays 1:1 into a fresh store over arbitrary contents
        expect(dump).not.toMatch(HOST_REF) // self-contained, host-independent
        expect(dump).not.toMatch(PROPRIETARY)
      }),
    )
  })

  it("export is deterministic — key-order independent (a stable, replayable dump)", () => {
    fc.assert(
      fc.property(casArb, (cas) => {
        const reordered = new Map<Hash, CasObject>([...cas.entries()].reverse())
        // same content, different insertion order ⟹ byte-identical dump (else replay is presentation-bound)
        expect(exportCas(reordered)).toBe(exportCas(cas))
      }),
    )
  })
})

// ── KERNEL-1/3 · the re-derivation on import (regression) ──────────────────────────────────────────
//
// `casArb` above deliberately mints FAKE content-hash keys (8-16 hex chars) unrelated to their bodies, so
// PROP-KERNEL-6 as transcribed quantifies over arbitrary key->body MAPS, not over CASes. That makes it
// structurally unable to witness a door that never re-derives the address it is handed. The ratified law
// says `arbitrary: random CAS contents`, and a CAS is content-keyed by KERNEL-3 — so the generator below
// (key = `id(body)`, through the sealed seam) is the FAITHFUL reading, and it is added alongside rather
// than replacing the original, which still usefully covers the non-address pass-through.
const addressedCasArb: fc.Arbitrary<Cas> = fc
  .array(bodyArb, { maxLength: 8 })
  .map((bodies) => new Map<Hash, CasObject>(bodies.map((b) => [id(b as CasObject), b as CasObject])))

describe("KERNEL-1/3 — import re-derives the content address it is handed", () => {
  it("∀ genuinely content-addressed CAS C: import(export(C)) === C", () => {
    fc.assert(
      fc.property(addressedCasArb, (cas) => {
        expect(importCas(exportCas(cas))).toEqual(cas)
      }),
    )
  })

  it("∀ tampered body under an honest key: import REJECTS (never a fabricated store)", () => {
    fc.assert(
      fc.property(bodyArb, bodyArb, (a, b) => {
        fc.pre(id(a as CasObject) !== id(b as CasObject)) // two genuinely different facts
        const key = id(a as CasObject) // the HONEST fact's address ...
        const dump = JSON.stringify({ format: "atlas-okf", version: 1, objects: { [key]: b } }) // ... other body
        // teeth (breaks-on "import trusts the key the dump asserts"): before the guard this returned a
        // store mapping the honest address to the forged body, silently, for EVERY pair.
        expect(() => importCas(dump)).toThrow(/not addressed by its content/)
      }),
    )
  })

  it("the EventLog seam is honoured — a real log round-trips, a forged self-declared id does not", () => {
    // `persist/src/reconstruct.ts` replays an EventLog through this door. An EventLog is keyed by
    // `eventId` (which drops the `id` field and pins `seq`), NOT by `id` — measured, they never agree —
    // so a guard that knew only `id` would reject every event log in production.
    const content = { nodeKey: "claim:x" as NodeKey, contentHash: "ch-1" as Hash, fresh: true, supersedes: [], seq: 5 }
    const ev = { ...content, id: eventId(content as never) }
    const log = new Map<Hash, CasObject>([[ev.id, ev as unknown as CasObject]])
    expect(eventId(content as never)).not.toBe(id(ev as unknown as CasObject)) // the two seams differ
    expect(importCas(exportCas(log)).get(ev.id)).toEqual(ev) // the legitimate path survives

    // `eventId` ignores the `id` FIELD, so the field must be pinned to the key as well — otherwise a bundle
    // could carry an event whose self-declared id disagrees with the address it is filed under.
    const forged = { ...ev, id: "f".repeat(64) }
    const dump = JSON.stringify({ format: "atlas-okf", version: 1, objects: { [ev.id]: forged } })
    expect(() => importCas(dump)).toThrow(/not addressed by its content/)
  })
})
