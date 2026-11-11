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

