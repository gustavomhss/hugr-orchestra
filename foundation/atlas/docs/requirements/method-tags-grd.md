# Method-tags — Block GRD (grounding) · S2 formal-decision

> **state:** S2 · **protocol:** [`formal-decision`](../../.claude/skills/formal-decision/SKILL.md) ·
> **axiom:** S1 frozen (`req-grd.md`; every behavioural INV has ≥1 REQ, atom-gate passed) ·
> **owner:** charlie (FORGE).
>
> One tag per **behavioural** INV by the 3-conjunct rule. **No `formal` tag lives here** — the one formal
> cluster in the whole Atlas is `FSPEC-merge` (Block KRN); every GRD invariant fails conjunct #2 (no
> combinatorial concurrency/crash state that human review + example tests cannot cover — grounding is a set of
> **pure, total** functions: `ground / driftDetect / isGrounded / gateHolds / admit` are contract-bound to have
> no clock, no IO, no global state, no throw). All 13 GRD invariants are `behavioural` (register), so none
> carries `n/a`. The baseline is `reference-model`, with **two** `PBT` tags for the two genuine
> property/ordering shapes (GROUND-4 truth-gate, GROUND-11 interface-fold).
>
> **Contingent-P decision (recorded): REFUSED.** GROUND-4's baseline is `PBT` with a _contingent_ escalation to
> the **P** language iff S2 proves the truth-gate genuinely async/interacting. It is **not**: `gateHolds` is
> contract-bound pure + total (Surface/API: "no clock, no IO, no global state, no throw-for-logic"; it only ever
> downgrades `HOLDS→NA`). No async, no interleaving ⇒ **no `FSPEC`, no P** — a reference automaton + PBT is the
> right-sized tool. Recording the refusal is part of the method.

---

### INV-GROUND-1

method-tag: reference-model
fspec: —
up-property: "structural-anchor oracle: a grounding entry's drift oracle is its `subtreeHash` alone; `displayLines` never participates in drift (a `displayLines`-only change ⇒ 0 drift); a line-range-only anchor is rejected as invalid; an entry's OPTIONAL `span` — a `contentHash` + byte range, never a copy of the cited text — is likewise inert in drift, and absent means UNKNOWN, never a defaulted whole-unit citation"
down-model: "the reference anchor resolver `resolveAnchor(entry)=entry.anchor.subtreeHash` ignores `displayLines` and `span`; a `StructRef` lacking a `subtreeHash` (line-range only, or span-only) is rejected; the mock asserts drift keys off `subtreeHash` and is invariant to `displayLines`/`span` edits; the span reference verbs are mint-from-bytes / read-only-if-the-bytes-still-hash-to-`contentHash` (`grounding/src/span.ts`), both total and fail-closed"
anti-rot: `grounding/ref/anchor.ts` (the reference `StructRef`/`subtreeHash` resolver) is imported as the mock in the drift unit tests; any code path that reads `displayLines`, a line-range or a `span` as the oracle diverges from it and breaks the build.

<!-- Reviewed under the 2026-08-02 AMENDED wave (HONESTY-TAPROOT) and UNAFFECTED: this INV is about displayLines exclusion and line-range rejection, both delivered. Only SCN-GROUND-1a-1's witness EDIT changed (whitespace reformat → import-above). -->
<!-- AMENDED 2026-08-02 (owner-approved SPAN amendment): the `span` clauses above are ADDITIVE — REQ-GROUND-1d/1e/1f. The INV is unchanged in kind (it is still "what may be the anchor/oracle"); no new invariant was minted, so the 13/13 behavioural count in properties-grd.md still holds. The limit that does NOT hold: a stored `span` sits in `grounding`, which KERNEL-8 excludes from the canonical preimage, so tampering it is invisible to every shipped read door — MEASURED, and recorded on REQ-GROUND-1f. -->

### INV-GROUND-2

method-tag: reference-model
fspec: —
up-property: "real-grounding predicate: `isGrounded(g)` is true iff `g` has ≥1 entry AND every entry carries a non-empty `subtreeHash`; an ungrounded grounding is never FRESH (0)"
down-model: "`isGrounded(g)=g.entries.length≥1 && g.entries.every(e=>e.anchor.subtreeHash!=='')`; the reference `driftDetect` returns `DRIFTED` (never `FRESH`) whenever `isGrounded` is false; the mock asserts empty/partial groundings fail the predicate and never surface FRESH"
anti-rot: `grounding/ref/ground.ts` (the reference `isGrounded`) is the mock; an emptiness-tolerant or FRESH-on-ungrounded code path fails the shared predicate test.

### INV-GROUND-3

method-tag: reference-model
fspec: —
up-property: "fail-closed resolution (robustness/totality): a citation that is unresolvable (unit gone, path absent) makes the WHOLE fact ground to nothing in `ground()` and read `DRIFTED` in `driftDetect()`, and resolution never throws (0 exceptions)"
down-model: "the reference `ground` is total by construction — ANY unresolvable entry collapses the fact to an EMPTY grounding (never throws; the surviving entries are NOT handed back), and `driftDetect` maps that empty set to `DRIFTED`; the golden generator is PBT-fuzz over arbitrary/absent citations asserting empty-grounding + DRIFTED + no-throw"
anti-rot: `grounding/ref/ground.ts` (total, fail-closed-at-the-fact) is the mock; PBT fuzzes it and the code side-by-side so a throwing, FRESH-on-gone, or survivors-returned path fails the shared property.

> **AMENDED 2026-08-02 (HONESTY-TAPROOT), fanning out the `f2a8659` `goldens-grd.md` REQ-GROUND-3a amendment.** Was: "dropped by `ground()`" / "an unresolvable entry is filtered out" / "asserting drop + DRIFTED". Dropping the dead ENTRY is fail-OPEN per FACT and was executed — a fact citing two units, one deleted, re-grounded to a one-entry receipt that `isGrounded` accepted and `driftDetect` read `FRESH`. The shipped `ground()` is now fail-closed at the fact. _(Tag stays `reference-model`: its generator is PBT-fuzz but the shape is robustness/totality — the total reference IS the oracle, not a standalone ordering law, so it does not earn a standalone `PBT` tag; the KERNEL-7 pattern.)_

### INV-GROUND-4

method-tag: PBT
fspec: —
up-property: "truth-gate monotone downgrade: `gateHolds` serves `HOLDS` iff (grounded ∧ FRESH), else `NA`; it passes every non-`HOLDS` verdict through unchanged and only ever downgrades `HOLDS→NA` (never upgrades), and is idempotent — re-gating a gated verdict is a no-op"
down-model: "a reference gate automaton `gateHolds(status,grounding,src): Status` over (Status × grounded × Freshness); PBT the laws — (a) HOLDS-iff-grounded∧FRESH, (b) downgrade-only monotonicity `gateHolds ≤ input` on the HOLDS→NA order, (c) idempotence `gateHolds∘gateHolds ≡ gateHolds`, (d) non-HOLDS pass-through; escalate to **P only if genuinely async** — it is not (pure+total), so P is refused"
anti-rot: `grounding/ref/gate.ts` (the reference gate automaton) is the mock reused in the admission unit tests; an upgrading, non-idempotent, or FRESH-blind gate path diverges from it under the PBT laws and breaks the build. _(NB: the `HOLDS→NA` **downgrade threshold when not grounded∧FRESH** is normative in spec A-1, flagged `[NEEDS RECONCILIATION]` in `req-grd.md`; the reference automaton already encodes the downgrade — the pending A-1 lift only adds its verifiable REQ, it does not change this tag.)_

### INV-GROUND-5

method-tag: reference-model
fspec: —
up-property: "non-touching-edit classification: an edit that does not TOUCH the cited unit (import, or a blank-line-separated license header added above it, unrelated rename elsewhere) ⇒ still `FRESH`; a real change to the cited unit ⇒ `DRIFTED`; a reformat OF the cited unit ⇒ `DRIFTED` — an accepted false alarm, not 0 false drift; an edit to a comment CONTIGUOUS with the cited declaration (its bound doc-comment, ADR-0014) ⇒ `DRIFTED`"
down-model: "the oracle is `subtreeHash(unit) = Encoder.hash(canonicalForm(unit))` over the unit's RAW SOURCE SLICE — extended upward over the declaration's bound leading doc-comment, the maximal contiguous `comment` run (ADR-0014): `src.slice(boundCommentStart(outer) ?? startIndex, endIndex)`, NFC-normalized only by `canonicalForm`; `driftDetect` is FRESH iff that hash is byte-invariant across the edit AND the anchor key still resolves; the golden generator is PBT-fuzz over a non-touching-edit class (asserts FRESH) vs an in-unit/bound-doc-comment/real-change class (asserts DRIFTED) against the reference oracle"
anti-rot: `grounding/ref/anchor.ts` (shares the K1 oracle) is the mock; an oracle that folds the unit's line-range drifts a still-true fact on an edit above it and fails the invariance test, and an oracle that erases in-unit bytes goes blind to a one-space change inside a template literal and fails the DRIFTED leg. _(Tag stays `reference-model`: PBT-fuzz generator, but the shape is conformance-to-the-reference-drift-oracle (robustness of classification), not a standalone ordering law; KERNEL-7 pattern.)_

> **AMENDED 2026-08-02 (HONESTY-TAPROOT) — this down-model described a component that was never built.**
> It previously read: _"the reference normalizer `normalize(subtree)` (whitespace / comments-if-configured /
> De-Bruijn / param-name / lifetime noise erased) drives `driftDetect`"_. **No such normalizer exists
> anywhere in the product, and none ever did.** Verified mechanically: the only `normalize`-named function in
> any `packages/*/src` is `normalizeCheck` in `packages/knowledge/src/write/router.ts`, which normalizes a
> predicate CHECK STRING for node identity and has nothing to do with subtrees; there is no whitespace pass,
> no comment stripper, no De-Bruijn indexing, no param-name or lifetime erasure. The shipped chain is
> `foldAstUnits` → `content: src.slice(node.startIndex, node.endIndex)` → `canonicalForm` (NFC on strings
> only) → `Encoder.hash`. So this was not an overclaim about _behaviour_ — it was a down-model specifying a
> component that no WP ever built, which is why every scenario derived from it could only pass on a fixture
> that held the hash constant by hand.
>
> The up-property is amended with it: "0 false drift" was never achieved. Measured through the real
> `foldAstUnits → build → driftDetect` chain — import-above `FRESH`, license-header-above `FRESH`,
> unrelated-rename-elsewhere `FRESH`, whitespace-reformat-of-the-unit **`DRIFTED`**, comment-reindent-inside
> **`DRIFTED`**, real change `DRIFTED`. Building the normalizer is deliberately REFUSED, not deferred: any
> cheap normalization over raw text also erases whitespace that is SEMANTIC in TS/TSX (string, template and
> regex literals, JSX text, ASI), and a false negative — serving `HOLDS` on a stale fact — costs far more
> than the re-ground a false alarm costs. See REQ-GROUND-5b in `goldens-grd.md`.
>
> **AMENDED 2026-08-09 (ADR-0014, owner-ratified).** The RAW SOURCE SLICE is extended upward over the
> declaration's bound leading doc-comment (the maximal contiguous `comment` run), so the up-property/down-model
> above are contiguity-qualified: the `license-header-above FRESH` measurement in the block above holds only
> for a BLANK-LINE-SEPARATED header; a CONTIGUOUS leading comment is the decl's doc-comment and reads
> `DRIFTED`. The reference oracle (`grounding/ref/`) and shipped `foldAstUnits` move together; the acceptance
> goldens are `adapter-io` G-GAP2-1..8.

### INV-GROUND-6

method-tag: reference-model
fspec: —
up-property: "fail-closed write: an ungrounded fact does not enter at `emit` — nothing is persisted (spec A-2)"
down-model: "the reference admission decision `admit(fact)=false` whenever `isGrounded(fact.grounding)` is false; the mock asserts an ungrounded node yields `emitted:false` and 0 bytes persisted"
anti-rot: `grounding/ref/admit.ts` (the reference truth-door) is the mock; a code path that admits an ungrounded fact fails the shared test. _(Seam note: the actual persistence sink is `emit` in atlas-tools — **TOOLS-7** owns the write-side; GROUND-6 models only the fail-closed **decision**; the persistence-side enforcement is delegated to TOOLS-7 as an integration test, mirroring KERNEL-12→PERSIST-11.)_

### INV-GROUND-7

method-tag: reference-model
fspec: —
amendment: **AMENDED + RE-RATIFIED 2026-08-02** (owner) — [ADR-0012](../adr/ADR-0012-obviousness-is-scored-never-gated.md): obviousness is SCORED, never gated; the rejection line moves to harm (secret / PII).
up-property: "admission: `admit(fact)` is true iff it passes the truth door (grounding re-checks FRESH, GROUND-4) **and** is not **harmful to store** (a secret / PII — the one class where storing IS the harm). The usefulness judgment `actionable ∧ non-obvious` is **computed and stored as a score**, never a veto; a true-but-obvious fact is **admitted with a low score**, and the ranking decision is taken a-posteriori at retrieval."
down-model: "`admit(fact)=truthDoor(fact) && !harmfulToStore(fact)` where `truthDoor=gateHolds(...)===HOLDS`; the mock asserts the conjunction — ungrounded ⇒ blocked at the truth door, harmful-to-store ⇒ blocked at the harm door, obvious ⇒ **admitted carrying a low obviousness score**, both-pass ⇒ admitted"
anti-rot: `grounding/ref/admit.ts` (the reference admission) is the mock reused in the admission tests; an OR-gate code path, a downgraded truth door, or a **resurrected obviousness veto** (obvious ⇒ blocked) diverges and breaks the build. _(Refusal note: the **non-obvious** predicate has no finite/mechanical oracle — see Refuse-to-model; [ADR-0012](../adr/ADR-0012-obviousness-is-scored-never-gated.md) decides what its verdict is FOR — a stored score, not a veto — and does NOT claim to have made the verdict mechanical. Only the admission **wiring** (conjunction) and the truth door are modeled; the non-obviousness verdict is refused, not tagged.)_

### INV-GROUND-8

method-tag: reference-model
fspec: —
up-property: "provenance filter: an `untrusted`-source claim is advisory and excluded from `gateHolds`'s inputs (spec A-9) — it can never contribute a `HOLDS`"
down-model: "the reference gate filters `candidates.filter(c=>c.source!=='untrusted')` before gating; the mock asserts an untrusted-source claim is absent from the gate's input set and lands advisory"
anti-rot: `grounding/ref/gate.ts` (shares the GROUND-4 gate) is the mock; a code path that lets an untrusted source reach `gateHolds` fails the exclusion test.

### INV-GROUND-9

method-tag: reference-model
fspec: —
up-property: "templated write (robustness): a fact missing a required template field, or over cap, is rejected at `emit`; no free-prose fact persists (0)"
down-model: "the reference `validateTemplate(fact)` requires the fixed field set and enforces the cap — reject on missing/over-cap/free-prose; the golden generator is PBT-fuzz over malformed/oversized/free-prose facts asserting rejection + 0 persisted"
anti-rot: `grounding/ref/admit.ts` (the reference template validator) is the mock; a free-prose-tolerant or cap-blind code path fails the shared reject test. _(Tag stays `reference-model`: PBT-fuzz generator, robustness/validation shape, not ordering. NB: the missing-field / over-cap **reject guard** is normative in spec A-13, flagged `[NEEDS RECONCILIATION]` in `req-grd.md`; the reference validator already encodes it — the A-13 lift adds the guard REQ, not a tag change.)_

### INV-GROUND-10

method-tag: reference-model
fspec: —
up-property: "hash via the seam: `subtreeHash` is computed through the `@orchestra/kernel` encoder seam (KERNEL-2), never a locally-inlined hash call — so the digest stays swappable (0 inlined hash calls)"
down-model: "the reference anchor builder is parametrized by the kernel `Encoder` seam; a unit test swaps blake3↔a stub digest and asserts every `subtreeHash` follows the seam (no divergent value ⇒ some path inlined its own hash); supplemented by the static grep of Acceptance §8 (the only hash call routes through the seam)"
anti-rot: `grounding/ref/anchor.ts` (seam-parametrized) is the mock; a locally-inlined `blake3(...)` call does not follow the swapped seam and breaks the substitution test. _(Shape note: this is the KERNEL-2 seam-substitution pattern (reference-model), plus a static-lint arm — see the shape-fit note in the report; it fits, it is not forced.)_

### INV-GROUND-11

method-tag: PBT
fspec: —
up-property: "interface-fold drift monotonicity: a fact's freshness folds BOTH (a) its own grounding-set `subtreeHash` AND (b) its forward-closure's **interface/signature-level `rState`** (INDEX-12), NOT the callee's full-body `subtreeHash`; a callee **signature/contract** change DRIFTS every caller, a pure-body refactor (signature unchanged) drifts none, an empty forward-closure is unaffected; the verdict never asserts the claim is true"
down-model: "a reference closure-fold `freshness(fact)=FRESH iff ownSubtreeHash unchanged ∧ ∀ callee∈closure: interfaceRState(callee) unchanged`, consuming an interface-`rState` seam (INDEX-12 stub); PBT the laws — (a) determinism, (b) interface-change ⇒ DRIFTED (no false-negative), (c) body-only change ⇒ FRESH (no over-approximation), (d) empty-closure invariance, (e) freshness is a structural predicate, never a truth claim"
anti-rot: `grounding/ref/drift.ts` (the reference interface-fold) is the mock reused in the freshness unit tests; a code fold that folds the callee's **full body** over-drifts on body-preserving edits (fails law (c)), and one that ignores the closure under-drifts on a signature change (fails law (b)) — either diverges and breaks the build.

### INV-GROUND-12

method-tag: reference-model
fspec: —
up-property: "repo-global block-anchor: a genuinely repo-wide rule is groundable to the `repo`/`project` level anchored to a **policy artifact's heading/section-block `subtreeHash`** (not the whole-file byte-hash for a parseable artifact); editing that section drifts it while an unrelated edit elsewhere in the file does NOT; a rule with no artifact anchor is rejected fail-closed (anchorless)"
down-model: "the reference anchor resolver, given a parseable policy artifact, keys on the section-block `subtreeHash` (block-level CAS node), reserving the whole-file byte-hash for non-parseable files; the mock asserts (i) block-scoped drift (edit-section ⇒ DRIFTED, unrelated-edit ⇒ FRESH), (ii) `isGrounded==true` for the block anchor, (iii) an anchorless rule is rejected"
anti-rot: `grounding/ref/anchor.ts` (block-vs-file granularity resolver) is the mock; a code path that anchors a parseable artifact on its file byte-hash re-imports byte-fragility (an unrelated edit drifts every rule) and fails the block-scope test.

### INV-GROUND-13

method-tag: reference-model
fspec: —
up-property: "advisory drift is non-blocking: an **advisory** fact (no `check`) whose grounding drifts resolves to `STALE` — served-with-flag, never silently re-grounded, never forced into either arm of the KNOW-5 split, and it never blocks a merge; a **predicate** fact's drift instead takes the KNOW-5 mechanical/semantic split"
down-model: "the reference drift-router `route(fact)`: `fact.kind==='advisory' ⇒ STALE (non-blocking)`; `fact.kind==='predicate' ⇒ delegate(KNOW-5 split)`; the mock asserts an advisory drift ⇒ `STALE` (not `DRIFTED`), never re-grounded, `blocksMerge==false`, and is never routed into an arm"
anti-rot: `grounding/ref/drift.ts` (the reference router) is the mock; a code path that re-grounds an advisory or blocks a merge on `STALE` diverges and breaks the build. _(Seam note: the **predicate** arm is owned by atlas-knowledge **KNOW-5** — GROUND-13 models only the advisory→`STALE` arm it owns; the predicate split is delegated to a KNOW-5 integration test, mirroring KERNEL-12→PERSIST-11.)_

---

## Refuse-to-model

- **the truth of a claim**: grounding proves the cited unit's normalized structure is **unchanged** (FRESH), NOT that the claim is still true — `FRESH ≠ true`, `DRIFTED ≠ false` (module scope §"structure, not truth"). The false-alarm (behaviour-preserving refactor flips a still-true fact) and false-negative (callee body change leaves a caller-anchored fact FRESH) gaps are **bounded** (GROUND-11 closes the false-negative on the interface axis; KNOW-5 bounds the false-alarm), never **eliminated**. There is no truth oracle to model; the gate is modeled to _narrow_ false HOLDs, not to certify truth.
- **the usefulness / non-obvious verdict (GROUND-7)**: "actionable AND non-obvious" is a human/judgment predicate with no finite or mechanical oracle. Only the admission **wiring** (the conjunction) and the **truth** door are modeled; the non-obviousness verdict is refused — no correctness oracle, covered by review, not a tag. **ADR-0012 does not lift this refusal**: it moves the verdict from a VETO to a stored, auditable score, which decides what the verdict is FOR, not that it became mechanical. What is now modeled is that the score exists on every admitted fact and that `admit` is INDEPENDENT of it; the score's calibration remains unmodeled — measurable only once facts exist with scores attached.
- **the code itself**: conformance-tested (sampled) against the reference model — "success = we could not find a bug"; a verified design is not a verified impl. Confidence is bought with scale + coverage, not a proof claim.
- **concurrent git-merge + crashing executions simultaneously**: merge concurrency and process-crash / durability are checked _separately_, never in one model (ShardStore rule).
- **BLAKE3 / digest cryptographic collision-resistance**: the hash is a trusted primitive, assumed — not modeled. `subtreeHash` byte-agreement is a conformance corpus (shared with KERNEL-1/2), not a formal model.
- **real-time / wall-clock**: no clock enters the gate by construction (Surface/API: all five functions pure + total, no clock) — nothing to model. This is precisely **why GROUND-4 stays `PBT` and P is refused**: no async, no interleaving.
- **move-aware anchoring (KNOW-15)**: `subtreeHash` is a BLAKE3 **equality** oracle — it catches a pure move but NOT a rename co-occurring with a body edit. A GumTree/RefactoringMiner-grade similarity matcher is **not delivered** and is explicitly NOT modeled here (its own downstream sub-spec); grounding supplies only the equality primitive KNOW-15 must not overtrust.

## FSPEC

**None.** Block GRD owns no `FSPEC` — the only formal cluster in the Atlas is `FSPEC-merge` (Block KRN, KERNEL-9/10/11 + PERSIST-11). The GROUND-4 contingent-P escalation was evaluated and **refused** (the gate is not genuinely async — see the header). Every `reference-model`/`PBT` tag above names its build-language anti-rot mock under `grounding/ref/*.ts`, reused as the unit-test mock so the build breaks on spec drift.

## Completion report

- tagged-register: `docs/requirements/method-tags-grd.md`
- tag histogram: **formal 0** · **exhaustive 0** · **PBT 2** (GROUND-4 truth-gate, GROUND-11 interface-fold) · **reference-model 11** (GROUND-1/2/3/5/6/7/8/9/10/12/13)
- FSPEC-merge: n/a for GRD (no formal cluster here; the Atlas's one FSPEC lives in Block KRN)
- refusal count: **7**
- every GROUND-1..13 tagged: **yes** (13/13; all behavioural, 0 `n/a`)
- contingent-P decision: **REFUSED** (gate is pure + total, not async) — recorded, no P/FSPEC
- shape-no-fit flags: **none forced**; two partial-fit notes recorded — GROUND-7 (the non-obviousness verdict has no mechanical oracle → refused, not tagged; ADR-0012 makes it a stored score, not a veto — the refusal is unchanged) and GROUND-10 (KERNEL-2 seam-substitution reference-model + a static-lint arm) — both fit an existing row honestly.
- → next_state **S3** (goldens).
