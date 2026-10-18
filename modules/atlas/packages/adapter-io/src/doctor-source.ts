// @atlas/adapter-io — src/doctor-source.ts  (DOCTORSOURCE — the real read-only DoctorSource port)
//
// The last governed seam: the REAL `DoctorSource` (@atlas/tools) `atlas doctor` reads over. It is built
// from the SAME durable store + arbitrary-rev index the governed emit leg rides — NOT a fresh oracle:
//   - `hotSetSize()` — the current-node count of the rehydrated durable projection (@atlas/knowledge).
//   - `lineage(scope?)` — the monotone CAS supersede-chain of the current nodes: each node's `contentHash`
//     plus its `supersededBy` pointer, canonically ordered, optionally filtered by the fact's `scope`.
//   - `drift(fact)` — DETECT: the RECORDED grounding no longer holds at HEAD (`reDerives(fact,HEAD)` is NOT
//     FRESH — some cited anchor's `qualifiedPath` is gone OR now carries different content). CLASSIFY (the
//     KNOW-5 split, mirroring `bindReconcile`) over THE ENTRIES THAT ACTUALLY DRIFTED: does each one's
//     CONTENT (`subtreeHash`) still re-derive SOMEWHERE at HEAD (`resolveBySubtreeAt('HEAD', …)`)? If EVERY
//     drifted entry does, the claim MOVED but survives ⇒ `mechanical`, `anchorNow` = the first such entry's
//     new location (re-groundable). If ANY of them does not, that citation rotted ⇒ `semantic`, keyed on the
//     ROTTED entry, `anchorNow` naming what its recorded path holds now (or the recorded anchor when the
//     path too is gone). Crucially it does NOT re-compare the recorded hash to itself on the SAME anchor
//     (the old bug: that made mechanical structurally unreachable — a detected drift was ALWAYS semantic).
//   - `plan(fact)` — only when drifted: mechanical ⇒ a `reground` template (EVERY drifted entry re-anchored
//     to where its content lives at HEAD), semantic ⇒ a `retire` template (the fact tagged SUPERSEDED). The
//     emitted candidate is a well-formed `GroundedFact` — the payload the doctor plan funnels through the
//     governed `atlas-emit` write door.
//
// ── SYMMETRY: DETECTION, CLASSIFICATION AND REPAIR ALL SPAN EVERY ENTRY ───────────────────────────────────
// Detection has always been total over the grounding (`reDerives` → `driftDetect`, a conjunction over every
// citation). Classification and repair used to touch `entries[0]` ALONE, and that asymmetry WAS the defect: a
// fact that drifted because a SECONDARY citation went stale still resolved its primary anchor at HEAD, read
// `mechanical`, and emitted a "repair" that swapped the primary anchor to effectively where it already was —
// a plan that could never land, stamped `freshness: 'FRESH'` by a template that had re-derived nothing.
//
// THE HONEST SEVERITY, MEASURED, NOT ROUNDED UP (`test/doctor-entry-symmetry.test.ts`): the FRESH stamp never
// reached the projection. `governed-emit.ts` gate 1 re-derives the WHOLE grounding through `buildGate` and
// REFUSES a non-HOLDS node (`REJECTED_UNGROUNDED`, nothing persisted) — and it recomputes freshness from the
// index, never reading the node's own `freshness` field, so the stamp is inert at the door. The live defect
// was therefore a MISCLASSIFICATION plus a repair plan that could not land, not a false FRESH in the store.
//
// ── ONE CLASSIFIER, NOT TWO COPIES (`isMechanicalAt`) ────────────────────────────────────────────────────
// `doctor` is advisory and exits 0. `atlas reconcile` is a MERGE GATE (`exitCode = |semantic| > 0 ? 2 : 0`).
// Both ask the same mechanical-vs-semantic question, and they used to ask it from two separate bodies — this
// one, and a copy inlined at the composition root. The copy with teeth was not the copy anyone was reading:
// it stayed keyed on `entries[0]`, so a fact carrying a citation that had rotted away classified `mechanical`
// and the gate reported a clean merge (MEASURED end to end in `test/reconcile-entry-symmetry.test.ts`:
// `exitCode 0`, `semantic []`). `isMechanicalAt` below is now the single body both consume.
//
// TOTAL + READ-ONLY: an unknown fact, an absent anchor, a missing HEAD resolution ⇒ `undefined`/empty,
// NEVER a throw and NEVER a write. Every read rides the total store/revIndex seams (both fail-closed).

import type { Freshness, Hash, StructRef } from "@atlas/contracts"
import type { GroundingEntry } from "@atlas/grounding"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { asHash, id } from "@atlas/kernel"
import type { CasObject } from "@atlas/kernel"
import { currentNodes } from "@atlas/knowledge"
import type { GroundedFact } from "@atlas/knowledge"
import type { CasIntegrity, DoctorSource, DriftItem } from "@atlas/tools"
import type { RevIndex } from "./rev-index.js"
import { rehydrateProjection } from "./store.js"
import type { DiskStore } from "./store.js"
import { refuseUntrustedRead } from "./read-provenance.js"
import type { SidecarTrust } from "./store-provenance.js"

/** The rev `drift`/`plan` diff against — the composition root pins HEAD once per process (revIndex memoizes
 *  the built `Axes` by rev), so `drift` compares the RECORDED anchor vs HEAD-at-compose-time. */
const HEAD: Hash = asHash("HEAD")

/** The fact restricted to ONE grounding entry — the unit a per-entry drift verdict is taken on.
 *
 *  This is a DECOMPOSITION of the detection oracle, not a second oracle. `reDerives` reads only
 *  `fact.grounding`, and `driftDetect` (@atlas/grounding src/drift.ts) is a CONJUNCTION over entries (any
 *  unresolvable-or-changed anchor ⇒ DRIFTED; all resolve ⇒ FRESH), so for a grounding with ≥1 entry
 *      reDerives(fact, rev)  ⇔  ∀ e ∈ entries. reDerives(restrictTo(fact, e), rev)
 *  — the per-entry verdicts partition exactly the whole-fact verdict `drift` detects on. (`isGrounded`'s
 *  `entries.length >= 1` leg is why the equivalence is stated for a non-empty grounding; the empty case is
 *  refused before any of this runs.) Narrowed on `kind` so the discriminated union stays intact. */
function restrictTo(fact: GroundedFact, entry: GroundingEntry): GroundedFact {
  const grounding = { entries: [entry] }
  return fact.kind === "predicate" ? { ...fact, grounding } : { ...fact, grounding }
}

/** One drifted citation: the recorded entry, its POSITION in the grounding, and where its CONTENT lives at
 *  the target rev (`now`; `undefined` = nowhere, or at ≥2 distinct paths, which `resolveBySubtreeAt` REFUSES
 *  rather than guesses — either way not mechanically re-groundable). */
interface DriftedEntry {
  readonly index: number
  readonly entry: GroundingEntry
  readonly now: StructRef | undefined
}

/** EVERY recorded entry that no longer re-derives at `at`, in recorded order. It spans the whole grounding
 *  because DETECTION does — the two used to disagree, and that asymmetry was the defect. Total: every leg
 *  rides the fail-closed revIndex seams, so a bad rev or an absent unit yields "drifted, not re-groundable",
 *  never a throw. */
function driftedEntries(revIndex: RevIndex, fact: GroundedFact, at: Hash): readonly DriftedEntry[] {
  return fact.grounding.entries.flatMap((entry, index) =>
    revIndex.reDerives(restrictTo(fact, entry), at)
      ? []
      : [{ index, entry, now: revIndex.resolveBySubtreeAt(String(at), String(entry.anchor.subtreeHash)) }],
  )
}

/**
 * THE KNOW-5 verdict, and the ONE place in the system where mechanical-vs-semantic is decided.
 *
 * SEMANTIC IF *ANY* DRIFTED CITATION'S CONTENT RE-DERIVES NOWHERE at `at`. That is the fail-closed
 * direction: no automatic re-ground can make such a fact whole (the repair would rewrite the movable
 * citations and leave that one broken — an emit the truth door refuses), so the honest verdict is "a human
 * must re-author this". `keyedOn` is the ROTTED entry, i.e. the citation that has to be re-authored — not
 * position zero, whatever happened to it.
 *
 * MECHANICAL otherwise, `keyedOn` the FIRST drifted entry (the one `DriftItem`'s single frozen anchor pair
 * reports). VACUOUSLY mechanical when NO entry drifted: `[].every(…)` is true, and that is deliberate and
 * load-bearing at the merge gate. `reconcile` calls this for facts its own detector declared drifted; if the
 * per-entry oracle disagrees and sees no drift at all, there is no citation to re-author, and answering
 * `semantic` there would BLOCK A MERGE over a fact nothing is wrong with. Non-blocking is the correct answer
 * to "nothing drifted", and it is also what the entry-0 predicate answered, so no gate moves on this path.
 */
function classifyDrift(
  revIndex: RevIndex,
  fact: GroundedFact,
  at: Hash,
): { readonly class: "mechanical" | "semantic"; readonly keyedOn: DriftedEntry | undefined } {
  const drifted = driftedEntries(revIndex, fact, at)
  const rotted = drifted.find((d) => d.now === undefined)
  return rotted !== undefined ? { class: "semantic", keyedOn: rotted } : { class: "mechanical", keyedOn: drifted[0] }
}

/**
 * THE classification predicate — `true` ⇔ the drift is MECHANICAL (auto-re-groundable), `false` ⇔ SEMANTIC.
 *
 * EXPORTED BECAUSE IT HAS TWO CONSUMERS AND MUST NEVER HAVE TWO IMPLEMENTATIONS. `drift` below reads
 * `classifyDrift` for the doctor's advisory verdict; `compose.ts` feeds this predicate to `bindReconcile`,
 * whose `exitCode = |semantic| > 0 ? 2 : 0` IS the merge gate. Those two used to be separate copies of the
 * same question — doctor's, and one inlined at the composition root — and the copy with teeth was the one
 * nobody was reading: it kept asking about `entries[0]`, so a fact carrying a citation that had rotted away
 * classified `mechanical` and the gate reported a clean merge. A second CORRECT copy would still be two
 * copies, free to diverge again, which is why this is a shared export and not a repeated body.
 *
 * Pure w.r.t. the store and total: `revIndex` is the injected fail-closed seam, so an unreadable rev makes
 * every entry read drifted-and-unresolvable ⇒ `semantic` ⇒ the gate BLOCKS rather than waving a merge
 * through on a rev it could not read.
 */
export function isMechanicalAt(revIndex: RevIndex, fact: GroundedFact, at: Hash): boolean {
  return classifyDrift(revIndex, fact, at).class === "mechanical"
}

/**
 * The MECHANICAL re-ground candidate: the SAME claim with every grounding entry re-anchored to where its
 * content was ESTABLISHED at HEAD. `resolved` is POSITIONAL over `fact.grounding.entries`:
 *   - `resolved[i]` a `StructRef` — entry `i`'s established HEAD location (its recorded anchor when the
 *     entry never drifted; its NEW location when the content moved). The entry is rewritten to it.
 *   - `resolved[i]` `undefined` (or absent — a short array) — entry `i`'s freshness could NOT be
 *     established. Its recorded anchor is left alone and the repair is PARTIAL.
 *
 * FRESHNESS IS DERIVED, NEVER ASSERTED, and that is what the second parameter is for. This template used to
 * rewrite `entries[0]` and stamp `freshness: 'FRESH'` unconditionally — on a fact whose drift may have come
 * from ANY entry, so the stamp described a re-derivation that had not happened. Here it is `FRESH` iff EVERY
 * entry is established (the same conjunction `driftDetect` computes) and `DRIFTED` otherwise: a partial
 * repair says so in the field the reader trusts. Pure + total; an anchorless grounding is returned unchanged
 * (nothing to re-ground). Narrowed on `kind` so the discriminated union stays intact.
 */
export function regroundTemplate(fact: GroundedFact, resolved: readonly (StructRef | undefined)[]): GroundedFact {
  const recorded = fact.grounding.entries
  if (recorded.length === 0) return fact
  const entries = recorded.map((e, i) => {
    const now = resolved[i]
    return now === undefined ? e : { ...e, anchor: now }
  })
  const grounding = { entries }
  const freshness: Freshness = recorded.every((_, i) => resolved[i] !== undefined) ? "FRESH" : "DRIFTED"
  return fact.kind === "predicate" ? { ...fact, grounding, freshness } : { ...fact, grounding, freshness }
}

/**
 * The SEMANTIC retire candidate: the fact tagged for retire (`authoring: 'SUPERSEDED'`, valid on both
 * node families) — the claim no longer re-derives, so it is retired through the governed `atlas-emit` write door, not
 * re-grounded. Pure + total; the claim body is otherwise unchanged.
 */
export function retireTemplate(fact: GroundedFact): GroundedFact {
  return fact.kind === "predicate" ? { ...fact, authoring: "SUPERSEDED" } : { ...fact, authoring: "SUPERSEDED" }
}

/**
 * Build the REAL read-only `DoctorSource` over the durable `store` + the arbitrary-rev `revIndex`. Every
 * leg reads; NONE writes. The persisted `GroundedFact` is read back from CAS (invariant-6:
 * `store.get(contentHash)` returns the WHOLE fact governed-emit `put`), so `drift`/`plan` operate on the
 * recorded grounding, never a re-derived guess.
 */
export function createDoctorSource(
  store: DiskStore,
  revIndex: RevIndex,
  trusted?: SidecarTrust,
  casPath?: string,
): DoctorSource {
  /** The current nodes of the rehydrated durable projection (exactly one per nodeKey).
   *
   *  PROVENANCE FIRST, and this is the ONE place in this module that is not total. Every doctor leg funnels
   *  through here, so one guard covers `hotSetSize`/`lineage`/`drift`/`plan` and no future leg can be added
   *  that forgets it. Without it, a COMMITTED store made `atlas doctor hotset` report `size=0` and exit 0 —
   *  "your knowledge base is empty and healthy" — about a store the read doors had just refused to serve.
   *  Reporting health for state you have refused to read is worse than reporting nothing.
   *
   *  `DoctorSource` is documented TOTAL, and this throw is a deliberate, narrow exception to that: the port
   *  has no refusal channel (its legs return `number` / `Hash[]` / `DriftItem | undefined`, all of which
   *  would have to LIE), and the one production caller, `cli/src/doctor.ts`, converts the throw into the
   *  same structured error + guidance + non-zero exit every other doctor failure renders. The absent-seam
   *  case is unaffected: `refuseUntrustedRead` is a no-op for a store built without the provenance seam. */
  const nodes = () => {
    refuseUntrustedRead(trusted)
    return currentNodes(rehydrateProjection(store))
  }

  /** Read a fact back from CAS by its content hash (invariant-6). `undefined` on any miss/tamper. */
  const factOf = (contentHash: string): GroundedFact | undefined =>
    store.get(contentHash as Hash) as GroundedFact | undefined

  const hotSetSize = (): number => nodes().length

  const lineage = (scope?: string): readonly Hash[] => {
    const chain: string[] = []
    for (const n of nodes()) {
      if (scope !== undefined && factOf(n.contentHash)?.scope !== scope) continue // scope-filtered
      chain.push(n.contentHash)
      if (n.supersededBy !== undefined) chain.push(n.supersededBy) // the CAS supersede pointer
    }
    return [...new Set(chain)].sort() as Hash[] // canonical (dedup + lexicographic) order
  }

  const drift = (fact: string): DriftItem | undefined => {
    const node = nodes().find((n) => n.nodeKey === fact)
    const grounded = node && factOf(node.contentHash)
    if (!grounded) return undefined // unknown fact / missing bytes — fail-closed
    if (grounded.grounding.entries.length === 0) return undefined // no citation to diff
    // DETECT (unchanged, and it always spanned the WHOLE grounding): the recorded grounding still holds at
    // HEAD (every anchor re-derives FRESH) ⇒ NOT drifted. This fires on BOTH a moved anchor (a recorded
    // qualifiedPath gone at HEAD) AND a changed unit (same path, new subtreeHash) — never a self-compare of
    // the recorded hash against itself, and never a look at entry 0 alone.
    if (revIndex.reDerives(grounded, HEAD)) return undefined
    // CLASSIFY through the SHARED verdict — the same call `compose.ts` gives the merge gate, so doctor's
    // advisory answer and `atlas reconcile`'s exit code can never disagree about the same fact.
    const verdict = classifyDrift(revIndex, grounded, HEAD)
    const keyed = verdict.keyedOn
    if (keyed === undefined) return undefined // totality: a DRIFTED fact has ≥1 drifted entry
    const anchorWas = keyed.entry.anchor
    if (verdict.class === "semantic") {
      // `anchorNow` names what the ROTTED entry's recorded path holds now, or — when the path itself is gone
      // — its recorded anchor (a total, honest pointer; never a throw).
      const anchorNow = revIndex.resolveAnchorAt(String(HEAD), anchorWas.qualifiedPath) ?? anchorWas
      return { fact, class: "semantic", anchorWas, anchorNow }
    }
    // Mechanical: every drifted citation MOVED but survives — the whole fact is re-groundable. `DriftItem`
    // carries ONE anchor pair (atlas-tools:24, frozen), so it reports the FIRST drifted entry's move; the
    // repair below is not limited to it. When only the primary drifted — the case that already worked — this
    // is byte-for-byte the item the entry-0 classifier produced.
    if (keyed.now === undefined) return undefined // totality: mechanical ⇒ every drifted entry resolved
    return { fact, class: "mechanical", anchorWas, anchorNow: keyed.now }
  }

  const plan = (fact: string): { readonly action: "reground" | "retire"; readonly emit: GroundedFact } | undefined => {
    const item = drift(fact)
    if (item === undefined) return undefined // only a drifted fact carries a plan
    const node = nodes().find((n) => n.nodeKey === fact)
    const grounded = node && factOf(node.contentHash)
    if (!grounded) return undefined // totality guard (drift implies present, but never assume)
    if (item.class !== "mechanical") return { action: "retire", emit: retireTemplate(grounded) }
    // REPAIR spans the same entries CLASSIFICATION did. Position by position: a drifted entry is established
    // at the HEAD location its content re-derived to; an entry that did NOT drift is already established at
    // its recorded anchor (that is what "did not drift" means), so it is passed through unchanged. The
    // classifier only reaches here when every drifted entry resolved, so the template's FRESH stamp is
    // EARNED — the emitted fact re-derives at HEAD end to end, and `regroundTemplate` would stamp DRIFTED if
    // it did not.
    const drifted = driftedEntries(revIndex, grounded, HEAD)
    const resolved = grounded.grounding.entries.map((e, i) => {
      const d = drifted.find((x) => x.index === i)
      return d === undefined ? e.anchor : d.now // a drifted-and-unresolved entry stays `undefined` ⇒ PARTIAL
    })
    return { action: "reground", emit: regroundTemplate(grounded, resolved) }
  }

  /**
   * ADR-0022 — the CAS integrity audit. Re-derives every object's address from its own bytes and compares
   * that to the filename it is filed under, then reconciles the present set against the set the sidecars
   * reference.
   *
   * ── PROVENANCE FIRST, THEN TOTAL — the split, and why it is drawn HERE ─────────────────────────────────
   * The first cut of this leg skipped the provenance guard, on the argument that an audit of the STORAGE
   * must not fail where the fault is. `doctor-provenance-total.test.ts` refuted it, and the refutation was
   * right: this leg reads `loadProjection()` for the referenced set, so on a store the read doors REFUSE it
   * would report the objects it walked against `referenced: 0` — which renders as "724 orphans, sound=true",
   * a clean bill of health for state we have declined to serve. That is the exact defect this module's
   * `nodes()` header describes, reached by a different door. So the guard runs first, and the leg refuses
   * whole rather than serving an uninterpretable receipt.
   *
   * TOTALITY IS KEPT WHERE IT WAS ACTUALLY EARNED: filesystem conditions. An absent CAS root, an unlistable
   * shard, a file that disappears mid-walk — those ARE the conditions this leg exists to describe, and they
   * yield an honest receipt rather than a throw. The honest zero is readable because `referenced` sits
   * beside it: zero objects against a non-zero referenced count is a loud `missing` list.
   *
   * ── WHAT `sound` MEANS, AND WHAT IT DOES NOT ────────────────────────────────────────────────────────────
   * `corrupt ∪ unreadable ∪ missing` empty. `orphan` is EXCLUDED on purpose: the CAS is append-only and
   * content-keyed, so an object outliving the sidecar that referenced it is ordinary, not a defect.
   */
  const casAudit = (): CasIntegrity => {
    const empty: CasIntegrity = {
      objects: 0,
      corrupt: [],
      unreadable: [],
      missing: [],
      orphan: 0,
      referenced: 0,
      sound: true,
    }
    refuseUntrustedRead(trusted) // the SAME guard every other leg funnels through — see the header above
    if (casPath === undefined) return empty

    // The bytes actually on disk, at `<cas>/<xx>/<h>`. A shard that cannot be listed contributes nothing
    // rather than aborting the walk — a single unreadable directory must not blind the audit to the rest.
    const present = new Set<string>()
    const corrupt: string[] = []
    const unreadable: string[] = []
    let shards: string[]
    try {
      shards = readdirSync(casPath, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    } catch {
      shards = []
    }
    for (const shard of shards) {
      let files: string[]
      try {
        files = readdirSync(join(casPath, shard), { withFileTypes: true })
          .filter((e) => e.isFile())
          .map((e) => e.name)
      } catch {
        continue
      }
      for (const name of files) {
        present.add(name)
        let parsed: unknown
        try {
          parsed = JSON.parse(readFileSync(join(casPath, shard, name), "utf8"))
        } catch {
          unreadable.push(name)
          continue
        }
        // THE CHECK. `id()` is the same sealed canonicalize-then-hash seam `store.put` addressed the object
        // with, so a mismatch means the bytes changed after they were filed — the one thing a content-
        // addressed store promises cannot happen silently. `id` can throw on a value it cannot canonicalize;
        // that is `unreadable`, not `corrupt`, because nothing was proven about the address either way.
        let addr: string
        try {
          addr = id(parsed as CasObject)
        } catch {
          unreadable.push(name)
          continue
        }
        if (addr !== name) corrupt.push(name)
      }
    }

    // What the PROJECTION points at, read through the store's own trusted loader — so this leg cannot see
    // a projection the read doors would have refused.
    //
    // [STATED LIMIT — STAGING IS NOT IN THE REFERENCED SET, AND THAT IS NOT AN OVERSIGHT.] `loadStaging` was
    // DELETED on purpose (task #83: "THERE IS EXACTLY ONE STAGING DOOR, AND THAT IS DELIBERATE"), so there
    // is no read path to the staged candidate set that does not reopen a door someone closed with a reason.
    // The consequence is precise and one-directional: an object referenced ONLY by staging counts as
    // `orphan`. It can never make `sound` false — `orphan` is excluded from `sound` — so the limit costs a
    // count's precision and cannot manufacture a fault. Stated here rather than left for a reader to
    // discover from a surprising number.
    const referenced = new Set<string>(store.loadProjection()?.cas ?? [])

    const missing = [...referenced].filter((h) => !present.has(h)).sort()
    let orphan = 0
    for (const h of present) if (!referenced.has(h)) orphan += 1

    corrupt.sort()
    unreadable.sort()
    return {
      objects: present.size,
      corrupt: corrupt as readonly string[] as readonly Hash[],
      unreadable: unreadable as readonly string[] as readonly Hash[],
      missing: missing as readonly string[] as readonly Hash[],
      orphan,
      referenced: referenced.size,
      sound: corrupt.length === 0 && unreadable.length === 0 && missing.length === 0,
    }
  }

  return { hotSetSize, lineage, drift, plan, casAudit }
}
