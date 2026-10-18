// @atlas/kernel — test/heldout-krn-portable.test.ts
//
// MICROSCOPE cold-review GATE (held-out leg). Fresh cases authored from the `held_out: true` -2 fixtures
// the WP-1.1-b.KERNEL builder was BLINDED to: SCN-KERNEL-6a-2 (a CAS carrying an event log + a folded
// union node round-trips 1:1) and SCN-KERNEL-6b-2 (no env-relative / proprietary-binary leak, AND the
// malformed-envelope fail-closed path). All assertions are RELATIONAL / round-trip — never a hex digest;
// content keys are minted through the sealed `id` seam. Run against author src UNCHANGED.

import { describe, it, expect } from "vitest"
import type { Hash, NodeKey } from "@atlas/contracts"
import type { Cas, CasObject } from "../src/types.js"
import { id } from "../src/index.js"
import { asHash } from "../src/brand.js"
import { exportCas, importCas } from "../src/portable.js"

// The event universe of goldens-krn.md (plain-JSON opaque CAS bodies — the reference keeps the stored
// body opaque JSON, fspec-merge:107). contentHash values are the frozen fixture hashes.
const e1 = {
  kind: "Event",
  nodeKey: "claim:acme-arr-2024",
  seq: 1,
  contentHash: "1c9f2a",
  fresh: true,
  supersedes: [] as string[],
}
const e2 = {
  kind: "Event",
  nodeKey: "claim:acme-arr-2024",
  seq: 2,
  contentHash: "7e40bb",
  fresh: true,
  supersedes: [] as string[],
}
const e3 = {
  kind: "Event",
  nodeKey: "claim:acme-hq",
  seq: 3,
  contentHash: "3d81ee",
  fresh: true,
  supersedes: [] as string[],
}

// The folded union node claim:acme-arr-2024 = {e1,e2} — entries as a plain-JSON object keyed by
// contentHash (fspec-merge:138), so the whole node is an open-JSON CasObject.
const unionNode = {
  kind: "Node",
  nodeKey: "claim:acme-arr-2024",
  entries: { "1c9f2a": e1, "7e40bb": e2 },
}

// Env-relative + proprietary-binary leak markers (SCN-6b-2): none may appear in the serializer's envelope.
const ENV_REF = /\$ATLAS_HOME|\bfile:\/\/|~\/|%[A-Z_]+%/
const PROPRIETARY_BIN = /;base64,|application\/octet-stream|"blob"\s*:\s*"[A-Za-z0-9+/]{16,}={0,2}"/

describe("GATE held-out — SCN-KERNEL-6a-2: CAS with event log + union node round-trips 1:1", () => {
  it("deepEqual(cas, import(export(cas))) with the log {e1,e2,e3} AND the union node preserved", () => {
    const cas: Cas = new Map<Hash, CasObject>([
      [id(e1), e1],
      [id(e2), e2],
      [id(e3), e3],
      [id(unionNode), unionNode],
    ])

    const round = importCas(exportCas(cas))

    // 1:1 replay into a FRESH store — the log AND the union node survive verbatim.
    expect(round).toEqual(cas)
    expect(round).toBeInstanceOf(Map)
    expect(round).not.toBe(cas)
    // held-out teeth (breaks-on "export omits the EventLog so the union node can't be re-folded"):
    // every log entry AND the union node present under its exact content id — nothing dropped.
    expect(round.size).toBe(4)
    expect(round.get(id(e1))).toEqual(e1)
    expect(round.get(id(e2))).toEqual(e2)
    expect(round.get(id(e3))).toEqual(e3)
    // the union node re-resolves 1:1 — a re-fold would reproduce {e1,e2} on claim:acme-arr-2024.
    expect(round.get(id(unionNode))).toEqual(unionNode)
    expect((round.get(id(unionNode)) as typeof unionNode).entries).toEqual({ "1c9f2a": e1, "7e40bb": e2 })
  })
})

describe("GATE held-out — SCN-KERNEL-6b-2: no env/binary leak + malformed-envelope fails closed", () => {
  const cas: Cas = new Map<Hash, CasObject>([
    [id(e1), e1],
    [id(unionNode), unionNode],
  ])

  it("the dump carries no env-relative reference and no proprietary binary encoding — open JSON only", () => {
    const dump = exportCas(cas)
    expect(() => JSON.parse(dump) as unknown).not.toThrow()
    // 0 env-relative refs ($ATLAS_HOME, file://, ~/, %VAR%) and 0 proprietary binary encodings (base64 blob).
    expect(dump).not.toMatch(ENV_REF)
    expect(dump).not.toMatch(PROPRIETARY_BIN)
    // and it still replays 1:1 (self-contained).
    expect(importCas(dump)).toEqual(cas)
  })

  it("import FAILS CLOSED on a structurally-malformed envelope (never a partial/fabricated store)", () => {
    // non-JSON text
    expect(() => importCas("}{ not json")).toThrow()
    // valid JSON but no OKF envelope
    expect(() => importCas("null")).toThrow()
    expect(() => importCas("42")).toThrow()
    expect(() => importCas("[]")).toThrow()
    // wrong format tag
    expect(() => importCas(JSON.stringify({ format: "not-okf", version: 1, objects: {} }))).toThrow()
    // missing / wrong-typed version
    expect(() => importCas(JSON.stringify({ format: "atlas-okf", objects: {} }))).toThrow()
    expect(() => importCas(JSON.stringify({ format: "atlas-okf", version: "1", objects: {} }))).toThrow()
    // objects is an array (not an object map) — must be rejected, not coerced
    expect(() => importCas(JSON.stringify({ format: "atlas-okf", version: 1, objects: [] }))).toThrow()
    // objects missing entirely
    expect(() => importCas(JSON.stringify({ format: "atlas-okf", version: 1 }))).toThrow()
    // a WELL-FORMED envelope still imports (fail-closed, not fail-always)
    //
    // AMENDMENT (declared, not silent). This case previously filed `e1` under the hand-written key
    // `asHash('abcd')`. The PROPERTY it exists to protect — "the fail-closed guard must not degenerate into
    // fail-always; a valid bundle still imports" — is real and is preserved verbatim below. Only the FIXTURE
    // changed, for three reasons, none of which is "to make a source change pass":
    //   (a) it contradicted this file's own stated method (see the header: "content keys are minted through
    //       the sealed `id` seam") — `'abcd'` is a hand-written key, the one thing the header forbids;
    //   (b) it asserted the construction of a `Cas` that KERNEL-3 forbids ("Every Atlas object MUST be keyed
    //       by its hash in the single CAS"), so the state it pinned is not a legal store; and
    //   (c) the ratified scenario it descends from, SCN-KERNEL-6b-2, says nothing about off-address keys —
    //       its subject is env-relative references and proprietary binary encodings. The assertion was the
    //       transcriber's own elaboration, not ratified text.
    // For the record: `asHash('abcd')` is NOT hash-shaped, so it still imports under the shipped guard —
    // the original line would still PASS. This amendment adds teeth; it does not rescue the change.
    const good = JSON.stringify({ format: "atlas-okf", version: 1, objects: { [id(e1)]: e1 } })
    expect(() => importCas(good)).not.toThrow()
    expect(importCas(good).get(id(e1))).toEqual(e1)
  })

  it("import FAILS CLOSED on a body that is not addressed by the key it is filed under", () => {
    // The teeth the original fixture could not grow: a bundle is ordinary text in a PR or on disk, so the
    // realistic attack is not a malformed envelope — it is a PERFECTLY well-formed one whose body was edited
    // while its key was left alone. Without a re-derivation on import, the forged body is served under the
    // honest fact's content address and every reader that trusts the key inherits it.
    const honest = { kind: "Claim", nodeKey: "claim:acme-arr-2024", content: "ARR is $10M", fresh: true }
    const key = id(honest)
    const forged = { ...honest, content: "ARR is $99M" }
    expect(id(forged)).not.toBe(key) // the edit really does move the address

    const tampered = JSON.stringify({ format: "atlas-okf", version: 1, objects: { [key]: forged } })
    expect(() => importCas(tampered)).toThrow(/not addressed by its content/)
    // and the honest bundle at the same key still imports (fail-closed, not fail-always)
    const clean = JSON.stringify({ format: "atlas-okf", version: 1, objects: { [key]: honest } })
    expect(importCas(clean).get(key)).toEqual(honest)
  })

  it("SCOPE — an entry under a NON-address key is carried verbatim (it can impersonate nothing)", () => {
    // The original held-out assertion, kept VERBATIM and relabelled rather than deleted: it is a true and
    // useful statement about the door's scope. `'abcd'` is not hash-shaped, so no `cas.get(<digest>)` can
    // ever resolve it and it cannot be served in place of a real fact; it is therefore carried through
    // rather than re-derived. Recorded so the boundary of the integrity check is explicit and testable —
    // if a future change tightens this to "every key must be a content address", THIS test is the one that
    // must be argued down, and the ratified symbolic-handle fixture convention re-decided with it.
    const good = JSON.stringify({ format: "atlas-okf", version: 1, objects: { [asHash("abcd")]: e1 } })
    expect(() => importCas(good)).not.toThrow()
    expect(importCas(good).get(asHash("abcd"))).toEqual(e1)
  })
})
