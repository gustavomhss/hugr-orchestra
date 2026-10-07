# Admit Request: Runtime Research

Status: deterministic kernel and durable record writer implemented; automatic per-message trigger remains unimplemented.

## Verified OpenCode Seams

| Need                                     | Source                                                                                      | Verdict                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Durable user message identity/read       | `packages/opencode/src/session/message-v2.ts:506`                                           | available: `(sessionID, messageID)` lookup reads persisted message/parts                                                      |
| Prompt entry after user message persists | `packages/opencode/src/session/prompt.ts:1052-1070`                                         | available: `createUserMessage` precedes LLM loop                                                                              |
| Agent prompt and skills                  | `packages/opencode/src/session/llm/request.ts:56-66`; `packages/opencode/src/tool/skill.ts` | available: Maestro prompt replaces provider prompt; `frame-request` is OpenCode-discoverable, permissioned, lazy-loaded skill |
| Session metadata                         | `packages/opencode/src/session/session.ts:223,800-802`                                      | inadequate alone: untyped record replacement, not append-only admission evidence                                              |
| Child Session creation                   | `packages/opencode/src/tool/task.ts:198-214`                                                | available but unfenced: Task has no governed revision identity and creates Session directly                                   |
| Per-message deterministic admission hook | prompt loop inspected through `packages/opencode/src/session/prompt.ts:1052-1286`           | absent: no Maestro-specific pre-LLM method runner or durable method projection                                                |

## Consequence

`frame-request` is an actual OpenCode skill for controlled judgment. `admission-record.ts` now writes one deterministic
`maestro.admission.decided` event keyed by `(sessionID, messageID, methodVersion)` into EventV2's existing Session
aggregate. It does not use Session metadata or a new table. Automatic invocation after one user message is still absent.

`TaskTool` now accepts an explicit `governed` binding only from Maestro. Before `sessions.create`, it requires matching
parent Session/project identity and one exact persisted `maestro.approval.decided` event. Normal Tasks bypass this flow.
Approval presentation/decision writer from real Session messages remains next missing lifecycle seam.

V1 source paths cited by `v1-portability-register.md` are absent from this checkout. Historic test counts remain reported
evidence, but no V1 source-level invariant is treated as re-verified here.

## First Implementable Contract

Implemented: `packages/opencode/src/maestro/admit-request.ts` exports pure
`decideAdmission(assessment)`. It validates an untrusted model/skill assessment then applies only deterministic outcome
seven acceptance cases.

```text
IntentAssessment -> AdmissionDecision
valid orient                         -> ORIENT
work + no usable goal                -> CLARIFY
work + material blocker              -> CLARIFY
work + usable goal + no conflict     -> READY_TO_DRAFT
invalid assessment or active conflict -> CLARIFY
```

`packages/opencode/src/maestro/admission-record.ts` owns durable record/replay. `TaskTool` owns governed fence.

## RED Acceptance Contract

`packages/opencode/test/maestro/admit-request.test.ts` passes these pure acceptance cases:

1. Valid orient assessment returns `ORIENT`; no plan/task capability exists in function API.
2. `work` without goal returns `CLARIFY` with one visible reason.
3. Material blocker returns `CLARIFY` even with goal.
4. Valid work goal returns `READY_TO_DRAFT`; known facts and proposals retain distinct fields.
5. Partial/invalid assessment returns `CLARIFY`, never `READY_TO_DRAFT`.
6. Active-work revision effect returns `CLARIFY`, never silent steering.
7. Mutation probe: altered `known`/`proposals` source labels fail validation.

Runtime acceptance written; blocked locally by missing workspace dependencies:

1. Same `(sessionID, messageID, methodVersion)` replays byte-identical durable result without invoking `frame-request`.
2. Altered input for same admission key refuses rather than overwriting durable result.
3. Governed Task attempts without approved revision identity deny before `sessions.create`; one exact approval event permits.
