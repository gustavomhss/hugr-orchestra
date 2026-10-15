# Context Continuity

The current implementation follows [working memory and transcript archive](context-continuity-memory.md).
Earlier design notes below remain historical. The scalar-selector format and fixed 6,000-token cap were replaced.

## Purpose

Keep one user conversation usable as context grows. Maintenance happens out of band; user keeps same session, timeline, and task.

## Terms

- **Parent**: user-facing Orchestra session.
- **Maintenance fork**: ephemeral background model execution over an immutable snapshot. It has no stored session or public timeline.
- **Snapshot**: parent history boundary captured when maintenance starts.
- **Tail**: recent turns preserved verbatim for next model request.
- **Continuity context**: compact replacement for history before tail.

## Module Layout

One monolith under `packages/orchestra/src/continuity/`. No module imports legacy compaction.

- `model.ts`: pure state, snapshot, threshold, and result types.
- `trigger.ts`: decides whether a completed parent turn needs maintenance.
- `fork.ts`: prepares and runs an ephemeral maintenance request. No parent mutation or session persistence.
- `context.ts`: owns in-memory continuity context and returns coherent context-plus-tail selections.
- `service.ts`: small orchestration boundary used by parent prompt flow.
- `test/`: deterministic fake-provider tests for each module plus one end-to-end module test.

`service.ts` coordinates modules. It does not contain rendering, provider prompt construction, session persistence, or UI behavior.

## User Contract

1. User never runs `/compact` for continuity.
2. User never changes session because continuity ran.
3. Parent task and tools continue normally while maintenance runs.
4. Parent timeline does not show a legacy compaction turn, fork, synthetic user prompt, or maintenance model output.
5. Future parent model requests use continuity context plus tail after successful maintenance.
6. Failed, cancelled, or stale maintenance changes nothing user-visible.

## Trigger

1. Trigger evaluates completed parent turns only.
2. Trigger compares reported usage with the threshold, including cache/input/output/reasoning when provider total is absent.
3. Initial development threshold is `50_000` tokens.
4. One parent has at most one active maintenance fork.
5. A new threshold crossing while maintenance runs records that a newer snapshot is needed; it does not start duplicate work.

## Maintenance Fork

1. Fork captures parent snapshot: prior continuity context, history before tail, and tail boundary.
2. Fork receives maintenance prompt plus snapshot only.
3. Fork has no tools or permitted actions. Workflow models that create remote sessions or approval flows are declined. Oversized maintenance input is declined using the existing token estimate and model input/context limits.
4. Fork output is one continuity context artifact.
5. Fork is internal. No session is created, listed, selected, restored, or shared. Stream work ends on completion, cancellation, failure, or a 60-second timeout. The continuity context remains instance-local in memory.

## Apply Rules

1. Apply only when parent still matches fork snapshot boundary.
2. Successful apply replaces only context supplied to later parent model requests.
3. Apply does not rewrite parent messages, create compaction messages, alter session identity, or inject a prompt.
4. If parent advanced, discard fork artifact. Start one new maintenance pass from latest safe boundary after current parent work reaches a safe boundary.
5. Parent model work wins every race. Maintenance never blocks, cancels, or changes parent work.
6. Public historical edits/reverts invalidate continuity context. New append-only turns preserve valid applied context. Session deletion evicts its continuity state.

## Failure Rules

1. Fork failure, timeout, cancellation, invalid output, or stale result discards fork artifact.
2. Parent remains unchanged and usable.
3. Internal diagnostics record reason and snapshot boundary without conversation content.
4. No fallback invokes legacy compaction.

## Explicit Non-Goals

- Modifying `/compact` or legacy `SessionCompaction` behavior.
- Reusing legacy compaction parts, summaries, prompts, timeline dividers, or auto-continue prompts.
- Direct database writes, schema changes, outbox/CAS mechanisms, or sync protocol changes.
- Claims about saved tokens, latency, or quality without measured baseline and candidate runs.

## Acceptance

1. Fake provider reaches threshold; parent completes current turn while maintenance starts.
2. Parent accepts another prompt while maintenance runs; parent session ID, messages, and timeline stay user-owned.
3. Fork attempts a tool; execution is denied before tool implementation.
4. Successful fork changes next parent model request to contain continuity context plus preserved tail, not old head.
5. Parent advances before fork completes; artifact is discarded and does not affect next parent model request.
6. Fork failure/cancellation leaves no internal session visible and no parent mutation.
7. `/compact` behaves exactly as Orchestra `dev` before this feature.
8. Tests use deterministic fake provider/clock. No paid provider run is required for feature verification.

## Verification

From `packages/orchestra`:

```sh
bun typecheck
bun test src/continuity test/continuity --timeout 30000
bun test test/session/prompt.test.ts
```

The HTTP test uses the real prompt, processor and provider HTTP path with a loopback server. Deferred barriers hold maintenance while the parent completes another turn. Assertions inspect the next outgoing request, stored parent transcript, and absence of stored maintenance sessions. Service tests await entered streams and terminal jobs before checking failure/cancellation behavior.

Desktop verification uses the freshly built V1 Electron sidecar and an isolated loopback provider. Prompts are API-driven through that sidecar; the actual renderer DOM is inspected independently. This validates transport and display, not real-provider summary quality.
