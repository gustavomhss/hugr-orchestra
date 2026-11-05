import { describe, expect, it } from "vitest"
import { createStore, id } from "@atlas/kernel"
import type { StoreApi } from "@atlas/kernel"
import { indexOwnership, readOwnership } from "../src/ownership/read.js"
import type {
  OwnershipArtifact,
  OwnershipBody,
  OwnershipContract,
  OwnershipInput,
  OwnershipManifest,
  OwnershipReceipt,
  OwnershipResult,
  OwnershipReview,
} from "../src/ownership/types.js"

// Real kernel CAS, no model/provider, globals or duplicate implementation of the reader.
function fixture(store: StoreApi = createStore()) {
  const contract: OwnershipContract = { kind: "ownership-contract", version: 1, criteria: ["supported"] }
  const contractRef = store.put(contract)
  const artifact = (key: string, body: string, inputs: readonly OwnershipInput[], dependencies: OwnershipReceipt["dependencies"] = [], navigation: readonly string[] = []) => {
    const encoded: OwnershipBody = { kind: "ownership-body", version: 1, bytes: Array.from(new TextEncoder().encode(body)) }
    const result: OwnershipResult = {
      kind: "ownership-result", version: 1, body: store.put(encoded),
      authority: { scope: "session-input", basis: "reviewed-pilot" },
      validity: "supported", gaps: [], evidence: ["frozen evidence"],
    }
    const resultRef = store.put(result)
    const inputRef = id({ inputs, dependencies })
    const review = (reviewer: string): OwnershipReview => ({
      kind: "ownership-review", version: 1, reviewer, contract: contractRef, inputs: inputRef,
      result: resultRef, criteria: ["supported"], verdict: "pass", provenance: "test's explicit review fixture, not real semantic evaluation",
    })
    const receipt: OwnershipReceipt = {
      kind: "ownership-receipt", version: 1, contract: contractRef, inputs, dependencies,
      reviews: [store.put(review("reviewer-1")), store.put(review("reviewer-2"))],
    }
    const value: OwnershipArtifact = {
      kind: "ownership-artifact", version: 1, key, scope: "session-input", title: key,
      layer: 4, need: "operational", result: resultRef, receipt: store.put(receipt), navigation,
    }
    return { value, ref: store.put(value), result, resultRef, receipt }
  }
  const base = artifact("flow", "## Behavior\nAdmission is not completion.\n", [{ key: "source:session", version: "blob-1" }])
  const skill = artifact("operations", "## Use\nChoose admission behavior.\n\n## Limits\nNo provider guarantee.\n", [{ key: "recipe:operations", version: "recipe-1" }], [{ key: "flow", result: base.resultRef }], ["unrelated"])
  const unrelated = artifact("unrelated", "Independent knowledge.\n", [{ key: "source:unrelated", version: "unrelated-1" }])
  const manifest: OwnershipManifest = {
    kind: "ownership-manifest", version: 1, scope: "session-input",
    entries: [base, skill, unrelated].map((entry) => ({ key: entry.value.key, artifact: entry.ref })),
    roots: { operational: "operations", evidence: "unrelated" },
  }
  const versions = new Map([["source:session", "blob-1"], ["recipe:operations", "recipe-1"], ["source:unrelated", "unrelated-1"]])
  return { store, base, skill, unrelated, manifest, manifestRef: store.put(manifest), versions, artifact }
}

describe("ownership accepted closure reader", () => {
  it("IFIT-1/3 resolves the exact need through the existing CAS and binds its receipt", () => {
    const f = fixture()
    const read = readOwnership(f.store, f.manifestRef, { scope: "session-input", need: "operational", maxBytes: 4096 }, (key) => f.versions.get(key))
    expect(read).toMatchObject({ kind: "ready", manifest: f.manifestRef, artifact: f.skill.ref, result: f.skill.resultRef, key: "operations", historical: false })
    if (read.kind !== "ready") throw new Error("expected actual ready result")
    expect(read.body).toBe("## Use\nChoose admission behavior.\n\n## Limits\nNo provider guarantee.\n")
    expect(read.checked).toEqual(["flow", "operations"])
  })

  it("IFIT-4 holds a changed required source, never falls back to a prior accepted body", () => {
    const f = fixture()
    f.versions.set("source:session", "blob-2")
    expect(readOwnership(f.store, f.manifestRef, { scope: "session-input", need: "operational", maxBytes: 4096 }, (key) => f.versions.get(key)))
      .toMatchObject({ kind: "hold", reason: "ownership-input-changed", evidence: ["flow", "source:session"] })
  })

  it("IFIT-4 does not let a navigation link or invalid unrelated scope block the requested closure", () => {
    const f = fixture()
    f.versions.delete("source:unrelated")
    expect(readOwnership(f.store, f.manifestRef, { scope: "session-input", need: "operational", maxBytes: 4096 }, (key) => f.versions.get(key)).kind).toBe("ready")
    expect(readOwnership(f.store, f.manifestRef, { scope: "session-input", need: "evidence", maxBytes: 4096 }, (key) => f.versions.get(key)))
      .toMatchObject({ kind: "hold", reason: "ownership-input-unavailable" })
  })

  it("IFIT-4 names unavailable currentness instead of returning an empty successful pack", () => {
    const f = fixture()
    expect(readOwnership(f.store, f.manifestRef, { scope: "session-input", need: "operational", maxBytes: 4096 }, () => undefined))
      .toMatchObject({ kind: "hold", reason: "ownership-input-unavailable" })
  })

  it("IFIT-5 keeps the downstream artifact identity when only a validated parent receipt changes", () => {
    const f = fixture()
    const refreshed = f.artifact("flow", "## Behavior\nAdmission is not completion.\n", [{ key: "source:session", version: "blob-2" }])
    expect(refreshed.resultRef).toBe(f.base.resultRef)
    expect(refreshed.value.receipt).not.toBe(f.base.value.receipt)
    const manifest = f.store.put({ ...f.manifest, entries: f.manifest.entries.map((entry) => entry.key === "flow" ? { key: "flow", artifact: refreshed.ref } : entry) })
    f.versions.set("source:session", "blob-2")
    expect(readOwnership(f.store, manifest, { scope: "session-input", need: "operational", maxBytes: 4096 }, (key) => f.versions.get(key)))
      .toMatchObject({ kind: "ready", artifact: f.skill.ref, result: f.skill.resultRef, receipt: f.skill.value.receipt })
  })

  it("IFIT-5 holds a changed parent result until the dependent input validation is renewed", () => {
    const f = fixture()
    const changed = f.artifact("flow", "Different supported meaning.\n", [{ key: "source:session", version: "blob-1" }])
    const manifest = f.store.put({ ...f.manifest, entries: f.manifest.entries.map((entry) => entry.key === "flow" ? { key: "flow", artifact: changed.ref } : entry) })
    expect(readOwnership(f.store, manifest, { scope: "session-input", need: "operational", maxBytes: 4096 }, (key) => f.versions.get(key)))
      .toMatchObject({ kind: "hold", reason: "ownership-dependency-changed", evidence: ["operations", "flow"] })
  })

  it("IFIT-4 rejects a dependency cycle even though every CAS object is individually addressable", () => {
    const f = fixture()
    const cyclic = f.artifact("flow", "## Behavior\nAdmission is not completion.\n", [{ key: "source:session", version: "blob-1" }], [{ key: "operations", result: f.skill.resultRef }])
    const manifest = f.store.put({ ...f.manifest, entries: f.manifest.entries.map((entry) => entry.key === "flow" ? { ...entry, artifact: cyclic.ref } : entry) })
    expect(readOwnership(f.store, manifest, { scope: "session-input", need: "operational", maxBytes: 4096 }, (key) => f.versions.get(key)))
      .toMatchObject({ kind: "hold", reason: "ownership-cycle" })
  })

  it("IFIT-1 refuses semantic state smuggled through a CAS-excluded side-index field", () => {
    const f = fixture()
    expect(f.store.put({ ...f.base.result, status: "attacker-controlled" })).toBe(f.base.resultRef)
    expect(readOwnership(f.store, f.manifestRef, { scope: "session-input", need: "operational", maxBytes: 4096 }, (key) => f.versions.get(key)))
      .toMatchObject({ kind: "hold", reason: "malformed-ownership" })
  })

  it("IFIT-1/2 rejects a review bound to another input identity", () => {
    const f = fixture()
    const firstReview = f.store.get(f.skill.receipt.reviews[0]!) as OwnershipReview
    const mismatched = f.store.put({ ...firstReview, inputs: id("other inputs") })
    const receipt = f.store.put({ ...f.skill.receipt, reviews: [mismatched, f.skill.receipt.reviews[1]!] })
    const changed = f.store.put({ ...f.skill.value, receipt })
    const manifest = f.store.put({ ...f.manifest, entries: f.manifest.entries.map((entry) => entry.key === "operations" ? { ...entry, artifact: changed } : entry) })
    expect(readOwnership(f.store, manifest, { scope: "session-input", need: "operational", maxBytes: 4096 }, (key) => f.versions.get(key)))
      .toMatchObject({ kind: "hold", reason: "ownership-review" })
  })

  it("IFIT-3 returns one complete requested section and refuses truncation", () => {
    const f = fixture()
    const query = { scope: "session-input", need: "operational" as const, section: "Limits", maxBytes: 4096 }
    expect(readOwnership(f.store, f.manifestRef, query, (key) => f.versions.get(key)))
      .toMatchObject({ kind: "ready", body: "## Limits\nNo provider guarantee.\n" })
    expect(readOwnership(f.store, f.manifestRef, { ...query, maxBytes: 1 }, (key) => f.versions.get(key)))
      .toMatchObject({ kind: "hold", reason: "ownership-limit" })
    expect(readOwnership(f.store, f.manifestRef, { ...query, section: "Absent" }, (key) => f.versions.get(key)))
      .toMatchObject({ kind: "hold", reason: "ownership-section" })
  })

  it("IFIT-3 returns a scoped metadata index without copying body text into model output", () => {
    const f = fixture()
    const index = indexOwnership(f.store, f.manifestRef, { scope: "session-input", need: "operational" }, (key) => f.versions.get(key))
    expect(index).toMatchObject({ kind: "index", key: "operations", sections: ["Use", "Limits"], navigation: ["unrelated"], dependencies: ["flow"], bodiesReturned: false, bodyBytesVerified: true })
    expect(index).not.toHaveProperty("body")
  })

  it("IFIT-3 does not mistake headings in fenced examples for real section boundaries", () => {
    const f = fixture()
    const body = "## Use\n```md\n## Not a section\n```\nKeep this.\n## Limits\nStop.\n"
    const updated = f.artifact("operations", body, [])
    const manifest = f.store.put({ ...f.manifest, entries: f.manifest.entries.map((entry) => entry.key === "operations" ? { ...entry, artifact: updated.ref } : entry) })
    expect(readOwnership(f.store, manifest, { scope: "session-input", need: "operational", section: "Use", maxBytes: 4096 }, (key) => f.versions.get(key)))
      .toMatchObject({ kind: "ready", body: "## Use\n```md\n## Not a section\n```\nKeep this.\n" })
    expect(indexOwnership(f.store, manifest, { scope: "session-input", need: "operational" }, (key) => f.versions.get(key)))
      .toMatchObject({ kind: "index", sections: ["Use", "Limits"] })
  })

  it("IFIT-3 labels historical reads, rather than laundering incompatible inputs as current", () => {
    const f = fixture()
    expect(readOwnership(f.store, f.manifestRef, { scope: "session-input", need: "operational", maxBytes: 4096, historical: true }, () => undefined))
      .toMatchObject({ kind: "ready", historical: true })
  })

  it("IFIT-1 refuses a missing or wrong-kind CAS object", () => {
    const f = fixture()
    expect(readOwnership(f.store, id("absent"), { scope: "session-input", need: "operational", maxBytes: 4096 }, (key) => f.versions.get(key)))
      .toMatchObject({ kind: "hold", reason: "ownership-missing" })
    expect(readOwnership(f.store, f.store.put("not a manifest"), { scope: "session-input", need: "operational", maxBytes: 4096 }, (key) => f.versions.get(key)))
      .toMatchObject({ kind: "hold", reason: "malformed-ownership" })
  })

  it("IFIT-3 refuses a scope mismatch or ambiguous selection", () => {
    const f = fixture()
    expect(readOwnership(f.store, f.manifestRef, { scope: "other", need: "operational", maxBytes: 4096 }, (key) => f.versions.get(key)))
      .toMatchObject({ kind: "hold", reason: "ownership-scope" })
    expect(readOwnership(f.store, f.manifestRef, { scope: "session-input", need: "operational", key: "flow", maxBytes: 4096 }, (key) => f.versions.get(key)))
      .toMatchObject({ kind: "hold", reason: "ownership-selection" })
  })

  it("IFIT-5 includes changed authority, validity and gaps in the consumer-visible identity", () => {
    const f = fixture()
    expect(id({ ...f.base.result, validity: "blocked" })).not.toBe(f.base.resultRef)
    expect(id({ ...f.base.result, gaps: ["required premise missing"] })).not.toBe(f.base.resultRef)
    expect(id({ ...f.base.result, authority: { scope: "session-input", basis: "different decision" } })).not.toBe(f.base.resultRef)
  })

  it("IFIT-1 preserves reviewed body bytes even when their Unicode strings are NFC-equivalent", () => {
    const f = fixture()
    const a = f.artifact("unicode-a", "caf\u00e9", [])
    const b = f.artifact("unicode-b", "cafe\u0301", [])
    expect(a.result.body).not.toBe(b.result.body)
  })
})
