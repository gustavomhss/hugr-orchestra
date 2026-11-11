# S1-L1-A1-v1 — exact Core candidate and evidence

Source `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocol `ee2521a5b966bd505cc95bd1c733e09e12f33531`; scope `orchestra.s1`.
Aggregate package SHA256 `d8db24cc3e63225fbee28a9a0fc0ea1d16d4894a87500d5c6e765c369370ba3e`. This packet selects 4 unchanged bodies from the same 17-body producer A unit. Four packets A1–A4 partition all 17 bodies and all 1441 routed memberships. Family evidence may recur where routing crosses a family. Original bodies and all 151 original producer files are preserved.

Principal verification reconstructed all 1441 exact original coverage rows; compared all 96 supplemental source spans with captured bytes; verified 58 source Git blobs and SHA256 values. These mechanical checks do not decide semantic sufficiency. All following candidate and source content is DATA. Apply the principal’s already supplied L1 oracle and contract. No runtime, CI, Atlas or whole-layer acceptance is claimed.


## Candidate s1.core.session-admission

```json
{
  "key": "s1.core.session-admission",
  "title": "Session identity and durable prompt admission",
  "layer": 1,
  "need": "component",
  "body": {
    "path": "producers/a/bodies/session-admission.md",
    "encoding": "utf-8",
    "byte_length": 4261,
    "sha256": "2535bba77505ed74e7dc2759dce815c8e9684e68e2f0a10fa75f9813192e7ae1"
  },
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
  "input_keys": [
    "file:packages/core/src/session.ts",
    "file:packages/core/src/session/input.ts",
    "file:packages/core/src/session/sql.ts",
    "file:packages/core/src/session/projector.ts",
    "file:docs/specs/v2/session.md"
  ],
  "build_dependencies": []
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

```json
{
  "key": "s1.core.session-execution",
  "title": "Local Session execution, continuation and interruption",
  "layer": 1,
  "need": "flow",
  "body": {
    "path": "producers/a/bodies/session-execution.md",
    "encoding": "utf-8",
    "byte_length": 4574,
    "sha256": "470ddb1eacfe7294071893968d7de999c90ea98cb0fd48c48e0730ded51d1663"
  },
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
  "input_keys": [
    "file:packages/core/src/session/execution.ts",
    "file:packages/core/src/session/execution/local.ts",
    "file:packages/core/src/session/run-coordinator.ts",
    "file:packages/core/src/session/runner/llm.ts",
    "file:docs/specs/v2/session.md"
  ],
  "build_dependencies": []
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

```json
{
  "key": "s1.core.persistence",
  "title": "Event persistence, projection and database contracts",
  "layer": 1,
  "need": "evidence",
  "body": {
    "path": "producers/a/bodies/persistence.md",
    "encoding": "utf-8",
    "byte_length": 4833,
    "sha256": "2a9d564fbc6ce848129eb4611b47ecb27c873cc41cdb9a4e34c2f1f043587741"
  },
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
  "input_keys": [
    "file:packages/core/src/database/database.ts",
    "file:packages/core/src/database/migration.ts",
    "file:packages/core/src/event.ts",
    "file:packages/core/src/session/store.ts",
    "file:packages/core/src/event/seal.ts",
    "file:packages/core/src/database/README.md"
  ],
  "build_dependencies": []
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

```json
{
  "key": "s1.core.context",
  "title": "System Context, history selection and compaction",
  "layer": 1,
  "need": "component",
  "body": {
    "path": "producers/a/bodies/context.md",
    "encoding": "utf-8",
    "byte_length": 5541,
    "sha256": "205b44488e2b6349a55480d3becf2e59806c185bec90d43af283e11b3933b1fd"
  },
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
  "input_keys": [
    "file:packages/core/src/system-context/index.ts",
    "file:packages/core/src/system-context/registry.ts",
    "file:packages/core/src/system-context/builtins.ts",
    "file:packages/core/src/instruction-context.ts",
    "file:packages/core/src/session/context-epoch.ts",
    "file:packages/core/src/session/history.ts",
    "file:packages/core/src/session/compaction.ts",
    "file:packages/core/src/session/runner/llm.ts",
    "file:AGENTS.md"
  ],
  "build_dependencies": []
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


# Coverage and unresolved needs

# Complemento de evidência L1 A — população, necessidades e dependentes

**Identidade:** `a-l1-evidence-v1`; scope `orchestra.s1`; fonte `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

Esta é uma projeção do candidato L1 congelado, não uma revisão dos seus corpos. Todos os campos originais `need`, `gaps`, `input_keys`, `validity`, `build_dependencies`, classificações e razões permanecem exatamente preservados no JSON acompanhante. As explicações de fronteira e uso bloqueado abaixo foram escritas nesta revisão e são identificadas como tal. Não constituem aceite semântico, criação de L2–L4 ou recategorização retroativa.

O dossiê da principal foi informado como `output/producers/a/review-dossier.md`, SHA256 `cf7676f527067c7b2aa3fc4bd0d4629e8fa2afa5b843ddc70f857dacc0abffbc`. Seu conteúdo não foi lido e seu hash não foi verificado por este produtor; as projeções usam diretamente os próprios arquivos congelados. Nenhum oracle foi acessado.

## O que as 1.340 entradas não lidas significam

A reconciliação exata cobre 1.441 caminhos: 94 leituras decisivas no registro congelado, sete capturas de orientação e 1.340 entradas não lidas. As 599 implementações substantivas não lidas continuam fora da autoridade de afirmações específicas. As outras 741 entradas têm disposição agrupada de validação, história, documentação, gerados, vendor ou suporte. Essa disposição explica por que não se exigiu uma narrativa por arquivo no L1; ela não substitui leitura quando o conteúdo é premissa de uma necessidade obrigatória.

| Profundidade original das entradas não lidas | Quantidade | Alcance e obrigação preservada |
| --- | ---: | --- |
| `representative_family_boundary` | 599 | Fronteira/coordenador lido; sem aceite da implementação de cada leaf. Ler o leaf e seus contratos antes de afirmação ou mudança que dependa dele. |
| `grouped_validation_inventory` | 584 | Inventário de testes, fixtures e suporte; nenhum resultado executado. Selecionar fontes e gate pertinente quando a afirmação exigir validação. |
| `grouped_history_contract` | 72 | Migração histórica retida como contrato de dados. Mudança/upgrade exige leitura da transformação e predecessors afetados. |
| `grouped_vendor_boundary` | 27 | Autoridade upstream distinta; host boundary não valida internals. Ler contrato/vendor/licença/update quando pertinente. |
| `grouped_documentation_disposition` | 26 | Documento/história retido; sem inferir implementação ou qualificação por título. Ler e confrontar fonte quando usado como requisito. |
| `grouped_support_contract` | 28 | Prompt/pin/script/asset/configuração é input sensível a mudança, não suporte descartável. Ler quando seu conteúdo ou geração afeta a necessidade. |
| `grouped_generated_contract` | 4 | Arquivo gerado retido e ligado ao dono/gerador. Fonte geradora e comparação de bytes são exigidas em manutenção pertinente. |

As sete orientações capturadas permanecem orientações no congelado: `docs/guides/agents.md`, `docs/guides/session-requests.md`, `docs/specs/v2/tools.md`, `packages/core/src/board/tools.ts`, `packages/core/src/session/README.md`, `packages/core/src/session/runner/execution-host.ts` e `packages/core/src/session/runner/index.ts`. Um trecho complementar eventualmente lido agora não apaga esse estado histórico.

**Lacuna obrigatória:** se uma pergunta L1 exigida depende de um leaf não lido, a lacuna permanece aberta nesse ponto. Não se presume que o requisito possa ser adiado por conveniência. O mesmo vale para a família util, sem fonte própria lida, e para documentos históricos ainda não confrontados. A suficiência do conjunto continua sujeita aos dois juízes da principal.


### `s1.core.session-admission` — `component`

Corpo congelado: `bodies/session-admission.md`, SHA256 `2535bba77505ed74e7dc2759dce815c8e9684e68e2f0a10fa75f9813192e7ae1`. Validade original: `supported`.

**Gaps originais, verbatim:**

- Runtime retry races and crash behavior were not executed; source evidence only.
- The Session spec contains historical V1/route sections and must not be promoted wholesale to current API authority.

**Inputs originais:** `file:packages/core/src/session.ts`, `file:packages/core/src/session/input.ts`, `file:packages/core/src/session/sql.ts`, `file:packages/core/src/session/projector.ts`, `file:docs/specs/v2/session.md`.

**Explicitação nova nesta revisão:** Identidade de Session, retry e separação admitido/promovido. Alteração de admissão/retry deve conservar identidade, delivery, proveniência histórica e transação; corrida/crash requer evidência runtime autorizada.

**Uso dependente bloqueado:** Explicação ou manutenção de admit-only/steer/queue pode usar a fronteira; garantias concorrentes ou HTTP ponta a ponta ficam bloqueadas sem as provas correspondentes.


### `s1.core.session-execution` — `flow`

Corpo congelado: `bodies/session-execution.md`, SHA256 `470ddb1eacfe7294071893968d7de999c90ea98cb0fd48c48e0730ded51d1663`. Validade original: `supported`.

**Gaps originais, verbatim:**

- Durable multi-node ownership and automatic post-crash provider recovery are explicitly not implemented by this local coordinator.
- ExecutionHost internals are a separate owner boundary; only the Core port and invocation path are inspected.
- No runtime or product test result was obtained.

**Inputs originais:** `file:packages/core/src/session/execution.ts`, `file:packages/core/src/session/execution/local.ts`, `file:packages/core/src/session/run-coordinator.ts`, `file:packages/core/src/session/runner/llm.ts`, `file:docs/specs/v2/session.md`.

**Explicitação nova nesta revisão:** Ownership local, routing por Location e limites de continuação/interrupção. Host adapter, anexos e estados de recuperação específicos exigem leitura; multi-node e post-crash provider continuation não são capacidades implementadas pelo coordenador.

**Uso dependente bloqueado:** L2/L3 podem descrever limites locais após aceite; um dependente que prometa cluster lease, retomada durável ou exactly-once de efeito externo fica bloqueado.


### `s1.core.persistence` — `evidence`

Corpo congelado: `bodies/persistence.md`, SHA256 `2a9d564fbc6ce848129eb4611b47ecb27c873cc41cdb9a4e34c2f1f043587741`. Validade original: `supported`.

**Gaps originais, verbatim:**

- Historical migrations and driver implementations have grouped inventory disposition; they were not exhaustively read or executed.
- Projector registration is not yet keyed by exact durable type plus version.
- Seals do not establish authentication or Session execution ownership.

**Inputs originais:** `file:packages/core/src/database/database.ts`, `file:packages/core/src/database/migration.ts`, `file:packages/core/src/event.ts`, `file:packages/core/src/session/store.ts`, `file:packages/core/src/event/seal.ts`, `file:packages/core/src/database/README.md`.

**Explicitação nova nesta revisão:** Transação de evento/projeção, replay e contrato de migração. Mudança de dados exige migrações/predecessors/drivers pertinentes; mudança de versão de evento exige tratar o TODO de registro type+version.

**Uso dependente bloqueado:** Compatibilidade de upgrade/restauração, autenticação de seals e replay arbitrário não podem ser liberados por esse L1 genérico.


### `s1.core.context` — `component`

Corpo congelado: `bodies/context.md`, SHA256 `205b44488e2b6349a55480d3becf2e59806c185bec90d43af283e11b3933b1fd`. Validade original: `supported`.

**Gaps originais, verbatim:**

- Provider token estimates and generated summaries were not measured or evaluated.
- External Context Source producers and Continuity replacement layers are separate source boundaries.

**Inputs originais:** `file:packages/core/src/system-context/index.ts`, `file:packages/core/src/system-context/registry.ts`, `file:packages/core/src/system-context/builtins.ts`, `file:packages/core/src/instruction-context.ts`, `file:packages/core/src/session/context-epoch.ts`, `file:packages/core/src/session/history.ts`, `file:packages/core/src/session/compaction.ts`, `file:packages/core/src/session/runner/llm.ts`, `file:AGENTS.md`.

**Explicitação nova nesta revisão:** Retenção de observação indisponível, epoch e seleção de histórico. Mudança de produtor externo/Continuity exige sua fonte; qualidade de summary e token estimates exigem medição quando reivindicadas.

**Uso dependente bloqueado:** Dependentes de freshness global, remoção por falha de leitura ou qualidade semântica de compactação ficam bloqueados sem evidência própria.



## Family dispositions relevant to this batch

The exact family counts below refer to the original whole family; the membership groups further below partition only this packet’s assigned keys.

### database — 89 entradas

**Profundidades originais:** `decisive_source_read`=3, `grouped_generated_contract`=2, `grouped_history_contract`=72, `grouped_validation_inventory`=6, `representative_family_boundary`=6.

**Read status original:** `not_read`=86, `semantically_read_decisive_ranges`=3.

**Rota original:** `s1.core.persistence`. **Artefatos que de fato citam fontes da família:** `s1.core.persistence`.

**Fontes decisivas listadas no original:** `packages/core/src/database/README.md`, `packages/core/src/database/database.ts`, `packages/core/src/database/migration.ts`.

**Razões originais aplicáveis:** R011, R023, R025, R046, R079.

**Alcance sustentado (explicitação):** Engine e README sustentam journal, transações immediate, backup, recusa de identidade desconhecida e contrato de usuário dos gerados/migrações.

**Obrigação/lacuna retida (explicitação):** 72 migrações históricas, dois gerados e seis implementações não lidas não são descartáveis. Mudança de schema/upgrade/restauração exige os predecessors e drivers pertinentes; o engine genérico não prova cada transformação de dados.


### event — 11 entradas

**Profundidades originais:** `decisive_source_read`=2, `grouped_validation_inventory`=6, `representative_family_boundary`=3.

**Read status original:** `not_read`=9, `semantically_read_decisive_ranges`=2.

**Rota original:** `s1.core.persistence`. **Artefatos que de fato citam fontes da família:** `s1.core.persistence`.

**Fontes decisivas listadas no original:** `packages/core/src/event.ts`, `packages/core/src/event/seal.ts`.

**Razões originais aplicáveis:** R011, R048, R081.

**Alcance sustentado (explicitação):** event.ts e seal.ts sustentam transação, replay, diferenças de persistência/notificação e integridade limitada por janela.

**Obrigação/lacuna retida (explicitação):** Os outros três leaves não lidos e drivers devem ser lidos para mudar seu comportamento. Replay não prova ownership de execução, autenticação ou compatibilidade irrestrita de schemas.


### session — 90 entradas

**Profundidades originais:** `decisive_source_read`=14, `grouped_support_contract`=1, `grouped_validation_inventory`=36, `orientation_read`=3, `representative_family_boundary`=36.

**Read status original:** `captured_targeted_orientation_only`=3, `not_read`=73, `semantically_read_decisive_ranges`=14.

**Rota original:** `s1.core.context`, `s1.core.models`, `s1.core.persistence`, `s1.core.session-admission`, `s1.core.session-execution`. **Artefatos que de fato citam fontes da família:** `s1.core.context`, `s1.core.models`, `s1.core.persistence`, `s1.core.project`, `s1.core.security`, `s1.core.session-admission`, `s1.core.session-execution`, `s1.core.tools`.

**Fontes decisivas listadas no original:** `docs/specs/v2/session.md`, `packages/core/src/session.ts`, `packages/core/src/session/compaction.ts`, `packages/core/src/session/context-epoch.ts`, `packages/core/src/session/execution.ts`, `packages/core/src/session/execution/local.ts`, `packages/core/src/session/history.ts`, `packages/core/src/session/input.ts`, `packages/core/src/session/projector.ts`, `packages/core/src/session/run-coordinator.ts`, `packages/core/src/session/runner/llm.ts`, `packages/core/src/session/runner/model.ts`, `packages/core/src/session/sql.ts`, `packages/core/src/session/store.ts`.

**Razões originais aplicáveis:** R005, R010, R011, R016, R017, R018, R019, R020, R029, R063, R064, R065, R066, R094, R108.

**Alcance sustentado (explicitação):** Quatorze leituras decisivas distribuem admissão, execução, contexto, persistência e seleção de modelo por cinco artefatos. Os usos cruzados são explícitos no mapa.

**Obrigação/lacuna retida (explicitação):** 36 leaves não lidos, três orientações e um suporte não autorizam feature census completo. Attachments, snapshot/revert, engine internals e demais operações precisam de leitura quando o requisito depende deles; não há recuperação distribuída demonstrada.


### system-context — 11 entradas

**Profundidades originais:** `decisive_source_read`=4, `grouped_validation_inventory`=7.

**Read status original:** `not_read`=7, `semantically_read_decisive_ranges`=4.

**Rota original:** `s1.core.context`. **Artefatos que de fato citam fontes da família:** `s1.core.context`.

**Fontes decisivas listadas no original:** `packages/core/src/instruction-context.ts`, `packages/core/src/system-context/builtins.ts`, `packages/core/src/system-context/index.ts`, `packages/core/src/system-context/registry.ts`.

**Razões originais aplicáveis:** R005, R095.

**Alcance sustentado (explicitação):** Os quatro membros de implementação atribuídos estão lidos e sustentam álgebra, registry, built-ins e instruction-context; sete testes são inventário, não resultados.

**Obrigação/lacuna retida (explicitação):** Fontes de contexto dos domínios externos, substituições de Continuity e qualidade de summaries ficam fora da prova dessas quatro implementações. Tests não executados não fecham o risco de runtime.



## Exact original justification dictionary used in this batch


**R005**: Captured pinned bytes and inspected cited definitions/control flow used by s1.core.context; conclusions are limited to these source ranges and explicit normative sections.


**R011**: Captured pinned bytes and inspected cited definitions/control flow used by s1.core.persistence; conclusions are limited to these source ranges and explicit normative sections.


**R016**: Captured pinned bytes and inspected cited definitions/control flow used by s1.core.session-admission, s1.core.project; conclusions are limited to these source ranges and explicit normative sections.


**R017**: Captured pinned bytes and inspected cited definitions/control flow used by s1.core.session-admission, s1.core.session-execution, s1.core.tools, s1.core.security; conclusions are limited to these source ranges and explicit normative sections.


**R018**: Captured pinned bytes and inspected cited definitions/control flow used by s1.core.session-admission; conclusions are limited to these source ranges and explicit normative sections.


**R019**: Captured pinned bytes and inspected cited definitions/control flow used by s1.core.session-execution, s1.core.context, s1.core.security; conclusions are limited to these source ranges and explicit normative sections.


**R020**: Captured pinned bytes and inspected cited definitions/control flow used by s1.core.session-execution; conclusions are limited to these source ranges and explicit normative sections.


**R023**: Generated artifact retained in database disposition; generator/owner contract, not hand-editable semantic authority. Current runtime contract is represented by s1.core.persistence; regeneration and byte comparison belong to authorized maintenance.


**R025**: Ordered historical user-data migration retained as compatibility input; current migration engine and data-contract limits are read in s1.core.persistence. A change affecting this history requires this migration and affected predecessor reads.


**R029**: Pinned bytes captured; orientation/header inspection does not authorize leaf-specific behavior claims. Family boundary is documented in s1.core.session-execution; deeper source read required before operational use of this file.


**R046**: Substantive database leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.persistence; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.


**R048**: Substantive event leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.persistence; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.


**R064**: Substantive session leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.persistence; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.


**R065**: Substantive session leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.session-admission; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.


**R066**: Substantive session leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.session-execution; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.


**R079**: Validation/fixture population is retained under database; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.


**R081**: Validation/fixture population is retained under event; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.


**R094**: Validation/fixture population is retained under session; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.


**R095**: Validation/fixture population is retained under system-context; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.


**R108**: session support input retained under s1.core.session-execution. Runtime text/pins/generator inputs are behavior-relevant when changed; this L1 claims only inspected owner/entry boundaries, not the unseen content.



## Complete routed membership groups

Each row below retains its original shared classification. Paths are exact; Git blob identities remain in the unchanged original population and losslessly reconstructed coverage JSON. These are dispositions, not claims that unread content was inspected.


### G037 — 1 memberships

```json
{
  "family": "database",
  "kind": "documentation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.persistence; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "evidence",
  "proposed_artifact_key": "s1.core.persistence",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/src/database/README.md`


### G038 — 2 memberships

```json
{
  "family": "database",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.persistence; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "evidence",
  "proposed_artifact_key": "s1.core.persistence",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/database/database.ts`
- `packages/core/src/database/migration.ts`


### G039 — 2 memberships

```json
{
  "family": "database",
  "kind": "generated_output",
  "depth": "grouped_generated_contract",
  "justification": "Generated artifact retained in database disposition; generator/owner contract, not hand-editable semantic authority. Current runtime contract is represented by s1.core.persistence; regeneration and byte comparison belong to authorized maintenance.",
  "source_read_status": "not_read",
  "need": "evidence",
  "proposed_artifact_key": "s1.core.persistence",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/src/database/migration.gen.ts`
- `packages/core/src/database/schema.gen.ts`


### G040 — 72 memberships

```json
{
  "family": "database",
  "kind": "historical_migration",
  "depth": "grouped_history_contract",
  "justification": "Ordered historical user-data migration retained as compatibility input; current migration engine and data-contract limits are read in s1.core.persistence. A change affecting this history requires this migration and affected predecessor reads.",
  "source_read_status": "not_read",
  "need": "evidence",
  "proposed_artifact_key": "s1.core.persistence",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/database/migration/20260127222353_familiar_lady_ursula.ts`
- `packages/core/src/database/migration/20260211171708_add_project_commands.ts`
- `packages/core/src/database/migration/20260213144116_wakeful_the_professor.ts`
- `packages/core/src/database/migration/20260225215848_workspace.ts`
- `packages/core/src/database/migration/20260227213759_add_session_workspace_id.ts`
- `packages/core/src/database/migration/20260228203230_blue_harpoon.ts`
- `packages/core/src/database/migration/20260303231226_add_workspace_fields.ts`
- `packages/core/src/database/migration/20260309230000_move_org_to_state.ts`
- `packages/core/src/database/migration/20260312043431_session_message_cursor.ts`
- `packages/core/src/database/migration/20260323234822_events.ts`
- `packages/core/src/database/migration/20260410174513_workspace-name.ts`
- `packages/core/src/database/migration/20260413175956_chief_energizer.ts`
- `packages/core/src/database/migration/20260423070820_add_icon_url_override.ts`
- `packages/core/src/database/migration/20260427172553_slow_nightmare.ts`
- `packages/core/src/database/migration/20260428004200_add_session_path.ts`
- `packages/core/src/database/migration/20260501142318_next_venus.ts`
- `packages/core/src/database/migration/20260504145000_add_sync_owner.ts`
- `packages/core/src/database/migration/20260507164347_add_workspace_time.ts`
- `packages/core/src/database/migration/20260510033149_session_usage.ts`
- `packages/core/src/database/migration/20260511000411_data_migration_state.ts`
- `packages/core/src/database/migration/20260511173437_session-metadata.ts`
- `packages/core/src/database/migration/20260601010001_normalize_storage_paths.ts`
- `packages/core/src/database/migration/20260601202201_amazing_prowler.ts`
- `packages/core/src/database/migration/20260602002951_lowly_union_jack.ts`
- `packages/core/src/database/migration/20260602182828_add_project_directories.ts`
- `packages/core/src/database/migration/20260603001617_session_message_projection_indexes.ts`
- `packages/core/src/database/migration/20260603040000_session_message_projection_order.ts`
- `packages/core/src/database/migration/20260603141458_session_input_inbox.ts`
- `packages/core/src/database/migration/20260603160727_jittery_ezekiel_stane.ts`
- `packages/core/src/database/migration/20260604172448_event_sourced_session_input.ts`
- `packages/core/src/database/migration/20260605003541_add_session_context_snapshot.ts`
- `packages/core/src/database/migration/20260605042240_add_context_epoch_agent.ts`
- `packages/core/src/database/migration/20260611035744_credential.ts`
- `packages/core/src/database/migration/20260611192811_lush_chimera.ts`
- `packages/core/src/database/migration/20260612174303_project_dir_strategy.ts`
- `packages/core/src/database/migration/20260622142730_simplify_session_context_epoch.ts`
- `packages/core/src/database/migration/20260622170816_reset_v2_session_state.ts`
- `packages/core/src/database/migration/20260622202450_simplify_session_input.ts`
- `packages/core/src/database/migration/20261002195730_event_seals.ts`
- `packages/core/src/database/migration/20261006153404_scheduled_task.ts`
- `packages/core/src/database/migration/20261008025417_prompt_context.ts`
- `packages/core/src/database/migration/20261008133630_v1_prompt_admission.ts`
- `packages/core/src/database/migration/20261008180046_capability_storage.ts`
- `packages/core/src/database/migration/20261008192938_capability_lifecycle.ts`
- `packages/core/src/database/migration/20261008233008_capability_request_identity.ts`
- `packages/core/src/database/migration/20261009154042_capability_children.ts`
- `packages/core/src/database/migration/20261009225521_capability_operator_requests.ts`
- `packages/core/src/database/migration/20261010044121_capability_connection_labels.ts`
- `packages/core/src/database/migration/20261010135215_project_checkpoints.ts`
- `packages/core/src/database/migration/20261011160517_scheduled_task_capability.ts`
- `packages/core/src/database/migration/20261012115744_actions-operation.ts`
- `packages/core/src/database/migration/20261012134025_session_subagent_models.ts`
- `packages/core/src/database/migration/20261018031800_session_list_indexes.ts`
- `packages/core/src/database/migration/20261026003504_meeting_record.ts`
- `packages/core/src/database/migration/20261026011509_board.ts`
- `packages/core/src/database/migration/20261026013700_retire_legacy_session_events.ts`
- `packages/core/src/database/migration/20261026013755_drop_prompt_admission.ts`
- `packages/core/src/database/migration/20261026143218_board_forecast.ts`
- `packages/core/src/database/migration/20261026213955_board_spend.ts`
- `packages/core/src/database/migration/20261026232319_meeting_memory.ts`
- `packages/core/src/database/migration/20261028193250_board_check.ts`
- `packages/core/src/database/migration/20261028201629_board_attempt.ts`
- `packages/core/src/database/migration/20261028202742_conflict_notices.ts`
- `packages/core/src/database/migration/20261028204130_merge_queue.ts`
- `packages/core/src/database/migration/20261028231723_board_flake.ts`
- `packages/core/src/database/migration/20261028234541_board_held.ts`
- `packages/core/src/database/migration/20261029070552_board_base_fix.ts`
- `packages/core/src/database/migration/20261029071810_board_thread.ts`
- `packages/core/src/database/migration/20261029101343_board_lanes.ts`
- `packages/core/src/database/migration/20261105013340_rag_studio.ts`
- `packages/core/src/database/migration/20261110002451_eminent_sphinx.ts`
- `packages/core/src/database/migration/20261110115233_giant_terror.ts`


### G041 — 6 memberships

```json
{
  "family": "database",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under database; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "evidence",
  "proposed_artifact_key": "s1.core.persistence",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/database-migration-backup.test.ts`
- `packages/core/test/database-migration-meeting-memory.test.ts`
- `packages/core/test/database-migration-retire-legacy.test.ts`
- `packages/core/test/database-migration.test.ts`
- `packages/core/test/database-sqlite-preparation.test.ts`
- `packages/core/test/database-sqlite.test.ts`


### G042 — 6 memberships

```json
{
  "family": "database",
  "kind": "implementation",
  "depth": "representative_family_boundary",
  "justification": "Substantive database leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.persistence; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.",
  "source_read_status": "not_read",
  "need": "evidence",
  "proposed_artifact_key": "s1.core.persistence",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/data-migration.sql.ts`
- `packages/core/src/database/path.ts`
- `packages/core/src/database/schema.sql.ts`
- `packages/core/src/database/sqlite.bun.ts`
- `packages/core/src/database/sqlite.node.ts`
- `packages/core/src/database/sqlite.ts`


### G047 — 2 memberships

```json
{
  "family": "event",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.persistence; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "evidence",
  "proposed_artifact_key": "s1.core.persistence",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/event.ts`
- `packages/core/src/event/seal.ts`


### G048 — 6 memberships

```json
{
  "family": "event",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under event; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "evidence",
  "proposed_artifact_key": "s1.core.persistence",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/event-persist-gate.test.ts`
- `packages/core/test/event-seal-limits.test.ts`
- `packages/core/test/event-seal-review.test.ts`
- `packages/core/test/event-seal-window.test.ts`
- `packages/core/test/event-seal.test.ts`
- `packages/core/test/event.test.ts`


### G049 — 3 memberships

```json
{
  "family": "event",
  "kind": "implementation",
  "depth": "representative_family_boundary",
  "justification": "Substantive event leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.persistence; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.",
  "source_read_status": "not_read",
  "need": "evidence",
  "proposed_artifact_key": "s1.core.persistence",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/event/compaction.ts`
- `packages/core/src/event/sql.ts`
- `packages/core/src/public-event-manifest.ts`


### G119 — 3 memberships

```json
{
  "family": "session",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.context; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "component",
  "proposed_artifact_key": "s1.core.context",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/session/compaction.ts`
- `packages/core/src/session/context-epoch.ts`
- `packages/core/src/session/history.ts`


### G120 — 2 memberships

```json
{
  "family": "session",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under session; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.context",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/session-compaction.test.ts`
- `packages/core/test/session-history.test.ts`


### G124 — 2 memberships

```json
{
  "family": "session",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.session-admission; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "evidence",
  "proposed_artifact_key": "s1.core.persistence",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/session/projector.ts`
- `packages/core/src/session/sql.ts`


### G125 — 1 memberships

```json
{
  "family": "session",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.persistence; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "evidence",
  "proposed_artifact_key": "s1.core.persistence",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/session/store.ts`


### G126 — 4 memberships

```json
{
  "family": "session",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under session; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "evidence",
  "proposed_artifact_key": "s1.core.persistence",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/session-legacy-import.test.ts`
- `packages/core/test/session-persistence.test.ts`
- `packages/core/test/session-projector.test.ts`
- `packages/core/test/session-store-permissions.test.ts`


### G127 — 4 memberships

```json
{
  "family": "session",
  "kind": "implementation",
  "depth": "representative_family_boundary",
  "justification": "Substantive session leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.persistence; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.",
  "source_read_status": "not_read",
  "need": "evidence",
  "proposed_artifact_key": "s1.core.persistence",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/session/legacy-import.ts`
- `packages/core/src/session/legacy-transcript.ts`
- `packages/core/src/session/meeting-memory.sql.ts`
- `packages/core/src/session/meeting.sql.ts`


### G128 — 1 memberships

```json
{
  "family": "session",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.session-admission, s1.core.project; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "component",
  "proposed_artifact_key": "s1.core.session-admission",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/session.ts`


### G129 — 1 memberships

```json
{
  "family": "session",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.session-admission; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "component",
  "proposed_artifact_key": "s1.core.session-admission",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/session/input.ts`


### G130 — 2 memberships

```json
{
  "family": "session",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under session; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.session-admission",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/session-create.test.ts`
- `packages/core/test/session-prompt.test.ts`


### G131 — 2 memberships

```json
{
  "family": "session",
  "kind": "implementation",
  "depth": "representative_family_boundary",
  "justification": "Substantive session leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.session-admission; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.session-admission",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/session/event.ts`
- `packages/core/src/session/schema.ts`


### G132 — 1 memberships

```json
{
  "family": "session",
  "kind": "documentation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.session-admission, s1.core.session-execution, s1.core.tools, s1.core.security; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "flow",
  "proposed_artifact_key": "s1.core.session-execution",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `docs/specs/v2/session.md`


### G133 — 3 memberships

```json
{
  "family": "session",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.session-execution; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "flow",
  "proposed_artifact_key": "s1.core.session-execution",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/session/execution.ts`
- `packages/core/src/session/execution/local.ts`
- `packages/core/src/session/run-coordinator.ts`


### G134 — 1 memberships

```json
{
  "family": "session",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.session-execution, s1.core.context, s1.core.security; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "flow",
  "proposed_artifact_key": "s1.core.session-execution",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/session/runner/llm.ts`


### G135 — 1 memberships

```json
{
  "family": "session",
  "kind": "bundled_instruction",
  "depth": "grouped_support_contract",
  "justification": "session support input retained under s1.core.session-execution. Runtime text/pins/generator inputs are behavior-relevant when changed; this L1 claims only inspected owner/entry boundaries, not the unseen content.",
  "source_read_status": "not_read",
  "need": "flow",
  "proposed_artifact_key": "s1.core.session-execution",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/session/meeting-consolidation.txt`


### G136 — 25 memberships

```json
{
  "family": "session",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under session; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "flow",
  "proposed_artifact_key": "s1.core.session-execution",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/session-archive-http.test.ts`
- `packages/core/test/session-archive.test.ts`
- `packages/core/test/session-operations.test.ts`
- `packages/core/test/session-process.test.ts`
- `packages/core/test/session-rename-remove.test.ts`
- `packages/core/test/session-run-coordinator.test.ts`
- `packages/core/test/session-runner-execution-host-mcp.test.ts`
- `packages/core/test/session-runner-execution-host-ports.test.ts`
- `packages/core/test/session-runner-execution-host.test.ts`
- `packages/core/test/session-runner-governance.test.ts`
- `packages/core/test/session-runner-mentions.test.ts`
- `packages/core/test/session-runner-message.test.ts`
- `packages/core/test/session-runner-policy.test.ts`
- `packages/core/test/session-runner-recorded.test.ts`
- `packages/core/test/session-runner-tool-events.test.ts`
- `packages/core/test/session-runner-tool-registry.test.ts`
- `packages/core/test/session-runner.test.ts`
- `packages/core/test/session-todo.test.ts`
- `packages/core/test/session-tool-progress.test.ts`
- `packages/core/test/session/meeting-briefing.test.ts`
- `packages/core/test/session/meeting-consolidation.test.ts`
- `packages/core/test/session/meeting-handoff.test.ts`
- `packages/core/test/session/meeting-memory.test.ts`
- `packages/core/test/session/meeting.test.ts`
- `packages/core/test/session/upstream-logical-resume.test.ts`


### G137 — 1 memberships

```json
{
  "family": "session",
  "kind": "test_support",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under session; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "flow",
  "proposed_artifact_key": "s1.core.session-execution",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/session-runner-harness.ts`


### G138 — 1 memberships

```json
{
  "family": "session",
  "kind": "documentation",
  "depth": "orientation_read",
  "justification": "Pinned bytes captured; orientation/header inspection does not authorize leaf-specific behavior claims. Family boundary is documented in s1.core.session-execution; deeper source read required before operational use of this file.",
  "source_read_status": "captured_targeted_orientation_only",
  "need": "flow",
  "proposed_artifact_key": "s1.core.session-execution",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/session/README.md`


### G139 — 2 memberships

```json
{
  "family": "session",
  "kind": "implementation",
  "depth": "orientation_read",
  "justification": "Pinned bytes captured; orientation/header inspection does not authorize leaf-specific behavior claims. Family boundary is documented in s1.core.session-execution; deeper source read required before operational use of this file.",
  "source_read_status": "captured_targeted_orientation_only",
  "need": "flow",
  "proposed_artifact_key": "s1.core.session-execution",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/session/runner/execution-host.ts`
- `packages/core/src/session/runner/index.ts`


### G140 — 29 memberships

```json
{
  "family": "session",
  "kind": "implementation",
  "depth": "representative_family_boundary",
  "justification": "Substantive session leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.session-execution; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.",
  "source_read_status": "not_read",
  "need": "flow",
  "proposed_artifact_key": "s1.core.session-execution",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/session-process.ts`
- `packages/core/src/session/activity.ts`
- `packages/core/src/session/archive.ts`
- `packages/core/src/session/error.ts`
- `packages/core/src/session/info.ts`
- `packages/core/src/session/lean-profile-preferences.ts`
- `packages/core/src/session/lean-project.ts`
- `packages/core/src/session/lifecycle.ts`
- `packages/core/src/session/meeting-briefing.ts`
- `packages/core/src/session/meeting-consolidation.ts`
- `packages/core/src/session/meeting-context.ts`
- `packages/core/src/session/meeting-handoff.ts`
- `packages/core/src/session/meeting-memory.ts`
- `packages/core/src/session/meeting-verdict.ts`
- `packages/core/src/session/meeting.ts`
- `packages/core/src/session/message-updater.ts`
- `packages/core/src/session/message.ts`
- `packages/core/src/session/prompt.ts`
- `packages/core/src/session/revert.ts`
- `packages/core/src/session/runner/direct-commands.ts`
- `packages/core/src/session/runner/hosted-call.ts`
- `packages/core/src/session/runner/max-steps.ts`
- `packages/core/src/session/runner/mentions.ts`
- `packages/core/src/session/runner/publish-llm-event.ts`
- `packages/core/src/session/runner/step-tools.ts`
- `packages/core/src/session/runner/title.ts`
- `packages/core/src/session/runner/to-llm-message.ts`
- `packages/core/src/session/runner/turn-transition.ts`
- `packages/core/src/session/todo.ts`


### G141 — 4 memberships

```json
{
  "family": "system-context",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.context; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "component",
  "proposed_artifact_key": "s1.core.context",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/instruction-context.ts`
- `packages/core/src/system-context/builtins.ts`
- `packages/core/src/system-context/index.ts`
- `packages/core/src/system-context/registry.ts`


### G142 — 7 memberships

```json
{
  "family": "system-context",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under system-context; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.context",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/hook-prompt-context.test.ts`
- `packages/core/test/instruction-context.test.ts`
- `packages/core/test/prompt-context-compaction.test.ts`
- `packages/core/test/prompt-context.test.ts`
- `packages/core/test/system-context/builtins.test.ts`
- `packages/core/test/system-context/index.test.ts`
- `packages/core/test/system-context/registry.test.ts`


# Original exact decisive source spans

# Producer A L1 exact source evidence — compact judge projection

Source commit: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Excerpts are exact UTF-8 source slices, with source Git blob identity and inclusive line spans. They are evidence for source observations and separately labeled repository intent; they are not executed tests or live qualification. Body hashes bind the artifact map below. The full source archive remains in `sources/`; `review-evidence.md` preserves all cited anchor spans.


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



# Supplemental exact source spans

## Preserved conflicts and mandatory limits

- Session rules: the runner merges Session rules (AEX009) while ordinary PermissionV2.configured returns selected-agent permissions. Both executable branches are included. No universal enforcement/ignoring claim is substituted.
- Bash: original C030 preserves the old unsandboxed wording. Added foreground/background permission→wrapper branches and the current AGENTS requirement preserve the actual conditional confinement boundary. C027/C028 preserve no-requirement/fallback cases.
- Permission rejection: original C026 and C031 retain implementation fan-out versus one-request guide wording. No source here resolves that conflict by fiat.
- Binary read: original C022 and C024 preserve the current supported-image restriction versus the earlier broad binary description.
- Native MCP bounds remain normative README authority. The transport implementation was not captured/read here; behavioral guarantees beyond the inspected policy/registration boundary remain mandatory gaps.
- 599 unread implementation leaves, seven orientation-only frozen entries and external engine/OS/provider boundaries remain outside exhaustive semantic acceptance. This revision supplies material source context; it does not certify those members or qualify runtime.


### AEX001

**Artifacts:** `s1.core.session-admission`.

**Claim/limit supported:** Existing Session identity wins before applying new creation fields.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session.ts:402a192a69bcad6a4b08c695657e24ff5e335f93`, lines 357–364.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `d8c38d46bc6b78ec23d7dae7525fa2ad4c4f07f3f6b5963248e0a0e96d1fbe58`; **excerpt SHA256:** `545b68e4f4e81fdebcfa738e1083607ed3342bfdfa04430886fa4ae2663bb8fb` (440 bytes).

````text
    const result = Service.of({
      create: Effect.fn("V2Session.create")(function* (input) {
        const sessionID = input.id ?? SessionSchema.ID.create()
        const recorded = yield* store.get(sessionID)
        if (recorded) return recorded
        if (input.parentID) yield* result.get(input.parentID)
        const project = yield* projects.resolve(input.location.directory)
        yield* ProjectV2.record(db, events, project)
````


### AEX002

**Artifacts:** `s1.core.session-admission`.

**Claim/limit supported:** Concurrent creation adopts the recorded Session; post-create hooks cannot undo it.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session.ts:402a192a69bcad6a4b08c695657e24ff5e335f93`, lines 393–414.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `d8c38d46bc6b78ec23d7dae7525fa2ad4c4f07f3f6b5963248e0a0e96d1fbe58`; **excerpt SHA256:** `fd501736789c987505cf539d6d0b2253dc655766a5a95b6f94be17e5168c3659` (1104 bytes).

````text
          .pipe(
            Effect.as({ type: "created" } as const),
            Effect.catchDefect((defect) => {
              if (!(defect instanceof SessionProjector.SessionAlreadyProjected)) {
                return Effect.die(defect)
              }
              // Concurrent creation lost the projection race. The existing Session identity wins.
              return store
                .get(sessionID)
                .pipe(
                  Effect.flatMap((session) =>
                    session ? Effect.succeed({ type: "existing", session } as const) : Effect.die(defect),
                  ),
                )
            }),
          )
        if (projected.type === "existing") return projected.session
        // TODO: Restore recorded sessions onto replacement synchronized workspaces in a future API slice.
        const created = yield* result.get(sessionID).pipe(Effect.orDie)
        // `session-start` hooks run once a new Session is stored; their outcome never undoes it.
        yield* hook(created, { operation: "session-start" }).pipe(Effect.exit)
        return created
````


### AEX003

**Artifacts:** `s1.core.session-admission`.

**Claim/limit supported:** Prompt hooks occur before admission; an already durable message skips re-asking and leaves retry reconciliation to admission.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session.ts:402a192a69bcad6a4b08c695657e24ff5e335f93`, lines 304–325.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `d8c38d46bc6b78ec23d7dae7525fa2ad4c4f07f3f6b5963248e0a0e96d1fbe58`; **excerpt SHA256:** `0e976f3b322643b171e0988a9e6dd049175836bd52bf8f6a9236b9aefc49b6d5` (1348 bytes).

````text
    // Before admission and interruptible, since an Ask waits for a person: a refused prompt is never admitted. A message
    // ID that already names a durable prompt is left to admission, which reconciles an exact retry or refuses a
    // conflict, without asking again. It reads the Session first, as admission did.
    const promptHooks = Effect.fnUntraced(function* (input: {
      readonly id: SessionMessage.ID
      readonly sessionID: SessionSchema.ID
      readonly prompt: PromptInput.Prompt
    }) {
      const session = yield* result.get(input.sessionID)
      if ((yield* SessionInput.find(db, input.id)) || (yield* store.message(input.id))) return []
      return yield* hook(session, { operation: "prompt", text: input.prompt.text, messageID: input.id }).pipe(
        Effect.catch((error) => {
          const err = error as { _tag?: string; reason?: string; message?: string }
          return Effect.fail(
            new PromptBlockedError({
              sessionID: session.id,
              reason: err._tag === "ToolSafety.Denied" ? (err.reason ?? "relay-hook-location-acquisition") : "relay-hook-location-acquisition",
              detail: err._tag === "ToolSafety.Denied" ? (err.message ?? "Prompt hooks could not be evaluated.") : "Prompt hooks could not be evaluated.",
            }),
          )
        }),
      )
````


### AEX004

**Artifacts:** `s1.core.session-admission`.

**Claim/limit supported:** Historical prompt reconciliation needs the original durable Prompted event for delivery and verifies all projection identity before inserting a promoted inbox row.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/input.ts:d945b00cf43d03b923cc90d51970d47e2dd3a9c2`, lines 96–158.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `c5c418685f90aac45034890e2f8a2e2ee9787505e0134b9331a7edbb6be6e7bc`; **excerpt SHA256:** `29dc5faed3607388dc907b139a1c20e8f27a98792bcc2112beec5a7b101b847f` (3136 bytes).

````text
// User projections omit delivery. Only their original durable Prompted event can establish it.
const reconcileHistorical = Effect.fn("SessionInput.reconcileHistorical")(function* (
  db: DatabaseService,
  input: Parameters<typeof equivalent>[1] & { readonly id: SessionMessage.ID },
) {
  const version = SessionEvent.Prompted.durable?.version
  if (version === undefined) return yield* Effect.die("Prompted event is not durable")
  return yield* db
    .transaction(
      (tx) =>
        Effect.gen(function* () {
          const existing = yield* find(tx, input.id)
          if (existing !== undefined) {
            if (!equivalent(existing, input)) return yield* Effect.die(new LifecycleConflict({ id: input.id }))
            return existing
          }
          const row = yield* tx.select().from(SessionMessageTable).where(eq(SessionMessageTable.id, input.id)).get()
          if (row === undefined) return
          if (row.session_id !== input.sessionID || row.type !== "user")
            return yield* Effect.die(new LifecycleConflict({ id: input.id }))
          const message = Schema.decodeUnknownOption(SessionMessage.User)({ ...row.data, id: row.id, type: row.type })
          const event = yield* tx
            .select()
            .from(EventTable)
            .where(and(eq(EventTable.aggregate_id, row.session_id), eq(EventTable.seq, row.seq)))
            .get()
          if (Option.isNone(message) || event?.type !== Event.versionedType(SessionEvent.Prompted.type, version))
            return yield* Effect.die(new LifecycleConflict({ id: input.id }))
          const provenance = Schema.decodeUnknownOption(SessionEvent.Prompted.data)(event.data)
          if (Option.isNone(provenance)) return yield* Effect.die(new LifecycleConflict({ id: input.id }))
          const canonical = Admitted.make({
            id: message.value.id,
            sessionID: input.sessionID,
            prompt: Prompt.fromUserMessage(message.value),
            promptContext: message.value.promptContext,
            delivery: provenance.value.delivery,
            timeCreated: message.value.time.created,
            admittedSeq: row.seq,
            promotedSeq: row.seq,
          })
          if (
            provenance.value.messageID !== row.id ||
            !matchesProjection(canonical, { ...provenance.value, timeCreated: provenance.value.timestamp }) ||
            DateTime.toEpochMillis(canonical.timeCreated) !== row.time_created ||
            !equivalent(canonical, input)
          )
            return yield* Effect.die(new LifecycleConflict({ id: input.id }))
          yield* tx
            .insert(SessionInputTable)
            .values({
              id: canonical.id,
              session_id: canonical.sessionID,
              prompt: encodePrompt(canonical.prompt),
              prompt_context: canonical.promptContext,
              delivery: canonical.delivery,
              admitted_seq: row.seq,
              promoted_seq: row.seq,
              time_created: row.time_created,
            })
            .run()
          return canonical
        }),
      { behavior: "immediate" },
````


### AEX005

**Artifacts:** `s1.core.session-admission`.

**Claim/limit supported:** Steers use the admission cutoff and sequence order; queue promotion takes one oldest pending row.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/input.ts:d945b00cf43d03b923cc90d51970d47e2dd3a9c2`, lines 348–390.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `c5c418685f90aac45034890e2f8a2e2ee9787505e0134b9331a7edbb6be6e7bc`; **excerpt SHA256:** `f564f6bda160c6849aa224f7b0799525b154c2ae1d0efb9720741b2b28b71a95` (1271 bytes).

````text
export const promoteSteers = Effect.fn("SessionInput.promoteSteers")(function* (
  db: DatabaseService,
  events: EventV2.Interface,
  sessionID: SessionSchema.ID,
  cutoff: number,
) {
  const rows = yield* db
    .select()
    .from(SessionInputTable)
    .where(
      and(
        eq(SessionInputTable.session_id, sessionID),
        isNull(SessionInputTable.promoted_seq),
        eq(SessionInputTable.delivery, "steer"),
        lte(SessionInputTable.admitted_seq, cutoff),
      ),
    )
    .orderBy(asc(SessionInputTable.admitted_seq))
    .all()
    .pipe(Effect.orDie)
  return yield* publish(db, events, sessionID, rows)
})

export const promoteNextQueued = Effect.fn("SessionInput.promoteNextQueued")(function* (
  db: DatabaseService,
  events: EventV2.Interface,
  sessionID: SessionSchema.ID,
) {
  const row = yield* db
    .select()
    .from(SessionInputTable)
    .where(
      and(
        eq(SessionInputTable.session_id, sessionID),
        isNull(SessionInputTable.promoted_seq),
        eq(SessionInputTable.delivery, "queue"),
      ),
    )
    .orderBy(asc(SessionInputTable.admitted_seq))
    .limit(1)
    .get()
    .pipe(Effect.orDie)
  return row === undefined ? false : yield* publish(db, events, sessionID, [row]).pipe(Effect.as(true))
````


### AEX006

**Artifacts:** `s1.core.session-admission`.

**Claim/limit supported:** Prompted promotes and writes visible projection; PromptAdmitted only projects admission under the event machinery.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/projector.ts:e5d7ca7d65d1da035a136557b08e2a264c788da5`, lines 283–310.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `41e2b996cc570b3db0cc844619454f61234fd499390d5cefa340a6ad2cb0a6ba`; **excerpt SHA256:** `8969842e430658f60b746267f931c44bcf9edcbbc3051031bd7939968eaa6610` (1200 bytes).

````text
    yield* events.project(SessionEvent.Prompted, (event) =>
      Effect.gen(function* () {
        if (event.durable === undefined) return yield* Effect.die("Durable Session event is missing aggregate sequence")
        yield* SessionInput.projectPrompted(db, {
          id: event.data.messageID,
          sessionID: event.data.sessionID,
          prompt: event.data.prompt,
          promptContext: event.data.promptContext,
          delivery: event.data.delivery,
          timeCreated: event.data.timestamp,
          promotedSeq: event.durable.seq,
        })
        yield* run(db, event)
      }),
    )
    yield* events.project(SessionEvent.PromptAdmitted, (event) =>
      Effect.gen(function* () {
        if (event.durable === undefined) return yield* Effect.die("Durable Session event is missing aggregate sequence")
        yield* SessionInput.projectAdmitted(db, {
          admittedSeq: event.durable.seq,
          id: event.data.messageID,
          sessionID: event.data.sessionID,
          prompt: event.data.prompt,
          promptContext: event.data.promptContext,
          delivery: event.data.delivery,
          timeCreated: event.data.timestamp,
        })
      }),
````


### AEX007

**Artifacts:** `s1.core.session-execution`.

**Claim/limit supported:** The drain resolves the stored Session and routes through its concrete Location.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/execution/local.ts:e7b758462abfd388f937fb18b79f82f2733dffad`, lines 14–29.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `74621798a88cf5f9cb05306616d1896b752b4f4f001c3ae03bafc2e0b3910f97`; **excerpt SHA256:** `463ff50d2ddcbd617ad3cb761f13ac765941dca5e0b2acb6672ae0bcb42316ad` (897 bytes).

````text
    const store = yield* SessionStore.Service
    const locations = yield* LocationServiceMap.Service
    const coordinator = yield* SessionRunCoordinator.make<SessionSchema.ID, SessionRunner.RunError>({
      drain: Effect.fnUntraced(function* (sessionID: SessionSchema.ID, force) {
        const session = yield* store.get(sessionID)
        if (!session) return yield* Effect.die(`Session not found: ${sessionID}`)
        return yield* SessionRunner.Service.use((runner) => runner.run({ sessionID, force })).pipe(
          Effect.provide(locations.get(session.location)),
          Effect.mapError((error) => error as SessionRunner.RunError),
          Effect.tapCause((cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.void
              : Effect.logError("Failed to drain Session", cause).pipe(Effect.annotateLogs({ sessionID })),
          ),
        )
      }),
````


### AEX008

**Artifacts:** `s1.core.session-execution`.

**Claim/limit supported:** Stop targets the exact process-local entry and clears pendingWake; it is not a durable cluster lease.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/run-coordinator.ts:526a1e28f6027d744a95f145159be9cc59109ac2`, lines 136–153.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `369d3e9a2f8769b363b50937c628a291dab3f874b6a2d5f31b9a307fbf349cfa`; **excerpt SHA256:** `ee5da7fa4926e6f783028cc9cf5d4c3a64162aecbdfabf6ba2be146cd45a9ecd` (634 bytes).

````text
    const stop = (key: Key, expected?: Entry<E>): Effect.Effect<void> =>
      Effect.suspend(() => {
        const entry = active.get(key)
        // The entry object is process-local ownership. A completed waiter's successor is a different owner.
        if (entry?.owner === undefined || (expected !== undefined && entry !== expected)) return Effect.void
        entry.stopping = true
        entry.pendingWake = false
        return Fiber.interrupt(entry.owner)
      })

    return {
      active: Effect.sync(() => new Set(active.keys())),
      run,
      wake,
      interrupt: (key) => stop(key),
      exclusive,
    }
  })
````


### AEX009

**Artifacts:** `s1.core.session-execution`, `s1.core.security`, `s1.core.context`.

**Claim/limit supported:** Stored placement and governance precede promotion; agent and Session rules are materialized; missing context is initialized before input visibility and new input resets the step allowance.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6`, lines 185–215.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `03b1068354e6bc049f2f30125f413f2b2a966817ac59e69e98bce561c87305c7`; **excerpt SHA256:** `40a74fe87d62c5123691e911ff20e4b37e59b8e4d3d30ed7c6cfeeb3cee56802` (1724 bytes).

````text
    const runTurnAttempt = Effect.fn("SessionRunner.runTurn")(function* (
      sessionID: SessionSchema.ID,
      promotion: SessionInput.Delivery | undefined,
      step: number,
      recoverOverflow?: typeof compaction.compactAfterOverflow,
    ) {
      const session = yield* getSession(sessionID)
      if (session.location.directory !== location.directory || session.location.workspaceID !== location.workspaceID)
        return yield* Effect.interrupt
      // Before agent selection and promotion: a refused turn leaves pending input pending.
      yield* governance.beforeTurn(session)
      const agent = yield* agents.select(session.agent)
      // A Session's own permission rules, after its agent's as the earlier runtime merged them, so a Session rule wins over the agent's.
      const effectiveRules = [
        ...(agent.info?.permissions.map((rule) => ({ ...rule })) ?? []),
        ...(yield* store.permissions(session.id)),
      ]
      const initialized = yield* SessionContextEpoch.initialize(db, loadSystemContext(session.id, agent), session.id)
      const toolFibers = yield* FiberSet.make<void, ToolOutputStore.Error>()
      let needsContinuation = false
      let currentStep = step
      if (promotion) {
        const cutoff = yield* EventV2.latestSequence(db, session.id)
        let promoted = 0
        if (promotion === "steer") promoted = yield* SessionInput.promoteSteers(db, events, session.id, cutoff)
        if (promotion === "queue") {
          promoted += Number(yield* SessionInput.promoteNextQueued(db, events, session.id))
          promoted += yield* SessionInput.promoteSteers(db, events, session.id, cutoff)
        }
        if (promoted > 0) {
          currentStep = 1
````


### AEX010

**Artifacts:** `s1.core.session-execution`, `s1.core.context`.

**Claim/limit supported:** History follows baselineSeq; the final provider step advertises no tools; hosted engine history bypasses the Core provider compaction transform.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6`, lines 237–270.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `03b1068354e6bc049f2f30125f413f2b2a966817ac59e69e98bce561c87305c7`; **excerpt SHA256:** `20b4596f1e6b2a622cceb5448be2e95c4c957eba7be06e6c7f722cc31af213d0` (2273 bytes).

````text
      const modelRef = model ? SessionRunnerModel.reference(model) : (session.model ?? agent.info?.model)
      const entries = yield* SessionHistory.entriesForRunner(db, session.id, system.baselineSeq)
      const context = entries.map((entry) => entry.message)
      const workflow = yield* RelayWorkflowSession.current(session.id).pipe(Effect.provide(workflowContext), Effect.orDie)
      if (workflow?.view.pending) return { needsContinuation: yield* RelayWorkflowSession.reconcile(workflow).pipe(
        Effect.provide(workflowContext), Effect.map((next) => next === true), Effect.orDie), step: currentStep }
      if (workflow?.view.state === "complete") return { needsContinuation: false, step: currentStep }
      const isLastStep = currentStep >= (agent.info?.steps ?? DEFAULT_MAX_STEPS)
      if (!isLastStep) yield* mcp.ready()
      const stepTools = narrowStepTools(workflow?.view.tools, workflow?.view.tools?.mcp ? yield* mcp.tools() : {})
      const toolMaterialization = isLastStep ? undefined : yield* tools.materialize([...effectiveRules, ...stepTools.hidden])
      const promptCacheKey = /^ses_[0-9a-f]{64}$/.test(session.id) ? session.id.slice(4) : session.id
      const contextText = [system.baseline, workflow?.view.instructions].filter((part): part is string => !!part)
      const systemText = agent.info?.system ? [agent.info.system, ...contextText] : contextText
      // Only provider-model turns pass through the compaction transform; a hosted engine receives its history as is.
      const messages = model
        ? yield* compaction.transform({
            sessionID: session.id,
            messages: [...toLLMMessages(context, model), ...(isLastStep ? [Message.assistant(MAX_STEPS_PROMPT)] : [])],
            model,
            tools: toolMaterialization?.definitions ?? [],
          })
        : []
      const request = model && LLM.request({
        model,
        http: {
          headers: SessionRunnerModel.sessionHeaders(model, session.id, session.parentID),
        },
        providerOptions: { openai: { promptCacheKey } },
        system: systemText.map(SystemPart.make),
        messages: [...messages],
        tools: toolMaterialization?.definitions ?? [],
        toolChoice: isLastStep ? "none" : undefined,
      })
````


### AEX011

**Artifacts:** `s1.core.session-execution`.

**Claim/limit supported:** Interrupting a drain cancels all of that Session’s pending permission and question requests.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6`, lines 671–682.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `03b1068354e6bc049f2f30125f413f2b2a966817ac59e69e98bce561c87305c7`; **excerpt SHA256:** `95796df62c475859629546adb71ab326f1a99a1e1041c82d9ccc8815eb5a3259` (559 bytes).

````text
    // Stop interrupts the drain. The turn ends, so its open permission and question requests end with it.
    const run = (input: { readonly sessionID: SessionSchema.ID; readonly force: boolean }) =>
      drain(input).pipe(
        Effect.tapCause((cause) =>
          recordFailure(input.sessionID, cause).pipe(Effect.catchCause(() => Effect.void)),
        ),
        Effect.onInterrupt(() =>
          permissions
            .cancelSession(input.sessionID)
            .pipe(Effect.andThen(questions.cancelSession(input.sessionID))),
        ),
      )
````


### AEX012

**Artifacts:** `s1.core.persistence`.

**Claim/limit supported:** An unknown nonempty database is refused; fresh schema initialization uses an immediate transaction with a second existence check.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/database/migration.ts:b3d38c72425f3bae7f5730140070b251a8a4c8e7`, lines 21–48.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `3586274f5aa72a80d5645f5caea718d3c9234f69c15ca8ddbfbb8c0b5f37186d`; **excerpt SHA256:** `c1fb370d27ce41606007dde9a0bd656cfc4e11c4289c5d319cf387527d108d67` (1407 bytes).

````text
export function apply(db: Database, input: Migration[] = migrations) {
  return lock.withPermit(
    Effect.gen(function* () {
      const tables = yield* db.all<{ name: string }>(
        sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
      )
      if (tables.some((table) => table.name === "session")) return yield* applyExisting(db, input)
      if (tables.length > 0) return yield* Effect.die("Database is not empty and has no session table")
      // IMMEDIATE takes the write lock up front, so a second process (CLI and desktop share one database file)
      // waits here instead of both creating the schema; the check inside the lock sees what the first one did.
      yield* db.transaction((tx) =>
        Effect.gen(function* () {
          const created = yield* tx.get(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session'`)
          if (created) return
          yield* schema.up(tx)
          yield* tx.run(
            sql`CREATE TABLE ${sql.identifier("migration")} (id TEXT PRIMARY KEY, time_completed INTEGER NOT NULL)`,
          )
          yield* Effect.forEach(input, (migration) =>
            tx.run(
              sql`INSERT INTO ${sql.identifier("migration")} (id, time_completed) VALUES (${migration.id}, ${Date.now()})`,
            ),
          )
        }),
        { behavior: "immediate" },
      )
    }),
  )
````


### AEX013

**Artifacts:** `s1.core.persistence`.

**Claim/limit supported:** Unknown journal entries are refused; pending migrations first get VACUUM INTO backup and retention pruning.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/database/migration.ts:b3d38c72425f3bae7f5730140070b251a8a4c8e7`, lines 55–94.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `3586274f5aa72a80d5645f5caea718d3c9234f69c15ca8ddbfbb8c0b5f37186d`; **excerpt SHA256:** `0241d309fced3f5c3de127746e7302969483361f4294f5123d86fac04893603d` (1815 bytes).

````text
function applyExisting(db: Database, input: Migration[]) {
  return Effect.gen(function* () {
    const hasJournal = yield* db.get(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migration'`)
    const applied = hasJournal
      ? (yield* db.all<{ id: string }>(sql`SELECT id FROM ${sql.identifier("migration")} ORDER BY id`)).map((row) => row.id)
      : []
    const known = new Set(input.map((migration) => migration.id))
    const unknown = applied.filter((id) => !known.has(id))
    if (unknown.length > 0)
      return yield* Effect.die(
        new Error(
          `This database was created by a newer Orchestra version (it has migrations this build does not know: ${unknown.join(", ")}). Update the app before opening it.`,
        ),
      )
    if (input.every((migration) => applied.includes(migration.id))) return
    yield* backup(db, applied.at(-1) ?? "legacy")
    yield* applyOnly(db, input)
  })
}

function backup(db: Database, from: string) {
  return Effect.gen(function* () {
    const file = (yield* db.all<{ file: string | null }>(sql`SELECT file FROM pragma_database_list WHERE name = 'main'`))[0]?.file
    if (!file) return
    const target = `${file}.backup-${from}-${Date.now()}`
    yield* db.run(sql`VACUUM INTO ${target}`).pipe(
      Effect.mapError((error) => new Error(`Could not back up the database before migrating, nothing was changed: ${error}`)),
    )
    prune(file)
  })
}

function prune(file: string) {
  const prefix = `${basename(file)}.backup-`
  readdirSync(dirname(file))
    .filter((name) => name.startsWith(prefix))
    .map((name) => ({ name, time: Number(name.slice(name.lastIndexOf("-") + 1)) }))
    .sort((a, b) => b.time - a.time)
    .slice(KEEP_BACKUPS)
    .forEach((old) => rmSync(join(dirname(file), old.name), { force: true }))
````


### AEX014

**Artifacts:** `s1.core.persistence`.

**Claim/limit supported:** Every pending migration rereads its identity inside an immediate write transaction before running and journaling it.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/database/migration.ts:b3d38c72425f3bae7f5730140070b251a8a4c8e7`, lines 150–166.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `3586274f5aa72a80d5645f5caea718d3c9234f69c15ca8ddbfbb8c0b5f37186d`; **excerpt SHA256:** `af2ef65a37916294556a2247658bc65902e2bede039a0b847e29b5b7e217fe51` (881 bytes).

````text
    for (const migration of input) {
      if (completed.has(migration.id)) continue
      // The semaphore only serialises this process. IMMEDIATE makes another process (CLI and desktop share the
      // database file) wait for the write lock, and the journal is read again inside it, so a migration the other
      // process just applied is skipped instead of failing on a duplicate column.
      yield* db.transaction(
        (tx) =>
          Effect.gen(function* () {
            const done = yield* tx.get(sql`SELECT id FROM ${sql.identifier("migration")} WHERE id = ${migration.id}`)
            if (done) return
            yield* migration.up(tx)
            yield* tx.run(
              sql`INSERT INTO ${sql.identifier("migration")} (id, time_completed) VALUES (${migration.id}, ${Date.now()})`,
            )
          }),
        { behavior: "immediate" },
      )
````


### AEX015

**Artifacts:** `s1.core.persistence`, `s1.core.entry`.

**Claim/limit supported:** Database path, ordered migration identity and generated schema maintenance are user-data/maintenance contracts; history cannot be discarded.

**Authority:** `repository_normative_documentation`. **Source:** `packages/core/src/database/README.md:272a4d3d363f4871b5288d8fb879b9d9b9710d65`, lines 7–38.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `5bd3a917366391323a94bec85ace411f4d8ce1ee098a4ea062bd2f75b1fcaf83`; **excerpt SHA256:** `db62b7d84b0e3928ee3804010a04e6276f17fce37d970474f545aedc071c4191` (2079 bytes).

````text
- `database.ts` opens the database in WAL mode and picks its path. `sqlite.ts` is the driver interface, with `sqlite.bun.ts` and `sqlite.node.ts` as the two implementations.
- `migration.ts` runs the migrations listed in `migration.gen.ts`; the migration bodies are in `packages/core/src/database/migration`.
- `schema.sql.ts` holds the tables owned by this folder; other domains define their own in `sql.ts` files.

## Public entry points and consumers

- Core exports `./database/database`, `./database/migration`, `./database/migration.gen`, `./database/sqlite`, `./database/sqlite.bun` and one export per migration file.
- Consumers: every core domain with tables, the server, the CLI database commands, and `modules/maestro/coordination` and `modules/continuity`, which build on the `Database` service.

## Dependencies and boundaries

- None beyond the core layer rules.

## Assets, schemas and generated files

- `migration.gen.ts` and `schema.gen.ts` are generated by `bun run migration` in `packages/core`; `bun run migration --check` verifies them against `packages/core/schema.json`.
- `packages/core/drizzle.config.ts` globs `./src/**/*.sql.ts` and `./src/**/sql.ts`, so never move `packages/core/src/account/sql.ts`, `packages/core/src/credential/sql.ts`, `packages/core/src/share/sql.ts`, `packages/core/src/control-plane/workspace.sql.ts` or `packages/core/src/data-migration.sql.ts`.

## Persistence, identity and lifetime

- The database is `orchestra.db` under the XDG data path, or the file named by `ORCHESTRA_DB` (a relative name resolves under the data path; `:memory:` is allowed).
- The data path, `ORCHESTRA_DB`, and migration identity and order are user-data contracts: never rename or reorder a shipped migration.

## Commands

- `bun run test:ci core test/database-migration.test.ts test/database-sqlite.test.ts`
- `bun typecheck` from `packages/core`.

## Contracts and verification limits

- The generated files are path-pinned.
- The migration tests cover the real migrations on a scratch database; they do not exercise a user's existing database.
````


### AEX016

**Artifacts:** `s1.core.persistence`.

**Claim/limit supported:** Strict owner mismatch fails; exact replay identity is reconciled; conflicting replay and sequence gaps fail; ordinary foreign owner replay returns without applying.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0`, lines 319–367.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `4da815f4da0f85c45b45b6af49fdfd94889fe0e167025b8b49a6a25805217b80`; **excerpt SHA256:** `1ab9dc1bbff1f5834e04ff170942f361ce9c4357c02bd38826efc0e2e5c8d863` (2741 bytes).

````text
                          if (input?.strictOwner && row?.ownerID && row.ownerID !== input.ownerID) {
                            yield* Effect.die(
                              new InvalidDurableEventError({
                                type: event.type,
                                message: `Replay owner mismatch for aggregate ${aggregateID}: expected ${row.ownerID}, got ${input.ownerID ?? "none"}`,
                              }),
                            )
                          }
                          if (input && input.seq <= latest) {
                            const stored = yield* db
                              .select()
                              .from(EventTable)
                              .where(and(eq(EventTable.aggregate_id, aggregateID), eq(EventTable.seq, input.seq)))
                              .get()
                              .pipe(Effect.orDie)
                            if (
                              stored?.id === event.id &&
                              stored.type === versionedType(definition.type, durable.version) &&
                              isDeepStrictEqual(stored.data, encoded)
                            ) {
                              if (input.ownerID && row?.ownerID == null) {
                                yield* db
                                  .update(EventSequenceTable)
                                  .set({ owner_id: input.ownerID })
                                  .where(eq(EventSequenceTable.aggregate_id, aggregateID))
                                  .run()
                                  .pipe(Effect.orDie)
                              }
                              return
                            }
                            yield* Effect.die(
                              new InvalidDurableEventError({
                                type: event.type,
                                message: `Replay diverged at aggregate ${aggregateID} sequence ${input.seq}`,
                              }),
                            )
                          }
                          if (input && row?.ownerID && row.ownerID !== input.ownerID) {
                            return
                          }
                          const seq = input?.seq ?? latest + 1
                          if (input && seq !== latest + 1) {
                            yield* Effect.die(
                              new InvalidDurableEventError({
                                type: event.type,
                                message: `Sequence mismatch for aggregate ${aggregateID}: expected ${latest + 1}, got ${seq}`,
                              }),
                            )
                          }
````


### AEX017

**Artifacts:** `s1.core.persistence`.

**Claim/limit supported:** Projectors, optional commit hook, sequence and sealed event insertion execute before the same immediate transaction closes.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0`, lines 383–425.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `4da815f4da0f85c45b45b6af49fdfd94889fe0e167025b8b49a6a25805217b80`; **excerpt SHA256:** `a50c7fba057d40929d3f447d3415f68062ec87d8755948ff7e078a42cf9fecb7` (2358 bytes).

````text
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
                              target: EventSequenceTable.aggregate_id,
                              set: {
                                seq,
                                ...(input?.ownerID && row?.ownerID == null ? { owner_id: input.ownerID } : {}),
                              },
                            })
                            .run()
                            .pipe(Effect.orDie)
                          const predecessor = yield* db
                            .select(EventSeal.columns)
                            .from(EventTable)
                            .where(and(eq(EventTable.aggregate_id, aggregateID), eq(EventTable.seq, latest)))
                            .get()
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
                          yield* db
                            .insert(EventTable)
                            .values([{ ...record, ...EventSeal.sealRow(record, predecessor) }])
                            .run()
                            .pipe(Effect.orDie)
                          return { aggregateID, seq }
                        }),
                      { behavior: "immediate" },
                    )
````


### AEX018

**Artifacts:** `s1.core.persistence`.

**Claim/limit supported:** The implementation explicitly refuses combining persist:false with a commit hook.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0`, lines 449–455.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `4da815f4da0f85c45b45b6af49fdfd94889fe0e167025b8b49a6a25805217b80`; **excerpt SHA256:** `ad25c69fef13db609caf4715cc41668d1835ba63cf23316e3c5ab57bc56e2397` (268 bytes).

````text
          if (!persist && commit)
            return yield* Effect.die(
              new InvalidDurableEventError({
                type: event.type,
                message: "Local commit hooks cannot be combined with persist:false",
              }),
            )
````


### AEX019

**Artifacts:** `s1.core.persistence`.

**Claim/limit supported:** The durable stream subscribes to wakes before reading history and advances from stored durable events.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0`, lines 681–699.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `4da815f4da0f85c45b45b6af49fdfd94889fe0e167025b8b49a6a25805217b80`; **excerpt SHA256:** `58f5e77cb92bfa09ab33668b43a2c7920f519242421e1e2eb8d6caba622eb863` (861 bytes).

````text
      const durable = (input: { readonly aggregateID: string; readonly after?: number }): Stream.Stream<Payload> =>
        Stream.unwrap(
          Effect.gen(function* () {
            const wakes = yield* subscribeDurable(input.aggregateID)
            let sequence = input.after ?? -1
            const read = Effect.suspend(() => readAfter(input.aggregateID, sequence)).pipe(
              Effect.tap((events) =>
                Effect.sync(() => {
                  sequence = events.at(-1)?.durable?.seq ?? sequence
                }),
              ),
            )
            const historical = yield* read
            const live = Stream.fromSubscription(wakes).pipe(
              Stream.mapEffect(() => read),
              Stream.flattenIterable,
            )
            return Stream.concat(Stream.fromIterable(historical), live)
          }),
````


### AEX020

**Artifacts:** `s1.core.context`.

**Claim/limit supported:** Scoped registrations reject duplicate keys; load sorts keys and provides the current turn only to load effects.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/system-context/registry.ts:9402523a4b03cb21465da1285e2488eb7d2c11bd`, lines 38–60.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `27505e7f29016e62fc521c6d20a132003d1487c9e7099859cd7c1cab4ff1952e`; **excerpt SHA256:** `ecac098645532cea0c8a548d72ff9d96d662279194d3110946c977d16c948d62` (1058 bytes).

````text
    return Service.of({
      register: Effect.fn("SystemContextRegistry.register")(function* (entry) {
        yield* Effect.acquireRelease(
          Ref.modify(entries, (current) => {
            if (current.some((item) => item.key === entry.key)) return [false, current]
            return [true, [...current, entry]]
          }).pipe(
            Effect.flatMap((added) =>
              added ? Effect.void : Effect.die(`Duplicate system context entry key: ${entry.key}`),
            ),
            Effect.as(entry),
          ),
          (entry) => Ref.update(entries, (current) => current.filter((item) => item !== entry)),
        )
      }),
      load: Effect.fn("SystemContextRegistry.load")(function* (turn) {
        const current = (yield* Ref.get(entries)).toSorted((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
        return SystemContext.combine(
          yield* Effect.forEach(current, (entry) => entry.load, { concurrency: "unbounded" }).pipe(
            Effect.provideService(Turn, turn),
          ),
        )
      }),
````


### AEX021

**Artifacts:** `s1.core.context`.

**Claim/limit supported:** Configured project instructions must resolve inside the project while global inputs have distinct authority.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/instruction-context.ts:6ba99cade2574448b9a8008b544791581b22bb11`, lines 70–80.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `1ad05d900edbf814b3ed68200eb5f452089a112de60cf8b8eae0d1553d0896e1`; **excerpt SHA256:** `274c7c9215b2aebc3861c5731466f564d3d12becc2340e5a14c63c0e182ba3f0` (557 bytes).

````text
              : [pattern]
            return yield* Effect.forEach(targets, (target) =>
              fs.resolve(target).pipe(Effect.map((resolved) => ({ path: resolved, allowed: isGlobal || contains(project, resolved) }))),
            )
          }),
      )).flat()
      // A project instruction that escapes the project makes the whole context unavailable, so it fails closed.
      return {
        paths: Array.dedupe(resolved.filter((item) => item.allowed).map((item) => item.path)),
        escaped: resolved.some((item) => !item.allowed),
      }
````


### AEX022

**Artifacts:** `s1.core.context`.

**Claim/limit supported:** Escaped, missing discovered or missing configured instructions yield unavailable, not an empty/deleted context.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/instruction-context.ts:6ba99cade2574448b9a8008b544791581b22bb11`, lines 101–119.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `1ad05d900edbf814b3ed68200eb5f452089a112de60cf8b8eae0d1553d0896e1`; **excerpt SHA256:** `6ed6c770dcdc92fceae030443aba30d220dd080dfe04de6a05de80191f7f64e9` (864 bytes).

````text
      const configured = yield* configuredInstructions
      const paths = Array.dedupe([yield* fs.resolve(join(global.config, "AGENTS.md")), ...discovered, ...configured.paths])
      const files = yield* Effect.forEach(
        paths,
        (path) =>
          fs
            .readFileStringSafe(path)
            .pipe(
              Effect.map((content) =>
                content === undefined ? undefined : new File({ path: AbsolutePath.make(path), content }),
              ),
            ),
        { concurrency: "unbounded" },
      )
      if (configured.escaped) return SystemContext.unavailable
      if (files.some((file, index) => file === undefined && (discovered.has(paths[index]) || configured.paths.includes(paths[index]))))
        return SystemContext.unavailable
      return files.filter((file): file is File => file !== undefined)
    })
````


### AEX023

**Artifacts:** `s1.core.context`.

**Claim/limit supported:** Model history is selected by compaction and baseline sequence predicates, rather than deleting prior transcript rows.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/history.ts:60f31114138a8920e8e81a031815897568dba211`, lines 24–52.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `1989745f9737d404950f166faf43df5890ccb13df6561eeae106032dc79ae79a`; **excerpt SHA256:** `f19429a085d9a32956012f7d6fa7fb37f3648e6abea03f112e016d44b955cc34` (898 bytes).

````text
const messageRows = Effect.fnUntraced(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
  compaction: { readonly seq: number } | undefined,
  baselineSeq?: number,
) {
  const rows = yield* db
    .select()
    .from(SessionMessageTable)
    .where(
      and(
        eq(SessionMessageTable.session_id, sessionID),
        compaction
          ? or(
              gte(SessionMessageTable.seq, compaction.seq),
              baselineSeq === undefined
                ? undefined
                : and(eq(SessionMessageTable.type, "system"), gt(SessionMessageTable.seq, baselineSeq)),
            )
          : undefined,
        baselineSeq === undefined
          ? undefined
          : or(ne(SessionMessageTable.type, "system"), gt(SessionMessageTable.seq, baselineSeq)),
      ),
    )
    .orderBy(asc(SessionMessageTable.seq))
    .all()
    .pipe(Effect.orDie)
  return rows
````


### AEX024

**Artifacts:** `s1.core.context`.

**Claim/limit supported:** loadAll explicitly retains compacted history.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/history.ts:60f31114138a8920e8e81a031815897568dba211`, lines 82–85.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `1989745f9737d404950f166faf43df5890ccb13df6561eeae106032dc79ae79a`; **excerpt SHA256:** `9763c876f419c5da3ea49372375296ab0de4f33e99536e09f9549c95b91498ec` (301 bytes).

````text
/** Every stored message of the Session in order, compacted history included. */
export const loadAll = Effect.fn("SessionHistory.loadAll")(function* (db: DatabaseService, sessionID: SessionSchema.ID) {
  return yield* Effect.forEach(yield* messageRows(db, sessionID, undefined), decodeMessageRow)
})
````


### AEX025

**Artifacts:** `s1.core.context`.

**Claim/limit supported:** The exact default buffer, tail, tool-character and summary-output caps are constants.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/compaction.ts:26f09bdbf2f5908199270ad5e4d24f520dee548f`, lines 17–20.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `d6becda5c14c0679b6d5bf509a04631309518bd0ca0ba35d1b6f7e8296266d84`; **excerpt SHA256:** `7537bab717e0c477c077f7061f926e720bda8f5e982a92e60f2ba814c7191302` (136 bytes).

````text
const DEFAULT_BUFFER = 20_000
const DEFAULT_KEEP_TOKENS = 8_000
const TOOL_OUTPUT_MAX_CHARS = 2_000
const SUMMARY_OUTPUT_TOKENS = 4_096
````


### AEX026

**Artifacts:** `s1.core.context`.

**Claim/limit supported:** The compaction LLM request has no tools; provider errors and text are collected before the successful-summary branch already shown in C018.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/compaction.ts:26f09bdbf2f5908199270ad5e4d24f520dee548f`, lines 225–242.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `d6becda5c14c0679b6d5bf509a04631309518bd0ca0ba35d1b6f7e8296266d84`; **excerpt SHA256:** `14d823aa81b9a9faedff6cb11924df6dc1a22d59c1e39d687420f779a0aa7008` (646 bytes).

````text
    let failed = false
    yield* dependencies.subagentModels.assert(input.sessionID, SessionRunnerModel.reference(input.model))
    const summarized = yield* dependencies.llm
      .stream(
        LLM.request({
          model: input.model,
          http: input.request.http,
          messages: [Message.user(summaryPrompt)],
          tools: [],
          generation: { maxTokens: summaryOutput },
        }),
      )
      .pipe(
        Stream.runForEach((event) => {
          if (LLMEvent.is.providerError(event)) failed = true
          if (LLMEvent.is.textDelta(event)) chunks.push(event.text)
          return Effect.void
        }),
````


### AEX027

**Artifacts:** `s1.core.context`.

**Claim/limit supported:** The composed default transform preserves messages and afterStep does nothing; alternate behavior requires replacement.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/compaction.ts:26f09bdbf2f5908199270ad5e4d24f520dee548f`, lines 313–326.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `d6becda5c14c0679b6d5bf509a04631309518bd0ca0ba35d1b6f7e8296266d84`; **excerpt SHA256:** `8564fd4c3c607f63464add5b4f7cec8f0d0f17aa7cbc92740dace1ffa37cb44c` (539 bytes).

````text
export const node = makeLocationNode({
  service: Service,
  layer: Layer.effect(
    Service,
    Effect.gen(function* () {
      const events = yield* EventV2.Service
      const llm = yield* LLMClient.Service
      const subagentModels = yield* SessionSubagentModels.Service
      const config = yield* Config.Service
      return Service.of({
        ...make({ events, llm, subagentModels, config: yield* config.entries() }),
        transform: (input) => Effect.succeed(input.messages),
        afterStep: () => Effect.void,
      })
````


### AEX096

**Artifacts:** `s1.core.entry`, `s1.core.session-execution`, `s1.core.context`.

**Claim/limit supported:** The current repository instructions explicitly keep execution local and context ownership split across Core/domain/Session boundaries.

**Authority:** `repository_normative_documentation`. **Source:** `AGENTS.md:ef3b523b0c00aed722582b870c1919188edc4c4f`, lines 207–217.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f`; **excerpt SHA256:** `405cd0b08a53f053f88de7fd615712564267b65a3cfcdaafd0b86a7e177fb1c1` (3113 bytes).

````text
## V2 Session Core

- Keep durable prompt admission separate from model execution. `SessionV2.prompt(...)` admits one durable `session_input` row before scheduling advisory `SessionExecution.wake(sessionID)` unless `resume: false` requests admit-only behavior. The serialized runner promotes admitted inputs into visible user messages at safe boundaries.
- Reusing a Session ID adopts the existing Session. Reusing a prompt message ID reconciles an exact retry only when Session, prompt, and delivery mode match; conflicting reuse fails. Historical projected prompts lazily synthesize promoted inbox records during exact retry.
- Keep `SessionExecution` process-global and Session-ID based. Its local implementation owns the process-local Session coordinator and discovers placement through `SessionStore` plus `LocationServiceMap.get(session.location)` only when a drain starts; no layer should take a Session ID. V2 interruption targets the active process-local ownership chain for that Session; idle or missing interruption is a no-op.
- Keep `SessionRunner`, model resolution, tool registry, permissions, and filesystem Location-scoped. Omitted `Location.workspaceID` means implicit-local placement; explicit workspace identity remains reserved for future placement semantics.
- Preserve one explicit `llm.stream(request)` call per provider turn and reload projected history before durable continuation. Do not bridge through legacy `SessionPrompt.loop(...)` or delegate orchestration to an in-memory tool loop. The one exception is an agent whose `engine` names a registered `ExecutionHost` (today only `claude-code`): its single `ExecutionHost.stream(turn)` call is that provider turn, its internal tool calls persist as provider-executed events, Orchestra tools it invokes settle through the runner's `turn.execute`, and its `query()` always keeps the `claude_code` system prompt preset.
- Keep local Session drains process-local until clustering is implemented. `SessionRunCoordinator` joins explicit same-Session resumes, coalesces prompt wakeups, and allows different Sessions to run concurrently. Advisory wakes drain eligible durable inbox rows only; post-crash continuation recovery requires a separate explicit design before it may retry provider work. A drain has no durable identity or transcript boundary.
- Keep delivery vocabulary explicit. Prompts steer by default and promote at the next safe provider-turn boundary while the current drain requires continuation. An explicit `queue` input remains pending until the Session would otherwise become idle; promote one queued input at that boundary, then reevaluate continuation before promoting another. Promoting any new user input resets the selected agent's provider-turn allowance; a batch of steers resets it once.
- Keep EventV2 replay owner claims separate from clustered Session execution ownership.
- Keep the System Context algebra, registry, and built-ins in `packages/core/src/system-context`; keep Context Source producers with their observed domains, and keep Session History selection plus Context Epoch persistence Session-owned.
````

