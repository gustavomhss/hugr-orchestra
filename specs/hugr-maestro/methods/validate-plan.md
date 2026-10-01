# Method: Validate Plan

Status: proposed V2 method. ID: `validate-plan`. Composition: M3 Contract.

V1 evidence: `v1-portability-register.md` ports measured compiler/plan-check refusals. V2 keeps only typed,
reproducible checks at this plan layer; decomposition-specific gates remain later methods.

## Purpose

Deterministically decide whether one immutable `PlanRevision` is structurally eligible for stakeholder
approval. This method validates record shape, authority/provenance binding, revision lineage, context
freshness, and machine-decidable internal conflicts. It does not judge whether stakeholder goal is wise,
whether prose is good, or whether proposed acceptance is sufficient.

```text
VALID    exact PlanRevision is approval-eligible; next owner request-approval
INVALID  durable issue list; next owner revise-plan or clarify-decision
HOLD     required evidence/context cannot be checked; no approval/task
```

## Trigger

Committed `PlanRevision` status is `PROPOSED`, or recovery needs to revalidate a proposed revision after
context freshness changes.

## Inputs

```text
planRevisionId       immutable PROPOSED revision identity
planRevision         complete revision fields and field provenance
contextRecord        bound READY or UN-SEEDED ContextRecord
priorRevision        optional immutable parent revision
validationPolicy     frozen deterministic schema/policy version
methodVersion        version of this contract
```

`validationPolicy` is product configuration, versioned and recorded. It contains only mechanically decidable
rules: required fields, allowed source tags, current context freshness bound, canonical scope/exclusion
collision rules, and valid revision/status transitions. It cannot contain prose-quality or model judgment.

## Preconditions

1. Revision, context record, and policy are committed and resolvable.
2. Revision status is exactly `PROPOSED`.
3. Context record/project identity matches revision binding.

Unresolvable input produces `HOLD`, not `INVALID`: an unavailable validator must not pretend it found a
product defect.

## Procedure

### 1. Reconstruct Required Checks

Load pinned `validationPolicy`; refuse missing, empty, unknown-version, or malformed policy. Reconstruct check
list from policy and revision schema. An empty check list is validator failure, never a successful validation.

### 2. Evaluate Deterministic Rules

Run rules over the stored revision only:

```text
all required fields present and non-empty
field source tag is stakeholder | maestro | atlas:<bound-address>
every atlas address appears in bound ContextRecord
UN-SEEDED revision contains no atlas source tag
assumptions contain every maestro-sourced unconfirmed decision
revision parent/version/status transition is legal and immutable
bound context identity/revision/freshness still holds
canonical scope inclusion/exclusion sets do not intersect
```

The final rule acts only on typed canonical scope identifiers. Natural-language contradiction detection is not
claimed; unresolved semantic conflict belongs to stakeholder review or `clarify-decision`.

### 3. Persist Verdict

Persist immutable `PlanValidationRecord`: input hashes, policy version, enumerated checks, per-check verdict,
issue IDs, timestamp, and result. Only `VALID` yields approval eligibility for this exact revision.

## Tools and Guards

| Capability                         | Purpose                                                    | Boundary                       |
| ---------------------------------- | ---------------------------------------------------------- | ------------------------------ |
| `plan-revision-read`               | read immutable proposed revision                           | Maestro durable evidence read  |
| `context-record-read`              | verify exact grounding binding                             | Maestro durable evidence read  |
| `validation-policy-read`           | load pinned deterministic policy                           | Maestro configuration read     |
| `plan-validation-record-write`     | persist checks and verdict                                 | Maestro durable evidence write |
| `validation-input-guard`           | require exact links/status/policy version                  | before evaluation              |
| `approval-eligibility-guard`       | expose only current VALID revision to request-approval     | approval boundary              |
| `no-governed-task-before-approval` | deny Task/child Session without approved revision identity | Session/Task boundary          |

No model skill, Atlas read/write, shell, product edit, external network, member tool, plan mutation, approval
write, or task creation is granted.

## Authority

This method can refuse mechanical invalidity only. It cannot change a revision, approve a revision, waive a
failed rule, infer semantic agreement, or turn `INVALID` into stakeholder acceptance.

## Evidence, Output, and Idempotence

`PlanValidationRecord` is output and evidence. It contains all inputs/version hashes, complete named check
ledger, exact failure paths, verdict, timestamp, and next owner. The check ledger prevents a policy/parser
failure from looking like a clean empty result.

Deduplication key is `(planRevisionId, contextRecordId, validationPolicyVersion, methodVersion)`. Replay
returns stored verdict. New policy or freshness evidence creates a linked new validation record; it cannot
overwrite prior decision evidence.

## Refusal and Recovery

| Condition                                                  | Result                                                                                               |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Missing/empty/malformed policy or check list               | `HOLD`, named validation-instrument failure                                                          |
| Missing/unresolvable revision/context evidence             | `HOLD`, preserve input identity/reason                                                               |
| Failed required/provenance/lineage/freshness/conflict rule | `INVALID`, durable issue list; no approval/task                                                      |
| Unknown semantic product conflict                          | remain `VALID` mechanically, rendered as stakeholder-visible uncertainty; never hidden auto-approval |
| Duplicate trigger                                          | return stored validation record                                                                      |
| New revision/context/policy                                | require new linked validation record                                                                 |

## Runtime Seams

| System   | Seam                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------- |
| OpenCode | durable proposed-plan and validation records; approval-eligible UI state; Task/child-Session fence |
| Atlas    | no live call; validates addresses/freshness already bound in ContextRecord                         |

## Acceptance

1. Complete sourced revision with current bound context and non-intersecting canonical scope sets yields
   `VALID`, an enumerated check ledger, and approval eligibility only for that exact revision.
2. Missing field source, unbound Atlas address, omitted Maestro assumption, stale context, or illegal revision
   lineage yields `INVALID` with named issue; approval and Task creation are refused.
3. `UN-SEEDED` revision with an Atlas source tag yields `INVALID`; `UN-SEEDED` revision with visible Maestro
   proposals may validate structurally.
4. Missing, empty, or malformed policy/check list yields `HOLD`, not a green empty validation.
5. Natural-language tension not represented in canonical typed fields is rendered as uncertainty for
   stakeholder; validator does not hallucinate a semantic defect or pass it as approval.
6. Replaying same inputs returns byte-identical stored validation. Changed revision/context/policy yields new
   linked record and never alters prior result.

## Anti-Overengineering Boundary

One deterministic evaluator, one policy read, four durable records, two method guards, no LLM judge, no prose
lint, no auto-repair, no generalized rules engine, and no approval/task capability. New rule enters only when
it is typed, reproducible, has a named failure class, and gets positive/negative proof.
