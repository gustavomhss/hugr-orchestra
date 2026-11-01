---
name: maestro-orchestra-work-workflows
description: How workflows are listed, drafted, approved and run through the governed chain, and which holds can stop a run.
internal: true
when: The owner asks what a workflow is, why one cannot run, how to run or draft one, or what a hold code means.
not-when: The owner asks about hooks (a different feature) or about ordinary dispatch to a seat.
covers: []
---

# Workflows

A workflow is a published Relay graph that Maestro can run with parameters. Only the published version runs.

## Reading them

`maestro_workflows` is read-only and Maestro only. Without arguments it lists published workflows: id, name, description, `publishedVersionID` and `parameters` (from `${name}` placeholders). With `workflow` (id or exact name) it resolves one. A match that cannot run appears under `unavailable` with a reason. A workflow whose last step lacks the host checks `package-verification` and `cold-review` is unavailable with `WORKFLOW_GLOBAL_ACCEPTANCE_MISSING`.

## Drafting

`archie_draft_workflow` (`archie` only) saves an unpublished draft. It fails on lint errors, an invalid graph or a missing skill. In a folder that is not a git repository it says "Workflows need a git repository; this folder is not one." It never publishes or runs. Only the owner publishes.

## Running (governed chain)

Maestro loads the playbook `maestro-run-governed` first. Governed `maestro_*` tools are refused until it is loaded. The order:

1. `maestro_record_admission`
2. `maestro_catalog_context`
3. `maestro_record_plan_revision` (with `workflow` and parameters)
4. `maestro_record_context`
5. `maestro_record_validation`
6. `maestro_request_review` (plan stage, by `lucy`)
7. `maestro_present_approval`
8. `maestro_record_approval`: only "approve" or "aprovo" approves; "decline", "declino", "cancel" or "cancelar" declines
9. `maestro_grant_authorization`
10. `task` with `authorizationID`
11. A code-stage review, then resume

One authorization allows one dispatch. Preconditions: clean git tree, a reviewable delta of at most 262144 bytes, Atlas configured, Own fresh.

## Hold codes

`WORKFLOW_CODE_REVIEW_REQUIRED`, `WORKFLOW_CODE_REVIEW_UNADDRESSED`, `WORKFLOW_CODE_REVIEW_REJECTED`, `WORKFLOW_TRANSITION_ESCALATE`, `WORKFLOW_APPROVAL_BINDING_MISMATCH`.

## Limits

- Human approval steps cannot run yet.
- Run, Use in chat, release, rerun and cancel all happen in Maestro's chat.
- Of the templates, 5 can run and 4 cannot yet.
- Seats `frankie`, `patty`, `rosie` and `billy` are not staffed and cannot take work.
