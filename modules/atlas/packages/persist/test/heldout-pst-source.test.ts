// @atlas/persist — test/heldout-pst-source.test.ts
//
// GATE held-out leg (cold-review MICROSCOPE seat). Fresh transcription of the `-2` fixtures the author was
// BLINDED to: SCN-PERSIST-1a-2, 1b-2, 9a-2, 9b-2 (all held_out:true). Relational / round-trip assertions
// only — no hex digest is hard-coded. Runs against the author's src/source.ts UNCHANGED. Any failure = overfit.

import { describe, it, expect } from "vitest"
import { id, asHash } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import type { Cas, CasObject } from "@atlas/kernel"
import type { Trailer } from "../src/types.js"
import { clone, soleHomeViolations, exportStore, importStore } from "../src/source.js"

const LOCK_IN = /\/Users\/|\/home\/|file:\/\/|[A-Za-z]:\\|\.db\b|application\/octet-stream|;base64,/

const aTrailer: Trailer = {
  WP: "WP-1.1-b.PERSIST",
  Model: "model",
  Gates: "typecheck,vitest",
  Verdict: "PASS",
  TranscriptSha: asHash("transcript-sha-2"),
}

describe("held-out GATE — PERSIST-1 / PERSIST-9", () => {
  it('SCN-PERSIST-1a-2: a bare clone rebuilds a Knowledge fact K=(claim:acme-hq→"NYC") from {store,trailer}', () => {
    const K: CasObject = { kind: "KnowledgeFact", claim: "acme-hq", object: "NYC" }
    // a projection-only fact: its sole home is the PR attachment — a bare clone MUST NOT surface it.
    const prOnly: CasObject = { kind: "KnowledgeFact", claim: "ghost", object: "nowhere" }
    const source = {
      placements: [
        { value: K, homes: ["store", "trailer"] },
        { value: prOnly, homes: ["pr-attachment"] },
      ],
      trailers: [aTrailer],
    }

    const portable = clone(source)
    expect(portable.trailers).toEqual([aTrailer])
    const rebuilt = importStore(portable.store)
    // K is fully reconstructed from the portable source alone; the PR attachment was never consulted.
    expect(rebuilt.get(id(K))).toEqual(K)
    // the PR-attachment-only fact is absent from the bare clone (it was a projection).
    expect(rebuilt.has(id(prOnly))).toBe(false)
  })

  it("SCN-PERSIST-1b-2: a PR-attachment-only Memory entry M fails the sole-home check", () => {
    const M: CasObject = { kind: "MemoryEntry", seat: "forge", note: "seat-scoped memory line" }
    const safe: CasObject = { kind: "MemoryEntry", seat: "forge", note: "also stored", homeHint: "store" }
    const source = {
      placements: [
        { value: M, homes: ["pr-attachment"] }, // sole home = PR attachment → rejected
        { value: safe, homes: ["trailer", "pr-attachment"] }, // home ⊋ {PR-attachment} → allowed
      ],
      trailers: [],
    }

    const violations = soleHomeViolations(source)
    expect(violations).toHaveLength(1)
    expect(violations[0]?.value).toEqual(M)
    expect(violations.some((v) => v.value === safe)).toBe(false)
  })

  it("SCN-PERSIST-9a-2: export→import replays 1:1 for a store with an archived entry", () => {
    const N2: CasObject = { kind: "StructuralNode", anchor: "pkg2/mod2", children: [3, 4, 5] }
    const K2: CasObject = { kind: "KnowledgeFact", claim: "k2", object: "v2" }
    const k: CasObject = { kind: "KnowledgeFact", claim: "c", object: "old", rev: 1 }
    const kPrime: CasObject = { kind: "KnowledgeFact", claim: "c", object: "new", rev: 2, supersedes: "old" }
    const archived: CasObject = { kind: "ArchivedEntry", reason: "retired", payload: { was: "live" } }
    const store: Cas = new Map<Hash, CasObject>([
      [id(N2), N2],
      [id(K2), K2],
      [id(k), k],
      [id(kPrime), kPrime],
      [id(archived), archived],
    ])

    const round = importStore(exportStore(store))
    expect(round).toEqual(store)
    expect(round).toBeInstanceOf(Map)
    expect(round).not.toBe(store)
    expect(round.size).toBe(5)
    // the archived entry survives the round-trip under its exact content id.
    expect(round.get(id(archived))).toEqual(archived)
  })

  it("SCN-PERSIST-9b-2: the export dump of the archive-bearing store carries zero lock-in encodings", () => {
    const N2: CasObject = { kind: "StructuralNode", anchor: "a/b/c" }
    const archived: CasObject = { kind: "ArchivedEntry", reason: "retired" }
    const store: Cas = new Map<Hash, CasObject>([
      [id(N2), N2],
      [id(archived), archived],
    ])

    const dump = exportStore(store)
    expect(() => JSON.parse(dump) as unknown).not.toThrow()
    expect(dump).not.toMatch(LOCK_IN)
    // still replays into a plain fresh store (no-lock-in is operational, not cosmetic).
    expect(importStore(dump)).toEqual(store)
  })
})
