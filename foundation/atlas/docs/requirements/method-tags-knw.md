# Method-tags — Block KNW (knowledge) · S2 formal-decision

> **state:** S2 · **protocol:** [`formal-decision`](../../.claude/skills/formal-decision/SKILL.md) ·
> **axiom:** S1 frozen (`req-knw.md`; every behavioural INV has ≥1 REQ, atom-gate passed) ·
> **owner:** charlie (FORGE).
>
> One tag per **behavioural** INV by the 3-conjunct rule. KNW is **elevated / write-decision core** but carries
> **no** `formal` cluster — the whole Atlas's one machine-checked model is `FSPEC-merge` in the KRN block. The
> write-decision "infallible" core (**KNOW-4 / 10 / 15**, the S0 `PBT-exhaustive` triad) resolves here to
> **`exhaustive`** — a finite hash-state routing space enumerated for existence + uniqueness + mutual-exclusion
> (structural/routing shape, **not** formal). KNOW-15 _consumes_ the KRN OR-Set set-union reducer for its
> UPDATE/union leg but is **not** the formal model — the `formal` footprint stays **1** (KRN). Everything else
> is `reference-model` per the ratified baseline — a feature, not a compromise. All 18 KNW invariants are
> `behavioural` (register), so none carries `n/a`.

---

### INV-KNOW-1

method-tag: reference-model
fspec: —
up-property: "no self-declaration of truth: served status is a recomputed side-index (KNOW-3 structural drift + the KNOW-16 evaluator), never a value the fact asserts about itself — a candidate-declared `HOLDS` is ignored"
down-model: "reference status resolver recomputes `Status` from {grounding, drift, evaluator-verdict} and drops any `status` present on the input node; a unit asserts a node carrying `status:'HOLDS'` is served with the recomputed status, not the declared one"
anti-rot: `knowledge/ref/status.ts` (the side-index recomputer) is the mock in the gate unit tests; a code path that trusts a node-declared status diverges and breaks the build.

### INV-KNOW-2

method-tag: reference-model
fspec: —
up-property: "fail-closed admission: a fact with no resolvable grounding (0 entries, or any empty `subtreeHash`) is rejected — `emitted:false`, 0 persisted; admission is total (a structured rejection, never a throw)"
down-model: "reference `admit(node) = isGrounded(node) ? persist : {emitted:false}`, `isGrounded ⇔ ≥1 entry each with non-empty subtreeHash`; the golden generator is PBT-fuzz over ungrounded / partially-grounded nodes asserting 0 persisted"
anti-rot: `knowledge/ref/emit.ts` (the fail-closed admitter) is the mock in atlas-emit unit tests; an admit path that lets an ungrounded node through fails against it.

### INV-KNOW-3

method-tag: reference-model
fspec: —
up-property: "structural drift oracle: freshness is a function of the BLAKE3 `subtreeHash` of the cited unit alone — an import, or a BLANK-LINE-SEPARATED license/file header, added ABOVE the unit, and an unrelated rename elsewhere, stay `FRESH`; a real change `DRIFT`s, and so do a reformat OF the cited unit, a rename OF the cited symbol, and an edit to a comment CONTIGUOUS with the cited declaration (its bound doc-comment, ADR-0014); line numbers never enter identity or freshness"
down-model: "reference `freshness(fact,tree) = subtreeHash(anchoredUnit) == fact.grounding.subtreeHash ? FRESH : DRIFTED`, where `subtreeHash` is taken over the unit's RAW SOURCE SLICE — which INCLUDES the declaration's bound leading doc-comment, the maximal run of `comment` nodes contiguous with the decl (ADR-0014) — NFC-normalized only, and an unresolvable anchor key is `DRIFTED` (fail-closed); the oracle is a differential corpus {non-touching-edit ⇒ FRESH, in-unit-edit ∪ bound-doc-comment-edit ∪ cited-symbol-rename ⇒ DRIFTED}. Not exhaustive — the edit space is open, so a corpus/reference-model, not a finite enumeration."
anti-rot: shares the grounding subtreeHash oracle (`grounding/ref/subtree.ts`) as the mock; a line-range anchor drifts on an edit ABOVE the unit and fails the FRESH leg, and an oracle that erases in-unit bytes goes blind to a one-space change inside a template literal and fails the DRIFTED leg.

> **AMENDED 2026-08-02 (HONESTY-TAPROOT).** The up-property claimed "a reformat / **rename** / import-above
> … stays `FRESH`", and the down-model invoked `normalize(anchoredUnit)`. **There is no `normalize` step**
> (see the INV-GROUND-5 amendment in `method-tags-grd.md` — the reference normalizer was never built), and
> two of the three FRESH legs are not delivered. Measured through the real `foldAstUnits → build →
driftDetect` chain: import-above `FRESH`; **reformat of the cited unit `DRIFTED`**; **rename of the cited
> symbol `DRIFTED`, with the anchor key GONE** — the name is part of the key
> (`<parent>::<kind>:<ordinal>[:<name>]`), so a rename retires the anchor and the fact fails closed rather
> than re-binding. KNOW-3's rename leg is a strictly stronger claim than GROUND-5b's "unrelated rename
> elsewhere" and was never true; it is corrected here for the first time.
>
> **AMENDED 2026-08-09 (ADR-0014, owner-ratified same-landing as GROUND-5).** The `subtreeHash` preimage now
> includes a declaration's bound leading doc-comment (the contiguous `comment` run), so the "license header
> above ⇒ FRESH" leg is qualified by CONTIGUITY: a blank-line-separated header stays FRESH; a contiguous
> leading comment IS the decl's doc-comment and DRIFTS the unit. The reference oracle (`grounding/ref/`) and
> the shipped `foldAstUnits` slice move together — this up-property/down-model pair is the reference model the
> `adapter-io` goldens G-GAP2-1..8 verify.

### INV-KNOW-4

method-tag: exhaustive
fspec: —
up-property: "upsert-routing is total, deterministic, mutually-exclusive: every write resolves to exactly one of {DEDUP (identical ⇒ no-op), UPDATE (advisory claim **set-union** in place), SUPERSEDE (predicate same-`check` re-evidenced), CREATE (new node)}; a territory query returns exactly one current node per `(anchor, slot[, check])` — 0 duplicates"
down-model: "enumerate the finite routing product {contentHash∈(hit,miss) × family∈(advisory,predicate) × nodeKey∈(hit,miss) × check∈(same,diff)}; assert the route equals the decision-table cell + existence + uniqueness of one current node per key. The UPDATE/union leg reuses the KRN set-union reducer as oracle (consumed, not re-modeled)."
anti-rot: the reference upsert router (`knowledge/ref/router.ts`, shared with KNOW-15) is the mock in the emit unit tests; an append-instead-of-upsert or a duplicate-minting path diverges from the enumerated table.

### INV-KNOW-5

method-tag: reference-model
fspec: —
up-property: "drift bisection: the `DRIFTED` subset partitions exactly into **mechanical** (claim re-derives at the new `@sha` ⇒ auto-re-ground, no human, no block) and **semantic** (no longer re-derives ⇒ `BROKEN`, exit 2); human re-author count == `|semantic|`, never `|DRIFTED|`, never `N`"
down-model: "reference `reconcile(drifted[])` partitions by `reDerives(claim,newSha)`: `|mechanical|` auto-reground exit0, `|semantic|` BROKEN exit2, `reauthorCount==|semantic|`; a unit with `k` drifted / `s` non-re-deriving asserts the split counts"
anti-rot: `knowledge/ref/reconcile.ts` (the partitioner) is the mock in atlas-reconcile unit tests (shared with TOOLS-8); a path that blocks on mechanical drift or miscounts re-authors fails against it.

### INV-KNOW-6

method-tag: reference-model
fspec: —
up-property: "empty genesis: `atlas-init` output carries 0 invariants; 100% of territories ship the `T2/advisory` default by construction — nothing authored, nothing promoted"
down-model: "reference `init(tree)` emits territories with `tier=T2, family=advisory, invariants=[]`; a unit asserts `count(invariants)==0` and `∀ territory tier==T2` over arbitrary trees"
anti-rot: `knowledge/ref/init.ts` is the mock in atlas-init unit tests; an init that seeds any invariant or a non-T2 default fails the empty-genesis assertion.

### INV-KNOW-7

method-tag: reference-model
fspec: —
up-property: "no auto-promotion: a `T0`-keyword match yields `t0Candidate:true` **and** `tier=='T2'` (0 auto-promotes); heuristics may only _flag_ a candidate, never assign the tier"
down-model: "reference `classify(territory)` sets `t0Candidate` by keyword but always emits `tier='T2'`; a unit asserts `t0Candidate ⇒ tier=='T2'` over the keyword corpus"
anti-rot: `knowledge/ref/tier.ts` is the mock; a heuristic that writes `tier=T0` diverges and fails the no-auto-promote assertion.

### INV-KNOW-8

method-tag: reference-model
fspec: —
up-property: "propose/ratify separation: 0 explorer writes reach the committed store except through a reconcile-side ratifier (human for `T0` / contested / predicate; deterministic fast-path for grounded low-risk `T2` advisory); the explorer never self-commits, and `T0` requires billy"
runtime-note (A-D4, measured task #83; AMENDED by WP-PROMOTE): "the up-property HOLDS in the shipped runtime and NO LONGER holds vacuously. It did until the governed promotion door landed — 0 explorer writes reached the committed store by ANY route, because no promotion path out of staging existed. The runtime now implements the whole reference route `candidate → staging → ratifier`: `atlas mine` writes candidates durably via `commitStaging`, and `atlas promote` reads them back and presents each to the existing `atlas-emit` door, which derives `origin:'promoted'` so the KNOW-18 fast path does not apply and `ratify` really runs. Severance remains the guarantee for the EXPLORER (`atlas mine` names no projection door); ratification is the guarantee for the CURATOR."
down-model: "reference commit path routes `candidate → staging → ratifier`; the explorer surface can write only to staging; a unit asserts no staged candidate is committed without a ratifier token, and a `T0` candidate requires the billy token"
anti-rot: `knowledge/ref/ratify.ts` (the staging / ratifier gate) is the mock; an explorer path that writes straight to the store fails the no-self-commit assertion.

### INV-KNOW-9

method-tag: reference-model
fspec: —
up-property: "advisory-standalone operability: with no evaluator wired the store is fully operable on advisory nodes alone (emit / query / reconcile all succeed); the predicate family is present day-one, not deferred"
down-model: "reference store parametrized by `evaluator?=none`; a unit runs the full emit→query→reconcile cycle on advisory nodes with a null evaluator and asserts 100% success"
anti-rot: `knowledge/ref/store.ts` is the mock; a code path that hard-requires an evaluator to operate on advisory fails the standalone cycle. _(register flags "weak homing — confirm/exempt"; the row's `behavioural` column stands, so it carries a tag — flag surfaced for cold review, not force-exempted here.)_

### INV-KNOW-10

method-tag: exhaustive
fspec: —
up-property: "template-validation routing is total + mutually-exclusive: a fact missing a required template field, over its cap, or with a `predicateSlot` outside the closed 13-slot vocabulary is **REJECTED**; a well-formed fact is **PERSISTED**; 0 free-prose facts persist"
down-model: "enumerate the finite validity product {required-field∈(present,missing) × size∈(≤cap,>cap) × slot∈(in-vocab-13, out)}; assert the reject/persist route per cell, and that the closed slot set has exactly the 13 enumerated members (adding one is a `cv` bump)"
anti-rot: `knowledge/ref/template.ts` (the per-kind template + closed-slot validator) is the mock in the emit unit tests; a free-text-slot or missing-field path that persists diverges from the enumerated table.

### INV-KNOW-11 ⚠️ **AMENDED 2026-08-03 (owner-ratified)** — reverses the `owner` fence added by #178/PR#105; see req-knw.md#REQ-KNOW-11a for the measurement.

method-tag: reference-model
fspec: —
up-property: "scope-owned write, universal read: every fact carries `scope`; a write outside the actor's scope is rejected; a read of any scope succeeds for any caller (100%). Producer identity is carried by `ClaimProvenance.source` (KNOW-14), not by a separate `owner` field — `owner` is not part of this up-property and was never a gate input."
down-model: "reference `authz(op,actor,fact) = op==read ? allow : inScope(actor, fact.scope)`; a unit asserts out-of-scope write ⇒ reject and any read ⇒ allow. (Unchanged by the amendment — this down-model was always scope-only; #178/PR#105 folded an `owner` leg into `authz()` itself without updating this down-model, which is why it never drifted.)"
anti-rot: `knowledge/ref/authz.ts` is the mock; a write path that skips the scope check fails the out-of-scope rejection.

### INV-KNOW-12

method-tag: reference-model
fspec: —
up-property: "no history loss: supersede ⇒ prior version present in CAS and re-spawnable; 0 delete paths; prior versions are their own content-addressed CAS objects (deduped, never byte-copied); advisory edit keeps **no** lineage pointer (git is the archive), a predicate supersede adds **only** a `supersededBy` pointer"
down-model: "reference store where supersede mints a new CAS object + `supersededBy` link and never removes the old; a unit asserts `get(oldId)` resolves post-supersede, no API deletes, and dedup holds by content-address identity"
anti-rot: `knowledge/ref/archive.ts` (CAS retention + `supersededBy` pointer, reusing the KERNEL CAS ref) is the mock; a delete or byte-copy path fails the re-spawnable + dedup assertions.

### INV-KNOW-13

method-tag: reference-model
fspec: —
up-property: "born-from-work: facts are produced only at the three moments (init skeleton / enrich-by-blast-radius / wave-close write), never a repo-wide sweep; a sealing wave that neither fed the Atlas nor emitted a grounded why-not records a violation"
down-model: "reference producer accepts a production event only if tagged one of the 3 moments; the seal probe asserts `absorb ∨ why-not`; a unit asserts a repo-wide sweep produces 0 facts and a bare seal records a violation"
anti-rot: `knowledge/ref/produce.ts` (the moment-gated producer + seal probe) is the mock; a sweep path or an unrecorded bare-seal fails the probe.

### INV-KNOW-14

method-tag: reference-model
fspec: —
up-property: "provenance receipt: every persisted claim carries a `Provenance`; an untrusted-sourced claim is marked advisory **and** excluded from the gate (0 toward `HOLDS`)"
down-model: "reference `persist(claim)` requires `claim.provenance`; a unit asserts every stored claim has a receipt and `gate(claims)` filters `trusted==false` before the verdict"
anti-rot: `knowledge/ref/provenance.ts` is the mock in the gate unit tests; a claim persisted without a receipt, or an untrusted claim reaching the gate, fails against it.

### INV-KNOW-15

method-tag: exhaustive
fspec: —
up-property: "write-routing is a total, deterministic, mutually-exclusive **pure function of three orthogonal hashes** {contentHash, nodeKey, subtreeHash}: identical ⇒ DEDUP · nodeKey-miss ⇒ CREATE · advisory-hit ⇒ UPDATE/union · predicate-same-`check` ⇒ SUPERSEDE · predicate-different-`check` ⇒ CREATE (never sibling-retire); the anchor is **computed** (never LLM-chosen), the slot from the closed vocabulary, and **0 LLM calls** enter the decision"
down-model: "enumerate the finite hash-state product {contentHash∈(in-CAS,new) × nodeKey∈(miss, hit-advisory, hit-predicate-same-check, hit-predicate-diff-check) × subtreeHash∈(equal,changed)}; assert **existence + uniqueness + mutual-exclusion** of the route per cell, and that the drift leg (subtreeHash) never changes the create/update leg. The three hashes are taken as **oracle inputs**."
anti-rot: the reference write-decision router (`knowledge/ref/router.ts`, shared with KNOW-4) is the mock in the atlas-emit unit tests; a `seq`- / clock- / LLM-influenced route, or one that conflates the drift leg into create/update, diverges from the enumerated table and breaks the build.
note: the **move-aware `primaryAnchorId` matcher** (rename/move ⇒ same nodeKey) is an **OPEN DEFINE dependency** (register: "move-aware needs a similarity matcher"; S0 carry-forward reconciliation — subtreeHash equality catches move/rename but not move+edit). It lives **upstream** of the enumerated inputs — it fixes the _value_ of the `nodeKey` inputs, not the routing over them — so the `exhaustive` route-enumeration is **feasible now**. Verifying the matcher's precision is a **separate** reference-model/PBT obligation that **cannot be tagged until DEFINE pins the threshold θ**; no verification is invented for an unpinned threshold here. _(The old near-dup probe's `claimNorm`-collision threshold τ is RESOLVED, not DEFINE-open: per the frozen dedup/identity model — `docs/design/dedup-identity.md` — a collision is **reported** under exact NFC+trim equality (no fuzzy τ) and **never merges** at write time; structural near-dup is the derived-on-read `subsumes` relation.)_

### INV-KNOW-16

method-tag: reference-model
fspec: —
up-property: "pure deterministic evaluator: a `PredicateNode.check` evaluates to `HOLDS/BROKEN/NA` from Atlas-index state **alone** (same index ⇒ same verdict; no clock / IO; no code-exec; no sandbox); a check needing runtime/behavioral execution is refused and the fact stays advisory; the verdict feeds `atlas-reconcile`"
down-model: "the synthesized check evaluator — a pure index-query interpreter — **is itself the reference oracle** (conformance against the synthesized check); conformance asserts determinism (repeat ⇒ identical verdict), purity (no IO/clock capability wired), and that a runtime-requiring check is rejected to advisory"
anti-rot: `knowledge/ref/evaluator.ts` (the pure index-query interpreter) is the mock; an evaluator path that shells out, reads a clock, or admits a runtime check diverges from the pure oracle and breaks the build.

### INV-KNOW-17

method-tag: reference-model
fspec: —
up-property: "usefulness-by-consumption: a served fact governing a decision accrues a logged `hit` (node-id cited); a served fact with 0 hits across the decay window **decays** out of the served/pack set (archived to CAS, never deleted — KNOW-12) and MAY re-enter on a later hit; door-2's threshold is a function of observed hits, never the proposer's self-score"
down-model: "reference hit-ledger + decay: decays a fact iff `hits-in-window==0`, archives to CAS, re-admits on a later hit; a unit asserts `0-hit ⇒ archived ∧ re-spawnable` and `threshold==f(hits)`"
anti-rot: `knowledge/ref/hits.ts` (the hit-ledger + decay) is the mock (spans the KNOW-17 ↔ MEM-7 substrate seam, DP-9); a delete-on-decay or a self-score threshold diverges from it.

### INV-KNOW-18

method-tag: reference-model
fspec: —
up-property: "risk-bounded ratification: a candidate that is grounded ∧ low-risk ∧ `T2` advisory **auto-accepts** (fast-path, no human); a `T0`, **contested** (reviewer veto / conflicting node), or **any predicate** candidate routes to full human ratification; fast-path over-admission is backstopped by KNOW-17 decay"
down-model: "reference `route(candidate) = (grounded ∧ lowRisk ∧ T2 ∧ advisory) ? auto-accept : full-ratify`; a unit asserts the predicate / T0 / contested cases all route to full-ratify and only the fast-path cell auto-accepts"
anti-rot: `knowledge/ref/fastpath.ts` (the routing predicate) is the mock (shares the KNOW-8 ratifier gate); a path that auto-accepts a predicate or `T0` candidate fails the routing assertion.

---

## Refuse-to-model

- **performance / OR-Set + pack growth, decay footprint**: bounded by decay (KNOW-17); covered by load tests, no correctness oracle to model.
- **the code itself**: conformance-tested (sampled) against the reference models — "success = we could not find a bug"; a verified design is not a verified impl. Confidence is bought with scale + coverage, not a proof claim.
- **the KNOW-15 move-aware similarity matcher precision (threshold θ)**: an **OPEN DEFINE reconciliation** (unpinned threshold; subtreeHash equality misses move+edit). We verify the routing over the three hashes as oracle inputs, **not** the upstream matcher that computes the nodeKey inputs — no verification is invented for an unpinned threshold. _(The old near-dup `claimNorm` threshold τ is no longer a residue: per `docs/design/dedup-identity.md` a collision is reported under exact NFC+trim equality — no fuzzy τ — and never merges at write time; structural near-dup is the derived-on-read `subsumes` relation.)_
- **the LLM's claim-body proposal quality**: the LLM proposes only the claim body (+ slot, + check?); its semantic merit is out of scope — the write-decision is verified to be **LLM-free** (KNOW-15j), the LLM's output is not judged.
- **git as the advisory archive (KNOW-4/12)**: advisory prior-version recovery is delegated to git history — a black box we do not model; we model only CAS retention + the `supersededBy` pointer for the predicate side.
- **BLAKE3 collision-resistance**: the `subtreeHash` / `contentHash` primitive is a trusted, assumed primitive (inherited from KERNEL-1) — not modeled.
- **concurrent + crashing executions simultaneously**: merge-time reconcile concurrency and process-crash / durability are checked **separately**, never in one model (ShardStore rule).

## FSPEC-merge

**None in this block.** The Atlas's one `formal` cluster is `FSPEC-merge` in the **KRN** block
(`method-tags-krn.md`; KERNEL-9/10/11 + PERSIST-11). KNOW-15/KNOW-4's UPDATE/union leg **consumes** that
cluster's OR-Set set-union reducer as its reference oracle (register: "consumes the FSPEC-merge core; not
itself the formal model — footprint stays 1") but is tagged `exhaustive`, not `formal` — the finite hash-state
routing is a structural/routing shape, not a convergence-model shape.

## Completion report

- tagged-register: `docs/requirements/method-tags-knw.md`
- tag histogram: **formal 0** · **exhaustive 3** (KNOW-4 / 10 / 15) · **PBT 0** · **reference-model 15** (KNOW-1/2/3/5/6/7/8/9/11/12/13/14/16/17/18)
- FSPEC-merge: none in KNW (the one formal cluster is KRN's; KNOW-15/4 consume it)
- refusal count: **7**
- every KNOW-1..18 tagged: **yes** (18/18; all behavioural, 0 `n/a`)
- shape-no-fit flags: none (KNOW-9 weak-homing flag surfaced for cold review, tag retained per its `behavioural` row)
- → next_state **S3** (goldens).
