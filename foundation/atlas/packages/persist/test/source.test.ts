// @atlas/persist — test/source.test.ts
//
// RED→GREEN transcription of the VISIBLE goldens for the portable-source assembly (PERSIST-1) and the
// full-store open-JSON (OKF) export path (PERSIST-9), plus the ∀-laws PROP-PERSIST-1 (portable-source
// totality) and PROP-PERSIST-9 (portability). The facet is imported DIRECTLY from ../src/source.js (the
// barrel is wired by the lead at SEAL). The full-store export path REUSES the SEALED kernel OKF seam
// (@atlas/kernel `exportCas`/`importCas` via the persist wrappers). Content-addressed keys use the sealed
// `id` seam (never a hand-rolled digest). Golden ids are SYMBOLIC, so every assertion is RELATIONAL /
// round-trip — never a specific hex digest. Held-out `-2` fixtures are NOT transcribed (GATE runs those).

import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { id, asHash } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import type { Cas, CasObject } from "@atlas/kernel"
import type { Trailer } from "../src/types.js"
import type { SourceApi } from "../src/source.js"
import { clone, soleHomeViolations, exportStore, importStore } from "../src/source.js"
import type { Home, Placement } from "../src/source.js"

// Lock-in markers a portable, git-replayable dump MUST NOT carry (mirrors the KERNEL-6 lock-in grep):
// absolute host paths, a file:// URL, a Windows drive path, an on-disk db handle, or a proprietary /
// base64 binary encoding — every one breaks a plain-git, cross-machine replay.
const LOCK_IN = /\/Users\/|\/home\/|file:\/\/|[A-Za-z]:\\|\.db\b|application\/octet-stream|;base64,/

const aTrailer: Trailer = {
  WP: "WP-1.1-b.PERSIST",
  Model: "model",
  Gates: "typecheck,vitest",
  Verdict: "PASS",
  TranscriptSha: asHash("transcript-sha"),
}

describe("PERSIST-1 — portable source = tracked store + trailers (visible goldens)", () => {
  it("SCN-PERSIST-1a-1: a bare clone rebuilds every datum from {store, trailer}; the PR attachment is never consulted", () => {
    const D: CasObject = { kind: "StructuralNode", anchor: "pkg/mod", slot: "decl" }
    // a poison datum whose only home is the PR attachment — a bare clone MUST NOT surface it.
    const prOnly: CasObject = { kind: "StructuralNode", anchor: "pr/only", slot: "ghost" }
    const source = {
      placements: [
        { value: D, homes: ["store", "trailer"] },
        { value: prOnly, homes: ["pr-attachment"] },
      ],
      trailers: [aTrailer],
    }

    const portable = clone(source)
    // the portable source is exactly {store, trailers} — the trailers travel verbatim.
    expect(portable.trailers).toEqual([aTrailer])
    expect(typeof portable.store).toBe("string")

    // rebuild Atlas state from the portable source ALONE (import the OKF store over the sealed kernel seam).
    const rebuilt = importStore(portable.store)
    // D is fully reconstructed from {store, trailer} — its content key resolves.
    expect(rebuilt.get(id(D))).toEqual(D)
    // teeth (breaks-on "D's value is reconstructable only from the PR attachment — the bare clone rebuilds
    // Atlas without D"): the PR-attachment-only datum is ABSENT from the bare clone (it was a projection).
    expect(rebuilt.has(id(prOnly))).toBe(false)
  })

  it("SCN-PERSIST-1b-1: a PR-attachment-only datum fails the sole-home check", () => {
    const D: CasObject = { kind: "MemoryEntry", note: "pr-only datum" }
    const safe: CasObject = { kind: "StructuralNode", anchor: "ok" }
    const source = {
      placements: [
        { value: D, homes: ["pr-attachment"] }, // sole home = PR attachment → rejected
        { value: safe, homes: ["store", "pr-attachment"] }, // home ⊋ {PR-attachment} → allowed
      ],
      trailers: [],
    }

    const violations = soleHomeViolations(source)
    // exactly the PR-attachment-only datum is rejected (∀ datum: home ⊋ {PR-attachment}).
    expect(violations).toHaveLength(1)
    expect(violations[0]?.value).toEqual(D)
    // teeth (breaks-on "the placement check permits a PR-attachment-only home"): the store+PR datum passes.
    expect(violations.some((v) => v.value === safe)).toBe(false)
  })
})

describe("PERSIST-9 — full-store open-JSON export, no lock-in (visible goldens)", () => {
  it("SCN-PERSIST-9a-1: export→import replays 1:1 into a fresh store", () => {
    const N: CasObject = { kind: "StructuralNode", anchor: "pkg/mod", children: [1, 2] }
    const K: CasObject = { kind: "KnowledgeFact", subject: "s", predicate: "is", object: "y" }
    const M: CasObject = { kind: "MemoryEntry", seat: "forge", note: "observed" }
    const store: Cas = new Map<Hash, CasObject>([
      [id(N), N],
      [id(K), K],
      [id(M), M],
    ])

    const round = importStore(exportStore(store))
    // the open-JSON dump replays 1:1 into a fresh store (a brand-new Map), content-key preserved.
    expect(round).toEqual(store)
    expect(round).toBeInstanceOf(Map)
    expect(round).not.toBe(store)
    // teeth (breaks-on "export omits the version map — import(export(store)) loses M and ≠ store"):
    // every entry survives — all three keys present, M recovered under its exact content id.
    expect(round.size).toBe(3)
    expect(round.get(id(M))).toEqual(M)
  })

  it("SCN-PERSIST-9b-1: the export dump carries zero lock-in encodings", () => {
    const store: Cas = new Map<Hash, CasObject>([
      [id({ kind: "StructuralNode", anchor: "a/b" }), { kind: "StructuralNode", anchor: "a/b" }],
      [id({ kind: "MemoryEntry", note: "n" }), { kind: "MemoryEntry", note: "n" }],
    ])

    const dump = exportStore(store)
    // the dump is plain, self-contained open JSON — nothing layered on git that a plain git store cannot replay.
    expect(() => JSON.parse(dump) as unknown).not.toThrow()
    // teeth (breaks-on "export embeds a proprietary lock-in encoding"): the scan finds 0.
    expect(dump).not.toMatch(LOCK_IN)
    // and it still replays into a plain fresh store (the no-lock-in guarantee is operational, not cosmetic).
    expect(importStore(dump)).toEqual(store)
  })
})

// ---- ∀-laws (frozen PBT, PROP-PERSIST-1 / PROP-PERSIST-9) ----

// An arbitrary placement set: each datum routed to some NON-EMPTY subset of {store, trailer, note,
// PR-attachment}. Values are indexed (`n`) so every datum has a distinct content id (no collisions).
const homeArb = fc.constantFrom<Home>("store", "trailer", "note", "pr-attachment")
const placementSetArb = fc
  .array(fc.uniqueArray(homeArb, { minLength: 1, maxLength: 4 }), { maxLength: 8 })
  .map((homesList) => ({
    placements: homesList.map((homes, n): Placement => ({ value: { kind: "D", n }, homes })),
    trailers: [] as Trailer[],
  }))

describe("PROP-PERSIST-1 — portable-source totality (∀-law)", () => {
  it("∀ placement set: every store-homed datum rebuilds from {store,trailer}; 0 PR-only home survives the clone", () => {
    fc.assert(
      fc.property(placementSetArb, (source) => {
        const portable = clone(source)
        const rebuilt = importStore(portable.store)
        for (const p of source.placements) {
          if (p.homes.includes("store")) {
            // a stored datum is reconstructable from the portable source alone.
            expect(rebuilt.get(id(p.value))).toEqual(p.value)
          } else if (p.homes.length === 1 && p.homes[0] === "pr-attachment") {
            // a PR-attachment-only datum is NEVER surfaced by a bare clone (its sole home is a projection).
            expect(rebuilt.has(id(p.value))).toBe(false)
          }
        }
        // sole-home invariant: exactly the PR-only datums are flagged (home ⊋ {PR-attachment} violated).
        const prOnly = source.placements.filter((p) => p.homes.length === 1 && p.homes[0] === "pr-attachment")
        expect(soleHomeViolations(source)).toHaveLength(prOnly.length)
      }),
    )
  })
})

// A random full store: fake content-hash keys (lower-hex) mapped to host-path-free JSON bodies (drawn from
// a pool with no `/`, `:`, `\`, so no generated body can spell a host path — the law tests what the export
// path ADDS, never the user's data). Mirrors the KERNEL-6 portability generator.
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

describe("PROP-PERSIST-9 — portability: export→import byte-identical (∀-law)", () => {
  it("∀ store s: deepEqual(s, import(export(s))) ∧ export adds 0 lock-in encodings", () => {
    fc.assert(
      fc.property(casArb, (store) => {
        const dump = exportStore(store)
        expect(importStore(dump)).toEqual(store) // replays 1:1 into a fresh store over arbitrary contents
        expect(dump).not.toMatch(LOCK_IN) // self-contained, host-independent — no lock-in layered on git
      }),
    )
  })
})

// differential-vs-oracle (compile-time, documentary): the impl's `clone` conforms to the frozen SourceApi.
const _conforms: SourceApi = { clone }
void _conforms
