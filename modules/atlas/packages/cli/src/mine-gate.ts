// @atlas/cli — src/mine-gate.ts  (REQ-CLI-4d: where the `mine` driver's admission gate comes from)
//
// Split out of `mine.ts` at the 400-LOC ceiling, and cohesive on its own: everything here answers ONE
// question — where does ADMISSION come from, and what happens when it does not come at all. It is the exact
// sibling of `mine-proposer.ts` ("where does the model come from"): `mine.ts` keeps the run composition,
// these two keep the resolution of the two seams a pass cannot invent for itself.
//
// ── THE DEFECT THIS FILE CLOSES ───────────────────────────────────────────────────────────────────────────
// `mine.ts` used to fall back to `defaultGate()` — an honest fail-closed abstention at EVERY site — and
// NOTHING in production ever injected a gate, so `atlas mine` on a real repository staged ZERO candidates,
// always. `makeAdmitGate`, the gate that forwards the frozen `admit`, had ZERO production callers.
//
// The driver was not the defect. `REQ-CLI-4c` is normative: "the `mine` driver wires the parts and invents
// no admission of its own" — injecting nothing obeys that literally. The defect was that NO requirement
// obliged anyone to SUPPLY the gate, so every run that admitted zero satisfied REQ-CLI-4a/4b/4c and a green
// suite, a closed work package and a shipped binary all agreed while the product mined nothing. REQ-CLI-4d
// is that missing obligation, and `composedGate` below is where it is discharged: the gate is BUILT by the
// composition root (`buildMineAdmission`, adapter-io/src/compose.ts) and merely WIRED here.
//
// MEASURED on Atlas itself at master `1f8c117`, with a real 489-document SCIP index:
//   before — 200 sites visited · 200 model calls · gate reached 200× · 0 staged · every site
//            "no admission seam wired (mine default)".
//   after  — same frontier, same proposer, the gate's own verdict at every site.

import { admit } from "@atlas/genesis"
import type {
  AdmitDeps,
  AdvisoryProposal,
  Candidate,
  EmitGate,
  EmitVerdict,
  Fact,
  FactGrounding,
  NegationProposal,
  PredicateProposal,
  Proposal,
  RelationProposal,
  SeedProposal,
  SkeletonSource,
} from "@atlas/genesis"
import { buildMineAdmission, readScipOrEmpty } from "@atlas/adapter-io"
import type { Reground } from "@atlas/adapter-io"
import { asNodeKey } from "@atlas/kernel"
import { join } from "node:path"

/** The abstention an UNSUPPLIED gate serves. Exported because it is the fingerprint of the defect above:
 *  a golden that cannot name this string cannot tell a working gate from an absent one, and that
 *  indistinguishability IS what let the product ship mining nothing (SCN-CLI-4d-2). */
export const UNWIRED_GATE_REASON = "no admission seam wired (mine default)"

/**
 * The gate a pass gets when NOTHING supplies admission: every site abstains, honestly, naming the wiring
 * rather than the repository (a fabricated fact is never the alternative).
 *
 * IT IS NO LONGER THE PRODUCTION DEFAULT — `withDefaults` (mine.ts) now falls back to `composedGate`. It is
 * retained and EXPORTED for one reason, stated so the next reachability probe does not read it as the same
 * dead-module defect this file closes: SCN-CLI-4d-2 runs the REAL driver with the supply deliberately
 * removed, and without that control the positive golden cannot attribute its admissions to the gate.
 */
export function unwiredGate(): EmitGate {
  return { emit: (_seed, cand) => ({ emitted: false, whyNot: { site: cand.site, reason: UNWIRED_GATE_REASON } }) }
}

/**
 * Build an `EmitGate` that forwards the FROZEN `admit` verdict VERBATIM (GEN-4/12): the seed becomes an
 * advisory candidate (the driver adds NO predicate), `admit` casts the mechanical decision, and its outcome
 * maps 1:1 to the emit verdict. The driver injects NO admission of its own — admission is `admit`'s alone.
 *
 * `reground` is the composition root's FROZEN GROUND-3 anchor builder (`buildMineAdmission().reground`).
 * Production ALWAYS supplies it and SCN-CLI-4d-1 pins the consequence: a structural seed carries the
 * DEPENDENCY-axis node identity as its `subtreeHash`, an anchor `driftDetect` refuses by construction, so a
 * receipt built from the raw seed reads DRIFTED and the truth door drops all 200 of Atlas's sites. Omitted,
 * the receipt is the raw seed's — the shape a hand-built skeleton fixture with one shared identity space
 * needs, and the ONLY case in which it is right.
 */
/**
 * Build the typed `Proposal` (admit-proposals.ts) that MATCHES a seed's fact family (WP-96-SEAM2). The
 * mine driver invents no admission — it only maps the seed's SHAPE to the proposal shape `admit` dispatches
 * on. The transcription is field-for-field from the frozen `*Proposal` types; nothing is synthesized here
 * (no minted relationKey/negationKey — identity is minted downstream by WP-96-R/N).
 *
 * `nodeKey`/`tier` mirror the pre-widening advisory construction so advisory + predicate stay byte-identical.
 */
function buildProposal(seed: SeedProposal, cand: Candidate, groundingFor: (c: Candidate) => FactGrounding): Proposal {
  const nodeKey = asNodeKey(cand.site.qualifiedPath)
  switch (seed.kind) {
    case "predicate": {
      // ADR-0017 dependency slot / #196c count slot: FORWARD the `target`/`scope` identity legs (SEAM2) and the
      // count `atLeast` leg so the sound oracle leg (`admitPredicate`) can PROVE the fact. Absent for non-oracle
      // slots (exactOptionalPropertyTypes ⇒ conditional spread, never `{ x: undefined }`).
      const p: PredicateProposal = {
        kind: "predicate",
        site: cand,
        slot: seed.slot,
        nodeKey,
        claimNorm: seed.claim,
        grounding: groundingFor(cand),
        tier: "T2",
        ...(seed.target !== undefined ? { target: seed.target } : {}),
        ...(seed.scope !== undefined ? { scope: seed.scope } : {}),
        ...(seed.atLeast !== undefined ? { atLeast: seed.atLeast } : {}),
        ...(seed.derivation !== undefined ? { derivation: seed.derivation } : {}), // 196b — forward the justified-slot grounds onto the proposal
      }
      return p
    }
    case "relation": {
      // No relationKey — identity is minted DOWNSTREAM; grounding re-derives off the site (WP-96-R fills admit).
      const p: RelationProposal = {
        kind: "relation",
        site: cand,
        relationKind: seed.relationKind,
        endpointA: seed.endpointA,
        endpointB: seed.endpointB,
        grounding: groundingFor(cand),
        tier: "T2",
      }
      return p
    }
    case "negation": {
      // NO grounding — the governed door constructs the scope-directory Merkle at admit (WP-96-N).
      const p: NegationProposal = {
        kind: "negation",
        site: cand,
        relationKind: seed.relationKind,
        target: seed.target,
        scope: seed.scope,
        tier: "T2",
      }
      return p
    }
    default: {
      // advisory — `kind` 'advisory' OR omitted (every existing producer/fixture). BYTE-IDENTICAL to the
      // pre-widening construction, so every advisory back-compat test still passes.
      const p: AdvisoryProposal = {
        kind: "advisory",
        site: cand,
        nodeKey,
        claimNorm: seed.claim,
        grounding: groundingFor(cand),
        tier: "T2",
      }
      return p
    }
  }
}

export function makeAdmitGate(deps: AdmitDeps, reground?: Reground): EmitGate {
  // The FROZEN GROUND-3 grounding for a site — `reground(site)` in production, or (only when the caller omits
  // it, e.g. a hand-built one-identity-space skeleton fixture) the raw seed's own site. Built once here so
  // every grounded family (advisory / predicate / relation) derives its receipt identically. Negation carries
  // no grounding — its door constructs the scope-directory Merkle at admit (WP-96-N), so it never calls this.
  const groundingFor = (cand: Candidate): FactGrounding =>
    (reground !== undefined
      ? reground(cand.site)
      : { entries: [{ anchor: cand.site, path: cand.site.qualifiedPath }] }) as FactGrounding

  return {
    emit(seed: SeedProposal, cand: Candidate): EmitVerdict {
      // Dispatch on the seed's FACT FAMILY (WP-96-SEAM2): build the MATCHING typed proposal from
      // admit-proposals.ts, then hand it to the frozen `admit` — which routes advisory→admitAdvisory,
      // predicate→admitPredicate (real), relation/negation→their WP-96-R/N stubs. Advisory is byte-identical
      // to the pre-widening construction; a `kind`-less seed (every existing producer/fixture) IS advisory.
      const proposal: Proposal = buildProposal(seed, cand, groundingFor)
      const verdict = admit(proposal, deps)
      if (verdict.outcome === "admitted") {
        // [#195 b] Carry the VALIDATED answer bytes THROUGH the admitted fact so the mine emit path
        // (`mine-decide.ts`) can scrub-and-put them to CAS and stamp `answerRef` (the CAS id) on the ROW.
        // It rides as a NON-IDENTITY transport field only: `mine-decide.ts` STRIPS `rawAnswer` before any
        // `id(fact)`/`nodeKey`, so a provenance receipt never enters the fact's content hash or identity.
        const fact: Fact =
          seed.rawAnswer !== undefined
            ? ({ ...verdict.fact, rawAnswer: seed.rawAnswer } as unknown as Fact)
            : verdict.fact
        return { emitted: true, fact }
      }
      const reason = verdict.outcome === "dropped" ? verdict.reason : verdict.whyNot.reason
      return { emitted: false, whyNot: { site: cand.site, reason } }
    },
  }
}

/**
 * THE SUPPLY (REQ-CLI-4d). The gate `atlas mine` runs when the caller injects none: the frozen `admit`
 * seams, built by the composition root over THE VERY AXES THIS PASS IS MINING.
 *
 * The axes come from the pass's own `SkeletonSource`, never from a second index build. That is not only an
 * optimisation (the source memoizes per `(repo, rev)`, and the controller already asks it twice per pass) —
 * it is a correctness property: a gate that re-walked the tree could resolve a different index from the one
 * the sites were ranked out of, and would then refuse anchors that the frontier says exist.
 *
 * LAZY, because construction is not free and abstention is not the only outcome that costs nothing: a repo
 * with an empty frontier visits no site, calls no model, and must not pay for an index build it never reads.
 * Memoized on first `emit` — the skeleton is deterministic, so the memo is behaviour-preserving.
 */
export function composedGate(skeleton: SkeletonSource, repoPath: string, rev: string): EmitGate {
  let gate: EmitGate | undefined
  const resolve = (): EmitGate => {
    const sk = skeleton.skeleton(repoPath, rev)
    const { deps, reground } = buildMineAdmission(sk.axes, readScipOrEmpty(join(repoPath, ".atlas", "index.scip")))
    return makeAdmitGate(deps, reground)
  }
  return { emit: (seed, cand) => (gate ??= resolve()).emit(seed, cand) }
}
