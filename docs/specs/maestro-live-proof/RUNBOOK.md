# Atlas → Relay live proof: owner-Mac runbook

The cloud session cannot run this proof: it has no live backend, model bridge, fixture or browser. This is the
exact order to run it on the owner's Mac against a build that contains the `governed-chain-errors` fixes. Every
step names the result that must come back; anything else is a stop, not a retry.

## Rules that made the last run fail

1. **One Session.** The Maestro Session that dispatches `archie` is the one that records the plan revision, context,
   validation, review, presentation, approval, authorization, arm and the workflow Task. The plan revision records
   the calling Session as the dispatch parent. A plan recorded elsewhere now fails with
   `UPSTREAM_ATTRIBUTION_PARENT_MISMATCH. Author Session … was dispatched by …`.
2. **The owner's `aprovo` must be the first user message after the presentation, and still the latest user message
   at dispatch.** `maestro_record_approval`, `maestro_grant_authorization` and the workflow Task dispatch
   (`workflow-host.ts:185`) each re-read it. Any message in between — an orchestration note, "go on", a repeated
   `aprovo` — voids it (`reply-not-immediate`, `approval-not-current`, `WORKFLOW_DIRECT_APPROVAL_MISSING`).
   So the whole tail runs in **the one Maestro turn that answers `aprovo`**, and its instructions go in the prompt
   *before* the presentation.
3. **Re-presenting needs a new `methodVersion`** (`request-approval-v2`, `-v3`, …). The same version after the owner
   wrote now fails with `MaestroApprovalMethodReused` instead of silently reusing the old presentation.
4. **Order: arm, then dispatch.** `relay-arm` `arm` stores the contract; the workflow Task dispatch binds it. A
   dispatch without an arm holds `WORKFLOW_NATIVE_ARM_UNBOUND`; arming after a workflow Task is bound is refused.
   (The earlier note that "dispatch writes the contract" was wrong.)
5. **`writePaths` byte-equal to the approved plan**, same order. The approved value is the plan revision's
   `workflowBinding.writePaths`, i.e. what was passed in `workflow.writePaths` to `maestro_record_plan_revision`.
   A mismatch now says `approved writePaths [...]; this Task passed [...]`.

## Steps

0. Build/run from a checkout containing this branch. Fixture: clean tree, `origin/dev` resolvable, Atlas material
   committed (as in the previous run).
1. In a new Maestro Session, dispatch one foreground `task` to `archie` (proposal-only, `writePaths: ["proposal.md"]`).
   Expect `terminal: ended`, `blockers: []`.
2. Publish the Relay document from `proposal.md`; note `documentID`, and the exact `writePaths` you will approve —
   the last proof's plan declared `src/money.ts` and `src/checkout.ts`, but that run's approved value was never
   read back, so confirm it. Write the list down once and use it byte for byte everywhere below.
3. **Same Session:** `maestro_record_admission` → `READY_TO_DRAFT`; `maestro_catalog_context`;
   `maestro_record_plan_revision` with `upstream` (dispatch IDs from step 1) and
   `workflow: { documentID, parameters, writePaths }` → `PROPOSED: evt_maestro_plan_revision_…`.
4. `maestro_record_context` → `GROUNDED`; `maestro_record_validation` → `VALID`; `maestro_request_review` →
   `APPROVE: evt_maestro_review_…`.
5. Send Maestro one prompt that both asks for the presentation and pre-loads the tail, e.g.:
   > Call maestro_present_approval (methodVersion request-approval-v1) and end the turn. When my next message is
   > exactly `aprovo`, in that same turn and without asking me anything: maestro_record_approval;
   > maestro_grant_authorization with its approvalMessageID; maestro_arsenal_describe relay-arm, then
   > maestro_arsenal_execute relay-arm action arm with contract.sessionID = this Session; then task with
   > subagent_type `backend`, the presented prompt/model byte for byte, authorizationID, workflow
   > `{documentID, planRevisionID, parameters}` and writePaths exactly `["src/money.ts", "src/checkout.ts"]`.
   Expect the presentation text and an ended turn.
6. Owner types `aprovo` — nothing else, nothing before it. Expect, in that one turn: `APPROVED`, authorization
   `evt_maestro_authorization_…`, arm token `arm-…`, and the Task dispatched.
7. If anything holds, do **not** type another message into that Session to "nudge" it. Read the HOLD (it now names
   its cause), fix the input, then re-present with the next `methodVersion` and repeat steps 5–6.
8. Read back worker 1 settlement and the step-2 reveal. Expected risk, not yet proven either way: when worker 1
   edits `src/money.ts` the Atlas grounding of the plan goes stale (`WORKFLOW_CONTEXT_SOURCE_STALE`). Record what the
   runtime says; do not relax the check.

## Not fixed here (files owned by the `archie-atlas` branch)

- `workflow-host.ts:271` (continuation-phase `WORKFLOW_APPROVED_SCOPE_MISMATCH`) still has no detail. It can use the
  new `Held.detail` after `archie-atlas` lands.
- `plan-revision.ts:146` still drops `UpstreamProvenance` messages (`reason: error.code`); the tool-level check
  covers the common case (wrong Session) only.
- `WORKFLOW_DIRECT_APPROVAL_MISSING` (`workflow-host.ts:220`) has no next step yet.
