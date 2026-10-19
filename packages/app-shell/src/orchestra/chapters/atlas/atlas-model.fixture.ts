import type { AtlasSnapshot, AtlasSnapshotFact } from "./atlas-types"

// A small store for the Atlas tests: four promoted facts (one drifted, one SUPERSEDED), one staged candidate, a
// two-hop import chain packages/a → packages/b → packages/c, and a trusted (untracked) store.
const fact = (
  key: string,
  file: string,
  tier: string,
  scope: string,
  claim: string,
  extra: Partial<AtlasSnapshotFact> = {},
): AtlasSnapshotFact => ({
  key,
  hash: `h-${key}`,
  claim,
  file,
  family: "advisory",
  tier,
  scope,
  derivedAt: "927f47e8",
  subtree: "df4a6c0c0cd1900b",
  obvious: null,
  promoted: true,
  why: null,
  kind: "advisory",
  authoring: "ADVISORY",
  storedFreshness: "FRESH",
  obviousBy: null,
  anchor: { kind: "file", qualifiedPath: file },
  slot: null,
  seal: null,
  supersededBy: null,
  sameAs: null,
  provenance: null,
  ...extra,
})

export function atlasFixture(): AtlasSnapshot {
  return {
    state: "ok",
    project: "demo",
    head: "abc12345",
    builtAt: "927f47e8",
    gen: 3,
    stagingGen: 5,
    identity: "demo-identity",
    casObjects: 5,
    policy: { packages: ["seat:orchestrator"], "atlas:mined": ["seat:orchestrator"] },
    t0Keywords: ["invariant"],
    scip: true,
    tracked: { projection: false, cas: 0, staging: false, policy: true, memory: false },
    sealed: 0,
    casAudit: { objects: 5, referenced: 4, missing: 0, orphan: 1 },
    generations: ["projection.json", "staging.json"],
    abstained: 0,
    langs: { ts: 3, mjs: 1, py: 2, sh: 1 },
    facts: [
      fact("k1", "packages/a/src/x.ts", "T1", "packages", "Writes are atomic.", { slot: "invariant" }),
      fact("k2", "packages/a/src/x.ts", "T2", "packages", "Reads are cached per call.", {
        drift: {
          hunks: [{ at: "-1,2 +1,3", lines: ["+const a = 1"] }],
          stat: "1 file changed, 1 insertion(+)",
          commits: [["c0ffee1", "fix x"]],
        },
      }),
      fact("k3", "packages/b/src/y.ts", "T0", "packages", "Never call y twice.", { slot: "gotcha", authoring: "SUPERSEDED" }),
      fact("k4", "README.md", "T2", "atlas:mined", "The readme explains setup."),
    ],
    candidates: [fact("k5", "packages/a/src/w.ts", "T2", "atlas:mined", "w exports one helper.", { promoted: false })],
    dependents: { "packages/a/src/x.ts": ["packages/b/src/y.ts"], "packages/b/src/y.ts": ["packages/c/src/z.ts"] },
    dependentCount: { "packages/a/src/x.ts": 1, "packages/b/src/y.ts": 1 },
    children: { ".": ["README.md", "packages"], packages: ["a", "b", "c"], "packages/a": ["src"] },
    own: null,
    memory: {},
    orientation: [],
    territories: [],
}
}
