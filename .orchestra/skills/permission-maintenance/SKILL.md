---
name: permission-maintenance
description: Use when changing permission matching, configured or saved rule precedence, request lifecycle, or external_directory approval in Orchestra. Maps the current owners and implementation traps for contributors.
---

# Permission maintenance

This is a repo-only contributor map of the current implementation, not a new policy. For the permission dock and saved-permission interaction, see `.orchestra/skills/permissions-usage/SKILL.md`.

## Owners

| Area | Source |
| --- | --- |
| Rules, requests, replies and events | `packages/schema/src/permission.ts` |
| Matching, authorization and pending requests | `packages/core/src/permission.ts`; wildcard matching in `packages/core/src/util/wildcard.ts` |
| Saved permissions and storage | `packages/core/src/permission/saved.ts`, `packages/core/src/permission/sql.ts` |
| External path approval boundary | `packages/core/src/location-mutation.ts`; concrete read caller in `packages/core/src/tool/read.ts` |
| Focused coverage | `packages/core/test/permission.test.ts` |

## Traps

- `evaluate(action, resource, ...rulesets)` takes the last rule matching both action and resource via `Wildcard.match`; no match falls back to `ask`. Configured rules are checked for deny before saved allows are appended: a configured deny for any requested resource wins. If the agent cannot be resolved, its rules are a deny-all; a missing session is an error.
- The service's `evaluate` is a read-only assessment. `ask` creates a pending request only for an `ask` result and returns its ID and effect; it does not wait. `authorize` blocks deny, returns on allow, and otherwise waits for a reply; `assert` wraps it but turns a declined error into a defect. `askExplicit` first honors configured deny, then requires a live reply even when agent or saved rules allow; it omits the save field, and remembered allows do not settle an explicit pending request.
- An `always` reply saves only when the request has nonempty `save` resources: the current project and action get one row per resource, with duplicate project/action/resource inserts ignored. It can settle other non-explicit pending requests only after their configured-deny and effective-allow checks. A `reject` fails the request and rejects other pending requests in that session. Interruption cancels a waiting authorization; `cancelSession` rejects all pending requests for the session. Cancellation publishes a reject and fails the waiter.
- `LocationMutation.resolve` derives canonical resources and, for an external target, an `external_directory` approval boundary; resolution itself does not approve the mutation. `externalDirectoryPermission` maps that boundary into the permission input. The read tool asserts it before its own read permission. This is an application approval boundary, not an OS filesystem sandbox guarantee.

## Checks

For changes in this area, from the repository root run `bun run test:ci core test/permission.test.ts`. Follow the repository's scoped CI guidance; a local result is not a CI green.
