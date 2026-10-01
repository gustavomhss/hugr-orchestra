# HuGR Maestro V2: Composed Actor Identity Contract

Status: ratified by stakeholder, 2026-09-08. Owner decision: session-composed identity.

## Identity

Every Maestro/Atlas provenance request carries one canonical `ComposedActor`:

```text
projectId             stable Maestro project identity
sessionId             durable direct stakeholder conversation identity
memberId              stable executor identity: maestro | named specialist role ID
```

`projectId + sessionId + memberId` is identity. Display name, Task ID, model, prompt, roster position, and
free-text actor labels are not identity. User approval is separate durable conversation evidence:
`ApprovalPresentation + explicit user message ID + exact revision hash`.

## Rules

1. Direct user conversation is stakeholder authority in V2. No external account/key/OIDC identity is required.
2. Maestro/member work is attributed to stable `memberId`; display-name changes cannot rewrite provenance.
3. Project isolation is enforced by exact `projectId`; cross-project actor reuse is refused.
4. Session ID is actor identity; Task ID is immutable execution/provenance reference attached beside it.
5. Missing/malformed project, session, or member identity fails closed for governed operation. Ungoverned
   orientation may return visible `HOLD`, never a synthetic actor.
6. Approval needs explicit user reply to exact displayed revision. Maestro/member output cannot approve itself.
7. Serialization is canonical before it becomes Atlas receipt or durable authority evidence: UTF-8 bytes of RFC 8785
   JSON for `{ version: "maestro-actor-v1", projectId, sessionId, memberId }`. Consumers compare bytes, never a
   parsed object with reordered keys. A successor needs a new version value.

## Boundaries

| Included here                                           | Not decided here                                        |
| ------------------------------------------------------- | ------------------------------------------------------- |
| Actor identity fields and fail-closed mapping           | External account/authentication provider implementation |
| Direct user approval versus executing member separation | GitHub review/commit/merge policy                       |
| Stable provenance semantics                             | Atlas context-envelope shape                            |
| Session/Task as provenance references                   | Role permission/delegation graph                        |

## Acceptance

1. Same project/session/member produces byte-identical canonical actor identity across Session recovery.
2. Changing member display name preserves `memberId` in prior and new provenance.
3. Same session with different member IDs, or same member ID in different projects/sessions, yields distinct identity.
4. Missing session/member or cross-project reference refuses governed operation before Atlas/Task action.
5. Explicit user reply approves exact presentation/revision; delegated work records same session plus actual member.
