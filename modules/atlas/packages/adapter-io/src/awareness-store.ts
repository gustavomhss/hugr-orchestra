// @atlas/adapter-io — src/awareness-store.ts  (the DURABLE Awareness slab — CAMPAIGN-11 W7a)
//
// ── REFERENCE MODEL — NO PRODUCTION CALLERS ──────────────────────────────────────────────────────────
// Nothing in `packages/*/src` calls `createAwarenessStore` / `realAtlasRoot` yet — W8 is the later work
// package that composes the slab into the wave transport. Declared in the reference-model-guard.mjs
// ledger rather than pre-wired, exactly the discipline `memory-store.ts` states in its own header: a
// door wired early just to clear that gate is the stub the gate exists to refuse, and this entry goes
// stale the moment W8 composes it — the ledger's STALE leg says so out loud when it does.
//
// ── WHAT THIS FILE IS: composition, not derivation ─────────────────────────────────────────────────────
// `@atlas/memory` `awareness.ts` owns EVERY invariant of the slab: the grounding discipline, the UN-SEEDED
// sentinel, the `~400 tok` cap (`guardCap`, fail-closed), the byte-identical canonical form, and the
// memoized re-roll / drift-check counters (`AssemblyReceipt`). NONE of that is reimplemented here. This
// file's one job is building a REAL Atlas root — `atlasRoot(facets)` — out of REAL bytes read off THIS
// repo, and handing it to `rollup` / `makeAwarenessMemo`.
//
// Two facets have a real source this adapter can create without a live index build:
//   `taste`         ← `CONVENTIONS.md@sha` in the repo — a real file read, content-hashed.
//   `constitution`  ← the T0-tier rows of the PERSISTED knowledge `StoreProjection` (`.atlas/cas`, the
//                     SAME `createDiskStore` / `gitSidecarTrust` seam `compose.ts` wires for every
//                     governed door) — the ratified T0 manifest as it actually sits on disk, never a
//                     synthesized list.
// `mission` / `terrain` / `ontology` have NO source this adapter creates — no ratified DEFINE artifact, no
// genesis-seeded territory rollup, no genesis-seeded definition source (the SAME absence
// `genesis/src/seed.ts` already states for the same three facets, GEN-9). Omitted from the `RootFacets`
// this file builds, so `@atlas/memory`'s OWN `rollup` renders them `UN-SEEDED` — never fabricated here.
//
// ── THE MEASURE, honestly bounded ──────────────────────────────────────────────────────────────────────
// `@atlas/memory` enforces its `~400 tok` cap as a WHITESPACE WORD COUNT (`awareness.ts` `tok`), fail-
// closed. Elsewhere in this repo (`own-source.ts` "THE MEASURE") the same class of budget is enforced in
// CHARACTERS, because there is no tokenizer anywhere in this tree — a DIFFERENT proxy for the same absent
// measurement, and the two are NOT interchangeable (a run of long words undercounts on `tok`, overcounts
// on chars). This file calls `rollup` and inherits ITS proxy unchanged; it re-derives no cap of its own.
//
// ── constitution grounding, honestly bounded ────────────────────────────────────────────────────────────
// A `CurrentNode` row carries `contentHash` and an OPTIONAL `primaryAnchor` (a `qualifiedPath` PREFIX) —
// not a full grounding-computer `StructRef` set, which needs a live index build this store does not run.
// The `StructRef` minted per T0 row below uses `contentHash` AS `subtreeHash` and `primaryAnchor ??
// nodeKey` as `qualifiedPath`, `kind: 'symbol'`. The drift-check this buys is REAL — the row's own content
// hash moving does move it — but it is coarser than the AST-unit oracle `@atlas/grounding` computes at
// emit time, and that gap is stated rather than hidden.

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { asSubtreeHash, id } from "@atlas/kernel"
import type { Node } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import type { CurrentNode } from "@atlas/knowledge"
import { atlasRoot, rollup, awarenessBytes, makeAwarenessMemo } from "@atlas/memory"
import type { Awareness, AwarenessMemo, FacetInput, FacetName, MemberId, RootFacets, WaveAssembly } from "@atlas/memory"
import { createDiskStore } from "./store.js"
import { gitSidecarTrust } from "./store-provenance.js"
import { headSha } from "./run-git.js"

const CONVENTIONS_REL = "CONVENTIONS.md"
const CAS_REL = join(".atlas", "cas")

/** Real `taste` source: `CONVENTIONS.md@sha` in the repo, content-hashed off the ACTUAL bytes on disk.
 *  Absent file ⇒ `undefined` (the caller omits the facet, `rollup` renders `UN-SEEDED`). */
function tasteInput(repoPath: string): FacetInput | undefined {
  const path = join(repoPath, CONVENTIONS_REL)
  if (!existsSync(path)) return undefined
  const text = readFileSync(path, "utf8")
  const anchor: StructRef = {
    kind: "file",
    qualifiedPath: CONVENTIONS_REL,
    subtreeHash: asSubtreeHash(id(text)),
  }
  return { grounding: [anchor], tiers: [`taste: ${CONVENTIONS_REL}@sha`] }
}

/** The coarser `StructRef` a persisted `CurrentNode` row can support (see the header's honest bound). */
function structRefOf(node: CurrentNode): StructRef {
  return {
    kind: "symbol",
    qualifiedPath: node.primaryAnchor ?? node.nodeKey,
    subtreeHash: asSubtreeHash(node.contentHash),
  }
}

/** Sort key so two independent reads of the same on-disk projection fold to the SAME order — `Map`
 *  iteration order is insertion order, not a promise this file wants to depend on for A13b. */
function byNodeKey(a: CurrentNode, b: CurrentNode): number {
  return a.nodeKey < b.nodeKey ? -1 : a.nodeKey > b.nodeKey ? 1 : 0
}

/** Real `constitution` source: the T0-tier rows of the PERSISTED knowledge projection. No persisted
 *  projection, or none tiered `T0`, ⇒ `undefined` (never fabricated). */
function constitutionInput(repoPath: string): FacetInput | undefined {
  const store = createDiskStore(join(repoPath, CAS_REL), () => headSha(repoPath), gitSidecarTrust(repoPath))
  const projection = store.loadProjection()
  if (projection === undefined) return undefined
  const t0 = [...projection.current.values()].filter((n) => n.tier === "T0").sort(byNodeKey)
  if (t0.length === 0) return undefined
  const grounding = t0.map(structRefOf)
  const tiers = [`constitution: ${t0.length} ratified T0 invariant(s)`, ...t0.flatMap((n) => n.claims)]
  return { grounding, tiers }
}

/** One optional facet, spread-safe under `exactOptionalPropertyTypes` — an absent input contributes NO
 *  key at all (never an explicit `undefined` value), which is what makes it a legal `RootFacets` write. */
function facetOr(name: FacetName, input: FacetInput | undefined): Partial<RootFacets> {
  return input === undefined ? {} : { [name]: input }
}

/**
 * Build the REAL Atlas root for this repo (MEM-11): `taste` + `constitution` from real bytes read off
 * disk right now; `mission` / `terrain` / `ontology` omitted (no source this adapter creates, see the
 * file header). `opts.bump` is `@atlas/memory` `atlasRoot`'s own marker-only root bump (MEM-12a) — it
 * moves the root identity without moving either real facet, unchanged here.
 */
export function realAtlasRoot(repoPath: string, opts?: { readonly bump?: string }): Node {
  const facets: RootFacets = {
    ...facetOr("constitution", constitutionInput(repoPath)),
    ...facetOr("taste", tasteInput(repoPath)),
  }
  return atlasRoot(facets, opts)
}

/** The store's surface: read the composed slab, its byte-identical injection form, and the memoized
 *  per-wave assembly — all THREE derived, never re-implemented (see the file header). */
export interface AwarenessStore {
  /** Assemble Awareness fresh from the real root (MEM-11) — pure per call: two independent callers over
   *  the same repo state get byte-identical values without sharing any cache. */
  read(): Awareness
  /** The byte-identical injection form (MEM-11g) of a fresh `read()`. */
  bytes(): Uint8Array
  /** The shared, memoized per-wave assembly (MEM-12) — instrumented `AssemblyReceipt`, never timing. */
  assembleForWave(seats: readonly MemberId[]): WaveAssembly
}

export function createAwarenessStore(repoPath: string): AwarenessStore {
  const memo: AwarenessMemo = makeAwarenessMemo()
  return {
    read(): Awareness {
      return rollup(realAtlasRoot(repoPath))
    },
    bytes(): Uint8Array {
      return awarenessBytes(rollup(realAtlasRoot(repoPath)))
    },
    assembleForWave(seats: readonly MemberId[]): WaveAssembly {
      return memo.assembleForWave(seats, realAtlasRoot(repoPath))
    },
  }
}
