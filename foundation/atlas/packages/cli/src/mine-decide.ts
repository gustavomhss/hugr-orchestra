// @atlas/cli — src/mine-decide.ts  (#195 · REQ-CLI-4d — the pure staging decision, split from mine.ts)
//
// EXTRACTED from `mine.ts` at the 400-LOC godfile ceiling along the cohesive boundary #195 forced: "how one
// batch of admitted facts becomes the next staging snapshot" — THE WHOLE PASS BODY AS ONE PURE DECISION over
// a staging snapshot, the shape `commitStaging` requires. The exact sibling of the mine-proposer / mine-gate /
// mine-render / mine-staging extractions. `mine.ts` keeps the run composition and CALLS this; `claimNormOf`
// and the decision were both file-internal to `mine.ts`, so nothing here is (or was) re-exported.
//
// #195 (b) LANDS HERE: a mined fact carries a content-addressed, tamper-evident receipt (`answerRef`, the CAS
// id) for the exact answer bytes the model returned. The receipt is built by `mine-answer.ts` (SCRUB → CAS
// object → CAS id, KNOW-11 order), and the answer's provenance NEVER enters the fact's identity: `rawAnswer`
// arrives as a
// transport field on the fact (attached in `mine-gate.ts`) and is STRIPPED here before `id(f)` / `nodeKey`,
// so a fact mined WITH a receipt has a byte-identical contentHash to one mined without.

import type { CommitDecision } from "@atlas/adapter-io"
import type { Fact } from "@atlas/genesis"
import {
  upsert as knowledgeUpsert,
  normalizeCheck,
  primaryAnchorId,
  nodeKey,
  relationKey,
  negationKey,
} from "@atlas/knowledge"
import type { WriteRequest, StoreProjection, Candidate as KnowledgeCandidate } from "@atlas/knowledge"
import { id } from "@atlas/kernel"
import { MINED_SCOPE, MINED_TIER } from "./mine-staging.js"
import { answerReceipt } from "./mine-answer.js"
import { scrubClaimNorm, scrubCheck, scrubUnit, scrubGrounding } from "./mine-claim-scrub.js"

/** The KNOW-4c set-union element a mined write carries, per family. Advisory ⇒ its claim body; predicate ⇒
 *  its normalized check; RELATION (ADR-0015 D2, WP-96-R) ⇒ the canonical triple `A <kind> B`, MIRRORING the
 *  governed door's `claimNormOf(node, 'relation')` (adapter-io/src/governed-emit-identity.ts:54-57) and the
 *  harness `relationClaimNorm` (genesis/src/admit-relation.ts) verbatim — so a MINED relation and a
 *  governed-emitted one dedup on byte-identical set-union text and a re-mine is an idempotent UPDATE, never a
 *  second claim. NEGATION (ADR-0015 D3, WP-96-N) ⇒ `NOT(target relationKind)@scope`, MIRRORING the negation
 *  door's own WriteRequest `claimNorm` (governed-emit-negation.ts:251) verbatim over the WITNESS scope, so a
 *  mined negation and a door-emitted one dedup on identical set-union text. */
const claimNormOf = (f: Fact): string =>
  f.kind === "advisory"
    ? f.claimNorm
    : f.kind === "predicate"
      ? normalizeCheck(f.check)
      : f.kind === "relation"
        ? `${f.endpointA} ${f.relationKind} ${f.endpointB}`
        : f.kind === "negation"
          ? `NOT(${f.target} ${f.relationKind})@${f.scope}`
          : ""

/**
 * THE WHOLE PASS BODY AS ONE PURE DECISION over a staging snapshot — the seam `commitStaging` requires. It used to be
 * `loadStaging() ?? emptyStore()` at pass start plus `persistStaging` per site: atomic (no torn read, no annihilation) but
 * UNCONDITIONAL, hence last-writer-wins BY DEFINITION — two concurrent passes rehydrate one snapshot, each compute a whole-Map
 * replacement, and the second publish erases the first's candidates while BOTH exit 0 reporting what they "seeded" (MEASURED at
 * 8 processes × 5 sites: 40 reported committed, 5 durable). `commitStaging` re-runs this from scratch on every lost compare-and-
 * swap — hence PURE: no writes (CAS objects ride out in `put`, ordered before publication), no clock, no random. ESTABLISHED is
 * recomputed per attempt via `grounded`: a key in THIS snapshot this pass did not itself write. A pass-start set computed once is
 * not re-runnable and missed a row a CONCURRENT pass staged after we started, which the old code then set-unioned into; the
 * exclusion is `grounded`/`minted`, not the running projection, so a pass can still make a SECOND claim about a symbol it wrote.
 *
 * `grounded` is passed in (the caller keeps it across settled commits) rather than closed over, which is the only change the
 * mine.ts→mine-decide.ts split imposed on the body — the decision stays a pure function of `(staged, incoming, grounded)`.
 */
/** A grounded row, WIDENED to optionally carry its own `answerRef` alongside it — additive, and read by
 *  exactly one caller: `mine.ts`'s `upsert` fold, which is also `ControllerDeps.answerReceipts`'s (#209) sole
 *  source (see the header there). `Fact` itself (genesis, frozen) is NOT touched; this is a CLI-local
 *  transport shape for the one hop between "this row minted with a receipt" and "the report counts it". */
export type MintedFact = Fact & { readonly answerRef?: string }

/**
 * FAMILY-AWARE staging identity mint (bobby F1 — the load-bearing fix). MIRRORS the governed door's
 * `resolveWriteIdentity` (packages/adapter-io/src/governed-emit-identity.ts:99-111) and the negation door's
 * mint (governed-emit-negation.ts:163). The generic `nodeKey(view)` + `primaryAnchorId(view)` path assumes a
 * single-anchor intrinsic node; a RELATION grounds over two distinct files, so `deepestCommonUnit` is the
 * empty wildcard and `primaryAnchorId` THROWS `DegenerateAnchorError` (router.ts) UNGUARDED — crashing the
 * whole mine pass inside `commitStaging`. Dispatched by family:
 *   - relation → `relationKey(endpointA, relationKind, endpointB)` (governed-emit-identity.ts:104); the
 *     scope-binding anchor is `endpointA`, the directed fact's SUBJECT — `primaryAnchorId` is NEVER reached.
 *   - negation → `negationKey(relationKind, target, scope)` (negation-key.ts); anchored at its scope
 *     directory (governed-emit-negation.ts:252) — `primaryAnchorId` is NEVER reached.
 *   - advisory/predicate → the intrinsic `nodeKey`/`primaryAnchorId` path, BYTE-IDENTICAL to before (KNOW-15b).
 * F3 (WP-96-N, owner-ratified 2026-08-11): for a NEGATION `f.scope` is now the PRESERVED witness directory (the
 * identity leg), NOT `MINED_SCOPE` — so `negationKey`/`primaryAnchor` bind the real scope the negative was proven
 * closed over. `MINED_SCOPE` rides SEPARATELY as `f.authzScope` (the door's authz gate binds it). Advisory/
 * predicate/relation are UNCHANGED — their authz==identity scope stays `MINED_SCOPE` (stamped in `decideStaging`).
 */
function mintIdentity(f: Fact, view: KnowledgeCandidate): { key: string; primaryAnchor: string } {
  if (f.kind === "relation") {
    return {
      key: relationKey(f.endpointA, f.relationKind, f.endpointB) as unknown as string,
      primaryAnchor: f.endpointA, // ARCH-9 binds a directed relation on its subject's scope (never nodeKey)
    }
  }
  if (f.kind === "negation") {
    return {
      key: negationKey(f.relationKind, f.target, f.scope) as unknown as string,
      primaryAnchor: f.scope, // anchored at the scope directory the negation ranges over
    }
  }
  return {
    key: nodeKey(view) as unknown as string, // intrinsic (KNOW-15b) — advisory/predicate UNCHANGED
    primaryAnchor: primaryAnchorId(view) as unknown as string,
  }
}

export function decideStaging(
  staged: StoreProjection,
  incoming: readonly Fact[],
  grounded: ReadonlyMap<string, Fact>,
): CommitDecision<Map<string, MintedFact>> {
  let projection = staged
  const minted = new Map<string, MintedFact>() // what THIS attempt would write; folded into `grounded` only on settle
  const puts: unknown[] = [] // the CAS bytes the protocol makes durable BEFORE publishing the rows naming them
  for (const raw of incoming) {
    // [#195 b] SEPARATE the answer-provenance transport field from the fact BEFORE anything hashes the fact:
    // `rawAnswer` (attached by mine-gate.ts) is a RECEIPT INPUT, never a part of identity. Stripped here, the
    // fact's contentHash and nodeKey are byte-identical to a fact mined without provenance.
    const { rawAnswer, ...factRaw } = raw as Fact & { readonly rawAnswer?: string }
    // [#222] SCRUB THE GROUNDING FIRST — the anchor `qualifiedPath` + human `path` are the LAST free-text legs
    // of the fact that reach CAS through `puts.push(f)` below (advisory/predicate/relation carry
    // `grounding = reground(cand.site)` from mine-gate.ts; a negation carries none at staging — its door builds
    // the scope Merkle at admit). Done BEFORE the per-kind ternary so the ONE scrubbed grounding rides through
    // every branch's spread into `f`, and `id(f)` hashes it identically. Defense-in-depth: `qualifiedPath` is
    // DERIVED FROM THE STRUCTURAL FRONTIER (`cand.site`), not model output — so this is not a measured live leak,
    // it is KNOW-11 ("nothing credential-shaped reaches CAS raw") closed over the leg the scrubUnit legs did not
    // cover. `scrub` is a no-op on a non-credential string, so `id(f)` is byte-identical for every non-secret fact.
    const factNoAnswer = { ...factRaw, grounding: scrubGrounding(factRaw.grounding) }
    // SCRUB THE IDENTITY-BEARING CLAIM BODY BEFORE ANYTHING HASHES OR STORES IT (KNOW-11, T0) — per kind,
    // because the claim body is a DIFFERENT field on each: an advisory carries `claimNorm` (KNOW-4c), a
    // predicate carries `check` (its claim body is `normalizeCheck(f.check)`, see `claimNormOf`). Neither can
    // be stripped like `rawAnswer` — both become part of the fact object `id(f)` hashes into CAS — so both are
    // scrubbed at source, same as the answer (`mine-answer.ts`). This MUST run BEFORE `f` is built so the ONE
    // scrubbed claim body reaches every downstream consumer with NO raw copy: for advisory, `id(f)`/`claimNormOf`;
    // for predicate, `id(f)` AND the `nodeKey` preimage — because `check` folds into node identity (KNOW-15c),
    // and `view` below is spread from `f`, `nodeKey(view)` reads exactly this scrubbed `check`. Scrubbing the
    // check for CAS but not for the nodeKey preimage (or vice versa) would re-open the identity leg or split two
    // scrub-equal predicates to different addresses — WP-219; see `mine-claim-scrub.ts` for the full argument.
    // RELATION/NEGATION (billy #96-wave Finding 2): the model-controlled IDENTITY LEGS — a relation's
    // `endpointA`/`endpointB`, a negation's `target`/`scope` — are ALSO scrubbed at source. Unlike the advisory
    // `claimNorm` these feed the identity KEY (`relationKey`/`negationKey` in `mintIdentity`), the `primaryAnchor`
    // (`endpointA`/`scope`) AND the `claimNorm` set-union element — all read off THIS single scrubbed `f` below,
    // so one scrub keeps CAS bytes and identity identically redacted (no scrub-CAS-but-raw-key split). `relationKind`
    // is a closed enum (no credential shape) and is left raw. See `scrubUnit` in `mine-claim-scrub.ts`.
    const factScrubbed =
      factNoAnswer.kind === "advisory"
        ? { ...factNoAnswer, claimNorm: scrubClaimNorm(factNoAnswer.claimNorm) }
        : factNoAnswer.kind === "predicate"
          ? { ...factNoAnswer, check: scrubCheck(factNoAnswer.check) }
          : factNoAnswer.kind === "relation"
            ? {
                ...factNoAnswer,
                endpointA: scrubUnit(factNoAnswer.endpointA),
                endpointB: scrubUnit(factNoAnswer.endpointB),
              }
            : factNoAnswer.kind === "negation"
              ? { ...factNoAnswer, target: scrubUnit(factNoAnswer.target), scope: scrubUnit(factNoAnswer.scope) }
              : factNoAnswer
    // STAMP THE CANDIDATE SCOPE — PROVENANCE plus a fail-closed default (ADR-0008 kept it when the boundary
    // crossing was removed). A mined fact has no actor, so nobody owns it, and an unowned node is writable by
    // NOBODY until an admin appoints a curator. Stamped BEFORE the content hash so the bytes carry it — AND onto
    // the request below so the ROW does too.
    //
    // F3 (WP-96-N, owner-ratified 2026-08-11) — the NEGATION case is the exception, and it is load-bearing. A
    // negation's `scope` is its IDENTITY (the witness directory it was proven closed over) AND the scope its
    // abstention law reasons about — clobbering it with `MINED_SCOPE` (the pre-split behaviour) made every mined
    // negation abstain `scope-empty` at promote (`MINED_SCOPE` resolves on no spatial rail) and mint the wrong
    // `negationKey`. So the witness `scope` is PRESERVED and `MINED_SCOPE` rides as the SEPARATE `authzScope`,
    // which the door's authz gate binds (`authzScope ?? scope`) so the orchestrator's `atlas:mined` grant
    // authorizes it. This object IS what promote rehydrates from CAS (governed-promote.ts:142 `store.get`), so
    // `authzScope` MUST live here on the fact bytes — not only on the row. Advisory/predicate/relation keep the
    // `scope: MINED_SCOPE` clobber (their authz==identity scope), byte-identical to before.
    const f = (
      factScrubbed.kind === "negation"
        ? // GUARD (billy #96-wave): `authzScope` MUST remain a trusted, NON-caller-supplied CONSTANT (`MINED_SCOPE`).
          // The identity/authz split weakens "only an owner of S writes facts scoped to S" to "any authzScope-holder";
          // it is sound ONLY because this value is hard-wired here, never forwarded from the fact/caller. A future
          // caller-supplied `authzScope` would re-open that gap and needs its OWN authorization guard before landing.
          { ...factScrubbed, authzScope: MINED_SCOPE } // witness `scope` PRESERVED (identity); authz binds MINED_SCOPE
        : { ...factScrubbed, scope: MINED_SCOPE }
    ) as Fact
    // IDENTITY IS MINTED, NEVER TRUSTED — `nodeKey` is RECOMPUTED from the content by the frozen formula
    // (KNOW-15b), the SAME seam that mints contentHash/primaryAnchor; the payload's own `f.id` never routes, or
    // an author could spoof another node's identity (governed-emit.ts parity, WP-F3). Map `predicateSlot` →
    // `.slot` first: the cast is otherwise LOSSY (identity fns read `.slot`) and yields a slot-free key.
    const fSlot = f.kind === "advisory" || f.kind === "predicate" ? f.predicateSlot : undefined // relation (D2)/negation (D3)/transition (D4) have no slot
    const view = { ...f, slot: fSlot } as unknown as KnowledgeCandidate
    // FAMILY-AWARE mint (bobby F1): a relation/negation routes by relationKey/negationKey and NEVER touches
    // `primaryAnchorId` (which throws DegenerateAnchorError on their cross-file / directory grounding);
    // advisory/predicate keep the intrinsic nodeKey/primaryAnchorId path byte-identically. See `mintIdentity`.
    const { key, primaryAnchor } = mintIdentity(f, view)
    // A MINED CANDIDATE NEVER RE-AUTHORS AN ESTABLISHED ONE — belt-and-braces since ADR-0008, load-bearing before
    // it: a mined key colliding with a governed node routed UPDATE and set-unioned into it, mutating a ratified
    // T0 fact from whatever text sat in a source file (prompt-injectable, reproduced). It STAYS — a set-union
    // between two candidates is just as unreviewable.
    if (staged.current.has(key) && !grounded.has(key) && !minted.has(key)) continue
    // [#195 (b) SCRUB-THEN-CAS, KNOW-11] the answer is scrubbed BEFORE it becomes a CAS object (mine-answer.ts),
    // so a secret in the answer NEVER reaches CAS raw. `answerReceipt` yields the scrubbed CAS object (pushed to
    // `puts`, durable before the row naming it) plus its `answerRef` (the CAS id). Absent ⇒ a non-mine/human
    // write, which carries no receipt (additive tolerance).
    const receipt = rawAnswer !== undefined ? answerReceipt(rawAnswer) : undefined
    const claimNorm = claimNormOf(f)
    const req: WriteRequest = {
      nodeKey: key,
      contentHash: id(f) as unknown as string,
      family: f.kind,
      claimNorm,
      ...((f.kind === "advisory" || f.kind === "predicate") && f.provenance !== undefined
        ? { provenanceByClaim: { [claimNorm]: f.provenance } }
        : {}),
      // ── ADJACENCY carrier (ADDITIVE) — primary anchor + R3-optional slot for a later sibling-adjacency
      //    scan (WP-B). NOT routed; `slot` stays ABSENT when omitted (exactOptionalPropertyTypes).
      primaryAnchor,
      ...(fSlot !== undefined ? { slot: fSlot } : {}),
      // ── SEAL carrier (ADR-0017 two-seal provenance) — the TRUSTED write-gate for `proven`. `f.seal` is set
      //    ONLY by the sound admit path (`buildSound`, admit-harness.ts) after the oracle verdict; THIS is the
      //    one door allowed to stamp it onto the durable row. The operator emit door (governed-emit.ts) STRIPS
      //    any payload-supplied seal — a seal is a forgeable trust signal if it can ride an untrusted JSON fact
      //    (billy T0). NOT routed (`RouteInputs` reads none); provenance only, never an identity/authority leg.
      ...(f.seal !== undefined ? { seal: f.seal } : {}),
      // ── GOVERNANCE carrier (ADR-0007) — from the MINED constants, never forwarded from the fact. Neither
      //    half is routed (`RouteInputs` reads neither), so no hash and no route moves; what changes is that
      //    the row now DECLARES what it is — what the ARCH-10 guard derives authority from. F3 (WP-96-N): a
      //    NEGATION declares its WITNESS `scope` (the identity/read scope, matching the row the door produces at
      //    promote, governed-emit-negation.ts:259) — its authz scope `MINED_SCOPE` rides on the fact's
      //    `authzScope` (bound by the door's authz gate), NOT the row's governance `scope`.
      scope: f.kind === "negation" ? f.scope : MINED_SCOPE,
      tier: MINED_TIER,
      // ── RELATION carrier (ADDITIVE — ADR-0015 D2 / #99a, WP-96-R) — the two endpoint unitKeys + kind of a
      //    2-ended fact, forwarded so `upsert` stamps them on the ROW (`relationOf(req)`, upsert.ts:165-171)
      //    and the read-side `relationsOf` fold indexes it by BOTH endpoints (direction preserved: A=subject,
      //    B=object). NOT routed (`RouteInputs` reads none) — identity is the `relationKey` already in `nodeKey`.
      //    Present ONLY on a `family:'relation'` write; absent for advisory/predicate/negation. Without this a
      //    mined relation stages with `family:'relation'` but NO endpoint carriers, so `relationsOf` skips it
      //    (its malformed-row guard) and the promoted relation is invisible — the READ half SEAM flagged.
      ...(f.kind === "relation"
        ? { endpointA: f.endpointA, endpointB: f.endpointB, relationKind: f.relationKind }
        : {}),
      // ── NEGATION carrier (ADDITIVE — ADR-0015 D3 / #99b, WP-96-N) — the target + kind of a scoped negative,
      //    stamped so the staged row is self-describing, MIRRORING the door's own row (`endpointB: target`,
      //    governed-emit-negation.ts:257). NOT routed (identity is the `negationKey` already in `nodeKey`), and
      //    NOT what promote rebuilds from (it rehydrates the whole fact from CAS). Present ONLY on a negation.
      ...(f.kind === "negation" ? { endpointB: f.target, relationKind: f.relationKind } : {}),
      // ── ANSWER-PROVENANCE carrier (ADDITIVE — #195 b) — the CAS id of the scrubbed answer bytes. NOT routed
      //    (`RouteInputs` reads it not), so identity is unchanged; present ONLY when the model produced the claim.
      //    The CAS id is its OWN tamper-evidence (store.get re-hashes on read) — no separate digest field.
      ...(receipt !== undefined ? { answerRef: receipt.answerRef } : {}),
    }
    // BYTES BEFORE THE ROW, as the governed door does — here by handing them to the protocol, which puts them
    // before it publishes. A row naming a contentHash (or `answerRef`) absent from CAS is a node whose bytes can
    // never be read back, and the doors correctly refuse a node whose class they cannot read. The scrubbed answer
    // rides FIRST so it, too, is durable before the row that names it.
    if (receipt !== undefined) puts.push(receipt.obj)
    puts.push(f)
    projection = knowledgeUpsert(projection, req).store // route the write-decision
    // [#209] the minted row carries its OWN answerRef alongside it (MintedFact) — the one additive field
    // `mine.ts`'s fold reads to build `ControllerDeps.answerReceipts()`. Absent when this row minted with no
    // receipt (a non-mine/human write, or #195 leg (b) not applicable) — fail-closed, never fabricated.
    minted.set(key, receipt !== undefined ? { ...f, answerRef: receipt.answerRef } : f)
  }
  // A pass ALWAYS publishes its rehydrated snapshot, even on a true no-op (abstain / every incoming already
  // grounded). SCN-CLI-4d ("an already-staged candidate survives a mine pass that mines nothing") ratifies
  // this republish-on-abstain: the rehydrated projection carries the earlier candidates, and re-committing it
  // wholesale is how the concurrent commitLoop confirms current state. A no-op-skip optimization (return `next`
  // omitted when `projection === staged`) was tried and REVERTED — it silently dropped that republish and turned
  // the ratified abstain-preservation test RED. The fsync-churn it targeted is a separate concern; closing it
  // must not touch the abstain contract (backlogged as its own card).
  return { out: minted, put: puts, next: projection }
}
