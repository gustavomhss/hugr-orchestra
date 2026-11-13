# S1 economy impact 2/2 — findings

Baseline: `158e612d4d7bd0f486a4bac91e812d7b615375da`
Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`
Scope: the two B15 economy corrections only. This is propagation, not a general review.

## B15 — changed

**Before (B15 original, §Observed implementation):**

> Required bound dimensions must be present and positive safe integers within an envelope's limit.

> `reserveAttempt` ... reuses retained completion when available and holds a previously forwarded response whose body is unavailable.

**After (B15 v2):**

> `validateBound` requires token dimensions bounded by the envelope to be present; supplied token bounds must be positive safe integers and not exceed any corresponding envelope limit. It does not validate `bound.attempts`; reservation applies the attempt limit by counting stored attempts.

> An existing attempt with a `completionRef` receives a non-consumable grant before the body or forwarding checks, without requiring a `completionBody`. Searches for another retained completion require both reference and body. If neither completion path applies, a previously forwarded existing attempt is held as response-unavailable.

**Rationale / source check:** the pinned `validateBound` iterates only `outputTokens` and `inputTokens`; `reserveAttempt` separately rejects when `rows.length + 1 > request.envelope.limits.attempts`. In the existing-attempt branch, matching fingerprint is checked, then `record.completionRef !== undefined` returns a non-consumable grant before the retained-completion search and before `record.forwardObserved` can cause response-unavailable. The separate search requires both `completion_ref !== null` and `completion_body !== null`. B15 v2 is the corrected complete body; no other B15 claims were rewritten.

## Dependents — explicit NO_CHANGE

### `s1.l4.ownership-entry`

**Before:** unchanged attributed body (SHA-256 `aac50370d83ee11af40206d6ee1cc542d1868a45397e1849b0c0c896c5e67a7b`).

**After:** NO_CHANGE — no replacement body emitted.

**Rationale:** its availability/cost triage asks whether executable/backend/route/terminal/usage was observed or merely manifest/config/status/bounds (¶72); its provider/auth and accounting rows route ownership to the relevant integration (¶83, ¶87–89). It does not claim that `bound.attempts` is validated by `validateBound`, nor describe the existing-attempt completion branch. Both B15 corrections leave its owner-routing and evidence-stop guidance semantically intact.

### `s1.l4.safe-change`

**Before:** unchanged attributed body (SHA-256 `64ccbc99fbbe86d975563f429117198ed662e126c63502965c6cb5f2399f25a0`).

**After:** NO_CHANGE — no replacement body emitted.

**Rationale:** it discusses settlement, partial effects, evidence identity and preserving unknown states at a general change-review level (§§1, 3, 5; ¶¶147, 181, 199, 207–210). It does not specify the two corrected admission branches. Neither correction changes its required proof categories or the boundary between Core ledger facts and sender/route integration.

### `s1.l4.diagnosis-maintenance`

**Before:** unchanged attributed body (SHA-256 `8ab87cd4bbebb0cb902e3b59657237a6b42b015f0376fa921385bd6d13f9e493`).

**After:** NO_CHANGE — no replacement body emitted.

**Rationale:** its timeout/accounting guidance preserves unknown usage, pending bounds and held obligations (¶¶290–300); its maintenance guidance requires re-evaluating only conclusions whose meaning, authority, validity or support changed (¶¶340–350). It does not assert validation of `bound.attempts` or require a completion body for a matching existing `completionRef`. The two corrections do not invalidate these broader safeguards.

## Limits

The source-only verification supports the two B15 corrections and the three NO_CHANGE dispositions above. It does not establish that every sender/provider path uses this ledger, session token/billing totals, any reservation/settlement/provider execution, consumer binding, maintenance completion or Genesis acceptance. No historical vote was replaced. No private oracle/review was read. No infrastructure, code or CI was changed. No independent reviewer session was available through the tools exposed in this session; no reviewer IDs or approvals are claimed.
