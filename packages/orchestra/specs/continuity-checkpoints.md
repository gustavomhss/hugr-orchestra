# Project checkpoints for compaction forks

The owner requested the exact context that starts each compaction fork, saved as a project checkpoint.
After distinguishing parent context from producer input, proceed with the exact **fork input**. This is
the request handed to the LLM transport, not reconstructed session history and not provider HTTP wire.

## Minimal contract

- One immutable SQLite checkpoint per actual producer attempt, grouped by generated fork ID and attempt
  0/1. Normal compaction has one attempt; the existing bounded correction creates a second checkpoint.
- Capture after input-budget eligibility and immediately before transport execution. Freeze request data
  and materialize tool input schemas once; save from that same detached request, then dispatch it. Callback
  observers must not be able to change saved bytes or dispatched data between capture and execution.
- Persist the complete messages/system/agent role and options, user/model selection, permissions, tool
  definitions, tool choice, response schema, maintenance/replay flags and captured preflight parameters.
  No clipping, summary substitution, volatile-file rereads or second model call. Binary/URL/undefined data
  use an explicit reversible encoding. Host callbacks, opaque prepared-plan tokens and transport auth/
  headers are not model context and are not serialized. Existing execution bindings stay in memory.
- Representation is `continuity-fork-input/v1`; SDK historical-message framing and provider-specific
  transformations happen afterward. Do not advertise this as byte-identical provider wire or a saved
  pre-compaction parent request. API replay and isolated/native producer inputs both use this seam.
- Await checkpoint insertion before starting the transport. Persistence/encoding failure blocks that
  attempt and reports `checkpoint`, not provider failure. Cancellation before dispatch may leave an
  immutable prepared checkpoint; it is not proof that the provider processed anything.
- Derive project ownership and directory from the persisted source Session in the same SQLite transaction
  as insertion. Never trust cwd/current project as substitute. Checkpoint outlives Session deletion; project
  identity migration/adoption moves its project index. Directory distinguishes unrelated `global` contexts.
- Primary identity `${forkID}:${attempt}`. Repeating identical save is idempotent; conflicting reuse fails.
  Store a SHA-256 of exact payload bytes. Read verifies digest; list is project-scoped metadata only,
  descending creation time then ID, bounded pagination. No extra manifest, file store, cache or scheduler.
- No frontend, public HttpApi, restoration/execution endpoint or automatic pruning in this change.

## Ownership

- Core: `project/checkpoint.sql.ts`, `project/checkpoint.ts`, generated database migration/schema.
  Neutral string payload; Core never imports Orchestra request types.
- Orchestra: `continuity/checkpoint-context.ts` freezes/serializes request and supports lossless decoding
  for inspection; `fork.ts` invokes optional before-dispatch sink; `service.ts` supplies mandatory production
  sink backed by Core store. Project migration updates checkpoint ownership with Session ownership.
- `beforeDispatch({ forkID, attempt, boundary, payload })` receives only immutable identifiers/string;
  never the live request. No configured sink is valid for isolated test/benchmark harnesses, but production
  SessionContinuity always installs it. Save failure cannot fall through to model execution or compaction.

Frozen interfaces:

```ts
// ProjectCheckpoint.Service; identifiers use existing Core Session/Project brands where applicable.
save({ sessionID, forkID, boundary, attempt, payload }): Effect<Metadata, CheckpointError>
read({ projectID, id }): Effect<(Metadata & { payload: string }) | undefined, CheckpointError>
list({ projectID, directory?, offset?, limit? }): Effect<{ items: Metadata[]; nextOffset?: number }, CheckpointError>
// Metadata: id, projectID, sessionID, forkID, boundary, attempt, directory, createdAt, digest.
// List default 20, maximum 50. No total or availability claim about unread payloads.

// CheckpointContext module in Orchestra:
capture(input: LLM.StreamInput): Effect<{ request: LLM.StreamInput; payload: string }, CaptureError>
decode(payload: string): unknown // Returns captured data fields, not executable bindings.
```

## Acceptance

Tests compare decoded saved input to actual transport input, including replay prefix, role/system text,
tool schemas, exact Unicode, binary and URL values, plus retry suffix. Mutation after capture cannot
change either side. Failure/abort before save means no stream; failed generation still retains checkpoint.
Skipped/disabled/no-op compactions create none. Concurrent sessions share project index without overwrite;
cross-project read fails; reload, hash corruption and project adoption/migration are exercised. New files
stay below 400 LOC. Existing historical compaction proofs are not checkpoint-conformance evidence.
