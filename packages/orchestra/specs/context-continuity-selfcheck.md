# Single-call Context Continuity self-check

Owner confirmed self-review means the producer checks its own result in the same generation, with no
second reviewer call. Owner then requested an executable checklist. This supersedes the mandatory paid
review in `context-continuity-quality.md`; prior results remain historical evidence for that earlier mode.

## Contract

- Normal complete maintenance uses exactly one producer stream. The producer internally checks current
  objective/Now, omitted critical facts, contradictions and completed work before emitting ordinary
  `{now,ops}` JSON. It emits neither reasoning nor a separate self-approval report.
- Host executes existing C1–C17 checks, then a synchronous retention checklist. No model, tools, I/O or
  semantic grading in that checklist. Only a named failed host check permits the existing single retry;
  at most two producer streams per pass, under the original shared deadline and disposal ownership.
- Host protects objective/rules/user-owned decisions and exact values, plus any previously protected IDs
  carried by legacy review or current checklist receipts. Unchanged items survive automatically.
- Retiring or changing protected items requires newly covered source evidence. Retirement additionally
  requires its existing explicit reason. Existing stronger user-revocation/quote rules still apply.
  Source presence is provenance, not semantic entailment; the host cannot prove a paraphrase is correct.
- New v5 artifacts have a host-owned `checklist` receipt: version 1, critical IDs and canonical digest.
  It records structural integrity/retention only, never an independent semantic review. New artifacts do
  not carry `review`. Old v4, unsealed v5 and valid legacy-reviewed v5 remain readable; corrupt old seals
  still fail. Critical IDs migrate from a legacy review without losing protection on the next pass.
- The producer index lists protected IDs and the retirement/update requirement. No new output envelope
  or paid self-evaluation schema is needed. Search, archive ownership, complete coverage and caller/model
  admission remain unchanged. Dedicated maintenance roles and tool denial remain active on API and SDK.

## Verification

1. Actual fork success performs one stream and creates a valid checklist receipt, with no reviewer.
2. Invalid exact data triggers C17, then at most one corrected producer stream; repeated failure never
   publishes a candidate. No-op and empty valid candidates still require a real completed boundary.
3. Prior critical item removed/changed without new evidence fails the named retention check. Correct
   retirement/change succeeds, while protected user-rule revocation retains its stricter checks.
4. Cold persistence preserves checklist/legacy seals; mutation of text, Now, IDs or digest fails.
5. API, SDK, replay and backend-switch fixtures assert zero review requests, preserve lifecycle/ownership
   tests, and join producer disposal before applying a candidate. Unexpected reviewer attempts fail fixtures.
6. Semantic self-check remains a prompt instruction, not a deterministic guarantee. Old paid-review proof
   does not establish new one-call quality or token savings. Call count is tested; token savings unmeasured.

No fresh paid benchmark is authorized by this change. No new file exceeds 400 LOC; retain pre-existing
large-file layout unless restructuring is necessary to implement this change safely.
