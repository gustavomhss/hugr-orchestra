// @atlas/index — src/ownership.ts  (WP-2.9-a.INDEX — generated + reconciled ownership, INDEX-15)
//
// The anti-CODEOWNERS-rot reconciler: `reconcile(graph, blame, manifest)` GENERATES each territory's
// `owner` from the structural graph + git-blame, with the manifest as an OVERRIDE layer (manifest beats
// generated). Deterministic + `$0`-LLM; `tier` stays human-ratified (passed through untouched); git-blame
// is a BLACK-BOX signal (`BlameEntry`, refuse-to-model), never ownership ground truth.

import type { Territory } from "@atlas/contracts"
import type { DepEdge, Manifest } from "./types.js"
import { pathMatchesGlob } from "./territory.js"

/**
 * The reconciled ownership map — the deterministic partition (after overlap resolution): each territory
 * → its reconciled `owner` (seat). Transcribed from the reference `reconcile(...)` return
 * (method-tags-idx:122), keyed by the frozen `Territory` (atlas-index:76-78, §territory manifest);
 * `owner` is the nominal seat id carried as `string` (see @atlas/contracts `Territory` owner FLAG).
 *
 * [FLAG — key granularity] atlas-index:80-82 says the partition is ultimately per structural unit
 * (unit → one territory); this minimal map keys by `Territory` (the manifest's atomic governance unit),
 * NOT per-`StructRef`. Left for the WP to widen to unit-granularity if the build needs it.
 */
export type OwnerMap = ReadonlyMap<Territory, string>

/**
 * A git-blame authorship signal for one path — the minimal transcription of atlas-index:87 ("git-blame
 * authorship"), fed as a black-box signal to the reconciler (refuse-to-model, method-tags-idx:148-149;
 * blame is NOT modeled as ownership ground truth). A local build input, NOT a contracts type.
 */
export interface BlameEntry {
  readonly path: string
  readonly authors: readonly string[]
}

export interface OwnershipApi {
  /** Deterministic owner-generator over the structural depends-on graph + git-blame, then the manifest
   *  override as a precedence layer (override beats generated); `tier` passed through untouched,
   *  `$0`-LLM (INDEX-15). (method-tags-idx:122)
   *
   *  `graph` = the frozen depends-on graph (`DepEdge[]`, the structural signal — atlas-index:87, 105);
   *  `blame` = the git-blame authorship signal (`BlameEntry[]`, a black-box signal — see `BlameEntry`);
   *  `manifest` = the hashed `Manifest` override layer. */
  reconcile(graph: readonly DepEdge[], blame: readonly BlameEntry[], manifest: Manifest): OwnerMap
}

// Reconciliation is pure — it NEVER consults a model (INDEX-15c). SCN-INDEX-15c-1 witness: statically 0.
const RECONCILE_MODEL_CALLS = 0
export const reconcileModelCalls = (): number => RECONCILE_MODEL_CALLS

const dirname = (p: string): string => {
  const i = p.lastIndexOf("/")
  return i === -1 ? "" : p.slice(0, i)
}

/**
 * The generated owner from git-blame authorship: the majority author across the territory's blame entries,
 * deterministic (lexical tiebreak). `graph` is the structural co-signal accepted per the frozen INDEX-15
 * contract ("generated from the structural graph + git-blame"); under the frozen inputs its edges are
 * `Hash→Hash` with no author projection, so it cannot refine the blame majority — it is threaded through,
 * not invented into a fabricated owner. Returns `''` when there is no blame evidence.
 */
const generatedOwner = (entries: readonly BlameEntry[], graph: readonly DepEdge[]): string => {
  void graph // structural co-signal (no author projection under the frozen inputs) — see doc above.
  const tally = new Map<string, number>()
  for (const e of entries) for (const a of e.authors) tally.set(a, (tally.get(a) ?? 0) + 1)
  let winner = ""
  let bestN = -1
  for (const author of [...tally.keys()].sort()) {
    const n = tally.get(author)!
    if (n > bestN) {
      winner = author
      bestN = n
    }
  }
  return winner
}

/**
 * Reconcile territory ownership (INDEX-15). Deterministic, `$0`-LLM. For each manifest territory: owner =
 * explicit override if present, else generated from blame; `tier` on the key is the ratified manifest tier
 * (never generated). Blame paths NOT claimed by any manifest glob are grouped by governance zone into
 * generated (unlisted) territories — the manifest is not the sole source. `Territory` object keys are
 * reference-stable (the manifest's own objects for listed territories).
 */
export function reconcile(graph: readonly DepEdge[], blame: readonly BlameEntry[], manifest: Manifest): OwnerMap {
  const map = new Map<Territory, string>()
  const claimed = new Set<string>()

  // 1. manifest territories — override beats generated; ratified tier passed through untouched (on the key).
  for (const t of manifest.territories) {
    const mine = blame.filter((b) => t.globs.some((g) => pathMatchesGlob(b.path, g)))
    for (const b of mine) claimed.add(b.path)
    map.set(t, t.owner !== "" ? t.owner : generatedOwner(mine, graph))
  }

  // 2. generation ENABLED (INDEX-15a/15e) — territories evidenced by blame but unlisted, grouped by zone.
  const groups = new Map<string, BlameEntry[]>()
  for (const b of blame) {
    if (claimed.has(b.path)) continue
    const zone = dirname(b.path)
    const bucket = groups.get(zone) ?? []
    bucket.push(b)
    groups.set(zone, bucket)
  }
  for (const zone of [...groups.keys()].sort()) {
    const entries = groups.get(zone)!
    // synthesized (ungoverned) key: tier defaults to the least-critical T2 — a structural placeholder, NOT
    // a generated criticality claim (INDEX-15d guards manifest-ratified tiers; unlisted zones have none).
    const synth: Territory = { name: zone, owner: "", tier: "T2", globs: [`${zone}/**`] }
    map.set(synth, generatedOwner(entries, graph))
  }
  return map
}
