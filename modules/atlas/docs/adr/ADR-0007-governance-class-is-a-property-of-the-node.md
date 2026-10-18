# ADR-0007 — a write's governance class is a property of the NODE it targets, not of the write

- **Status:** Accepted (2026-07-25). This closes a live confused-deputy hole on `master`, reproduced before
  any code was changed; the fix ships with the red tests that reproduced it.
- **Owner-authorized:** yes — the owner granted the lead full ownership of this repo and direct
  responsibility for holding the SOTA bar (2026-07-25). Recorded here because this ADR changes the behaviour
  of a **governed** path, which the escalation rule would otherwise route to the owner.
- **Spec author:** lead, grounded against `master` @ `5de122e`.
- **Amends:** nothing frozen. `GOVERNANCE_SURFACE` stays 5, `WRITE_PATHS` stays `['atlas-emit','atlas-link']`
  (INV-TOOLS-1 / ADR-0003 untouched). The `StoreProjection` / `CurrentNode` seam is **extended ADDITIVELY** —
  see §"The carrier, and the fact that this ADR shipped without it".
- **COMPLETED (carrier WP).** The branch named for this decision — `governance-class-is-a-node-property` —
  shipped the GATE and not the NODE PROPERTY its own name promises. `CurrentNode` did not carry `scope` or
  `tier`, so the doors read the target's governance out of the CAS bytes, and everything below that followed
  from a read that can fail. This is recorded plainly because the gap was invisible to review for the whole
  branch and was found only by a cold test written against the pre-fix code. See the new section below.
- **Introduces:** the tier lattice at L4 (`isTier` / `tierRank` / `isWeakerTier` / `strictestTier`,
  `@atlas/knowledge/src/ratify/tier.ts`), the emit door's gate-0 class validator and its
  INCUMBENT GUARD, the link door's class-wide tier gate, and `sameAsClassOf` (`@atlas/knowledge`).
- **Revised after review (2026-07-25).** The first draft of this decision was reviewed by two independent
  seats and **rejected**: its guard was bypassable by declaring an off-lattice `tier`, and its link gate
  joined only the two endpoints of a transitive relation. What is written below is the design that survived
  that, not the one that was proposed. The rejected version is described in §"What the review broke", because
  an ADR that quietly presents its remediated form as its original judgement is a false record.
- **Discharges:** the deferral recorded in `governed-link.ts` (_"the T0→billy tier gate emit runs is
  deferred — sameAs is non-destructive"_).

## Context

`atlas-emit` runs three fail-closed gates and then routes the write through `upsert`. Which gate a write
must clear was decided by `route(candidate, ctx)` reading the candidate's `tier` and `check`; which node the
write lands on is decided by

```
nodeKey = hash(primaryAnchorId ‖ predicateSlot [‖ normalize(check)])
```

**The identity contains neither `tier` nor `scope`.** So "which node" and "which gate" were computed from
two different things, and the author controlled the second one. That is the whole hole:

1. billy ratifies a `T0` fact at some anchor. The node now requires the `billy` token to write.
2. An actor emits a fact at the **same anchor and slot** — same minted `nodeKey` — but declares `tier: 'T2'`
   and no `check`. `route` sees _grounded ∧ lowRisk ∧ T2 ∧ advisory ∧ ¬contested_ and returns `auto-accept`.
   **No token is consulted at all.**
3. `upsert` finds the `nodeKey` present, family advisory, and routes `UPDATE` — set-unioning the new claim
   into the billy-ratified node.

The same shape holds in the authorization dimension: `actorInScope(policy, actor, node.scope)` gates on the
scope **the write declares**, so an actor declares a scope they happen to own and writes a node that lives
in someone else's.

This is not a novel defect; it is a _confused deputy_, and the literature name for the specific instance is
**capability gating is not authorization** — deciding _which gate applies_ is a different question from
deciding _whether this call, with these argument values, may touch this resource_. The object-capability
answer (Miller; KeyKOS/EROS/Capsicum) is the one adopted here: **authority is derived from the resource, not
asserted by the request.**

Note what was already right, and why it was not enough: WP-F3 had established that the _routing identity_ is
minted from content and never trusted from the payload (`SCN-GE-6` / `SCN-GE-7`). That closed identity
spoofing. It did not close this, because here the attacker does not spoof the identity — they let the real
identity collide, and lie about the **class** instead.

## Decision

**1. A write may re-state or RAISE the governance class of the node it targets. It may never lower it.**

`Tier` is an ordered lattice (`T0` ≻ `T1` ≻ `T2`), written down for the first time — at **L4, beside the
ratification facet that owns the question** (`@atlas/knowledge/src/ratify/tier.ts`), NOT beside the type it
orders. `@atlas/contracts` is L0 vocabulary with **zero runtime** (ARCHITECTURE.md), and an ORDER is policy,
not vocabulary; every consumer of the lattice (`retrieval` L5, `tools` L7, the `adapter-io` ring) already sits
at or above L4 and already depends on `@atlas/knowledge`, so nothing about this inverts the DAG. Before this
the ordering existed only as scattered `=== 'T0'` / `=== 'T2'` equality checks plus three private
`Record<Tier, number>` copies in `@atlas/retrieval`, so no code could ask the one question a write door has to
ask, and every private copy produced `undefined` on a value outside the union. The defect was the DUPLICATION,
not the layer.

**1b. The lattice is TOTAL over `unknown` and fails closed.** `Tier` is a type-only union: it does not exist
at runtime, and nothing upstream validates it — the CLI wire is `JSON.parse` + a cast and the MCP `node`
schema is a bare `object`. So every lattice operation takes `unknown`: an unrecognized DECLARED class is
always weaker, an unrecognized INCUMBENT always strictest, and a join with garbage is `T0`.

**1c. Both doors validate the class before anything else** (`gate 0`, `malformed tier`). The lattice guard
alone is not sufficient: on a CREATE there is no incumbent to compare against, and the read side bounds packs
with `tier !== 'T2'`, so a node minted at `'T3'` would be served as though it were ratified. The read door is
made total for the same reason — membership in the lattice, not `!== 'T2'`.

**2. The emit door resolves its target BEFORE it chooses a gate.** It rehydrates the projection, mints the
`nodeKey`, and — if a node is already there — reads that node's **own stored fact** back from CAS (the same
content-addressed read-back the link door already used for its authz gate). Two questions are then asked of
the target rather than of the write:

- **Authority** — is the actor in the scope the node ALREADY LIVES IN? Gate 2 asked only about the scope the
  write _declares_, which the attacker picks. Failing this is `unauthorized for target`. This is membership,
  **not** name equality: equality was tried first and was wrong in both directions — it carved out
  scope-less nodes (every `mine`-written row, capturable by any actor), and it made an admin RENAMING a scope
  brick every existing node permanently, for everyone including `billy`.
- **Class** — is the declared `tier` weaker than the stored one? Failing this is `governance-downgrade`.

**3. An unreadable incumbent fails closed.** If the projection names a node whose CAS bytes are absent
(pruned store, partial restore), the class it requires is unknowable, so the write is refused — never gated
on the write's own claim, which is exactly the hole.

> **Amended (F1, task #84 follow-up) — `atlas-emit` no longer reports this as a DISTINCT reason.** A separate
> `unverifiable target` string, returned _before_ the authority check, let an actor authorized only in
> `public` distinguish a healthy `core` node from one whose CAS bytes had been pruned, at an identity anyone
> can pre-compute from public code structure — a storage-health oracle over another scope's nodes, and a
> direct contradiction of this ADR's own increasing-disclosure ordering. Reordering does not fix it: with the
> bytes gone there is no scope left to check, so no caller can be _shown_ to have authority and any distinct
> string IS the oracle. The two are now ONE gate returning `unauthorized for target`, whose text names both
> causes. `atlas-link` keeps its distinct `unverifiable endpoint` (different door, different disclosure
> profile — see SCN-GL-7); this amendment is about `atlas-emit` only.

**4. `atlas-link` runs the same KNOW-8 law, over the JOIN of every class the link MERGES.** A link touching a
`T0` node is a `T0` act and needs `billy`. `sameAs` being non-destructive was the reason the tier gate was
deferred here, but _non-destructive_ is not _ungoverned_: the edge is symmetric and the read-side union-find
fold walks it, so the weaker endpoint was a side door onto the stronger one.

The join is over the merged **equivalence class**, not the two endpoints. `deriveSameAs` is transitive, so
the security boundary is the class; gating the edge gated one edge of a graph whose reachability the link was
extending. `sameAsClassOf` computes it, and is a deliberate **sound over-approximation** — it also follows
dangling peers and half-written edges, so it can return a class LARGER than `deriveSameAs` would derive, but
never smaller. Larger means "asks for a stronger signature than strictly needed"; smaller would mean a
bypass. Pinned by `PROP-SAMEAS-1` (`packages/knowledge/test/wp-sameas.test.ts`, `numRuns: 5000`). NOTE: this line
asserted the property test existed BEFORE it did — an architecture review caught it (`grep -rln sameAsClassOf`
returned three files and zero tests). The 5000 runs had been a reviewer's transcript, not committed code. The
test now exists and fast-check shrinks the counterexample to a single asymmetric edge.

### Why refuse a downgrade rather than merely gate it on the stricter class

Gating the downgrade on the stricter class would also close the bypass — the write would demand `billy`, and
`billy` might sign it. But then the _stored_ fact is the `T2` one, and the node's class has been lowered as a
side effect of emitting a claim, which is not what the signer was asked to approve. Since a pack bounds `T2`
OUT (TOOLS-6), that quietly erases the invariant from every read as effectively as deleting it.

Refusing outright keeps the stored `tier` **monotone**, so no later reader has to distrust it, and no new
carrier is needed to remember what the class used to be. Re-classification remains possible — it is simply
not an emit. It is a separate governed act, and it does not exist yet (see below).

## The carrier, and the fact that this ADR shipped without it

Everything above decides that **authority is derived from the resource**. It did not give the resource
anywhere to keep that authority. `CurrentNode` carried `nodeKey`, `family`, `contentHash`, `claims`,
`supersededBy`, `primaryAnchor`, `slot`, `sameAs` — and neither `scope` nor `tier`. So "read the target's
governance off the target" could only be implemented as **read the target's CAS bytes**, and that single
substitution is where the rest of the damage came from:

1. The authority question became **contingent on storage health.** When the bytes were pruned there was no
   scope to check, so no caller could be _shown_ to have authority — and a caller with none could tell the
   two states apart by which refusal came back. That is the storage-health oracle the F1 amendment above
   describes, and the amendment's own reasoning ("reordering does not fix it") is correct _given the missing
   carrier_ and only given it.
2. The F1 repair — merge both causes into one `unauthorized for target` — closed the leak and **overshot**.
   The incumbent's OWN AUTHOR then received an authorization error for a pruned disk, which sends an admin to
   grant a scope in order to fix storage, and erases the `SCN-GL-7` distinction this codebase makes
   deliberately at the other door. A cold test built specifically to forbid _that_ remedy caught it: its two
   legs are in tension on purpose, the equality leg forbidding the oracle and the inequality leg forbidding
   the over-broad fix. Seven of its eight assertions passed against the shipped branch; the eighth did not.

**Decision (5).** `CurrentNode` and `WriteRequest` carry the node's `(scope, tier)` as ADDITIVE, OPTIONAL
fields, `upsert` stamps them from the governed door, and both write doors resolve target authority **from the
row, before reading a single byte**. The two refusals then split on AUTHORITY rather than on storage state:

- caller **is** in the row's scope, bytes unreadable ⇒ `unverifiable target` — honest and actionable.
- caller **is not** in the row's scope ⇒ `unauthorized for target`, **byte-identical in both byte-states**.
- row's scope absent or malformed ⇒ fail closed; nobody has authority. `isScope` is the same guard gate 0
  applies to a write, now applied to what was stored — `actorInScope` uses a scope as a property KEY, and
  property keys coerce, so an unvalidated stored scope would read as a legitimate one exactly as it would
  have on the way in.

**Corroboration.** The row may decide _who is heard_; it may not be the last word on _what the node is_. The
projection sidecar is unauthenticated mutable state, while CAS bytes are content-addressed and re-hashed on
read. So after authority is established the bytes must AGREE with the row (`stored.scope === row.scope`, and
the tier gate takes `strictestTier(row, stored)`, so a disagreeing row can only ever make the gate harder).
A forged row buys its author one refusal and no write.

**`atlas-link` had the same defect and it was unpinned.** `SCN-GL-14` pinned this precedence for the CLASS
walk; it could not pin it for the ENDPOINTS, because the endpoint authz gate physically could not run before
the read-back it depended on. So naming two nodes you have no authority over still reported whether their
bytes were intact. Both doors now run authz from the rows first. The 16 existing link cases stay green under
a mutant that restores the old order — the leak was genuinely untested — so `CARRIER-5` pins it.

**Identity is untouched.** `nodeKey` does not fold `scope` or `tier`; folding either would silently re-address
every stored fact and split a node from its own history the first time its class was raised. Verified by
executing the identity formula in a clean worktree at the pre-change commit and comparing LITERAL digests,
because the suite is otherwise blind to a hash change (every assertion recomputes both sides).

## What this deliberately does not do

- **It does not implement re-classification.** Lowering a node's tier, or moving it between scopes, has no
  door. This is a stated gap, not a hidden one: the refusal message names re-classification as a separate
  governed act. Nothing in the product needs it yet.
- **It does not wire the real `lowRisk` / `contested` verdicts.** `DOOR_RATIFY_CTX` still defaults them
  conservatively (unchanged from WP-N7). The teeth here do not depend on those defaults — they come from the
  target node's own class.
- **It does not make `mine` a governed door.** `mine` still CREATES nodes without passing either door; it is
  now merely prevented from re-authoring established ones, and its rows carry the reserved `atlas:mined`
  scope so they are fail-closed until an admin appoints a curator. The remainder is task #87.
- **It does not distinguish two legitimate owners of one symbol.** Because `nodeKey` carries no scope, a
  second properly-authorized scope colliding at the same anchor is refused exactly as an attacker would be.
  Recorded as a real limit of deriving authority from a scope-free identity, not as a safe corner.

## What the review broke

Recorded because the first draft's own §Decision asserted things a cold review then reproduced as false:

1. **"a ratified `T0` node can never be quietly re-served as `T2`."** False. Declaring `tier:'T3'` made the
   comparison `0 < undefined` — i.e. "not a downgrade" — so `T0 → T3 → T2` walked past the guard in two
   commands with no `billy` token, and the invariant vanished from every read. Every off-lattice shape worked.
   (Note: "vanished" here, and "ambiguity"/"refused-ambiguity" elsewhere in this codebase's comments —
   e.g. `git-drift.ts:161`, `rev-index.ts:75` — are informal prose describing behaviour, not names of a
   formal `DriftClass` enum or classifier states; no such enum exists.)
2. **"the JOIN of its two endpoints' tiers."** Insufficient against a transitive relation (two-hop bypass).
3. A fix for an unrelated availability bug (`mine` writing rows whose CAS bytes were absent) turned an
   unreachable capture into a live one, because a scope-less node had been carved out of the scope check.

## Consequences

- New fail-closed reasons on `atlas-emit`: `malformed tier`, `unauthorized for target` and
  `governance-downgrade` — plus, from the F1 follow-up, `malformed scope` (the other half of the
  `(scope, tier)` pair: unvalidated, it passed authz by key COERCION and then failed the relocation gate
  forever, bricking the node) and `malformed family` (`kind` cross-checked against `check` presence, the
  single discriminant `nodeKey`/`route` already use). An unreadable incumbent is reported as
  `unauthorized for target`, per the amendment above, NOT as its own reason. All are legible on the CLI and
  MCP surfaces via the existing rejection channel (WP-F2F5).
- `atlas-link` gains `unverifiable endpoint`, and its `unratified` reason now names the `billy` condition.
  Previously an unreadable fact degraded to an absent scope and was reported merely `unauthorized` — which
  reads as a policy problem an admin would try to fix by _granting a scope_.
- **A pre-existing node emitted at `T2` can still be raised to `T0` by anyone holding `billy`.** That is
  intended: strictness ratchets up freely, because raising a class cannot be an attack.
- **`atlas-emit` regains `unverifiable target` as a distinct reason** — reachable only by a caller already
  shown to hold authority in the row's scope, which is what makes it safe to say out loud this time.
- **A carrier-less row falls back to its CAS bytes for authority, and is UPGRADED by the next successful
  governed write.** This is a REVERSAL, recorded as one.

  _What was implemented first, and why it was wrong._ The carrier WP shipped the strict reading of "authority
  unconfirmable": a row with no `scope` authorizes nobody, so the door fails closed. That is correct
  fail-closed reasoning and it is still a BRICK — every row written before the carrier became permanently
  unwritable through the emit door and unlinkable through the link door, with the migration door (task #88)
  not built. The implementing seat measured the brick and escalated it rather than shipping it quietly.

  _The lead reversed it,_ on three grounds. (1) A permanently unwritable row is the failure this codebase has
  twice declared unacceptable and twice fixed — the scope-rename brick and the relocation brick — and trading
  an availability catastrophe for a diagnostic improvement is the wrong trade even when it fails closed.
  (2) The objection that a fallback lets an attacker bypass the carrier by DELETING the field does not
  survive this ADR's own threat model: the projection sidecar is unauthenticated mutable state, so whoever
  can delete a field can rewrite the file — it was never a trust boundary. Falling back therefore degrades to
  the MORE authenticated source (CAS bytes are content-addressed and re-hashed on read), landing exactly
  where the product stood before the carrier, which is not a grant. (3) The oracle stays shut by the same
  argument that closes it for carried rows: on the legacy path authority can only come from the bytes, so
  unreadable bytes leave authority unestablished ⇒ `unauthorized for target` — the same string an
  out-of-scope caller gets when the bytes ARE readable. One string in both byte-states.

  _Scoped narrowly, and the narrowness is load-bearing._ ONLY a row with no `scope` property at all takes the
  fallback. A row that HAS one is judged on it: malformed ⇒ refused, byte-contradicting ⇒ `unverifiable
target`. Collapsing either into "absent" would make the bypass reachable by writing junk rather than by
  deleting, which is strictly easier. `strictestTier(row, stored)` still governs the class wherever BOTH
  exist, so a forged row can only ever make the gate harder; where the row carries no class the authenticated
  bytes stand alone, because joining `undefined` through the lattice fails closed to `T0` and would re-brick
  precisely the rows the fallback exists to keep writable.

  _The legacy path DRAINS._ `upsert` stamps the carrier from the governed door, so the first successful write
  to a carrier-less node makes it carried — migration by use, no new door, no task-#88 dependency. The link
  door does NOT drain it (`linkSameAs` adds only the peer), so a node becomes carried the first time it is
  emitted to, not the first time it is linked. Recorded rather than relied upon.

## Evidence

- Reproduced first, in `packages/adapter-io/test/governed-emit-incumbent.test.ts` (split out of
  `governed-emit.test.ts` at the 400-LOC ceiling on this same branch; this pointer named the pre-split file
  until a review followed it and found nothing) — `SCN-GE-I1` (tier), `SCN-GE-I2`
  (scope), `SCN-GE-I5` (unreadable incumbent). All three failed on `master` before the guard existed.
- `SCN-GE-I3` / `SCN-GE-I4` are the anti-over-blocking controls: re-emitting at the same class still
  set-unions, and raising strictness is allowed. Both passed _before_ the fix and still pass — so the guard
  is not simply denying more.
- `packages/adapter-io/test/governed-link.test.ts` is new. The second governed write door had **no unit
  test at all** — only an end-to-end happy-path story, which cannot plant a gate-level mutant.
- Mutation-verified, with the killers stated exactly (an earlier draft of this line claimed a mutant that
  did not hold, which a cold review caught):
  - deleting the incumbent-guard block → `SCN-GE-I1` / `SCN-GE-I2` / `SCN-GE-I5` **and `SCN-GE-I8`** (the
    word "exactly" here was itself wrong, in the very bullet that corrects an earlier wrong mutant claim);
  - restoring the old non-empty-token check in the link door → `SCN-GL-6`, and also `SCN-GL-8` / `SCN-GL-9`,
    since those depend on the same call;
  - dropping gate 0 → `SCN-GE-I7`; weakening `isTier` to `in` → `SCN-GE-I6`; de-totalising the lattice →
    `SCN-GL-9`; endpoint-only join → `SCN-GL-8`; `mine`'s collision skip → `SCN-CLI-4e`; `mine`'s
    `store.put` → `SCN-CLI-4f`;
  - an unrecognized INCUMBENT no longer strictest → `SCN-TIER-4`; the link join's `member === undefined`
    leg → `SCN-GL-9b`; `sameAsClassOf`'s dangling-peer inclusion → `SCN-SA-2` / `SCN-SA-4` /
    `PROP-SAMEAS-1`; its reverse-direction `touches` half → `SCN-SA-3`; one-sided `REJECTED_UNVERIFIABLE`
    → `SCN-GL-10` / `SCN-GL-11`.
    Each of the four above was mutation-verified by its author AND re-verified independently by the lead;
    the two the lead re-ran personally are `SCN-TIER-4` and the `sameAsClassOf` dangling-peer leg.
- Two independent cold-review seats returned **REJECT** and **FIX-FIRST** on the first draft. Every finding
  they reproduced is either fixed above or recorded as an open task (#87, #88).
- **Carrier WP.** `packages/adapter-io/test/door-regression-reject-disclosure.test.ts` is the cold test that
  found the over-correction — written against the pre-fix branch by a seat that never saw the fixes, held out
  of the branch so it could go in red. `packages/adapter-io/test/governance-carrier-controls.test.ts` holds
  the controls: `CARRIER-1` the real-disk round-trip, `CARRIER-2` an OLD-SHAPE sidecar authored by hand
  (loads, refuses, never grants, never throws, and is byte-identical across both storage states),
  `CARRIER-3` the literal identity digests, `CARRIER-4` the emit-door oracle asserted with `Buffer.compare`,
  `CARRIER-5` the link-door twin. Mutation-verified, each mutant killed by a DIFFERENT case:
  collapsing `unverifiable target` back into `unauthorized for target` → the held test's anti-vacuity leg;
  letting an absent row scope fall back to the CAS bytes → `CARRIER-2`; restoring the disclosure-first
  ordering in `governed-emit.ts` → the held test's equality leg AND `CARRIER-4`; restoring it in
  `governed-link.ts` → `CARRIER-5` alone, with all 16 pre-existing link cases still green.
- **Reversal WP.** `CARRIER-2` (a carrier-less row is WRITABLE by its owner and UPGRADED by that write),
  `CARRIER-6` (the fallback cannot grant where the bytes do not; byte-identical for a stranger in both
  storage states), `CARRIER-7` (a row that HAS a scope never takes the fallback — mismatched ⇒ `unverifiable
target`, malformed ⇒ `unauthorized for target`), `CARRIER-8` (the link door's twin). Six mutants, each
  killed: fallback grants blindly → `CARRIER-6`; malformed collapses into absent → `CARRIER-7`; "try the row,
  else try the bytes" → `CARRIER-7`; `unverifiable` collapsed into `unauthorized` → the held test +
  `CARRIER-2`/`-7`; disclosure-first ordering → the held test + `CARRIER-4`/`-6`; link door reads bytes
  before authz → `CARRIER-5`.
- **A VACUOUS-ASSERTION CLASS was found and closed while doing it.** `REJECTED_UNVERIFIABLE_TARGET`'s prose
  quotes `unauthorized for target` BY NAME — correctly, since it documents that a caller without authority
  gets that reason in both byte-states — so every `expect(rejected).toContain('unauthorized for target')` in
  the branch was ALSO satisfied by the `unverifiable target` string. Those assertions could not see a
  downgrade from the former to the latter, which is the exact oracle this ADR exists to prevent. Measured,
  not theorised: the "try the row, else try the bytes" mutant SURVIVED the battery until the assertions became
  discriminant EQUALITY (`reasonOf`, in `door-regression-support.ts`). Converted in the carrier controls and
  in `governed-emit-incumbent.test.ts`; the remaining `toContain('unauthorized')` sites in
  `governed-link.test.ts` / `compose.test.ts` are a weaker form of the same hazard and are NOT yet converted.
- `router.ts` was split at the seam its own banner already declared — the WP-5.13-a routing table and upsert
  reducer moved to `packages/knowledge/src/write/projection.ts`, re-exported so no import site changed, and
  the emit door's refusal vocabulary moved to `governed-emit-reasons.ts`. Both files had run out of room
  under the 400-LOC ceiling. Verified behaviour-preserving: the whole suite was green after the move and
  before any semantic change.
