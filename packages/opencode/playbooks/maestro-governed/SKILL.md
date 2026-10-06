---
name: maestro-governed
description: Run the governed approval chain from preconditions to verified dispatch, covering admission, grounding, validation, Lucy review, owner approval, authorization and task. Use before the first governed tool call whenever the owner asks for a governed or auditable flow.
---

# Maestro Governed

## Trigger and rationale

Use only when the owner explicitly asks for governed or auditable work; normal work never needs it. The chain exists so
the owner approves exactly what will run and a durable record shows why. Each step is a `maestro_*` tool that writes an
immutable record, and later steps re-check the earlier ones. Authority comes only from those records and from the owner's
direct reply to a presentation. Copy every ID and hash from the previous tool output; never compose, shorten or guess
one. Inside the chain, call only the governed tools in order.

## Preconditions

Check these before admission. Any failure is a HOLD to report, never a reason to improvise.

1. Atlas is configured: `maestro_catalog_context` answers without a HOLD.
2. Clean tree: `git status --porcelain --untracked-files=all` prints nothing. Untracked files count.
3. Reviewable delta: Lucy reviews the committed diff from `merge-base(HEAD, <primary remote>/HEAD)` to `HEAD`, never
   your prose. It must be non-empty, and `git diff --binary --full-index --no-renames <base> HEAD | wc -c` must be at
   most 262144. The base is not a parameter: when the primary remote points at a large upstream, report the HOLD.
4. Own is fresh: no file anchored by an Own unit changed since the snapshot, committed or not.

## Procedure

1. In the same turn as the owner's request, load `frame-request` and build the `admit-request-v1` assessment.
2. `maestro_record_admission` with `methodVersion: "admit-request-v1"`. `READY_TO_DRAFT` gives the
   `admissionMessageID`; `ORIENT` means answer instead; `CLARIFY` means ask its one question and stop.
3. `maestro_catalog_context`. Note `projectID`. Choose territories by exact name and units with complete briefings:
   `truncated: false`, empty `pullReachable`, `advisoryDropped: 0`, `tokenEstimate` at most 1500, every drill unit
   present. No covering unit means HOLD; never take a nearest match.
4. `maestro_record_plan_revision`. `goal` and `reviewRequirement` are single `{value, source}` fields; `acceptance`,
   `scope` (exact territory names), `constraints`, `assumptions` and `risks` are arrays of them; `units` is an array of
   plain unit-ID strings. `source` is `stakeholder` (the owner said it), `orientation` (observed) or `maestro` (your
   proposal); never upgrade inference to stakeholder. Any changed field is a new revision.
5. Run the checks you will record (baseline tests, typecheck), then confirm the tree is still clean.
6. `maestro_record_context` with `planRevisionID`. From here until the governed task returns, change nothing in the
   working tree and run only read-only commands.
7. Write, in your reply rather than in a file, the work card with exactly one each of `## Definition of Done`,
   `## Invariants`, `## Quality Standards`, `## Completeness Criteria` and `## Success Criteria`, and separately the
   complete dispatch brief the seat will receive.
8. `maestro_record_validation` with the IDs and hashes from steps 3–6, a new `workCardID` per attempt (for example
   `stale-run-a1`), the exact card, `routedMemberID` (a roster seat, never `maestro` or `lucy`), `validatorVersion`
   (for example `validation-v1`) and `checks` observed in step 5: `{id, status: PASS | FAIL | HOLD, detail}` with
   unique ids in ascending order, such as `01-baseline`. Only `VALID` continues; keep its Bindings.
9. `maestro_request_review` with `validationRecordID`, the byte-identical card and `reviewMethodVersion: "review-v1"`.
   A receipt exists only when the output starts with `APPROVE`, `FIX_FIRST` or `REJECT` followed by an
   `evt_maestro_review_` id. `LUCY_ERROR` and `LUCY_NO_RECEIPT` mean no receipt: request once more if the cause looks
   transient, otherwise HOLD.
10. On `APPROVE`, `maestro_present_approval` with the recorded IDs and hashes (`contextRecordID` always), `intent`
    (`subagentType` equal to `routedMemberID`, `prompt` equal to the exact brief, `model` only if you will pass the
    same one), `methodVersion: "request-approval-v1"`, `plan`, `provenance`, `assumptions`, `validationLedger` and
    `contextState: "CURRENT"`. Omit `taskHash`. Present once per assistant message. Do not paste the rendered output:
    say in a few lines what will run, where to read it (Approval history) and the exact reply words, then end the turn.
11. Next turn, `maestro_record_approval`. Only `approve` or `aprovo` approve; `decline`, `declino`, `cancel` and
    `cancelar` decline, which ends the flow until a new request. On `PENDING`, answer, present again with a new
    `methodVersion` and ask for the exact word. Question-tool answers never approve. Take `approvalMessageID` from the
    Bindings line of this tool's output.
12. In the same turn, `maestro_grant_authorization` with `validationRecordID` and `approvalMessageID`; its output is the
    `authorizationID`. Any newer user message makes the approval stale.
13. In the same turn, `task` with `subagent_type`, `prompt` and `model` byte-identical to the approved intent, plus
    `authorizationID`. One authorization allows one dispatch.
14. Verify the returned work with `maestro-verify`: the chain reviewed the branch before execution, and nothing
    reviewed what the seat produced.

If a synthetic user message (a background-task result or the compaction "Continue...") lands after a presentation,
present again with a new `methodVersion`.

## Fix-and-review loop

On `FIX_FIRST` or `REJECT`, fix in normal mode, commit only with the owner's authority, and leave the tree clean at the
new `HEAD`. Then record a new plan revision, rerun the checks, record a new context and a validation with a new
`workCardID`, and request review again. A validation has exactly one review receipt. If the fix touched Own-anchored
files, expect source blob drift until Own is re-materialized.

## Errors and repeats

Rejections and HOLDs state their cause and the next step: follow it once and never retry blindly.

- Admission, context, validation and authorization return the existing record for the same input and conflict on a
  changed one. A plan revision with any changed field is a new revision.
- A repeated presentation returns the original, still bound to its first message; change `methodVersion` to present
  again.
- A repeated review request still starts a Lucy child, then returns the first receipt, so do not repeat it once a
  receipt exists.
- A repeated dispatch replays the completed child.
- A call shown as aborted has an unknown effect. For admission, plan revision, context, validation and authorization,
  call again with identical input to read the record back; for the other steps, follow the lines above.

## Success / fail

Success: an authorized task ran with the exact approved intent, its result was verified, and the report names every
record reached. HOLD: a precondition or tool returned HOLD; report the exact reason and who can resolve it, then stop.
FIX: Lucy returned `FIX_FIRST` or `REJECT`; run the fix-and-review loop. FAIL: verification of the returned work
failed; report the findings. Never: guessed or placeholder IDs, PASS for an unrun check, approval from other words,
edits between context and task, or calling the flow complete before the dispatched work is verified.

## Output schema

```text
Governed status: <last durable record reached> | HOLD <reason>
Records: admission <id>; plan <id>; context <id>; validation <id>; review <verdict id>; authorization <id>
Evidence: <checks run and results>
Open: <decision needed from the owner, or none>
```
