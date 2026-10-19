// @atlas/adapter-io — test/surface-read-store.test.ts  (the Atlas UI surface: the store half of the snapshot)
//
// A store written to a temp directory by hand, byte for byte the shapes the sidecar and the CAS hold, read back
// through `read-store.ts`. Every expected value is stated literally so a field that drifts from extract.py fails here.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { pendingFacts, readReasoning, readStoreFiles, storeSummary } from "../src/surface/read-store.js"

const FACT_HASH = "a".repeat(64)
const CANDIDATE_HASH = "c".repeat(64)
const WHY_HASH = "b".repeat(64)
const MISSING_HASH = "d".repeat(64)
const REV = "0123456789abcdef0123456789abcdef01234567"

const FACT_ROW = {
  nodeKey: "k1",
  family: "advisory",
  contentHash: FACT_HASH,
  claims: ["a claim", "a second claim"],
  primaryAnchor: "src/a.ts",
  tier: "T2",
  scope: "atlas:mined",
  derivedAt: REV,
  seal: "proven",
}
const CANDIDATE_ROW = {
  nodeKey: "k2",
  family: "advisory",
  contentHash: CANDIDATE_HASH,
  claims: ["a candidate"],
  primaryAnchor: "src/b.ts",
  tier: "T2",
  scope: "atlas:mined",
  answerRef: WHY_HASH,
}
const FACT_BYTES = {
  kind: "advisory",
  authoring: "ADVISORY",
  freshness: "FRESH",
  obviousness: { rank: "obvious", by: "harness-predicate" },
  grounding: {
    entries: [
      { anchor: { kind: "file", qualifiedPath: "src/a.ts", subtreeHash: "0f0671e5b960e6c3ffff" }, path: "src/a.ts" },
    ],
  },
}

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A temp repository whose files are the JSON encoding of each value (a string value is a JSON string). */
function repo(files: Readonly<Record<string, unknown>>): string {
  const dir = mkdtempSync(join(tmpdir(), "atlas-surface-store-"))
  dirs.push(dir)
  mkdirSync(join(dir, ".atlas"), { recursive: true })
  for (const [rel, value] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), JSON.stringify(value))
  }
  return dir
}

function fullStore(): string {
  const projection = {
    current: [["k1", FACT_ROW]],
    cas: [FACT_HASH, MISSING_HASH],
    builtAt: REV,
    gen: 3,
    identity: "atlas-identity-2026-08-02",
    abstained: [["n1", {}]],
  }
  const staging = { current: [["k1", { ...FACT_ROW, answerRef: WHY_HASH }], ["k2", CANDIDATE_ROW]], cas: [], gen: 7 }
  return repo({
    ".atlas/projection.json": projection,
    ".atlas/projection.3.json": projection,
    ".atlas/staging.json": staging,
    ".atlas/staging.7.json": staging,
    ".atlas/policy.json": {
      t0Heuristic: { keywords: ["invariant"] },
      authz: { scopes: { "atlas:mined": ["seat:orchestrator"] } },
    },
    [`.atlas/cas/aa/${FACT_HASH}`]: FACT_BYTES,
    [`.atlas/cas/bb/${WHY_HASH}`]: "the reasoning text",
  })
}

describe("surface read-store — the store half of the snapshot", () => {
  it("reads a projection row as a promoted fact, with its CAS fields and the staging row's answer", () => {
    const rows = pendingFacts(readStoreFiles(fullStore()))
    expect(rows.facts).toEqual([
      {
        rev: REV,
        fact: {
          key: "k1",
          hash: FACT_HASH,
          claim: "a claim",
          file: "src/a.ts",
          family: "advisory",
          tier: "T2",
          scope: "atlas:mined",
          derivedAt: "01234567",
          subtree: "0f0671e5b960e6c3",
          obvious: "obvious",
          promoted: true,
          why: "bbbbbbbbbbbb",
          kind: "advisory",
          authoring: "ADVISORY",
          storedFreshness: "FRESH",
          obviousBy: "harness-predicate",
          anchor: { kind: "file", qualifiedPath: "src/a.ts" },
          slot: null,
          seal: "proven",
          supersededBy: null,
          sameAs: null,
          provenance: null,
        },
      },
    ])
  })

  it("reads a staging row that is not in the projection as a candidate, CAS fields null when its bytes are absent", () => {
    const rows = pendingFacts(readStoreFiles(fullStore()))
    expect(rows.candidates).toEqual([
      {
        rev: "",
        fact: {
          key: "k2",
          hash: CANDIDATE_HASH,
          claim: "a candidate",
          file: "src/b.ts",
          family: "advisory",
          tier: "T2",
          scope: "atlas:mined",
          derivedAt: "",
          subtree: "",
          obvious: null,
          promoted: false,
          why: "bbbbbbbbbbbb",
          kind: null,
          authoring: null,
          storedFreshness: null,
          obviousBy: null,
          anchor: null,
          slot: null,
          seal: null,
          supersededBy: null,
          sameAs: null,
          provenance: null,
        },
      },
    ])
  })

  it("summarizes generations, CAS files, policy and seals exactly as extract.py counts them", () => {
    const dir = fullStore()
    expect(storeSummary(dir, readStoreFiles(dir))).toEqual({
      builtAt: "01234567",
      gen: 3,
      stagingGen: 7,
      identity: "atlas-identity-2026-08-02",
      casObjects: 2,
      policy: { "atlas:mined": ["seat:orchestrator"] },
      t0Keywords: ["invariant"],
      sealed: 1,
      casAudit: { objects: 2, referenced: 2, missing: 1, orphan: 1 },
      generations: ["projection.3.json", "projection.json", "staging.7.json", "staging.json"],
      abstained: 1,
    })
  })

  it("reads the reasoning a staging row's answerRef names, by its 12-character prefix", () => {
    const files = readStoreFiles(fullStore())
    expect(readReasoning(files, "bbbbbbbbbbbb")).toEqual({ state: "ok", id: "bbbbbbbbbbbb", text: "the reasoning text" })
    expect(readReasoning(files, "ffffffffffff")).toEqual({ state: "missing", id: "ffffffffffff" })
    expect(readReasoning(files, "")).toEqual({ state: "missing", id: "" })
  })

  it("never reads a CAS path from a name that is not lowercase hex", () => {
    const dir = repo({
      ".atlas/staging.json": { current: [["k9", { ...CANDIDATE_ROW, nodeKey: "k9", answerRef: "../policy" }]], cas: [] },
      ".atlas/policy.json": { t0Heuristic: { keywords: [] }, authz: { scopes: {} } },
    })
    expect(readReasoning(readStoreFiles(dir), "../policy")).toEqual({ state: "missing", id: "../policy" })
  })

  it("reads an empty, a corrupt and a wrong-shaped store as empty, never a throw", () => {
    const empty = {
      builtAt: "",
      gen: 0,
      stagingGen: 0,
      identity: null,
      casObjects: 0,
      policy: {},
      t0Keywords: [],
      sealed: 0,
      casAudit: { objects: 0, referenced: 0, missing: 0, orphan: 0 },
      generations: [],
      abstained: 0,
    }
    const bare = repo({})
    expect(pendingFacts(readStoreFiles(bare))).toEqual({ facts: [], candidates: [] })
    expect(storeSummary(bare, readStoreFiles(bare))).toEqual(empty)
    const corrupt = repo({})
    writeFileSync(join(corrupt, ".atlas", "projection.json"), "{not json")
    writeFileSync(join(corrupt, ".atlas", "staging.json"), JSON.stringify({ current: 5, cas: [] }))
    expect(pendingFacts(readStoreFiles(corrupt))).toEqual({ facts: [], candidates: [] })
    const badRows = repo({ ".atlas/projection.json": { current: [["k1", 7], ["k2"], 3], cas: [] } })
    expect(pendingFacts(readStoreFiles(badRows))).toEqual({ facts: [], candidates: [] })
  })
})
