# ADR-0015 — A grounding token is typed by the fact's SHAPE, not one hash for all

**Status:** ACCEPTED — owner-ratified 2026-08-29, on the RECONCILIATION section at the end of this file (not on the original "What the owner must ratify" list, which was stale). Amends the GROUND-1 oracle model. Scope of the signature: **D1–D5** — see the RATIFICATION block below for the two corrections the owner ratified WITH.

> **Note on how this was ratified.** All five decisions had already SHIPPED against this ADR while it was still PROPOSED — that is a governance failure the RECONCILIATION section records rather than hides. The owner ratified after that reconciliation was put in front of him, on what exists, not on the original proposal.

**Closes:** the product limit in #99 (Atlas cannot ground a negative, a relation, or a transition — 5 seats
hit the same wall). Reconnects the deferred GAP-1 (multi-unit anchor, ADR-0014 §"does NOT close") and #189
(the dependency graph is an under-approximation) to a real consumer. It originally named `hugit-diff` (structural
diff with moves) as the rename-reconciliation seam; **that project is discontinued/on hold as of 2026-08-10, so the
seam is reopened — TBD** (see the 2026-08-10 amendment note at the end of "What this reconnects").

> This ADR decides the SHAPE only. No code lands on this ADR. It is grounded in a prior-art sweep of the
> state of the art (sources inline); the honest hard problems are named, not hidden.

## Context — what the wall actually is

Atlas grounds every fact the same way: a fact anchors to a structural unit's `subtreeHash` (BLAKE3 of the
unit's normalized bytes, GROUND-1), and it is FRESH iff that hash still matches at HEAD. Five mining seats hit
a wall trying to state facts that this single oracle cannot express:

- **a relation** — "X depends on Z", "A calls B" (spans TWO units);
- **a negation** — "X is never called", "f has no side effects" (a `¬∃` over a WHOLE relation);
- **a transition** — "returned A, now returns B", "T2→T0" (spans TWO revisions).

The root cause is one design decision that the SOTA sweep makes unarguable: **Atlas uses ONE grounding token
(`subtreeHash`) for every fact shape, and that token conflates two roles — IDENTITY and FRESHNESS — that every
mature code-fact system keeps separate.** A content hash is a perfect drift detector and a hopeless identity.

## Prior art (the load-bearing mechanism of each, with sources)

**Relations — a relation is a typed tuple `(endpointA, kind, endpointB)`, and identity is decoupled from content.**

- **Kythe**: an edge is `(sourceVName, kind, targetVName)`; a VName is a _location-free_ semantic id
  (`corpus,root,path,language,signature`) generated without source locations, so a move does not perturb node
  identity ([storage](https://kythe.io/docs/kythe-storage.html), [indexer](https://kythe.io/docs/schema/writing-an-indexer.html)).
- **Meta Glean**: a relation is a typed predicate (a table); a fact's KEY gives identity and dedups; derived
  predicates compute relations by query ([derived](https://glean.software/docs/derived/)).
- **CodeQL**: relations are first-class DB tables, queried by joins, never pointer-walked
  ([about](https://codeql.github.com/docs/codeql-overview/about-codeql/)).
- **SCIP** (Atlas already consumes it): a global symbol is a location-free descriptor string; `relationships`
  are genuine symbol→symbol facts — but a **local symbol is `local <id>`, document-scoped, with no cross-file
  identity** ([scip.proto](https://github.com/sourcegraph/scip/blob/main/scip.proto)). This is exactly #189.
- **Datalog (Soufflé/Doop)**: a relation-instance's identity IS the tuple of endpoint ids
  ([relations](https://souffle-lang.github.io/relations)).

**Negation — a negative is only true relative to a relation computed COMPLETELY; the freshness trigger is an
insertion, not an edit.**

- **Closed-world assumption + stratified negation** (Soufflé/Doop/DDlog): `!calls(X,Y)` means "absent from the
  materialized `calls` relation" — sound only if `calls` was computed over the whole program; negation is a
  property of the RELATION, never a tuple ([Alice ch.15](http://webdam.inria.fr/Alice/pdfs/Chapter-15.pdf)).
- **Soundiness manifesto** (Livshits, Sridharan, Smaragdakis et al.): real call graphs are "soundy" — sound
  core, deliberately UNDER-approximated on reflection/dynamic-dispatch/`eval`/FFI, which _"render much of the
  codebase invisible."_ A negative over those edges is a lie; a **SCIP local-symbol graph is an
  under-approximation, so its complement is unsound by construction** ([manifesto](https://yanniss.github.io/Soundiness-CACM.pdf), [soundiness.org](http://soundiness.org/)).
- **Semiring / why-not provenance** (Green et al.; Bourgaux et al.): a positive points at one derivation; a
  negative points at the whole frontier of FAILED derivations — its invalidation trigger is an **INSERTION
  anywhere in the negated relation**, which a per-unit hash is monotone-blind to
  ([provenance semirings](https://web.cs.ucdavis.edu/~green/papers/pods07.pdf), [datalog provenance](https://arxiv.org/pdf/2202.10766)).

**Transition — a two-rev, HISTORICAL claim; freshness does not apply; node-correspondence under move+edit is
outside content-hash equality.**

- **GumTree**: node correspondence `A@r1 ≡ B@r2` needs a similarity match (type + Jaccard/dice over
  descendants) to recover a moved+edited node — content-hash isomorphism only carries the UNCHANGED subtrees
  ([ASE'14](https://www.labri.fr/perso/xblanc/data/papers/ASE14.pdf)).
- **RefactoringMiner**: two snapshots → one TYPED transition fact (~60 refactoring + ~40 API-change types)
  ([TSE'20](https://users.encs.concordia.ca/~nikolaos/publications/TSE_2020.pdf)).
- **Datomic / bitemporal**: a transition is a valid-time interval `[X,Y)` — a closed, fixed fact; only its
  supersession changes, never its truth ([bitemporal](https://blog.podsnap.com/bitemp.html)).
- **Glean stacked incremental**: immutable DB layers non-destructively add/hide facts — supersession, not
  mutation ([incrementality](https://glean.software/docs/implementation/incrementality/)).

## Decision

**A grounding token is typed by the fact's shape. There are FOUR shapes; the current `subtreeHash` oracle is
the correct token for exactly ONE of them.** Identity (`unitKey`, a location-free qualified-symbol key — the
Kythe/SCIP lesson) is separated from freshness (`subtreeHash`, the drift oracle) everywhere.

| shape                               | example             | grounding token                                  | FRESH means          | drift trigger                     |
| ----------------------------------- | ------------------- | ------------------------------------------------ | -------------------- | --------------------------------- |
| **positive-intrinsic** (today)      | "this body calls Y" | `subtreeHash(unit)`                              | hash matches HEAD    | edit to the unit                  |
| **relation** (2-ended)              | "X depends on Z"    | the PAIR `{unitKeyA·hashA, unitKeyB·hashB}`      | BOTH hashes match    | edit to EITHER end                |
| **negation** (`¬∃` over a relation) | "X is never called" | a COMPLETENESS WITNESS                           | witness holds        | insertion into the scope          |
| **transition** (2-rev, historical)  | "returned A, now B" | the rev-PAIR `{unit@sha_before, unit@sha_after}` | — (permanently true) | never — superseded, not falsified |

The four sub-decisions:

**D1 — Positive-intrinsic is unchanged.** `subtreeHash` is a _sound_ oracle for a property that is a pure
function of the hashed unit's bytes. Everything shipped today is this shape and stays exactly as is.

**D2 — A relation is a 2-ended grounded fact; freshness is the existing oracle lifted from a singleton to a
2-set.** The grounding data model ALREADY supports this: `Grounding.entries[]` is multi-entry and `driftDetect`
is FRESH iff EVERY entry's `subtreeHash` matches (an AND-fold), and `ground()` is fail-closed at the fact
(grounding/src/ground.ts). So a relation = a fact with TWO grounding entries (both endpoints); drift-if-either
is already the oracle's behaviour. **This is GAP-1's multi-unit anchor — and its consumer now exists.** The
NEW work is: a `RelationKind` fact type (reuse the index `EdgeKind`), a producer that emits the pair, and a
bidirectional read index (the dependency axis already has reverse-closure; promote reverse-indexing to _any_
relation kind). Identity of a relation = `(unitKeyA, kind, unitKeyB)`.

**D3 — A negation is groundable ONLY where completeness is decidable; otherwise it ABSTAINS.** Its token is a
**completeness witness** = (scope-closure predicate) ∧ (a Merkle root over EVERY in-scope unit that could emit
a `→X` edge) ∧ (the edge-model/extractor version). It drifts on: any in-scope unit's hash change, a unit
_entering_ the scope (insertion-sensitivity a per-unit hash lacks), or an edge-model change. Because the
shipped dependency graph is an under-approximation (#189), an **unscoped** negative ("X is never called") has
no witness and is a LIE — the door MUST refuse it. The honest, groundable form is the **scoped positive**:
"within closed scope S under edge-model E, no caller of X was found" — falsifiable, carrying its own
completeness proof. Negations at open-world boundaries (exported symbols, any reachable
reflective/dynamic/FFI edge) abstain. _This is the axis where "honestidade inegociável" is load-bearing: the
easy version ships a lie._

**D4 — A transition is an IMMUTABLE ADVISORY historical record, not a live predicate.** It anchors to the
rev-pair `(unit@sha_before → unit@sha_after)`, both content-addressed. It is never re-checked for truth at
HEAD (it was true and stays true — a closed valid-time interval); it is retained, indexed by unit lineage, and
**superseded** by a later transition on the same lineage. The freshness oracle does not apply to it.

**D5 — A test-vacuity fact is a SINGLE-ANCHOR PROVEN AST-shape record, sealed `proven` with a re-runnable
witness (#95).** The SIXTH `GroundedFact` shape — "named test `testName` in unit `unitKey` has all its
assertion-shaped calls inside `catch` clauses and no assertion-count guard" — a SYNTACTIC property that is a
pure function of the hashed unit's AST (`scanTestVacuity`, `adapter-io/src/test-vacuity.ts`). Its grounding
token is the SINGLE unit anchor (`subtreeHash(unit)`, the positive-intrinsic oracle), so — unlike a
transition — it HAS a mechanical HEAD oracle and is SEALED **`proven`**, not `justified`: the single-anchor
AST-substrate analogue of a proven `depends-on` relation (D2/#99a/ADR-0021). It carries NO `check` (its oracle
is **tree-sitter**, not the SCIP/symbol-reverse substrate the `PredicateSlot`/`VerifyKind` dispatch runs on),
so it is NOT a `PredicateNode` and never enters the predicate lifecycle — the oracle lives in adapter-io,
injected like `verifyRelation`, never re-run inside genesis. Identity is the **(unitKey, testName) pair** (a
unit may hold many named vacuous tests, each its own node); freshness is the unit anchor's `subtreeHash` and
reverify RE-RUNS `scanTestVacuity` at HEAD, re-proving iff a fact with this `testName`+`shape` still appears
(else `broken`). The seal carries its re-runnable derivation (a `TestVacuityWitness` = the proven `shape` +
the `testName` the re-run must still find), so a proven node is never `unverifiable` (the #240 trap). The
`shape` vocabulary is closed/additive-only (`assertion-only-in-catch` today; a new shape is a `cv` bump).

| shape                                        | example                        | grounding token     | FRESH means                                     | drift trigger    |
| -------------------------------------------- | ------------------------------ | ------------------- | ----------------------------------------------- | ---------------- |
| **test-vacuity** (single-anchor, AST-proven) | "test T asserts only in catch" | `subtreeHash(unit)` | `scanTestVacuity` still finds (shape, testName) | edit to the unit |

## The one hard problem, named honestly (spans D2 + D4)

**Endpoint identity across a move+rename is provably outside content-hash equality.** A `subtreeHash` MUST
change on every edit (that's freshness); if it is also identity, any edit orphans the relation → a false-drift
storm. The fix is D2's split: `unitKey` (location-free, identity) + `subtreeHash` (freshness). A pure edit then
drifts the relation _without orphaning it_ — the win content-hash-alone cannot buy. But a genuine move+rename
changes `unitKey` itself, and **no content scheme can survive that** (Kythe minimizes it with location-free
VNames but a rename still re-derives a signature). The residual reduces to **rename reconciliation**, whose
natural home is a structural-diff / rename-detection pass: diff HEAD⁻¹→HEAD, detect the moved+renamed subtree,
rewrite `unitKey` on both single- and 2-ended facts before the oracle runs. This was originally scoped to Atlas's
own `hugit-diff` (TED-with-moves); **that project is discontinued/on hold as of 2026-08-10, so the engine is TBD**
(the algorithm survives as a reference, not a shipped dependency). The move+rename residue is not yet built — a
pure edit is already handled by the split; the residue is re-scoped at #99c.

## What this reconnects (three deferred/parallel threads get a consumer)

- **GAP-1** (multi-unit anchor, deferred in ADR-0014 for "no consumer"): D2's relation IS the consumer.
- **#189** (dep graph is an under-approximation): D3's abstention discipline is the honest response to it.
- **rename-reconciliation seam** for D2+D4 (a structural diff with moves): originally scoped to `hugit-diff`,
  **now TBD** — see the amendment note below.

> **Amendment 2026-08-10 (honesty maintenance, non-normative):** `hugit-diff` — the project originally named
> throughout this ADR as the rename-reconciliation seam — has been discontinued / put on hold by the owner. No
> shipped Atlas code ever depended on it (grep of `packages/**` + `harness/**` for `hugit` = 0; #99a and #99b
> shipped with their own machinery). The move+rename residue for #99c remains explicitly deferred, and its engine
> is now an open design question rather than a named home. This amendment corrects the forward references above; it
> does not change any ratified decision of ADR-0015 (the typed-token model, the D2/D3/D4 split, the sequencing).

> **Amendment 2026-08-11 (D3 authz/identity split — F3, owner-ratified, WP-96-N):** D3 keeps `scope` as an
> IDENTITY leg (the witness directory a negation was proven closed over — `negationKey(relationKind, target,
scope)`, unchanged) AND as the scope its abstention law reasons about. That single scope also served as the
> WRITE-AUTHZ binding, which blocked the negation from being MINED: the explorer holds `atlas:mined`, not
> authority over an arbitrary source directory it happened to prove closed, so a mined negation over `src/pay`
> was rejected unauthorized. The ratified fix ADDS a SEPARATE, additive/optional `authzScope` to the negation
> shape; the door's authz gate binds **`authzScope ?? scope`**. Identity and the abstention law are UNCHANGED —
> `negationKey` never reads `authzScope`, and abstention still reasons over the witness `scope`. Absent
> `authzScope` ⇒ authz binds the witness `scope` exactly as D3 first shipped (human-emitted negations unchanged).
> A mined negation carries its witness `scope` (identity) AND `authzScope: atlas:mined` (authz). This refines D3
> only in the authz binding; it does not change the typed-token model, the completeness-witness grounding (§3), or
> the abstention discipline. Details + the identity/authz separation live in
> [99b §1/§4](../design/99b-negation-fact-contract.md).

> **Amendment 2026-08-13 (D3 completeness test is TARGET-RELATIVE — ADR-0016, owner-ratified):** D3's honest-
> abstention LAW is unchanged (admit only a PROVEN-complete negative; abstain durably otherwise). What ADR-0016
> refines is the completeness TEST: the shipped door proved completeness by a scope-blanket proxy
> (`holeSources() ∩ S == ∅`), which abstains on 92 % of real files (every dir statically imports node/npm) — 0
> recall. ADR-0016 replaces it with a TARGET-RELATIVE test — a negative "X un-relationKind'd in S" is complete iff
> `resolves(X) ∧ ¬escape(X) ∧ ¬dynamic-reach(S)` (a hole about some OTHER undefined symbol can never be a hidden
> reference to a resolvable X; the only channels to X are X's value escaping, or an opaque dispatch in S — both
> gated). `holeSources` is retained as the canon-completeness fallback. Measured 0 %→86.2 % sound-groundable, 0
> unsound. The soundy boundary moves from "any hole in S" to per-indexer canon-completeness. Full argument +
> committed reproduction: [ADR-0016](ADR-0016-negation-completeness-is-target-relative-escape-and-dynload.md).

## What the owner must ratify

1. **The typed-token model (D1–D4)** — that a grounding token is chosen by fact shape, amending the GROUND-1
   "the oracle is `subtreeHash`" invariant to "the oracle for a _positive-intrinsic_ fact is `subtreeHash`;
   other shapes carry their own token." (Ratified-invariant amendment — the GAP-2 rite.)
2. **The negation abstention law (D3)** — that Atlas MUST refuse an unscoped negative and may only state a
   scoped-positive with a completeness witness. This is a product-honesty commitment, not just a mechanism.
3. **Transition as advisory-historical (D4)** — that a transition is never a live predicate and is superseded,
   not falsified.
4. **The decomposition + sequencing** below.

## Recommended decomposition (each its own landing, GAP-2 rite)

- **#99a — RELATION (build first).** Highest value/effort ratio: the grounding model already AND-folds a
  2-entry receipt, and the reverse-closure index exists. Work = `RelationKind` fact + 2-ended producer +
  bidirectional index + the `unitKey`/`subtreeHash` identity/freshness split. Consumes GAP-1. No new
  soundness theory. _Feeds #196 (typed genesis output) directly — a relation IS a typed fact._
- **#99b — NEGATION (build second, most rigorous).** Work = scope-closure decision procedure + completeness
  witness (scope Merkle root + edge-model version) + the abstention gate. Design-heavy; the honesty core.
  Blocked-in-spirit until the dep graph's completeness boundary is stated (#189 follow-through).
- **#99c — TRANSITION (build third).** Work = advisory rev-pair record + supersession lineage + rename
  reconciliation. The rename engine was scoped to `hugit-diff` (discontinued/on hold 2026-08-10) — now **TBD**; the
  move+rename residue is re-scoped at #99c freeze.

**Lead recommendation: ratify D1–D4 + the sequencing, then build #99a (RELATION) as the first landing.** It is
the buildable core, it discharges the deferred GAP-1, and it is the one that most moves the north (relations
are the high-value facts the frontier's comment-rich units already gesture at but cannot ground).

## Honesty / scope

- This ADR is a design, prior-art-anchored, not code. The prior-art sweep was three controlled web-research
  passes (owner-authorized); sources are inline and primary where load-bearing.
- The population measurement earlier this session showed genesis facts skew toward comment-restatements
  (obvious, low-value). Relations (D2) are the concrete answer to that: a grounded `(A, depends-on, B)` is a
  fact the comment gestures at but never grounds — non-obvious by construction.
- The negation axis is the one where the SOTA and the owner's honesty law agree exactly: the cheap version is
  a lie, and abstention is the only honest floor.

---

## RECONCILIATION — what actually shipped (2026-08-29, lead)

> **Read this before ratifying.** This ADR still says _"No code lands on this ADR"_ and its status is still
> PROPOSED. Both statements are now false in practice: **all five decisions have shipped**, and two product
> doors name this ADR in their first line — `governed-emit-test-vacuity.ts` (_"ADR-0015 D5 — THE TEST-VACUITY
> DOOR"_) and `governed-emit-transition.ts` (_"ADR-0015 D4 — THE TRANSITION DOOR"_). This section reconciles
> the design against the build so the ratification decision is made on what exists, not on what was proposed.
> It changes no decision and asserts no new one.

### Per-decision verdict, verified against shipped code

| decision                                 | verdict                                                  | where it lives                                                                                                                                                                                                                     |
| ---------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** positive-intrinsic unchanged      | **shipped as designed**                                  | the existing `subtreeHash` oracle, untouched                                                                                                                                                                                       |
| **D2** relation = 2-ended fact           | **shipped as designed**                                  | `RelationKind` (closed `'depends-on'\|'calls'`, `knowledge/src/types.ts`); `atlas relations` + `atlas derive-relations`                                                                                                            |
| **D3** negation abstains unless complete | **shipped as designed**                                  | `adapter-io/src/governed-emit-negation.ts` — scope-Merkle via `resolveCurrent` (insertion-sensitive, as D3 requires), `edgeModel` stamped from the pinned extractor release, and the `scope-open` / `escape-open` abstention gates |
| **D4** transition is advisory-historical | **shipped, with one gap closed differently — see below** | `adapter-io/src/governed-emit-transition.ts`; lineage supersession is derive-on-read (D-T3)                                                                                                                                        |
| **D5** test-vacuity, sealed `proven`     | **shipped as designed**                                  | `adapter-io/src/test-vacuity.ts` + `governed-emit-test-vacuity.ts`; `shape` is the additive-only union D5 specifies (`knowledge/src/test-vacuity-types.ts:37`)                                                                     |

### The four things ratification must now decide

1. **The ratification list is stale.** _"What the owner must ratify"_ above asks for **D1–D4**. **D5 was
   appended later and has shipped** — sealed `proven`, measured 0-false-admit end-to-end. Ratifying D1–D4 as
   written would leave the one decision that mints `proven` seals unsigned. **The list should read D1–D5.**

2. **D4's rename gap was closed by EXCLUSION, not by the TBD.** This ADR scoped rename reconciliation to
   `hugit-diff`, recorded it as discontinued, and left the seam **TBD**. The build did not reopen the seam —
   it excluded the case: `knowledge/src/transition-types.ts:24` states that _a move/rename changing `unitKey`
   is OUT OF SCOPE (D-T4)_. That is a defensible narrowing (a transition needs the same `unitKey` across both
   revs), but it is a **decision the ADR deferred and the build made**. Ratify the exclusion, or reopen the
   seam as its own work.

3. **A decision layer grew below this ADR.** The transition and test-vacuity builds carry their own numbered
   decisions (`D-T1…D-T4`) in `docs/design/234-transition-design.md` and `docs/design/95-test-vacuity-design.md`.
   They are lead-authored design, not owner-ratified, and this ADR never anticipated them. Say whether they
   ride under this signature or need their own.

4. **The sequencing recommendation is spent.** _"Ratify D1–D4 + the sequencing, then build #99a first"_ —
   #99a (relation), #99b (negation), #99c (transition) and D5 (test-vacuity) have all landed. The
   decomposition section is a historical record now, not a plan. Nothing to ratify there.

### What ratification unlocks immediately

D5 closes the `shape` vocabulary as **additive-only**: _"a new shape is a `cv` bump"_, and the machinery is
already in place (`knowledge/src/test-vacuity-types.ts:37`, the same pattern as `RelationKind`). So the next
proven shapes — the `no-assertion-in-test` / `unasserted-parse-call` / `commented-out-tests` idioms the
cross-repo shape census names as the largest convertible cluster
(`harness/probes/adjudicate/xrepo-zod-shape-census.json`) — need **no new ADR**. They are a `cv` bump under a
ratified D5. Until D5 is signed, each one adds to the debt instead of paying it down.

### Honest statement of the gap this section does not close

This reconciliation was authored by the lead against shipped code. It does not re-ratify anything, and it does
not claim the build was authorised — the build happened on a PROPOSED ADR, and that is the finding, not the
fix. The fix is the owner's signature or the owner's objection.

---

## RATIFICATION — owner, 2026-08-29

**Ratified: D1, D2, D3, D4, D5** (the typed-token model, the negation abstention law, transition-as-advisory,
and the test-vacuity `proven` shape), as reconciled against shipped code in the section above.

The signature carries two corrections and two clarifications:

**Correction 1 — the scope is D1–D5, not D1–D4.** The original "What the owner must ratify" list predates D5,
which was appended later and shipped. D5 is the decision that mints `proven` seals, so ratifying the older
list would have left the load-bearing decision unsigned. **That list is superseded by this block.**

**Correction 2 — the rename gap is ratified AS AN EXCLUSION, and is now an explicit non-goal.** This ADR left
rename reconciliation TBD after `hugit-diff` was discontinued; the build closed it by excluding the case
(`knowledge/src/transition-types.ts:24`, D-T4: a move/rename that changes `unitKey` is out of scope). The
owner ratifies that exclusion. The reasoning, recorded so a future reader can re-open it on evidence rather
than on discomfort: a transition is _defined_ as the same `unitKey` across two revs, so a rename is a
different concept, not a degenerate transition; no shipped consumer needs it; and re-opening it would be a
design project with no consumer today. **It is a NON-GOAL, not an unknown.** Re-opening costs nothing later,
because an exclusion leaves no wrong implementation to unwind.

**Clarification 1 — the `D-T1..D-T4` layer rides under this signature.** The transition and test-vacuity
builds carry their own numbered decisions in `docs/design/234-transition-design.md` and
`docs/design/95-test-vacuity-design.md`. They are implementation-level decisions taken _under_ the shapes this
ADR decides, and they are ratified with it — but they are named here so they are visible rather than
invisible. A decision in those docs that changes a SHAPE, rather than implementing one, needs its own ADR.

**Clarification 2 — the "Recommended decomposition" section is historical.** #99a (relation), #99b (negation),
#99c (transition) and D5 (test-vacuity) have all landed. Nothing in that section is a live plan; it is kept as
the record of the sequencing that was followed.

### What this unlocks

D5 closes the `shape` vocabulary as **additive-only** — _"a new shape is a `cv` bump"_ — and the machinery is
in place (`knowledge/src/test-vacuity-types.ts:37`, the `RelationKind` pattern). The next proven shapes —
`no-assertion-in-test`, `unasserted-parse-call`, `commented-out-tests`, the largest convertible cluster in the
cross-repo shape census (`harness/probes/adjudicate/xrepo-zod-shape-census.json`) — are a `cv` bump under this
ratified D5 and need **no new ADR**.

> **Follow-up note (2026-08-30, lead — not part of the ratified text).** The "What this unlocks" list above
> named three next shapes. What actually happened: `no-assertion-in-test` shipped (#270) and
> `assertion-never-invoked` shipped as the third; `unasserted-parse-call` turned out to be SUBSUMED by
> `no-assertion-in-test`, and `commented-out-tests` is half subsumed and half outside the family's
> `(unitKey, testName)` identity model. The cluster needed three shapes, not four —
> `harness/probes/adjudicate/test-vacuity-idiom-coverage.json` carries the evidence. The additive-only clause
> ratified here is what made all three `cv` bumps rather than new ADRs.
