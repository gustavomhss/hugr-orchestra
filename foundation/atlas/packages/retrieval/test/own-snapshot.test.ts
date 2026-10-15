import { describe, expect, it } from "vitest"
import {
  exportOwnSnapshot,
  materializeStaticOwnSnapshot,
  parseOwnSnapshot,
  verifyStaticOwnSnapshot,
} from "../src/own-snapshot.js"

const snapshotText = JSON.stringify({
  schemaVersion: 1,
  snapshot: "genesis-v1",
  sourceRevision: "abcdef0123456789abcdef0123456789abcdef01",
  units: [
    {
      unit: { level: "module", id: "packages/genesis", grounding: null },
      sourceBlobs: { "packages/genesis/src/index.ts": "0123456789abcdef0123456789abcdef01234567" },
      pack: {
        unit: "Genesis owns bootstrap.",
        invariants: [
          { nodeId: "genesis:bootstrap", tier: "T1", claim: "Genesis bootstrap is deterministic.", freshness: "FRESH" },
        ],
        shape: { contents: ["packages/genesis/src/index.ts"], owner: "atlas-foundation", tier: "T1" },
        edges: { dependents: [], dependencies: [] },
        gotchas: [
          {
            id: "genesis:gotcha",
            kind: "advisory",
            tier: "T1",
            claimNorm: "Bootstrap ordering matters.",
            freshness: "FRESH",
          },
        ],
        memory: null,
        drill: {
          finer: [],
          refresh: { pull: "poke:own_packages_genesis" },
          complement: { pull: "relate:packages/genesis" },
        },
        grounding: { source: "tree" },
        tokenEstimate: 12,
        manifest: { pointers: [], truncated: false },
        pullReachable: [],
        advisory: [{ nodeId: "genesis:advisory", tier: "T2", claim: "Review bootstrap changes.", freshness: "FRESH" }],
        advisoryDropped: 0,
      },
    },
  ],
})

const reviewed = parseOwnSnapshot(snapshotText)!
const auxiliary = {
  ...reviewed.units[0]!,
  unit: {
    ...reviewed.units[0]!.unit,
    id: "packages/genesis/src/index.ts",
    grounding: "0123456789abcdef".repeat(4),
  },
  pack: {
    ...reviewed.units[0]!.pack,
    unit: "packages/genesis/src/index.ts",
    invariants: [],
    advisory: [],
    gotchas: [],
    shape: { ...reviewed.units[0]!.pack.shape, contents: [] },
  },
}

describe("static Own snapshot", () => {
  it("accepts source-bound auxiliary files, directories, and childless symbols beside real facts", () => {
    const units = [
      ...reviewed.units,
      auxiliary,
      { ...auxiliary, unit: { ...auxiliary.unit, id: "packages/genesis/src" } },
      {
        ...auxiliary,
        unit: { ...auxiliary.unit, id: "packages/genesis/src/index.ts::function_declaration:0:bootstrap" },
      },
    ]
    const snapshot = exportOwnSnapshot({ ...reviewed, units })
    expect(parseOwnSnapshot(JSON.stringify(snapshot))).toEqual(snapshot)
    const output = materializeStaticOwnSnapshot(snapshot)
    expect(output.skills).toHaveLength(units.length)
    expect(
      verifyStaticOwnSnapshot(snapshot, [...output.skills, output.coverage], (path) => auxiliary.sourceBlobs[path]),
    ).toEqual({ status: "READY" })
  })

  it("rejects an all-empty snapshot even when every unit has structural and source witnesses", () => {
    const input = { ...reviewed, units: [auxiliary] }
    expect(parseOwnSnapshot(JSON.stringify(input))).toBeUndefined()
    expect(() => exportOwnSnapshot(input)).toThrow(
      "Own snapshot export requires non-empty, unique units with fresh packs and source blobs",
    )
  })

  it.each([null, undefined, "", "not-a-structural-hash"])("rejects auxiliary grounding %s", (grounding) => {
    const input = { ...reviewed, units: [...reviewed.units, { ...auxiliary, unit: { ...auxiliary.unit, grounding } }] }
    expect(parseOwnSnapshot(JSON.stringify(input))).toBeUndefined()
    expect(() => exportOwnSnapshot(input)).toThrow()
  })

  it.each(["manifest", "goal"] as const)("rejects factual-empty %s grounding", (source) => {
    expect(
      parseOwnSnapshot(
        JSON.stringify({
          ...reviewed,
          units: [...reviewed.units, { ...auxiliary, pack: { ...auxiliary.pack, grounding: { source } } }],
        }),
      ),
    ).toBeUndefined()
  })

  it.each(["", " "])("rejects auxiliary empty briefing %j", (unit) => {
    expect(
      parseOwnSnapshot(
        JSON.stringify({
          ...reviewed,
          units: [...reviewed.units, { ...auxiliary, pack: { ...auxiliary.pack, unit } }],
        }),
      ),
    ).toBeUndefined()
  })

  it.each(["outside.ts", "../outside.ts", "packages/genesis/src/index.ts/other", "outside.ts::symbol"])(
    "rejects auxiliary unit without its own source witness: %s",
    (id) => {
      expect(
        parseOwnSnapshot(
          JSON.stringify({
            ...reviewed,
            units: [...reviewed.units, { ...auxiliary, unit: { ...auxiliary.unit, id } }],
          }),
        ),
      ).toBeUndefined()
    },
  )

  it.each([
    { contents: [] },
    { contents: ["packages/genesis/src/index.ts::function_declaration:0:bootstrap"] },
  ])("allows only source-bound auxiliary contents: %j", (shape) => {
    const entry = { ...auxiliary, pack: { ...auxiliary.pack, shape: { ...auxiliary.pack.shape, ...shape } } }
    expect(parseOwnSnapshot(JSON.stringify({ ...reviewed, units: [...reviewed.units, entry] }))).toBeDefined()
    expect(
      parseOwnSnapshot(
        JSON.stringify({
          ...reviewed,
          units: [
            ...reviewed.units,
            { ...entry, pack: { ...entry.pack, shape: { ...entry.pack.shape, contents: ["outside.ts"] } } },
          ],
        }),
      ),
    ).toBeUndefined()
  })

  it("recomposes skills, coverage, and source freshness from Genesis snapshot", () => {
    const snapshot = parseOwnSnapshot(snapshotText)
    expect(snapshot).toBeDefined()
    const output = materializeStaticOwnSnapshot(snapshot!)
    expect(output.skills).toHaveLength(1)
    expect(output.coverage.path).toBe(".orchestra/skills/own/OWN-COVERAGE.json")
    expect(
      verifyStaticOwnSnapshot(
        snapshot!,
        [...output.skills, output.coverage],
        (path) => snapshot!.units[0]!.sourceBlobs[path],
      ),
    ).toEqual({ status: "READY" })
  })

  it("fails closed on empty or duplicate Genesis unit coverage", () => {
    expect(parseOwnSnapshot('{"schemaVersion":1,"snapshot":"x","sourceRevision":"y","units":[]}')).toBeUndefined()
    const duplicate = JSON.parse(snapshotText)
    duplicate.units.push({
      ...duplicate.units[0],
      sourceBlobs: { "packages/genesis/src/other.ts": "0123456789abcdef0123456789abcdef01234567" },
    })
    expect(parseOwnSnapshot(JSON.stringify(duplicate))).toBeUndefined()
  })

  it.each(["HEAD", "abcdef0", "ABCDEF0123456789ABCDEF0123456789ABCDEF01", "abcdef0123456789abcdef0123456789abcdef01^"])(
    "refuses symbolic or non-canonical source revision %s",
    (sourceRevision) => {
      const value = JSON.parse(snapshotText)
      value.sourceRevision = sourceRevision
      expect(parseOwnSnapshot(JSON.stringify(value))).toBeUndefined()
    },
  )

  it("accepts fresh reviewed input deterministically", () => {
    const { snapshot, sourceRevision, units } = JSON.parse(snapshotText)
    const input = { snapshot, sourceRevision, units }
    const first = exportOwnSnapshot(input)
    expect(first).toEqual({ schemaVersion: 1, ...input })
    expect(exportOwnSnapshot(input)).toEqual(first)
  })

  it("refuses empty unit coverage", () => {
    const { snapshot, sourceRevision } = JSON.parse(snapshotText)
    expect(() => exportOwnSnapshot({ snapshot, sourceRevision, units: [] })).toThrow(
      "Own snapshot export requires non-empty, unique units with fresh packs and source blobs",
    )
  })

  it("refuses duplicate units", () => {
    const { snapshot, sourceRevision, units } = JSON.parse(snapshotText)
    expect(() => exportOwnSnapshot({ snapshot, sourceRevision, units: [units[0], structuredClone(units[0])] })).toThrow(
      "Own snapshot export requires non-empty, unique units with fresh packs and source blobs",
    )
  })

  it.each([
    ["empty", {}],
    ["malformed hash", { "packages/genesis/src/index.ts": "not-a-git-blob" }],
    ["malformed path", { "../outside.ts": "0123456789abcdef0123456789abcdef01234567" }],
  ])("refuses %s source blobs", (_case, sourceBlobs) => {
    const { snapshot, sourceRevision, units } = JSON.parse(snapshotText)
    units[0].sourceBlobs = sourceBlobs
    expect(() => exportOwnSnapshot({ snapshot, sourceRevision, units })).toThrow(
      "Own snapshot export requires non-empty, unique units with fresh packs and source blobs",
    )
  })

  it.each(["DRIFTED", "STALE"])("refuses %s invariants", (freshness) => {
    const { snapshot, sourceRevision, units } = JSON.parse(snapshotText)
    units[0].pack.invariants[0].freshness = freshness
    expect(() => exportOwnSnapshot({ snapshot, sourceRevision, units })).toThrow(
      "Own snapshot export requires fresh reviewed packs",
    )
  })

  it.each(["DRIFTED", "STALE"])("refuses %s advisory facts", (freshness) => {
    const { snapshot, sourceRevision, units } = JSON.parse(snapshotText)
    units[0].pack.advisory[0].freshness = freshness
    expect(() => exportOwnSnapshot({ snapshot, sourceRevision, units })).toThrow(
      "Own snapshot export requires fresh reviewed packs",
    )
  })

  it.each(["DRIFTED", "STALE"])("refuses %s gotchas", (freshness) => {
    const { snapshot, sourceRevision, units } = JSON.parse(snapshotText)
    units[0].pack.gotchas[0].freshness = freshness
    expect(() => exportOwnSnapshot({ snapshot, sourceRevision, units })).toThrow(
      "Own snapshot export requires fresh reviewed packs",
    )
  })

  it("refuses malformed packs", () => {
    const { snapshot, sourceRevision, units } = JSON.parse(snapshotText)
    delete units[0].pack.shape
    expect(() => exportOwnSnapshot({ snapshot, sourceRevision, units })).toThrow(
      "Own snapshot export requires non-empty, unique units with fresh packs and source blobs",
    )
  })

  it("names prose and source-blob drift", () => {
    const snapshot = parseOwnSnapshot(snapshotText)!
    const output = materializeStaticOwnSnapshot(snapshot)
    const altered = {
      ...output.skills[0]!,
      content: output.skills[0]!.content.replace("Genesis bootstrap is deterministic.", "altered"),
    }
    expect(
      verifyStaticOwnSnapshot(snapshot, [altered, output.coverage], () => "abcdefabcdefabcdefabcdefabcdefabcdefabcd"),
    ).toEqual({
      status: "HOLD",
      issues: [
        "source blob drift: packages/genesis -> packages/genesis/src/index.ts",
        `static Own drift: ${output.skills[0]!.path}`,
      ],
    })
  })
})
