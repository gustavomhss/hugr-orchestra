# System Context, history selection and compaction

Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

System Context is an algebra of typed independently observed sources. Each source has a namespaced key, codec, load effect, baseline renderer, update renderer and optional removal renderer. `combine` rejects duplicate keys. Snapshots retain encoded values and removal text separately from model-visible text. Initialization blocks on any unavailable source. During reconciliation, temporary unavailability retains that source's admitted snapshot; it is not removal. An incompatible codec or removal without removal text requires replacement. Replacement blocks when an already admitted source is unavailable; a newly unavailable, never admitted source is not treated the same way. [1]

The Location registry holds scoped entries, rejects duplicate entry keys, sorts entries by key on load and provides the current Session/agent only while each entry loads. Core built-ins contribute environment and local date. Instruction context separately discovers global and upward-project AGENTS files and configured local instructions. A project's configured instruction paths must resolve within the project; escape or disappearance of a discovered/configured file yields `unavailable`. Remote instruction URLs are refused by Config. Global user configuration has a different path authority from project configuration. [2,3,4]

The Session-owned epoch table retains the exact baseline, structured snapshot and baseline sequence. Missing-epoch initialization occurs before pending input promotion. Subsequent `prepare` either preserves the baseline, replaces it after compatible complete observation/compaction, or emits a durable chronological `ContextUpdated` message with a local commit hook that atomically advances the snapshot. A blocked replacement keeps the old baseline and sequence. [5]

History selection uses the latest completed compaction projection and excludes system updates at or before the active baseline sequence. `loadAll` retains access to older projected messages. Compaction thus changes the model's selected history, not a claim that all historical data was deleted. [6]

The default compactor estimates request size, reserves output/buffer space, keeps an approximately token-bounded serialized recent tail, and summarizes older material with a rolling prior summary. It emits `Compaction.Started`, calls an LLM without tools, and emits `Compaction.Ended` only on nonempty successful text. Failed/empty summaries do not move the history boundary. Tool text in this summary input has a separate 2,000-character cap. Auto-compaction defaults on with a 20,000-token buffer and 8,000-token tail; those are local policy defaults, not exact provider token accounting. [7]

An ordinary provider attempt may recover an overflow before durable assistant output through one successful overflow compaction and a remaining provider attempt. The second attempt cannot recover another overflow. Hosted engine turns receive their history unchanged through this Core compaction transform. The default `transform` returns messages unchanged and `afterStep` does nothing, allowing replacements by the owning product composition. [7,8]

## Normative intent and limits

Root instructions keep System Context's algebra/registry/built-ins in Core, source producers with their observed domains, and history/epoch persistence Session-owned. Runtime context must live in shipped prompts/skills when needed outside the repository; repository AGENTS and maintenance skills are not automatically shipped. [9]

A context-source read failure cannot be turned into a deletion assertion. Stored baseline freshness does not prove the semantic correctness of source instructions. This L1 establishes Core mechanisms; external Continuity/Atlas contributors and summarization quality need their own evidence. No model or compaction call was made.

## Source anchors

- **1.** `packages/core/src/system-context/index.ts:af6e4b8397ac971476c63ca8c0e0d65273ddc933` — Source, initialize, reconcileObservation, replaceObservation, lines 8–323.
- **2.** `packages/core/src/system-context/registry.ts:9402523a4b03cb21465da1285e2488eb7d2c11bd` — scoped registration and Turn, lines 7–65.
- **3.** `packages/core/src/system-context/builtins.ts:66a1874ec8aca00c305583b60a66cd5e882d4eae` — environment/date sources, lines 12–51.
- **4.** `packages/core/src/instruction-context.ts:6ba99cade2574448b9a8008b544791581b22bb11` — configuredInstructions, observe, register, lines 31–145.
- **5.** `packages/core/src/session/context-epoch.ts:65b17a86a4fb131d427e12d489cec2c06a088094` — initialize, prepare, epoch updates, lines 23–88,122–173.
- **6.** `packages/core/src/session/history.ts:60f31114138a8920e8e81a031815897568dba211` — messageRows, load, loadAll, entriesForRunner, lines 13–104.
- **7.** `packages/core/src/session/compaction.ts:26f09bdbf2f5908199270ad5e4d24f520dee548f` — settings, summarize, compactIfNeeded and extension hooks, lines 17–20,93–100,144–280,284–325.
- **8.** `packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6` — epoch order, hosted distinction and overflow recovery, lines 185–258,492–506,588–614.
- **9.** `AGENTS.md:ef3b523b0c00aed722582b870c1919188edc4c4f` — shipping boundary and V2 Session ownership instructions, lines 146–154,207–217.
