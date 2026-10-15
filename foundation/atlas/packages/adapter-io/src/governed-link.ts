// @atlas/adapter-io — src/governed-link.ts  (WP-SAMEAS: the governed sameAs write door)
//
// The runtime composition-root's SECOND governed write door (mirrors `governed-emit.ts`). `atlas-link`
// asserts a human `sameAs` equivalence between two current nodes — a symmetric, non-destructive edge — only
// THROUGH the gate ladder below — NINE fail-closed refusal points, in order, before a byte is DURABLE.
//
// [A-D3 / task #83] IT ALSO RETRACTS ONE, as a MODE of this same door (`link(a, b, retract)`), NOT as a
// sixth tool: `GOVERNANCE_SURFACE` stays 5 and `WRITE_PATHS` stays `{atlas-emit, atlas-link}`. The mode is
// consumed at exactly two points — the pair-state gate 4.5 and the reducer choice at stage 5. Gates 1–4 are
// the same lines for both, which is the non-negotiable property: undoing a ratified merge is priced exactly
// as making it was. See `governed-link-retract.ts` for the decision and the three mode-specific refusals.
// The count is stated because it drifted: this header said "four" while the body had five reasons and left
// `unverifiable endpoint` unlisted entirely. (Eight became ten when the durable write became an atomic
// COMMIT — stage 6, whose two refusals are the emit door's, byte for byte; ten became NINE at task #144,
// when the endpoint-EXISTENCE refusal was folded into the endpoint-AUTHZ one — see gate 2+3.)
//   1. DISTINCT     — a node never names itself; `a === b` is refused (no self-equivalence). This gate is
//                     a pure function of the caller's OWN two arguments, so it discloses nothing about any
//                     node and is safe to answer first.
//   2+3. AUTHORIZED ENDPOINTS — ONE gate, ONE refusal, and the MERGE of what used to be two [task #144].
//                     Both `a` and `b` MUST be current nodes (no dangling assertion) AND the actor must be
//                     in the scope of each, read off that node's OWN ROW (the ADR-0007 governance carrier).
//                     An ABSENT endpoint, an empty/unset actor, an actor outside the scope, and a row
//                     carrying no confirmable scope at all are ALL denied with the SAME BYTES (fail-closed
//                     v1).
//
//                     WHY THEY ARE ONE. They were two refusals with existence FIRST, so any caller —
//                     `actor: ''` included — could tell `unknown node: X` from `unauthorized` and thereby
//                     learn whether X is a current node. That is precisely what the precedence rule below
//                     forbids, and it was the door contradicting its own header. The two CANNOT be
//                     separated by merely reordering them: authority is carried BY THE ROW, so a nodeKey
//                     with no row has no scope, nothing can authorize anyone over it, and "not authorized"
//                     is the only answer computable about it. Running authz first therefore SUBSUMES the
//                     existence gate rather than preceding it — the collapse is the ordering's consequence,
//                     not a second decision. Nor can the distinction be earned by clearing the OTHER
//                     endpoint: a caller allowed to hear "absent" for X could still tell it apart from
//                     "X exists, outside your scope", which is the same oracle one gate deeper.
//                     THE COST IS REAL AND IS STATED IN `REJECTED_UNAUTHORIZED`: an operator who mistypes a
//                     64-hex nodeKey is told `unauthorized`, not `unknown node`. The reason text therefore
//                     names BOTH causes and points at the read door.
//   3.5 CLASS AUTHZ — the same KNOW-11 gate over EVERY scope the link's merged equivalence class spans, not
//                     merely the two endpoints: every current member of `sameAsClassOf(a) ∪ sameAsClassOf(b)`,
//                     each read off its OWN row. Runs AFTER the endpoint leg so an actor with no authority
//                     over the nodes it NAMED learns nothing about the class behind them.
//   3.25 READ-BACK  — every one of those nodes' facts is then read from CAS (`store.get(node.contentHash)`);
//                     bytes that are gone, or bytes whose `scope` CONTRADICTS the row that authorized the
//                     caller, mean the node cannot be confirmed to be what the projection says it is, so the
//                     link is refused outright (`unverifiable endpoint`) rather than gated on a defaulted
//                     class — exactly as `strictestTier` fails an unreadable class closed to `T0` at gate 4.
//                     THE ORDER 3-BEFORE-3.25 IS THE GATE, not layout: it used to run the other way round,
//                     because the scope authz needs lived only in the bytes, so a caller with authority over
//                     NEITHER endpoint could read storage health off which refusal it got. See `rowAuthorized`.
//   4. RATIFY       — a sameAs assertion is a governed shared-truth mutation, so it runs the SAME KNOW-8
//                     gate emit runs, over the JOIN of every class the link MERGES: a non-empty ratifier
//                     always, and `billy` specifically when ANY member is `T0` (task #84 — a link spanning
//                     a `T0` node is a `T0` act, else the weaker endpoint is a side door onto the stronger).
//                     The token is env-sourced by the composition root (`ATLAS_RATIFY_TOKEN`) — NEVER a
//                     payload field (the spoof-guard).
//   4.5 PAIR STATE — [A-D3 / task #83] the ONE mode-dependent gate: retracting an unasserted pair
//                     (`not-linked`) or an already-retracted one (`already-retracted`), and RE-ASSERTING a
//                     retracted one (`retracted-pair`), are each refused. It runs LAST, after RATIFY, so the
//                     pair's state is never an oracle for a caller who has not cleared every governance gate.
//   6. COMMIT       — stages 2→5 are ONE decision over ONE snapshot, published atomically by the
//                     generation-CAS protocol in `sidecar-commit.ts`; `contended` and `unreadable store`
//                     are its two refusals, imported from `governed-emit-reasons.ts` so one protocol cannot
//                     grow two vocabularies.
// Only after all of them does it `linkSameAs` the projection and publish it durably.
//
// GATE PRECEDENCE IS AN INVARIANT (the same rule `governed-emit.ts` states): no pair of these gates changes
// `linked` when swapped, so a reordering leaves the suite green — but the order fixes which `rejected`
// string comes back, and a refusal may never tell the caller more about nodes it has no authority over than
// the gates it already CLEARED entitle it to. Hence the ENDPOINT authz check runs BEFORE the class walk: an
// actor with no authority over the two nodes it actually NAMED learns `unauthorized` and nothing about the
// size, membership or CAS health of the class it was reaching into. SCN-GL-14 pins that with a doubly-
// violating input; CARRIER-5 pins the endpoint-level twin of it, which SCN-GL-14 could not reach.
//
// ── HONEST SIZING OF THE EXISTENCE HALF (task #144) — read this before trusting it ───────────────────────
// Folding existence into authz above makes THIS DOOR's refusals existence-blind. It does NOT make node
// existence secret in this product, and claiming otherwise here would be the same species of overclaim the
// pair-key comment in `knowledge/read/sameas.ts` had to withdraw. MEASURED through the real CLI: an actor
// the write door refuses (`intruder@nowhere`, in no policy scope) runs `atlas query <scope>` and gets exit 0
// with the full 64-hex nodeKey — AND the claim text — of every current node in that territory. It is the READ
// LEG, not one command: `atlas node <contentAddress>` is ungated too, and is an even more direct oracle —
// exit 0 with the whole node on a hit, exit 1 with the discriminant `no-such-node` on a miss, so existence is
// readable from the exit code alone. Neither is authz-gated at all: `createQuery(index)` in `@atlas/tools`
// takes neither an actor nor a policy, `resolveNode` likewise, so both are structurally incapable of it, and
// `actorInScope` is called from the two WRITE doors and nowhere else.
// So the value of the fold is NOT that it closes a live escalation; today it closes nothing an adjacent
// ungated door does not hand over in bulk. Its value is that the invariant three paragraphs up is now TRUE
// OF THIS DOOR BY CONSTRUCTION, ahead of the authoring doors that will let a human NAME a nodeKey, and ahead
// of any decision to gate reads. Gating reads is a separate, unmade decision and is not tracked here.
//
// Pure of clock/random: no wall-clock, no nonce, no counter enters the decision. Composes OVER the frozen
// core (`@atlas/knowledge` linkSameAs, the `@atlas/tools` `LinkOut` result, the authz seam) — re-implements
// none. DAG: adapter-io depends on knowledge + tools; `LinkOut` is imported FROM tools (never the reverse).

import type { Hash, Tier } from "@atlas/contracts"
import {
  isScope,
  linkSameAs,
  ratify,
  sameAsClassOf,
  sameAsEdgeState,
  stage,
  strictestTier,
  unlinkSameAs,
} from "@atlas/knowledge"
import type { Candidate, CurrentNode, GroundedFact } from "@atlas/knowledge"
import type { LinkOut } from "@atlas/tools"
import { actorInScope } from "./policy.js"
import type { AtlasPolicy } from "./policy.js"
import type { DiskStore } from "./store.js"
import {
  REJECTED_CONTENDED as COMMIT_CONTENDED,
  REJECTED_UNREADABLE_STORE as COMMIT_UNREADABLE_STORE,
} from "./governed-emit-reasons.js"
// The PROVENANCE refusal — the THIRD `CommitRefusal` member, which BOTH doors used to collapse into
// `unreadable store` (a storage fault whose remediation text sends an operator to restore from backup).
import { REJECTED_UNTRUSTED_STORE as COMMIT_UNTRUSTED } from "./read-provenance.js"
// A-D3 / task #83 — the RETRACTION MODE's three refusals (see that module for the mode-vs-sixth-tool decision).
import { ALREADY_RETRACTED_REASON, NOT_LINKED_REASON, RETRACTED_PAIR_REASON } from "./governed-link-retract.js"

/** The structured fail-closed reasons — a non-distinct, unknown-endpoint, unauthorized, OR unratified link
 *  never lands. */
const REJECTED_SAME = "sameAs requires two distinct nodes"
/**
 * The ONE refusal for a bad endpoint, whatever is bad about it [task #144].
 *
 * It answers FOUR different situations with one byte-string, on purpose: the endpoint is not a current node;
 * the actor is outside its scope; the actor is empty/unset; the row carries no confirmable scope. Only the
 * first of those is a fact about a node the caller may not hold — and it is unearnable, because a nodeKey
 * with no row has no scope for anyone to hold. Splitting them out is an existence oracle over keys the
 * caller can name freely.
 *
 * SO THE REMEDIATION TEXT HAS TO CARRY BOTH CAUSES, because the discriminant no longer can. An operator who
 * mistyped a 64-hex nodeKey and an operator who genuinely lacks a scope read the same line, and neither
 * should conclude the other's fix. The READ LEG is where existence is answered — `atlas query <scope>` lists
 * a territory, `atlas node <contentAddress>` resolves one node — and neither is authz-gated. Note the shape
 * of the remedy is imperfect and that is deliberate honesty, not an oversight: neither door is a direct
 * nodeKey→exists lookup (one is addressed by CONTENT hash, the other needs a scope you may not know), so an
 * operator holding only a suspect nodeKey has more work than one lookup. See the honest sizing note in this
 * file's header for why pointing at that leg is not a contradiction.
 */
const REJECTED_UNAUTHORIZED =
  "unauthorized: the actor must be in the scope of BOTH endpoints AND of every node in the equivalence " +
  "class this link merges — the sameAs relation is transitive, so the boundary is the class, not the edge " +
  "(KNOW-11). An endpoint that is not a current node is refused with this SAME string, deliberately: a " +
  "nodeKey with no row carries no scope, so no authority over it can be established, and reporting the two " +
  "apart would let any caller probe which nodeKeys exist. If a nodeKey here may simply be wrong, list the " +
  "territory with `atlas query <scope>` and check it against that before concluding a scope is missing."
const REJECTED_UNRATIFIED =
  "unratified: a sameAs link requires a ratifier, and the billy token when either endpoint is T0 (KNOW-8)"
const REJECTED_UNVERIFIABLE =
  "unverifiable endpoint: the stored fact of an endpoint — or of a node in the equivalence class this link " +
  "merges — is not readable from CAS, so its governance class and its scope cannot be confirmed; refused " +
  "fail-closed rather than defaulted"
/** The COMMIT refusals — the SAME two the emit door reports, imported from the one place they are defined
 *  so the two doors cannot drift into two vocabularies for one protocol. `unreadable store` on this door
 *  means the equivalence class this link merges — and therefore its authority set and its ratify tier —
 *  cannot be read, so the link is refused rather than asserted over a projection that only LOOKED empty. */
const REJECTED_CONTENDED = COMMIT_CONTENDED
const REJECTED_UNREADABLE = COMMIT_UNREADABLE_STORE

// [task #144] `unknownNode(key)` — `unknown node: ${key} not in the current projection` — USED TO LIVE HERE
// and is deliberately GONE, not merely unreferenced. It was a distinct refusal for an absent endpoint, and
// because it was reachable BEFORE the authz gate it told every caller, authorized or not, whether a nodeKey
// names a current node. It cannot be repaired by moving it: there is no point in this ladder at which a
// caller has earned that answer, since no one can hold authority over a node that does not exist. Its cases
// now return `REJECTED_UNAUTHORIZED`. Left as a note so a future reader does not "restore the useful
// diagnostic" without reading why it went.

/** What the governed link leg is composed over: the durable CAS store (fact read-back + persist), the admin
 *  policy (authz scopes), the actor identity, and the env-sourced ratify token — the SAME channels as emit. */
export interface GovernedLinkDeps {
  readonly store: DiskStore
  readonly policy: AtlasPolicy
  readonly actor: string
  /** The ratify token authorizing a governed sameAs assertion. Env-sourced by the composition root
   *  (`ATLAS_RATIFY_TOKEN`), threaded EXACTLY like `actor` — NEVER read from a payload. ABSENT ⇒ `''` ⇒ the
   *  link fails closed (unratified). It runs the SAME KNOW-8 `ratify` law emit runs, over the JOIN of the two
   *  endpoints' tiers — so a link touching a `T0` node requires `billy` exactly as a `T0` emit does. */
  readonly ratifyToken?: string
}

/** The stored fact behind a current node — read back from CAS by content address (the CAS bytes ARE the
 *  fact). `undefined` when the bytes are absent (pruned CAS / partial restore), which every caller treats
 *  as fail-closed: an endpoint whose governance class cannot be READ is never linked on trust. */
function storedFact(deps: GovernedLinkDeps, node: CurrentNode): GroundedFact | undefined {
  return deps.store.get(node.contentHash as unknown as Hash) as GroundedFact | undefined
}

/**
 * Is the actor authorized over a node, decided WITHOUT letting the answer depend on storage health? The row
 * carries the node's scope (ADR-0007), so the question is answered off the projection and the authz gates
 * can run BEFORE the read-back — which is what keeps the two refusals from encoding CAS health to a caller
 * with no authority (the same repair `governed-emit.ts` received; see its header). `isScope` first, because
 * `actorInScope` looks the scope up as a property KEY and property keys COERCE, so a malformed stored scope
 * would otherwise read as a legitimate one.
 *
 * A CARRIER-LESS ROW FALLS BACK TO ITS STORED FACT, mirroring the emit door exactly (lead-reversed; ADR-0007
 * §Consequences). Without it a node written before the carrier would be permanently UNLINKABLE — the same
 * brick, one door over. The fallback is narrow in the same way: ONLY a row with no `scope` property at all
 * takes it, so a malformed or byte-contradicting row is still judged on the row and never borrows the bytes'
 * authority. It cannot grant anything the bytes do not already grant, and it closes no oracle it opens:
 * unreadable bytes on a carrier-less row leave authority unestablished, which is `unauthorized` — the same
 * string an out-of-scope caller gets when the bytes ARE readable.
 *
 * UNLIKE THE EMIT DOOR, THIS ONE DOES NOT DRAIN THE LEGACY PATH: `linkSameAs` spreads the prior row and adds
 * only the peer, so a successful link does not stamp the carrier. A legacy node becomes carried the first
 * time it is EMITTED to, not the first time it is linked. Recorded, not silently relied upon.
 */
function rowAuthorized(deps: GovernedLinkDeps, node: CurrentNode, fact: GroundedFact | undefined): boolean {
  const authorityScope = node.scope === undefined ? fact?.scope : node.scope
  return isScope(authorityScope) && actorInScope(deps.policy, deps.actor, authorityScope)
}

/** Do a node's stored bytes CONTRADICT the governance its row advertises? Only meaningful for a CARRIED row
 *  — a carrier-less row advertises nothing to contradict, and its authority came from the bytes already. */
function rowContradicted(node: CurrentNode, fact: GroundedFact): boolean {
  return node.scope !== undefined && fact.scope !== node.scope
}

/**
 * Build the GOVERNED sameAs link leg. The returned `link(a, b, retract?)` runs the fail-closed ladder in the
 * header (distinct → authorized-endpoints → endpoint read-back → class authz → class read-back → ratifier →
 * pair state), then applies the pure `linkSameAs` / `unlinkSameAs` reducer and publishes it through the
 * atomic commit. On any gate failure it returns `{linked:false, rejected}` and persists NOTHING. Pure of
 * clock/random given a pure store/policy.
 */
export function createGovernedLink(deps: GovernedLinkDeps): {
  readonly link: (a: string, b: string, retract?: boolean) => LinkOut
} {
  /**
   * `retract` selects the MODE (A-D3 / task #83). ONE function, ONE gate ladder: the mode is read only at
   * stage 5 (which pure reducer to apply) and at the pair-state gate that sits immediately before it. Gates
   * 1–4 are byte-identical code for both modes, which is not a stylistic choice — it is the property. If
   * retraction ran its own ladder, an asymmetry could appear in it silently; here retracting a link that
   * merged a class containing a `T0` node requires the billy token for exactly the same reason, through
   * exactly the same lines, that asserting it did. An unratified actor cannot undo a ratified merge.
   */
  const link = (a: string, b: string, retract = false): LinkOut => {
    // 1. DISTINCT — a node never names itself (and there is no self-edge to withdraw either).
    if (a === b) return { linked: false, rejected: REJECTED_SAME }

    // ── THE ATOMIC COMMIT (stages 2 → 5) ────────────────────────────────────────────────────────────────
    // Every gate below is priced against ONE snapshot of the projection, and the edge is published against
    // that same snapshot or not at all. `rehydrateProjection` + `persistProjection` was a
    // read-modify-whole-file-write with no compare-and-swap, so a concurrent emit could land between the
    // read and the write and be erased by this door's whole-Map replacement — measured at 1–5 nodes lost per
    // 8-writer race, every writer reporting `status: ok` (see `sidecar.ts`).
    //
    // The callback re-runs FROM SCRATCH on a lost race, GATES INCLUDED — which matters MORE here than at the
    // emit door, because these gates are priced over the merged equivalence CLASS: a node that joins the
    // class between the snapshot and the commit changes both the authority set (`rowAuthorized` over every
    // member) and the ratify tier (`strictestTier` over every member's bytes), so re-publishing the old
    // `linkSameAs` would merge a class nobody was ever authorized over.
    const committed = deps.store.commitProjection<LinkOut>((proj) => {
      // 2+3. AUTHORIZED ENDPOINTS (KNOW-11), FIRST LEG — ONE gate, ONE refusal [task #144]. Existence and
      //    authority are decided together and answered with the SAME bytes, because they cannot honestly be
      //    told apart to a caller: authority is carried by the ROW, so an endpoint with no row has no scope
      //    and no one can hold authority over it. Reporting `unknown node: X` separately let ANY caller —
      //    `actor: ''` included — read one bit about whether X is a current node, at keys it can name
      //    freely, which is the exact disclosure this door's header forbids. Runs before the class walk
      //    below so an actor with no authority over the nodes it NAMED learns nothing about the class behind
      //    them (the precedence rule in the header).
      //
      //    TOTALITY: the two `=== undefined` checks are load-bearing and must stay AHEAD of `rowAuthorized`
      //    in the `||` chain. Without them `storedFact`/`rowAuthorized` dereference `undefined.contentHash`
      //    and this door throws a `TypeError` out of a function its own header calls total — which the CLI's
      //    outer catch then re-labels as the CALLER's malformed input. Pinned at the unit (SCN-GL-2/2b) and
      //    at the process boundary (blackbox T3/T3b).
      //
      //    ANSWERED FROM THE ROWS, AND THAT ORDERING IS THE POINT (ADR-0007 carrier). This gate used to run
      //    AFTER the CAS read-back, because the scope it needs lived only in the bytes — so a caller with
      //    authority over NEITHER endpoint got `unverifiable endpoint` when an endpoint's bytes were pruned
      //    and `unauthorized` when they were healthy. Those two strings are a one-bit storage-health oracle
      //    over nodes the caller cannot touch, at keys it can name freely. SCN-GL-14 pinned exactly this
      //    precedence for the CLASS walk and could not pin it here, because the gate physically could not run
      //    before the read it depended on. With `scope` on the row it can, so it does.
      const nodeA = proj.current.get(a)
      const nodeB = proj.current.get(b)
      const factA = nodeA === undefined ? undefined : storedFact(deps, nodeA)
      const factB = nodeB === undefined ? undefined : storedFact(deps, nodeB)
      if (
        nodeA === undefined ||
        nodeB === undefined ||
        !rowAuthorized(deps, nodeA, factA) ||
        !rowAuthorized(deps, nodeB, factB)
      ) {
        return { out: { linked: false, rejected: REJECTED_UNAUTHORIZED } }
      }

      // 3.25 CLASS READ-BACK — both endpoints' stored facts, the source of the tier gate below. An endpoint
      //     whose bytes are gone has an unknowable tier, and one whose bytes CONTRADICT its row is a node the
      //     projection is misdescribing, so both are refused outright rather than defaulted (the same
      //     fail-closed stance, and the same corroboration rule, `governed-emit.ts`'s incumbent guard takes).
      //     `unverifiable endpoint` stays a DISTINCT reason (SCN-GL-7) — a pruned CAS is not a policy gap an
      //     admin should try to fix by granting a scope — and it is now reached ONLY by a caller already shown
      //     to hold authority over both endpoints, so it discloses nothing it has not earned.
      if (
        factA === undefined ||
        factB === undefined ||
        rowContradicted(nodeA, factA) ||
        rowContradicted(nodeB, factB)
      ) {
        return { out: { linked: false, rejected: REJECTED_UNVERIFIABLE } }
      }

      // 3.5 THE MERGED CLASS — resolved ONCE and consumed by BOTH remaining gates.
      //
      //    The relation is TRANSITIVE (`deriveSameAs` is a union-find), so linking a~b merges the WHOLE of a's
      //    class with the WHOLE of b's. Every gate on this door therefore has to be a gate on the CLASS; a gate
      //    on the EDGE is a gate on one arc of a graph whose reachability the link is extending. The tier gate
      //    below already learned that. The AUTHZ gate above had NOT: it read `factA.scope`/`factB.scope` only,
      //    which is the same defect one gate over, and it was live — policy `{secure:[alice], shared:[alice,
      //    mallory], mallory:[mallory]}`, alice links her `secure` node A to the `shared` node B, then mallory
      //    (who is nowhere near `secure`) links B to her own node M and `deriveSameAs` yields `{A,M}`: her node
      //    sits inside alice's `secure` class, and every read fold walks it, with no authority there ever
      //    granted. So the actor must hold authority in EVERY scope the merged class spans, each read off that
      //    member's OWN stored fact — the resource decides, never the request.
      //
      //    A key in `merged` that is not a CURRENT node is skipped: `sameAsClassOf` deliberately keeps dangling
      //    peers (a retired key is how two live nodes share one class), and a retired key has no readable scope,
      //    no readable class, and is served by no read fold — it is nobody's authority and nobody's governance
      //    weight. Everything reachable THROUGH it is itself in `merged` and is priced on its own fact.
      //
      //    A member that IS current but whose bytes are unreadable fails closed, exactly as `strictestTier`
      //    fails an unreadable class closed to `T0`: its scope cannot be confirmed, so no authority over it can
      //    be. It is reported `unverifiable`, not `unauthorized` — the SCN-GL-7 distinction, because an admin
      //    reading `unauthorized` would try to fix a pruned CAS by GRANTING a scope. Note this is strictly
      //    stronger than the previous tier-only treatment: before, an unreadable member merely forced billy;
      //    now no one, billy included, links across a class it cannot fully read.
      //
      //    Both passes are order-INDEPENDENT (all facts resolved, then all checked), so the reason returned
      //    never depends on the iteration order of the class.
      //    AUTHZ FIRST, BYTES SECOND — the same ordering as the endpoint gate above, for the same reason: a
      //    caller who cannot be shown to hold authority over every member must not be told which member's
      //    bytes are missing. The rows answer the authority question without any read at all.
      const merged = [...new Set([...sameAsClassOf(proj, a), ...sameAsClassOf(proj, b)])]
      const members = merged.map((key) => proj.current.get(key)).filter((m): m is CurrentNode => m !== undefined)
      const memberFacts = members.map((m) => storedFact(deps, m))
      if (!members.every((m, i) => rowAuthorized(deps, m, memberFacts[i]))) {
        return { out: { linked: false, rejected: REJECTED_UNAUTHORIZED } }
      }
      if (memberFacts.some((f, i) => f === undefined || rowContradicted(members[i]!, f))) {
        return { out: { linked: false, rejected: REJECTED_UNVERIFIABLE } }
      }
      const classFacts = memberFacts as readonly GroundedFact[]

      // 4. RATIFY (KNOW-8) — the SAME law emit runs, over the JOIN of every class this link MERGES.
      //
      //    Joining only `factA.tier` and `factB.tier` was a live two-hop bypass — billy equates a T0 node A with
      //    a T2 node B, then anyone links B to their own node M and lands inside A's class with no billy
      //    signature. The join runs over the same class resolved above; the endpoints seed it explicitly so the
      //    gate does not silently depend on `sameAsClassOf` including its own argument.
      const linkClass = classFacts.reduce<Tier>(
        (acc, f) => strictestTier(acc, f.tier),
        strictestTier(factA.tier, factB.tier),
      )
      const staged = stage({ tier: linkClass } as unknown as Candidate)
      if (!ratify(staged, { by: deps.ratifyToken ?? "" }).committed) {
        return { out: { linked: false, rejected: REJECTED_UNRATIFIED } }
      }

      // 4.5 PAIR STATE (A-D3 / task #83) — the ONLY mode-dependent gate, and it runs LAST on purpose.
      //
      //     PRECEDENCE IS THE GATE, again. Whether `{a,b}` is unlinked / linked / already-retracted is a fact
      //     about the stored relation, so answering it early would hand a caller a probe over pairs it has no
      //     authority on, at keys it can name freely — the same one-bit oracle the header's 3-before-3.25 rule
      //     exists to close. Placed after RATIFY, a caller learns the pair's state only once it has cleared
      //     authz over every scope the class spans AND produced the ratifier that class demands; anyone else
      //     gets `unauthorized` or `unratified` and learns nothing.
      //
      //     Both branches refuse rather than no-op, and the reasons say why (`governed-link-retract.ts`). The
      //     re-assert branch is load-bearing rather than tidy: `linkSameAs` is idempotent and a retraction
      //     never removes the peer from `sameAs`, so WITHOUT this the door would report `linked:true` for a
      //     re-link that changed nothing and that `deriveSameAs` goes on ignoring — a write door lying about
      //     its own effect, which is worse than having no retraction at all.
      const state = sameAsEdgeState(proj, a, b)
      if (retract && state === "absent") return { out: { linked: false, rejected: NOT_LINKED_REASON } }
      if (retract && state === "retracted") return { out: { linked: false, rejected: ALREADY_RETRACTED_REASON } }
      if (!retract && state === "retracted") return { out: { linked: false, rejected: RETRACTED_PAIR_REASON } }

      // 5. APPLY — the pure symmetric reducer for this mode. The DECISION is RETURNED, not written:
      //    publishing it is the commit's job, and only if this snapshot is still the head when the generation
      //    is linked in. `unlinkSameAs` APPENDS the retraction to both rows and removes nothing, so who
      //    asserted the edge and who withdrew it both survive in the projection.
      const next = retract ? unlinkSameAs(proj, a, b) : linkSameAs(proj, a, b)
      // `linked` reports that the governed link act SETTLED; `retracted` names WHICH act it was. A refused
      // act of either mode is `linked:false`, which is the one discriminator the handler, the CLI exit map
      // and the MCP `isError` mapping already key off — so a retraction's refusals are fail-closed-visible on
      // every transport with no new plumbing, and a SUCCESSFUL retraction is never mis-rendered as a refusal.
      return { out: retract ? { linked: true, a, b, retracted: true } : { linked: true, a, b }, next }
    })
    // 6. COMMIT — its own two refusals, visible and never silent. Identical in kind to the emit door's, and
    //    deliberately the SAME vocabulary: one protocol, one set of reason names.
    if (committed.settled) return committed.out
    const commitRefusal =
      committed.refusal === "contended"
        ? REJECTED_CONTENDED
        : committed.refusal === "untrusted"
          ? COMMIT_UNTRUSTED
          : REJECTED_UNREADABLE
    return { linked: false, rejected: commitRefusal }
  }
  return { link }
}
