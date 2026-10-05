# Method: Admit Request

Status: proposed V2 method. ID: `admit-request`. Deterministic policy kernel exists at
`packages/opencode/src/maestro/admit-request.ts`; durable trigger/record/replay remains unimplemented. Composition:
M1 Frame + M2 Ground.

V1 evidence: `v1-portability-register.md` preserves pure explicit goal/acceptance capture; V2 deliberately
discards V1 campaign driver's default-acceptance synthesis.

## Purpose

Turn one durable user message in a Maestro session into exactly one safe next state:

```text
ORIENT          answer/inspect; no plan and no child work
CLARIFY         identify one blocking decision for `clarify-decision`; no child work
READY_TO_DRAFT  hand bounded intent to `draft-plan`; no child work
```

`READY_TO_DRAFT` is not `PLAN_DRAFT`. It is an internal admission result; `draft-plan` alone can present a
versioned `PLAN_DRAFT` to stakeholder.

This method does not plan, approve, decompose, route, dispatch, mutate product files, or write Atlas facts.

## Trigger

A durable user message arrives in a Maestro development session, or durable recovery replays its admission
record.

## Inputs

```text
sessionId            durable OpenCode Session identity
messageId            durable incoming user message identity
message              user text and attachments already admitted by OpenCode
sessionState         active plan/work summary, if any
orientation          read-only Atlas Awareness + Orientation reference, or explicit UN-SEEDED
methodVersion        version of this method contract
```

The deduplication key is `(sessionId, messageId, methodVersion)`. Replaying the same admitted message reads
the recorded result; it never asks the model to reinterpret the request.

## Preconditions

1. Session is a Maestro user-facing development session.
2. Message is durably admitted by OpenCode.
3. Session state and project orientation are readable, or their absence is explicit.

If any prerequisite is unobservable, result is `CLARIFY` with a system reason. No task is created.

## Procedure

### 1. Load Orientation

Read only the compact project/session orientation needed to avoid a generic answer. Do not load a scoped Atlas
work pack yet; scope does not exist until a plan intention exists. An absent Atlas source is carried as
`UN-SEEDED`, never replaced with guessed project rules.

### 2. Structured Intent Assessment

Run `frame-request`, a bounded reasoning skill. It returns a schema-constrained assessment:

```text
kind                orient | work
goal                optional plain-language outcome
known               stakeholder facts and cited orientation facts
proposals           Maestro suggestions, never asserted facts
unknowns            decisions that are materially blocking
uncertainty         bounded interpretation uncertainty; no numeric confidence score
activeWorkEffect    none | new-scope-or-revision
reason              short user-visible explanation
```

For `READY_TO_DRAFT`, assessment produces `PlanIntent`: goal, known facts, proposals, unknowns, and uncertainty.
`PlanIntent` is neither scope nor plan; `draft-plan` must create canonical proposed scope before any Atlas pack
retrieval.

This skill may understand language; it may not create a plan, call a task tool, mutate state beyond its
assessment record, or label an assumption as stakeholder fact.

### 3. Deterministic Outcome Gate

```text
kind=orient                         -> ORIENT
kind=work, no usable goal            -> CLARIFY
kind=work, material blocker unknown  -> CLARIFY
kind=work, usable goal               -> READY_TO_DRAFT
active work needs new scope/revision  -> CLARIFY
```

Material blocker means a missing decision that would create incompatible product outcomes, cross stakeholder
authority, or make even a proposed plan dishonest. Recoverable implementation uncertainty becomes a visible
proposal/assumption in the later draft, not a clarification loop.

### 4. Record and Respond

Write one durable Maestro admission record linked to the Session message. Return a compact, user-visible
response stating outcome and why:

```text
ORIENT:          answer or current state
CLARIFY:         blocking decision, why it blocks, next owner `clarify-decision`
READY_TO_DRAFT:  intent summary, known facts, visible uncertainty, next owner `draft-plan`
```

## Skills

| Skill           | Stage                        | Output                                                | Stop condition                               |
| --------------- | ---------------------------- | ----------------------------------------------------- | -------------------------------------------- |
| `frame-request` | structured intent assessment | `IntentAssessment` + `ClarificationNeed` when blocked | cannot identify a usable goal or distinction |

This skill grants no tools, approves no plan, and delegates no work. `clarify-decision` owns wording and asking
the smallest question.

## Tools and Guards

| Capability                         | Purpose                                                             | Boundary                        |
| ---------------------------------- | ------------------------------------------------------------------- | ------------------------------- |
| `session-read`                     | read durable user message and session state                         | OpenCode read only              |
| `atlas-orientation-read`           | read compact project orientation                                    | Atlas read only                 |
| `maestro-admission-record`         | persist method result keyed to message                              | OpenCode durable event/metadata |
| `admission-schema-guard`           | reject malformed assessment/result                                  | before record                   |
| `no-governed-task-before-approval` | deny Task/child Session creation without approved revision identity | Session/Task boundary           |

No shell, edit, write, external network, Atlas write, or member tool is granted to this method.

## Authority

Maestro may classify and propose. It may not decide product acceptance, scope, priority, business rules, or
approval. Stakeholder answers clarification and approves any later plan revision.

## Evidence, Output, and Idempotence

The durable `AdmissionRecord` is evidence and output. It contains method/version, input IDs, orientation
references/freshness, `IntentAssessment`, `PlanIntent` when ready, deterministic outcome,
`ClarificationNeed` when blocked, user-visible response, timestamp, and next method owner. `ORIENT` has no
next owner; `CLARIFY` invokes `clarify-decision`; `READY_TO_DRAFT` invokes `draft-plan` only after this
record commits.

Same `(sessionId, messageId, methodVersion)` returns recorded output. A new method version is a deliberate
new interpretation and must preserve link to prior record.

## Refusal

`CLARIFY` is visible hold when request intent is incomplete, authority is ambiguous, session/orientation state
is unobservable, active work could be changed, or assessment fails validation. It emits a structured
`ClarificationNeed`, not a question or implicit retry. The method never emits a hidden `READY_TO_DRAFT` result.

## Runtime Seams

| System   | Seam                                                                                                                  |
| -------- | --------------------------------------------------------------------------------------------------------------------- |
| OpenCode | durable `SessionID`/`MessageID`, message reads, session metadata/event persistence, Task/child-Session creation fence |
| Atlas    | read-only project/session orientation reference; no scoped pack or write                                              |

## Failure and Recovery

| Condition                              | Result                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| Invalid assessment schema              | `CLARIFY`, visible system reason, no task                                                   |
| Model/tool timeout                     | `CLARIFY`, preserve original message, retry only on stakeholder request or durable recovery |
| Missing orientation                    | Continue only with explicit `UN-SEEDED`; never fabricate context                            |
| Duplicate message delivery             | Return recorded admission result                                                            |
| New request conflicts with active work | `CLARIFY`: ask whether to steer existing work, revise plan, or start a new plan             |

## Acceptance

1. “What is current status?” records `ORIENT`, returns an answer, and creates neither plan nor child Session.
2. “Make it better” records `CLARIFY` plus one `ClarificationNeed`; `clarify-decision` asks one outcome
   question, and neither method creates a child Session.
3. “Add dark mode to settings” records `READY_TO_DRAFT` with source-labeled `PlanIntent` and orientation
   references, but creates no child Session before a later exact plan approval.
4. An invalid/partial `IntentAssessment` falls back to `CLARIFY`; it never reaches `READY_TO_DRAFT` or Task
   creation.
5. Replaying one message ID returns byte-identical recorded outcome and does not call `frame-request` again.
6. A request that could alter active approved work returns `CLARIFY` rather than silently steering or widening
   the current plan.
7. `UN-SEEDED` orientation is rendered visibly and never becomes a guessed project constraint.

## Anti-Overengineering Boundary

The method has three outcomes, one skill, three read/record capabilities, and two guards. It has no intent
taxonomy, confidence score, automatic tool execution, background agent, task creation, scoped Atlas query,
or plan compiler. Those belong to later methods only if their own contract proves need.
