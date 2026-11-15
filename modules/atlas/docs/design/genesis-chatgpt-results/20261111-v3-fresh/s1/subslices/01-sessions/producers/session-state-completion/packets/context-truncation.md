# Review packet: context truncation delta

Execution: `6e9b2070-17eb-4e92-bba6-64ce616d6116`. Producer: `/root/l1_a1_completion`. Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Artifact: `s1.core.context`; L1. Candidate SHA-256: `94e04589d726a017c3cbeb8f758d5d23aae773733597a15ea5236e8e1288aea7`; bytes: 5909. Historical SHA-256: `205b44488e2b6349a55480d3becf2e59806c185bec90d43af283e11b3933b1fd`.

This packet requests same-pair reassessment of J1-CONTEXT-F1 only, with the full candidate body retained below. All other bytes match the historical body. The correction must narrow truncation to completed assistant output content, explain UTF-16 prefix and appended marker, and avoid a universal cap claim. Public criteria: GO-A1, GO-A2, GO-A3, GO-A4, GO-A5, QS-1, QS-2, QS-3, QS-4, QS-5, QS-6, AC-01, AC-02, AC-03, CC-1, CC-2, CC-3, CC-7, GO-I1, GO-I2, GO-I7, GO-I8. Read-source evidence only; tests/provider/runtime operations NOT_RUN. Both judges must assess all criteria pertinent to this delta. No tools; no candidate edits; return verdict and concise evidence bindings, separating mandatory findings from optional suggestions.

## Exact candidate body

<BEGIN_BODY>
# System Context, history selection and compaction

Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

System Context is an algebra of typed independently observed sources. Each source has a namespaced key, codec, load effect, baseline renderer, update renderer and optional removal renderer. `combine` rejects duplicate keys. Snapshots retain encoded values and removal text separately from model-visible text. Initialization blocks on any unavailable source. During reconciliation, temporary unavailability retains that source's admitted snapshot; it is not removal. An incompatible codec or removal without removal text requires replacement. Replacement blocks when an already admitted source is unavailable; a newly unavailable, never admitted source is not treated the same way. [1]

The Location registry holds scoped entries, rejects duplicate entry keys, sorts entries by key on load and provides the current Session/agent only while each entry loads. Core built-ins contribute environment and local date. Instruction context separately discovers global and upward-project AGENTS files and configured local instructions. A project's configured instruction paths must resolve within the project; escape or disappearance of a discovered/configured file yields `unavailable`. Remote instruction URLs are refused by Config. Global user configuration has a different path authority from project configuration. [2,3,4]

The Session-owned epoch table retains the exact baseline, structured snapshot and baseline sequence. Missing-epoch initialization occurs before pending input promotion. Subsequent `prepare` either preserves the baseline, replaces it after compatible complete observation/compaction, or emits a durable chronological `ContextUpdated` message with a local commit hook that atomically advances the snapshot. A blocked replacement keeps the old baseline and sequence. [5]

History selection uses the latest completed compaction projection and excludes system updates at or before the active baseline sequence. `loadAll` retains access to older projected messages. Compaction thus changes the model's selected history, not a claim that all historical data was deleted. [6]

The default compactor estimates request size, reserves output/buffer space, keeps an approximately token-bounded serialized recent tail, and summarizes older material with a rolling prior summary. It emits `Compaction.Started`, calls an LLM without tools, and emits `Compaction.Ended` only on nonempty successful text. Failed/empty summaries do not move the history boundary. For completed assistant tool results in this summary input, only the serialized output content is truncated when it exceeds 2,000 UTF-16 code units: the serializer keeps the first 2,000 units using JavaScript `slice(0, 2000)` and appends `\n[truncated]`, so the marked result is longer than 2,000 units. This output truncation does not cap tool arguments or error messages, and is not a universal cap on all model-visible tool content. Auto-compaction defaults on with a 20,000-token buffer and 8,000-token tail; those are local policy defaults, not exact provider token accounting. [7]

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
<END_BODY>

# Context truncation correction: decisive source

Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Source: `packages/core/src/session/compaction.ts`; Git blob `26f09bdbf2f5908199270ad5e4d24f520dee548f`; whole-source SHA-256 `d6becda5c14c0679b6d5bf509a04631309518bd0ca0ba35d1b6f7e8296266d84`. Source inspection only; no product test or model call.

## Lines 17–20

```typescript
17: const DEFAULT_BUFFER = 20_000
18: const DEFAULT_KEEP_TOKENS = 8_000
19: const TOOL_OUTPUT_MAX_CHARS = 2_000
20: const SUMMARY_OUTPUT_TOKENS = 4_096
```

## Lines 103–140

```typescript
103: const estimate = (value: unknown) => Token.estimate(JSON.stringify(value))
104: 
105: const truncate = (value: string) =>
106:   value.length <= TOOL_OUTPUT_MAX_CHARS ? value : `${value.slice(0, TOOL_OUTPUT_MAX_CHARS)}\n[truncated]`
107: 
108: export const serializeToolContent = (content: SessionMessage.ToolStateCompleted["content"]) =>
109:   content
110:     .map((item) =>
111:       item.type === "text" ? item.text : `[Attached ${item.mime}${item.name === undefined ? "" : `: ${item.name}`}]`,
112:     )
113:     .join("\n")
114: 
115: const serialize = (message: SessionMessage.Message) => {
116:   if (message.type === "user") {
117:     const files = message.files?.map((file) => `[Attached ${file.mime}: ${file.name ?? file.uri}]`) ?? []
118:     const reminders = message.promptContext?.reminders.map((note) => `[Hook reminder]: ${note}`) ?? []
119:     return [`[User]: ${message.text}`, ...files, ...reminders].join("\n")
120:   }
121:   if (message.type === "assistant") {
122:     return message.content
123:       .flatMap((part) => {
124:         if (part.type === "text") return [`[Assistant]: ${part.text}`]
125:         if (part.type === "reasoning") return part.text ? [`[Assistant reasoning]: ${part.text}`] : []
126:         const input = typeof part.state.input === "string" ? part.state.input : JSON.stringify(part.state.input)
127:         if (part.state.status === "completed")
128:           return [
129:             `[Assistant tool call]: ${part.name}(${input})`,
130:             `[Tool result]: ${truncate(serializeToolContent(part.state.content))}`,
131:           ]
132:         if (part.state.status === "error")
133:           return [`[Assistant tool call]: ${part.name}(${input})`, `[Tool error]: ${part.state.error.message}`]
134:         return [`[Assistant tool call]: ${part.name}(${input})`]
135:       })
136:       .join("\n")
137:   }
138:   if (message.type === "system") return `[System update]: ${message.text}`
139:   if (message.type === "synthetic") return `[Synthetic context]: ${message.text}`
140:   if (message.type === "shell") return `[Shell]: ${message.command}\n${truncate(message.output)}`
```

## Exact delta

```diff
--- historical/context.md
+++ candidate/context.md
@@ -13,7 +13,7 @@
 
 History selection uses the latest completed compaction projection and excludes system updates at or before the active baseline sequence. `loadAll` retains access to older projected messages. Compaction thus changes the model's selected history, not a claim that all historical data was deleted. [6]
 
-The default compactor estimates request size, reserves output/buffer space, keeps an approximately token-bounded serialized recent tail, and summarizes older material with a rolling prior summary. It emits `Compaction.Started`, calls an LLM without tools, and emits `Compaction.Ended` only on nonempty successful text. Failed/empty summaries do not move the history boundary. Tool text in this summary input has a separate 2,000-character cap. Auto-compaction defaults on with a 20,000-token buffer and 8,000-token tail; those are local policy defaults, not exact provider token accounting. [7]
+The default compactor estimates request size, reserves output/buffer space, keeps an approximately token-bounded serialized recent tail, and summarizes older material with a rolling prior summary. It emits `Compaction.Started`, calls an LLM without tools, and emits `Compaction.Ended` only on nonempty successful text. Failed/empty summaries do not move the history boundary. For completed assistant tool results in this summary input, only the serialized output content is truncated when it exceeds 2,000 UTF-16 code units: the serializer keeps the first 2,000 units using JavaScript `slice(0, 2000)` and appends `\n[truncated]`, so the marked result is longer than 2,000 units. This output truncation does not cap tool arguments or error messages, and is not a universal cap on all model-visible tool content. Auto-compaction defaults on with a 20,000-token buffer and 8,000-token tail; those are local policy defaults, not exact provider token accounting. [7]
 
 An ordinary provider attempt may recover an overflow before durable assistant output through one successful overflow compaction and a remaining provider attempt. The second attempt cannot recover another overflow. Hosted engine turns receive their history unchanged through this Core compaction transform. The default `transform` returns messages unchanged and `afterStep` does nothing, allowing replacements by the owning product composition. [7,8]
 
```
