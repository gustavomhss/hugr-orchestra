# System Context — as implemented

This is a retrospective, descriptive account of shipped code, not a newly designed or ratified set of requirements. Source code and the existing tests below are the witnesses; the citations do not claim that tests were executed for this document.

## Scope and ownership

`packages/core/src/system-context/index.ts` describes its scope as “privileged system context as independently refreshable typed sources.” It owns the algebra; `registry.ts` owns registration and turn-scoped loading; `builtins.ts` supplies environment and date. Producers live with their observed domains. Session owns epoch persistence and history selection. `packages/core/src/session/runner/llm.ts` combines the registry load with skill guidance, reference guidance and meeting context before epoch initialization or preparation.

## Source, key, snapshot and rendering

`Source<A>` has a namespaced `Key`, a JSON codec, a `load` effect, `baseline`, `update`, and optional `removed` renderers. Keys match `^[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._/-]*$`. `make` hides the source value type; `combine` preserves context order and rejects duplicate source keys. `empty` is the identity.

`Snapshot` maps keys to `{ value: JSON, removed?: non-empty string }`. The codec encodes the observed value, decodes the stored value and supplies equivalence for comparisons. A generation contains baseline text and snapshot. Individual baseline, update and removal renderings cannot be empty; rendered parts are joined with a blank line. Removal text is stored alongside each newly rendered snapshot, for later use if the source disappears.

## Initialize, reconcile and replace

| Operation / observation | Result |
|---|---|
| Initialize, all sources available | Generation with baseline and snapshot. |
| Initialize, any source unavailable | `InitializationBlocked` with unavailable keys. |
| Reconcile, equivalent values and no additions or removals | `Unchanged`. |
| Reconcile, changed or newly added source | `Updated`: changed sources render `update`; new sources render `baseline`, with the resulting snapshot. |
| Reconcile, source unavailable | No rendering for that source; its admitted snapshot is retained. An unavailable, not-yet-admitted source is omitted. |
| Reconcile, previously admitted source vanished | Emit its stored removal text and remove it from the snapshot; if no removal text was stored, attempt replacement instead. Multiple removals are sorted by key. |
| Reconcile, stored value incompatible with current codec | Attempt replacement instead of rendering updates. |
| Replace, an admitted source unavailable | `ReplacementBlocked`; unavailable is not removal. |
| Replace, no admitted source unavailable | `ReplacementReady` with a new generation; unavailable sources not in the prior snapshot are omitted. |

Reconciliation that needs replacement uses the same observation, not a second load. Source loads run concurrently. The source comment states: “Returning `unavailable` means observation failed temporarily. It differs from removing a source from the context”.

## Registry lifecycle, order and Turn

The registry is a Location-scoped service. Registration is scoped; closing the owning scope removes the entry, and duplicate entry keys fail registration. Each `load` re-evaluates entries concurrently and combines them sorted by **entry key**, not source key. Sources within each entry retain their context/combine order; duplicate source keys across entries fail when combined.

`Turn` carries `{ sessionID, agent }` while entries load for a provider turn and defaults to `undefined` outside one. As the registry comment says, “a per-agent or per-Session entry reads it in its `load` and closes its sources over the value.” Built-ins register environment then date together under `core/builtins`; these are examples, not a complete producer list.

## Session epoch and compaction boundary

`packages/core/src/session/context-epoch.ts` stores a Session's baseline, snapshot and `baseline_seq`. Initial insertion uses the latest event sequence. Preparation decodes the stored snapshot; a decode failure becomes `ContextSnapshotDecodeError`. Unchanged or blocked replacement retains the stored baseline and sequence. An update publishes `ContextUpdated` and advances the snapshot in the event's commit hook. A ready replacement stores the new generation and sequence; `reset` deletes the epoch.

When the latest compaction sequence is greater than `baseline_seq`, preparation calls `replace` rather than `reconcile`, using that compaction sequence for a ready replacement. Otherwise a replacement resulting from reconciliation uses the latest event sequence. The existing baseline is retained when replacement is blocked.

## Existing test witnesses and execution limits

The following are exact test names, not a claim of execution or CI status:

- `packages/core/test/system-context/index.test.ts`: “stores the canonical JSON encoding of the loaded value”; “loads once and initializes a baseline with a structured snapshot”; “renders updates only after a structured value changes”; “uses the baseline for a newly added source”.
- Same file: “retains admitted snapshots while a source is temporarily unavailable”; “blocks initialization while a source is unavailable”; “emits the previously stored removal message”; “requests replacement when a source without removal text disappears”; “requests replacement when a stored value no longer decodes”.
- Same file: “replaces from one coherent source observation”; “blocks an incompatible replacement while another admitted source is unavailable”; “combines contexts in order”; “requires namespaced durable snapshot keys”.
- `packages/core/test/system-context/registry.test.ts`: “loads scoped entries in stable key order”; “re-evaluates entry producers on each load”; “rejects duplicate entry keys”; “removes an entry when its owning scope closes”.
- `packages/core/test/system-context/builtins.test.ts`: “loads location-scoped environment and host-local date context”; “reconciles the date without repeating unchanged environment context”; “composes ambient instructions after built-in context”.

Epoch and compaction details above are source observations from `context-epoch.ts`, not claims that these three test files exercise persistence or the runner. No tests or CI were run for this prose-only document.

## References

Maintainer guidance: `.orchestra/skills/system-context-maintenance/SKILL.md` (repo-only). Current source: `packages/core/src/system-context/{index,registry,builtins}.ts`, `packages/core/src/session/context-epoch.ts`, and `packages/core/src/session/runner/llm.ts`.
