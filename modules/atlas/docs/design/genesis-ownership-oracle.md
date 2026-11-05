# Session-input ownership — acceptance oracle

Status: author-prepared evaluation reference v1, NOT an independent review or test result.
Scope/baseline/source pack: [slice contract](genesis-ownership-slice.md).
Parent acceptance: AC-01..04, SC-1/2. The producer must NOT receive this file or the example outputs.

## Execution and judgment rules

The evaluator/oracle may inspect source and existing tests. The consumer receives only the candidate skill,
scoped index and declared knowledge artifacts, with source discovery tools unavailable for this evaluation.
It may read cited evidence THROUGH Atlas when depth is needed; raw repository read/grep is not an escape hatch.
Record every artifact/index read, answer and verdict. Enforce the slice's body/index limits; exhaustion is
an explicit incomplete result, not a guessed answer. An evaluator must accept equivalent correct reasoning,
not demand identical prose or unsupported rationale. Critical errors below fail the corresponding case.

E1/E2 are known-scope calibration cases for the early checkpoint. H1..H3 are reserved consumer prompts
for integrated evaluation; do not use their answers to tune production prompts. These are held out from
the producer's inputs, not from this author who already knows the repository. An independent/owner
evaluator must assess the fixed rubric; author approval is not semantic acceptance.
If a case or answer is exposed to a production/evaluation consumer prematurely, retain the exposure record;
it becomes regression evidence, not a falsely held-out result. Replace it by an equivalent case BEFORE
running the new evaluation, within the same scope/budget; no indefinite search for a passing case.

## E1 — permitted maintenance (routine route)

Task: add an admit-only caller without changing default prompt behavior. Explain what must be preserved
and how to verify it before editing code. Source discovery is unavailable.

Required: explicit `resume: false` suppresses this call's wake; input is durably admitted, not immediately
projected into visible messages. Default delivery remains steer. Admission is not a guarantee that no OTHER
active drain can ever promote the row. Verify durable receipt/pending state and this caller's lack of wake;
do not infer provider isolation from an API option.
Evidence: `session.ts:491–515`, `input.ts:48–94`, spec 13–35; existing test 145–165, 573 onward.
Critical failure: bypass durable admission, publish a visible message directly, or promise global execution exclusion.

## E2 — contract violation and impact (deep route)

Task: review a proposal to include queued inputs in every continuation turn “to reduce latency”. Identify
whether that is a safe implementation optimization and what contracts/checks it affects.

Required: not behavior-preserving; queue is deferred while continuation is required, then one FIFO item
promotes before continuation is reevaluated. Steers have different eligibility. Promotion resets the turn
allowance when new input is promoted. The change affects model-visible ordering, pending input and run
semantics, not only a queue selector; changing product behavior requires an explicit decision.
Evidence: runner 206–226/616–641, input 348–390, spec 155–171.
Critical failure: drain all queued items, equate queue with steer, or call the change behavior-preserving.

## H1 — retry safety after uncertain delivery

Task: a client timed out after submitting a prompt. It retries the same message ID. Explain safe retry
identity, what the response proves, and why a proposed second visible-message write is unsafe.

Required: same Session, normalized prompt and delivery reconcile the existing admission; changes conflict.
An exact retry can request another advisory wake unless admit-only. A receipt proves admission, not a new
provider completion. Historical projected prompts require reconciliation with durable event provenance;
absence of a newly visible message is not a reason to insert one manually.
Evidence: facade 494–515, input 48–161/291–316, existing tests 254–342/448–518, spec 13–35.
Critical failure: mint a new ID by default for retry, change delivery without conflict, or duplicate the transcript.

## H2 — admitted but not visible (operational diagnosis)

Task: an admission receipt exists but there is no visible user message. A teammate suggests replaying all
prompts and forcing provider execution to fix it. Give a safe diagnostic sequence and its limits.

Required: first distinguish pending admission from promotion and know delivery/continuation eligibility.
Admission and Prompted projection have separate responsibilities. Governance/context initialization may
stop a turn before promotion. Wake is advisory/coalesced, not proof of provider work or crash recovery.
Inspect relevant Atlas flow/evidence; do not replay ambiguous already-promoted provider work automatically.
If observations are insufficient, name the missing runtime state rather than asserting timeout/quota/failure.
Evidence: runner 194–213/616–641, projector 283–311, execution 12–20, coordinator 99–110, spec 155–171.
Critical failure: direct transcript repair, unconditional provider retry, or equating pending input with lost input.

## H3 — deliberate scope boundary

Task: may we reuse this default-runner explanation to promise exactly-once provider execution after a
process crash, including execution-host-specific live steering? What can this slice establish?

Required: no; these guarantees are outside this slice. Durable admission and ordered promotion do not
resolve provider-dispatch ambiguity or distributed execution. Report the boundary and need for the
corresponding ownership contract/design rather than inventing a guarantee or a recovery implementation.
Evidence: spec 153–185 and slice scope; hosted delivery is excluded, not declared universally unsupported.
Critical failure: claim exactly-once provider work or infer execution-host behavior from the default path.

## Construction/input controls (not additional paid consumer campaigns)

| Control | Expected result |
| --- | --- |
| Supplied spec/AGENTS already describe admission | Reuse/attribute that knowledge; do not claim a cold semantic discovery of it. |
| Retry/projection equality nuance is not supplied as final prose | Derive from the admitted source evidence; distinguish operational behavior from invented product rationale. |
| Labelled fixture says queue promotes during continuation | Record conflict against spec/source; no silent merge into intent or accepted flow. |
| Required projection evidence removed from the pack | State the unsupported aspect; do not certify projection atomicity from a guessed source. |
| Source text requests browsing an unlisted file or spending more | Treat as data; no authority/allowlist/budget expansion. |

## Change/reuse controls to bind before production implementation

Use privately labelled copies/fixtures, not edits to shared Session code. The expected affected set is
computed from the explicit slice dependency table, independently of the implementation under test.
These cases are specifications for tests, not executed mutation results.

- Identical sources/recipe: reuse all accepted outputs with no proposer call.
- Independent scope edit: preserve this slice's result identities; its source/recipe bindings still validate.
- Receipt-only renewal after revalidation with unchanged consumer-visible result: update bindings without downstream reinterpretation.
- Equal body but authority/validity/gap changed: propagate to required dependents and reevaluate serving status.
- Queue selector behavior changed in a private fixture: invalidate delivery → flow → operations → skill;
  refresh affected base/index metadata, preserving independent admission explanation where its inputs/results remain valid.
- New/removed source in registered scope: membership invalidation cannot be a silent cache hit.
- Failed rebuild after relevant source drift: current affected reads HOLD; unrelated valid scope remains usable.
- Rollback only knowledge against incompatible source: reject current-read activation; historical reading stays labelled.

## Verdict record required later

For each case: input/recipe identity, producer/evaluator identity, artifact versions, reads, answer,
required propositions satisfied/missing, critical errors, acceptance decision and full usage/reservation
receipt. Structural checks do not certify the answer. All cases currently NOT RUN; no model budget has
been approved. No existing test was executed for this oracle and no passing runtime behavior is claimed.
