# Properties — Block GRD (grounding) · S3-sibling render (∀-laws for FULL-assurance PBT)

> **state:** S3-sibling · **protocol:** [`properties-template`](../method/properties-template.md) ·
> **source:** [`method-tags-grd.md`](method-tags-grd.md) (frozen S2; each `### INV-GROUND-<n>` carries the
> `up-property` law this file renders) · **owner:** charlie (FORGE).
>
> **Purpose:** render every behavioural GROUND invariant's frozen `up-property` into a runnable ∀-quantified
> property — the oracle-free, beyond-the-witness check that raises a WP from FLOOR toward FULL. **Invents no
> law:** each `law` is a faithful ∀-render of the frozen `up-property`, carried as a `# ptr+digest` so an
> upstream edit renders the property STALE (same driftless discipline as goldens + WP-cards).
>
> **Honest reconciliation (per the template §"Why this exists"):** the S2 `down-model` names
> `grounding/ref/*.ts` as the differential reference, but the scaffold-freeze froze those as **pure-type
> interfaces (zero runtime)** — no executable reference to differentially test against. Each `up-property` is
> therefore asserted **directly on the implementation over generated inputs** (PBT), the recognized oracle-free
> substitute for differential testing. The GATE's `differential` leg stays UNAVAILABLE (no reference impl) and
> is **subsumed** by this PBT leg — not faked.
>
> **No FSPEC in GRD** — the Atlas's one formal cluster is `FSPEC-merge` (Block KRN); no GROUND law is
> transcribed from `fspec-merge.md`. GROUND-4's contingent-P escalation was **REFUSED** (the gate is pure +
> total, not async — `method-tags-grd.md` header). **13/13 behavioural INVs, one PROP each.**
>
> **DEFINE-parametric residues (2, carried not fabricated):** GROUND-4's `HOLDS→NA` downgrade **threshold**
> `Θ_A1` (spec A-1) and GROUND-9's missing-field / over-cap rule `(F, κ)` (spec A-13) are both
> `[NEEDS RECONCILIATION]` in `req-grd.md`. The four/one core laws render fully (the reference automaton /
> validator already encodes the downgrade / reject); only the exact `Θ_A1` / `(F, κ)` **boundary** value is
> deferred, flagged inline and left symbolic — never a fabricated concrete value.

---

### PROP-GROUND-1 — structural-anchor oracle

inv: INV-GROUND-1
source: method-tags-grd.md#INV-GROUND-1 # ptr+digest — the frozen up-property law
law: ∀ entry E ∈ StructRef. resolveAnchor(E) ≡ E.anchor.subtreeHash
∧ ∀ edit δ touching only E.displayLines. driftDetect(E after δ) ≡ driftDetect(E before δ) (a displayLines-only change ⇒ 0 drift)
∧ E.anchor.subtreeHash absent (line-range only) ⇒ reject(E) as an invalid anchor
∧ ∀ edit δ touching only E.span (add / remove / corrupt). driftDetect(E after δ) ≡ driftDetect(E before δ) (SPAN amendment, 2026-08-02)
∧ ∀ bytes B, ∀ legal range [s,e). readSpan(mintSpan(B,s,e), B) ≡ B[s,e) ∧ ∀ B' ≠ B. readSpan(mintSpan(B,s,e), B') ≡ ⊥ (re-derives, never stores)
arbitrary: StructRef entries {random subtreeHash, random displayLines, random span, source}; a displayLines-only mutation class (line-shift, range-widen); a span-only mutation class (absent / valid / corrupt); a subtreeHash mutation class; line-range-only anchors (no subtreeHash); byte buffers with a swept range family and a same-length edited twin
covers_reqs: [ req-grd.md#REQ-GROUND-1a, req-grd.md#REQ-GROUND-1b, req-grd.md#REQ-GROUND-1c, req-grd.md#REQ-GROUND-1d, req-grd.md#REQ-GROUND-1e, req-grd.md#REQ-GROUND-1f ] # ptr+digest
witness: [ SCN-GROUND-1a-1, SCN-GROUND-1b-1, SCN-GROUND-1c-1, SCN-GROUND-1d-1, SCN-GROUND-1e-1, SCN-GROUND-1f-1 ] # goldens-grd.md
teeth: breaks-on "the oracle is mutated to fold displayLines — the single witness is one line-shift, but the property flips DRIFTED across the whole displayLines-only mutation class"
∧ breaks-on "the span is stored as TEXT rather than addressed — the `B' ≠ B ⇒ ⊥` leg then returns a stale quote instead of refusing, across the whole edited-twin class"

> **AMENDED 2026-08-02 (owner-approved SPAN amendment).** The two new conjuncts are ADDITIVE renders of the `span` clauses added to `method-tags-grd.md#INV-GROUND-1`; no new INV was minted, so the header's 13/13 count is unchanged. **What this property does NOT cover, stated:** the span's STORED form. `grounding` is excluded from the canonical preimage (KERNEL-8), so a span rewritten in the store is invisible to every shipped read door — measured, and recorded on `req-grd.md#REQ-GROUND-1f`. This law is about the span↔bytes relation, not about the durability of the span itself.

<!-- Reviewed under the 2026-08-02 AMENDED wave (HONESTY-TAPROOT) and UNAFFECTED: this law is about displayLines exclusion and line-range-only rejection, both delivered. Only SCN-GROUND-1a-1's witness EDIT changed (whitespace reformat → import-above); the law did not. The stale "/ the raw byte-hash" fragment is dropped, because the oracle IS a byte-hash of the unit's raw slice — that is the design, not a mutant. -->

### PROP-GROUND-2 — real-grounding predicate

inv: INV-GROUND-2
source: method-tags-grd.md#INV-GROUND-2 # ptr+digest
law: ∀ grounding g. isGrounded(g) ≡ ( |g.entries| ≥ 1 ∧ ∀ e ∈ g.entries. e.anchor.subtreeHash ≠ "" )
∧ ¬isGrounded(g) ⇒ driftDetect(g) ≠ FRESH (an ungrounded grounding is never FRESH)
arbitrary: groundings with 0..n entries, each entry's subtreeHash drawn from {"", non-empty}; biased to the boundary (exactly-one-empty, all-empty, empty-set)
covers_reqs: [ req-grd.md#REQ-GROUND-2a, req-grd.md#REQ-GROUND-2b ] # ptr+digest
witness: [ SCN-GROUND-2a-1, SCN-GROUND-2b-1 ]
teeth: breaks-on "the `every` conjunct is weakened to `some` (AND→OR) — the property finds a partial grounding (≥1 empty, ≥1 non-empty) that the mutant calls real for every mix, not just the one `g_partial` witness"

### PROP-GROUND-3 — fail-closed, total resolution

inv: INV-GROUND-3
source: method-tags-grd.md#INV-GROUND-3 # ptr+digest
law: ∀ citation c (arbitrary / malformed / absent). c unresolvable ⇒ ground(S ∪ {c}) ≡ ∅ (the WHOLE fact grounds to nothing — c is never retained, and the survivors S never stand in for it) <!-- AMENDED 2026-08-02 (HONESTY-TAPROOT): was "c ∉ ground(S ∪ {c}) (dropped, never retained)", which is satisfied by returning S alone — fail-OPEN per fact. -->
∧ driftDetect(grounding-with-unresolvable) ≡ DRIFTED (fail-closed, never FRESH)
∧ ¬throws(ground(c)) ∧ ¬throws(driftDetect(c)) (total — 0 exceptions)
arbitrary: corner-biased fuzz stream of citations — arbitrary strings, malformed StructRefs, deleted units, absent paths, empty/nested; both entry points invoked on each
covers_reqs: [ req-grd.md#REQ-GROUND-3a, req-grd.md#REQ-GROUND-3b, req-grd.md#REQ-GROUND-3c ] # ptr+digest
witness: [ SCN-GROUND-3a-1, SCN-GROUND-3b-1, SCN-GROUND-3c-1 ]
teeth: breaks-on "an absent-path citation raises instead of collapsing the fact, or a gone unit reads FRESH — the property drives the whole fuzz corpus; a single hand golden cannot exhibit the one malformed input that throws" · breaks-on "the drop is per-ENTRY — a multi-citation fact losing one citation returns the survivors as a real, FRESH grounding"

### PROP-GROUND-4 — truth-gate monotone downgrade

inv: INV-GROUND-4
source: method-tags-grd.md#INV-GROUND-4 # ptr+digest
law: ∀ input x = (status, grounding, src). let out = gateHolds(status, grounding, src).
(a) out = HOLDS ⟺ ( status = HOLDS ∧ grounded(grounding) ∧ freshness(grounding) = FRESH )
(b) out ≤ status on the HOLDS→NA order (downgrade-only; never upgrades)
(c) gateHolds(out, grounding, src) ≡ out (idempotent — re-gating is a no-op)
(d) status ≠ HOLDS ⇒ out = status (non-HOLDS pass-through)
[NEEDS RECONCILIATION: the exact HOLDS→NA downgrade boundary Θ_A1 (spec A-1) is symbolic — law (a)'s `¬(grounded∧FRESH) ⇒ NA` renders the downgrade the reference automaton already encodes; only the verifiable A-1 threshold REQ / concrete value is deferred (see SCN-GROUND-4-3, gen: residue). Not a fabricated value.]
arbitrary: sample the product Status × grounded:bool × Freshness × source; bias the HOLDS×grounded×{FRESH,DRIFTED} boundary and re-gate compositions gateHolds∘gateHolds
covers_reqs: [ req-grd.md#REQ-GROUND-4 ] # ptr+digest
witness: [ SCN-GROUND-4-1, SCN-GROUND-4-2, SCN-GROUND-4-3 ] # 4-3 = DEFINE-parametric on Θ_A1
teeth: breaks-on "the gate upgrades on re-gate (a downgraded NA laundered back to HOLDS), or is FRESH-blind (gates on grounded alone) — the property tests every (status,grounded,freshness) cell + every re-gate pair, killing the non-monotone / FRESH-blind mutant the two witnesses only sample"

### PROP-GROUND-5 — non-touching-edit classification

inv: INV-GROUND-5
source: method-tags-grd.md#INV-GROUND-5 # ptr+digest
law: ∀ fact F on cited unit U, ∀ edit δ. driftDetect(F after δ) = FRESH ⟺ subtree(U) after δ = subtree(U) before δ (byte-identical raw source slice, NFC only) ∧ U's anchor key still resolves
i.e. an edit that does NOT TOUCH U (import / blank-line-separated license header added above it, unrelated rename elsewhere) ⇒ FRESH; a real change to U ⇒ DRIFTED; a reformat OF U, or an edit to a comment CONTIGUOUS with U's declaration (its bound doc-comment, ADR-0014), ⇒ DRIFTED (an accepted false alarm / a real drift respectively, NOT 0 false drift)
arbitrary: two edit classes over U — a NON-TOUCHING class {import added above, blank-line-separated license/file header added above, unrelated rename elsewhere, unrelated file added/edited} (U's own bytes and key invariant) and a TOUCHING class {returned-constant / body / signature edits, whitespace reformat of U, comment reindent inside U, rename of U itself, edit to a CONTIGUOUS leading comment/header above U's declaration (its bound doc-comment)} <!-- ADR-0014: classification is by CONTIGUITY, not file position — a contiguous leading comment is documentation and moves from the NON-TOUCHING to the TOUCHING class; the LAW above is unchanged (FRESH ⟺ byte-identical raw slice), only this arbitrary's partition of a contiguous header moves -->
covers_reqs: [ req-grd.md#REQ-GROUND-5a, req-grd.md#REQ-GROUND-5b ] # ptr+digest
witness: [ SCN-GROUND-5a-1, SCN-GROUND-5b-1 ]
teeth: breaks-on "the oracle folds U's line-range — the property exercises the whole non-touching class, catching the leak on inputs the two-edit witness never enumerates" · breaks-on "a normalizer lands and erases in-unit formatting — the TOUCHING class then reads FRESH on a reformat, and with it on a one-space change inside a template literal, where the erased whitespace is SEMANTIC"

> **AMENDED 2026-08-02 (HONESTY-TAPROOT).** The law was stated over `normalize(subtree(U))`, and the
> arbitrary put "whitespace reformat, comment edit, param-name / De-Bruijn / lifetime noise" in the
> ⇒FRESH class as "all normalize-invariant". **The normalizer does not exist** (see the INV-GROUND-5
> amendment in `method-tags-grd.md`), so none of those are normalize-invariant — every one of them moves the
> hash and reads `DRIFTED`. The generator is therefore re-partitioned by the real predicate: does the edit
> touch the cited unit's own bytes or its key? A PBT run over the old arbitrary would have failed on its
> first reformat sample, which is why the property was only ever witnessed by hand-held fixtures.

### PROP-GROUND-6 — fail-closed write at emit

inv: INV-GROUND-6
source: method-tags-grd.md#INV-GROUND-6 # ptr+digest
law: ∀ fact f. ¬isGrounded(f.grounding) ⇒ admit(f) = false (⇒ 0 bytes persisted — an ungrounded fact never enters at emit)
arbitrary: facts whose grounding ranges over the GROUND-2 predicate space {empty-set, partial (≥1 empty subtreeHash), fully-grounded}
covers_reqs: [ req-grd.md#REQ-GROUND-6 ] # ptr+digest
witness: [ SCN-GROUND-6-1 ]
teeth: breaks-on "admit returns true when isGrounded is false — the property covers every ungrounded shape (empty / partial), not just the one `g_partial` witness; a mutant that leaks only the empty-set case is caught"

### PROP-GROUND-7 — admission (truth ∧ ¬harmful), obviousness scored

inv: INV-GROUND-7
amendment: **AMENDED + RE-RATIFIED 2026-08-02** (owner) — [ADR-0012](../adr/ADR-0012-obviousness-is-scored-never-gated.md): obviousness is SCORED, never gated; the rejection line moves to harm (secret / PII).
source: method-tags-grd.md#INV-GROUND-7 # ptr+digest
law: ∀ fact f (truth-door outcome + labelled harmful/obvious inputs). admit(f) ≡ truthDoor(f) ∧ ¬harmfulToStore(f), truthDoor(f) := (gateHolds(...) = HOLDS)
⇒ f is admitted iff the truth door passes AND storing f is not itself the harm; failing either alone blocks admission
∧ ∀ fact f. admit(f) ⊥ obvious(f) [ADR-0012 — obviousness is stored as a SCORE, never a veto; a true-but-obvious fact is admitted with a low score]
(non-obvious is a labelled fixture input, refused-to-model — only the admission **wiring** + truth door are asserted)
arbitrary: facts over {truthDoor: pass/fail} × {harmfulToStore: yes/no} × {obvious labelled: yes/no} — all eight cells, biased to the (truth-pass ∧ not-harmful ∧ obvious) true-but-obvious cell, which MUST admit
covers_reqs: [ req-grd.md#REQ-GROUND-7a, req-grd.md#REQ-GROUND-7b, req-grd.md#REQ-GROUND-7c ] # ptr+digest
witness: [ SCN-GROUND-7a-1, SCN-GROUND-7b-1, SCN-GROUND-7c-1 ]
teeth: breaks-on "the wiring is OR (truthDoor ∨ harm door), a dropped truth door, or a **resurrected obviousness veto** (the obvious axis moves `admit`) — the property enumerates all eight cells, so the veto is killed on the exact cell (truth-pass, not-harmful, obvious) that must admit"

### PROP-GROUND-8 — provenance filter

inv: INV-GROUND-8
source: method-tags-grd.md#INV-GROUND-8 # ptr+digest
law: ∀ candidate set C. gateHolds is evaluated over C.filter(c ⇒ c.source ≠ 'untrusted')
∧ ∀ c ∈ C with c.source = 'untrusted'. c ∉ gateInputs(C) ∧ gateHolds cannot yield HOLDS from c (untrusted is advisory, never HOLDS — even when grounded ∧ FRESH)
arbitrary: candidate sets mixing {trusted, untrusted} sources across the full Status × grounded × Freshness space, including untrusted candidates that are grounded ∧ FRESH in every other respect
covers_reqs: [ req-grd.md#REQ-GROUND-8 ] # ptr+digest
witness: [ SCN-GROUND-8-1 ]
teeth: breaks-on "the provenance filter is dropped — the property covers every untrusted-but-otherwise-HOLDS candidate; a mutant that lets untrusted through reaches gateHolds and yields HOLDS on inputs the one `c_untr` witness cannot span"

### PROP-GROUND-9 — templated write (robustness)

inv: INV-GROUND-9
source: method-tags-grd.md#INV-GROUND-9 # ptr+digest
law: ∀ fact f. ¬validateTemplate(f) ⇒ f rejected at emit (⇒ 0 bytes persisted)
where validateTemplate(f) ≡ ( f is the fixed template shape (not free-prose) ∧ f carries required field-set F ∧ f within cap κ )
⇒ no free-prose fact persists
[NEEDS RECONCILIATION: the concrete required field-set F and cap κ (spec A-13) are symbolic — the free-prose reject renders fully (the GROUND-9 clause); the reference validator already encodes the missing-field / over-cap reject, only the verifiable A-13 guard REQ / concrete (F, κ) is deferred (see SCN-GROUND-9-2, gen: residue). Not fabricated.]
arbitrary: malformed / oversized / free-prose facts (raw prose strings, missing a field f∈F, exceeding κ) vs well-formed template facts
covers_reqs: [ req-grd.md#REQ-GROUND-9 ] # ptr+digest
witness: [ SCN-GROUND-9-1, SCN-GROUND-9-2 ] # 9-2 = DEFINE-parametric on (F, κ)
teeth: breaks-on "the validator is free-prose-tolerant (or drops a required field / raises the cap) — the property fuzzes the malformed/oversized/free-prose class, persisting a raw fact the single free-prose witness does not enumerate"

### PROP-GROUND-10 — hash via the encoder seam

inv: INV-GROUND-10
source: method-tags-grd.md#INV-GROUND-10 # ptr+digest
law: ∀ fixture corpus X. run the anchor builder under two @orchestra/kernel Encoder seams e ∈ {blake3, stub}.
∀ subtreeHash s produced in the run. s follows the swapped seam e (the two runs differ ONLY in digest bytes ⇒ 0 values diverge from the seam)
∧ 0 off-seam hash call sites (no direct blake3/sha256 import or call outside the seam) (the digest stays swappable)
arbitrary: the shared fixture corpus (structural nodes) × two encoder seams (blake3, a stub digest); + the static grep of Acceptance §8 over the grounding module graph
covers_reqs: [ req-grd.md#REQ-GROUND-10a, req-grd.md#REQ-GROUND-10b ] # ptr+digest
witness: [ SCN-GROUND-10a-1, SCN-GROUND-10b-1 ]
teeth: breaks-on "an anchor path inlines its own blake3(...) — the inlined value does not follow the swapped stub, so the substitution run diverges on some fixture the single witness may miss; the static arm kills a call site the substitution run cannot reach"

### PROP-GROUND-11 — interface-fold drift monotonicity

inv: INV-GROUND-11
source: method-tags-grd.md#INV-GROUND-11 # ptr+digest
law: ∀ fact f. freshness(f) = FRESH ⟺ ( ownSubtreeHash(f) unchanged ∧ ∀ callee ∈ closure(f). interfaceRState(callee) unchanged )
(a) determinism — freshness(f) is a pure function of (ownSubtreeHash, {interfaceRState(callee)})
(b) ∀ callee. interfaceRState(callee) changed ⇒ f DRIFTED (signature/contract change drifts every caller; no false-negative)
(c) ∀ callee. body changed ∧ interfaceRState unchanged ⇒ the callee's full-body subtreeHash is NOT folded ⇒ f FRESH (no over-approximation)
(d) closure(f) = ∅ ⇒ freshness folds ownSubtreeHash alone (empty-closure invariance)
(e) freshness(f) is the structural predicate FRESH — never the truth claim "the claim is true" (FRESH ≠ true)
arbitrary: facts over ownSubtreeHash {changed, unchanged} × forward-closures of callees each with interfaceRState {changed, unchanged} × full-body {changed, unchanged} × the empty closure; + a FRESH-but-world-false fact for law (e)
covers_reqs: [ req-grd.md#REQ-GROUND-11a, req-grd.md#REQ-GROUND-11b, req-grd.md#REQ-GROUND-11c, req-grd.md#REQ-GROUND-11d, req-grd.md#REQ-GROUND-11e, req-grd.md#REQ-GROUND-11f ] # ptr+digest
witness: [ SCN-GROUND-11a-1, SCN-GROUND-11b-1, SCN-GROUND-11c-1, SCN-GROUND-11d-1, SCN-GROUND-11e-1, SCN-GROUND-11f-1 ]
teeth: breaks-on "a fold that folds the callee's FULL body over-drifts on the body-only refactor class (fails (c)); one that ignores the closure under-drifts on the signature-change class (fails (b)); one that types freshness as a truth value asserts the FRESH-but-false fact true (fails (e)) — the property spans all interface/body/closure combinations the six witnesses only sample"

### PROP-GROUND-12 — repo-global block-anchor

inv: INV-GROUND-12
source: method-tags-grd.md#INV-GROUND-12 # ptr+digest
law: ∀ rule r grounded to policy artifact P.
P parseable ⇒ resolveAnchor(r) = the relevant section-block subtreeHash (NOT the whole-file byte-hash) ∧ isGrounded(r) = true
∧ ∀ edit δ to P. driftDetect(r after δ) = DRIFTED ⟺ δ touches r's anchored section block (edit-section ⇒ DRIFTED; unrelated-section edit ⇒ FRESH)
P non-parseable ⇒ resolveAnchor(r) = the whole-file byte-hash (reserved case)
r with no artifact anchor ⇒ reject(r) fail-closed (anchorless)
arbitrary: rules × parseable multi-section policy artifacts (≥2 heading blocks) × non-parseable files × anchorless rules; edit classes {edit-anchored-section, edit-other-section}
covers_reqs: [ req-grd.md#REQ-GROUND-12a, req-grd.md#REQ-GROUND-12b, req-grd.md#REQ-GROUND-12c, req-grd.md#REQ-GROUND-12d, req-grd.md#REQ-GROUND-12e ] # ptr+digest
witness: [ SCN-GROUND-12a-1, SCN-GROUND-12b-1, SCN-GROUND-12c-1, SCN-GROUND-12d-1, SCN-GROUND-12e-1 ]
teeth: breaks-on "the resolver keys a parseable artifact on its whole-file byte-hash — the property runs every multi-section artifact under the edit-other-section class, catching the byte-fragility (an unrelated edit drifts every rule) that the single POLICY.md witness only samples once"

### PROP-GROUND-13 — advisory drift is non-blocking

inv: INV-GROUND-13
source: method-tags-grd.md#INV-GROUND-13 # ptr+digest
law: ∀ fact f whose grounding drifts.
f.kind = 'advisory' (no `check`) ⇒ route(f) = STALE ∧ f.anchor unchanged (never silently re-grounded) ∧ f not routed into either arm of the KNOW-5 split ∧ blocksMerge(f) = false
f.kind = 'predicate' (carries a re-runnable `check`) ⇒ route(f) = delegate(KNOW-5 mechanical/semantic split)
arbitrary: drifted facts over kind {advisory, predicate}; advisory variants exercising each conjunct (STALE-not-DRIFTED, anchor-preservation under a moved unit, arm-non-routing, merge-non-blocking)
covers_reqs: [ req-grd.md#REQ-GROUND-13a, req-grd.md#REQ-GROUND-13b, req-grd.md#REQ-GROUND-13c, req-grd.md#REQ-GROUND-13d, req-grd.md#REQ-GROUND-13e ] # ptr+digest
witness: [ SCN-GROUND-13a-1, SCN-GROUND-13b-1, SCN-GROUND-13c-1, SCN-GROUND-13d-1, SCN-GROUND-13e-1 ]
teeth: breaks-on "advisory drift resolves to DRIFTED (hard verdict) / silently re-grounds / is forced into a KNOW-5 arm / sets blocksMerge=true — the property checks all four advisory conjuncts across drifted advisory facts, killing each mutant the five single-conjunct witnesses only sample once"

---

## Completeness (set-level gate)

- **behavioural INVs → PROP:** 13/13 — GROUND-1..13 each render to exactly one PROP (0 uncovered, 0 invented-without-INV).
- **`gen: PBT` / property-flavored goldens subsumed:** all 8 PBT witnesses (SCN-GROUND-4-1/4-2, 11a/11b/11c/11d/11e/11f) instance PROP-GROUND-4 / PROP-GROUND-11; the two `gen: residue` DEFINE-parametric goldens (4-3 Θ_A1, 9-2 (F,κ)) are carried as flagged `[NEEDS RECONCILIATION]` witnesses, symbolic not fabricated.
- **formal-cluster laws transcribed verbatim from fspec-merge.md:** none — GRD owns no FSPEC (the Atlas's one formal cluster is `FSPEC-merge`, Block KRN).
- **every PROP `source`** resolves to a real `### INV-GROUND-<n>` anchor in `method-tags-grd.md` (`# ptr+digest`, tooling-filled at freeze).
- **witness coverage:** all 38 GRD goldens (SCN-GROUND-1a-1 .. 13e-1) are witness-linked across the 13 PROPs; no PROP contradicts its witness (truth / obviousness are labelled fixture inputs, never computed — refused-to-model).
