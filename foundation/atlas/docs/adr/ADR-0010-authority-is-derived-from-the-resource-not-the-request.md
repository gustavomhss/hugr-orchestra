# ADR-0010 — a gate-selecting field is derived from the resource, never chosen by the request

- **Status:** Accepted (owner-ruled 2026-09-03). The two impose legs were Proposed (2026-08-01); the
  CREATE-leg CREATE question and the ratifier-token question are now owner-decided (§"Owner ruling"), which
  resolves the OPEN DEFINE that previously made the ADR a proposal. **Implementation** of item 1 (wire the
  derived fast-path verdicts) shipped in #313; the in-process USE-OR-SEAL serving path shipped in #319/#321.
  Item 3 (`scope`↔`primaryAnchor`) is **CLOSED in code** — shipped by WP-10.A3 (#251): the authz
  gate runs `scopeOwnsAnchor` backed by `authz.anchors` and refuses an anchor not owned by the declared
  scope.
- **Spec author:** seat `RATIFY-AUTHORITY`, grounded against `572d391` (branch
  `governance-class-is-a-node-property`).
- **Implements:** `ARCH-9` and `ARCH-10` (`docs/reference/atlas-architecture.md` §3.2), tracked as
  **ARCH-D3**. ARCH-D3a (the UPDATE leg at the emit door) was already closed by ADR-0007; this ADR closes
  the same leg _at the reducer_, and opens — but does not close — the ARCH-D3b CREATE leg.
- **Amends:** nothing frozen. `nodeKey` is UNTOUCHED, `GOVERNANCE_SURFACE` and `WRITE_PATHS` are untouched,
  `RatifyApi` / `RouterApi` / `FastpathApi.route` signatures are unchanged. `RatifyContext` gains ONE
  optional field; `@atlas/knowledge` gains one exported error class and its reason type.
- **Scope of this seat:** `packages/knowledge/**` only. Two of the four open items below require a change to
  `packages/adapter-io/src/governed-emit.ts`, which this seat does not own and did not touch.

## Context — reproduced, not hypothesised

Re-executed against the BUILT packages at `572d391`, through the public `@atlas/knowledge` surface:

```
nodeKey(T0)        = 822995f07fd9ff4013ba2940d07346437ea07d46dfd1c5268c46c76f600eecd3
nodeKey(T2)        = 822995f07fd9ff4013ba2940d07346437ea07d46dfd1c5268c46c76f600eecd3   ← identical
route(T0)          = full-ratify        ← the KNOW-8 gate runs
route(T2)          = auto-accept        ← the KNOW-8 gate is SKIPPED
upsert(T0) → CREATE ; upsert(T2) → UPDATE ; contentHash now 'ch-T2' ; supersededBy: undefined ; tier: T2
```

`tier` is an author-supplied payload field that selects which gate runs, and `nodeKey =
hash(primaryAnchorId ‖ slot[‖ check])` contains neither `tier` nor `scope`. So WHICH node a write lands on
and WHICH gate that write must clear are decided by two different things, and the author controls the
second. That is the confused deputy. Because `atlas-query` bounds `T2` out of reads (TOOLS-6), the displaced
`T0` invariant then stops appearing for its scope **with no refusal on any transport** — silent
disappearance, which for a knowledge product is the worst available failure mode.

**What was ALREADY closed, and must not be double-counted.** At the _emit door_, ADR-0007's incumbent guard
(`governed-emit.ts` §2.25) refuses this exact write `governance-downgrade` before it reaches the reducer;
`SCN-GE-I1` is green at `572d391` and was re-run to confirm. The transcript above is therefore not a
door-level bypass. It is the state of the _reducer_ the door protects, which knew nothing of the rule.

## Decision 1 (ARCH-9) — derivation, and the alternative that was rejected

**The gate-selecting class is DERIVED by the door and joined with the declared one, one-way.**
`RatifyContext` gains `derivedTier?: Tier`; `route` gates on `strictestTier(derived, declared)` when it is
supplied and on `declared` when it is not. The join means a payload can only ever make its own gate HARDER,
and `strictestTier` is total over `unknown` and joins garbage to `T0`, so a door that computes nonsense
pins the gate SHUT rather than open.

**The rejected alternative: folding `tier` into the identity envelope.** The brief for this work offered it
as a free choice. It is not one — `ARCH-9` already considered and rejected exactly this, in writing, as
formulation (i), and rejected the _disjunction_ ("identity-inclusion OR derivation") as formulation (ii):
"Only derivation closes it. The clause is therefore a single requirement, not a choice." Three independent
reasons, and each one alone is sufficient:

1. **It does not close `scope` at all.** Authz is `actor === scope` on an author-supplied string while the
   read projection scopes on the derived `primaryAnchor`, with nothing binding them. Putting `scope` in the
   identity changes neither side of that.
2. **This codebase has already ratified the opposite.** ADR-0007's carrier note: _"NEITHER FIELD ENTERS
   `nodeKey` … folding a governance value into it would silently re-address every stored fact and split a
   node from its own history the first time its class was raised."_ A `T0` node whose class is later raised
   would become a DIFFERENT node, orphaning its own lineage — and one `(anchor, slot)` would hold one node
   per class, which is precisely the proliferation the closed 13-member slot vocabulary exists to prevent.
3. **It would move every stored hash, and the repo has no hash-version detection** (task #112). Under the
   chosen design nothing moves: `nodeKey` for the reproduction fixture is byte-identical before and after
   the fix (`822995f0…`), `router.ts` is untouched, and **no golden's pinned expectation changes**.

Note what derivation does NOT do: the two identities still collide, by design. The `T2` write still ROUTES
to the `T0` node. What changed is that landing there now costs the gate the `T0` node requires.

## Decision 2 (ARCH-10) — the incumbent's authority, enforced in the reducer

`upsert` now refuses a write that DISPLACES a current node while lowering that node's class
(`governance-downgrade`) or moving it to another scope (`governance-relocation`). Authority is read off the
INCUMBENT ROW, never off the request.

**Why duplicate a check the door already makes.** Before this, the safety of a billy-ratified `T0` node was
a property of one caller's GATE ORDER — of `incumbentRefusal` happening to run before `upsert` — rather
than a property of the write. The door refuses EARLIER and with more context (it can read the CAS bytes, so
it also covers a row carrying no class); the reducer refuses UNCONDITIONALLY, for every present and future
caller. One is a policy check; the other is an invariant of the data structure.

**Why a throw and not the `REJECT` route.** `WriteDecision` already enumerates `REJECT` and returning it
looked tidier. It is unsafe here, measurably: `governed-emit.ts:304` is `upsert(projection, req).store` — it
DISCARDS the decision. A returned refusal would have persisted nothing while the door reported
`emitted: true`, i.e. the same silent-failure class this guard exists to prevent, moved one layer up. A
throw cannot be ignored by an existing caller, and it follows the precedent this package already set for a
write-door refusal (`DegenerateAnchorError`). The thrown value carries a machine-readable `.reason`
DISCRIMINANT, because refusal prose in this repo quotes other refusal constants by name and a substring
assertion therefore cannot say which gate refused (ADR-0007 §"A VACUOUS-ASSERTION CLASS").

**The limit, stated rather than left to be inferred.** Each half gates only where the ROW declares that
half. A row minted before the ADR-0007 carrier declares nothing, so there is nothing to derive authority
from and this gate stands aside — the door's CAS-bytes fallback is all that protects that shape.
`SCN-AUTH-5` pins this as a stated property so it cannot later be mistaken for coverage.

## Decision 3 — the ratifier token is an ADVISORY MARKER, and now says so

Chosen: **make the code and the docs state plainly what it is.** `RatifyToken.by` is compared to `''` and to
the literal `'billy'`; no signature is verified and no identity is established.

**A reported finding is corrected here, with the measurement.** The finding this seat was given said the
token is self-asserted "for T1 and for every `sameAs` link below T0", and that "only the T0→billy gate is
not self-asserted". **The T0→billy gate is self-asserted too.** `compose.ts:120` is
`const ratifyToken = process.env.ATLAS_RATIFY_TOKEN` with no verification, so the `T0` gate is satisfied by
`ATLAS_RATIFY_TOKEN=billy` by anyone who can invoke the CLI. This is not a new test's claim — the product's
OWN black-box story already demonstrates it end-to-end through the real CLI subprocess
(`s7-governance.blackbox.test.ts:210`, and `support.ts:26`: _"as `ATLAS_RATIFY_TOKEN`, it commits a T0
fact"_). Every tier's gate is a string comparison against a caller-settable value.

This is a legitimate posture for a local developer tool and it is the SAME one `ARCH-12`/§3.3 already
records for `actor` (`ATLAS_ACTOR ?? gitUserEmail`): an **anti-accident guardrail, not an adversarial
control**. It stops an agent from silently self-committing a critical fact as a side effect of ordinary
work; it stops nothing done deliberately by whoever runs the process. What was wrong was not the mechanism
but the PROSE around it — "security-gate ratifier", "requires the billy token", "the explorer never
self-commits" — which reads as authentication. The headers and doc comments in
`packages/knowledge/src/ratify/ratify.ts` now state the posture first, and `SCN-AUTH-9`/`SCN-AUTH-10` pin it
so no future doc can describe it as authentication without turning a test red.

**Exposure that follows, and is NOT closed:** `T1` is INSIDE the read bound (only `T2` is bounded out), so a
self-named ratifier is enough to put a SERVED invariant into a pack.

## What the owner still has to ratify

> **OWNER-RATIFIED 2026-09-03** — items 2 and 4 below are DECIDED by the owner; items 1 and 3 were the
> implementation scope of ARCH-D3b (CREATE leg) and are now closed as recorded below. The ruling is recorded
> in full in §"Owner ruling" below.

1. **The door must actually supply derived fast-path verdicts.** **CLOSED by #313.**
   `deriveFastPathVerdicts` now supplies the verdicts to the route; the old `DOOR_RATIFY_CTX` constant is gone.
   `contested` remains false on every current path because no veto/contention source exists yet; that is a
   recorded extension, not a pinned-open gate.
2. **ARCH-D3b — the CREATE leg.** On a write that mints a node there is no incumbent to derive from. What
   un-choosable value names a NEW node's class? This is the OPEN DEFINE the architecture doc already
   records; ARCH-9 explicitly forbids answering it with "a constant that pins the gate open".
   _[OWNER DECIDED 2026-09-03 — see ruling item 2: CREATE is T2-by-construction; growth is by USE-OR-SEAL,
   neither mandatory.]_
3. **`scope` ↔ `primaryAnchor` binding — CLOSED in code (WP-10.A3, #251).** The write door's authz gate
   binds the declared `scope` to the derived `primaryAnchor`: `evalAuthzGate` (governed-emit-gates.ts) runs
   `actorInScope` then `scopeOwnsAnchor` (policy.ts, backed by `authz.anchors`) and refuses
   `REJECTED_UNAUTHORIZED_ANCHOR` when the scope does not own the fact's real anchor. A fact anchored in
   `src/payments` declared under `scope:'public'` is refused. The open-item wording below predates that
   shipment; the code closed it. _[This ADR item is historical — see the architecture §3.4 for the current
   statement.]_
4. **Whether the ratifier token becomes verifiable.** Doing so needs a verifier and a key-distribution story
   this product does not have. Until then, §3.3's posture stands and the prose must keep saying so.
   _[OWNER DECIDED 2026-09-03 — see ruling item 3: the seal token is ONE of two growth evidences, not a
   gate; verification stays advisory and the posture prose stands.]_

## Owner ruling — 2026-09-03 (owner, after adversarial review)

The owner ratifies the CREATE-leg question and the ratifier-token question in one ruling. The framing the
owner chose, stated in product terms before the technical translation:

> "Who approves is the ORCHESTRATOR (whatever model is orchestrating), approving only with evidence,
> clear protocol, etc."
> "Both [use-and-success and human seal] coexist; neither is mandatory."
> "Human in the loop kills the purpose and does not scale. This is to serve LLMs, not humans. The human
> seal may be a plus, never an obligation."

Three commitments follow, each now owner-ratified:

1. **Gate-selecting fields are derived, never chosen — including on CREATE.** On an UPDATE the incumbent's
   stored class already supplies `derivedTier`. On a CREATE the class is **`T2` by construction** — a new
   node is born advisory; nothing an author can declare raises its class at the moment it is minted. This is
   what §3.4 already showed the one-way join does in practice (a self-declared `T0` routes to full
   ratification; a self-declared `T2` buys no authority); the owner now makes T2-by-construction the
   WRITTEN rule, not a consequence.
2. **Growth is by USE-OR-SEAL, neither mandatory.** A node leaves the advisory class by ONE of two earned
   evidences, either sufficient, neither required:
   - **USE** — a per-node usage COUNTER (in `packages/knowledge/src/lifecycle/hits.ts`) increments each time
     the node is served in a completed decision. When it reaches a FIXED constant (`USE_THRESHOLD`, one
     named constant in the code — no calibration, no context-dependent rule), the node rises implicitly,
     auto-accepted by the growth path with no human and no further gate. The threshold is deliberately a
     plain integer, tunable in one place. `[OWNER 2026-09-03: keep it a counter, no invented regime — 8 is
illustrative; the value is a named constant the owner can change.]` The current implementation records
     an in-process served hit on composed query and returns the raised class on the next pack; it has no
     completion signal or durable promotion event yet.
   - **SEAL** — a human ratify token records a deliberate endorsement; a named, evidence-carrying seal is
     also sufficient.
     A node that earns neither stays advisory and decays by non-use (KNOW-17). There is NO required human
     gate on the growth path — the human seal is a plus, never a precondition.
3. **The ratify token is ONE evidence, not a gate, and its verification stays advisory.** The token remains
   what §3.3 says: an anti-accident guardrail against silent self-commit, not an authentication control.
   Making it verifiable is still not warranted under the local posture; the `service-gate-guard` tripwire
   (ARCH-12) re-opens the question the moment a remote/multi-tenant transport is attempted.

**What this means for items 1 and 3 (implementation scope of ARCH-D3b):**

- Item 1 = **CLOSED by #313**: the emit door consumes `deriveFastPathVerdicts`; no hardcoded
  `DOOR_RATIFY_CTX` remains. The current `contested:false` outcome is an honest absence of a veto source.
- Item 3 = **CLOSED in code** (WP-10.A3, #251): `evalAuthzGate` runs `scopeOwnsAnchor` backed by
  `authz.anchors`, so authz cannot be claimed by declaration — a fact anchored in `src/payments` under
  `scope:'public'` is refused. No further implementation.

5. **The architecture doc's decision table** still shows ARCH-D3b as OPEN (correct) but its ARCH-9 row
   predates this ADR. Updating `docs/reference/atlas-architecture.md` is deliberately NOT done here: three
   other seats are live on this base and that file is not this seat's to edit.

## Consequences

- `@atlas/knowledge` exports `GovernanceAuthorityError` + `GovernanceAuthorityReason`, and `RatifyContext`
  gains `derivedTier?: Tier`. Both are ADDITIVE; every existing caller compiles and behaves identically.
- `upsert` can now THROW. Its only `src` caller is `governed-emit.ts:304`, inside `commitProjection`, on a
  path whose own §2.25 guard refuses first — so the throw is a backstop, not a new production path. Callers
  that reach the reducer by other routes inherit the rule instead of having to rediscover ADR-0007.
- Suite: 214 files / 1536 tests → 215 / 1546. The delta is exactly the ten new scenarios; **no existing test
  changed and no golden was edited.**
