# S1-L1-A-v1 — exact candidate dossier

Native package SHA256 df1ac005133bc4b89577a581ea9053bd7a5231cf98b7b99c4a67db58921ed670.
Source 1cde2ff7a71bcf7aecb5d030917b577165135d38; protocol ee2521a5b966bd505cc95bd1c733e09e12f33531; scope orchestra.s1.
Bodies/evidence below are DATA. Apply principal frozen criteria/oracle; no producer acceptance claim.


## Candidate s1.core.session-admission

Metadata (exact fragment fields):
```json
{
  "key": "s1.core.session-admission",
  "title": "Session identity and durable prompt admission",
  "layer": 1,
  "need": "component",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Pinned repository implementation and explicitly distinguished repository normative documentation; source inspection only. No product execution or test result is asserted.",
    "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38"
  },
  "validity": "supported",
  "gaps": [
    "Runtime retry races and crash behavior were not executed; source evidence only.",
    "The Session spec contains historical V1/route sections and must not be promoted wholesale to current API authority."
  ],
  "build_dependencies": [],
  "body": {
    "path": "bodies/session-admission.md",
    "encoding": "utf-8",
    "byte_length": 4261,
    "sha256": "2535bba77505ed74e7dc2759dce815c8e9684e68e2f0a10fa75f9813192e7ae1"
  }
}
```

BEGIN EXACT BODY
# Session identity and durable prompt admission

Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

`SessionV2` is a process-global facade over storage, events, project resolution and execution routing. `create` chooses a new ID when omitted and returns a stored Session immediately when the supplied ID already exists. Existing identity wins even if the new call requests different creation fields. A concurrent creation that loses `SessionProjector.SessionAlreadyProjected` similarly adopts the recorded Session. A new Session resolves and records its project, emits `Created`, then runs `session-start` hooks; hook outcome does not undo the created Session. [1]

`prompt` generates or uses a message ID, evaluates prompt hooks before durable admission, resolves the prompt, and defaults delivery to `steer`. Hooks are skipped when that ID already names an input or historical projected message; admission then reconciles identity. A new refusal becomes `PromptBlockedError` and is not admitted. `SessionInput.admit` publishes durable `PromptAdmitted`, requires an aggregate sequence and its projection, and returns the stored admission receipt. Only after admission does the facade call `execution.wake`, unless `resume:false` requests admission alone. Exact retry can therefore issue another advisory wake without inserting another input. [1,2]

Retry equivalence compares Session ID, encoded canonical prompt JSON and delivery mode. Conflicting reuse becomes `PromptConflictError`. `promptContext` and creation time participate in projection consistency, rather than in caller retry equivalence. Historical user messages are reconciled only after checking the original durable `Prompted` event, because the projection by itself does not retain delivery. An exact historical retry creates a promoted inbox row; divergence fails. [1,2]

`session_input` stores a message ID, Session foreign key, prompt, optional prompt context, delivery, admitted sequence, optional promoted sequence and creation time. It has distinct indexes for pending delivery, admitted sequence and promoted sequence. Input admission and model visibility are different states: the `PromptAdmitted` projector creates the inbox row; the `Prompted` projector updates promotion and writes the visible user-message projection inside EventV2's event transaction. [2,3,4]

`promoteSteers` selects pending steer rows up to a supplied admission cutoff in sequence order. `promoteNextQueued` selects one oldest pending queue row. Each publishes `Prompted`; this module does not choose provider execution or replay side effects. [2]

## Normative intent and limits

Root AGENTS and the current-slice portion of the Session specification require durable admission before advisory execution and distinguish steer from queue. Those requirements agree with the inspected paths. The specification also contains older V1 bridge/API material, so its entire document is not treated as a current route inventory. [5]

Creation/admission are not proof of a completed model turn, durable execution ownership, exactly-once external effects, or automatic recovery after process death. The observable admission receipt answers “was this input accepted?”; execution and result evidence must be obtained separately. This L1 source reading did not run concurrent retry, storage or HTTP tests.

## Source anchors

- **1.** `packages/core/src/session.ts:402a192a69bcad6a4b08c695657e24ff5e335f93` — Service layer, create, promptHooks, prompt, lines 264–417,491–518.
- **2.** `packages/core/src/session/input.ts:d945b00cf43d03b923cc90d51970d47e2dd3a9c2` — admit, reconcileHistorical, equivalent, promotion, lines 48–160,163–252,291–390.
- **3.** `packages/core/src/session/sql.ts:21b589483ae47f8d924cc58b8d2377525d381cc0` — SessionMessageTable, SessionInputTable, SessionContextEpochTable, lines 133–191.
- **4.** `packages/core/src/session/projector.ts:e5d7ca7d65d1da035a136557b08e2a264c788da5` — Prompted and PromptAdmitted projectors, lines 283–310.
- **5.** `docs/specs/v2/session.md:e3574b87bc3b12c0eca603f96821a16ec89399fc` — Current V2 Core Slice, lines 3–52.
END EXACT BODY

## Candidate s1.core.session-execution

Metadata (exact fragment fields):
```json
{
  "key": "s1.core.session-execution",
  "title": "Local Session execution, continuation and interruption",
  "layer": 1,
  "need": "flow",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Pinned repository implementation and explicitly distinguished repository normative documentation; source inspection only. No product execution or test result is asserted.",
    "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38"
  },
  "validity": "supported",
  "gaps": [
    "Durable multi-node ownership and automatic post-crash provider recovery are explicitly not implemented by this local coordinator.",
    "ExecutionHost internals are a separate owner boundary; only the Core port and invocation path are inspected.",
    "No runtime or product test result was obtained."
  ],
  "build_dependencies": [],
  "body": {
    "path": "bodies/session-execution.md",
    "encoding": "utf-8",
    "byte_length": 4574,
    "sha256": "470ddb1eacfe7294071893968d7de999c90ea98cb0fd48c48e0730ded51d1663"
  }
}
```

BEGIN EXACT BODY
# Local Session execution, continuation and interruption

Layer: **L1 — pinned factual basis**. Need: `flow`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

`SessionExecution` exposes active IDs, explicit resume, advisory wake, interrupt, exclusive operations and `withRunner`. The local implementation owns one `SessionRunCoordinator`; a drain looks up the Session through `SessionStore`, then obtains the runner from `LocationServiceMap.get(session.location)`. No Session ID is a layer-construction input. The recording-only `noopLayer` does not execute; requesting its runner dies explicitly. [1,2]

The coordinator keeps an in-memory map keyed by Session. Explicit `run` starts idle work with `force:true` or joins an active entry. Only a starter opting into `interruptOnCancel` owns cancellation; a joining waiter does not. `wake` coalesces pending work and starts non-forced drains when idle. `exclusive` refuses busy work or waits when requested. `stop` clears the pending wake and interrupts the exact current entry. Different keys can execute concurrently; none of this state is a durable cluster lease. [3]

At the start of a provider attempt the runner checks the stored Location against its bound Location, consults `TaskGovernance.beforeTurn`, selects the agent, initializes missing System Context before promotion, then promotes eligible inputs. New input resets the provider-turn allowance. A queue promotion takes one queued input and the eligible steer batch. It loads projected history using the context baseline sequence and prepares catalog definitions. The last allowed provider turn advertises no tools. [4]

The ordinary turn has one explicit `llm.stream(request)`. A selected registered `ExecutionHost` instead receives one host stream with history and controlled execution/authorization ports. A missing named host is a defect. For ordinary local tools, the publisher records the complete call before its child settlement starts. The runner waits for all started settlements after provider-stream completion before continuation. Hosted-engine Orchestra calls also pass through registry settlement, but are projected as provider-executed events. [4]

Non-forced drains do nothing when neither steer nor queue is pending. Before productive work they fail tools left projected as running by an earlier process. The inner loop continues for settled local calls or pending steering; only when it would become idle does the outer loop promote the next queue input. Interruption clears tool fibers, records interruption outcomes where appropriate, and cancels the Session's open permission and question requests. A runner failure outside a provider turn records a failed assistant step when possible. [4,5]

## Normative intent and real limits

The process-local map is the execution ownership boundary. EventV2 replay-owner fields do not make it clustered. Root AGENTS and the runner comments reserve durable multi-node ownership, durable execution status and post-crash provider continuation for future work. An interrupted drain preserves already admitted inbox data for later wake/resume; it does not silently rerun abandoned side effects. [3,4,5]

The runner's checkbox comment is not a complete feature census: later code implements snapshots and compaction paths that older unchecked items still mention. Statements here follow executable branches. General retry bounding, identical-tool-loop control and stale runtime-attachment semantics are not established merely by the provider-turn step limit. Hosted engine internals are outside this L1 authority; their implementations belong to the engine-adapter owner. No provider request, shell command or product test was executed for this evidence.

## Source anchors

- **1.** `packages/core/src/session/execution.ts:a0af7f2c15cb10366d493b3d4eb971d3d28c1618` — Interface, noopLayer, lines 12–53.
- **2.** `packages/core/src/session/execution/local.ts:e7b758462abfd388f937fb18b79f82f2733dffad` — local drain routing, lines 10–55.
- **3.** `packages/core/src/session/run-coordinator.ts:526a1e28f6027d744a95f145159be9cc59109ac2` — make, run, wake, exclusive, stop, lines 10–153.
- **4.** `packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6` — runTurnAttempt, providerStream, drain, interruption, lines 67–115,185–270,289–357,427–580,616–682.
- **5.** `docs/specs/v2/session.md:e3574b87bc3b12c0eca603f96821a16ec89399fc` — execution and follow-up contract, lines 22–52,212–219.
END EXACT BODY

## Candidate s1.core.persistence

Metadata (exact fragment fields):
```json
{
  "key": "s1.core.persistence",
  "title": "Event persistence, projection and database contracts",
  "layer": 1,
  "need": "evidence",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Pinned repository implementation and explicitly distinguished repository normative documentation; source inspection only. No product execution or test result is asserted.",
    "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38"
  },
  "validity": "supported",
  "gaps": [
    "Historical migrations and driver implementations have grouped inventory disposition; they were not exhaustively read or executed.",
    "Projector registration is not yet keyed by exact durable type plus version.",
    "Seals do not establish authentication or Session execution ownership."
  ],
  "build_dependencies": [],
  "body": {
    "path": "bodies/persistence.md",
    "encoding": "utf-8",
    "byte_length": 4833,
    "sha256": "2a9d564fbc6ce848129eb4611b47ecb27c873cc41cdb9a4e34c2f1f043587741"
  }
}
```

BEGIN EXACT BODY
# Event persistence, projection and database contracts

Layer: **L1 — pinned factual basis**. Need: `evidence`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

Core opens SQLite with WAL, `synchronous=NORMAL`, a 5,000 ms busy timeout, a 64,000 KiB cache setting, foreign keys enabled and a passive checkpoint before applying migrations. The release file is `orchestra.db` under `Global.Path.data`; `ORCHESTRA_DB` may select an absolute path, a data-root-relative filename or `:memory:`. File stores receive a namespace derived from the resolved filename; memory stores receive independent random identities. These choices are source behavior, not measured durability/performance guarantees. [1]

Migration startup distinguishes an empty database, an existing `session` table, and a nonempty unknown database. Empty initialization creates the generated schema and journals known migrations in an immediate transaction. Existing stores reject unknown journaled migration IDs, back up through `VACUUM INTO` before pending migrations, and retain the newest three backups. Each unapplied migration rereads its journal entry under an immediate transaction before running and recording completion. Legacy Drizzle journals are converted by known name or timestamp mapping; an unrecognized timestamp fails. [2]

Durable EventV2 publication uses an immediate transaction to validate aggregate identity/sequence, run registered projectors, run the optional local commit hook, advance the sequence row, and insert the event with a seal. Its replay path resolves a known durable versioned definition. Replaying an already seen sequence requires matching event ID, versioned type and payload; divergence or sequence gaps fail. `strictOwner` mismatch fails, while ordinary replay with another recorded owner returns without applying. The `claim` method updates an aggregate's replay owner; it is not a Session execution lease. [3]

`persist:false` is an explicit exception: it projects locally without appending the event or advancing the sequence and notifies without a durable envelope. A local commit hook cannot be combined with it. Projectors are currently registered by event type, with a source TODO to bind exact type plus version before incompatible historical payloads are supported. Consumers must not infer that arbitrary schema evolution is replay-safe. [3]

The durable subscription registers a sliding wake channel before reading history, then rereads stored aggregate events after wakes and advances its sequence from persisted events. The generic in-process `all` and typed buses are unbounded; a separate bounded adapter exists. Durable replay, in-memory notification and finite aggregate history are distinct surfaces. Session storage decodes persisted message projections and returns typed decode errors on the primary history paths. [3,4]

Event seals hash canonical row content chained to a predecessor; verification accepts bounded windows of at most 2,048 rows and 8 MiB. Seals are integrity evidence, not authentication of the producer, permission to replay, or execution ownership. [5]

## Normative intent and limits

The database README treats the data path, migration identities/order and generated schema locations as user-data contracts. `migration.gen.ts` and `schema.gen.ts` are generated through the package migration command and checked against `schema.json`; individual domain SQL definitions remain with their owners. Never infer a migration is disposable because it is historical. [6]

This package inspected the migration engine and current Session tables, not every historical migration or driver edge case. Existing-user restoration, cross-process locking and seal-negative controls require the repository's authorized CI/runtime evidence. No migration, SQL engine or product test ran here.

## Source anchors

- **1.** `packages/core/src/database/database.ts:aa519134efff085e960affd9be376b0dc92456e1` — Database layer, path, releasePath, lines 17–67.
- **2.** `packages/core/src/database/migration.ts:b3d38c72425f3bae7f5730140070b251a8a4c8e7` — apply, applyExisting, backup, applyOnly, lines 13–168.
- **3.** `packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0` — commitDurableEvent, replay, claim, durable, lines 124–165,187–205,290–435,449–460,527–563,621–699.
- **4.** `packages/core/src/session/store.ts:1e44d051f1a51b816bfeb96ce46dbc0747d07aff` — read-side service, lines 15–105.
- **5.** `packages/core/src/event/seal.ts:92fb956062247720c457eb443e0f271a04261a44` — sealRow, hashRow, verification bounds, lines 10–17,68–100,113–174.
- **6.** `packages/core/src/database/README.md:272a4d3d363f4871b5288d8fb879b9d9b9710d65` — schema and migration maintenance contract, lines 7–38.
END EXACT BODY

## Candidate s1.core.context

Metadata (exact fragment fields):
```json
{
  "key": "s1.core.context",
  "title": "System Context, history selection and compaction",
  "layer": 1,
  "need": "component",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Pinned repository implementation and explicitly distinguished repository normative documentation; source inspection only. No product execution or test result is asserted.",
    "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38"
  },
  "validity": "supported",
  "gaps": [
    "Provider token estimates and generated summaries were not measured or evaluated.",
    "External Context Source producers and Continuity replacement layers are separate source boundaries."
  ],
  "build_dependencies": [],
  "body": {
    "path": "bodies/context.md",
    "encoding": "utf-8",
    "byte_length": 5541,
    "sha256": "205b44488e2b6349a55480d3becf2e59806c185bec90d43af283e11b3933b1fd"
  }
}
```

BEGIN EXACT BODY
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
END EXACT BODY

## Candidate s1.core.tools

Metadata (exact fragment fields):
```json
{
  "key": "s1.core.tools",
  "title": "Canonical tools, settlement and output retention",
  "layer": 1,
  "need": "component",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Pinned repository implementation and explicitly distinguished repository normative documentation; source inspection only. No product execution or test result is asserted.",
    "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38"
  },
  "validity": "supported",
  "gaps": [
    "Plugin canonical tool registration, Session-scoped MCP registration and opaque managed-output references are documented future work.",
    "The older Session spec overstates arbitrary binary read support.",
    "Other leaf implementations and Lean attestation internals need targeted source reads before behavior-specific modifications."
  ],
  "build_dependencies": [],
  "body": {
    "path": "bodies/tools.md",
    "encoding": "utf-8",
    "byte_length": 5285,
    "sha256": "ed668009ad400bf61adee3f1d497c59f91c9932b1730642816659ddbf2978e23"
  }
}
```

BEGIN EXACT BODY
# Canonical tools, settlement and output retention

Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

`Tool.make` produces an opaque value whose private runtime derives a definition, decodes input, executes the leaf, validates/encodes output and produces structured/model content. Invalid input or output becomes `ToolFailure`. `Tool.dynamic` deliberately passes input through undecoded because its external owner, such as an MCP server, owns JSON Schema validation. A dynamic definition therefore is not evidence of local input decoding. Tool names must match the declared 1–64-character identifier pattern. On-demand and whole-tool permission metadata affect catalog presentation; they do not grant execution authority. [1]

Application registrations are process-scoped. Location registrations overlay them; the latest active registration for a name wins. Scope cleanup removes only its own token. Materialization captures eligible registration identities and derived definitions. Settlement checks the current identity against the captured identity and returns a stale-call error after replacement/removal, instead of dispatching to a different tool under an old definition. It captures the selected executable at settlement start. [2,3]

`ToolRegistry` wraps canonical settlement in `ToolSafety`, inspects outputs, bounds contextual output through `ToolOutputStore`, then applies optional Lean projection only where the generic bound left the result whole. Declared typed tool failures become tool results; mixed interruption/defect causes are preserved. Failed text is bounded through the same managed-output path. Registry code does not acquire `PermissionV2.Service`; resource/action permission remains the leaf's responsibility, distinct from the registry's safety wrapper and catalog filtering. [3,4]

The output store defaults to 2,000 lines and 50 KiB of contextual text, with configuration overrides. It keeps a bounded head/tail preview and saves full contextual text under the managed `tool-output` directory when exceeded. Structured output and file parts are retained in the returned output shape; this is not a global cap on every possible payload. Retention scans delete old `tool_*` files after seven days, with an hourly globally composed cleanup layer. Managed paths remain observable in public settlement results. [5]

`read` resolves paths through `LocationMutation`, authorizes an external directory when required, inspects the target, then asks the `read` permission before content retrieval. It pages text/directories and supports JPEG/PNG/GIF/WebP attachments; other base64 binary content is rejected. Its own advertised description refuses PDFs, Office files, archives and non-UTF-8 text. The older Session spec's broad “base64 binary content” description is not the current leaf contract. [6,8]

`apply_patch` parses all hunks, rejects moves, resolves all targets, approves external directories and one `edit` batch, and preflights existing update/delete targets. Commits are sequential; updates use `writeIfUnchanged`. A later failure reports the earlier applied resources. This is intentionally not an atomic multi-file rollback API. [7]

## Normative intent and limits

The nested tool AGENTS requires one canonical representation, scoped registration, captured leaf policy and generic output bounding at settlement. It identifies plugin canonical registration and Session-scoped MCP registrations as unfinished designs, and an opaque replacement for exposed managed paths as future work. [4]

These sources establish the dispatch and representative leaf boundaries. Other tool leaves, Lean producer attestation/recall and platform-specific file mutation remain separately owned leaf detail. Producer capture loss, generic model truncation and Lean summarization are different operations; a model preview is not proof of complete original capture. No tool invocation or tool test ran here.

## Source anchors

- **1.** `packages/core/src/tool/tool.ts:2ecde42373ef59b1bf2352e6272141a610feea16` — Tool.make, dynamic, registration and metadata, lines 11–77,82–177,180–216.
- **2.** `packages/core/src/tool/application-tools.ts:1633897cd6c71cc3abdd22901829b95af2dd96aa` — process-scoped register, lines 21–57.
- **3.** `packages/core/src/tool/registry.ts:ab6a6dc2f8c993aec804ebdfc73d89885e8a1453` — settleWith and materialize, lines 90–180,243–296,314–337.
- **4.** `packages/core/src/tool/AGENTS.md:98ab3e6cc58259a418b7ab80d939295a21eeba2e` — architecture, permission/output boundaries and gaps, lines 1–63.
- **5.** `packages/core/src/tool-output-store.ts:605a99e72e0482a998e2521a26f025589f81da68` — limits, bound and retention, lines 16–59,126–140,156–238.
- **6.** `packages/core/src/tool/read.ts:1e38e74b7231691a31d2ba217267326e74189558` — advertised contract and leaf execution, lines 17–29,41–109.
- **7.** `packages/core/src/tool/apply-patch.ts:c8ba6c68abbd121db47475f17163d72c381f55f9` — preflight, permission and sequential commit, lines 93–219.
- **8.** `docs/specs/v2/session.md:e3574b87bc3b12c0eca603f96821a16ec89399fc` — earlier tool slice descriptions, lines 193–210.
END EXACT BODY

## Candidate s1.core.security

Metadata (exact fragment fields):
```json
{
  "key": "s1.core.security",
  "title": "Permission, tool safety, shell confinement and secret storage",
  "layer": 1,
  "need": "evidence",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Pinned repository implementation and explicitly distinguished repository normative documentation; source inspection only. No product execution or test result is asserted.",
    "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38"
  },
  "validity": "supported",
  "gaps": [
    "Per-Session rules are consumed differently by materialization/capability context and ordinary PermissionV2.configured; universal enforcement is not established.",
    "The Session spec contains an overbroad unsandboxed-Bash statement.",
    "Confinement and secret recognition were inspected but not exercised on any OS.",
    "Fallback credential key-file storage and readable legacy plaintext are explicit implementation limits."
  ],
  "build_dependencies": [],
  "body": {
    "path": "bodies/security.md",
    "encoding": "utf-8",
    "byte_length": 7043,
    "sha256": "dd6e7372b2c26c8c05435db8a55dfa05cd42813a9f105f48dc8b5d702bacbbcf"
  }
}
```

BEGIN EXACT BODY
# Permission, tool safety, shell confinement and secret storage

Layer: **L1 — pinned factual basis**. Need: `evidence`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

`PermissionV2.evaluate` uses the last matching action/resource rule and defaults to `ask`. The Location-owned service resolves the selected agent; an absent resolved agent receives deny-all. A configured deny is checked before saved project allows, so a remembered allow cannot override that deny. Pending asks are in-memory Deferred values. `authorize` waits interruptibly, and cancellation publishes rejection. “Always” saves only requested save patterns for the current project. Rejecting a permission also rejects other pending permissions in the same Session. Questions have their own Location-owned pending map and reject on interruption/cleanup. [1,2]

**Do not collapse Session policy surfaces.** The runner builds agent rules plus `SessionStore.permissions` for materialization and capability context. The inspected `PermissionV2.configured` method instead returns selected-agent permissions; it does not load the Session's own rules before ordinary leaf authorization. This is an observed difference, not a claim that all Session permissions are ignored or universally enforced. A maintainer must trace the exact leaf/capability path before changing this boundary. [1,3]

`ToolSafety` provides profile-driven checks, output inspection, hooks and optional acquisition. Profile loading and native placement bind it to the current project/Location. It can constrain write roots, protected instructions/configuration, never-touch paths, explicit approval triggers, bounded corpus/transcript reads and sandbox requirements. The registry safety wrapper is additional to leaf permission; neither an advertised tool nor a recorded call substitutes for these checks. [4]

Bash resolves its workdir, requests external-directory and command permissions, runs Git safety checks and calls `ToolSafetySandbox.wrap`. Read-only seats receive a required sandbox profile with no write root and no unconfined fallback. A profile requiring confinement rejects a background process whose lifetime cannot bind that profile. Both foreground and background preparations go through the wrapper. [5]

The wrapper always constructs a child environment with recognized secret variable names/values and credential forwarding variables filtered. This is a heuristic filter for tool-child environments, not a provider/server credential scrub. With no confinement requirement, enabled sandbox, exact grant or read root, it returns the scrubbed ordinary command. When confinement is requested but unavailable, a profile's explicit unconfined fallback may return an ordinary command; confined reads and exact network/socket grants do not permit that widening. Exact Unix socket grants are refused on Linux in the inspected path, and unsupported network/backend combinations fail explicitly. Backend discovery alone does not establish confinement: enforcement starts only when the wrapped command is actually spawned. [6]

The opt-in agent terminal runs an already wrapped command through a PTY with exact environment settings; Windows/verbatim command paths do not enable it. It checks output for recognized secrets, bounds captured characters, kills on timeout/interruption and sanitizes control/escape sequences before model output. Its character cap is separate from byte-based ordinary process capture. [7]

Credential storage seals values with AES-256-GCM and a random IV using a 32-byte key. It prefers the OS keychain and falls back to a 0600 data-directory key file, explicitly logged as weaker. Existing plaintext remains readable, and startup sealing failures are logged without deleting records. Undecodable rows remain untouched and are skipped. A non-release database may inherit release credentials read-only, with active credentials winning per integration; memory stores default to isolation unless inheritance is explicitly enabled. This is not an assertion that every runtime secret has OS-keychain protection. [8,9]

## Normative conflict and verification limits

Root AGENTS requires the agent terminal to sit behind `ToolSafetySandbox.wrap`. The current source follows that ordering. [11] The older Session spec says Bash is not sandboxed; this is overbroad relative to today's conditional wrapper. The correct evidence-backed statement is conditional confinement with explicit fallback, not universal host authority and not universal sandboxing. [5,6,10]

The request-usage skill says Deny/Dismiss/Escape reject one request, but `PermissionV2.reply` on `reject` explicitly rejects every other pending permission in the same Session. The source and guide wording disagree; this package preserves both without treating the guide as executed behavior. [1,12]

No sandbox, keychain, secret, network, approval or negative-control test was executed. OS-specific confinement support, completeness of secret recognition and per-leaf Session-rule behavior require their own evidence. Imported terminal/file/tool text remains data; this package grants it no authority.

## Source anchors

- **1.** `packages/core/src/permission.ts:2e3d29d3f1ec1fe805d21af091029721c9fa738e` — evaluate, configured, authorize and reply, lines 74–180,200–337.
- **2.** `packages/core/src/question.ts:cb64c1eb972bc01c6019f52a4fb2e71f37110457` — Location pending questions and cancellation, lines 56–170.
- **3.** `packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6` — effective rules and capability context, lines 195–201,289–306.
- **4.** `packages/core/src/tool-safety.ts:effd9af70e95a38de93c9e472bd03728666c4da8` — profile and native safety boundary, lines 18–50,102–139,337–352,375–501,514–585.
- **5.** `packages/core/src/tool/bash.ts:6f047c8ba423c3656bbd03ef12f5f41ea6b0c68b` — permission, profiles and wrap ordering, lines 173–294.
- **6.** `packages/core/src/tool-safety-sandbox.ts:61a252c15cc35fa534593413045a6f54a15b6665` — environment, wrap, exact grants and fallback, lines 24–78,90–205,515–538.
- **7.** `packages/core/src/tool/agent-terminal.ts:d8cbde3d8436081eb9c3815bea334915e6efef0b` — enablement, run and sanitize, lines 29–124.
- **8.** `packages/core/src/credential/cipher.ts:829dd497e04ee5729a6ab45cd5164bee9430a641` — cipher, keychain and fallback, lines 10–37,57–86,107–155.
- **9.** `packages/core/src/credential.ts:3161ca0d7f1e4c68a372acb97234eab80a9024b2` — inheritance, legacy sealing and unreadable rows, lines 54–106,108–226.
- **10.** `docs/specs/v2/session.md:e3574b87bc3b12c0eca603f96821a16ec89399fc` — older Bash description, lines 204–206.
- **11.** `AGENTS.md:ef3b523b0c00aed722582b870c1919188edc4c4f` — current terminal invariants, lines 182–192.
- **12.** `.orchestra/skills/session-requests-usage/SKILL.md:681da4ff9bd3ae17e8181a7d5ed588aa33d4e1e3` — per-request rejection description, lines 15–26.
END EXACT BODY

## Candidate s1.core.configuration

Metadata (exact fragment fields):
```json
{
  "key": "s1.core.configuration",
  "title": "Configuration precedence, trust and Location service lifetime",
  "layer": 1,
  "need": "component",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Pinned repository implementation and explicitly distinguished repository normative documentation; source inspection only. No product execution or test result is asserted.",
    "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38"
  },
  "validity": "supported",
  "gaps": [
    "Project configuration remains an open-time snapshot while globals refresh per entries call.",
    "Legacy upgrade helpers and consumer-specific policies are not exhaustively inspected.",
    "No Location eviction/reload or trust transition was executed."
  ],
  "build_dependencies": [],
  "body": {
    "path": "bodies/configuration.md",
    "encoding": "utf-8",
    "byte_length": 4414,
    "sha256": "eed22f8ddd9f3fdad18b39cfb8e52ca5f412bad8b21de10fef58ce113ba60ab1"
  }
}
```

BEGIN EXACT BODY
# Configuration precedence, trust and Location service lifetime

Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

Config is a Location service returning ordered documents and supplemental directories. It materializes required packaged skills before recoverable plugin boot. It reads `orchestra.json` then `orchestra.jsonc`, supports JSON comments/trailing commas, validates either current format or a migrated legacy format, and ignores excess properties through explicit decode options. Remote instruction URLs are rejected. General settings apply global documents, direct project files, then `.orchestra` files; nearer project configuration wins within discovered ordering. Experimental policies are loaded in the reverse document order so a global-user rule can override repository policy. [1]

Project configuration is snapshotted when the Location opens. `entries()` rereads global documents and reloads policies so user settings changes can reach the next agent/catalog reload without reopening; it does not rediscover/reload every project file. Treating all config as live would be incorrect. The schema includes agents, providers, permissions, tools/output, attachments, MCP, references, instructions, plugins, compaction/continuity, Relay, research and Maestro static context settings, but the presence of a field is not proof of every consumer's behavior. [1]

`ConfigTrust` distinguishes user-owned entries under the global configuration folder (or pathless documents) from repository entries. Only user-owned `trusted_projects` entries establish trust. `runnable` includes repository-declared commands only for a trusted directory; a project cannot trust itself. Approval canonicalizes an existing absolute directory and refuses a filesystem root. Revocation removes the folder's own entry; a trusted parent can continue to cover it. Trust is a command-admission boundary and does not replace tool permissions. [2]

`buildLocationServiceMap` compiles a Location graph with supplied replacements and extra nodes, binds the concrete Location, and hoists global dependencies. It substitutes native ToolRegistry nodes, applies `Layer.fresh`, and caches with a 60-minute idle time to live. Relay hook recovery starts only after the entire Location graph succeeds and is scoped to that Location. `withGlobalContext` delays lazy acquisition until the completed application's global exports are available. [3,4]

The default graph contains configuration, agent/catalog/provider support, plugins, filesystem and mutation, tools, permissions, questions, MCP/LSP/formatting, runner/model, context, snapshots, project-copy and product-facing adapters. Membership is useful dependency evidence; it is not proof that every integration is connected or has valid credentials. Session execution remains process-global and chooses the Location only when it drains a stored Session. [3]

## Normative intent and limits

The V2 config document is a field-review/decision record with pending/keep/remove/redesign labels, not a complete description of actual loading. The schema and loader are implementation authority for this pin. Old-format migration helpers are compatibility source and require source-specific examination before changing mappings; they must not be dismissed as unused generated files. [1,5]

No config reload, trust transition or Location eviction was run. This L1 proves the visible ordering/lifetime code and identifies its boundary; OS paths, policy consumers and legacy-upgrade cases remain targeted follow-up reads before corresponding mutations.

## Source anchors

- **1.** `packages/core/src/config.ts:52985a1dfc3575efca662dcb0667d81a1ab6f1de` — Info and Location loader, lines 35–110,147–268.
- **2.** `packages/core/src/config/trust.ts:a8b068f1fdb5c01e59ad43c56b9e6241ec3dfc78` — isUser, isTrusted, runnable, approve and revoke, lines 8–81.
- **3.** `packages/core/src/location-services.ts:c754426dde31acad2dbbfd96459b32624cfdd2e4` — locationServices and buildLocationServiceMap, lines 58–171.
- **4.** `packages/core/src/location-service-map.ts:2f9f70c7edf21ab9e8d57eb6966aacab13c47c33` — withGlobalContext, lines 18–43.
- **5.** `docs/specs/v2/config.md:81353980473012b1b3d311f0a638e3d65ba8cbcd` — review labels and scope, lines 1–18,382–390.
END EXACT BODY

## Candidate s1.core.project

Metadata (exact fragment fields):
```json
{
  "key": "s1.core.project",
  "title": "Project identity, canonical paths and retained checkpoints",
  "layer": 1,
  "need": "component",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Pinned repository implementation and explicitly distinguished repository normative documentation; source inspection only. No product execution or test result is asserted.",
    "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38"
  },
  "validity": "supported",
  "gaps": [
    "Git mutation, copy strategies, repository caches, snapshots/revert and formatter/LSP leaves require deeper source reads for behavior-specific changes.",
    "Historical project route sketches are not current API proof.",
    "Checkpoint semantic validity and runtime restoration were not tested."
  ],
  "build_dependencies": [],
  "body": {
    "path": "bodies/project.md",
    "encoding": "utf-8",
    "byte_length": 4569,
    "sha256": "937f99ba01085530af69abf620793e1b518c32867b956e805a5c68d65f950c43"
  }
}
```

BEGIN EXACT BODY
# Project identity, canonical paths and retained checkpoints

Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

`Project.resolve` discovers a Git repository. Without one it uses the global project identity and the filesystem root as project directory; callers must not mistake that root for the active Location's work area. In a repository, identity preference is normalized remote URL hash, existing common-directory cache, then root commit. The worktree is the resolved project directory and the Git common directory is its VCS store. A cache-write bridge remains for compatibility. `record` inserts/upgrades a project row and publishes an update; `ProjectDirectories` separately stores exact project/directory/strategy membership. [1,2]

Location mutation resolves both lexical and physical identity. Relative paths cannot escape the active Location; a lexical-internal path resolving outside its physical root fails. Absolute external paths produce canonical external-directory approval resources rather than granting access. Missing targets resolve through a real existing directory; dangling symlinks are followed with a bounded hop loop. Path resolution and permission are separate stages. [3]

The general FileSystem service exposes read/list/find/glob/grep. Its read/list boundary validates lexical and physical containment, requires the right target kind, and returns content/listing; search is delegated to `FileSystemSearch`. This service is not itself the model-tool permission surface. The `read` leaf described in the tool artifact adds permission and media/text limits. The list helper can browse directories without opening all Location services. [4]

`ProjectCheckpoint` stores a UTF-8 JSON payload with SHA-256 digest, a Session-derived project/directory owner, a fork ID, boundary and attempt 0 or 1. Its identity is `forkID:attempt`. Save checks exact retries against retained Session ID, fork ID, boundary, attempt and payload before resolving a current Session; exact retries still work after the source Session is gone. A differing payload or identity is a conflict. Reads require project ID plus checkpoint ID and verify the digest; list bounds offset and limit (default 20, maximum 50). Storage/preparation errors are mapped to a safe `storage` reason. [5]

The Session facade restricts move to another resolved directory/workspace in the same project and uses exclusive execution ownership. A fork copies projected history before the requested/staged-revert boundary into a new Session with new message IDs and negative projection sequences; it is not a replay of original external effects. [6]

## Normative intent and limits

The older project specification states the multi-project/worktree goal, but its sketch of HTTP routes is historical design material. Current route authority belongs to the Protocol/Server sources, outside this artifact. [7]

Project-copy strategies, Git mutation, snapshot/revert, formatting/LSP and repository cache each have their own source families. This L1 establishes their ownership and the shared identity/path boundary, not complete implementation of every Git or filesystem operation. Digest checking detects payload mismatch; it does not establish semantic validity, authorization to consume a checkpoint, or guaranteed future restoration. No filesystem mutation, Git operation, checkpoint save/read or product test was run.

## Source anchors

- **1.** `packages/core/src/project.ts:bbedbbf34cbc5b431538db37993c0cc0830fa393` — isRoot, identity resolution and record, lines 26–64,85–148,170–191.
- **2.** `packages/core/src/project/directories.ts:7863f4d2640a9b4bd85febab338610446bf839ef` — exact directory/strategy membership, lines 47–158.
- **3.** `packages/core/src/location-mutation.ts:5c80742365c78301f296d5fe87fd8844a1efc44c` — resolve and canonical/external resources, lines 12–59,90–175.
- **4.** `packages/core/src/filesystem.ts:46791eb40338be5fcc31bc22d110a9899d6b5d80` — service, containment and list helper, lines 55–135.
- **5.** `packages/core/src/project/checkpoint.ts:5972b18ab5b5bd6792447261cd65933aee379e99` — save/read/list identity, digests and storage boundary, lines 13–212.
- **6.** `packages/core/src/session.ts:402a192a69bcad6a4b08c695657e24ff5e335f93` — fork and move, lines 519–590.
- **7.** `docs/specs/project.md:35adeb94cff7e1d24adc9844f9e25fdb17df08a5` — historical multi-project goal and route sketch, lines 1–64.
END EXACT BODY

## Candidate s1.core.extensions

Metadata (exact fragment fields):
```json
{
  "key": "s1.core.extensions",
  "title": "Plugin, integration, MCP and skill lifetimes",
  "layer": 1,
  "need": "component",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Pinned repository implementation and explicitly distinguished repository normative documentation; source inspection only. No product execution or test result is asserted.",
    "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38"
  },
  "validity": "supported",
  "gaps": [
    "Individual plugin/provider/OAuth implementations and live MCP operation were not exercised.",
    "OAuth attempts and plugin activations are scoped in-memory state, not durable resumable workflows."
  ],
  "build_dependencies": [],
  "body": {
    "path": "bodies/extensions.md",
    "encoding": "utf-8",
    "byte_length": 4994,
    "sha256": "1adfea6dc88bb969fb2c9232c82b81ae917e8112a9d0993273733450891984d4"
  }
}
```

BEGIN EXACT BODY
# Plugin, integration, MCP and skill lifetimes

Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

`State.create` rebuilds each materialized value from its initial state and ordered active transforms. It commits only after optional finalization. A semaphore serializes rebuilds and effectful `withRead` consumers. Disposing a scoped transform removes it and rebuilds; `State.batch` collects reloads until the enclosing effect succeeds. This is in-memory materialization, not a durable transaction. [1]

`PluginV2` owns Location-lifetime scopes and per-ID locks. `ensure` preserves an existing activation; install executes the plugin effect inside a child scope, materializes registrations, then publishes `Added`. Failure closes the scope and replays state while preserving combined failure causes. Boot tries one collected flush, then removes and reinstalls the batch one-by-one if that flush fails. Active ancestry detects own load cycles; a live nested request for another loading target fails `PLUGIN_DEPENDENCY_BLOCKED`. Its own comment explicitly rejects interpreting this as a general dependency-cycle proof or outer-batch atomicity. [2]

Integration definitions are scoped State transforms; connection views combine saved credentials in reverse storage order with available environment methods. `active` chooses the first. Resolving an environment connection reads its variable on demand. OAuth attempts live in an in-memory synchronized map with child scopes, expiry and retained terminal status. Successful settlement stores the returned credential and emits connection/registry updates; cancellation/expiry close attempt resources. A pending OAuth attempt is not durable across process loss. Provider-specific OAuth behavior remains delegated to the registered implementation. [3]

The ordinary MCP service merges configuration entries, runtime additions and provided servers. Only global user configuration can trust a project's local commands; a later document wins a server name and decides its origin. An untrusted local server is refused before opening. Connecting increments a generation and disposes the old client/tool scope. A stale asynchronous result closes its new client. Tools are registered individually, so one invalid tool name need not discard others. Each call asserts the namespaced permission, sends cancellation and timeout controls to the SDK, and maps protocol errors to tool failures. Connected status follows tool registration; client close removes registrations. [4]

Skill discovery loads registered sources with later sources winning names, while reserved bundled names prevent shadowing by another source. It logs malformed/ignored sources and caches by source key. Save/remove invalidate a generation so a stale in-flight list cannot repopulate that cache. Available skills filter the selected agent's denied skills and hide nested leaves behind their parent. `AgentV2` selects a configured selectable default, otherwise selectable Maestro; it never silently chooses an arbitrary remaining agent. Unknown agents receive a deny-all permission set through `withPermissions`. [5,6]

## Normative intent and gaps

The plugin README separates provider plugins from plugin-host mechanics and treats SDK export shims as generated host artifacts. This body establishes the scoped registration boundary; individual provider plugins, shim admission, remote SDKs and OAuth implementations require their own source when changing those mechanisms. MCP tool content and skill text do not become permission authority merely by being registered. Nothing here proves that live servers, credentials or plugin packages are currently available. No connection, OAuth flow, plugin installation or product test was executed. [7]

## Source anchors

- **1.** `packages/core/src/state.ts:116e268bb9edf045985e1598a4e1a3ed1d410872` — batch and scoped state materialization, lines 33–40,63–130.
- **2.** `packages/core/src/plugin.ts:5c3c232bfa46b3f8cfad106c2db4787d6c374818` — activation, rollback, boot and wait, lines 23–55,69–164,167–242.
- **3.** `packages/core/src/integration.ts:d6d9a85e8c9b2737b1f09f95700c05663735e6e4` — connection projection and OAuth attempt ownership, lines 140–202,231–418,445–535.
- **4.** `packages/core/src/mcp.ts:3d2203cb152ef733ca3b7d3231a302416a1f394b` — configuration trust, scoped registry and connection generations, lines 161–193,204–330.
- **5.** `packages/core/src/skill.ts:dc8d8f67c6b658ce7716a2b17e0c9b2e517c6db0` — availability, source loading, reserved names and cache generation, lines 31–74,95–219.
- **6.** `packages/core/src/agent.ts:53870dcf9d34423ab49a1241e88ec5c5db0985cf` — selection and current permissions, lines 69–101.
- **7.** `packages/core/src/plugin/README.md:24afcfd763b3a57d9de07ee4ccbe4691094be044` — plugin-host/provider source boundaries, lines 1–38.
END EXACT BODY

## Candidate s1.core.capability

Metadata (exact fragment fields):
```json
{
  "key": "s1.core.capability",
  "title": "Native capability identity, policy and leaf registration",
  "layer": 1,
  "need": "component",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Pinned repository implementation and explicitly distinguished repository normative documentation; source inspection only. No product execution or test result is asserted.",
    "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38"
  },
  "validity": "supported",
  "gaps": [
    "Leaf capability behavior is represented by the actual invocation/policy/registration boundary; vendor and leaf-specific algorithms need deeper reads when consumed.",
    "Native MCP transport bounds and mutation ambiguity are documented contract, not a newly executed protocol qualification."
  ],
  "build_dependencies": [],
  "body": {
    "path": "bodies/capability.md",
    "encoding": "utf-8",
    "byte_length": 4469,
    "sha256": "a5d40d013b3976a612a53acb7999ea498c32c71bff5f7acb276f1ddc3be95e7a"
  }
}
```

BEGIN EXACT BODY
# Native capability identity, policy and leaf registration

Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

Capability host authority is an issued Context frame, not model-supplied JSON. `withContext` validates matching owner/invocation Session and agent IDs, freezes identity and captured rules, and marks the frame with a private Symbol. It explicitly does not establish persisted Session/tool-part existence. Child frames additionally require an exact parent context, deterministic child ID, ordinal 1–64, maximum lineage depth 8 and a 64-character request hash. `require` checks current tool invocation and exact project/directory/workspace placement. [1]

`CapabilityPolicy` supplies the persistence check: the Session must still occupy that project/Location, and the root assistant message must still contain the named pending/running tool part for the same agent. Each child proof must match a running child SQL row and every lineage field. Native captured deny rules are a restrict-only floor; later allow/ask rules cannot erase one. Authorization rechecks the binding and current configured permission after any approval. [2]

Permits are frozen objects issued into a private WeakSet. `commitMany` accepts at most 16 permits sharing the same binding, refuses an existing ambient SQL transaction, holds the agent's materialized permission state, starts an immediate database transaction, verifies the same current frame and persisted invocation again, and rechecks current denies before the write callback. Approval occurs before these locks. The guarantee here concerns this native capability boundary; it must not be generalized to every arbitrary plugin/tool. [2]

The Location capability node creates connections/jobs/artifacts/channels/media/document/sheet/service/process/schedule leaves and registers their canonical names once. Vendor resolution and I/O are deliberately first-use. A startup process sweep records stale ownership using the current host registry; a non-interruption sweep failure is logged so Location startup can continue. Schedule management reaches the host scheduler through a separate process-bound port; an unbound scheduler defects explicitly. [3,4]

## Normative intent and limits

The native Streamable HTTP MCP README assigns transport only `listTools` and scoped `open/callTool`. Approved endpoint and exact credential come from the caller. Its stated contract bounds catalogs, requests, responses and session generations; it deliberately omits retry, resumability, OAuth discovery and server-triggered model/tool execution. It requires ambiguous remote mutations to retain `outcome_unknown`: abort/DELETE does not prove nonexecution. These are the transport owner's documented constraints, not fresh runtime verification by this producer. The ordinary SDK-backed MCP service in `s1.core.extensions` is a different surface. [5]

The artifact/process guide explicitly presents artifact content verification and latest-observed process state as limited evidence. This matches why registration or a “running” record must not be reported as verified content or current remote liveness. Leaf artifact revision, sharing, vendor schema validation and process cancellation rules are outside the inspected policy module; the inventory retains those sources for deeper consumption. No native capability operation or vendor call was executed. [6]

## Source anchors

- **1.** `packages/core/src/capability/invocation.ts:e2ddcb3e3f0da61b8d9d5fe8c7c74436b844e890` — issued root/child frames and require, lines 12–141.
- **2.** `packages/core/src/capability/policy.ts:d75718a6ac8d6d3e36c5b791301a68a728be26b0` — validate, authorize, commitMany, lines 35–170.
- **3.** `packages/core/src/capability/tools.ts:1103ab0c8eb3d9d79cc5ff295cb267847eab629e` — canonical Location leaf registration and process sweep, lines 36–68.
- **4.** `packages/core/src/scheduled-task/port.ts:8ea347436e18a93f8dc43926c7fb84108fc0a20c` — scheduler binding port, lines 7–40.
- **5.** `packages/core/src/capability/mcp/README.md:95f3154aef1625eaac3cd8feb500504996eb074f` — native transport contract and deliberate limits, lines 3–9,29–37,43–126.
- **6.** `docs/guides/artifacts-and-processes.md:b9e9c90310318f99a1efaa3ae2952026796364c4` — verification status and observed process state, lines 7–31,33–51.
END EXACT BODY

## Candidate s1.core.automation

Metadata (exact fragment fields):
```json
{
  "key": "s1.core.automation",
  "title": "Actions admission, scheduled dispatch and Board decision records",
  "layer": 1,
  "need": "flow",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Pinned repository implementation and explicitly distinguished repository normative documentation; source inspection only. No product execution or test result is asserted.",
    "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38"
  },
  "validity": "supported",
  "gaps": [
    "Provider-specific Actions commands/reconciliation, cadence policy and remaining Board workflows need their leaf sources when changed.",
    "Scheduled dispatch has an explicit revocation-to-admission race; admission is not Session completion.",
    "No external actions or product runtime checks executed."
  ],
  "build_dependencies": [],
  "body": {
    "path": "bodies/automation.md",
    "encoding": "utf-8",
    "byte_length": 4377,
    "sha256": "83d483f7f56a0e3dfa7a29e89fea01b29d1b5529e36693b20a06fe9cc0db8b88"
  }
}
```

BEGIN EXACT BODY
# Actions admission, scheduled dispatch and Board decision records

Layer: **L1 — pinned factual basis**. Need: `flow`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

Actions is Location-scoped and resolves repository bindings only on first operation, allowing non-Git Locations to boot. GitHub and GitLab readers are selected from the binding; authoring, resources and commands have separate dispatch paths. Execution clones caller data and compares the admitted intent kind and any expected endpoint target fields before performing. One-time command output is validated separately from its durable operation acknowledgement. [1,2]

`ActionsOperations.prepare` requires a real absolute Location and signed-in account, strictly decodes intent, binds provider/account/revision/Location/client identity, reconciles exact retries and refuses conflicting reuse. It sweeps expiry independently, checks ledger/unknown-outcome capacity, and stores a prepared row inside an immediate transaction. Execution can claim only a still-prepared, unexpired matching row as `sending`; other states return their receipt. The provider action runs outside the SQL transaction with a deadline and disposal signal. Failure without definitive evidence becomes `outcome_unknown`; finalization records the outcome. `reconcile` observes only accepted or unknown rows and never calls the perform callback. This separates command admission from confirmed external outcome. [3]

The scheduler claims due slots transactionally and dispatches through normal `SessionV2.create` then durable `prompt`. Legacy runs select Maestro in the task directory. Capability runs check owner agent/placement and current claim before Session creation and again before admission. A documented race remains between the last check and prompt admission: a revoked claim may still receive an honest `started` receipt, including one run beyond a repeat limit. Started proves admission, not completion of the Session's model/tool work. [4]

Stale dispatch claims are selected after the 120-second lease. Takeover compares exact owner/claim time, checks whether the prompt reached `SessionInput`, voids unadmitted claims for replanning, and retries already admitted identity only to reconcile and wake. A failed legacy due slot is consumed rather than silently retried. The separately composed daemon ticks at boot and waits for due times or writes; failures are logged and later passes continue. This SQL dispatch lease is distinct from the process-local Session execution coordinator. [4]

Board answers produce decision records. Changing a standing answer rejects an already-overturned record, invalid option or unchanged answer, inserts a new record with `supersedes_id`, links the old record with `overturned_by_id`, updates the current question answer and appends activity. Recording an outcome addresses the current standing decision and logs Maestro's reason. It preserves answer lineage without claiming that a recorded outcome independently verifies the underlying work. [5]

## Normative intent and gaps

These services expose different meanings for preparation, sending, admission, acknowledgement, observation and recorded decisions. They are not interchangeable “done” statuses. Provider-specific Actions transport/reconciliation, scheduler cadence calculations and Board issue/epic automation are deeper family members not exhaustively interpreted here. No external workflow, schedule, Board write or product test ran.

## Source anchors

- **1.** `packages/core/src/actions.ts:4f81df84763bd63e7680de8fd40c60b583ef68ca` — Location binding, reader routing and execute, lines 49–85,171–216.
- **2.** `packages/core/src/actions/contract.ts:62521cbd3f4860049c3480a2bf9f2ed650c6c9f8` — transport, adapter and operation boundaries, lines 8–88.
- **3.** `packages/core/src/actions/operations.ts:83c0b9e03b063bd59bc2d30317f7de85cbb99ee4` — prepare, execution CAS and observation-only reconcile, lines 16–203.
- **4.** `packages/core/src/scheduled-task.ts:0a89bbdc576091ca01445e45e1500ed4008898a9` — claims, admission race, takeover and daemon, lines 23–32,121–244,272–320,481–504.
- **5.** `packages/core/src/board/decision.ts:4b219f5b62517b2c4f9749a1a99e6257cfeff167` — decision history, change and outcome, lines 11–128.
END EXACT BODY

## Candidate s1.core.research

Metadata (exact fragment fields):
```json
{
  "key": "s1.core.research",
  "title": "Pinned toolkits and retained research evidence",
  "layer": 1,
  "need": "component",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Pinned repository implementation and explicitly distinguished repository normative documentation; source inspection only. No product execution or test result is asserted.",
    "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38"
  },
  "validity": "supported",
  "gaps": [
    "Toolkit manifests, index adapters and individual research validators need leaf inspection for operation-specific changes.",
    "No engine availability or platform qualification was measured."
  ],
  "build_dependencies": [],
  "body": {
    "path": "bodies/research.md",
    "encoding": "utf-8",
    "byte_length": 3942,
    "sha256": "76a39828caccbb41b99fe0f7d480f4a35abac7722d5c34ddfe5c7ddd67c7c202"
  }
}
```

BEGIN EXACT BODY
# Pinned toolkits and retained research evidence

Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

BackendToolkit has explicit absent/fetching/ready/failed/unsupported states, a root separated by engine version and target, and manifest-supplied engines/runtimes. `ensure` rejects an unsupported host and checks dependency ordering and host floor before acquisition. Downloaded engines use `PinnedArtifact.install`; hosted engines use the hosted lifecycle. Readiness requires installed markers, executable files, runtime executables where needed and exact host shim text. A cache marker alone is insufficient. Cross-target prefetch does not execute that target or write its host shim. [1]

`prepare` recognizes commands naming `BACKEND_TOOLKIT_BIN` engines and acquires only those engines and dependencies. The source describes a 60-second shell preparation wait while acquisition may continue; installation has its own attempt lifecycle. The README assigns lockfiles and generated entry skills to owning packs and keeps Core independent of product specialist modules. Those manifest pins and platform floor values are inputs, not evidence that an engine was downloaded or qualified on this machine. [1,2]

ResearchToolkit reuses BackendToolkit with its own root and manifest. Default owner caps are 2 GiB indexer, 1 GiB probe, 2 GiB scratch, 4 GiB index storage, eight commits and a 15-minute shard timeout; config can lower byte caps, not raise them. The default index adapter plans no shards and fails a build as unavailable, so providing the real adapter is necessary. Prewarm records building/skipped state outside the worktree, uses a host-wide file lock for indexer work and retries lock timeouts. A building status older than the shard timeout no longer claims live building. Status writes are best effort and may lose status without making the underlying index successful. `warm` also catches a planning error as an empty shard list: a no-work warm-up is therefore not proof of complete index coverage. [3]

ResearchLedger canonicalizes JSON with sorted object keys, omitted undefined fields and preserved array order. Operation identity derives from Session/message/call/action; event identity derives from execution Session and operation key. Retained entries query versioned event types within project and execution scope, decode each row and reject scope/receipt mismatches. Placement is re-resolved before reuse. A repeated operation with a different input hash or multiple matching records fails conflict. This is retained evidence identity, not a proof of the truth of admitted source text. [4]

## Normative intent and limits

The bodies establish acquisition, readiness, resource-cap and evidence-ledger boundaries. Individual engine manifests, parsers, language indexes, sandbox build adapters and research source/document validation remain owned by the corresponding toolkit/leaf families in coverage. No engine install, language server, index build, source admission or research publication was executed. “Ready” here describes the source predicate, not a current host observation.

## Source anchors

- **1.** `packages/core/src/backend-toolkit/index.ts:e5c8e61d202f8a79a5b967d5abc467a97b58f4a3` — state, prepare, acquire and readiness, lines 17–107,108–179,180–279.
- **2.** `packages/core/src/backend-toolkit/README.md:a7efc8b49f165ad767f51cb49ad9bdbb220215d1` — pack ownership, lockfiles and generated entry skills, lines 1–24.
- **3.** `packages/core/src/research-toolkit/index.ts:a6e7b3bf6dd0ba44d0f0de5cac3eebe5c9f36095` — caps, adapter boundary, prewarm and shard status, lines 15–107,150–218,220–300.
- **4.** `packages/core/src/research/ledger.ts:6b6ca2931b6aa8bdd2156b47fc13005aab93dcbf` — canonical identity, retained scope and replay, lines 30–84,145–157.
END EXACT BODY

## Candidate s1.core.runtime

Metadata (exact fragment fields):
```json
{
  "key": "s1.core.runtime",
  "title": "Host composition and native process infrastructure",
  "layer": 1,
  "need": "component",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Pinned repository implementation and explicitly distinguished repository normative documentation; source inspection only. No product execution or test result is asserted.",
    "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38"
  },
  "validity": "supported",
  "gaps": [
    "OS/native adapters and external LSP/formatter/exporter behavior were not executed.",
    "PTY replay retention does not solve unbounded slow WebSocket-client memory; documented unresolved limit remains.",
    "AppProcess limits depend on caller options and native/legacy backend."
  ],
  "build_dependencies": [],
  "body": {
    "path": "bodies/runtime.md",
    "encoding": "utf-8",
    "byte_length": 5451,
    "sha256": "331d26e17158e0770af02c8772bd01a421dbda1a0bc82802da825f3666fba534"
  }
}
```

BEGIN EXACT BODY
# Host composition and native process infrastructure

Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

`Host.merge` validates contribution IDs, extra node names and Location additions, refusing contributions that own reserved SessionExecution, Session, LocationServiceMap or scheduler nodes. Built-in Location nodes can change only through replacements. `app-node` tags allow Location nodes to depend on global nodes and keep the converse boundary closed. Global paths use Orchestra's XDG data/cache/config/state roots; the module creates required directories at import. These are product data locations, not arbitrary cache names. [1,2,3]

`AppProcess` centralizes spawn, collected output and stream output. Optional collectors cap retained bytes while continuing to drain input and set truncation flags. Inspectors see raw chunks before capture limits. Timeouts and caller AbortSignals terminate the scoped collection path. Memory-tree caps are documented and supplied to Omni; the legacy spawner does not enforce them. Native collection is selected only for eligible commands/options, otherwise the configured spawner path runs. No universal output or timeout bound exists unless the caller supplies one. [4]

Omni loads once, accepts explicit paths only before first load, requires an addon/supervisor pair and throws when requested native components cannot load. It does not silently fall back during acquisition. Lookup checks configured paths, environment overrides, shipped binary locations and checkout targets. Its test-control predicate rejects an enabled run with no native spawn and a strict run with any delegation; reading this predicate is not running that control. Child environment assembly removes `HUGR_OMNI_*` and folds Windows variable names. [5]

PTY sessions keep a bounded retained output ring and at most 25 exited sessions. `exact:true` uses supplied environment plus terminal defaults and adds no login argument; on Windows locale defaults are also added. Attachment returns replay/cursor before live activation. A replay gap sends terminal reset plus a cleaned first-line boundary and requests repaint. Inactive subscribers accumulate pending chunks until activation; synchronous callbacks and a bounded replay ring do not establish network backpressure. Teardown stops or explicitly adopts Omni descendants, and layer finalization waits only up to seven seconds for pending stops. The maintenance skill separately records the unresolved non-reading WebSocket client memory limit. [6,7]

LSP and formatter project commands pass through ConfigTrust. LSP filters files outside active/project roots and shares in-flight launches per root/server. Workspace-code commands use confinement; trusted system commands may use the ordinary launch path. Formatter execution similarly confines workspace-code commands and limits allowed writes; logged spawn/format failure is distinct from successful formatting. Installation lookup falls back to the running version on release-query failure, so an unchanged “latest” value can reflect unavailable observation. OTLP logs/traces initialize only with a configured endpoint. [8,9,10,11]

## Normative intent and gaps

Core owns platform composition; product modules contribute through its ports. Native Rust, OS-specific spawners, PTY adapters, language servers, formatter packages and telemetry exporters remain separate implementations. No process was spawned through product code, no upgrade occurred and no native or network test ran. Source contracts about limits should be rechecked against the exact backend when runtime verification is needed.

## Source anchors

- **1.** `packages/core/src/host.ts:a0fc5bc9a36e50315b0ddddf4de3566555711250` — contribution merge and reserved nodes, lines 15–63.
- **2.** `packages/core/src/effect/app-node.ts:e8112f921ad7a7dcefbf6985c24995df1855c96b` — scope dependency tags, lines 1–14.
- **3.** `packages/core/src/global.ts:ba7790536b60c6075ff37854c4db14909b779183` — XDG data roots and overrides, lines 10–43,59–85.
- **4.** `packages/core/src/process.ts:a2c29d4a18c44ff407e6055b27830fade5d43f20` — capture, cancellation and native selection, lines 25–65,131–217,221–272,319–324.
- **5.** `packages/core/src/omni.ts:94a19789cef782806a80432c9a86f28bccbdecac` — native acquisition and control predicate, lines 25–112,139–174.
- **6.** `packages/core/src/pty.ts:fc08cb64d832f77b145c4c9702d417d7db49c14f` — retention, exact creation, replay and teardown, lines 23–39,74–108,139–197,229–329,370–423.
- **7.** `.orchestra/skills/terminal-maintenance/SKILL.md:610fa93e3ec385790509b0c7fd0181fd30adc727` — terminal ownership, invariants and WebSocket limit, lines 10–29.
- **8.** `packages/core/src/lsp/lsp.ts:7848ef568344421190171962367fe2836170d084` — trust, confinement and shared launch, lines 149–215,223–282.
- **9.** `packages/core/src/format/format.ts:0198f9c0d4aa4a9e1452339ca5c3302611478aba` — trust, command cache and confinement, lines 46–62,73–158.
- **10.** `packages/core/src/installation/service.ts:4a75cd0fdf8467866c10c692987769751edd0f42` — latest lookup and explicit upgrade commands, lines 156–196.
- **11.** `packages/core/src/observability/otlp.ts:4d403d30bded809a37d426a8c56361ca8d66ddf7` — configured OTLP startup, lines 7–18,36–76.
END EXACT BODY

## Candidate s1.core.models

Metadata (exact fragment fields):
```json
{
  "key": "s1.core.models",
  "title": "Core catalog and current Session model adapter boundary",
  "layer": 1,
  "need": "component",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Pinned repository implementation and explicitly distinguished repository normative documentation; source inspection only. No product execution or test result is asserted.",
    "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38"
  },
  "validity": "supported",
  "gaps": [
    "The native Session adapter has a narrower supported API set than the full catalog/SDK plugin surface.",
    "Vendor adapters, pricing accuracy and current provider availability were not exercised."
  ],
  "build_dependencies": [],
  "body": {
    "path": "bodies/models.md",
    "encoding": "utf-8",
    "byte_length": 3987,
    "sha256": "4af060adbf07f6e7e759bd8574793155c5676fd87fbef77125c70cc618ffdcfe"
  }
}
```

BEGIN EXACT BODY
# Core catalog and current Session model adapter boundary

Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

Core ProviderV2 and ModelV2 primarily re-export schema contracts; `ModelV2.parse` splits a provider prefix from the remaining slash-containing model ID. The catalog is Location-scoped, starts empty and receives ordered State transforms. Finalization removes providers denied by `provider.use` policy. Availability checks enabled/disabled state and configured credentials/integration connections; it does not ping a provider. Model projections merge provider/model API settings, headers and request bodies. Labeled non-default key credentials create virtual provider IDs with a `#credentialID` suffix; their model projections retain that distinct selected identity. [1,2,3]

A Session-selected model must be present among available candidates and satisfy inherited subagent-model ceilings. An explicit unavailable selection fails rather than falling back. Without one, the runner tries the configured/default candidate if supported, then the first supported candidate. An unknown explicit variant fails; absent/default variant may use the model request default. Credential resolution chooses the exact virtual-provider credential or the base integration's active connection. [4]

The native Session adapter supports OpenAI Responses for `@ai-sdk/openai`, Anthropic Messages for `@ai-sdk/anthropic`, and OpenAI-compatible chat for native endpoint models or the specified compatible/OpenRouter packages. Other API packages return `UnsupportedApiError`, even if the broader catalog knows them. Canonical generation options are strictly decoded; API keys are separated from HTTP request body before the route is constructed. The adapter carries context/input/output limits and catalog prices, but does not establish live protocol compatibility or measured billing. [4]

The separate AISDK service lets registered plugin hooks supply SDK/language instances. It caches language objects by provider/model/variant and SDKs by serialized API/options, installs scoped hooks and errors if no plugin returns an SDK. It wraps optional SSE chunk timeouts and combined abort signals. This dynamic SDK mechanism must not be used to infer that the current native Session adapter accepts every plugin package. Its caches also have a different identity/lifetime from per-turn native route construction. [5]

## Normative intent and limits

Core's README assigns provider/model/catalog and provider plugins to the platform boundary, with the Copilot directory explicitly vendored. This body covers the catalog-to-Session decision point; transport codecs, model package internals, catalog synchronization and vendor-specific authentication belong to their owning packages/families. Catalog presence, a price record and successful source decoding are not operational availability, billing evidence or a successful model turn. No provider request or model test ran. [6]

## Source anchors

- **1.** `packages/core/src/provider.ts:56a8629db307e3d904c355789db9e5b8256e644f` — schema aliases, lines 1–25.
- **2.** `packages/core/src/model.ts:085800e0480c60a70f989469ba7c0dc09aa758eb` — model aliases and parse, lines 1–42.
- **3.** `packages/core/src/catalog.ts:86acb93f550bc2b941e85d42cc4d62d73cbf64ba` — materialization, policy, availability and virtual credentials, lines 84–122,124–188,191–312.
- **4.** `packages/core/src/session/runner/model.ts:188abc7053f9a02b8dd84ce7bdc30e0e7c001b3b` — variant, route support, selection and credential binding, lines 132–338.
- **5.** `packages/core/src/aisdk.ts:c5f21baea562c0a8eeeb568929d7971f4c80a3dd` — SDK hooks, caches and timeout wrapping, lines 27–122,149–234.
- **6.** `packages/core/README.md:742921238462659e1a5a314f2e0238102c6e9f3a` — module/domain contract and vendored compatibility, lines 54–88.
END EXACT BODY

## Candidate s1.core.economy

Metadata (exact fragment fields):
```json
{
  "key": "s1.core.economy",
  "title": "Durable economic reservation and evidence separation",
  "layer": 1,
  "need": "evidence",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Pinned repository implementation and explicitly distinguished repository normative documentation; source inspection only. No product execution or test result is asserted.",
    "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38"
  },
  "validity": "supported",
  "gaps": [
    "Provider/executor integration was not exhaustively read; universal economic enforcement is not asserted.",
    "Product economy code is not a receipt for this producer execution; token/attempt/billing usage is UNKNOWN."
  ],
  "build_dependencies": [],
  "body": {
    "path": "bodies/economy.md",
    "encoding": "utf-8",
    "byte_length": 2825,
    "sha256": "0413cc550f9037ababcc8cbb706cee3a19c55b35480396b381f0f6c4272096f4"
  }
}
```

BEGIN EXACT BODY
# Durable economic reservation and evidence separation

Layer: **L1 — pinned factual basis**. Need: `evidence`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

The economy envelope names authority, scope, provider/model/route, admitted stages, attempt/in-flight and optional token limits plus retry policy. A sealed request fingerprints those fields, logical identity/snapshot, endpoint/protocol, final request-body digest and per-attempt bounds. Required bound dimensions must be present and positive safe integers within an envelope's limit. A request-body digest is identity evidence; it is not a provider usage receipt. [1]

`reserveAttempt` requires database storage identity, refuses an ambient transaction and performs admission in its own immediate transaction. It checks the exact stored envelope, reconciles the predecessor-derived admission ordinal, rejects conflicting fingerprints, reuses retained completion when available and holds a previously forwarded response whose body is unavailable. Occupancy sums actual settled usage and retained bounds for unsettled obligations; a slot is counted until explicitly released. Corrupt or incomplete accounted dimensions hold/refuse rather than becoming zero. New rows retain exact body snapshot, bound and a forward intent; physical forward observation is separately recorded. [1]

`observeTerminal` records exact remote terminal evidence and releases the in-flight slot. `settleAttempt` additionally requires terminal evidence, matching evidence identity, complete bound usage dimensions and valid numeric relationships. It stores confirmed usage; exceeding an admitted bound blocks the envelope. An HTTP transport error by itself is explicitly not remote terminus. Completion body/reference, physical forward observation and semantic accepted/refused outcome are separate fields. Semantic rejection has no refund path for confirmed usage or held obligations. Recovery reads persisted obligations and does not infer missing evidence. [1]

## Authority and gaps

These facts describe the Core admission ledger module. The existence of these functions does not prove every provider path is governed by them; sender/route integration and the owning executor are required to establish that claim. Nor does this product module measure this Genesis conversation's tokens, physical attempts or billing. Those session economics remain unknown unless exposed by separate observed receipts. No reservation, settlement, fault injection or provider call was run.

## Source anchors

- **1.** `packages/core/src/economy/admission.ts:914a0b925dd282e264292b2247189c549c993a3f` — sealed request, reservation, independent observations and recovery, lines 41–110,242–284,409–510,550–615,630–734,783–823.
END EXACT BODY

## Candidate s1.core.boundaries

Metadata (exact fragment fields):
```json
{
  "key": "s1.core.boundaries",
  "title": "Core adapters to Atlas, Relay and workspace movement",
  "layer": 1,
  "need": "component",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Pinned repository implementation and explicitly distinguished repository normative documentation; source inspection only. No product execution or test result is asserted.",
    "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38"
  },
  "validity": "supported",
  "gaps": [
    "Atlas and Relay engine guarantees require their boundary/module sources and separate runtime evidence.",
    "Session movement is not atomic across file changes and durable location update; active-runner coordination belongs to the caller.",
    "RAG tables alone do not implement or prove retrieval/embedding capability."
  ],
  "build_dependencies": [],
  "body": {
    "path": "bodies/boundaries.md",
    "encoding": "utf-8",
    "byte_length": 3905,
    "sha256": "7b20ed7cedf86c24fb1d9c3471250fcddf666f9c66e7de2dba9852df1fa17143"
  }
}
```

BEGIN EXACT BODY
# Core adapters to Atlas, Relay and workspace movement

Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

The Atlas adapter binds `@orchestra/atlas-boundary/surface` to one store root and trusted project ID. It runs the synchronous boundary calls in process, translating throws to `AtlasSurface.Unavailable`; this can hold the fiber while the boundary walks its tree. A non-repository root uses the active directory; a repository uses its worktree. Territory writes inject project ID on the host side. Delegate handles each interview answer separately and rejects empty replies. The legacy screen mining path caps sites at 200, runs four model calls concurrently, omits failed replies and passes the result to boundary admission; its source says candidates are staged, not promoted. This is a preexisting adapter and is not this Genesis protocol's publication/import path. [1]

The Relay adapter is Location-scoped, stores state under the global data root by project, and defers disk acquisition until needed. `verify` serializes checks, runs the external gate core and records its verdict. A pass that cannot be appended becomes `unavailable/unrecorded`; a failing verdict remains fail. Recovery only considers a run-lock directory older than process start and not held in this process; it appends a recovery note before deleting the lock. This is a conservative local observation, not proof that all other hosts are dead. Workflow-bound progressive arms refuse the generic evaluate path with `WORKFLOW_NATIVE_SETTLEMENT_REQUIRED`; transition uses the native workflow evaluator port. `trial` is separately specified as trusted command execution without grading or ledger passage. [2]

`MoveSession` resolves the destination project and refuses a different project. If moving changes between worktree roots, it captures and applies source changes before publishing `Session.Moved`, then discards the source changes. A later source-reset failure occurs after the destination and Session event may already have changed; the function has no cross-filesystem/event rollback transaction. The inspected function does not itself coordinate an active runner, so caller quiescence must be checked before changing that flow. [3]

RAG Studio's assigned Core file defines source/chunk/revision/question/trace/pipeline tables. Chunks intentionally lack a source foreign key for later orphan cleanup, and this schema has no embedding column or vector table. A declared schema is not a running retrieval engine; the retrieval/pipeline implementation belongs to its module owner. [4]

## Normative intent and gaps

Core owns these adapters and their platform services, while Atlas and Relay modules own their engines and governance semantics. Follow boundary packages for behavior beyond the adapter; do not substitute this source-only L1 for S3/S4 runtime proofs. The inventory preserves Relay workflow/hook helpers, historical runtime-closure documents and control-plane plans as distinct deeper evidence obligations. No Atlas/Relay command, session move, gate, workflow trial or database operation executed.

## Source anchors

- **1.** `packages/core/src/atlas.ts:f6718654785fb155e1bb1b2acb7e9985478b983b` — surface adapter, per-question delegate and legacy mine, lines 41–48,75–148,248–304,318–341.
- **2.** `packages/core/src/relay.ts:25fb509203f933a2e8b0f311c3fc8f9476d53e16` — gate recording, recovery and workflow boundary, lines 120–172,176–217,319–414,473–538.
- **3.** `packages/core/src/control-plane/move-session.ts:49fe728d6956ca1555a763548e9458ea5f3938dc` — project check, change transfer and event ordering, lines 77–148.
- **4.** `packages/core/src/rag-studio/sql.ts:214ab3375acc34072ee74c3123501c80615bf488` — current Core schema boundary, lines 1–81.
END EXACT BODY

## Candidate s1.core.entry

Metadata (exact fragment fields):
```json
{
  "key": "s1.core.entry",
  "title": "Core L1 entry, authority and complete source-family disposition",
  "layer": 1,
  "need": "entry",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Pinned repository implementation and explicitly distinguished repository normative documentation; source inspection only. No product execution or test result is asserted.",
    "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38"
  },
  "validity": "supported",
  "gaps": [
    "L1 candidate only; independent review, later layers and runtime/import/publication remain principal/campaign obligations.",
    "Broad family disposition is not exhaustive acceptance of unread leaf implementations.",
    "No product runtime qualification or fresh test result is claimed."
  ],
  "build_dependencies": [],
  "body": {
    "path": "bodies/entry.md",
    "encoding": "utf-8",
    "byte_length": 7312,
    "sha256": "6a488ca8f9717a497949b71ed41db84d995f23b90c31cc59c22c5bd86239ca6c"
  }
}
```

BEGIN EXACT BODY
# Core L1 entry, authority and complete source-family disposition

Layer: **L1 — pinned factual basis**. Need: `entry`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Scope and factual entry

This is producer A's L1 factual basis for the pinned Core population, prepared for cumulative later understanding. It contains no L2–L4 acceptance claim. Core is the reusable platform/domain package consumed by server, apps, SDK and product modules. The repository README requires Schema → Core and Protocol → Server boundaries, forbids Core importing Client/Server, and declares explicit public subpaths. The captured package manifest has 437 exports, no bare `.` export and no wildcard key; this count was parsed from pinned bytes. Product behavior is exposed through those subpaths and composition ports, not an inferred all-purpose Core entry. [1,2]

Use `session-admission` for identity and accepted input, `session-execution` for active local work, `persistence` for events/database, and `context` for model-visible history. `tools`, `security`, `capability` and `configuration` identify distinct authority boundaries. `project`, `runtime`, `models`, `extensions`, `automation`, `research`, `economy` and `boundaries` describe the remaining coherent Core needs. Those names mean the stable `s1.core.*` keys. Navigation is consultation, not a hidden L1 build dependency.

## Population disposition

The frozen assigned population contains **1,441 entries**. The deterministic coverage ledger lists every path once, with original Git blob, family, kind, read status, depth, reason, need and proposed artifact. It includes **814 Core src entries**, **584 Core test entries**, and **43 other assigned entries**. These are inventory observations from the supplied pinned population, not a fresh remote census. Family counts include source, docs and validation members:

| Family | Assigned entries | L1 artifact entry |
| --- | ---: | --- |
| actions | 155 | `s1.core.automation` |
| agent | 10 | `s1.core.extensions` |
| architecture-history | 9 | `s1.core.entry` |
| atlas | 1 | `s1.core.boundaries` |
| backend-toolkit | 59 | `s1.core.research` |
| board | 38 | `s1.core.automation` |
| capability | 170 | `s1.core.capability` |
| config | 62 | `s1.core.configuration` |
| control-plane | 3 | `s1.core.boundaries` |
| database | 89 | `s1.core.persistence` |
| documentation | 3 | `s1.core.entry` |
| economy | 5 | `s1.core.economy` |
| event | 11 | `s1.core.persistence` |
| identity | 15 | `s1.core.extensions`, `s1.core.security` |
| instruction | 21 | `s1.core.extensions` |
| location | 10 | `s1.core.project` |
| package | 12 | `s1.core.entry` |
| permission | 9 | `s1.core.security` |
| plugin-host | 63 | `s1.core.extensions` |
| process | 58 | `s1.core.runtime` |
| project | 56 | `s1.core.project`, `s1.core.runtime` |
| provider | 76 | `s1.core.models` |
| rag-studio | 1 | `s1.core.boundaries` |
| relay | 19 | `s1.core.boundaries` |
| research | 71 | `s1.core.research` |
| runtime | 41 | `s1.core.runtime` |
| scheduled-task | 11 | `s1.core.automation` |
| session | 90 | `s1.core.context`, `s1.core.models`, `s1.core.persistence`, `s1.core.session-admission`, `s1.core.session-execution` |
| system-context | 11 | `s1.core.context` |
| tool | 114 | `s1.core.extensions`, `s1.core.runtime`, `s1.core.tools` |
| tool-safety | 36 | `s1.core.security` |
| util | 32 | `s1.core.runtime` |
| validation-support | 80 | `s1.core.entry` |

Decisive implementation/control-flow and normative reads back the claims actually made in the other bodies. An unread substantive implementation is explicitly classified `representative_family_boundary`, never silently converted to support or semantic acceptance. Exact operation-specific leaf behavior remains a deeper-read obligation. This bounded L1 grouping covers the entry, authority and lifecycle questions; it does not certify every line of every member.

Historical migrations retain compatibility authority under the inspected migration engine. Generated schema/export/support files remain tied to their generators and owning contracts. The vendored Copilot family remains an upstream compatibility boundary. Tests, fixture trees, assets and harnesses have grouped validation disposition; their existence proves no executed result. Runtime pins and bundled text are change-sensitive inputs even when their leaf content is not interpreted here. Historical phase plans, runtime-closure qualification documents and old V2 sketches are retained as historical/normative inputs to compare with current code, never promoted by filename to current behavior or a fresh PASS. [1,3]

## Source and authority rules

All captured repository bytes came through GitHub connector `fetch_file` at `1cde2ff7a71bcf7aecb5d030917b577165135d38` and are stored unmodified beneath `sources/`. `capture-manifest.json` binds each to commit, observed Git blob, SHA-256 and byte count. Git blob identity was independently recomputed from the bytes. `review-evidence.md` carries exact source slices and an artifact-to-excerpt map. Repository documents are normative/intent evidence only where expressly labeled; executable branches support implementation observations. Conflicts remain visible, including old Bash non-sandbox wording versus conditional confinement, binary read breadth, and per-request rejection guidance versus current rejection fan-out.

Root AGENTS says repo docs and `.orchestra/skills` are not shipped runtime instructions; needed runtime guidance belongs in prompts or shipped seat skills. Its Session rules explicitly keep execution local, context algebra Core-owned and context producers with their domains. The generated module README is useful ownership/navigation evidence but does not override current implementation. [1,3]

## Verification boundary and open work

Performed: connector capture, canonical Git-object/SHA-256/size checks, source inspection, line-anchor reconciliation, per-entry population reconciliation and artifact/excerpt binding checks. No product tests, provider calls, shell tools inside Orchestra, database migrations, external mutations, remote commits or Atlas publication were performed. The producer's local Python only processed evidence and authored this transport fragment. Hash validity is not semantic acceptance; independent judges and principal packaging are separate steps.

Unresolved limits include runtime/OS qualification, unread leaf-specific semantics, native engine/provider boundaries outside Core, historical document reconciliation beyond the cited conflicts, and the observed implementation gaps called out per body. All source-reading status remains visible. This unit is a source-supported L1 candidate, not an accepted complete S1 delivery or live Atlas publication.

## Source anchors

- **1.** `packages/core/README.md:742921238462659e1a5a314f2e0238102c6e9f3a` — public entry, architecture and generated domain inventory, lines 1–88.
- **2.** `packages/core/package.json:8ee8ebb666051c9b5ee0fcd4a54bceb3a2cb3c43` — scripts and explicit exports (437 keys parsed from captured manifest), lines 1–453.
- **3.** `AGENTS.md:ef3b523b0c00aed722582b870c1919188edc4c4f` — shipping, terminal and Session scope instructions, lines 146–154,182–192,207–217.
END EXACT BODY

BEGIN EXACT COMPACT SOURCE EVIDENCE
# Producer A L1 exact source evidence — compact judge projection

Source commit: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Excerpts are exact UTF-8 source slices, with source Git blob identity and inclusive line spans. They are evidence for source observations and separately labeled repository intent; they are not executed tests or live qualification. Body hashes bind the artifact map below. The full source archive remains in `sources/`; `review-evidence.md` preserves all cited anchor spans.

## Artifact → excerpt map

| Artifact | Exact excerpts |
| --- | --- |
| `s1.core.session-admission` | C001, C002 |
| `s1.core.session-execution` | C003, C004, C005, C006, C007 |
| `s1.core.persistence` | C008, C009, C010, C011, C012, C013 |
| `s1.core.context` | C014, C015, C016, C017, C018, C019 |
| `s1.core.tools` | C020, C021, C022, C023, C024 |
| `s1.core.security` | C025, C026, C027, C028, C029, C030, C031 |
| `s1.core.configuration` | C032, C033, C034 |
| `s1.core.project` | C035, C036, C037, C038 |
| `s1.core.extensions` | C039, C040, C041, C042, C043, C044 |
| `s1.core.capability` | C045, C046, C047, C048 |
| `s1.core.automation` | C049, C050, C051, C052, C053, C054 |
| `s1.core.research` | C055, C056, C057, C058, C059 |
| `s1.core.runtime` | C060, C061, C062, C063, C064, C065 |
| `s1.core.models` | C066, C067, C068, C069, C070 |
| `s1.core.economy` | C071, C072, C073, C074 |
| `s1.core.boundaries` | C075, C076, C077, C078, C079, C080, C081 |
| `s1.core.entry` | C082, C083 |

## C001

`packages/core/src/session.ts:402a192a69bcad6a4b08c695657e24ff5e335f93` — lines 499–514.

```typescript
            const admitted = yield* SessionInput.admit(db, events, {
              id: messageID,
              sessionID: input.sessionID,
              prompt,
              ...(notes.length === 0 ? {} : { promptContext: { reminders: [...notes] } }),
              delivery,
            }).pipe(
              Effect.catchDefect((defect) =>
                defect instanceof SessionInput.LifecycleConflict
                  ? new PromptConflictError({ sessionID: input.sessionID, messageID })
                  : Effect.die(defect),
              ),
            )
            if (!SessionInput.equivalent(admitted, expected))
              return yield* new PromptConflictError({ sessionID: input.sessionID, messageID })
            if (input.resume !== false) yield* execution.wake(admitted.sessionID)
```

## C002

`packages/core/src/session/input.ts:d945b00cf43d03b923cc90d51970d47e2dd3a9c2` — lines 291–300.

```typescript
export const equivalent = (
  input: Admitted,
  expected: {
    readonly sessionID: SessionSchema.ID
    readonly prompt: Prompt
    readonly delivery: Delivery
  },
) => input.delivery === expected.delivery && matchesPrompt(input, expected)

const matchesPrompt = (input: Admitted, expected: { readonly sessionID: SessionSchema.ID; readonly prompt: Prompt }) =>
```

## C003

`packages/core/src/session/run-coordinator.ts:526a1e28f6027d744a95f145159be9cc59109ac2` — lines 85–96.

```typescript
        const entry = active.get(key)
        if (entry !== undefined) {
          if (entry.stopping) return restore(Deferred.await(entry.done).pipe(Effect.andThen(run(key, runOptions))))
          return restore(Deferred.await(entry.done))
        }

        const next = makeEntry()
        active.set(key, next)
        start(key, next, drain(key, true))
        return restore(Deferred.await(next.done)).pipe(
          Effect.onInterrupt(() => runOptions?.interruptOnCancel ? stop(key, next) : Effect.void),
        )
```

## C004

`packages/core/src/session/run-coordinator.ts:526a1e28f6027d744a95f145159be9cc59109ac2` — lines 99–110.

```typescript
    const wake = (key: Key) =>
      Effect.sync(() => {
        const entry = active.get(key)
        if (entry !== undefined) {
          entry.pendingWake = true
          return
        }

        const next = makeEntry()
        active.set(key, next)
        start(key, next, drain(key, false))
      })
```

## C005

`packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6` — lines 427–432.

```typescript
      const source = request
        ? llm.stream(request)
        : host && agent.info
          ? host.stream({
              session,
              agent: agent.info,
```

## C006

`packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6` — lines 510–517.

```typescript
            yield* withPublication(publisher.failUnsettledTools("Provider did not return a tool result", true))
            yield* withPublication(publisher.failAssistant(llmFailure.reason.message))
          }
          if (stream._tag === "Failure" && Cause.hasInterrupts(stream.cause)) yield* FiberSet.clear(toolFibers)
          const settled = yield* restore(awaitToolFibers(toolFibers)).pipe(Effect.exit)
          if (settled._tag === "Failure" && SessionDirectCommands.isUserDeclined(settled.cause)) {
            yield* FiberSet.clear(toolFibers)
            yield* withPublication(publisher.failUnsettledTools("Tool execution interrupted"))
```

## C007

`packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6` — lines 620–630.

```typescript
      const hasSteer = yield* SessionInput.hasPending(db, input.sessionID, "steer")
      const hasQueue = hasSteer ? false : yield* SessionInput.hasPending(db, input.sessionID, "queue")
      if (!input.force && !hasSteer && !hasQueue) return
      // `session-idle` hooks run once the drain ends, settled, failed or interrupted; they only record, so the drain ends
      // as it would have.
      yield* Effect.addFinalizer(() => tools.session({ operation: "session-idle", sessionID: input.sessionID }).pipe(Effect.exit))
      yield* SessionDirectCommands.failInterruptedTools({ events, store }, input.sessionID)
      let promotion: SessionInput.Delivery | undefined = hasSteer ? "steer" : hasQueue ? "queue" : undefined
      let shouldRun = input.force || hasSteer || hasQueue
      while (shouldRun) {
        let needsContinuation = true
```

## C008

`packages/core/src/database/database.ts:aa519134efff085e960affd9be376b0dc92456e1` — lines 35–42.

```typescript
    yield* db.run("PRAGMA journal_mode = WAL")
    yield* db.run("PRAGMA synchronous = NORMAL")
    yield* db.run("PRAGMA busy_timeout = 5000")
    yield* db.run("PRAGMA cache_size = -64000")
    yield* db.run("PRAGMA foreign_keys = ON")
    yield* db.run("PRAGMA wal_checkpoint(PASSIVE)")
    yield* DatabaseMigration.apply(db)

```

## C009

`packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0` — lines 197–200.

```typescript
      // TODO: Bind durable projectors to exact type+version before supporting incompatible historical payloads.
      const listeners = new Array<Subscriber>()
      const { db } = yield* Database.Service

```

## C010

`packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0` — lines 383–392.

```typescript
                            durable: { aggregateID, seq, version: durable.version },
                          } as Payload
                          for (const projector of list) {
                            yield* projector(committed, origin)
                          }
                          if (commit) yield* commit(seq)
                          yield* db
                            .insert(EventSequenceTable)
                            .values([{ aggregate_id: aggregateID, seq, owner_id: input?.ownerID }])
                            .onConflictDoUpdate({
```

## C011

`packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0` — lines 406–416.

```typescript
                            .pipe(Effect.orDie)
                          // Materialize JSON once so user toJSON values cannot change between sealing and storage.
                          const record = {
                            id: event.id,
                            aggregate_id: aggregateID,
                            seq,
                            type: versionedType(definition.type, durable.version),
                            data: Schema.decodeUnknownSync(
                              Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
                            )(JSON.stringify(encoded)),
                          }
```

## C012

`packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0` — lines 663–670.

```typescript
          const wake = yield* PubSub.sliding<void>(1)
          const subscription = yield* PubSub.subscribe(wake)
          yield* Effect.acquireRelease(
            Effect.sync(() => {
              const wakes = pubsub.durable.get(aggregateID) ?? new Set()
              wakes.add(wake)
              pubsub.durable.set(aggregateID, wakes)
            }),
```

## C013

`packages/core/src/event/seal.ts:92fb956062247720c457eb443e0f271a04261a44` — lines 85–88.

```typescript
export function hashRow(row: Row, previous: string, domain = DOMAIN) {
  return createHash("sha256")
    .update(`${domain}\n${previous}\n${canonicalRow(row)}`)
    .digest("hex")
```

## C014

`packages/core/src/system-context/index.ts:af6e4b8397ac971476c63ca8c0e0d65273ddc933` — lines 201–207.

```typescript
export function initialize(value: SystemContext): Effect.Effect<Generation, InitializationBlocked> {
  return observe(value).pipe(
    Effect.flatMap((entries) => {
      const unavailable = entries.flatMap((entry) => (entry._tag === "Unavailable" ? [entry.key] : []))
      if (unavailable.length > 0) return new InitializationBlocked({ keys: unavailable })
      return Effect.succeed(initializeObservation(entries))
    }),
```

## C015

`packages/core/src/system-context/index.ts:af6e4b8397ac971476c63ca8c0e0d65273ddc933` — lines 253–258.

```typescript
    const stored = getSnapshot(previous, entry.key)
    if (entry._tag === "Unavailable") {
      if (stored) snapshot[entry.key] = stored
      continue
    }
    if (!stored) {
```

## C016

`packages/core/src/system-context/index.ts:af6e4b8397ac971476c63ca8c0e0d65273ddc933` — lines 290–294.

```typescript
function replaceObservation(entries: ReadonlyArray<Entry>, previous: Snapshot): ReplacementResult {
  if (entries.some((entry) => entry._tag === "Unavailable" && getSnapshot(previous, entry.key) !== undefined))
    return { _tag: "ReplacementBlocked" }
  return { _tag: "ReplacementReady", generation: initializeObservation(entries) }
}
```

## C017

`packages/core/src/session/context-epoch.ts:65b17a86a4fb131d427e12d489cec2c06a088094` — lines 73–78.

```typescript
    SessionEvent.ContextUpdated,
    { sessionID, messageID: SessionMessage.ID.create(), timestamp: yield* DateTime.now, text: result.text },
    { commit: () => advance(db, sessionID, result.snapshot).pipe(Effect.orDie) },
  )
  return { baseline: stored.baseline, baselineSeq: stored.baseline_seq }
})
```

## C018

`packages/core/src/session/compaction.ts:26f09bdbf2f5908199270ad5e4d24f520dee548f` — lines 242–254.

```typescript
        }),
        Effect.as(true),
        Effect.catchTag("LLM.Error", () => Effect.succeed(false)),
      )
    const summary = chunks.join("")
    if (!summarized || failed || !summary.trim()) return false
    yield* dependencies.events.publish(SessionEvent.Compaction.Ended, {
      sessionID: input.sessionID,
      messageID,
      timestamp: yield* DateTime.now,
      reason,
      text: summary,
      recent: selected.recent,
```

## C019

`packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6` — lines 592–603.

```typescript
            if (!(defect instanceof TurnTransitionError)) return yield* Effect.die(defect)
            if (defect.transition._tag === "ContinueAfterOverflowCompaction")
              return yield* Effect.die("Post-compaction provider attempt cannot recover another overflow")
            yield* Effect.yieldNow
            return yield* runAfterOverflowCompaction(sessionID, undefined, defect.transition.step)
          }),
        ),
      )
    })

    const runTurn: RunTurn = Effect.fnUntraced(function* (sessionID, promotion, step) {
      return yield* runTurnAttempt(sessionID, promotion, step, compaction.compactAfterOverflow).pipe(
```

## C020

`packages/core/src/tool/registry.ts:ab6a6dc2f8c993aec804ebdfc73d89885e8a1453` — lines 97–108.

```typescript
    const settleWith = Effect.fn("ToolRegistry.settle")(function* (input: ExecuteInput, advertised?: object) {
      const registration =
        local.get(input.call.name)?.at(-1)?.registration ?? applications.entries().get(input.call.name)
      if (!registration)
        return {
          result: {
            type: "error" as const,
            value: advertised ? `Stale tool call: ${input.call.name}` : `Unknown tool: ${input.call.name}`,
          },
        }
      if (advertised && registration.identity !== advertised)
        return { result: { type: "error" as const, value: `Stale tool call: ${input.call.name}` } }
```

## C021

`packages/core/src/tool/AGENTS.md:98ab3e6cc58259a418b7ab80d939295a21eeba2e` — lines 43–49.

```text
## Permissions

The registry has no `PermissionV2.Service` dependency and performs no execution authorization. An internal built-in-only operation attaches a permission action solely to preserve whole-tool definition filtering; it is not part of public `Tool.make`. Most tools default to their registered name; `edit`, `write`, and `apply_patch` declare the shared `edit` action.

Definition filtering is catalog visibility, not execution authorization. A call still executes the captured leaf policy if it reaches settlement.

Built-in `Tool.withOnDemand` marks catalog metadata only. These tools stay eligible in captured definition/identity lookup and canonical settlement, but default model advertisement omits them. An explicit host-owned `advertisedNames` projection may include them; it never grants execution permission.
```

## C022

`packages/core/src/tool/read.ts:1e38e74b7231691a31d2ba217267326e74189558` — lines 17–29.

```typescript
export const name = "read"
const SUPPORTED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"])
const LocationInput = Schema.Struct({
  path: Schema.String,
  offset: ReadToolFileSystem.PageInput.fields.offset.annotate({
    description: "The 1-based directory entry or text line offset to start reading from",
  }),
  limit: ReadToolFileSystem.PageInput.fields.limit.annotate({
    description: "The maximum number of directory entries or text lines to read",
  }),
})
const Input = LocationInput
const Output = Schema.Union([FileSystem.Content, ReadToolFileSystem.TextPage, ReadToolFileSystem.ListPage])
```

## C023

`packages/core/src/tool/apply-patch.ts:c8ba6c68abbd121db47475f17163d72c381f55f9` — lines 204–219.

```typescript
                )
                return { applied, files: patchFiles }
              }).pipe(Effect.mapError((error) => (error instanceof ToolFailure ? error : fail("patch"))))
            },
          }),
          "edit",
        ),
      })
      .pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "tool/apply-patch",
  layer,
  deps: [ToolRegistry.node, LocationMutation.node, FileMutation.node, FSUtil.node, PermissionV2.node],
```

## C024

`docs/specs/v2/session.md:e3574b87bc3b12c0eca603f96821a16ec89399fc` — lines 193–200.

````text
The first built-in contribution is bounded `read`:

```text
resolve one path relative to the Location or a named project reference
-> reject absolute paths, path escapes, and symlink escapes
-> authorize read against the canonical resource identity
-> for a file: return UTF-8 text or base64 binary content; page oversized UTF-8 text by bounded line ranges
-> for a directory: return direct children in directory-first alphabetical order
````

## C025

`packages/core/src/permission.ts:2e3d29d3f1ec1fe805d21af091029721c9fa738e` — lines 130–141.

```typescript
        discard: true,
      }).pipe(
        EffectRuntime.ensuring(
          EffectRuntime.sync(() => {
            pending.clear()
          }),
        ),
      ),
    )

    const savedRules = EffectRuntime.fnUntraced(function* () {
      return (yield* saved.list({ projectID: location.project.id })).map(
```

## C026

`packages/core/src/permission.ts:2e3d29d3f1ec1fe805d21af091029721c9fa738e` — lines 282–298.

```typescript
          if (input.reply === "reject") {
            yield* Deferred.fail(
              existing.deferred,
              input.message ? new CorrectedError({ feedback: input.message }) : new DeclinedError(),
            )
            pending.delete(input.requestID)
            for (const [id, item] of pending) {
              if (item.request.sessionID !== existing.request.sessionID) continue
              yield* events.publish(Event.Replied, {
                sessionID: item.request.sessionID,
                requestID: item.request.id,
                reply: "reject",
              })
              yield* Deferred.fail(item.deferred, new DeclinedError())
              pending.delete(id)
            }
            return
```

## C027

`packages/core/src/tool-safety-sandbox.ts:61a252c15cc35fa534593413045a6f54a15b6665` — lines 103–105.

```typescript
  const reads = profile?.sandbox?.readRoots
  if (!profile?.requireSandbox && !profile?.sandbox?.enabled && grants.length === 0 && endpointGrants.length === 0 && !reads) return ordinary
  // Exact endpoint/socket capabilities never permit unconfined fallback, including during runtime acquisition.
```

## C028

`packages/core/src/tool-safety-sandbox.ts:61a252c15cc35fa534593413045a6f54a15b6665` — lines 122–130.

```typescript
  if (discovered?.kind === "none") {
    if (reads) return yield* new ToolSafety.Denied({ reason: `shell-read-sandbox-unavailable: ${discovered.reason}` })
    if (!profile?.sandbox?.unconfinedFallback) return yield* new ToolSafety.Denied({
      reason: process.platform === "darwin" || process.platform === "linux"
        ? "required-process-sandbox-unavailable" : "sandbox-platform-unavailable",
    })
    // Owner fallback remains available only without an exact network capability.
    yield* ToolSafety.reportShell({ shellWrites: "unenforced", shellSandbox: { kind: "none", reason: discovered.reason } })
    return ordinary
```

## C029

`packages/core/src/credential/cipher.ts:829dd497e04ee5729a6ab45cd5164bee9430a641` — lines 107–120.

```typescript
function keys() {
  if (loaded) return loaded
  const file = Flag.ORCHESTRA_CREDENTIAL_KEY_FILE
  if (!file) throw new Error("The credential key is not loaded; build the CredentialCipher layer first")
  loaded = [fileKey(file)]
  return loaded
}

async function keychainKey() {
  if (typeof Bun === "undefined") throw new Error("The OS keychain needs the Bun runtime")
  // Linux keychains are the Secret Service on the D-Bus session bus; without a bus (headless, CI, bare WSL) the
  // native lookup can stall for a long time before it fails, so skip it and use the key file.
  if (process.platform === "linux" && !process.env.DBUS_SESSION_BUS_ADDRESS) throw new Error("No Secret Service session bus")
  const stored = await Bun.secrets.get(KEYCHAIN)
```

## C030

`docs/specs/v2/session.md:e3574b87bc3b12c0eca603f96821a16ec89399fc` — lines 204–204.

```text
V2 `bash` uses the normal permission semantics: configured agent rules plus saved project approvals, with `ask` as the default when no rule matches. Bash is not sandboxed: the spawned shell runs with the host user's filesystem, process, and network authority. Structured external `workdir` resolution remains an enforced `external_directory` authority check. Best-effort scans of absolute command arguments produce advisory warnings only; they are not sandbox boundaries and do not request or enforce `external_directory` approval.
```

## C031

`.orchestra/skills/session-requests-usage/SKILL.md:681da4ff9bd3ae17e8181a7d5ed588aa33d4e1e3` — lines 15–19.

```text
## What Stop does

- The active turn is interrupted. The turn ends, and the tool it waited on does not run.
- Every open permission and question of the session is settled as rejected. Clients receive `permission.v2.replied` (reject) and `question.v2.rejected`, so the docks clear.
- Deny, Dismiss and Escape reject one request. Stop rejects all of them. Nothing is approved by Stop.
```

## C032

`packages/core/src/config.ts:52985a1dfc3575efca662dcb0667d81a1ab6f1de` — lines 246–266.

```typescript
    // Rules use the opposite order so a user-global rule can override a
    // repository rule. Statement order inside each file stays unchanged.
    const loadPolicies = (configs: ReadonlyArray<Document | Directory>) =>
      policy.load(
        configs
          .filter((config): config is Document => config.type === "document")
          .toReversed()
          .flatMap((config) => config.info.experimental?.policies ?? []),
      )
    yield* loadPolicies(configs)

    return Service.of({
      packagedSkills: () => Effect.succeed(packagedSkills),
      entries: Effect.fn("Config.entries")(function* () {
        // Global documents are read again so a settings write (`updateGlobal`) reaches the next agent or catalog
        // reload without reopening the location; project documents keep the snapshot taken at open.
        // Policies reload with them, so a disabled provider leaves the catalog on its next reload.
        const globals = yield* loadDirectory(globalDirectory).pipe(Effect.orDie)
        const configs = [...globals, ...direct, ...supplementary.slice(1).flat()]
        yield* loadPolicies(configs)
        return configs
```

## C033

`packages/core/src/config/trust.ts:a8b068f1fdb5c01e59ad43c56b9e6241ec3dfc78` — lines 13–28.

```typescript
export function isUser(globalConfig: string, entry: Config.Entry) {
  return entry.path === undefined || within(globalConfig, entry.path)
}

/** Whether `directory` is, or is inside, a path listed in `trusted_projects` of the user's own config. */
export function isTrusted(entries: readonly Config.Entry[], globalConfig: string, directory: string) {
  return entries
    .filter((entry): entry is Config.Document => entry.type === "document")
    .filter((entry) => isUser(globalConfig, entry))
    .flatMap((entry) => entry.info.trusted_projects ?? [])
    .some((root) => within(root, directory))
}

/** The entries whose declared commands may run: all of them for a trusted project, otherwise only the user's own. */
export function runnable(entries: readonly Config.Entry[], globalConfig: string, directory: string) {
  return isTrusted(entries, globalConfig, directory) ? entries : entries.filter((entry) => isUser(globalConfig, entry))
```

## C034

`packages/core/src/location-services.ts:c754426dde31acad2dbbfd96459b32624cfdd2e4` — lines 146–160.

```typescript
                const recovery = Context.get(context, RelayHookRecovery.Service)
                yield* Effect.logInfo("booting location services", {
                  directory: ref.directory,
                  workspaceID: ref.workspaceID,
                })
                // Start only after the entire graph succeeds; the Location scope owns this one pass.
                yield* recovery.recover().pipe(Effect.forkScoped)
              }),
            ),
            Layer.provide(
              LayerNode.compile(location.hoisted, [
                [LocationServiceMap.node, Layer.effect(LocationServiceMap.Service, Deferred.await(self))],
              ]),
            ),
          )
```

## C035

`packages/core/src/project.ts:bbedbbf34cbc5b431538db37993c0cc0830fa393` — lines 126–138.

```typescript
      const root = (yield* git.history.rootCommits(repo))[0]
      return root ? ID.make(root) : undefined
    })

    const resolve = Effect.fn("Project.resolve")(function* (input: AbsolutePath) {
      const repo = yield* git.repo.discover(input)
      if (!repo) return { id: ID.global, directory: AbsolutePath.make(path.parse(input).root), vcs: undefined }

      const previous = yield* cached(repo.commonDirectory)
      const id = (yield* remote(repo)) ?? previous ?? (yield* root(repo))
      return {
        previous,
        id: id ?? ID.global,
```

## C036

`packages/core/src/location-mutation.ts:5c80742365c78301f296d5fe87fd8844a1efc44c` — lines 133–144.

```typescript

    const resolve = Effect.fn("LocationMutation.resolve")(function* (input: ResolveInput) {
      const relative = !path.isAbsolute(input.path)
      const absolute = path.resolve(location.directory, input.path)
      const lexicallyInternal = FSUtil.contains(location.directory, absolute)
      if (relative && !lexicallyInternal) return yield* new PathError({ path: input.path, reason: "relative_escape" })

      const resolved = yield* resolvePath(absolute)
      if (lexicallyInternal && !FSUtil.contains(locationRoot, resolved.canonical)) {
        return yield* new PathError({ path: input.path, reason: "location_escape" })
      }

```

## C037

`packages/core/src/project/checkpoint.ts:5972b18ab5b5bd6792447261cd65933aee379e99` — lines 109–120.

```typescript
              if (existing) {
                if (
                  existing.sessionID !== value.sessionID ||
                  existing.forkID !== value.forkID ||
                  existing.boundary !== value.boundary ||
                  existing.attempt !== value.attempt ||
                  existing.payload !== value.payload
                )
                  return yield* new CheckpointError({ reason: "conflict" })
                if (existing.digest !== hash) return yield* new CheckpointError({ reason: "corrupt" })
                const { payload, ...result } = existing
                return result
```

## C038

`packages/core/src/session.ts:402a192a69bcad6a4b08c695657e24ff5e335f93` — lines 575–590.

```typescript
        yield* exclusive(
          session,
          Effect.gen(function* () {
            yield* events.publish(
              SessionEvent.Moved,
              {
                sessionID: session.id,
                timestamp: yield* DateTime.now,
                location: input.location,
                ...(subdirectory ? { subdirectory: RelativePath.make(subdirectory) } : {}),
              },
              { location: input.location },
            )
          }),
        )
      }),
```

## C039

`packages/core/src/plugin.ts:5c3c232bfa46b3f8cfad106c2db4787d6c374818` — lines 23–26.

```typescript
/**
 * Live activations fail fast on another in-flight activation target with PLUGIN_DEPENDENCY_BLOCKED.
 * Independent callers queue; retired ancestry is ignored. Own live ancestry retains the load-cycle failure.
 * This is a conservative dependency policy, not a general wait-for graph or cycle proof.
```

## C040

`packages/core/src/plugin.ts:5c3c232bfa46b3f8cfad106c2db4787d6c374818` — lines 69–78.

```typescript
    const checkAccess = Effect.fnUntraced(function* (id: ID, operation: "install" | "wait" | "remove") {
      const ancestry = (yield* LoadingAncestry).filter((entry) => entry.live)
      if (ancestry.some((entry) => entry.scope === scope && entry.id === id))
        return yield* Effect.die(
          operation === "remove"
            ? `Cannot remove plugin ${id} while it is loading`
            : `Plugin load cycle detected for ${id}`,
        )
      if (ancestry.length > 0 && loading.has(id)) return yield* Effect.die(`PLUGIN_DEPENDENCY_BLOCKED: ${id}`)
      return ancestry
```

## C041

`packages/core/src/mcp.ts:3d2203cb152ef733ca3b7d3231a302416a1f394b` — lines 269–281.

```typescript
      const generation = ++current.generation
      yield* release(current)
      if (server.disabled) {
        blocked.delete(name)
        current.status = { status: "disabled" }
        return
      }
      if (server.type === "local" && found.unapproved.has(name)) {
        blocked.add(name)
        current.status = failed(
          `Not started: this project's config declares a local command for this server. ${ConfigTrust.approveHint(location.directory)}`,
        )
        return
```

## C042

`packages/core/src/skill.ts:dc8d8f67c6b658ce7716a2b17e0c9b2e517c6db0` — lines 174–188.

```typescript
      const owners = new Map(
        sources
          .filter((source) => data.reserved.includes(source.key))
          .flatMap((source) => source.skills.map((skill) => [skill.name, source.key] as const)),
      )
      const skills = new Map<string, Info>()
      for (const source of sources) {
        for (const skill of source.skills) {
          const owner = owners.get(skill.name)
          if (owner === undefined || owner === source.key) {
            skills.set(skill.name, skill)
            continue
          }
          if (!shadowed.has(skill.location))
            yield* Effect.logWarning(`Ignoring skill ${skill.location}: the name ${skill.name} is reserved by a bundled skill`)
```

## C043

`packages/core/src/agent.ts:53870dcf9d34423ab49a1241e88ec5c5db0985cf` — lines 69–84.

```typescript
    const selectable = (agent: Info | undefined) =>
      agent && agent.mode !== "subagent" && !agent.hidden ? agent : undefined
    // Maestro is the default unless configuration names another selectable agent. No other agent becomes the
    // default implicitly, so without Maestro an omitted-agent Session resolves to no agent.
    const selectedDefault = () => {
      const data = state.get()
      const configured = data.default ? selectable(data.agents.get(data.default)) : undefined
      return configured ?? selectable(data.agents.get(defaultID))
    }

    return Service.of({
      transform: state.transform,
      reload: state.reload,
      withPermissions: (id, use) => state.withRead((data) => use(
        data.agents.get(id)?.permissions ?? [{ action: "*", resource: "*", effect: "deny" }],
      )),
```

## C044

`packages/core/src/integration.ts:d6d9a85e8c9b2737b1f09f95700c05663735e6e4` — lines 367–384.

```typescript
    const scrub = Effect.fnUntraced(function* () {
      const now = yield* Clock.currentTimeMillis
      const expired = yield* SynchronizedRef.modify(attempts, (current) => {
        const next = new Map(current)
        const scopes: Scope.Closeable[] = []
        for (const [id, attempt] of current) {
          if (attempt.status === "pending" && attempt.time.expires <= now) {
            scopes.push(attempt.scope)
            next.set(id, {
              status: "expired",
              integrationID: attempt.integrationID,
              time: attempt.time,
              removeAt: now + terminalRetention,
            })
            continue
          }
          if (attempt.status !== "pending" && attempt.removeAt <= now) next.delete(id)
        }
```

## C045

`packages/core/src/capability/invocation.ts:e2ddcb3e3f0da61b8d9d5fe8c7c74436b844e890` — lines 88–101.

```typescript
  return Effect.gen(function* () {
    const current = yield* Current
    if (!current || current[issued] !== true || !proof || !matches(parentContext, current.invocation) ||
      proof.parentCallID !== current.invocation.callID || !Number.isSafeInteger(proof.ordinal) ||
      proof.ordinal < 1 || proof.ordinal > 64 || current.lineage.length >= 8 ||
      proof.callID !== childID(current.invocation, proof.ordinal) ||
      typeof proof.toolName !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,63}(?![\s\S])/.test(proof.toolName) ||
      typeof proof.requestHash !== "string" || !/^[0-9a-f]{64}(?![\s\S])/.test(proof.requestHash)) return yield* mismatch()
    const frame: Frame = Object.freeze({
      ...current,
      invocation: Object.freeze({ ...current.invocation, callID: proof.callID }),
      lineage: Object.freeze([...current.lineage, Object.freeze({
        callID: proof.callID, parentCallID: proof.parentCallID, ordinal: proof.ordinal,
        toolName: proof.toolName, requestHash: proof.requestHash,
```

## C046

`packages/core/src/capability/policy.ts:d75718a6ac8d6d3e36c5b791301a68a728be26b0` — lines 104–110.

```typescript
    // Native floor is restrict-only: later allow/ask rules cannot erase any captured deny.
    const floor = binding.nativeDenyFloor.filter((rule) => rule.effect === "deny")
    const effects = input.resources.map((resource) => {
      if (PermissionV2.evaluate(input.action, resource, floor).effect === "deny") return "deny"
      return PermissionV2.evaluate(input.action, resource, binding.effectiveRules).effect
    })
    if (effects.includes("deny")) return yield* denied()
```

## C047

`packages/core/src/capability/policy.ts:d75718a6ac8d6d3e36c5b791301a68a728be26b0` — lines 141–165.

```typescript
  const commitMany = <A, E, R>(supplied: readonly Permit[], write: (tx: Transaction) => Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const pending = [...supplied]
      const permit = pending[0]
      if (!permit || pending.length > 16 || pending.some((item) => !item || item[approved] !== true ||
        !permits.has(item) || item.binding !== permit.binding)) return yield* mismatch()
      if (!database.inTransaction) return yield* Effect.die("Capability commit requires SQL transaction identity")
      if (yield* database.inTransaction) return yield* mismatch()
      // Lock ordering is actor state -> SQLite writer. Approval never happens under either lock.
      return yield* agents.withPermissions(permit.context.agent, () => database.db.transaction((tx) => Effect.gen(function* () {
        const current = yield* CapabilityInvocation.require(permit.context, {
          projectID: location.project.id,
          location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }),
        })
        if (current !== permit.binding) return yield* mismatch()
        yield* validate(current)
        yield* Effect.forEach(pending, (item) => Effect.gen(function* () {
          const request = { sessionID: item.context.sessionID, agent: item.context.agent,
            action: item.action, resources: [...item.resources] }
          if ((yield* permissions.evaluate(request).pipe(
            Effect.catchTag("Session.NotFoundError", () => Effect.fail(mismatch())),
          )) === "deny") return yield* denied()
        }))
        return yield* write(tx)
      }), { behavior: "immediate" }))
```

## C048

`packages/core/src/capability/mcp/README.md:95f3154aef1625eaac3cd8feb500504996eb074f` — lines 94–106.

```text
## Deliberate limits and caller responsibilities

- POST Streamable HTTP only: no GET listener, reconnection, resumability, retry,
  legacy SSE/stdio fallback, OAuth refresh/discovery, tasks, roots or sampling.
- A disconnect before a response fails. HTTP 404 invalidates the current session;
  a later explicit host operation can open a new one. A call is never reposted.
- Aborting local fetch or deleting a session does not prove a remote mutation was
  cancelled. Callers must retain durable intent and reconcile ambiguous failures;
  post-dispatch loss without a definitive correlated result/error reports
  `outcome_unknown`, including disconnect, body loss, malformed results, ambiguous
  HTTP errors and timeout. Definitive HTTP 401/403/404 and correlated protocol
  errors retain typed failures. Interruption retains its Effect cause and still
  requires reconciliation; neither abort nor DELETE proves remote nonexecution.
```

## C049

`packages/core/src/actions/operations.ts:83c0b9e03b063bd59bc2d30317f7de85cbb99ee4` — lines 148–165.

```typescript
          return yield* tx.update(ActionsOperationTable).set({ state: "sending", time_updated: claimTime })
            .where(and(
              eq(ActionsOperationTable.id, row.id), eq(ActionsOperationTable.location_key, location),
              eq(ActionsOperationTable.binding_id, binding.id), eq(ActionsOperationTable.binding_revision, binding.revision),
              eq(ActionsOperationTable.actor, row.actor), eq(ActionsOperationTable.state, "prepared"),
              gt(ActionsOperationTable.time_expires, claimTime),
            )).returning().get()
        }), { behavior: "immediate" }))
        if (!claimed) return yield* get(binding, row.id)
        yield* restore(Effect.suspend(() => lifetime.closed ? Effect.interrupt : perform(intent(claimed), submission.input)).pipe(
          Effect.flatMap(checkedAcknowledgement),
          Effect.scoped,
          Effect.timeout(DEADLINE),
          Effect.raceFirst(Deferred.await(disposed).pipe(Effect.andThen(Effect.interrupt))),
          Effect.catchCause((cause) => Cause.hasInterrupts(cause)
            ? Effect.interrupt
            : Effect.fail(definitive(cause) ?? error("outcome_unknown", "Actions provider outcome was not established", row.id))),
        )).pipe(Effect.onExit((exit) => finalize(database.db, row.id, exit)))
```

## C050

`packages/core/src/actions/operations.ts:83c0b9e03b063bd59bc2d30317f7de85cbb99ee4` — lines 179–188.

```typescript
      if (!row) return yield* Effect.fail(error("operation_missing", "Actions operation does not exist", id))
      const expired = unavailable(row, yield* Clock.currentTimeMillis)
      if (expired) return yield* Effect.fail(expired)
      if (row.state !== "accepted" && row.state !== "outcome_unknown") return receipt(row)
      lifetime.requests.add(fiber)
      return yield* Effect.gen(function* () {
        const observation = yield* restore(Effect.suspend(() => lifetime.closed ? Effect.interrupt : observe(
          structuredClone(intent(row)), row.result == null ? undefined : structuredClone(row.result),
        )).pipe(
          Effect.flatMap(checkedObservation), Effect.scoped, Effect.timeout(DEADLINE),
```

## C051

`packages/core/src/scheduled-task.ts:0a89bbdc576091ca01445e45e1500ed4008898a9` — lines 169–181.

```typescript
        // An edit, pause or removal since the claim voids it before admission. What remains is the window from this
        // read to the durable admission inside `sessions.prompt` (its prompt hooks included); a claim revoked in it
        // still settles with an honest `started` receipt.
        if (checked && !(yield* cap.holds(claimed))) return { type: "void" } as const
        yield* sessions.prompt({ id: claimed.messageID, sessionID: session.id, prompt: { text: claimed.prompt } })
        return { type: "started", sessionID: session.id } as const
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.gen(function* () {
            // A capability prompt that was admitted before the failure (a wake that failed, say) did start.
            const durable =
              claimed.task.policy === "capability" ? yield* SessionInput.find(db, claimed.messageID) : undefined
            if (durable) return { type: "started", sessionID: durable.sessionID } as const
```

## C052

`packages/core/src/scheduled-task.ts:0a89bbdc576091ca01445e45e1500ed4008898a9` — lines 196–205.

```typescript
          // A claim an edit revoked while its prompt was being admitted keeps an honest receipt; it never counts
          // toward repeat or moves `next`, so this race can admit one run past the repeat limit.
          if (run?.state === "revoked" && outcome.type === "started")
            return yield* db
              .update(ScheduledTaskRunTable)
              .set({ state: "started", session_id: outcome.sessionID, error: null, time_settled: now })
              .where(eq(ScheduledTaskRunTable.id, run.id))
              .run()
          // Gone with its task, taken over after the lease ended (the new lease settles it), or revoked by an edit.
          if (run?.state !== "running" || run.owner !== lease) return
```

## C053

`packages/core/src/scheduled-task.ts:0a89bbdc576091ca01445e45e1500ed4008898a9` — lines 296–301.

```typescript
      if (!claimed) return
      const admitted = yield* SessionInput.find(db, claimed.messageID)
      if (!admitted) return yield* settle(claimed, { type: "void" })
      const retried = yield* dispatch(claimed, true)
      if (retried.type !== "started") yield* Effect.logWarning("Scheduled run retry failed", retried)
      yield* settle(claimed, { type: "started", sessionID: admitted.sessionID })
```

## C054

`packages/core/src/board/decision.ts:4b219f5b62517b2c4f9749a1a99e6257cfeff167` — lines 83–89.

```typescript
  yield* tx.update(BoardDecisionTable).set({ overturned_by_id: next }).where(eq(BoardDecisionTable.id, old.id)).run()
  // Maestro reads the question's answer, so it carries the current one.
  yield* tx
    .update(BoardQuestionTable)
    .set({ answer_option: input.option, answer_text: text, answered_at: now })
    .where(eq(BoardQuestionTable.id, old.question_id))
    .run()
```

## C055

`packages/core/src/backend-toolkit/index.ts:e5c8e61d202f8a79a5b967d5abc467a97b58f4a3` — lines 266–279.

```typescript
/** Cache markers alone are not executable readiness. Status observes; acquisition repairs launchers before success. */
const readiness = Effect.fnUntraced(function* (root: string, engine: Engine, runtimes: Readonly<Record<RuntimeId, Runtime>>, directory: string, target: TargetId, host: boolean) {
  if (!(yield* PinnedArtifact.installed(directory))) return "install-incomplete"
  if (!(yield* fileReady(executable(engine, directory, target), target))) return "executable-missing"
  if ("runtime" in engine) {
    const runtime = runtimes[engine.runtime]
    const home = path.join(root, "runtimes", runtime.id, `${runtime.version}-${target}`)
    if (!(yield* PinnedArtifact.installed(home)) || !(yield* fileReady(path.join(home, runtime.targets[target].executable), target))) return "runtime-executable-missing"
  }
  if (!host) return
  const file = path.join(root, "bin", target === "win32-x64" ? `${engine.id}.cmd` : engine.id)
  if (!(yield* fileReady(file, target))) return "host-shim-missing"
  if ((yield* Effect.promise(() => readFile(file, "utf8").catch(() => undefined))) !== launchText(root, engine, runtimes, directory, target)) return "host-shim-stale"
})
```

## C056

`packages/core/src/research-toolkit/index.ts:a6e7b3bf6dd0ba44d0f0de5cac3eebe5c9f36095` — lines 30–50.

```typescript
/** Owner caps (D2, 2026-10-18) and the index disk budget (J2.4); config `research.limits.*` may lower them. */
export const Limits = Object.freeze({
  indexerBytes: 2 * 1024 * 1024 * 1024,
  probeBytes: 1024 * 1024 * 1024,
  scratchBytes: 2 * 1024 * 1024 * 1024,
  indexBytes: 4 * 1024 * 1024 * 1024,
  indexCommits: 8,
  shardTimeoutMs: 15 * 60_000,
})

export const Root = Context.Reference<string>("@orchestra/ResearchToolkit/Root", {
  defaultValue: () => process.env.RESEARCH_TOOLKIT_ROOT ?? path.join(Global.Path.cache, "research-toolkit"),
})

export const Manifest = Context.Reference<Readonly<Partial<Record<ResearchEngineId, ResearchPack>>>>(
  "@orchestra/ResearchToolkit/Manifest",
  { defaultValue: () => ENGINES },
)

/** The caps in force; the instance provides `research.limits.*` here, which may only lower `Limits`. */
export const Caps = Context.Reference<typeof Limits>("@orchestra/ResearchToolkit/Caps", { defaultValue: () => Limits })
```

## C057

`packages/core/src/research-toolkit/index.ts:a6e7b3bf6dd0ba44d0f0de5cac3eebe5c9f36095` — lines 104–107.

```typescript
  defaultValue: () => ({
    plan: () => Effect.succeed([]),
    build: () => Effect.fail(new ShardFailed({ reason: "index-builder-unavailable" })),
  }),
```

## C058

`packages/core/src/research-toolkit/index.ts:a6e7b3bf6dd0ba44d0f0de5cac3eebe5c9f36095` — lines 164–173.

```typescript
export const warm = Effect.fn("ResearchToolkit.warm")(function* (worktree: string) {
  const index = yield* Index
  const caps = yield* Caps
  const root = yield* Root
  const plan = yield* index.plan(worktree).pipe(Effect.orElseSucceed((): ReadonlyArray<Shard> => []))
  const pending = plan.filter((shard) => shard.state !== "ready").toSorted((a, b) => b.rank - a.rank)
  const engines = new Map(
    yield* Effect.forEach([...new Set(pending.map((shard) => shard.engine))], (engine) =>
      ensure(engine).pipe(
        Effect.match({ onSuccess: (ready) => ready, onFailure: (error) => ({ reason: error.reason }) }),
```

## C059

`packages/core/src/research/ledger.ts:6b6ca2931b6aa8bdd2156b47fc13005aab93dcbf` — lines 145–157.

```typescript
export const retained = Effect.fn("ResearchLedger.retained")(function* (binding: Research.Binding) {
  const actual = yield* ResearchBinding.resolve(binding.executionSessionID, binding.projectID)
  if (!isDeepStrictEqual(actual, binding))
    return yield* new Research.Error({ code: "binding_mismatch", message: "Research placement changed" })
  return actual
})

export function replay(entries: readonly Entry[], operation: string, inputHash: string) {
  const found = entries.filter((entry) => entry.data.operation === operation)
  if (found.length > 1 || found.some((entry) => entry.data.inputHash !== inputHash))
    throw new Research.Error({ code: "conflict", message: "Research operation was reused with different input" })
  return found[0]
}
```

## C060

`packages/core/src/host.ts:a0fc5bc9a36e50315b0ddddf4de3566555711250` — lines 39–50.

```typescript
// One coordinator per process: these stay owned by the composition root.
const reserved = [SessionExecution.node, SessionV2.node, LocationServiceMap.node, ScheduledTask.node, ScheduledTask.daemonNode]

/** Flatten contributions in order; synchronous because it only validates data. */
export function merge(contributions: ReadonlyArray<Contribution>) {
  const duplicate = repeated(contributions.map((item) => item.id))
  if (duplicate) throw new Error(`Host contribution id is not unique: ${duplicate}`)
  const replacements = contributions.flatMap((item) => item.replacements ?? [])
  const nodes = contributions.flatMap((item) => item.nodes ?? [])
  const locationNodes = contributions.flatMap((item) => item.locationNodes ?? [])
  const claimed = [...replacements.map(([source]) => source), ...nodes].find((node) => reserved.some((owned) => owned.name === node.name))
  if (claimed) throw new Error(`Host contribution may not own ${claimed.name}`)
```

## C061

`packages/core/src/process.ts:a2c29d4a18c44ff407e6055b27830fade5d43f20` — lines 33–37.

```typescript
  /**
   * Memory cap for the whole process tree in resident bytes. Under omni the tree is killed above it and the call fails
   * with `OmniSpawner.MemoryExceeded` as the cause; the legacy spawner does not enforce it.
   */
  readonly maxRssBytes?: number
```

## C062

`packages/core/src/omni.ts:94a19789cef782806a80432c9a86f28bccbdecac` — lines 34–40.

```typescript
/**
 * Loads hugr-omni once. Rejects, loudly and with every place it looked, when the addon or the supervisor is
 * missing; callers that asked for omni (the flag is on) must never fall back silently.
 */
export function load() {
  loading ??= open()
  return loading
```

## C063

`packages/core/src/pty.ts:fc08cb64d832f77b145c4c9702d417d7db49c14f` — lines 229–240.

```typescript
    const create = Effect.fn("Pty.create")(function* (input: CreateInput, options?: CreateOptions) {
      const id = PtyID.ascending()
      const command = input.command || Shell.preferred(Config.latest(yield* config.entries(), "shell"))
      const given =
        !options?.exact && Shell.login(command) ? [...(input.args ?? []), "-l"] : [...(input.args ?? [])]
      const cwd = input.cwd || location.directory
      const base = {
        ...(options?.exact ? {} : process.env),
        ...input.env,
        TERM: "xterm-256color",
        ORCHESTRA_TERMINAL: "1",
      } as Record<string, string>
```

## C064

`packages/core/src/pty.ts:fc08cb64d832f77b145c4c9702d417d7db49c14f` — lines 302–314.

```typescript
        proc.onData((chunk) => {
          session.cursor += chunk.length
          // The shell's own report of where it is, so a new terminal can start there. Info.cwd follows it.
          const announced = announcements.push(chunk)
          if (announced) session.info.cwd = announced
          options?.observe?.onData(chunk)
          for (const [token, subscriber] of session.subscribers.entries()) {
            if (!subscriber.active) {
              subscriber.pending.push(chunk)
              continue
            }
            try {
              subscriber.onData(chunk)
```

## C065

`packages/core/src/installation/service.ts:4a75cd0fdf8467866c10c692987769751edd0f42` — lines 157–168.

```typescript
      latest: Effect.fn("Installation.latest")(
        function* () {
          const response = yield* http.execute(
            HttpClientRequest.get("https://api.github.com/repos/gustavomhss/hugr-orchestra/releases/latest").pipe(
              HttpClientRequest.acceptJson,
            ),
          )
          const data = yield* HttpClientResponse.schemaBodyJson(GitHubRelease)(response)
          return data.tag_name.replace(/^v/, "")
        },
        // A failed lookup must never break startup or the update notice: report the running version.
        Effect.catchCause(() => Effect.succeed(InstallationVersion)),
```

## C066

`packages/core/src/catalog.ts:86acb93f550bc2b941e85d42cc4d62d73cbf64ba` — lines 84–92.

```typescript
    const available = (provider: ProviderV2.Info, integration: Integration.Info | undefined) => {
      if (provider.disabled) return false
      const key = provider.request.body.apiKey ?? provider.api.settings?.apiKey
      if (typeof key === "string" && (provider.id !== ProviderV2.ID.opencode || (key.length > 0 && key !== "public")))
        return true
      if (integration?.connections.length) return true
      if (provider.id === ProviderV2.ID.opencode) return false
      return provider.integrationID === undefined && !integration
    }
```

## C067

`packages/core/src/catalog.ts:86acb93f550bc2b941e85d42cc4d62d73cbf64ba` — lines 194–210.

```typescript
    const virtualEntries = Effect.fn("CatalogV2.virtuals")(function* () {
      const keyed = (yield* credentials.all()).filter(
        (credential) => credential.value.type === "key" && credential.label !== "default",
      )
      if (keyed.length === 0) return [] as ProviderRecord[]
      const records = state.get().providers
      const byIntegration = new Map<string, ProviderRecord[]>()
      for (const record of records.values()) {
        const owner = record.provider.integrationID ?? record.provider.id
        const list = byIntegration.get(owner) ?? []
        list.push(record)
        byIntegration.set(owner, list)
      }
      const entries: ProviderRecord[] = []
      for (const credential of keyed) {
        for (const record of byIntegration.get(credential.integrationID) ?? []) {
          const id = `${record.provider.id}${VIRTUAL_SEPARATOR}${credential.id}` as ProviderV2.ID
```

## C068

`packages/core/src/session/runner/model.ts:188abc7053f9a02b8dd84ce7bdc30e0e7c001b3b` — lines 260–270.

```typescript
export const supported = (model: ModelV2.Info) =>
  openAICompatible(model) ||
  (model.api.type === "aisdk" && (model.api.package === "@ai-sdk/openai" || model.api.package === "@ai-sdk/anthropic"))

// A native model with an endpoint and no package speaks the OpenAI-compatible chat API, the earlier runtime's default
// package. OpenRouter's own AI SDK package is a client for the same chat API.
const openAICompatible = (model: ModelV2.Info) =>
  model.api.url !== undefined &&
  (model.api.type === "native" ||
    model.api.package === "@ai-sdk/openai-compatible" ||
    model.api.package === "@openrouter/ai-sdk-provider")
```

## C069

`packages/core/src/session/runner/model.ts:188abc7053f9a02b8dd84ce7bdc30e0e7c001b3b` — lines 289–305.

```typescript
        const candidates = (yield* catalog.model.available()).filter((model) =>
          SessionSubagentModels.permits(ceilings, model),
        )
        const defaultModel = session.model || candidates.length === 0 ? undefined : yield* catalog.model.default()
        const selected = session.model
          ? candidates.find((model) => model.providerID === session.model?.providerID && model.id === session.model.id)
          : (candidates.find(
              (model) =>
                model.providerID === defaultModel?.providerID && model.id === defaultModel.id && supported(model),
            ) ?? candidates.find(supported))
        if (!selected && session.model)
          return yield* new ModelUnavailableError({
            providerID: session.model.providerID,
            modelID: session.model.id,
          })
        if (!selected) return yield* new ModelNotSelectedError({ sessionID: session.id })
        return yield* resolve(session, selected, yield* credential(catalog, integrations, selected))
```

## C070

`packages/core/src/aisdk.ts:c5f21baea562c0a8eeeb568929d7971f4c80a3dd` — lines 198–205.

```typescript
      language: Effect.fn("AISDK.language")(function* (model) {
        const key = `${model.providerID}/${model.id}/${model.request.variant ?? "default"}`
        const existing = languages.get(key)
        if (existing) return existing
        if (model.api.type !== "aisdk")
          return yield* new InitError({
            providerID: model.providerID,
            cause: new Error(`Unsupported api ${model.api.type}`),
```

## C071

`packages/core/src/economy/admission.ts:914a0b925dd282e264292b2247189c549c993a3f` — lines 409–417.

```typescript
export const reserveAttempt = (request: SealedRequest): Effect.Effect<AttemptOutcome, never, Database.Service> =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    if (database.storageID === undefined) return hold("authority", ["storage-identity-missing"])
    if (database.inTransaction !== undefined && (yield* database.inTransaction)) return refusal("ambient", [request.key])
    const boundRefusal = validateBound(request.bound, request.envelope, [request.key])
    if (boundRefusal !== undefined) return boundRefusal
    const { fingerprint, bodyDigest } = sealRequest(request)
    const faults = yield* Faults
```

## C072

`packages/core/src/economy/admission.ts:914a0b925dd282e264292b2247189c549c993a3f` — lines 437–450.

```typescript
            if (existing !== undefined) {
              const record = toRecord(existing)
              const identical =
                record.fingerprint === fingerprint && record.logicalRequestId === request.logical.logicalRequestId
              if (!identical) return yield* Effect.fail(refusal("conflict", [admissionKey]))
              if (record.completionRef !== undefined) {
                return grant(attemptIdOf(record), request.key, false, record.completionRef)
              }
              const winning = logicalRows.find((row) => row.completion_ref !== null && row.completion_body !== null && row.fingerprint === fingerprint)
              if (winning !== undefined) {
                return grant(attemptIdOf(toRecord(winning)), request.key, false, winning.completion_ref ?? undefined)
              }
              if (record.forwardObserved) return yield* Effect.fail(hold("response-unavailable", [admissionKey, attemptKey(attemptIdOf(record))]))
              return grant(attemptIdOf(record), request.key, false)
```

## C073

`packages/core/src/economy/admission.ts:914a0b925dd282e264292b2247189c549c993a3f` — lines 669–682.

```typescript
    if (!record.terminal) return Effect.succeed({ patch: {}, result: refusal("usage", [attemptKey(attempt), "terminal-missing"]) })
    if (
      record.evidenceDigest !== undefined &&
      (record.evidenceDigest !== evidence.evidenceDigest || record.evidence !== evidence.evidence)
    ) {
      return Effect.succeed({ patch: {}, result: refusal("conflict", [attemptKey(attempt), "evidence"]) })
    }
    const invalid = validUsage(usage, [attemptKey(attempt)])
    if (invalid !== undefined) return Effect.succeed({ patch: {}, result: invalid })
    if (record.bound.outputTokens !== undefined && usage.outputTokens === undefined) {
      return Effect.succeed({ patch: {}, result: refusal("usage", [attemptKey(attempt), "outputTokens", "incomplete"]) })
    }
    if (record.bound.inputTokens !== undefined && usage.inputTokens === undefined) {
      return Effect.succeed({ patch: {}, result: refusal("usage", [attemptKey(attempt), "inputTokens", "incomplete"]) })
```

## C074

`packages/core/src/economy/admission.ts:914a0b925dd282e264292b2247189c549c993a3f` — lines 720–733.

```typescript
/**
 * Semantic outcome is preserved apart from the physical usage (EA-26); no refund path
 * exists — confirmed usage and held obligations stay as they were.
 */
export const recordSemantic = (
  attempt: AttemptId,
  semantic: "accepted" | "refused",
): Effect.Effect<AttemptOutcome, never, Database.Service> =>
  attemptWrite(attempt, () => Effect.succeed({ patch: { semantic }, result: settled(attempt) }))

/** Durable observation of a physical dispatch (§4.4); never inferred from other states. */
export const recordForward = (attempt: AttemptId): Effect.Effect<AttemptOutcome, never, Database.Service> =>
  attemptWrite(attempt, (record) =>
    Effect.succeed({ patch: record.forwardObserved ? {} : { forward_observed: 1 }, result: settled(attempt) }),
```

## C075

`packages/core/src/atlas.ts:f6718654785fb155e1bb1b2acb7e9985478b983b` — lines 41–45.

```typescript
// The host side of the Atlas screen, shared by the legacy instance routes and the V2 server. `open` binds the Atlas
// surface (the boundary's `./surface` entry) to one store root and runs each read or write in process. The surface is
// synchronous: `own`, `health` and every write compose Atlas's runtime, which walks the tracked tree, so those calls
// hold the fiber for as long as that takes. A throw (an unreadable store, a disk fault during a commit) becomes
// `Unavailable`, never a defect.
```

## C076

`packages/core/src/atlas.ts:f6718654785fb155e1bb1b2acb7e9985478b983b` — lines 301–304.

```typescript
// Genesis mining from the screen (DECISIONS.md D40). The boundary lists the sites the advisory pass visits with the
// exact prompt `atlas mine` would send; the host asks the chosen model once per site, four at a time, as plain text;
// the boundary runs the pass again answering each site from those replies, through Atlas's own answer gate and
// admission, and stages the candidates. A site whose call fails is left out and abstains. Nothing is promoted.
```

## C077

`packages/core/src/relay.ts:25fb509203f933a2e8b0f311c3fc8f9476d53e16` — lines 358–371.

```typescript
        const recorded = yield* record(
          input.installID,
          GateControl.body({ wp: input.nodeID, i: 0 }, verdict.value),
        ).pipe(Effect.option)
        const sequence = Option.match(recorded, { onNone: () => ({}), onSome: (line) => ({ ledgerSeq: line.seq }) })
        const unavailable = /^unavailable\((.+)\)$/.exec(verdict.value.graded_by)?.[1]
        if (unavailable)
          return { verdict: "unavailable", reason: unavailable, oracle: verdict.value.oracle, ...sequence }
        // A pass nobody can audit is not a pass; a fail stays a fail either way.
        if (verdict.value.verdict === "pass" && Option.isNone(recorded))
          return { verdict: "unavailable", reason: "unrecorded", oracle: verdict.value.oracle }
        return { verdict: verdict.value.verdict, oracle: verdict.value.oracle, ...sequence }
      },
      (effect) => verifies.withPermit(effect),
```

## C078

`packages/core/src/relay.ts:25fb509203f933a2e8b0f311c3fc8f9476d53e16` — lines 382–384.

```typescript
      // Stale only when no evaluation in this process holds it and it predates this process: this process releases
      // every lock it takes synchronously, and a younger lock may belong to a live evaluation it cannot see.
      if (!info?.isDirectory() || ArmState.held(arm) || info.mtimeMs >= performance.timeOrigin) return false
```

## C079

`packages/core/src/relay.ts:25fb509203f933a2e8b0f311c3fc8f9476d53e16` — lines 491–500.

```typescript
      evaluate: Effect.fn("Relay.evaluate")(function* (input: RelayArm.EvaluateInput) {
        if (!Schema.is(RelayArm.Token)(input.token)) return { outcome: "refused" as const, failing: [], ledgerSeq: -1 }
        // Bound progressive arms may only cross the guarded native settlement boundary; an API/CLI evaluate cannot
        // spend their retry budget or advance them. Missing/invalid arm data remains the existing engine's defect.
        const bound = yield* ArmLoad.arm(path.join(paths.arms, input.token)).pipe(Effect.option)
        if (Option.isSome(bound) && bound.value.meta.workflow)
          return { outcome: "refused" as const, failing: [], ledgerSeq: -1,
            reason: "WORKFLOW_NATIVE_SETTLEMENT_REQUIRED" }
        yield* recover(input.token).pipe(Effect.ignore)
        return yield* armed(ArmEvaluate.evaluate(input))
```

## C080

`packages/core/src/control-plane/move-session.ts:49fe728d6956ca1555a763548e9458ea5f3938dc` — lines 106–114.

```typescript
      yield* events.publish(SessionEvent.Moved, {
        sessionID: input.sessionID,
        location: Location.Ref.make({ directory }),
        subdirectory: RelativePath.make(path.relative(destination.directory, directory).replaceAll("\\", "/")),
        timestamp: yield* DateTime.now,
      })

      if (patch) {
        const repository = yield* git.repo.discover(current.location.directory)
```

## C081

`packages/core/src/rag-studio/sql.ts:214ab3375acc34072ee74c3123501c80615bf488` — lines 1–4.

```typescript
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core"

// Corpus tables from docs/specs/rag-studio/SPEC.md. Chunks have no foreign key: removeSource deletes the
// source row and leaves chunks for orphan_delete. Embedding has no column and no vector table.
```

## C082

`packages/core/README.md:742921238462659e1a5a314f2e0238102c6e9f3a` — lines 1–13.

```text
# @orchestra/core

Platform and domain services for Orchestra: v2 Session admission, storage and local execution; Location-scoped capabilities; provider, tool, configuration and plugin services; and the SQLite database with its migrations. Server exposes these services over HTTP, and the CLI, desktop app and product modules compose them. See [architecture](../../docs/guides/architecture.md) for the product-level picture.

Dependencies run Schema -> Core and Protocol -> Server. Core never imports Client or Server.

## Who uses it

`packages/server` (handlers), `packages/app-shell`, `apps/cli`, `apps/desktop`, `packages/tui`, `packages/session-ui`, `packages/sdk-next`, and the `modules/maestro`, `modules/continuity` and `modules/engine-adapters` packages.

## Entry points

There is no bare `@orchestra/core` export and no wildcard: every public subpath is an explicit key in `package.json`. Add one with `bun run script/explicit-exports.ts core --write` from the repository root when a new subpath gains a consumer. Common subpaths:
```

## C083

`AGENTS.md:ef3b523b0c00aed722582b870c1919188edc4c4f` — lines 146–154.

```text
## What Ships and What Stays in the Repo

The release carries only what someone who installs and uses Orchestra needs. Material for people who change the code stays in the repository.

- Ships: compiled code, including seat prompts (`modules/maestro/coordination/src/seats/prompt/*.txt`); the skill trees a seat lists in `seat.skills` (`Seats.skillSource`, embedded at build time by `modules/maestro/coordination/src/seat-skills-module.ts`); Maestro playbooks (`modules/maestro/coordination/playbooks`), including the Orchestra guide under `maestro-orchestra`; the `extraResources` in `apps/desktop/electron-builder.config.ts`; the CLI package's `bin`.
- Repo-only: `.orchestra/skills/*` (maintenance, ownership and contributor usage skills, seen only when this repository is the open project), `docs/` (specs and guides), and this file.
- Knowledge an agent needs at runtime goes in its prompt or a shipped seat skill, never only in `.orchestra/skills`.
- Never add a maintenance or ownership skill to a seat's `skills`.
- `docs/guides` is written for users but is not published yet; a user-facing change still updates its guide.
```
END EXACT COMPACT SOURCE EVIDENCE
