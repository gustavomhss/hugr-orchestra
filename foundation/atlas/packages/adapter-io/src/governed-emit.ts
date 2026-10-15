// @atlas/adapter-io — src/governed-emit.ts  (COMPOSE-A: the governed durable emit leg)
//
// The runtime composition-root's governed write door. `atlas-emit` persists DURABLY only THROUGH the
// governed path — SIXTEEN fail-closed refusals, in the order below, before a single byte is DURABLE.
// The count is stated because it drifted: this header said "three" and listed four while the body had seven
// refusal points, and a header that under-counts the gates is how a gate gets deleted unnoticed.
// (Ten became twelve when the durable write became an atomic COMMIT: stage 5 can refuse a write that has
// cleared every governance gate, and a refusal is counted like any other. Twelve became THIRTEEN with the 2.1
// anchor binding (ARCH-9); FIFTEEN with the 0.5 gate — two refusals that already EXISTED as escaping throws so
// no record reached the renderer (#136); SIXTEEN with 3.5, the same shape one gate over (#152).)
//   0. WELL-FORMED  — the three payload fields the LATER gates route on are type-only and reach this door
//                     unvalidated (`JSON.parse` + a cast on the CLI wire; a bare `object` schema on MCP),
//                     so each is refused HERE or nowhere: `tier` must be one of the three real governance
//                     classes (`malformed tier`), `scope` must be a non-empty STRING (`malformed scope`),
//                     and `kind` must agree with `check` presence (`malformed family`).
//   0.5 ADDRESSABLE — can the CAS name these bytes at all? BOTH legs, since they fail on different inputs:
//                     the canonical preimage (`canonical-form violation`) and the STORED serialization
//                     (`unaddressable-cas-object`, re-filed from the commit's CAS door — KERNEL-8 keeps the
//                     side-indexes out of the preimage, so `id` cannot see that leg). Both were escaping
//                     THROWS: see `governed-emit-address.ts` for the measurement and the decision.
//   1. TRUTH DOOR   — the GROUND truth-gate: a node whose grounding does not re-derive FRESH is rejected
//                     (`emitted:false`), nothing persisted (TOOLS-7b / GROUND-6) (`ungrounded`).
//   2. AUTHZ        — the KNOW-11 owner-scoped write gate (`actorInScope`): an actor not in the fact's
//                     scope is rejected, nothing persisted. An empty/unset actor is in NO scope ⇒ every
//                     write is denied (fail-closed v1 — correct behavior) (`unauthorized`).
//   2.1 ANCHOR     — the ARCH-9 binding for `scope`: the scope a write DECLARES must be the scope the admin
//                     policy says OWNS the code the fact is anchored in (`authz.anchors`). Authz alone gates
//                     on a string the AUTHOR picked, while the read projection scopes a pack by the DERIVED
//                     primary anchor — nothing bound them (`unauthorized for anchor`). Admin-declared, and
//                     an undeclared prefix stands aside: a NARROWING, not a closure. See `policy.ts`.
//   2.25 INCUMBENT  — FOUR gates derived from the node the write TARGETS, never from the write itself:
//                     the actor must hold authority in the scope the target's OWN PROJECTION ROW declares
//                     (`unauthorized for target`; a row carrying no confirmable scope authorizes nobody and
//                     gets the same refusal), the target's stored bytes must be readable AND corroborate
//                     that row (`unverifiable target`), the write must not RELOCATE the node to another
//                     scope (`governance-relocation`), and it must not declare a WEAKER class than the node
//                     carries (`governance-downgrade`).
//   2.5 RATIFY      — the KNOW-8/KNOW-18 tier-ratification gate, composed BETWEEN authz and upsert. The
//                     KNOW-18 fast-path `route(candidate, ctx)` decides: a grounded ∧ lowRisk ∧ T2 ∧
//                     advisory ∧ ¬contested fact AUTO-ACCEPTS (the common case — no human); a T0 / predicate
//                     / contested fact routes to FULL ratification and commits ONLY with a valid KNOW-8
//                     ratify token (a T0 fact requires the billy token). The token is env-sourced by the
//                     composition root (`ATLAS_RATIFY_TOKEN`, threaded like the actor) — NEVER read off the
//                     fact payload. Absent/invalid ⇒ REJECTED fail-closed, nothing persisted (KNOW-8).
//   5. COMMIT       — stages 2.25→3 are ONE decision over ONE snapshot, published atomically by the
//                     generation-CAS protocol in `sidecar-commit.ts`. Two refusals live here and BOTH are
//                     gates, not error handling: `contended` (other writers published on all 64 attempts)
//                     and `unreadable store` (the sidecar exists but no generation parses — refuse rather
//                     than write onto a phantom-empty snapshot, which is how ONE emit erased 402 nodes).
//                     The decision is RE-RUN, gates included, on every lost race — see the body. Neither
//                     reason discloses anything about a node, so both sit outside the disclosure ordering.
//   3. UPSERT+PUT   — route the write through the proven KNOW-15 `upsert(WriteRequest)` decision (mirrors
//                     the CLI `mine.ts` durable-write path), persist the projection sidecar durably, AND
//                     `store.put(node)` the WHOLE GroundedFact into CAS so the content-addressed bytes ARE
//                     the fact (driftFacts/doctor read them back — the INVARIANT).
//   3.5 CLOSED SLOT — inside that same `upsert`: a `predicateSlot` outside the NORMATIVE 13 is refused
//                     (`closed-slot-violation`, #152). ABSENT is not one — a NARROWING; see closed-slot.ts.
//
// GATE PRECEDENCE IS AN INVARIANT, NOT AN ACCIDENT OF LAYOUT. No pair of these gates changes `emitted`
// when swapped — every one of them refuses — so the whole suite stays green under a reordering. What the
// order decides is WHICH `rejected` string comes back, and that string is the door's user-visible contract
// AND a disclosure channel about a node the caller may have no authority over. The rule, in one line:
//
//   a refusal may never tell the caller more about the incumbent than the gates it has already CLEARED
//   entitle it to; so the gates run in order of increasing disclosure.
//
// Concretely inside 2.25: `unauthorized for target` runs BEFORE `governance-relocation` and BEFORE
// `governance-downgrade`, because the latter two answer questions ABOUT THE STORED FACT (its scope differs
// from yours / its class is stricter than yours) and only an actor with authority in the incumbent's scope
// has earned those answers. Swap `unauthorizedForTarget` below the tier check and the door starts leaking a
// stranger's governance class on every refusal — with the entire suite still green. That is why SCN-GE-I11
// pins the order with a DOUBLY-violating input rather than trusting the line order.
//
// THE RULE WAS STATED HERE AND BROKEN ONE GATE ABOVE, AND THE FIRST REPAIR OVERSHOT. An `unverifiable
// target` refusal — is the incumbent's stored fact readable from CAS? — answers a question about the stored
// fact just as squarely, and it ran FIRST, so an actor authorized only in `public` could tell a healthy
// `core` node from one whose CAS bytes were pruned, at an identity anyone can pre-compute from public code
// structure: a storage-health oracle over another scope's nodes. Reordering alone could not fix it, because
// the scope that decides authority was itself INSIDE the bytes — once they were gone there was no scope
// left to check, so no caller could be shown to have authority and any distinct reason WAS the oracle. So
// the two were merged into one refusal. That closed the leak and overshot: the node's OWN AUTHOR then got
// `unauthorized for target` for a pruned disk, which sends an admin to grant a scope to fix storage and
// erases the SCN-GL-7 distinction this codebase makes deliberately at the other governed door.
//
// THE ACTUAL FIX IS THE CARRIER, NOT THE MERGE (ADR-0007, completed). `CurrentNode` now carries the node's
// `(scope, tier)` on the PROJECTION ROW, so authority is resolved from a source that does not depend on the
// bytes surviving. The two reasons are separate again and neither leaks, because the split is now on
// AUTHORITY rather than on storage state: a caller who cannot be shown to hold authority in the row's scope
// gets `unauthorized for target` in BOTH byte-states — byte-identical, no bit disclosed — and only a caller
// already shown to hold it can ever see `unverifiable target`, which is a fault it can actually act on.
//
// Pure of clock/random: no wall-clock, no nonce, no counter enters the decision. This composes OVER the
// frozen core (`@atlas/tools` emit, `@atlas/knowledge` upsert, the GROUND gate) — it re-implements none.

import type { CasObject } from "@atlas/kernel"
import type { Hash, NodeKey } from "@atlas/contracts"
import { upsert } from "@atlas/knowledge"
import type {
  Candidate,
  CurrentNode,
  GroundedFact,
  NegationNode,
  TransitionNode,
  TestVacuityNode,
  WriteRequest,
  WriteOrigin,
} from "@atlas/knowledge"
import { emitNegation, type NegationEmitDeps } from "./governed-emit-negation.js" // #99b N2 — THE ABSTENTION DOOR
import { emitTransition } from "./governed-emit-transition.js" // #234 D4 — THE TRANSITION DOOR
import { emitTestVacuity } from "./governed-emit-test-vacuity.js" // #95 D5 — THE TEST-VACUITY DOOR (relation gate ladder + produced-only)
// FAMILY + IDENTITY resolution (all three fact shapes) — extracted at the LOC ceiling; a relation (ADR-0015
// D2) is addressed by `relationKey`, never the intrinsic `nodeKey`. See that file's header.
import { claimNormOf, relationCarriers, resolveWriteIdentity } from "./governed-emit-identity.js"
import type { EmitOut, TruthGate } from "@atlas/tools"
// The GATE CHAIN (WP-10.A3.ADAPTER) — the four `GateName` buckets (`shape`|`truth`|`authz`|`ratify`),
// extracted as PURE predicates so a store-less `check` leg (A3.TOOLS) can fold the SAME functions, in the
// SAME order, over a read-only snapshot. See that file's header for the split-across-the-commit-boundary
// rationale (shape+truth are incumbent-independent and run once; authz+ratify run per commit attempt).
import {
  evalShapeGate,
  evalTruthGate,
  evalAuthzGate,
  evalRatifyGate,
  deriveFastPathVerdicts,
} from "./governed-emit-gates.js"
import type { DiskStore } from "./store.js"
import type { CommitResult } from "./sidecar.js"
// The COMMIT-stage refusals (door-wide, outside the GateName ladder — neither discloses anything about a
// node) + the ADDRESSABILITY commit-leg re-file (#136). See that file's header.
import { commitRefusalOf } from "./governed-emit-address.js"
import { REJECTED_CONTENDED, REJECTED_UNREADABLE_STORE } from "./governed-emit-reasons.js"
import type { AtlasPolicy } from "./policy.js"
// The PROVENANCE refusal, shared with the read doors — one constant, so the write and read halves of the
// tripwire cannot describe the same condition two different ways.
import { REJECTED_UNTRUSTED_STORE } from "./read-provenance.js"

// The ratification-CONTEXT seam (which gate a write owes — ARCH-9 / ADR-0010), extracted at the LOC ceiling.
// Read that file before changing anything about how `route` is called: it records what the derivation does
// NOT change at this door, and why the CREATE leg is deliberately unclosed.

/** What the governed emit leg is composed over: the durable CAS store, the truth-gate seam, the admin
 *  policy (authz scopes), and the actor identity resolved from the environment. */
export interface GovernedEmitDeps extends NegationEmitDeps {
  readonly store: DiskStore
  readonly gate: TruthGate
  readonly policy: AtlasPolicy
  readonly actor: string
  /** The KNOW-8 ratify token (`by`) authorizing a full-ratify (T0/predicate/contested) commit. Env-sourced
   *  by the composition root (`ATLAS_RATIFY_TOKEN`), threaded EXACTLY like `actor` — NEVER read from the fact
   *  payload (the spoof-guard). ABSENT ⇒ `''` ⇒ a full-ratify fact fails closed; a T0 fact commits ONLY with
   *  the `billy` token. A fast-pathed (auto-accept) fact ignores it entirely. */
  readonly ratifyToken?: string
  /** ARCH-9 — where this write came from, DERIVED by the door that built this leg, never by the payload. ABSENT ⇒ `authored` ⇒ behaviour unchanged (`wire.ts` sets none); `promoted` removes the KNOW-18 fast path so every staged row faces the ratifier. Why a new field and not a forged `contested`/`lowRisk`: `governed-emit-route.ts` + `RatifyContext.origin`. */
  readonly origin?: WriteOrigin // #99b N2 — the NEGATION leg's channels are inherited from `NegationEmitDeps`.
}

// `isCheck` / `familyOf` / `claimNormOf` now live in `./governed-emit-identity.js` (extracted at the LOC
// ceiling, alongside the relation identity resolution ADR-0015 D2 added). Imported above.

/**
 * Build the GOVERNED durable emit leg. The returned `emit(node, at)` conforms EXACTLY to the frozen
 * `EmitApi.emit(node, at)` signature. Fail-closed at every gate; on success it routes through the KNOW-15
 * write-decision, persists the projection, and puts the whole fact into CAS (the driftFacts/doctor read-
 * back invariant). Pure of clock/random given a pure store/gate/policy.
 */
export function createGovernedEmit(deps: GovernedEmitDeps): {
  readonly emit: (node: GroundedFact, at: Hash) => EmitOut
} {
  const emit = (raw: GroundedFact, at: Hash): EmitOut => {
    // #99b N2 — a negation re-routes to `emitNegation` (its own gate ladder, §4), branched before gate 0; `at` unused.
    if (raw.kind === "negation") return emitNegation(deps, raw as NegationNode)
    // #234 D4 — a transition re-routes to `emitTransition` (its own gate ladder), branched before gate 0. It
    // carries authz + anchor gates but NO HEAD truth gate: a transition grounds on PAST revs (D-T2), which the
    // main gate-1 would always drift-reject. `at` unused (the transition's grounding is stamped, not re-checked).
    if (raw.kind === "transition") return emitTransition(deps, raw as TransitionNode)
    // #95 D5 — a test-vacuity re-routes to `emitTestVacuity` (its own gate ladder), branched before gate 0. It
    // carries the HEAD truth gate (the relation ladder — a test-vacuity grounds on the current test file, so `at`
    // IS used, unlike a transition) PLUS produced-only (the forge guard: its witness is not door-re-derivable).
    if (raw.kind === "test-vacuity") return emitTestVacuity(deps, raw as TestVacuityNode, at)

    // 0. WELL-FORMED PAYLOAD (the SHAPE gate — `GateName:'shape'`) — `tier`, `scope`, the `kind`/`check`
    //    pair, relation well-formedness, addressability, and — LAST, AUTHOR-12, closes the 2026-07-25
    //    dogfood's raw TypeError — grounding well-formedness, in that fixed order. EXTRACTED to `evalShapeGate`
    //    (WP-10.A3.ADAPTER — see that file's header): a store-less `check` leg folds the identical function.
    //    `Tier`/`scope` are TYPE-ONLY: nothing upstream validates them (`atlas emit` is `JSON.parse` + a
    //    cast; the MCP `node` schema declares a bare `object`), so this is the FIRST place an arbitrary
    //    payload can be refused. Read ONCE and the snapshot carried — re-reading `raw.tier` at each gate
    //    would let a property whose value changes between reads clear this gate as `T2` and route as
    //    something else (a TOCTOU unreachable over the CLI/MCP wires but reachable through the exported
    //    library entry point). Gating a snapshot and persisting that same snapshot means what was checked
    //    is exactly what is stored.
    const shapeVerdict = evalShapeGate(raw, deps.origin)
    if (!shapeVerdict.pass) {
      return { emitted: false, rejected: shapeVerdict.result.reason ?? shapeVerdict.result.gate }
    }
    const { node, tier, scope, family, contentHash } = shapeVerdict

    // 1. TRUTH DOOR (`GateName:'truth'`) — re-derive the citation; a non-HOLDS verdict fails closed,
    //    nothing persisted. EXTRACTED to `evalTruthGate`.
    const truthVerdict = evalTruthGate(node, at, deps.gate)
    if (!truthVerdict.pass) {
      return { emitted: false, rejected: truthVerdict.reason ?? truthVerdict.gate }
    }

    // A GroundedFact carries its slot as `predicateSlot`; the `Candidate` identity/route fns
    // (`nodeKey`/`primaryAnchorId`/`route`/`stage`) read `.slot`/`.tier`/`.check`/`.grounding`. Map the slot
    // onto a candidate VIEW ONCE — else a later `nodeKey` cast is LOSSY (`.slot` undefined) and the nodeKey is
    // computed slot-free, diverging from the true `hash(primaryAnchorId ‖ predicateSlot)` identity (the E2E
    // emit→query readback exposed this). The route reads the fact's REAL `tier`/`check`/`grounding` — no guess.
    // A RelationNode (ADR-0015 D2) carries no `predicateSlot`; narrow it away. (A NEGATION — ADR-0015 D3 —
    // branched to `governed-emit-negation.ts` before gate 0, so it never reaches here; `node` is already
    // narrowed to exclude it.) The relation view is still built because `route` (the ratify gate below) reads
    // its `tier`/`grounding` — it ratifies on the advisory path (no `check`); its IDENTITY is not this nodeKey.
    const candidateView = {
      ...node,
      slot: node.kind === "advisory" || node.kind === "predicate" ? node.predicateSlot : undefined,
    } as unknown as Candidate

    // AUTHZ (`GateName:'authz'`, gates 2 / 2.1 / 2.25) — actor-in-declared-scope, then the ARCH-9 anchor
    //    binding (ADR-0010 open item 3: gate 2 asks whether the actor is in the scope this write DECLARES;
    //    the author picks that string, while the READ projection scopes on the DERIVED `primaryAnchor` and
    //    never reads the row's scope at all — nothing bound the two before this gate), then the FOUR
    //    incumbent-derived gates (the write's TARGET decides which gate it must clear, never the write
    //    itself; see `governed-emit-incumbent.ts` for the confused-deputy narrative). EXTRACTED to
    //    `evalAuthzGate` (WP-10.A3.ADAPTER): a store-less `check` leg folds the identical function.
    //
    //    `targetKey`/`primaryAnchor` are resolved here (ADR-0015 D2: a RELATION binds on `endpointA`, its
    //    SUBJECT, via `relationKey`; an intrinsic fact binds on `primaryAnchorId`, which THROWS
    //    `DegenerateAnchorError` on a degenerate grounding — the door's existing behaviour, unchanged) and
    //    reused by the WriteRequest below — one identity, one read.
    //
    //    2.25's incumbent-derived sub-gates need the LIVE incumbent, so `evalAuthzGate` runs PER COMMIT
    //    ATTEMPT, inside the closure below — re-evaluated on every retry against whatever the projection
    //    resolves at THAT attempt (ADR-0007: a decision must never be published against a snapshot that has
    //    since acquired a billy-ratified T0 incumbent). Gates 2/2.1 do not depend on the incumbent at all —
    //    folding them into the same per-attempt call is behaviour-preserving (deterministic given the same
    //    payload/policy/actor, so a retry recomputes an IDENTICAL verdict for those two) and keeps the whole
    //    AUTHZ bucket as ONE fold, matching the store-less leg's single pass.
    const { primaryAnchor, targetKey } = resolveWriteIdentity(node, candidateView)

    // ── THE ATOMIC COMMIT (stages 2 → 4) ────────────────────────────────────────────────────────────────
    // Everything from here down is ONE decision, taken against ONE snapshot of the projection and published
    // as a whole or not at all. The old shape — rehydrate, gate, upsert, `persistProjection` — was a
    // read-modify-whole-file-write with no lock and no compare-and-swap: 8 concurrent `atlas emit`s over a
    // 1000-node store silently lost 1–5 nodes in 6/6 measured trials, each writer exiting 0 with
    // `status: ok`, and a single emit onto a torn sidecar erased 402 nodes down to 1. See `sidecar.ts`.
    //
    // The callback is re-run FROM SCRATCH when another writer publishes first, and it contains the GATES,
    // not merely the upsert. That is a security requirement, not an implementation detail:
    // `incumbentRefusal` resolves target authority from the incumbent ROW on THIS snapshot (ADR-0007), so
    // re-publishing a decision taken against a snapshot that has since acquired a billy-ratified T0
    // incumbent — or acquired a `scope` carrier where there was none — would apply a write that never faced
    // the gate it now owes. That is the confused deputy, re-entered through the back door of a retry.
    // The commit's CAS door is the SECOND addressability leg (gate 0.5) and is NOT redundant with the first:
    // MEASURED, a bigint in `grounding` canonicalizes fine and still reaches `sidecar-commit.ts`'s CAS_EMPTY
    // guard through this door — where it refuses by THROWING. Caught here and re-filed as a decision.
    let committed: CommitResult<EmitOut>
    try {
      committed = deps.store.commitProjection<EmitOut>((projection) => {
        const incumbent: CurrentNode | undefined = projection.current.get(targetKey)
        const authzVerdict = evalAuthzGate({
          policy: deps.policy,
          actor: deps.actor,
          scope,
          tier,
          node,
          candidateView,
          primaryAnchor,
          incumbent,
          store: deps.store,
        })
        if (!authzVerdict.pass) {
          return { out: { emitted: false, rejected: authzVerdict.result.reason ?? authzVerdict.result.gate } }
        }
        // ARCH-9: the class the RESOURCE carries. Absent on a CREATE (nothing to derive from — ARCH-D3b, the
        // OPEN owner DEFINE) and on a refusal (the write does not reach `route` at all).
        const derivedTier = authzVerdict.derivedTier

        // RATIFY (`GateName:'ratify'`, gate 2.5) — the KNOW-8/KNOW-18 tier-ratification gate, BETWEEN authz
        //    and upsert. EXTRACTED to `evalRatifyGate`. The fast-path `route` auto-accepts a grounded ∧
        //    lowRisk ∧ T2 ∧ advisory ∧ ¬contested fact (the common case — straight to upsert, unchanged
        //    behavior). A T0 / predicate / contested fact routes to FULL ratification: it commits ONLY with
        //    a valid KNOW-8 token, and a T0 fact requires the `billy` token. The token is env-sourced by the
        //    composition root (never the payload). Absent/invalid ⇒ REJECTED fail-closed, nothing persisted
        //    — this is the door that was previously bypassing the human+billy gate. ARCH-9: the route is
        //    selected by `strictestTier(derived, declared)` when the door could derive a class from the
        //    incumbent, and by the declared class alone on a CREATE. See `ratifyCtxFor`.
        const ratifyVerdict = evalRatifyGate({
          candidateView,
          derivedTier,
          origin: deps.origin,
          ratifyToken: deps.ratifyToken,
          // ARCH-D3b (INV-AUTH-15) — DEVIVED fast-path verdicts. `lowRisk` from the TRUTH gate the write
          // already cleared (`truthVerdict.pass`, sealed above); `contested` from a CONFLICTING NODE —
          // the incumbent at this `(anchor, slot)` carries DIFFERENT bytes than this write (KNOW-18b).
          verdicts: deriveFastPathVerdicts(truthVerdict.pass, false),
        })
        if (!ratifyVerdict.pass) {
          return { out: { emitted: false, rejected: ratifyVerdict.reason ?? ratifyVerdict.gate } }
        }

        // 3. ROUTE + UPSERT — the KNOW-15 write-decision over the rehydrated projection (mine.ts parity).
        //    IDENTITY IS MINTED, NEVER TRUSTED — the routing/dedup `nodeKey` is RECOMPUTED from the content
        //    via the frozen `nodeKey(node)` formula (KNOW-15b: hash(primaryAnchorId ‖ slot[‖ check])), the same
        //    seam that mints `contentHash`/`primaryAnchor` below. The author-supplied payload `node.id` is NEVER
        //    used for routing — trusting it would let an author spoof/collide/dodge another node's identity.
        //    `contentHash` is the address gate 0.5 already minted from THIS SAME snapshot — the value is a pure
        //    function of `node`, which is frozen for the whole call, so a retry re-uses it rather than paying
        //    `id` again per attempt. It is also the only reason a violation can no longer escape from in here.
        const claimNorm = claimNormOf(node, family)
        const req: WriteRequest = {
          nodeKey: targetKey, // the SAME minted key the incumbent guard above resolved — one identity, one read
          contentHash: contentHash as unknown as string,
          family, // the CHECKED discriminant (gate 0), never the raw `node.kind` — see `familyOf`
          claimNorm,
          ...((node.kind === "advisory" || node.kind === "predicate") && node.provenance !== undefined
            ? { provenanceByClaim: { [claimNorm]: node.provenance } }
            : {}),
          // ── ADJACENCY carrier (ADDITIVE) — carry the computed primary anchor + the R3-optional slot onto
          //    the node so a later sibling-adjacency scan reads them off the projection (WP-B); NOT read here.
          //    `predicateSlot` is R3-optional; conditional spread keeps `slot` ABSENT (exactOptionalPropertyTypes).
          primaryAnchor, // the SAME value gate 2.1 bound the declared scope against — computed once
          ...((node.kind === "advisory" || node.kind === "predicate") && node.predicateSlot !== undefined
            ? { slot: node.predicateSlot }
            : {}),
          // ── SEAL carrier (billy T0, #187 → SEAL-PROMOTE-CARRY; RELATION added #99 ADR-0018) — the seal is
          //    trusted IFF the write is promote-origin (a mined fact re-emitted from content-addressed staging
          //    written by the sound admit path), never from an authored operator payload. `node.seal` is present
          //    here ONLY when the gate-0 snapshot above KEPT it: `origin==='promoted'` AND (for a relation) a
          //    re-derivable witness survived the gate-0.05 forgery strip. An authored seal, and a witness-less
          //    proven relation seal, were both already stripped there. Carry it onto the WriteRequest so a
          //    PROVEN `depends-on` relation's seal reaches the durable current row — its witness rides the CAS
          //    bytes (`node` itself, `put` below), exactly as a predicate witness does, so reverify re-derives
          //    it. The `!== 'relation'` guard is LIFTED (a relation could formerly NEVER be persisted proven —
          //    the #99 relation leg): all four sealed families now flow the same discipline. Provenance only,
          //    never a `nodeKey`/route/authz leg (`upsert.ts`).
          ...(node.seal !== undefined ? { seal: node.seal } : {}),
          // ── RELATION carrier (ADDITIVE — ADR-0015 D2) — a `family:'relation'` write stamps its endpoint pair
          //    + kind on the ROW so the read-side `relationsOf` fold indexes it by both endpoints. Empty for a
          //    non-relation. `primaryAnchor` above is `endpointA` for a relation (the subject), by construction.
          ...relationCarriers(node),
          // ── GOVERNANCE carrier (ADDITIVE — ADR-0007) — stamp the `(scope, tier)` pair onto the ROW so the
          //    incumbent guard above can resolve target authority off the projection instead of off the CAS
          //    bytes. These are the GATE-0 SNAPSHOT values, not `raw.*`: what was validated is what is stored,
          //    and it is the same snapshot `put` writes into CAS below — so the row and its bytes agree by
          //    construction, which is exactly what the corroboration check above requires.
          scope, // the gate-0 narrowed const (`isScope` proved it a non-empty string), never the raw field
          tier,
        }
        const next = upsert(projection, req).store

        // 4. DURABLE PERSIST — the content-addressed bytes FIRST, then the projection sidecar that references
        //    them (INVARIANT: the CAS bytes ARE the fact, so driftFacts/doctor can read them back). The order is
        //    now enforced BY the commit rather than by two adjacent statements a later edit could swap: `put`
        //    names the objects the protocol writes before it links the generation in. A failing `put`
        //    (disk-full / permission) throws before any sidecar byte, so the sidecar can NEVER reference a
        //    contentHash whose bytes are absent from CAS.
        // AUTHOR-14 (ADDITIVE) — `targetKey` is the SAME minted identity the incumbent guard above already
        // resolved and the WriteRequest's `nodeKey` above carries onto the durable row (one identity, one
        // read — no re-mint). Stamped onto the receipt so the LINK door (`atlas-link`, which addresses a
        // node BY nodeKey — see `governed-link.ts`'s `proj.current.get(a/b)`) can consume it with no
        // separate query. Cast mirrors the existing `id: contentHash` line just above: `targetKey` is typed
        // `string` here (ADR-0015 D2 — a relation's targetKey is a `relationKey`, not a `nodeKey`), while
        // `EmitOut.nodeKey` is branded `NodeKey`; the door already trusts this value as an address (it is
        // the live map key `projection.current` is keyed by), so the brand is asserted, not re-derived.
        return {
          out: { emitted: true, id: contentHash, nodeKey: targetKey as unknown as NodeKey },
          next,
          put: [node as CasObject],
        }
      })
    } catch (e) {
      // ONLY a REFUSAL is re-filed (unaddressable-CAS-object; closed-slot, gate 3.5); every other throw propagates UNCHANGED — laundering one hides a broken disk behind a verdict. `commitRefusalOf` says why.
      return { emitted: false, rejected: commitRefusalOf(e) }
    }
    // 5. THE COMMIT'S OWN REFUSALS — visible, never silent, and door-wide rather than incumbent-derived
    //    (neither discloses anything about a node). `contended`: other writers published on all 64 attempts;
    //    nothing was written and no gate was bypassed. `unreadable store`: the sidecar exists but no
    //    generation parses, so the incumbent cannot be read — refuse rather than treat "corrupt" as "empty",
    //    which is the amplification that turned a torn read into a 402-node erasure. Both rank strictly
    //    above the silent loss they replace.
    //    `untrusted` (the THIRD `CommitRefusal` member) was collapsed into `unreadable store` here, and that
    //    was not a cosmetic mislabel: `unreadable store` tells the operator to restore
    //    `.atlas/projection.*.json` from a backup, which for a COMMITTED store is the wrong diagnosis, the
    //    wrong fix, and hides the only thing they need to know (`git rm -r --cached .atlas/…`). The store
    //    layer had the named refusal all along; the door threw the name away. Reported as itself now, from
    //    the SAME constant the read doors use.
    if (committed.settled) return committed.out
    const commitRefusal =
      committed.refusal === "contended"
        ? REJECTED_CONTENDED
        : committed.refusal === "untrusted"
          ? REJECTED_UNTRUSTED_STORE
          : REJECTED_UNREADABLE_STORE
    return { emitted: false, rejected: commitRefusal }
  }
  return { emit }
}
