# Goldens — Block GRD (grounding) · S3 generate-from-method-tag

> **state:** S3 · **protocol:** [`goldens`](../../.claude/skills/goldens/SKILL.md) + [`completeness`](../../.claude/skills/completeness/SKILL.md) Gate-3 teeth ·
> **axiom:** S2 frozen (`method-tags-grd.md`; every GROUND-1..13 method-tagged, **no `FSPEC`** in GRD — the
> Atlas's one formal cluster is `FSPEC-merge` in Block KRN) · **owner:** charlie (FORGE).
>
> **Derivation (not hand-authored where a generator exists):**
>
> - **GROUND-4 / GROUND-11** are `PBT` → their SCNs are **concrete witness instances of the reference-automaton
>   laws** named in `method-tags-grd.md` §INV-GROUND-4 (HOLDS-iff · downgrade-only · idempotence · pass-through)
>   and §INV-GROUND-11 (both-fold · interface-drift · body-invariance · empty-closure · structure-not-truth) —
>   `gen: PBT`.
> - **GROUND-1/2/3/5/6/7/8/9/10/12/13** are `reference-model` → **conformance / differential** against the named
>   build-language mock (`grounding/ref/*.ts`, reused as the unit-test mock; anti-rot) — `gen: conformance`.
> - **DEFINE-gated (parametric — do NOT fabricate a passing value):** the two `[NEEDS RECONCILIATION]` residues
>   in `req-grd.md` — GROUND-4's `HOLDS→NA` downgrade **threshold** (spec A-1) and GROUND-9's
>   missing-field / over-cap **reject** (spec A-13) — are written **parametric on the symbolic threshold/rule**,
>   `gen: residue`, each flagged as a DEFINE dependency. What IS grounded (the reference automaton already
>   encodes both) is covered concretely; only the concrete A-1/A-13 value is deferred.
>
> **Refusal note (load-bearing for teeth scope, from `method-tags-grd.md` §Refuse-to-model):** grounding proves
> the cited structure is **unchanged** (FRESH), NOT that the claim is **true** (`FRESH ≠ true`). The
> **non-obvious** predicate of GROUND-7 has no mechanical oracle. In the goldens below, **truth**, **obviousness**
> and **harmful-to-store** are therefore **labelled inputs on the fixture**, never computed outcomes — only the
> admission **wiring** and the **structural** verdict are asserted. Since [ADR-0012](../adr/ADR-0012-obviousness-is-scored-never-gated.md)
> the obviousness label is a **stored score**, not a veto: it is asserted to leave `admit` unchanged, which is a
> stronger statement about the wiring than the retired "obvious ⇒ blocked" was.

Concrete fixture universe reused across the block (structural nodes hashed via the `@orchestra/kernel` encoder seam):

| fixture                               | subtreeHash / rState                                                                                          | on edit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | notes                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| `U_arr` = `billing.ts › computeArr()` | `sh-arr-01`                                                                                                   | import-above / **blank-line-separated** license-header-above / unrelated-rename-elsewhere ⇒ **still `sh-arr-01`** (the unit's own bytes are untouched); real change `42→43` ⇒ `sh-arr-02`; **whitespace reformat OF the unit ⇒ `sh-arr-0R` — it MOVES**; **a CONTIGUOUS leading comment above the decl is its bound doc-comment ⇒ editing it MOVES** <!-- AMENDED 2026-08-02 with REQ-GROUND-5b: the oracle hashes the raw source slice, NFC only; there is no normalize step. AMENDED 2026-08-09 (ADR-0014): the header-above leg is FRESH only when blank-line-separated; a contiguous leading comment drifts the unit (contiguity, not file position) --> | cited unit of `F_arr`                |
| `E_arr` (grounding entry on `U_arr`)  | anchor.subtreeHash `sh-arr-01`, displayLines `[40-52]`, source `trusted`                                      | import-above shifts displayLines `[40-52]→[44-56]`, subtreeHash **unchanged**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | —                                    |
| `E_lronly`                            | anchor: line-range `[40-52]` only, **no** subtreeHash                                                         | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | invalid anchor                       |
| `E_empty`                             | anchor.subtreeHash `""` (empty), displayLines `[40-52]`                                                       | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | ungrounded entry                     |
| `E_gone`                              | cites a unit/path that was **deleted**                                                                        | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | unresolvable citation                |
| `U_charge` = callee `charge()`        | interface `rState ir-chg-01`, full-body subtreeHash `sh-chg-01`                                               | signature change ⇒ `ir-chg-02` (body `sh-chg-02`); pure-body refactor ⇒ interface **`ir-chg-01`** unchanged, body `sh-chg-01r`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | callee in `F_call`'s forward-closure |
| `F_call`                              | own grounding subtreeHash `sh-call-01`, forward-closure `{U_charge}`                                          | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | caller fact (GROUND-11)              |
| `POLICY.md` (parseable)               | `## Idempotency` block `sh-pol-idem-01`; `## Logging` block `sh-pol-log-01`; whole-file byte-hash `bh-pol-01` | edit `## Logging` ⇒ `sh-pol-log-02`, byte-hash ⇒ `bh-pol-02`; `## Idempotency` block **unchanged** `sh-pol-idem-01`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | anchor of rule `R_idem`              |
| `LOGO.pdf` (non-parseable)            | whole-file byte-hash `bh-logo-01`                                                                             | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | reserved byte-hash case              |
| `R_idem`                              | rule "all handlers must be idempotent", anchor = `POLICY.md#Idempotency` block `sh-pol-idem-01`               | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | repo-wide, no symbol anchor          |

Verdict candidates (`Status × grounded × Freshness`) for the gate laws (GROUND-4/7/8):

| cand      | status | grounded | freshness | source        | `gateHolds`                                   |
| --------- | ------ | -------- | --------- | ------------- | --------------------------------------------- |
| `c_hold`  | HOLDS  | true     | FRESH     | trusted       | **HOLDS**                                     |
| `c_drift` | HOLDS  | true     | DRIFTED   | trusted       | **NA** (downgrade)                            |
| `c_ungr`  | HOLDS  | false    | —         | trusted       | **NA** (downgrade)                            |
| `c_na`    | NA     | —        | —         | trusted       | **NA** (pass-through)                         |
| `c_untr`  | HOLDS  | true     | FRESH     | **untrusted** | filtered **before** the gate ⇒ can never HOLD |

---

## REQ-GROUND-1 — subtreeHash is the drift oracle

### REQ-GROUND-1a — subtreeHash is the drift oracle (happy)

### SCN-GROUND-1a-1 — drift keys off subtreeHash alone (happy)

source: REQ-GROUND-1a

> **AMENDED 2026-08-02 (HONESTY-TAPROOT).** Run A was previously "a **whitespace reformat** (source bytes
> change, but `normalize(subtree)=sh-arr-01` is unchanged)", and its tooth read _breaks-on "the oracle is
> mutated to the raw byte-hash of the source text … a false alarm the subtreeHash oracle must not raise"_.
> **The shipped oracle IS the hash of the unit's raw source slice** (NFC-normalized only) — so that tooth
> named the delivered product as its failure mode, and the scenario could only ever pass on a fixture that
> held the hash constant by hand. Run A is now an **import added above the unit**: it shifts the unit's LINES
> without touching its bytes, which is the real content of "the verdict tracks `subtreeHash` and nothing
> else" and is delivered (measured `FRESH`). The reformat case is pinned as `DRIFTED` under REQ-GROUND-5b.

Given `E_arr` (anchor.subtreeHash `sh-arr-01`); run A recomputes the cited unit after an **import added above it** (the unit's own bytes and minted key untouched, its line-range shifted), run B recomputes it after a real edit `42→43` (`sh-arr-02`)
When `driftDetect(E_arr)` reads its oracle in each run
Then run A is `FRESH` and run B is `DRIFTED` — the verdict tracks **`subtreeHash`** and nothing else
teeth: breaks-on "the oracle folds the unit's line-range — run A (bytes-equal but shifted down the file) flips to `DRIFTED`, the false alarm the subtreeHash oracle exists to suppress"
gen: conformance # differential vs `grounding/ref/anchor.ts` (`resolveAnchor(entry)=entry.anchor.subtreeHash`)

### REQ-GROUND-1b — displayLines excluded from drift (guard)

### SCN-GROUND-1b-1 — a pure line-shift does not drift (guard)

source: REQ-GROUND-1b
Given `E_arr` whose subtreeHash stays `sh-arr-01` while an import added above shifts its displayLines `[40-52]→[44-56]`
When `driftDetect(E_arr)` runs
Then the verdict is `FRESH` — the displayLines change did **not** participate in drift
teeth: breaks-on "`displayLines` is folded into the oracle — the line-shift flips the still-anchored fact to `DRIFTED`"
gen: conformance # the mock asserts drift is invariant to `displayLines` edits

### REQ-GROUND-1c — line-ranges are never an anchor (guard)

### SCN-GROUND-1c-1 — a line-range-only anchor is rejected (guard)

source: REQ-GROUND-1c
Given `E_lronly` — a `StructRef` carrying only the line-range `[40-52]` and **no** subtreeHash
When the anchor is validated at ground time
Then it is rejected as an **invalid anchor** (fail-closed); no grounding entry is built from it
teeth: breaks-on "a line-range-only anchor is accepted — a fact anchored by lines survives, and every unrelated line-shift silently drifts or fails to drift it"
gen: conformance # `grounding/ref/anchor.ts` rejects a `StructRef` lacking a `subtreeHash`

### REQ-GROUND-1d — a span addresses content-addressed bytes (happy) <!-- ADDED 2026-08-02, SPAN amendment -->

### SCN-GROUND-1d-1 — the citation re-derives instead of being stored (happy)

source: REQ-GROUND-1d
Given the bytes `B_arr` of the cited unit `U_arr` and the evidence clause `return mrr * 12;` at byte offset `AT`
When a span is minted over `B_arr[AT, AT+16)` and the citation is read back by presenting `B_arr` again
Then the exact clause comes back byte-for-byte, and the span itself holds only `{contentHash, start, end}` — no field of it contains any part of the source
teeth: breaks-on "the span stores the quoted text instead of addressing it — an unversioned second copy that drifts silently and that nothing can falsify"
gen: conformance # mint→read round-trip through the `@atlas/kernel` Encoder seam (a stub-encoder swap is the substitution witness)

### REQ-GROUND-1e — the span is additive and absent-tolerant (guard) <!-- ADDED 2026-08-02, SPAN amendment -->

### SCN-GROUND-1e-1 — an entry minted before the amendment still reads (guard)

source: REQ-GROUND-1e
Given `E_arr` carrying **no** `span` key at all, and a second entry carrying a valid span but an EMPTY `anchor.subtreeHash`
When `isGrounded` and `driftDetect` run on each
Then the span-less entry is grounded and `FRESH` exactly as before, its location reads as **unknown** (never a defaulted whole-unit range), and the span-with-empty-anchor entry is **not** real grounding (`DRIFTED`)
teeth: breaks-on "an absent span defaults to `[0, length)` of the unit — a citation nobody made" AND on "a span is accepted in place of an anchor, hollowing GROUND-2"
gen: conformance # the reference predicate reads `anchor.subtreeHash` alone; the span is inert in it

### REQ-GROUND-1f — the span is inert on the drift rail (guard) <!-- ADDED 2026-08-02, SPAN amendment -->

### SCN-GROUND-1f-1 — wrong bytes refuse, and a corrupt span changes no verdict (guard)

source: REQ-GROUND-1f
Given a span over `B_arr`, and `B_arr'` — the same unit edited `12→13`, therefore the SAME LENGTH so every offset is still in bounds
When the citation is read against `B_arr'`, and separately when `driftDetect`/`isGrounded` run over entries that carry no span, a valid span, and a wholly corrupt span
Then the read REFUSES (no plausible slice of the wrong content is returned), and all three drift/grounding verdicts are identical — the oracle stays `anchor.subtreeHash`
teeth: breaks-on "the span is folded into the drift oracle — a corrupted span flips a still-anchored fact to DRIFTED" AND on "the read checks only the range's bounds, so any file of the right length yields a citation"
gen: conformance # the mock keys drift off `subtreeHash` and is invariant to `span` edits

---

## REQ-GROUND-2 — real-grounding predicate

### REQ-GROUND-2a — definition of a real grounding (happy)

### SCN-GROUND-2a-1 — real iff ≥1 entry AND every entry non-empty (happy)

source: REQ-GROUND-2a
Given `g_full = {E_arr(sh-arr-01), E2(sh-arr-01b)}` (both non-empty) and `g_partial = {E_arr(sh-arr-01), E_empty("")}` (one entry has an empty subtreeHash)
When `isGrounded` is evaluated on each
Then `isGrounded(g_full) = true` and `isGrounded(g_partial) = false` — the predicate is `≥1 entry ∧ **every** entry non-empty`
teeth: breaks-on "the `every` conjunct is weakened to `some` (AND→OR) — `g_partial` wrongly counts as real"
gen: conformance # differential vs `grounding/ref/ground.ts` `isGrounded`

### REQ-GROUND-2b — ungrounded is never FRESH (guard)

### SCN-GROUND-2b-1 — an ungrounded grounding never surfaces FRESH (guard)

source: REQ-GROUND-2b
Given the ungrounded grounding `g_empty = {}` (0 entries) and `g_partial` (one empty-subtreeHash entry)
When `driftDetect` runs on each
Then each returns `DRIFTED` — **never** `FRESH`
teeth: breaks-on "`driftDetect` returns `FRESH` when `isGrounded` is false — an ungrounded fact surfaces FRESH and passes the truth gate"
gen: conformance # the mock asserts empty/partial groundings never surface FRESH

---

## REQ-GROUND-3 — fail-closed, total resolution

### REQ-GROUND-3a — unresolvable citation fails the WHOLE fact (guard)

> **AMENDED 2026-08-02 (lead), strengthening.** This requirement previously read "unresolvable citation
> dropped" and pinned per-ENTRY filtering. That was fail-OPEN per FACT, and it was executed: a fact citing
> two units, one of them deleted, re-grounded to a one-entry receipt that `isGrounded` and read `FRESH`.
> **Half the evidence vanished and the receipt came back clean.** Only a fact whose EVERY citation died was
> caught. The original teeth — "a dangling citation must never later read as anchored" — are UNCHANGED and
> still hold; what changed is that dropping the dangling entry is no longer enough to satisfy them, because
> the surviving entries then speak for evidence that is gone. REQ-GROUND-3b is unaffected.

### SCN-GROUND-3a-1 — `ground()` refuses a fact with a dangling citation (guard)

source: REQ-GROUND-3a
Given a fact whose grounding cites `E_gone` (its unit/path was deleted) alongside the resolvable `E_arr`
When `ground()` runs
Then the grounding is **empty** — `E_gone` is never retained, and `E_arr` does not stand in for it; `isGrounded` is false and `driftDetect` reads `DRIFTED`
teeth: breaks-on "`ground()` retains the unresolvable entry — a dangling citation persists in the grounding set and later reads as anchored" · breaks-on "`ground()` returns the surviving entries alone — the fact reads FRESH on evidence that is partly deleted"
gen: conformance # `grounding/ref/ground.ts` is total by construction — a fact with any unresolvable entry grounds to nothing

### REQ-GROUND-3b — unresolvable citation reads DRIFTED (guard)

### SCN-GROUND-3b-1 — a gone unit drifts, never freshens (guard)

source: REQ-GROUND-3b
Given a grounding whose only entry is `E_gone` (unit deleted)
When `driftDetect()` runs
Then the verdict is `DRIFTED` (fail-closed) — not `FRESH`
teeth: breaks-on "`driftDetect` returns `FRESH` for a gone unit — a deleted citation is treated as still-anchored (fail-open)"
gen: conformance

### REQ-GROUND-3c — resolution never throws (guard)

### SCN-GROUND-3c-1 — arbitrary/absent citations return, never throw (guard)

source: REQ-GROUND-3c
Given a PBT-fuzz stream of arbitrary, malformed, and absent citations (10k corner-biased cases) fed to `ground()` and `driftDetect()` side-by-side against the reference
When each entry point is invoked on each fuzzed citation
Then every call **returns** a value (drop / `DRIFTED`) — **0 exceptions thrown** — and prod matches ref
teeth: breaks-on "an absent-path citation raises an uncaught exception instead of being dropped — resolution is non-total"
gen: conformance # PBT-fuzz **differential** vs the total reference `ground`/`driftDetect` (tag stays reference-model per §GROUND-3)

---

## REQ-GROUND-4 — truth-gate on grounded ∧ FRESH (PBT)

### REQ-GROUND-4 — truth-gate on grounded ∧ FRESH (happy)

### SCN-GROUND-4-1 — HOLDS iff grounded ∧ FRESH (happy)

source: REQ-GROUND-4
Given `c_hold` (HOLDS, grounded, FRESH) and `c_drift` (HOLDS, grounded, **DRIFTED**)
When `gateHolds(status, grounding, src)` gates each
Then `gateHolds(c_hold) = HOLDS` and `gateHolds(c_drift) = NA` — `HOLDS` is served **iff** grounded ∧ FRESH
teeth: breaks-on "the gate is FRESH-blind (gates on grounded alone) — `c_drift` is served `HOLDS` on a drifted grounding"
gen: PBT # witness of law (a) HOLDS-iff-grounded∧FRESH (`grounding/ref/gate.ts`)

### SCN-GROUND-4-2 — downgrade-only, idempotent, pass-through (happy)

source: REQ-GROUND-4
Given `c_na` (a non-HOLDS input) and the already-gated result `r = gateHolds(c_drift) = NA`
When the gate is re-applied — `gateHolds(c_na)` and `gateHolds(r)`
Then `gateHolds(c_na) = NA` (non-HOLDS passes through unchanged) and `gateHolds(r) = NA` (idempotent — re-gating never **upgrades** `NA→HOLDS`); `gateHolds ≤ input` on the `HOLDS→NA` order for every input
teeth: breaks-on "the gate **upgrades** on re-gate — feeding a previously-downgraded `NA` back yields `HOLDS` (non-monotone; a drifted verdict is laundered to HOLDS by a second pass)"
gen: PBT # witness of laws (b) downgrade-only monotonicity, (c) idempotence, (d) non-HOLDS pass-through

### SCN-GROUND-4-3 — the A-1 HOLDS→NA downgrade threshold (guard · DEFINE-parametric)

source: REQ-GROUND-4
Given a HOLDS candidate sitting **at the boundary** the spec-A-1 downgrade predicate `Θ_A1` governs (the exact "serves NA when not grounded ∧ FRESH" condition — normative in spec A-1, currently a `→ see spec A-1` pointer flagged `[NEEDS RECONCILIATION]` in `req-grd.md`, so `Θ_A1` is symbolic here, **not** a fabricated concrete value)
When `gateHolds` evaluates the downgrade at `Θ_A1`
Then it serves `NA` **iff** `Θ_A1` classifies the candidate as `¬(grounded ∧ FRESH)`, and `HOLDS` otherwise — parametric on `Θ_A1`
teeth: breaks-on "the gate serves `HOLDS` at a point `Θ_A1` places on the downgrade side — the truth gate holds below its own A-1 threshold"
gen: residue # **DEFINE dependency**: the concrete A-1 threshold is an OPEN reconciliation; the reference automaton already encodes a downgrade — only the verifiable threshold REQ (and its concrete value) is pending the A-1 lift

---

## REQ-GROUND-5 — semantic-drift-only classification

### REQ-GROUND-5a — real change drifts the fact (happy)

### SCN-GROUND-5a-1 — a real change to the cited unit drifts it (happy)

source: REQ-GROUND-5a
Given `F_arr` anchored to `U_arr` (subtreeHash `sh-arr-01`); the cited unit's returned constant is changed `42→43`, recomputing its subtree hash to `sh-arr-02`
When `driftDetect(F_arr)` runs
Then the verdict is `DRIFTED` — a real change is caught
teeth: breaks-on "a normalizer is landed on the oracle and erases the `42→43` change — a genuinely changed unit stays `FRESH` (a false-negative that hides a stale fact)"
gen: conformance # differential vs the reference oracle/`driftDetect` (`grounding/ref/anchor.ts`) <!-- AMENDED 2026-08-02: there is no reference normalizer; see method-tags-grd.md#INV-GROUND-5 -->

### REQ-GROUND-5b — an edit that does not touch the cited unit never drifts (guard)

> **AMENDED 2026-08-02 (lead), narrowing to what is actually delivered.** This requirement previously
> claimed "irrelevant edit never drifts" over three edit classes. Two of the three are delivered, and one
> of them only became REAL with this amendment: the **import-above** leg used to pass only because its
> fixture held the anchor key constant BY HAND — the mint put the symbol's BYTE START INDEX in the key, so
> an added line genuinely re-keyed the unit and the golden was VACUOUS. The key is now
> `<parent>::<kind>:<ordinal>[:<name>]` and the leg is exercised through the real mint.
>
> The **whitespace-reformat** leg is NOT delivered, and deliberately will not be: the oracle hashes the raw
> source slice, so `return 42;` → `return  42;` drifts. Delivering it needs a normalizer, and any cheap
> normalization over raw text also erases whitespace that is SEMANTIC in TS/TSX — string, template and
> regex literals, JSX text, ASI. The trade is asymmetric: a false alarm costs one re-ground, a false
> negative lets the truth gate serve HOLDS on a stale fact. So the oracle stays byte-exact and the
> requirement now says so instead of promising otherwise. `packages/grounding/test/` pins BOTH directions:
> the reformat drifts, and a one-space change inside a template literal MUST drift — the teeth against
> anyone landing a normalizer later.

### SCN-GROUND-5b-1 — import-above + unrelated-rename stay FRESH; a reformat DOES drift (guard)

source: REQ-GROUND-5b
Given `F_arr` on `U_arr`, then two edits that do not touch the cited unit — an import added above, and an unrelated rename elsewhere — leaving the unit's own bytes and its minted key invariant; and separately a whitespace reformat OF the cited unit
When `driftDetect(F_arr)` runs after each edit
Then the two non-touching edits verdict `FRESH` — 0 false drift — and the reformat verdicts `DRIFTED`, which is the oracle's stated limit, not a defect
teeth: breaks-on "an import added above the unit drifts it — the anchor key carries a byte offset and any line inserted above re-keys a still-true fact" · breaks-on "a whitespace reformat of the cited unit reads FRESH — a normalizer landed and the oracle can no longer see a change inside a template literal"
gen: conformance # PBT-fuzz over a non-touching-edit class vs the reference oracle (tag stays reference-model per §GROUND-5)

---

## REQ-GROUND-6 — fail-closed write at emit

### REQ-GROUND-6 — fail-closed write at emit (guard)

### SCN-GROUND-6-1 — an ungrounded fact never enters at emit (guard)

source: REQ-GROUND-6
Given a fact whose grounding is `g_partial` (one empty-subtreeHash entry ⇒ `isGrounded = false`) presented to the admission decision
When the `emit` admission decision runs — `admit(fact)`
Then `admit = false` and **0 bytes** are persisted — the ungrounded fact does not enter
teeth: breaks-on "`admit` returns true when `isGrounded(fact.grounding)` is false — an ungrounded fact is written to the store"
gen: conformance # `grounding/ref/admit.ts` truth-door (persistence-side enforcement delegated to TOOLS-7 per §GROUND-6)

---

## REQ-GROUND-7 — admission (truth ∧ ¬harmful); obviousness scored

### REQ-GROUND-7a — admit iff true and not harmful to store (happy)

amendment: **AMENDED + RE-RATIFIED 2026-08-02** (owner) — [ADR-0012](../adr/ADR-0012-obviousness-is-scored-never-gated.md): obviousness is SCORED, never gated; the rejection line moves to harm (secret / PII).

### SCN-GROUND-7a-1 — truth passes ∧ not harmful ⇒ admitted (happy)

source: REQ-GROUND-7a
Given two facts: `F_both` re-checks `FRESH` ∧ is **labelled** not-harmful-to-store (both doors pass); `F_harm` re-checks `FRESH` but is **labelled** harmful to store (a secret — the truth door passes, the harm door fails)
When `admit()` runs on each
Then `F_both` is **admitted** and `F_harm` is **blocked** — `admit = truthDoor ∧ ¬harmfulToStore`
teeth: breaks-on "`admit` is wired as `truthDoor ∨ ¬harmfulToStore` — the secret-bearing fact `F_harm` (which must be blocked) is then wrongly **admitted**"
gen: conformance # `grounding/ref/admit.ts` admission conjunction (obviousness is NOT an input — ADR-0012)

### REQ-GROUND-7b — admit the true-but-obvious, with a low score (guard)

amendment: **AMENDED + RE-RATIFIED 2026-08-02** (owner) — [ADR-0012](../adr/ADR-0012-obviousness-is-scored-never-gated.md): obviousness is SCORED, never gated; the rejection line moves to harm (secret / PII).

### SCN-GROUND-7b-1 — a true-but-obvious fact is admitted with a low score (guard)

source: REQ-GROUND-7b
Given a fact that passes the truth door (grounded ∧ FRESH ⇒ `HOLDS`), is **labelled** obvious, and is not harmful to store
When `admit(fact)` runs
Then the fact is **admitted** and carries a **low obviousness score** — obviousness is scored, never a veto (ADR-0012); the ranking decision is taken a-posteriori at retrieval
teeth: breaks-on "a **resurrected obviousness veto** (`admit = truthDoor ∧ nonObvious`) — this true-but-obvious fact is rejected and its evidence is destroyed, which is exactly the evidence needed to audit the filter"
gen: conformance

### REQ-GROUND-7c — failing either door blocks admission (guard)

### SCN-GROUND-7c-1 — failing either door blocks; obviousness blocks nothing (guard)

source: REQ-GROUND-7c
Given fact `A` failing only the **truth** door (ungrounded, but not harmful), fact `B` failing only the **harm** door (grounded ∧ FRESH, but a secret), and fact `B_obv` failing **neither** door while labelled obvious
When `admit` runs on each
Then `A` and `B` are **blocked** — failing either door alone is sufficient to block admission — and `B_obv` is **admitted**, because obviousness is not a door
teeth: breaks-on "`admit` ignores a single failed door — fact `A` (failed truth door) is admitted — or treats the obvious axis as a door, blocking `B_obv`"
gen: conformance

---

## REQ-GROUND-8 — untrusted source excluded from the gate

### REQ-GROUND-8 — untrusted source excluded from gateHolds (guard)

### SCN-GROUND-8-1 — an untrusted-source claim never reaches the gate (guard)

source: REQ-GROUND-8
Given `c_untr` — a claim that is grounded ∧ FRESH in every respect **except** its source is `untrusted`
When the gate's candidate set is built and `gateHolds` runs
Then `c_untr` is **filtered out before** gating (lands advisory) — it can never contribute a `HOLDS`
teeth: breaks-on "the provenance filter is dropped — the untrusted-source claim reaches `gateHolds` and yields `HOLDS`"
gen: conformance # `grounding/ref/gate.ts` filters `source==='untrusted'` before gating

---

## REQ-GROUND-9 — no free-prose fact persists

### REQ-GROUND-9 — no free-prose fact persists (guard)

### SCN-GROUND-9-1 — a free-prose fact is rejected at emit (guard)

source: REQ-GROUND-9
Given a free-prose fact (a raw prose string, not the fixed template shape) presented at `emit`
When `validateTemplate(fact)` runs
Then it is **rejected** and **0 bytes** are persisted — no free-prose fact enters
teeth: breaks-on "the validator is free-prose-tolerant — a raw prose fact is persisted"
gen: conformance # differential vs `grounding/ref/admit.ts` template validator

### SCN-GROUND-9-2 — the A-13 missing-field / over-cap reject (guard · DEFINE-parametric)

source: REQ-GROUND-9
Given a fact missing a required template field `f ∈ F`, and a second fact exceeding the field cap `κ` — where the required field-set `F` and cap `κ` are **normative in spec A-13** (`[NEEDS RECONCILIATION]` in `req-grd.md`), so `F`/`κ` are symbolic here, **not** fabricated
When `validateTemplate` runs on each
Then each is **rejected** at `emit` (0 persisted) — parametric on the A-13 rule `(F, κ)`
teeth: breaks-on "the validator omits `f` from the required set, or raises the cap above `κ` — a missing-field or over-cap fact persists"
gen: residue # **DEFINE dependency**: the concrete A-13 field-set / cap is an OPEN reconciliation; the reference validator already encodes a reject — only the verifiable guard REQ (and its concrete `F`/`κ`) is pending the A-13 lift

---

## REQ-GROUND-10 — subtreeHash via the encoder seam

### REQ-GROUND-10a — subtreeHash computed via the seam (happy)

### SCN-GROUND-10a-1 — every subtreeHash follows the swapped seam (happy)

source: REQ-GROUND-10a
Given the anchor builder parametrized by the `@orchestra/kernel` `Encoder` seam, run twice over the identical fixtures — once seam = BLAKE3, once seam = a stub digest
When every `subtreeHash` in the run is computed under each encoder
Then every `subtreeHash` **follows the swapped seam** (the two runs differ only in digest bytes) — 0 values diverge from the seam
teeth: breaks-on "an anchor path inlines its own `blake3(...)` — the inlined value does **not** follow the swapped stub digest, so the substitution run diverges"
gen: conformance # `grounding/ref/anchor.ts` seam-substitution (KERNEL-2 pattern)

### REQ-GROUND-10b — no locally-inlined hash call (guard)

### SCN-GROUND-10b-1 — no off-seam digest call site exists (guard)

source: REQ-GROUND-10b
Given the grounding module graph
When it is audited for any direct `blake3`/`sha256` import or call outside the `@orchestra/kernel` seam
Then **0** off-seam hash call sites are found — the digest stays swappable
teeth: breaks-on "an anchor builder imports `blake3` directly and hashes off-seam — an off-seam `subtreeHash` is produced that the seam swap cannot reach"
gen: conformance # seam-substitution differential + the static grep of Acceptance §8

---

## REQ-GROUND-11 — interface-fold freshness (PBT)

### REQ-GROUND-11a — freshness folds own hash and closure interface (happy)

### SCN-GROUND-11a-1 — freshness folds BOTH own subtreeHash AND closure interface (happy)

source: REQ-GROUND-11a
Given `F_call` (own grounding subtreeHash `sh-call-01`) with forward-closure `{U_charge}` (interface `ir-chg-01`); three variants — (i) both unchanged, (ii) own hash `sh-call-01→sh-call-02`, (iii) callee interface `ir-chg-01→ir-chg-02`
When `freshness(F_call)` folds each
Then (i) is `FRESH`, and **both** (ii) and (iii) are `DRIFTED` — freshness folds `ownSubtreeHash` **and** the closure's interface `rState`
teeth: breaks-on "the fold ignores the forward-closure (folds `ownSubtreeHash` alone) — variant (iii), a callee interface change, leaves `F_call` `FRESH` (under-drift)"
gen: PBT # witness of law (a) both-fold + no-false-negative on the interface axis (`grounding/ref/drift.ts`)

### REQ-GROUND-11b — never fold callee full body (guard)

### SCN-GROUND-11b-1 — the callee full-body hash is not folded (guard)

source: REQ-GROUND-11b
Given `F_call` whose callee `U_charge` undergoes a pure-body refactor — full-body subtreeHash `sh-chg-01→sh-chg-01r` while interface `ir-chg-01` is **unchanged**
When `freshness(F_call)` folds the closure
Then the verdict is `FRESH` — the callee's full-body `subtreeHash` did **not** enter the fold
teeth: breaks-on "the fold folds the callee's full-body `subtreeHash` — the body-only refactor over-drifts `F_call` to `DRIFTED`"
gen: PBT # witness of law (c) body-only change ⇒ FRESH (no over-approximation)

### REQ-GROUND-11c — callee contract change drifts callers (happy)

### SCN-GROUND-11c-1 — a callee signature change drifts every caller (happy)

source: REQ-GROUND-11c
Given `F_call` citing a caller of `U_charge`, whose **signature** changes (a param added) ⇒ interface `ir-chg-01→ir-chg-02`
When `freshness(F_call)` recomputes
Then `F_call` is `DRIFTED` — a callee whose contract changed drifts its callers
teeth: breaks-on "the interface `rState` is not folded (only own hash) — the caller stays `FRESH` across a callee contract change (a false-negative that hides a broken caller)"
gen: PBT # witness of law (b) interface-change ⇒ DRIFTED

### REQ-GROUND-11d — pure-body refactor never drifts callers (guard)

### SCN-GROUND-11d-1 — a pure-body refactor leaves callers FRESH (guard)

source: REQ-GROUND-11d
Given `F_call` whose callee `U_charge` is refactored body-only (signature `ir-chg-01` unchanged, body `sh-chg-01→sh-chg-01r`)
When `freshness(F_call)` recomputes
Then `F_call` stays `FRESH` — a pure-body refactor does **not** drift callers
teeth: breaks-on "the callee body is folded into caller freshness — a behaviour-preserving refactor over-drifts every caller (churns still-true facts)"
gen: PBT # witness of law (c) applied at the caller outcome (paired with 11b's fold-input view)

### REQ-GROUND-11e — freshness never asserts truth (guard)

### SCN-GROUND-11e-1 — a FRESH-but-false fact is not asserted true (guard)

source: REQ-GROUND-11e
Given a fact whose cited unit and closure interfaces are structurally **unchanged** (⇒ `FRESH`) but whose claim is, in the world, **false** (e.g. "ARR = $4.2M" while the true figure moved — the cited code never encoded the figure)
When `freshness(fact)` is computed and its verdict inspected
Then the verdict is the **structural** predicate `FRESH` (structurally unchanged) — it does **not**, and cannot, assert "the claim is true"; `FRESH ≠ true`
teeth: breaks-on "the freshness verdict is typed/emitted as a truth value — the FRESH-but-false fact is asserted true (the gate over-claims beyond structure)"
gen: PBT # witness of law (e) freshness is a structural predicate, never a truth claim

### REQ-GROUND-11f — freshness phrased as structural unchange (happy)

### SCN-GROUND-11f-1 — freshness renders as "structurally unchanged" (happy)

source: REQ-GROUND-11f
Given a `FRESH` verdict on `F_call` (cited unit and its dependencies' interfaces structurally unchanged)
When the verdict is phrased/rendered
Then it reads as "the cited unit **and its dependencies' interfaces** are structurally unchanged" — never "the claim is true"
teeth: breaks-on "the rendering is mutated to phrase freshness as 'the claim is true' — a structural verdict is presented as a truth guarantee"
gen: PBT # witness of law (e) phrasing side — freshness is structural, not truth

---

## REQ-GROUND-12 — repo-wide rule, block-level anchor

### REQ-GROUND-12a — repo-wide rule grounds to policy artifact (happy)

### SCN-GROUND-12a-1 — a symbol-less repo-wide rule is groundable (happy)

source: REQ-GROUND-12a
Given `R_idem` ("all handlers must be idempotent") — a genuinely repo-wide rule with **no single symbol anchor** — and the policy artifact `POLICY.md`
When it is grounded at the spatial `repo`/`project` level
Then it is **groundable**, anchored to the `POLICY.md` policy artifact — `isGrounded(R_idem) = true`
teeth: breaks-on "a rule with no symbol anchor is rejected as ungroundable — a legitimate repo-wide policy rule can never be grounded"
gen: conformance # `grounding/ref/anchor.ts` repo/project-level policy-artifact anchoring

### REQ-GROUND-12b — anchor to the section block hash (happy)

### SCN-GROUND-12b-1 — the anchor is the section block's subtreeHash (happy)

source: REQ-GROUND-12b
Given `R_idem` grounded to the parseable `POLICY.md`, whose `## Idempotency` section block has subtreeHash `sh-pol-idem-01` and the whole file has byte-hash `bh-pol-01`
When `resolveAnchor(R_idem)` runs
Then the resolved anchor is the **section block's `subtreeHash`** `sh-pol-idem-01` — not the whole-file byte-hash `bh-pol-01`
teeth: breaks-on "the anchor resolver keys off the whole-file byte-hash — `resolveAnchor(R_idem)` returns `bh-pol-01` ≠ `sh-pol-idem-01`"
gen: conformance # block-level CAS-node resolver in `grounding/ref/anchor.ts`

### REQ-GROUND-12c — never anchor to whole-file byte-hash (parseable) (guard)

### SCN-GROUND-12c-1 — an unrelated section edit does not drift the rule (guard)

source: REQ-GROUND-12c
Given `R_idem` anchored to `POLICY.md#Idempotency` (`sh-pol-idem-01`); an **unrelated** edit to the `## Logging` section changes `sh-pol-log-01→sh-pol-log-02` and the whole-file byte-hash `bh-pol-01→bh-pol-02`, while `## Idempotency` stays `sh-pol-idem-01`
When `driftDetect(R_idem)` runs
Then the verdict is `FRESH` — the block anchor is invariant to an unrelated edit elsewhere in the file
teeth: breaks-on "the rule is anchored on the whole-file byte-hash — the unrelated `## Logging` edit (byte-hash `bh-pol-02`) drifts every rule in the file (byte-fragility re-imported)"
gen: conformance

### REQ-GROUND-12d — byte-hash reserved for non-parseable files (happy)

### SCN-GROUND-12d-1 — a non-parseable policy file uses the whole-file byte-hash (happy)

source: REQ-GROUND-12d
Given a rule grounded to `LOGO.pdf` — a genuinely **non-parseable** policy file (no section structure to resolve), whole-file byte-hash `bh-logo-01`
When the anchor is resolved
Then the whole-file **byte-hash** `bh-logo-01` is used — the reserved case for non-parseable files
teeth: breaks-on "the resolver refuses the whole-file byte-hash for `LOGO.pdf` (demands a section block it cannot parse) — a genuinely non-parseable policy file can never be grounded"
gen: conformance # block-vs-file granularity resolver reserves byte-hash for non-parseable inputs

### REQ-GROUND-12e — anchorless rule rejected (guard)

### SCN-GROUND-12e-1 — a rule with no artifact anchor is rejected (guard)

source: REQ-GROUND-12e
Given a rule with **no** artifact anchor at all (neither a symbol, a section block, nor a byte-hash file)
When it is grounded
Then it stays anchorless and is **rejected** (fail-closed)
teeth: breaks-on "an anchorless rule is admitted — a rule with no anchor enters the gate ungrounded and can never drift"
gen: conformance

---

## REQ-GROUND-13 — advisory drift is non-blocking

### REQ-GROUND-13a — predicate drift takes the KNOW-5 split (happy)

### SCN-GROUND-13a-1 — a predicate fact is routed to the KNOW-5 split (happy)

source: REQ-GROUND-13a
Given a **predicate** fact carrying a re-runnable `check`, whose grounding drifts
When the drift-router `route(fact)` runs
Then it is **delegated to the KNOW-5 mechanical/semantic split** (`kind==='predicate' ⇒ delegate`)
teeth: breaks-on "a predicate fact is routed to the advisory `STALE` arm — its re-runnable `check` is never re-run (the mechanical arm is skipped)"
gen: conformance # `grounding/ref/drift.ts` router (predicate arm delegated to KNOW-5 per §GROUND-13)

### REQ-GROUND-13b — advisory drift resolves to STALE (happy)

### SCN-GROUND-13b-1 — an advisory fact's drift resolves to STALE (happy)

source: REQ-GROUND-13b
Given an **advisory** fact (no `check`) whose grounding drifts
When `route(fact)` runs
Then it resolves to `STALE` — served-with-flag
teeth: breaks-on "advisory drift resolves to `DRIFTED` (a hard verdict) instead of `STALE` — a served advisory becomes a blocking failure"
gen: conformance

### REQ-GROUND-13c — advisory never forced into an arm (guard)

### SCN-GROUND-13c-1 — an advisory is never routed into a KNOW-5 arm (guard)

source: REQ-GROUND-13c
Given an advisory fact (no `check`) whose grounding drifts
When `route(fact)` runs
Then it is **not** routed into either arm of the KNOW-5 split (neither mechanical nor semantic) — it stays on the advisory→`STALE` path
teeth: breaks-on "the advisory is forced into the semantic arm — a fact with no `check` is fed to the KNOW-5 split it has no oracle for"
gen: conformance

### REQ-GROUND-13d — advisory never silently re-grounded (guard)

### SCN-GROUND-13d-1 — a drifted advisory is not silently re-grounded (guard)

source: REQ-GROUND-13d
Given an advisory fact anchored to `sh-arr-01` whose cited unit moved to `sh-arr-02` (drift)
When `route(fact)` runs
Then the anchor stays `sh-arr-01` — the advisory is **never silently re-grounded** to `sh-arr-02`; it is flagged `STALE`
teeth: breaks-on "the router silently re-grounds the advisory (anchor auto-updated `sh-arr-01→sh-arr-02`) — the drift is hidden and the stale claim reads FRESH"
gen: conformance

### REQ-GROUND-13e — STALE advisory never blocks a merge (guard)

### SCN-GROUND-13e-1 — a STALE advisory does not block a merge (guard)

source: REQ-GROUND-13e
Given an advisory fact resolved to `STALE`
When a merge is attempted with that fact in scope
Then `blocksMerge = false` — the STALE advisory does not gate the merge
teeth: breaks-on "a `STALE` advisory sets `blocksMerge = true` — a non-blocking advisory gates the merge (advisory becomes a hard failure)"
gen: conformance

---

## Coverage ledger (S3 completeness facet)

- **REQ coverage:** 35/35 REQ have ≥1 SCN.
- **Guard coverage:** 21/21 unwanted/If-then clauses have a guard SCN — 1b, 1c, 2b, 3a, 3b, 3c, 5b, 6, 7b, 7c, 8, 9-1, 10b, 11b, 11d, 11e, 12c, 12e, 13c, 13d, 13e.
- **Teeth (Gate 3):** 38/38 SCN name the exact mutant of their REQ they flip to BROKEN on; none vacuous. The PBT witnesses are interesting (a real DRIFTED-but-grounded gate input for 4-1, a genuine re-gate laundering attempt for 4-2, a real callee interface-change vs pure-body-refactor pair for 11a/11b/11c/11d, a genuine FRESH-but-false fact for 11e — no antecedent-failure passes).
- **DEFINE-parametric SCN:** 2 — SCN-GROUND-4-3 (`Θ_A1` HOLDS→NA downgrade threshold, spec A-1) and SCN-GROUND-9-2 (`(F, κ)` missing-field/over-cap rule, spec A-13); both `gen: residue`, concrete value deferred to the pending reconciliation lift.
- **gen histogram:** PBT 8 (4-1, 4-2, 11a, 11b, 11c, 11d, 11e, 11f) · conformance 28 (1a, 1b, 1c, 2a, 2b, 3a, 3b, 3c, 5a, 5b, 6, 7a, 7b, 7c, 8, 9-1, 10a, 10b, 12a, 12b, 12c, 12d, 12e, 13a, 13b, 13c, 13d, 13e) · residue 2 (4-3, 9-2).

---

## Held-out second fixtures (Wave H · S3 governed re-freeze)

> **Why:** the execution GATE holds back a second fixture the builder never sees. If the builder overfit
> fixture-1 (hard-coded its concrete answer), the held-out leg FAILS. This only bites when the 2nd fixture is
> **genuinely independent** — DIFFERENT concrete data exercising the SAME behaviour/branch. Every held-out SCN
> below is `held_out: true`, GROUNDED in the same frozen `up-property`/`down-model` as its sibling
> (`method-tags-grd.md`), and INVENTS NO NEW BEHAVIOUR — it is a fresh data instance of the already-frozen
> function under test, with its own `teeth: breaks-on`.
>
> **Scope:** one held-out fixture per `gen: conformance` SCN (28). **PBT** SCNs (4-1, 4-2, 11a–11f) are
> **skipped** — their held-out surface is subsumed by the property corpus in `properties-grd.md`. The two
> `gen: residue` SCNs (4-3 `Θ_A1`, 9-2 `(F, κ)`) are **skipped** — DEFINE-parametric, held-out deferred with
> the pending A-1 / A-13 reconciliation lift (fabricating a concrete second value would forge the open spec).

Independent held-out fixture universe (a parallel data family — different anchors, subtrees, drift states — reusing the identical `@orchestra/kernel` encoder seam):

| fixture                               | subtreeHash / rState                                                                                      | on edit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | notes                                |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| `U_tax` = `pricing.ts › computeVat()` | `sh-tax-01`                                                                                               | **blank-line-separated** license-header-above / unrelated-rename-elsewhere ⇒ **still `sh-tax-01`** (the unit's own bytes are untouched); real change `20→21` ⇒ `sh-tax-02`; **comment-reindent INSIDE the unit ⇒ `sh-tax-0R` — it MOVES**; **a CONTIGUOUS leading comment above the decl is its bound doc-comment ⇒ editing it MOVES** <!-- AMENDED 2026-08-02 with REQ-GROUND-5b. AMENDED 2026-08-09 (ADR-0014): header-above is FRESH only when blank-line-separated; a contiguous leading comment drifts the unit --> | cited unit of `F_tax`                |
| `E_tax` (grounding entry on `U_tax`)  | anchor.subtreeHash `sh-tax-01`, displayLines `[88-96]`, source `trusted`                                  | a **blank-line-separated** license-header-above shifts displayLines `[88-96]→[95-103]`, subtreeHash **unchanged** (a contiguous one would move the hash — ADR-0014)                                                                                                                                                                                                                                                                                                                                                      | —                                    |
| `E_lronly2`                           | anchor: line-range `[88-96]` only, **no** subtreeHash                                                     | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | invalid anchor                       |
| `E_empty2`                            | anchor.subtreeHash `""` (empty), displayLines `[88-96]`                                                   | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | ungrounded entry                     |
| `E_gone2`                             | cites a unit/path that was **deleted**                                                                    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | unresolvable citation                |
| `U_ship` = callee `shipRate()`        | interface `rState ir-shp-01`, full-body subtreeHash `sh-shp-01`                                           | signature change (param added) ⇒ `ir-shp-02` (body `sh-shp-02`); pure-body refactor ⇒ interface **`ir-shp-01`** unchanged, body `sh-shp-01r`                                                                                                                                                                                                                                                                                                                                                                             | callee in `F_disc`'s forward-closure |
| `F_disc`                              | own grounding subtreeHash `sh-disc-01`, forward-closure `{U_ship}`                                        | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | caller fact                          |
| `SECURITY.md` (parseable)             | `## Retention` block `sh-sec-ret-01`; `## Access` block `sh-sec-acc-01`; whole-file byte-hash `bh-sec-01` | edit `## Access` ⇒ `sh-sec-acc-02`, byte-hash ⇒ `bh-sec-02`; `## Retention` block **unchanged** `sh-sec-ret-01`                                                                                                                                                                                                                                                                                                                                                                                                          | anchor of rule `R_audit`             |
| `DIAGRAM.png` (non-parseable)         | whole-file byte-hash `bh-diag-01`                                                                         | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | reserved byte-hash case              |
| `R_audit`                             | rule "all mutations must be audit-logged", anchor = `SECURITY.md#Retention` block `sh-sec-ret-01`         | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | repo-wide, no symbol anchor          |
| `F_tax`                               | fact anchored to `U_tax` (subtreeHash `sh-tax-01`)                                                        | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | cited-unit fact (GROUND-5)           |

Held-out gate candidates (`Status × grounded × Freshness`) for GROUND-4/7/8 legs:

| cand      | status | grounded | freshness | source        | `gateHolds`                                   |
| --------- | ------ | -------- | --------- | ------------- | --------------------------------------------- |
| `d_hold`  | HOLDS  | true     | FRESH     | trusted       | **HOLDS**                                     |
| `d_drift` | HOLDS  | true     | DRIFTED   | trusted       | **NA** (downgrade)                            |
| `d_ungr`  | HOLDS  | false    | —         | trusted       | **NA** (downgrade)                            |
| `d_na`    | NA     | —        | —         | trusted       | **NA** (pass-through)                         |
| `d_untr`  | HOLDS  | true     | FRESH     | **untrusted** | filtered **before** the gate ⇒ can never HOLD |

---

### SCN-GROUND-1a-2 — drift keys off subtreeHash alone (held-out) (happy)

source: REQ-GROUND-1a
Given `E_tax` (anchor.subtreeHash `sh-tax-01`); run A recomputes the cited unit after a **blank-line-separated license header added above it** (the unit's own bytes and minted key untouched, its line-range shifted; a contiguous header would be the unit's bound doc-comment and move the hash — ADR-0014), run B recomputes it after a real VAT edit `20→21` (`sh-tax-02`) <!-- AMENDED 2026-08-02 with SCN-GROUND-1a-1: run A was a comment-reindent, which MOVES the raw-source-slice hash; the old tooth named the shipped oracle as its failure mode -->
When `driftDetect(E_tax)` reads its oracle in each run
Then run A is `FRESH` and run B is `DRIFTED` — the verdict tracks **`subtreeHash`** and nothing else
teeth: breaks-on "the oracle folds the unit's line-range — run A (bytes-equal but shifted down the file) flips to `DRIFTED`, the false alarm the subtreeHash oracle exists to suppress"
held_out: true
gen: conformance # independent-data leg of SCN-GROUND-1a-1 (differential vs `grounding/ref/anchor.ts`)

### SCN-GROUND-1b-2 — a pure line-shift does not drift (held-out) (guard)

source: REQ-GROUND-1b
Given `E_tax` whose subtreeHash stays `sh-tax-01` while a **blank-line-separated** license header added above shifts its displayLines `[88-96]→[95-103]` (a contiguous header would be the unit's bound doc-comment and move the hash — ADR-0014)
When `driftDetect(E_tax)` runs
Then the verdict is `FRESH` — the displayLines change did **not** participate in drift
teeth: breaks-on "`displayLines` is folded into the oracle — the license-header line-shift flips the still-anchored `E_tax` to `DRIFTED`"
held_out: true
gen: conformance # independent-data leg of SCN-GROUND-1b-1 (drift invariant to `displayLines`)

### SCN-GROUND-1c-2 — a line-range-only anchor is rejected (held-out) (guard)

source: REQ-GROUND-1c
Given `E_lronly2` — a `StructRef` carrying only the line-range `[88-96]` and **no** subtreeHash
When the anchor is validated at ground time
Then it is rejected as an **invalid anchor** (fail-closed); no grounding entry is built from it
teeth: breaks-on "a line-range-only anchor is accepted — `E_lronly2` survives, and every unrelated line-shift silently drifts or fails to drift it"
held_out: true
gen: conformance # independent-data leg of SCN-GROUND-1c-1 (`anchor.ts` rejects a `subtreeHash`-less `StructRef`)

### SCN-GROUND-1d-2 — the citation re-derives on an independent fixture (held-out) (happy)

source: REQ-GROUND-1d
Given the bytes `B_vat` of `U_tax` = `pricing.ts › computeVat()`, whose evidence is the comment `NOT 0.19 since 2021`
When a span is minted over that clause, AND separately over every legal range of `B_vat` in a sweep
Then every range comes back byte-identical to the corresponding slice of `B_vat`, and no minted span's serialization contains the text it addresses
teeth: breaks-on "the round-trip is hard-coded to one offset pair" AND on "a `quote`/`excerpt` field is added — the sweep would carry the whole file back in the receipts"
held_out: true
gen: conformance # independent-data leg of SCN-GROUND-1d-1 (different unit, different evidence, range sweep)

### SCN-GROUND-1f-2 — an edit OUTSIDE the cited range still refuses (held-out) (guard)

source: REQ-GROUND-1f
Given the span over `NOT 0.19 since 2021` in `B_vat`, and `B_vat'` — the same file with `net * 0.2` → `net * 0.3`, an edit that touches NEITHER the cited range NOR the length
When the citation is read against `B_vat'`, against empty/truncated/appended bytes, and against a span whose digest was swapped for another real content digest
Then every one of them REFUSES — the span addresses the WHOLE content, so nothing outside the range is exempt from the check
teeth: breaks-on "the read verifies only the sliced bytes — an edit elsewhere in the file then reads clean and the citation silently rests on content that changed"
held_out: true
gen: conformance # independent-data leg of SCN-GROUND-1f-1

### REQ-GROUND-1g — the offsets are UTF-8 bytes, and a whole-file anchor carries no span (guard) <!-- ADDED 2026-08-03, task #159 -->

### SCN-GROUND-1g-1 — a multi-byte character BEFORE the unit does not move the citation (guard)

source: REQ-GROUND-1g
Given `B_uni` — a source file whose anchored unit `export function validaçãoDePagamento` is preceded by `// café ☕` and `const emoji = "🚀 launch"`, so that the unit's UTF-16 offset (64) and its UTF-8 byte offset (71) differ by 7
When the unit is addressed by BYTE offset and read back, and separately when the same unit is addressed by the UTF-16 offset `web-tree-sitter` reports for it
Then the byte-addressed read returns the unit byte-for-byte, and the UTF-16-addressed read returns a DIFFERENT, shifted slice that is NOT refused — the digest cannot detect a wrong-unit offset, so the conversion is the producer's obligation
teeth: breaks-on "the fixture is ASCII, where all three counting systems agree and the whole hazard is invisible" AND on "`splitsCodePoint` is assumed to catch a mis-unit offset — it only rejects a boundary that lands mid-code-point"
gen: conformance # both readings executed against the built `bindSpan`; the shifted slice is asserted, not merely shown unequal

### SCN-GROUND-1g-2 — a `file` anchor carries no span, and the digest survives the UTF-8 round trip (guard)

source: REQ-GROUND-1g
Given the entry a `file`-kind site produces, and byte sequences that are well-formed UTF-8 (ASCII, astral `🚀`, NFD-decomposed `café`) alongside one that is malformed (a lone `0xFF`)
When the entry's `span` is inspected, and a span minted over the decoded-then-re-encoded bytes is read back against the RAW file bytes
Then the `file` entry has no `span` key at all — not `0..len`, not `0..0`, not a sentinel — and the read succeeds byte-identically for every well-formed case while REFUSING the malformed one
teeth: breaks-on "a whole-file span is emitted as a harmless default, asserting a located citation nobody made" AND on "the digest is assumed to be over the file's stored bytes — it is over their UTF-8 re-encoding, which differs for malformed input"
gen: conformance # the round-trip legs are measured against the built module, not asserted from the docstring

### SCN-GROUND-2a-2 — real iff ≥1 entry AND every entry non-empty (held-out) (happy)

source: REQ-GROUND-2a
Given `g_full2 = {E_tax(sh-tax-01), E3(sh-tax-01b)}` (both non-empty) and `g_partial2 = {E_tax(sh-tax-01), E_empty2("")}` (one entry has an empty subtreeHash)
When `isGrounded` is evaluated on each
Then `isGrounded(g_full2) = true` and `isGrounded(g_partial2) = false` — the predicate is `≥1 entry ∧ **every** entry non-empty`
teeth: breaks-on "the `every` conjunct is weakened to `some` (AND→OR) — `g_partial2` wrongly counts as real"
held_out: true
gen: conformance # independent-data leg of SCN-GROUND-2a-1 (differential vs `ground.ts` `isGrounded`)

### SCN-GROUND-2b-2 — an ungrounded grounding never surfaces FRESH (held-out) (guard)

source: REQ-GROUND-2b
Given the ungrounded grounding `g_empty2 = {}` (0 entries) and `g_partial2` (one empty-subtreeHash entry)
When `driftDetect` runs on each
Then each returns `DRIFTED` — **never** `FRESH`
teeth: breaks-on "`driftDetect` returns `FRESH` when `isGrounded` is false — `g_empty2` surfaces FRESH and passes the truth gate"
held_out: true
gen: conformance # independent-data leg of SCN-GROUND-2b-1 (empty/partial groundings never FRESH)

### SCN-GROUND-3a-2 — `ground()` drops a dangling citation (held-out) (guard)

source: REQ-GROUND-3a
Given a fact whose grounding cites `E_gone2` (its unit/path was deleted) alongside the resolvable `E_tax`
When `ground()` runs
Then the grounding is **empty** — `E_gone2` is never retained, and `E_tax` does not stand in for it; `isGrounded` is false and `driftDetect` reads `DRIFTED` <!-- AMENDED 2026-08-02 with REQ-GROUND-3a -->
teeth: breaks-on "`ground()` retains the unresolvable entry — `E_gone2` persists in the grounding set and later reads as anchored" · breaks-on "`ground()` returns `E_tax` alone — the fact reads FRESH on evidence that is partly deleted"
held_out: true
gen: conformance # independent-data leg of SCN-GROUND-3a-1 (`ground.ts` total-by-construction refusal)

### SCN-GROUND-3b-2 — a gone unit drifts, never freshens (held-out) (guard)

source: REQ-GROUND-3b
Given a grounding whose only entry is `E_gone2` (unit deleted)
When `driftDetect()` runs
Then the verdict is `DRIFTED` (fail-closed) — not `FRESH`
teeth: breaks-on "`driftDetect` returns `FRESH` for `E_gone2` — a deleted citation is treated as still-anchored (fail-open)"
held_out: true
gen: conformance # independent-data leg of SCN-GROUND-3b-1

### SCN-GROUND-3c-2 — arbitrary/absent citations return, never throw (held-out) (guard)

source: REQ-GROUND-3c
Given a **seed-disjoint, corner-class-disjoint** PBT-fuzz stream (10k cases biased toward a DIFFERENT corner set than 3c-1: deeply-nested absent paths, unicode-mangled unit names, null/empty-string and duplicate citations) fed to `ground()` and `driftDetect()` side-by-side against the reference
When each entry point is invoked on each fuzzed citation
Then every call **returns** a value (drop / `DRIFTED`) — **0 exceptions thrown** — and prod matches ref
teeth: breaks-on "a unicode-mangled absent-path citation raises an uncaught exception instead of being dropped — resolution is non-total on the held-out corner class"
held_out: true
gen: conformance # independent corpus (disjoint seed + corner class) — differential vs the total reference `ground`/`driftDetect`

### SCN-GROUND-5a-2 — a real change to the cited unit drifts it (held-out) (happy)

source: REQ-GROUND-5a
Given `F_tax` anchored to `U_tax` (subtreeHash `sh-tax-01`); the cited unit's VAT rate constant is changed `20→21`, recomputing its subtree hash to `sh-tax-02`
When `driftDetect(F_tax)` runs
Then the verdict is `DRIFTED` — a real change is caught
teeth: breaks-on "a normalizer is landed on the oracle and erases the `20→21` change — a genuinely changed unit stays `FRESH` (a false-negative that hides a stale fact)"
held_out: true
gen: conformance # independent-data leg of SCN-GROUND-5a-1 (differential vs the reference oracle/`driftDetect`)

### SCN-GROUND-5b-2 — comment-reindent + license-above + unrelated-rename stay FRESH (held-out) (guard)

source: REQ-GROUND-5b
Given `F_tax` on `U_tax`, then two edits that do not touch the cited unit — a blank-line-separated license header added above (a contiguous one would be the unit's bound doc-comment and DRIFT it — ADR-0014), and an unrelated helper renamed elsewhere — leaving the unit's own bytes and its minted key invariant; and separately a comment-reindent INSIDE the cited unit
When `driftDetect(F_tax)` runs after each edit
Then the two non-touching edits verdict `FRESH` — 0 false drift — and the in-unit reindent verdicts `DRIFTED`, which is the oracle's stated limit, not a defect <!-- AMENDED 2026-08-02 with REQ-GROUND-5b -->
teeth: breaks-on "the license-header add drifts a still-true fact — the anchor key carries a byte offset and any line inserted above re-keys it" · breaks-on "an in-unit comment reindent reads FRESH — a normalizer landed and the oracle can no longer see a change inside a template literal"
held_out: true
gen: conformance # independent irrelevant-edit corpus vs the reference oracle (disjoint from 5b-1's edit class)

### SCN-GROUND-6-2 — an ungrounded fact never enters at emit (held-out) (guard)

source: REQ-GROUND-6
Given a fact whose grounding is `g_partial2` (one empty-subtreeHash entry ⇒ `isGrounded = false`) presented to the admission decision
When the `emit` admission decision runs — `admit(fact)`
Then `admit = false` and **0 bytes** are persisted — the ungrounded fact does not enter
teeth: breaks-on "`admit` returns true when `isGrounded(fact.grounding)` is false — the `g_partial2`-grounded fact is written to the store"
held_out: true
gen: conformance # independent-data leg of SCN-GROUND-6-1 (`admit.ts` truth-door)

### SCN-GROUND-7a-2 — truth passes ∧ not harmful ⇒ admitted (held-out) (happy)

source: REQ-GROUND-7a
Given two facts: `G_both` re-checks `FRESH` ∧ is **labelled** not-harmful-to-store (both doors pass); `G_harm` re-checks `FRESH` but is **labelled** harmful to store (PII — the truth door passes, the harm door fails)
When `admit()` runs on each
Then `G_both` is **admitted** and `G_harm` is **blocked** — `admit = truthDoor ∧ ¬harmfulToStore`
teeth: breaks-on "`admit` is wired as `truthDoor ∨ ¬harmfulToStore` — the PII-bearing fact `G_harm` (which must be blocked) is then wrongly **admitted**"
held_out: true
gen: conformance # independent-data leg of SCN-GROUND-7a-1 (admission conjunction; obviousness is not an input)

### SCN-GROUND-7b-2 — a true-but-obvious fact is admitted with a low score (held-out) (guard)

source: REQ-GROUND-7b
Given a fact that passes the truth door (grounded ∧ FRESH ⇒ `HOLDS`), is **labelled** obvious, and is not harmful to store
When `admit(fact)` runs
Then the fact is **admitted** carrying a **low obviousness score** — obviousness is scored, never a veto (ADR-0012)
teeth: breaks-on "a resurrected obviousness veto (`admit = truthDoor ∧ nonObvious`) — this true-but-obvious fact is rejected"
held_out: true
gen: conformance # independent-data leg of SCN-GROUND-7b-1

### SCN-GROUND-7c-2 — failing either door blocks (held-out) (guard)

source: REQ-GROUND-7c
Given fact `C` failing only the **truth** door (ungrounded via `g_partial2`, but not harmful), fact `D` failing only the **harm** door (grounded ∧ FRESH, but PII-bearing), and fact `D_obv` failing neither while labelled obvious
When `admit` runs on each
Then `C` and `D` are **blocked** — failing either door alone is sufficient — and `D_obv` is **admitted**, because obviousness is not a door
teeth: breaks-on "`admit` ignores a single failed door — fact `C` (failed truth door) is admitted — or treats the obvious axis as a door, blocking `D_obv`"
held_out: true
gen: conformance # independent-data leg of SCN-GROUND-7c-1

### SCN-GROUND-8-2 — an untrusted-source claim never reaches the gate (held-out) (guard)

source: REQ-GROUND-8
Given `d_untr` — a claim that is grounded ∧ FRESH in every respect **except** its source is `untrusted`
When the gate's candidate set is built and `gateHolds` runs
Then `d_untr` is **filtered out before** gating (lands advisory) — it can never contribute a `HOLDS`
teeth: breaks-on "the provenance filter is dropped — `d_untr` reaches `gateHolds` and yields `HOLDS`"
held_out: true
gen: conformance # independent-data leg of SCN-GROUND-8-1 (`gate.ts` filters `source==='untrusted'` pre-gate)

### SCN-GROUND-9-3 — a second free-prose fact is rejected at emit (held-out) (guard)

source: REQ-GROUND-9
Given a different free-prose fact (a raw markdown paragraph blob, not the fixed template shape) presented at `emit`
When `validateTemplate(fact)` runs
Then it is **rejected** and **0 bytes** are persisted — no free-prose fact enters
teeth: breaks-on "the validator is free-prose-tolerant — this raw prose blob is persisted"
held_out: true
gen: conformance # held-out sibling of SCN-GROUND-9-1 (differential vs `admit.ts` template validator). NB: `-2` is the DEFINE-parametric A-13 residue, so this held-out takes `-3`; independent of the residue.

### SCN-GROUND-10a-2 — every subtreeHash follows the swapped seam (held-out) (happy)

source: REQ-GROUND-10a
Given the anchor builder parametrized by the `@orchestra/kernel` `Encoder` seam, run twice over the **held-out** fixtures (`U_tax` / `U_ship` / `SECURITY.md`) — once seam = BLAKE3, once seam = a **different** stub digest (an FNV-style stub distinct from 10a-1's)
When every `subtreeHash` in the run is computed under each encoder
Then every `subtreeHash` **follows the swapped seam** (the two runs differ only in digest bytes) — 0 values diverge from the seam
teeth: breaks-on "an anchor path inlines its own `blake3(...)` — the inlined value does **not** follow the swapped FNV stub, so the substitution run diverges on the held-out fixtures"
held_out: true
gen: conformance # independent fixture set + distinct stub — seam-substitution (KERNEL-2 pattern)

### SCN-GROUND-10b-2 — no off-seam digest call site exists (held-out) (guard)

source: REQ-GROUND-10b
Given the grounding module graph including a transitively-imported helper that re-exports node `crypto.createHash`
When it is audited for any direct `sha256`/`md5`/`crc32`/`createHash` import or call outside the `@orchestra/kernel` seam
Then **0** off-seam hash call sites are found — the digest stays swappable
teeth: breaks-on "the re-exported `createHash` helper is called to hash off-seam — an off-seam `subtreeHash` is produced that the seam swap cannot reach"
held_out: true
gen: conformance # independent off-seam digest family + call shape — seam-substitution differential + static grep (Acceptance §8)

### SCN-GROUND-12a-2 — a symbol-less repo-wide rule is groundable (held-out) (happy)

source: REQ-GROUND-12a
Given `R_audit` ("all mutations must be audit-logged") — a genuinely repo-wide rule with **no single symbol anchor** — and the policy artifact `SECURITY.md`
When it is grounded at the spatial `repo`/`project` level
Then it is **groundable**, anchored to the `SECURITY.md` policy artifact — `isGrounded(R_audit) = true`
teeth: breaks-on "a rule with no symbol anchor is rejected as ungroundable — the legitimate repo-wide rule `R_audit` can never be grounded"
held_out: true
gen: conformance # independent-data leg of SCN-GROUND-12a-1 (repo/project-level policy-artifact anchoring)

### SCN-GROUND-12b-2 — the anchor is the section block's subtreeHash (held-out) (happy)

source: REQ-GROUND-12b
Given `R_audit` grounded to the parseable `SECURITY.md`, whose `## Retention` section block has subtreeHash `sh-sec-ret-01` and the whole file has byte-hash `bh-sec-01`
When `resolveAnchor(R_audit)` runs
Then the resolved anchor is the **section block's `subtreeHash`** `sh-sec-ret-01` — not the whole-file byte-hash `bh-sec-01`
teeth: breaks-on "the anchor resolver keys off the whole-file byte-hash — `resolveAnchor(R_audit)` returns `bh-sec-01` ≠ `sh-sec-ret-01`"
held_out: true
gen: conformance # independent-data leg of SCN-GROUND-12b-1 (block-level CAS-node resolver)

### SCN-GROUND-12c-2 — an unrelated section edit does not drift the rule (held-out) (guard)

source: REQ-GROUND-12c
Given `R_audit` anchored to `SECURITY.md#Retention` (`sh-sec-ret-01`); an **unrelated** edit to the `## Access` section changes `sh-sec-acc-01→sh-sec-acc-02` and the whole-file byte-hash `bh-sec-01→bh-sec-02`, while `## Retention` stays `sh-sec-ret-01`
When `driftDetect(R_audit)` runs
Then the verdict is `FRESH` — the block anchor is invariant to an unrelated edit elsewhere in the file
teeth: breaks-on "the rule is anchored on the whole-file byte-hash — the unrelated `## Access` edit (byte-hash `bh-sec-02`) drifts every rule in the file (byte-fragility re-imported)"
held_out: true
gen: conformance # independent-data leg of SCN-GROUND-12c-1

### SCN-GROUND-12d-2 — a non-parseable policy file uses the whole-file byte-hash (held-out) (happy)

source: REQ-GROUND-12d
Given a rule grounded to `DIAGRAM.png` — a genuinely **non-parseable** policy file (no section structure to resolve), whole-file byte-hash `bh-diag-01`
When the anchor is resolved
Then the whole-file **byte-hash** `bh-diag-01` is used — the reserved case for non-parseable files
teeth: breaks-on "the resolver refuses the whole-file byte-hash for `DIAGRAM.png` (demands a section block it cannot parse) — a genuinely non-parseable policy file can never be grounded"
held_out: true
gen: conformance # independent-data leg of SCN-GROUND-12d-1 (byte-hash reserved for non-parseable inputs)

### SCN-GROUND-12e-2 — a rule with no artifact anchor is rejected (held-out) (guard)

source: REQ-GROUND-12e
Given a different rule with **no** artifact anchor at all (neither a symbol, a section block, nor a byte-hash file)
When it is grounded
Then it stays anchorless and is **rejected** (fail-closed)
teeth: breaks-on "an anchorless rule is admitted — this rule with no anchor enters the gate ungrounded and can never drift"
held_out: true
gen: conformance # independent-data leg of SCN-GROUND-12e-1

### SCN-GROUND-13a-2 — a predicate fact is routed to the KNOW-5 split (held-out) (happy)

source: REQ-GROUND-13a
Given a different **predicate** fact carrying a re-runnable `check` (a test-count assertion), whose grounding drifts
When the drift-router `route(fact)` runs
Then it is **delegated to the KNOW-5 mechanical/semantic split** (`kind==='predicate' ⇒ delegate`)
teeth: breaks-on "the predicate fact is routed to the advisory `STALE` arm — its re-runnable `check` is never re-run (the mechanical arm is skipped)"
held_out: true
gen: conformance # independent-data leg of SCN-GROUND-13a-1 (`drift.ts` router)

### SCN-GROUND-13b-2 — an advisory fact's drift resolves to STALE (held-out) (happy)

source: REQ-GROUND-13b
Given a different **advisory** fact (no `check`) whose grounding drifts
When `route(fact)` runs
Then it resolves to `STALE` — served-with-flag
teeth: breaks-on "advisory drift resolves to `DRIFTED` (a hard verdict) instead of `STALE` — this served advisory becomes a blocking failure"
held_out: true
gen: conformance # independent-data leg of SCN-GROUND-13b-1

### SCN-GROUND-13c-2 — an advisory is never routed into a KNOW-5 arm (held-out) (guard)

source: REQ-GROUND-13c
Given a different advisory fact (no `check`) whose grounding drifts
When `route(fact)` runs
Then it is **not** routed into either arm of the KNOW-5 split (neither mechanical nor semantic) — it stays on the advisory→`STALE` path
teeth: breaks-on "the advisory is forced into the semantic arm — a fact with no `check` is fed to the KNOW-5 split it has no oracle for"
held_out: true
gen: conformance # independent-data leg of SCN-GROUND-13c-1

### SCN-GROUND-13d-2 — a drifted advisory is not silently re-grounded (held-out) (guard)

source: REQ-GROUND-13d
Given an advisory fact anchored to `sh-tax-01` whose cited unit moved to `sh-tax-02` (drift)
When `route(fact)` runs
Then the anchor stays `sh-tax-01` — the advisory is **never silently re-grounded** to `sh-tax-02`; it is flagged `STALE`
teeth: breaks-on "the router silently re-grounds the advisory (anchor auto-updated `sh-tax-01→sh-tax-02`) — the drift is hidden and the stale claim reads FRESH"
held_out: true
gen: conformance # independent-data leg of SCN-GROUND-13d-1

### SCN-GROUND-13e-2 — a STALE advisory does not block a merge (held-out) (guard)

source: REQ-GROUND-13e
Given a different advisory fact resolved to `STALE`
When a merge is attempted with that fact in scope
Then `blocksMerge = false` — the STALE advisory does not gate the merge
teeth: breaks-on "this `STALE` advisory sets `blocksMerge = true` — a non-blocking advisory gates the merge (advisory becomes a hard failure)"
held_out: true
gen: conformance # independent-data leg of SCN-GROUND-13e-1

---

## Held-out coverage ledger (Wave H · S3 re-freeze)

- **conformance REQs (28):** 1a, 1b, 1c, 2a, 2b, 3a, 3b, 3c, 5a, 5b, 6, 7a, 7b, 7c, 8, 9-1, 10a, 10b, 12a, 12b, 12c, 12d, 12e, 13a, 13b, 13c, 13d, 13e.
- **held-out added (28):** one `held_out: true` second fixture per conformance SCN — 1a-2, 1b-2, 1c-2, 2a-2, 2b-2, 3a-2, 3b-2, 3c-2, 5a-2, 5b-2, 6-2, 7a-2, 7b-2, 7c-2, 8-2, **9-3** (9-2 is the residue), 10a-2, 10b-2, 12a-2, 12b-2, 12c-2, 12d-2, 12e-2, 13a-2, 13b-2, 13c-2, 13d-2, 13e-2. **Every conformance REQ now carries a held-out leg ⇒ the execution GATE's held-out leg is AVAILABLE (FULL assurance).**
- **skipped — PBT (8):** 4-1, 4-2, 11a, 11b, 11c, 11d, 11e, 11f — held-out surface subsumed by `properties-grd.md`.
- **skipped — residue (2):** 4-3 (`Θ_A1`, spec A-1) and 9-2 (`(F, κ)`, spec A-13) — DEFINE-parametric; held-out deferred with the pending reconciliation lift (a fabricated 2nd value would forge the open spec).
- **independence:** every held-out fixture uses a **different** anchor / subtree / drift instance than its sibling (parallel `U_tax` / `U_ship` / `SECURITY.md` / `DIAGRAM.png` / `R_audit` / `d_*` universe), exercising the SAME frozen `up-property`/`down-model` — GROUNDED, no new behaviour introduced. `[NEEDS RECONCILIATION]`: none raised.
