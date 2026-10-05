// @atlas/cli — test/mine-fixtures.ts  (shared fixtures for the `atlas mine` driver suites)
//
// The injected seams every mine suite composes: a ranked-frontier skeleton, an injected history whose
// frontier IS that frontier (so `createMine` ranks it and never shells git), a recording proposer that
// counts calls instead of calling a model, gate doubles, and store fakes over the ADR-0008 STAGING
// sidecar whose knowledge-projection doors are TRAPS.
//
// Extracted from wp-9.3.6-b-mine.test.ts when the WP-F6 empty-pass suite grew into its own file and the
// combined file crossed the 400-LOC ceiling. This is a real seam — fixtures are shared by construction,
// and duplicating them would have let the two suites drift into testing different products.
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { create } from "@bufbuild/protobuf"
import {
  serializeSCIP,
  IndexSchema,
  MetadataSchema,
  ToolInfoSchema,
  DocumentSchema,
  OccurrenceSchema,
  SymbolRole,
} from "@c4312/scip"
import { asSubtreeHash, asHash, asNodeKey, id } from "@atlas/kernel"
import type { StructRef, Hash } from "@atlas/contracts"
import type { Axes, DepEdge, IndexNode, Manifest } from "@atlas/index"
import { makeRunController } from "@atlas/genesis"
import type {
  Candidate,
  Fact,
  MinedSignals,
  Skeleton,
  SiteProposer,
  EmitGate,
  HistorySource,
  SkeletonSource,
  GenesisBudget,
  AdmitDeps,
} from "@atlas/genesis"
import { createDiskStore } from "@atlas/adapter-io"
import type { CommitDecision, CommitRefusal, CommitResult, DiskStore } from "@atlas/adapter-io"
import { emptyStore } from "@atlas/knowledge"
import type { StoreProjection, CurrentNode } from "@atlas/knowledge"
import { runMine, driveMine, buildControllerDeps, makeAdmitGate, mineOutcome, mineWhyEmpty } from "../src/mine.js"
import type { MineDeps } from "../src/mine.js"

// ── the ranked-frontier skeleton fixture (mirrors s02's acme skeleton) ─────────────────────────────────
export const struct = (id: string): StructRef => ({
  kind: "symbol",
  qualifiedPath: `pkg/${id}.ts::${id}`,
  subtreeHash: asSubtreeHash(id),
})
export const A = struct("st-a10")
export const B = struct("st-b22")
export const C = struct("st-c31")
export const D = struct("st-d40")
export const FRONTIER: readonly StructRef[] = [A, B, C, D]

export const edge = (from: string, to: string | null): DepEdge => ({
  from: asHash(from),
  to: to === null ? null : asHash(to),
  kind: "resolved",
})
// def→ref: st-a10 is the hub (referenced by b/c/d) ⇒ highest PPR; st-d40 is cold.
export const REF_EDGES: readonly DepEdge[] = [
  edge("st-b22", "st-a10"),
  edge("st-c31", "st-a10"),
  edge("st-c31", "st-b22"),
  edge("st-d40", "st-a10"),
  edge("st-d40", "st-b22"),
  edge("st-d40", "st-c31"),
]
export const leaf = (key: string): IndexNode => ({
  axis: "dependency",
  level: "symbol",
  key,
  subtreeHash: asSubtreeHash(key),
  children: [],
  objects: [] as readonly Hash[],
})
export const axisRoot = (keys: readonly string[]): IndexNode => ({
  axis: "dependency",
  level: "repo",
  key: "root",
  subtreeHash: asSubtreeHash("root"),
  children: keys.map(leaf),
  objects: [],
})
export const skeletonOf = (): Skeleton => {
  const keys = ["st-a10", "st-b22", "st-c31", "st-d40"]
  const axes: Axes = {
    spatial: axisRoot(keys),
    territory: axisRoot(keys),
    dependency: axisRoot(keys),
    edges: REF_EDGES,
  }
  const manifest: Manifest = { territories: [] }
  return { axes, manifest }
}
export const BASE_SKELETON = skeletonOf()

// ── injected seams ─────────────────────────────────────────────────────────────────────────────────────
export const ZERO_SIGNALS: MinedSignals = { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] }
export const idOf = (c: Candidate): string => c.site.subtreeHash

/** A grounded fact whose anchor re-derives from the site — the gate only forwards a verdict. */
export const factFor = (c: Candidate, claim: string): Fact =>
  ({
    kind: "advisory",
    id: asNodeKey(`nk-${c.site.qualifiedPath}`),
    tier: "T2",
    claimNorm: claim,
    grounding: { entries: [{ anchor: c.site, path: c.site.qualifiedPath }] },
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
  }) as unknown as Fact
export const anchorOf = (f: Fact): string =>
  (f as unknown as { grounding: { entries: { anchor: StructRef }[] } }).grounding.entries[0]!.anchor.subtreeHash
export const anchorSet = (fs: readonly Fact[]): Set<string> => new Set(fs.map(anchorOf))

export const skeletonSource: SkeletonSource = { skeleton: () => BASE_SKELETON }

/** A non-thin history whose frontier IS the injected FRONTIER (so `createMine` ranks it, never a git shell). */
export const injectedHistory: HistorySource = {
  commitCount: () => 5,
  shallow: () => false,
  blameConcentration: () => 0,
  frontier: () => FRONTIER,
  signals: () => ZERO_SIGNALS,
}

/** The recorded proposer — a live call-counter (the `$0`-LLM proof), returns proposal `P0` at every site. */
export const recordingProposer = (): { proposer: SiteProposer; calls: () => number } => {
  let n = 0
  return {
    proposer: {
      propose: (c) => {
        n += 1
        return { cand: c, claim: `P0@${idOf(c)}` }
      },
    },
    calls: () => n,
  }
}

export const gateEmitAll = (): EmitGate => ({ emit: (seed, c) => ({ emitted: true, fact: factFor(c, seed.claim) }) })
export const gateEmitFor = (ids: ReadonlySet<string>): EmitGate => ({
  emit: (seed, c) =>
    ids.has(idOf(c))
      ? { emitted: true, fact: factFor(c, seed.claim) }
      : { emitted: false, whyNot: { site: c.site, reason: "not in admitted set" } },
})

/**
 * The knowledge-projection doors are TRAPS in every mine fixture (ADR-0008): `mine` writes CANDIDATES to
 * staging and must never so much as READ the governed projection, so any call is a test failure, not a
 * mismatch to assert on later. Spread into each fake store below.
 *
 * ALL THREE, and `commitProjection` was the one missing. It is the door the governed writers actually use
 * (`governed-emit.ts:260`, `governed-link.ts:156`), so a future `mine.ts` reaching for it would have slipped
 * past this guarantee's own test while every mine suite stayed green — a trap covering two thirds of a
 * surface proves two thirds of the claim. `mine-projection-surface.test.ts` now pins the coverage against
 * the live `DiskStore` surface, so a projection door added later cannot escape silently either.
 */
export const projectionTrap = {
  persistProjection: (): never => {
    throw new Error("ADR-0008: mine must never write the knowledge projection")
  },
  loadProjection: (): never => {
    throw new Error("ADR-0008: mine must never read the knowledge projection")
  },
  commitProjection: (): never => {
    throw new Error("ADR-0008: mine must never commit to the knowledge projection")
  },
}

/**
 * Read the staged head THROUGH the one staging door. `persistStaging`/`loadStaging` were deleted in task #83
 * after a probe measured ZERO production callers, so a test reads staging the way the protocol says to: a
 * decision that returns no `next` reads the snapshot and writes nothing (`sidecar-commit.ts` — `decision.next
 * === undefined` returns before any temp file is opened). That is strictly BETTER than the bare read it
 * replaces: it goes through the provenance + identity-schema guards, so a test can no longer read a
 * committed or foreign-schema store that the product itself would refuse.
 *
 * Note the one honest behavioural difference: with nothing staged this yields the EMPTY projection, where
 * `loadStaging()` yielded `undefined` — the commit protocol has no "nothing persisted" state, it decides over
 * `emptyStore()`. Call sites assert on `.current` either way.
 */
export function readStaging(store: DiskStore): StoreProjection {
  const r = store.commitStaging<StoreProjection>((p) => ({ out: p }))
  if (!r.settled) throw new Error(`readStaging: the staging door refused (${r.refusal})`)
  return r.out
}

/** The staging half, as a no-op: enough to satisfy `DiskStore` where a suite never inspects what was staged. */
const stagingNoop = {
  commitStaging: <T>(decide: (p: StoreProjection) => CommitDecision<T>): CommitResult<T> => ({
    settled: true,
    out: decide(emptyStore()).out,
  }),
}

export const fakeStore = (): DiskStore => ({
  put: () => asHash("x"),
  get: () => undefined,
  ...projectionTrap,
  ...stagingNoop,
})

/**
 * A recording fake over the STAGING sidecar. `commitStaging` is the door `mine` writes through now, and this
 * fake IMPLEMENTS THE PROTOCOL'S CONTRACT rather than pretending to be it: read the last staged projection
 * (or `seed`, standing in for what an earlier pass left behind), run the caller's decision over it, `put`
 * every CAS object the decision names BEFORE publishing, then append `next` to `staged`. Single-threaded, so
 * it never contends — which is exactly why the concurrency property is proven by real processes in
 * `mine-contention.test.ts` and not here. The projection doors trap. (`persistStaging`/`loadStaging` are gone
 * as of task #83 — `commitStaging` is the only staging door, here and in the product.)
 */
export const stagingFake = (
  seed?: StoreProjection,
): { store: DiskStore; staged: StoreProjection[]; cas: Set<string> } => {
  const staged: StoreProjection[] = []
  const cas = new Set<string>()
  const put = (obj: unknown): Hash => {
    const h = id(obj as Parameters<typeof id>[0])
    cas.add(h as unknown as string)
    return h
  }
  const snapshot = (): StoreProjection => (staged.length > 0 ? staged[staged.length - 1]! : (seed ?? emptyStore()))
  const store: DiskStore = {
    put: (obj) => put(obj),
    get: () => undefined,
    ...projectionTrap,
    commitStaging: <T>(decide: (p: StoreProjection) => CommitDecision<T>): CommitResult<T> => {
      const decision = decide(snapshot())
      if (decision.next === undefined) return { settled: true, out: decision.out } // a refusal writes nothing
      for (const obj of decision.put ?? []) put(obj) // CAS bytes durable BEFORE the rows naming them
      staged.push(decision.next)
      return { settled: true, out: decision.out }
    },
  }
  return { store, staged, cas }
}

/** A staging door that ALWAYS refuses — the `settled: false` leg, which must never read as a quiet no-op. */
export const refusingStagingFake = (refusal: CommitRefusal): DiskStore => ({
  put: () => asHash("x"),
  get: () => undefined,
  ...projectionTrap,
  commitStaging: () => ({ settled: false, refusal }),
})

export const OFF = { enabled: false, maxDepth: 0, epsilon: 0 } as const
export const budget = (ceiling: number): GenesisBudget => ({
  ceiling,
  deepening: { review: OFF, enrich: OFF, expand: OFF },
})

export const depsOf = (over: Partial<MineDeps> = {}): MineDeps => ({
  rev: "HEAD",
  proposer: over.proposer ?? recordingProposer().proposer,
  history: over.history ?? injectedHistory,
  skeleton: over.skeleton ?? skeletonSource,
  store: over.store ?? fakeStore(),
  gate: over.gate ?? gateEmitAll(),
  handoffTo: over.handoffTo ?? ((): void => {}),
  ...(over.budget !== undefined ? { budget: over.budget } : {}),
})

export const REPO = "fix-repo"

/** THE HERMETICITY PIN. `resolveProposer` locates the OPERATOR config through the environment, so a test
 *  that leaves it to `process.env` asserts things about the machine it runs on: on a developer box with a
 *  `~/.config/atlas/model.json` a "no model is wired" case reads a REAL model — and, once the source reader
 *  works, would EXECUTE that operator's binary from a unit test. An empty env resolves no config anywhere:
 *  `modelConfigPath` falls through to `<homedir>/.config/atlas/model.json`, which `homedir()` still answers,
 *  so `XDG_CONFIG_HOME` is pinned at a path that cannot exist rather than merely left unset. */
export const NO_MODEL_ENV: NodeJS.ProcessEnv = { XDG_CONFIG_HOME: "/atlas-no-such-config-root" }

// ── a REAL indexed repo: git-tracked sources + the `.atlas/index.scip` dump `build` derives edges from ──
// The dump is written INSIDE the repo (the production source reads `<repo>/.atlas/index.scip`, the same path
// `composeRuntime` uses), which is why the frozen adapter-io `fix-scip` harness — it writes to its own temp
// dir, in another package's test tree — cannot be reused verbatim here. The corpus is the controlled
// minimum: `greet` DEFINED in util.ts, REFERENCED in app.ts (⇒ a resolved edge), plus one reference with no
// definition anywhere (⇒ an `unresolved` edge, INDEX-13 — declared, never guessed).
//
// It lives HERE, not in one suite's file, because three suites now need the same repo and a second copy is
// how two suites end up testing different products.
export const SYM_GREET = "util/greet()."
export const SYM_MISSING = "util/missingHelper()."

const indexedRepos: string[] = []

/** Options for `makeIndexedRepo`. `ghostDoc` adds an INDEXED document that is NOT in the tracked tree — a
 *  dep-graph node with no spatial counterpart, hence no path, hence nothing a model could be shown. */
export interface IndexedRepoOpts {
  readonly ghostDoc?: boolean
}

export function makeIndexedRepo(opts: IndexedRepoOpts = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "atlas-skel-cli-"))
  indexedRepos.push(dir)
  mkdirSync(join(dir, "src"), { recursive: true })
  writeFileSync(join(dir, "src", "util.ts"), "export function greet(n: string): string {\n  return `hi ${n}`;\n}\n")
  writeFileSync(
    join(dir, "src", "app.ts"),
    "import { greet } from './util';\n\nexport function main(): string {\n  return greet('world') + missingHelper();\n}\n",
  )
  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: dir, stdio: "ignore" })
  }
  git("init", "-q")
  git("config", "user.email", "fixture@atlas.test")
  git("config", "user.name", "atlas fixture")
  git("add", "-A")
  git("-c", "commit.gpgsign=false", "commit", "-qm", "fixture")

  const doc = (relativePath: string, defs: readonly string[], refs: readonly string[]) =>
    create(DocumentSchema, {
      relativePath,
      occurrences: [
        ...defs.map((symbol) => create(OccurrenceSchema, { symbol, symbolRoles: SymbolRole.Definition })),
        ...refs.map((symbol) => create(OccurrenceSchema, { symbol, symbolRoles: 0 })),
      ],
    })
  const index = create(IndexSchema, {
    metadata: create(MetadataSchema, {
      projectRoot: "file:///fixture",
      toolInfo: create(ToolInfoSchema, { name: "atlas-fixture", version: "0" }),
    }),
    documents: [
      doc("src/util.ts", [SYM_GREET], []),
      doc("src/app.ts", [], [SYM_GREET, SYM_MISSING]),
      ...(opts.ghostDoc === true ? [doc("src/ghost.ts", [], [SYM_GREET])] : []),
    ],
  })
  mkdirSync(join(dir, ".atlas"), { recursive: true })
  writeFileSync(join(dir, ".atlas", "index.scip"), serializeSCIP(index))
  return dir
}

/** Remove every repo `makeIndexedRepo` created. Call from a suite `afterAll`. */
export function cleanupIndexedRepos(): void {
  while (indexedRepos.length > 0) rmSync(indexedRepos.pop()!, { recursive: true, force: true })
}
