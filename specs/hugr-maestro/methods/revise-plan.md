# Method: Revise Plan

Status: proposed V2 method. ID: `revise-plan`. Composition: M1 Frame + M2 Ground + M3 Contract.

V1 evidence: `v1-portability-register.md` ports lifecycle rule `REPLAN -> APPROVED` only through new approval;
V2 redesigns it as immutable revision lineage and execution-ineligibility projection.

## Purpose

Create one immutable successor `PlanRevision` from an existing revision, an explicit stakeholder change or
validation issue, and immutable `ScopeProposal`. It creates successor scope with `PENDING` context binding;
`assemble-context` binds current Atlas only after successor exists. Prior revision and any approval remain
immutable historical evidence; they become ineligible for new governed work.

```text
REVISED   proposed vN+1; prior approval ineligible; next owner assemble-context
CLARIFY   one material change decision missing; next owner clarify-decision
HOLD      lineage/context/change evidence invalid; no revision/task
```

## Trigger

Stakeholder requests an alteration, `validate-plan` returns `INVALID`, or plan owner explicitly requests revision
of a current proposal/approval. `resolve-scope` runs before this method when scope may change. A stale bound
context re-enters `assemble-context` for unchanged revision.

## Inputs

```text
priorRevisionId      immutable vN revision and content hash
changeRecordId       admitted stakeholder message or validation issue record
scopeProposalId      immutable current catalog-backed successor scope
revisionReason       stakeholder-change | validation-remediation
methodVersion        version of this contract
```

Change record must name what changed or failed. A new unrelated goal is not a revision; it re-enters
`admit-request` as new work intent.

## Preconditions

1. Prior revision and change record resolve and bind same project/session.
2. Scope proposal resolves, matches same project, and has non-empty canonical names.
3. Revision reason matches immutable input evidence.
4. Prior revision's history, including an approval if any, resolves intact.

Failure yields `HOLD`; no old approval is silently reused.

## Procedure

### 1. Frame Delta

Run `frame-revision-delta`. It separates stakeholder-approved existing fields, changed stakeholder facts,
Atlas-grounded context, Maestro proposals, and remaining material unknown. It returns one `ClarificationNeed`
if no honest vN+1 can be proposed.

### 2. Build Successor

For sufficient input, build vN+1 using same `PlanRevision` schema/provenance rules as `draft-plan`. It carries
parent revision hash, explicit change reason, field-level diff, ScopeProposal/catalog identity, `PENDING` context
binding, and `PROPOSED` status.
It never edits vN. Any approval for vN is marked `SUPERSEDED_FOR_EXECUTION` by projection, not deleted or
rewritten; only vN+1 can later seek validation/approval.

### 3. Guard and Persist

`revision-lineage-guard` requires parent hash, monotonic revision identity, declared delta, matching ScopeProposal,
complete field provenance, and no transfer of prior approval. Persist revision and invalidation projection
atomically. Pass vN+1 to `assemble-context`.

## Skills

| Skill                  | Stage                        | Output                                          | Stop condition                                                            |
| ---------------------- | ---------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------- |
| `frame-revision-delta` | identify bounded field delta | successor `PlanRevision` or `ClarificationNeed` | all delta fields source-labeled, or one material decision blocks proposal |

## Tools and Guards

| Capability                         | Purpose                                                                  | Boundary                       |
| ---------------------------------- | ------------------------------------------------------------------------ | ------------------------------ |
| `plan-revision-read`               | read immutable parent revision                                           | Maestro durable evidence read  |
| `change-record-read`               | read stakeholder/validation change evidence                              | Maestro durable evidence read  |
| `scope-proposal-read`              | read immutable catalog-backed successor scope                            | Maestro durable evidence read  |
| `plan-revision-write`              | persist successor revision and diff                                      | Maestro durable evidence write |
| `revision-lineage-guard`           | require parent/delta/provenance and invalidate old execution eligibility | before persistence             |
| `no-governed-task-before-approval` | deny Task/child Session without current approved revision identity       | Session/Task boundary          |

No live Atlas read/write, shell, product edit, external network, member tool, approval write, Task creation, or
dispatch is granted.

## Authority

Maestro may propose a successor under visible `maestro` fields. It may not change stakeholder facts, erase old
approval, decide an ambiguous change, or carry old approval to new revision.

## Evidence, Output, and Idempotence

vN+1, field diff, parent hash, reason, ScopeProposal/catalog identity, `PENDING` context requirement, and
execution-ineligibility projection are durable evidence. Deduplication key is
`(priorRevisionId, changeRecordId, scopeProposalId, methodVersion)`. Replay returns stored result. Same parent
with new change evidence creates a distinct successor attempt; concurrent successors hold until stakeholder
selects one, never auto-merge.

## Refusal and Recovery

| Condition                                                    | Result                                            |
| ------------------------------------------------------------ | ------------------------------------------------- |
| Ambiguous material delta                                     | `CLARIFY`; no successor/task                      |
| Missing/mismatched parent, change, or ScopeProposal evidence | `HOLD`; require linked admission recovery         |
| Non-monotonic/altered lineage or approval transfer           | `HOLD`; preserve audit evidence                   |
| Concurrent successors                                        | `HOLD`; stakeholder selects/reconciles explicitly |
| Duplicate trigger                                            | return stored successor/question                  |

## Runtime Seams

| System   | Seam                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------- |
| OpenCode | immutable revision/diff/projection records; visible superseded state; Task/child-Session fence |
| Atlas    | no direct call/write; successor requires later assemble-context binding                        |

## Acceptance

1. Changing one approved plan constraint produces vN+1 with field diff, ScopeProposal/catalog identity, and
   `PENDING` context; vN approval remains visible but cannot authorize Task creation.
2. Invalid validation issue produces only a revision addressing named issue; unrelated fields remain sourced
   from parent/provenance and visible.
3. Ambiguous “change it” request yields one `CLARIFY`, never an overwritten/assumed revision.
4. Altered parent hash, missing delta, missing/mismatched ScopeProposal, approval carry-over, or concurrent successor fails
   closed.
5. Same inputs replay same vN+1; later context binding, validation, and exact new approval action are required.

## Anti-Overengineering Boundary

One delta skill, four records, one lineage guard, no merge engine, no approval copier, no speculative branches,
no live context fetch, and no work dispatch.
