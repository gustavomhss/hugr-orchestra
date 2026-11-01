---
name: system-context-maintenance
description: Who owns the System Context algebra (typed sources, snapshots, generations), the registry, the built-in and registered sources, and the Session-owned Context Epoch that persists them, plus the invariants that must not regress and how to add a source
---

# System Context maintenance and ownership

System Context is the text a Session shows the model beyond its messages (environment, date, instructions, behaviors, Maestro headers). It is a small algebra: each source renders a baseline once, and later changes render an update message instead of rewriting history. Code is in `packages/core/src/system-context` (algebra, registry, built-ins). Producers live with the domain they observe. Selecting Session History and persisting the Context Epoch belong to the Session (see `AGENTS.md`, V2 Session Core; session mechanics are in `session-core-maintenance`).

## Ownership

| Piece | Owner file | Rule |
|---|---|---|
| Algebra: `Key`, `Source`, `make`, `combine`, `empty`, `initialize`, `reconcile`, `replace`, `unavailable`, `Snapshot`, `Generation` | `packages/core/src/system-context/index.ts` | Pure over an `Effect` per source. No service access beyond what a source's own `load` closes over |
| Registry and the per-turn `Turn` reference | `packages/core/src/system-context/registry.ts` | Location-scoped service. `register` is scoped (closing the scope removes the entry); `load` combines every entry sorted by key |
| Built-ins `core/environment`, `core/date` | `packages/core/src/system-context/builtins.ts` | Registered as one entry `core/builtins`; the node is in `location-services.ts` |
| Instruction files | `packages/core/src/instruction-context.ts` | Key `core/instructions`. Reads the instruction files and config `instructions`. See `docs/specs/v2/instructions.md` |
| Behaviors | `packages/core/src/behavior.ts` | Key `core/behaviors`, one source per stored behavior |
| Maestro sources | `modules/maestro/coordination/src/v2/{atlas-header-source,atlas-restore,board-drift-source,research-inquiry-source}.ts` | Keys `maestro/atlas-header`, `maestro/atlas-resume`, `maestro/board-drift`, `maestro/research-inquiry`. They read the agent and Session through `SystemContextRegistry.Turn` |
| Epoch persistence | `packages/core/src/session/context-epoch.ts`, table `session_context_epoch` in `session/sql.ts` | Session-owned. `initialize`, `prepare`, `reset`; stores `baseline`, `snapshot` (JSON) and `baseline_seq` per Session |
| The consumer | `packages/core/src/session/runner/llm.ts` | `loadSystemContext(sessionID, agent)` calls `registry.load({ sessionID, agent })` and combines the result with other contexts before `SessionContextEpoch.initialize` / `prepare` |

Re-run `grep -rn "SystemContextRegistry.Service" packages modules --include='*.ts'` before relying on the registrant list.

## How a source works

- `SystemContext.make({ key, codec, load, baseline, update, removed? })` builds one source. `load` yields the current value or `SystemContext.unavailable`. `codec` must encode the value to JSON, because the encoded value is stored in the snapshot and compared on the next turn.
- `baseline(current)` is the text for a fresh generation. `update(previous, current)` is the text when the stored value differs. `removed(value)` is evaluated whenever a snapshot is written and its text is stored beside the value; it is shown when that key is later no longer registered.
- `combine` merges contexts and throws `DuplicateKeyError` on a repeated key. A source that has nothing to say is simply `SystemContext.empty`, not an empty string.
- `initialize` creates the first generation: `baseline` is the baseline texts joined by a blank line, `snapshot` maps each key to `{ value, removed? }`. It fails with `InitializationBlocked` when any source is unavailable.
- `reconcile` compares current values with the stored snapshot and returns `Unchanged`, `Updated` (new text plus new snapshot) or, when a stored value no longer decodes under the codec or a vanished key has no `removed` text, a replacement result. `replace` builds a whole new generation and returns `ReplacementBlocked` while a source that was in the snapshot is unavailable.

## Invariants

- Keys follow `<domain>/<name>`: lowercase letters, digits, `.`, `_`, `-`, one slash after a first segment, further `/` allowed in the second part. Core keys are `core/*`, Maestro keys `maestro/*`. A key is durable data (it is stored in every Session's snapshot); renaming a key is a removal plus a new source and renders both texts to every open Session.
- Keys are unique. `combine` throws `DuplicateKeyError`; the registry kills the registration of a second entry with the same key (`Duplicate system context entry key`). Register under a scope that matches the entry's lifetime.
- `unavailable` means "could not be observed", never "removed". An unavailable source keeps its stored snapshot and renders nothing in `reconcile`; it blocks `initialize` and `replace` when it was admitted. A source whose read can fail must return `unavailable` on failure (`instruction-context.ts` does, including for a defect) and must not fall back to `empty`, which would erase the stored value and announce removal.
- Rendered texts are non-empty. `baseline`, `update` and `removed` returning `""` throws (`rendered an empty ...`). A source with no content returns `SystemContext.empty` from the entry's `load`, as `instruction-context.ts` does for zero files.
- The registry sorts entries by key before combining, so the order of baseline text is by key and not by registration order. Do not rely on registration order for prompt layout.
- `Turn` is set only while entries load for a provider turn. A per-agent or per-Session source reads it inside `load` and closes its sources over the value; it is `undefined` outside a turn (for example a global observer), so handle that case.
- Do not put anything volatile in a baseline that is not also in `update`. A changed value renders `update` as a new context message; the baseline is immutable for the life of an epoch.
- Compaction: when the Session has a compaction newer than `baseline_seq`, the next `prepare` runs `replace` (a new baseline and a new `baseline_seq`) rather than `reconcile`. A blocked replacement keeps the old baseline.
- Producer stays with its domain. Core's system-context directory holds the algebra, the registry and the two environment built-ins; an instruction, a behavior or a Maestro header lives with the module that observes it and registers itself in its own layer, with its node depending on `SystemContextRegistry.node`.
- Persistence is Session-owned. Only `session/context-epoch.ts` writes `session_context_epoch` (`session/history.ts` reads `baseline_seq` from it). A change to `SourceSnapshot` is a stored-data change: `prepare` fails with `ContextSnapshotDecodeError` for a snapshot that no longer decodes.

## Adding a source

1. Choose a key `<domain>/<name>` and a JSON codec for the value.
2. Write `load` (value or `unavailable`), `baseline`, `update`, and `removed` if the source can disappear while Sessions still hold it. Without `removed`, the vanished key forces a replacement of the baseline for every Session that saw it.
3. Register in the owning module's layer with `registry.register({ key, load })`, and add `SystemContextRegistry.node` to the node's `deps`.
4. Test with the algebra directly (`SystemContext.initialize`, `reconcile`) for unchanged, updated, unavailable, removed and incompatible-snapshot cases, and add the key to the registrant list above.

## Testing

Tests run on GitHub Actions only: `bun run test:ci core <files>` from the repository root.

- Algebra: `packages/core/test/system-context/index.test.ts`.
- Registry: `packages/core/test/system-context/registry.test.ts`.
- Built-ins: `packages/core/test/system-context/builtins.test.ts`.
- Epoch behavior through the runner: `packages/core/test/session-runner.test.ts` and `packages/core/test/prompt-context-compaction.test.ts`.
- Registered sources: `packages/core/test/instruction-context.test.ts`, `packages/core/test/behavior.test.ts`, and in `modules/maestro/coordination/test` `v2-atlas-header.test.ts`, `v2-atlas-restore.test.ts`, `v2-board-drift.test.ts` (the research-inquiry source has no test of its own).

## Traps

- `initialize` fails with `InitializationBlocked` (part of the runner's error union) while any source is unavailable, so a source that is flaky on the first read blocks the first turn of a new Session. Return `empty` only when the absence is certain.
- `reconcile` publishes `ContextUpdated` with a commit hook that advances the stored snapshot. The snapshot moves with the event, not before it; do not write the snapshot elsewhere.
- Changing a source's codec shape makes every stored value incompatible, which forces a replacement of the baseline for all Sessions on their next turn. Prefer an additive change, or accept the replacement deliberately.
- Source `load` effects run concurrently (`concurrency: "unbounded"`). They must not depend on each other or on registration order.
- The date source renders `toDateString()`, so the update message fires at the first turn after midnight, not at a fixed clock time.
- These docs are repo-only: never add this skill to a seat's `skills`. A fact a seat needs at runtime goes in its prompt or a shipped seat skill.
