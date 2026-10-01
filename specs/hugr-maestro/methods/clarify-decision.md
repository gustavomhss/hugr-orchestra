# Method: Clarify Decision

Status: proposed V2 method. ID: `clarify-decision`. Composition: M1 Frame.

V1 evidence: `v1-portability-register.md` records no measured focused-clarification capability. This is an
explicit V2 redesign required by R1/R4; it must earn independent acceptance proof before ratification.

## Purpose

Turn one `ClarificationNeed` emitted by `admit-request` into one neutral stakeholder question that unlocks
one named decision. This method asks; it does not interpret a later answer, draft a plan, approve, or create
child work.

## Trigger

Committed `AdmissionRecord` outcome is `CLARIFY` with a valid `ClarificationNeed`.

## Inputs

```text
admissionRecordId    durable record produced by admit-request
sessionId            durable OpenCode Session identity
messageId            user message that caused admission
clarificationNeed    decision needed, why it blocks, known facts, forbidden assumptions
methodVersion        version of this method contract
```

`ClarificationNeed` identifies one decision, not a list of vague unknowns. It may offer clearly marked,
non-exhaustive examples; it never supplies a recommended answer as fact.

## Preconditions

1. Linked `AdmissionRecord` is committed, valid, and has outcome `CLARIFY`.
2. Caller may still speak in its OpenCode Session.
3. No later admission record supersedes this clarification need.

Precondition failure produces a visible held state. No question is silently sent and no Task is created.

## Procedure

### 1. Validate Need

`clarification-need-schema-guard` verifies one decision, stated blocking reason, known/unknown separation,
and parent admission identity. A malformed need remains held for recovery; this method does not repair it by
guessing.

### 2. Frame Smallest Question

Run bounded `frame-question` skill. It returns:

```text
question             one direct stakeholder question
decision             exact decision being requested
why                  short consequence of no answer
examples             optional, non-exhaustive options labeled examples
unlocks              `admit-request` re-entry for next user message
```

Question language may improve clarity but may not narrow stakeholder authority, insert an acceptance
criterion, or make a proposal look mandatory.

### 3. Validate and Record

`clarification-question-guard` rejects an output with multiple independent questions, a hidden assumption,
or no named decision. Persist `ClarificationRecord` linked to `AdmissionRecord` and display it. Later user
reply re-enters `admit-request`; it is never parsed as approval.

## Skills

| Skill            | Stage                           | Output                  | Stop condition                                         |
| ---------------- | ------------------------------- | ----------------------- | ------------------------------------------------------ |
| `frame-question` | frame smallest neutral question | `ClarificationQuestion` | one question names one decision and its unblock effect |

## Tools and Guards

| Capability                         | Purpose                                                             | Boundary                       |
| ---------------------------------- | ------------------------------------------------------------------- | ------------------------------ |
| `admission-record-read`            | read immutable parent record                                        | Maestro durable evidence read  |
| `clarification-record-write`       | persist question linked to parent                                   | Maestro durable evidence write |
| `clarification-need-schema-guard`  | reject malformed parent need                                        | before reasoning               |
| `clarification-question-guard`     | reject compound/leading/malformed question                          | before persistence/display     |
| `no-governed-task-before-approval` | deny Task/child Session creation without approved revision identity | Session/Task boundary          |

No shell, product edit, external network, Atlas read/write, plan compiler, member tool, or task creation is
granted.

## Authority

Maestro owns neutral wording and question minimization. Stakeholder owns answer. This method may not select
scope, acceptance, priority, constraint, review rule, or approval outcome.

## Evidence, Output, and Idempotence

`ClarificationRecord` stores method/version, parent record ID, input IDs, requested decision, question,
examples, why/unlocks text, timestamp, and display status. It is both output and durable evidence.

Deduplication key is `(admissionRecordId, methodVersion)`. Replay returns recorded question byte-identically;
it does not rerun `frame-question`. A newer admission record supersedes an undelivered question visibly.

## Refusal and Recovery

| Condition                            | Result                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| Invalid/missing parent need          | visible `CLARIFY` hold with linked admission issue; no question, no task      |
| Invalid model output                 | visible `CLARIFY` hold; preserve source need for deterministic retry/recovery |
| Session cannot display response      | persist undelivered record; deliver on session recovery, never regenerate     |
| New user message supersedes question | preserve prior record and return to `admit-request`                           |
| Duplicate trigger                    | return recorded question                                                      |

## Runtime Seams

| System   | Seam                                                                                     |
| -------- | ---------------------------------------------------------------------------------------- |
| OpenCode | durable `SessionID`/`MessageID`, visible assistant response, Session/Task creation fence |
| Atlas    | none; request has not earned project-context access beyond admission orientation         |

## Acceptance

1. “Make it better” yields one question asking desired outcome; it explains why outcome unlocks a plan and
   creates no child Session.
2. A need for target environment yields one environment question with examples labeled non-exhaustive; it
   does not choose an environment.
3. A malformed `ClarificationNeed` produces visible hold, retains source evidence, and never displays a
   guessed question.
4. A compound model question is rejected before persistence/display.
5. Replaying same admission record returns stored question without another `frame-question` invocation.
6. A stakeholder reply is admitted as a new message and cannot approve a plan merely by answering a question.

## Anti-Overengineering Boundary

One skill, two durable records, two schema/semantics guards, zero intent taxonomy, zero question tree, zero
Atlas query, zero member, and zero autonomous follow-up. Multiple unresolved decisions remain a held
clarification chain, not a wizard.
