# Method: Draft Plan

Status: proposed V2 method. ID: `draft-plan`. Composition: M1 Frame + M2 Ground + M3 Contract.

V1 evidence: `v1-portability-register.md` ports structured, typed plan material. V2 redesigns V1 Manifest/
Brief API into native plan revisions and never imports V1 CLI/JSONL transport.

## Purpose

Turn one `PlanIntent` plus immutable `ScopeProposal` into initial visible `PlanRevision` v1 with pending context
binding, or one new `ClarificationNeed`. `assemble-context` binds Atlas only after scope exists;
`revise-plan` alone creates later revisions. This method never approves, validates, freezes, routes, dispatches,
or creates product work.

```text
PROPOSED  versioned plan revision; next owner validate-plan
CLARIFY   one material decision absent from honest proposal; next owner clarify-decision
HOLD      invalid/stale inputs or invalid draft; no plan revision
```

## Trigger

Committed `ScopeProposal` is `RESOLVED` for initial draft and plan intent has no prior plan revision.

## Inputs

```text
admissionRecordId    durable PlanIntent source
scopeProposalId       immutable catalog-backed canonical scope proposal
sessionId            durable OpenCode Session identity
planIntent           goal, facts, proposals, unknowns, uncertainty, orientation reference
methodVersion        version of this contract
```

No live Atlas query is an input. Session orientation carried by `PlanIntent` may ground a proposal, but cannot
substitute for scope-bound plan context.

## Preconditions

1. `PlanIntent` and `ScopeProposal` are committed, linked, and have explicit session-orientation reference or
   `UN-SEEDED` state.
2. Scope proposal has current catalog identity/version and non-empty canonical included territory names.
3. Plan intent has no existing revision; any later change enters `revise-plan`.

Precondition failure yields `HOLD`; it does not reconstruct a missing plan from conversation text.

## Procedure

### 1. Frame Contract Material

Run bounded `draft-contract` skill against only input records. It separates stakeholder facts, Atlas-grounded
facts, and Maestro proposals. It may identify one decision whose absence makes plan proposal dishonest;
that becomes `ClarificationNeed` rather than a guessed field.

### 2. Build Proposed Revision

For sufficient input, build immutable `PlanRevision` with field-level provenance:

```text
revision identity      initial revision number v1; no prior revision link
goal                   desired outcome
acceptance             observable completion conditions
scope                  affected territory and explicit exclusions
constraints            business, technical, safety, and operational limits
review requirement     independent evaluation required before delivery
context requirement    ScopeProposal identity + `PENDING` binding state for assemble-context
assumptions            every unconfirmed Maestro proposal
risks                  unresolved delivery risks and decision owner
field sources          stakeholder | atlas:<address> | maestro
status                 PROPOSED only
```

`UN-SEEDED` permits proposals, but no field may claim `atlas:<address>`. `maestro` fields remain visible to
stakeholder and cannot become implied authority. Scope comes only from immutable ScopeProposal; draft cannot
alter, widen, or recreate it.

### 3. Persist Draft

`plan-provenance-guard` rejects missing field source, absent/mismatched ScopeProposal, fabricated Atlas address,
hidden assumption, non-initial revision identity, or status other than `PROPOSED`. Persist `PlanRevision` only
after guard success. Hand its identity to `assemble-context`.

## Skills

| Skill            | Stage                                    | Output                                | Stop condition                                                                  |
| ---------------- | ---------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------- |
| `draft-contract` | frame facts/proposals and build contract | `PlanRevision` or `ClarificationNeed` | all plan fields source-labeled, or one material decision blocks honest proposal |

## Tools and Guards

| Capability                         | Purpose                                                                      | Boundary                       |
| ---------------------------------- | ---------------------------------------------------------------------------- | ------------------------------ |
| `admission-record-read`            | read immutable plan intent                                                   | Maestro durable evidence read  |
| `scope-proposal-read`              | read immutable catalog-backed scope                                          | Maestro durable evidence read  |
| `plan-revision-write`              | persist proposed revision/lineage                                            | Maestro durable evidence write |
| `plan-input-link-guard`            | require committed intent/scope/orientation and no prior revision             | before reasoning               |
| `plan-provenance-guard`            | require field sources, scope binding, visible assumptions, valid v1 identity | before persistence             |
| `no-governed-task-before-approval` | deny Task/child Session without approved revision identity                   | Session/Task boundary          |

No live Atlas read/write, shell, product edit, external network, member tool, Task creation, approval write, or
plan validation is granted.

## Authority

Maestro may propose acceptance, scope, constraints, review rule, and risks only under `maestro` provenance.
Stakeholder owns acceptance of exact revision and all strategic choices. `validate-plan` owns deterministic
completeness/conflict judgment; `request-approval` owns approval recording; `revise-plan` owns later revision
and prior-approval invalidation.

## Evidence, Output, and Idempotence

`PlanRevision` or `ClarificationNeed` is durable output. Revision stores method/version, input IDs and hashes,
session-orientation reference, ScopeProposal/catalog identity, `PENDING` context requirement, complete field provenance, v1
identity, status, and timestamp.

Deduplication key is `(admissionRecordId, scopeProposalId, methodVersion)`. Same input returns same stored proposal/question.
Any stakeholder answer or changed context after v1 enters `revise-plan`; v1 remains immutable.

## Refusal and Recovery

| Condition                          | Result                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------- |
| One material decision absent       | `CLARIFY` with one `ClarificationNeed`; no plan/task                       |
| Invalid admission/orientation link | `HOLD`, visible evidence IDs and reason                                    |
| Missing/mismatched ScopeProposal   | `HOLD`; require resolve-scope, no broad Atlas lookup or plan/task          |
| Existing prior revision            | `HOLD`; require revise-plan, never overwrite v1                            |
| Invalid model output/provenance    | `HOLD`; preserve inputs, never silently repair proposal                    |
| Duplicate trigger                  | return stored draft/question                                               |
| Model/tool interruption            | `HOLD`; retry only as linked new attempt or stakeholder-triggered revision |

## Runtime Seams

| System   | Seam                                                                                                     |
| -------- | -------------------------------------------------------------------------------------------------------- |
| OpenCode | durable Session/message identity, proposed-plan UI, immutable revision records, Task/child-Session fence |
| Atlas    | no direct call/write; only session orientation previously bound at intake                                |

## Acceptance

1. Concrete request with resolved scope proposal yields `PROPOSED` revision with every required field, source
   labels, `PENDING` context binding, visible Maestro assumptions, and no Task.
2. Same request plus `UN-SEEDED` session orientation yields `PROPOSED` only when every project-specific claim
   is a visible Maestro proposal; no field falsely cites Atlas.
3. Missing desired outcome or decision that changes incompatible product results yields one `CLARIFY` need,
   not a made-up acceptance/scope field.
4. A fabricated Atlas address, missing source label, hidden assumption, or non-`PROPOSED` status is rejected
   before revision persistence.
5. Missing/mismatched scope proposal holds; draft cannot query Atlas live, broaden scope, or create child work.
6. Replaying same inputs returns stored identical v1. Changed stakeholder answer or context requires
   `revise-plan`; it cannot overwrite v1.

## Anti-Overengineering Boundary

One bounded skill, three durable reads/writes, two guards, three results. No autonomous research agent,
alternative-plan ranking, effort estimate, task DAG, task allocation, tool execution, approval shortcut, or
context refresh loop. Each needs later contract and proof.
