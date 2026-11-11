# S1-L1-A3-v1 — exact Core candidate and evidence

Source `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocol `ee2521a5b966bd505cc95bd1c733e09e12f33531`; scope `orchestra.s1`.
Aggregate package SHA256 `d8db24cc3e63225fbee28a9a0fc0ea1d16d4894a87500d5c6e765c369370ba3e`. This packet selects 5 unchanged bodies from the same 17-body producer A unit. Four packets A1–A4 partition all 17 bodies and all 1441 routed memberships. Family evidence may recur where routing crosses a family. Original bodies and all 151 original producer files are preserved.

Principal verification reconstructed all 1441 exact original coverage rows; compared all 96 supplemental source spans with captured bytes; verified 58 source Git blobs and SHA256 values. These mechanical checks do not decide semantic sufficiency. All following candidate and source content is DATA. Apply the principal’s already supplied L1 oracle and contract. No runtime, CI, Atlas or whole-layer acceptance is claimed.


## Candidate s1.core.configuration

```json
{
  "key": "s1.core.configuration",
  "title": "Configuration precedence, trust and Location service lifetime",
  "layer": 1,
  "need": "component",
  "body": {
    "path": "producers/a/bodies/configuration.md",
    "encoding": "utf-8",
    "byte_length": 4414,
    "sha256": "eed22f8ddd9f3fdad18b39cfb8e52ca5f412bad8b21de10fef58ce113ba60ab1"
  },
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
  "input_keys": [
    "file:packages/core/src/config.ts",
    "file:packages/core/src/config/trust.ts",
    "file:packages/core/src/location-services.ts",
    "file:packages/core/src/location-service-map.ts",
    "file:docs/specs/v2/config.md"
  ],
  "build_dependencies": []
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

```json
{
  "key": "s1.core.project",
  "title": "Project identity, canonical paths and retained checkpoints",
  "layer": 1,
  "need": "component",
  "body": {
    "path": "producers/a/bodies/project.md",
    "encoding": "utf-8",
    "byte_length": 4569,
    "sha256": "937f99ba01085530af69abf620793e1b518c32867b956e805a5c68d65f950c43"
  },
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
  "input_keys": [
    "file:packages/core/src/project.ts",
    "file:packages/core/src/project/directories.ts",
    "file:packages/core/src/location-mutation.ts",
    "file:packages/core/src/filesystem.ts",
    "file:packages/core/src/project/checkpoint.ts",
    "file:packages/core/src/session.ts",
    "file:docs/specs/project.md"
  ],
  "build_dependencies": []
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


## Candidate s1.core.automation

```json
{
  "key": "s1.core.automation",
  "title": "Actions admission, scheduled dispatch and Board decision records",
  "layer": 1,
  "need": "flow",
  "body": {
    "path": "producers/a/bodies/automation.md",
    "encoding": "utf-8",
    "byte_length": 4377,
    "sha256": "83d483f7f56a0e3dfa7a29e89fea01b29d1b5529e36693b20a06fe9cc0db8b88"
  },
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
  "input_keys": [
    "file:packages/core/src/actions.ts",
    "file:packages/core/src/actions/contract.ts",
    "file:packages/core/src/actions/operations.ts",
    "file:packages/core/src/scheduled-task.ts",
    "file:packages/core/src/board/decision.ts"
  ],
  "build_dependencies": []
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

```json
{
  "key": "s1.core.research",
  "title": "Pinned toolkits and retained research evidence",
  "layer": 1,
  "need": "component",
  "body": {
    "path": "producers/a/bodies/research.md",
    "encoding": "utf-8",
    "byte_length": 3942,
    "sha256": "76a39828caccbb41b99fe0f7d480f4a35abac7722d5c34ddfe5c7ddd67c7c202"
  },
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
  "input_keys": [
    "file:packages/core/src/backend-toolkit/index.ts",
    "file:packages/core/src/backend-toolkit/README.md",
    "file:packages/core/src/research-toolkit/index.ts",
    "file:packages/core/src/research/ledger.ts"
  ],
  "build_dependencies": []
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


## Candidate s1.core.models

```json
{
  "key": "s1.core.models",
  "title": "Core catalog and current Session model adapter boundary",
  "layer": 1,
  "need": "component",
  "body": {
    "path": "producers/a/bodies/models.md",
    "encoding": "utf-8",
    "byte_length": 3987,
    "sha256": "4af060adbf07f6e7e759bd8574793155c5676fd87fbef77125c70cc618ffdcfe"
  },
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
  "input_keys": [
    "file:packages/core/src/provider.ts",
    "file:packages/core/src/model.ts",
    "file:packages/core/src/catalog.ts",
    "file:packages/core/src/session/runner/model.ts",
    "file:packages/core/src/aisdk.ts",
    "file:packages/core/README.md"
  ],
  "build_dependencies": []
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


### `s1.core.configuration` — `component`

Corpo congelado: `bodies/configuration.md`, SHA256 `eed22f8ddd9f3fdad18b39cfb8e52ca5f412bad8b21de10fef58ce113ba60ab1`. Validade original: `supported`.

**Gaps originais, verbatim:**

- Project configuration remains an open-time snapshot while globals refresh per entries call.
- Legacy upgrade helpers and consumer-specific policies are not exhaustively inspected.
- No Location eviction/reload or trust transition was executed.

**Inputs originais:** `file:packages/core/src/config.ts`, `file:packages/core/src/config/trust.ts`, `file:packages/core/src/location-services.ts`, `file:packages/core/src/location-service-map.ts`, `file:docs/specs/v2/config.md`.

**Explicitação nova nesta revisão:** Precedência, trust e lifetime de Location. Ler migração legada e consumidor de política/campo antes de alterar; reload/eviction/trust transition não foram exercitados.

**Uso dependente bloqueado:** Dependente de configuração de projeto live ou de aplicação universal do schema fica bloqueado até seu fluxo real ser demonstrado.


### `s1.core.project` — `component`

Corpo congelado: `bodies/project.md`, SHA256 `937f99ba01085530af69abf620793e1b518c32867b956e805a5c68d65f950c43`. Validade original: `supported`.

**Gaps originais, verbatim:**

- Git mutation, copy strategies, repository caches, snapshots/revert and formatter/LSP leaves require deeper source reads for behavior-specific changes.
- Historical project route sketches are not current API proof.
- Checkpoint semantic validity and runtime restoration were not tested.

**Inputs originais:** `file:packages/core/src/project.ts`, `file:packages/core/src/project/directories.ts`, `file:packages/core/src/location-mutation.ts`, `file:packages/core/src/filesystem.ts`, `file:packages/core/src/project/checkpoint.ts`, `file:packages/core/src/session.ts`, `file:docs/specs/project.md`.

**Explicitação nova nesta revisão:** Identidade de projeto, resolução física de caminho e checkpoint retido. Git/cópia/cache/snapshot/revert e paths específicos exigem folhas; restauração precisa de prova própria, além do digest.

**Uso dependente bloqueado:** Garantias de restauração, APIs históricas atuais ou qualquer mutação Git genérica não ficam liberadas por identidade/path comuns.


### `s1.core.automation` — `flow`

Corpo congelado: `bodies/automation.md`, SHA256 `83d483f7f56a0e3dfa7a29e89fea01b29d1b5529e36693b20a06fe9cc0db8b88`. Validade original: `supported`.

**Gaps originais, verbatim:**

- Provider-specific Actions commands/reconciliation, cadence policy and remaining Board workflows need their leaf sources when changed.
- Scheduled dispatch has an explicit revocation-to-admission race; admission is not Session completion.
- No external actions or product runtime checks executed.

**Inputs originais:** `file:packages/core/src/actions.ts`, `file:packages/core/src/actions/contract.ts`, `file:packages/core/src/actions/operations.ts`, `file:packages/core/src/scheduled-task.ts`, `file:packages/core/src/board/decision.ts`.

**Explicitação nova nesta revisão:** Estados distintos de Actions, dispatch admitido e linhagem de Board. Provider commands/readback, cadence/SQL e workflows Board restantes exigem seus leaves; a race de revogação não está resolvida.

**Uso dependente bloqueado:** Conclusão de workflow/Session, remoção de ambiguidade externa e limite repeat estrito não podem ser derivados de prepared/started/recorded.


### `s1.core.research` — `component`

Corpo congelado: `bodies/research.md`, SHA256 `76a39828caccbb41b99fe0f7d480f4a35abac7722d5c34ddfe5c7ddd67c7c202`. Validade original: `supported`.

**Gaps originais, verbatim:**

- Toolkit manifests, index adapters and individual research validators need leaf inspection for operation-specific changes.
- No engine availability or platform qualification was measured.

**Inputs originais:** `file:packages/core/src/backend-toolkit/index.ts`, `file:packages/core/src/backend-toolkit/README.md`, `file:packages/core/src/research-toolkit/index.ts`, `file:packages/core/src/research/ledger.ts`.

**Explicitação nova nesta revisão:** Acquisition/readiness e identidade de pesquisa retida. Ler manifests/adapters/validators antes de usar algoritmos específicos; no-work após erro e adapter vazio não comprovam índice.

**Uso dependente bloqueado:** Cobertura completa, qualidade de fonte, build de índice e prontidão do host permanecem bloqueados sem evidência desses mecanismos.


### `s1.core.models` — `component`

Corpo congelado: `bodies/models.md`, SHA256 `4af060adbf07f6e7e759bd8574793155c5676fd87fbef77125c70cc618ffdcfe`. Validade original: `supported`.

**Gaps originais, verbatim:**

- The native Session adapter has a narrower supported API set than the full catalog/SDK plugin surface.
- Vendor adapters, pricing accuracy and current provider availability were not exercised.

**Inputs originais:** `file:packages/core/src/provider.ts`, `file:packages/core/src/model.ts`, `file:packages/core/src/catalog.ts`, `file:packages/core/src/session/runner/model.ts`, `file:packages/core/src/aisdk.ts`, `file:packages/core/README.md`.

**Explicitação nova nesta revisão:** Catálogo versus disponibilidade declarada e adapter nativo estreito. Ler provider/vendor/transport exactos e confrontar preços/auth; protocolo live não foi executado.

**Uso dependente bloqueado:** Compatibilidade de todos os SDKs com Session, billing verificado e sucesso de provider não são liberados por presença no catálogo.



## Family dispositions relevant to this batch

The exact family counts below refer to the original whole family; the membership groups further below partition only this packet’s assigned keys.

### actions — 155 entradas

**Profundidades originais:** `decisive_source_read`=3, `grouped_validation_inventory`=72, `representative_family_boundary`=80.

**Read status original:** `not_read`=152, `semantically_read_decisive_ranges`=3.

**Rota original:** `s1.core.automation`. **Artefatos que de fato citam fontes da família:** `s1.core.automation`.

**Fontes decisivas listadas no original:** `packages/core/src/actions.ts`, `packages/core/src/actions/contract.ts`, `packages/core/src/actions/operations.ts`.

**Razões originais aplicáveis:** R001, R039, R072.

**Alcance sustentado (explicitação):** O facade e o ledger observados separam binding tardio, preparo, envio e reconciliação de resultado; isso permite localizar a autoridade de uma operação sem prometer seu resultado remoto.

**Obrigação/lacuna retida (explicitação):** Os 80 leaves de implementação não lidos incluem authoring, transportes, GitHub/GitLab, recursos e readback. A semântica do comando ou a reconciliação de um provedor exige os seus leaves; o ledger comum não os valida.


### backend-toolkit — 59 entradas

**Profundidades originais:** `decisive_source_read`=2, `grouped_generated_contract`=1, `grouped_support_contract`=4, `grouped_validation_inventory`=13, `representative_family_boundary`=39.

**Read status original:** `not_read`=57, `semantically_read_decisive_ranges`=2.

**Rota original:** `s1.core.research`. **Artefatos que de fato citam fontes da família:** `s1.core.research`.

**Fontes decisivas listadas no original:** `packages/core/src/backend-toolkit/README.md`, `packages/core/src/backend-toolkit/index.ts`.

**Razões originais aplicáveis:** R013, R022, R041, R074, R103.

**Alcance sustentado (explicitação):** O entry e README sustentam aquisição por pin, piso do host, readiness composto e ownership dos packs/gerados.

**Obrigação/lacuna retida (explicitação):** Os manifests, downloaders, adapters, pins e gerador não foram validados como um conjunto funcional. Um engine ou alteração de pin exige esses inputs e qualificação autorizada do alvo; um marcador não basta.


### board — 38 entradas

**Profundidades originais:** `decisive_source_read`=1, `grouped_validation_inventory`=13, `orientation_read`=1, `representative_family_boundary`=23.

**Read status original:** `captured_targeted_orientation_only`=1, `not_read`=36, `semantically_read_decisive_ranges`=1.

**Rota original:** `s1.core.automation`. **Artefatos que de fato citam fontes da família:** `s1.core.automation`.

**Fontes decisivas listadas no original:** `packages/core/src/board/decision.ts`.

**Razões originais aplicáveis:** R001, R026, R042, R075.

**Alcance sustentado (explicitação):** decision.ts sustenta a linhagem de substituição de respostas e o registro de outcomes. tools.ts está capturado como orientação, sem aceite amplo no congelado.

**Obrigação/lacuna retida (explicitação):** Issue/epic automation, tarefas, guards de outras operações e contratos de resposta não são consequência da linhagem de decisão. Seus 23 leaves não lidos e tools.ts continuam leituras obrigatórias para esses usos.


### config — 62 entradas

**Profundidades originais:** `decisive_source_read`=3, `grouped_validation_inventory`=18, `representative_family_boundary`=41.

**Read status original:** `not_read`=59, `semantically_read_decisive_ranges`=3.

**Rota original:** `s1.core.configuration`. **Artefatos que de fato citam fontes da família:** `s1.core.configuration`.

**Fontes decisivas listadas no original:** `docs/specs/v2/config.md`, `packages/core/src/config.ts`, `packages/core/src/config/trust.ts`.

**Razões originais aplicáveis:** R004, R044, R077.

**Alcance sustentado (explicitação):** Loader, trust e contraste com o spec sustentam precedência, snapshot de projeto, refresh global e impossibilidade de autoconfiança do projeto.

**Obrigação/lacuna retida (explicitação):** 41 implementações não lidas incluem migrações de formato e políticas/consumidores. Presença no schema não prova aplicação por consumidor; a alteração de campo/política precisa de seu caminho real.


### location — 10 entradas

**Profundidades originais:** `decisive_source_read`=3, `grouped_validation_inventory`=6, `representative_family_boundary`=1.

**Read status original:** `not_read`=7, `semantically_read_decisive_ranges`=3.

**Rota original:** `s1.core.project`. **Artefatos que de fato citam fontes da família:** `s1.core.configuration`, `s1.core.project`.

**Fontes decisivas listadas no original:** `packages/core/src/location-mutation.ts`, `packages/core/src/location-service-map.ts`, `packages/core/src/location-services.ts`.

**Razões originais aplicáveis:** R004, R012, R052, R084.

**Alcance sustentado (explicitação):** Mutation e composição/mapa de serviços sustentam a identidade física/lógica e a escolha do grafo por Location.

**Obrigação/lacuna retida (explicitação):** location.ts não foi lido. O contrato de representação ou novas variantes de Location exigem esse leaf; configuração e runtime consultam fontes desta família embora a rota de inventário principal seja project.


### project — 56 entradas

**Profundidades originais:** `decisive_source_read`=6, `grouped_validation_inventory`=24, `representative_family_boundary`=26.

**Read status original:** `not_read`=50, `semantically_read_decisive_ranges`=6.

**Rota original:** `s1.core.project`, `s1.core.runtime`. **Artefatos que de fato citam fontes da família:** `s1.core.project`, `s1.core.runtime`.

**Fontes decisivas listadas no original:** `docs/specs/project.md`, `packages/core/src/filesystem.ts`, `packages/core/src/format/format.ts`, `packages/core/src/project.ts`, `packages/core/src/project/checkpoint.ts`, `packages/core/src/project/directories.ts`.

**Razões originais aplicáveis:** R012, R014, R056, R057, R088.

**Alcance sustentado (explicitação):** Project, membership, paths, checkpoint e FileSystem sustentam identidade e acesso; format pertence também ao consumo runtime.

**Obrigação/lacuna retida (explicitação):** Git mutation, caches, estratégias de cópia, snapshots/revert e demais 26 leaves exigem leitura para alteração/operação específica. Digest de checkpoint não prova restauração ou validade semântica.


### provider — 76 entradas

**Profundidades originais:** `decisive_source_read`=4, `grouped_documentation_disposition`=2, `grouped_validation_inventory`=9, `grouped_vendor_boundary`=25, `representative_family_boundary`=36.

**Read status original:** `not_read`=72, `semantically_read_decisive_ranges`=4.

**Rota original:** `s1.core.models`. **Artefatos que de fato citam fontes da família:** `s1.core.models`.

**Fontes decisivas listadas no original:** `packages/core/src/aisdk.ts`, `packages/core/src/catalog.ts`, `packages/core/src/model.ts`, `packages/core/src/provider.ts`.

**Razões originais aplicáveis:** R010, R037, R058, R089, R101.

**Alcance sustentado (explicitação):** Catalog/model/provider/AISDK sustentam seleção e fronteira; o adapter de sessão é fonte adicional da família session.

**Obrigação/lacuna retida (explicitação):** 36 implementações, 25 bytes vendor e dois documentos não lidos não são aceitos como providers operacionais. Auth, protocolos, preços e compatibilidade vendor precisam de evidência específica; catálogo não faz ping.


### research — 71 entradas

**Profundidades originais:** `decisive_source_read`=2, `grouped_support_contract`=3, `grouped_validation_inventory`=28, `representative_family_boundary`=38.

**Read status original:** `not_read`=69, `semantically_read_decisive_ranges`=2.

**Rota original:** `s1.core.research`. **Artefatos que de fato citam fontes da família:** `s1.core.research`.

**Fontes decisivas listadas no original:** `packages/core/src/research-toolkit/index.ts`, `packages/core/src/research/ledger.ts`.

**Razões originais aplicáveis:** R013, R060, R091, R107.

**Alcance sustentado (explicitação):** ResearchToolkit e Ledger sustentam caps, adapter vazio padrão, status best effort e identidade/replay da evidência.

**Obrigação/lacuna retida (explicitação):** 38 leaves e três inputs não lidos retêm validação de documentos, índices, parsers e sandbox builds. Planejamento que falhou e virou lista vazia não comprova cobertura; conteúdo admitido não comprova sua verdade.


### scheduled-task — 11 entradas

**Profundidades originais:** `decisive_source_read`=2, `grouped_validation_inventory`=4, `representative_family_boundary`=5.

**Read status original:** `not_read`=9, `semantically_read_decisive_ranges`=2.

**Rota original:** `s1.core.automation`. **Artefatos que de fato citam fontes da família:** `s1.core.automation`, `s1.core.capability`.

**Fontes decisivas listadas no original:** `packages/core/src/scheduled-task.ts`, `packages/core/src/scheduled-task/port.ts`.

**Razões originais aplicáveis:** R001, R003, R062, R093.

**Alcance sustentado (explicitação):** Scheduler e port sustentam claims de dispatch, admissão por Session e separação do host; o lease não é ownership da execução de Session.

**Obrigação/lacuna retida (explicitação):** Cinco leaves não lidos incluem detalhes de SQL/cadência. Alterá-los exige leitura; a race revogação→admissão permanece observada e started não prova completion.


### session — 90 entradas

**Profundidades originais:** `decisive_source_read`=14, `grouped_support_contract`=1, `grouped_validation_inventory`=36, `orientation_read`=3, `representative_family_boundary`=36.

**Read status original:** `captured_targeted_orientation_only`=3, `not_read`=73, `semantically_read_decisive_ranges`=14.

**Rota original:** `s1.core.context`, `s1.core.models`, `s1.core.persistence`, `s1.core.session-admission`, `s1.core.session-execution`. **Artefatos que de fato citam fontes da família:** `s1.core.context`, `s1.core.models`, `s1.core.persistence`, `s1.core.project`, `s1.core.security`, `s1.core.session-admission`, `s1.core.session-execution`, `s1.core.tools`.

**Fontes decisivas listadas no original:** `docs/specs/v2/session.md`, `packages/core/src/session.ts`, `packages/core/src/session/compaction.ts`, `packages/core/src/session/context-epoch.ts`, `packages/core/src/session/execution.ts`, `packages/core/src/session/execution/local.ts`, `packages/core/src/session/history.ts`, `packages/core/src/session/input.ts`, `packages/core/src/session/projector.ts`, `packages/core/src/session/run-coordinator.ts`, `packages/core/src/session/runner/llm.ts`, `packages/core/src/session/runner/model.ts`, `packages/core/src/session/sql.ts`, `packages/core/src/session/store.ts`.

**Razões originais aplicáveis:** R005, R010, R011, R016, R017, R018, R019, R020, R029, R063, R064, R065, R066, R094, R108.

**Alcance sustentado (explicitação):** Quatorze leituras decisivas distribuem admissão, execução, contexto, persistência e seleção de modelo por cinco artefatos. Os usos cruzados são explícitos no mapa.

**Obrigação/lacuna retida (explicitação):** 36 leaves não lidos, três orientações e um suporte não autorizam feature census completo. Attachments, snapshot/revert, engine internals e demais operações precisam de leitura quando o requisito depende deles; não há recuperação distribuída demonstrada.



## Exact original justification dictionary used in this batch


**R001**: Captured pinned bytes and inspected cited definitions/control flow used by s1.core.automation; conclusions are limited to these source ranges and explicit normative sections.


**R003**: Captured pinned bytes and inspected cited definitions/control flow used by s1.core.capability; conclusions are limited to these source ranges and explicit normative sections.


**R004**: Captured pinned bytes and inspected cited definitions/control flow used by s1.core.configuration; conclusions are limited to these source ranges and explicit normative sections.


**R010**: Captured pinned bytes and inspected cited definitions/control flow used by s1.core.models; conclusions are limited to these source ranges and explicit normative sections.


**R012**: Captured pinned bytes and inspected cited definitions/control flow used by s1.core.project; conclusions are limited to these source ranges and explicit normative sections.


**R013**: Captured pinned bytes and inspected cited definitions/control flow used by s1.core.research; conclusions are limited to these source ranges and explicit normative sections.


**R022**: Generated artifact retained in backend-toolkit disposition; generator/owner contract, not hand-editable semantic authority. Current runtime contract is represented by s1.core.research; regeneration and byte comparison belong to authorized maintenance.


**R026**: Pinned bytes captured; orientation/header inspection does not authorize leaf-specific behavior claims. Family boundary is documented in s1.core.automation; deeper source read required before operational use of this file.


**R037**: Repository document retained with provider family; no current implementation or executed qualification is inferred from its filename/status. Consult alongside s1.core.models before relying on historical intent or a specific guide requirement.


**R039**: Substantive actions leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.automation; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.


**R041**: Substantive backend-toolkit leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.research; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.


**R042**: Substantive board leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.automation; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.


**R044**: Substantive config leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.configuration; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.


**R052**: Substantive location leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.project; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.


**R056**: Substantive project leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.project; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.


**R058**: Substantive provider leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.models; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.


**R060**: Substantive research leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.research; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.


**R062**: Substantive scheduled-task leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.automation; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.


**R063**: Substantive session leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.models; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.


**R072**: Validation/fixture population is retained under actions; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.


**R074**: Validation/fixture population is retained under backend-toolkit; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.


**R075**: Validation/fixture population is retained under board; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.


**R077**: Validation/fixture population is retained under config; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.


**R084**: Validation/fixture population is retained under location; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.


**R088**: Validation/fixture population is retained under project; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.


**R089**: Validation/fixture population is retained under provider; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.


**R091**: Validation/fixture population is retained under research; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.


**R093**: Validation/fixture population is retained under scheduled-task; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.


**R094**: Validation/fixture population is retained under session; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.


**R101**: Vendored/upstream compatibility bytes retained as distinct authority. s1.core.models establishes the host boundary; vendor internals and license/update obligations require targeted vendor inspection when touched.


**R103**: backend-toolkit support input retained under s1.core.research. Runtime text/pins/generator inputs are behavior-relevant when changed; this L1 claims only inspected owner/entry boundaries, not the unseen content.


**R107**: research support input retained under s1.core.research. Runtime text/pins/generator inputs are behavior-relevant when changed; this L1 claims only inspected owner/entry boundaries, not the unseen content.



## Complete routed membership groups

Each row below retains its original shared classification. Paths are exact; Git blob identities remain in the unchanged original population and losslessly reconstructed coverage JSON. These are dispositions, not claims that unread content was inspected.


### G001 — 3 memberships

```json
{
  "family": "actions",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.automation; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "flow",
  "proposed_artifact_key": "s1.core.automation",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/actions.ts`
- `packages/core/src/actions/contract.ts`
- `packages/core/src/actions/operations.ts`


### G002 — 59 memberships

```json
{
  "family": "actions",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under actions; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "flow",
  "proposed_artifact_key": "s1.core.automation",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/actions-resource-caches.test.ts`
- `packages/core/test/actions-resource-graphql.test.ts`
- `packages/core/test/actions-resource-runners.test.ts`
- `packages/core/test/actions-resource-schedules.test.ts`
- `packages/core/test/actions-transport-bytes.test.ts`
- `packages/core/test/actions-transport-gitlab-http.test.ts`
- `packages/core/test/actions-transport-metadata.test.ts`
- `packages/core/test/actions/authoring-base.test.ts`
- `packages/core/test/actions/authoring-outcomes.test.ts`
- `packages/core/test/actions/authoring-phases.test.ts`
- `packages/core/test/actions/authoring-schedule.test.ts`
- `packages/core/test/actions/authoring-source-proposals.test.ts`
- `packages/core/test/actions/binding.test.ts`
- `packages/core/test/actions/config-environment-reviewers.test.ts`
- `packages/core/test/actions/config-environments.test.ts`
- `packages/core/test/actions/config-policy.test.ts`
- `packages/core/test/actions/config-variable-scopes.test.ts`
- `packages/core/test/actions/config-variables.test.ts`
- `packages/core/test/actions/cursor.test.ts`
- `packages/core/test/actions/facade.test.ts`
- `packages/core/test/actions/github-command-dispatch.test.ts`
- `packages/core/test/actions/github-command-preflight.test.ts`
- `packages/core/test/actions/github-command-run-job.test.ts`
- `packages/core/test/actions/github-command-transport.test.ts`
- `packages/core/test/actions/github-read-identity.test.ts`
- `packages/core/test/actions/github-read-metadata.test.ts`
- `packages/core/test/actions/github-read-null-ranges.test.ts`
- `packages/core/test/actions/github-read-runs-jobs.test.ts`
- `packages/core/test/actions/github-read-source.test.ts`
- `packages/core/test/actions/github-read-transport.test.ts`
- `packages/core/test/actions/gitlab-command-execution.test.ts`
- `packages/core/test/actions/gitlab-command-http.test.ts`
- `packages/core/test/actions/gitlab-command-launch.test.ts`
- `packages/core/test/actions/gitlab-command-mr.test.ts`
- `packages/core/test/actions/gitlab-read-catalog.test.ts`
- `packages/core/test/actions/gitlab-read-http.test.ts`
- `packages/core/test/actions/gitlab-read-jobs.test.ts`
- `packages/core/test/actions/gitlab-read-runs.test.ts`
- `packages/core/test/actions/operations-admission.test.ts`
- `packages/core/test/actions/operations-contract.test.ts`
- `packages/core/test/actions/operations-lifetime.test.ts`
- `packages/core/test/actions/operations-migration-worker.ts`
- `packages/core/test/actions/operations-migration.test.ts`
- `packages/core/test/actions/operations-reconcile.test.ts`
- `packages/core/test/actions/operations-recovery.test.ts`
- `packages/core/test/actions/operations-restart-worker.ts`
- `packages/core/test/actions/operations-restart.test.ts`
- `packages/core/test/actions/output-artifacts.test.ts`
- `packages/core/test/actions/output-mutations.test.ts`
- `packages/core/test/actions/output-network.ts`
- `packages/core/test/actions/output-process.test.ts`
- `packages/core/test/actions/output-signed.test.ts`
- `packages/core/test/actions/output-targets.test.ts`
- `packages/core/test/actions/output-worker.ts`
- `packages/core/test/actions/readback.test.ts`
- `packages/core/test/actions/source-document.test.ts`
- `packages/core/test/actions/source-github.test.ts`
- `packages/core/test/actions/source-gitlab-boundaries.test.ts`
- `packages/core/test/actions/source-gitlab.test.ts`


### G003 — 8 memberships

```json
{
  "family": "actions",
  "kind": "test_support",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under actions; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "flow",
  "proposed_artifact_key": "s1.core.automation",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/actions/assembly-fixture.ts`
- `packages/core/test/actions/authoring-fixture.ts`
- `packages/core/test/actions/config-resource-fixture.ts`
- `packages/core/test/actions/gitlab-command-fixture.ts`
- `packages/core/test/actions/gitlab-command-http-fixture.ts`
- `packages/core/test/actions/gitlab-read-fixture.ts`
- `packages/core/test/actions/operations-fixture.ts`
- `packages/core/test/actions/output-fixture.ts`


### G004 — 5 memberships

```json
{
  "family": "actions",
  "kind": "test_fixture",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under actions; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "flow",
  "proposed_artifact_key": "s1.core.automation",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/actions/fixtures/public-test-1.yml`
- `packages/core/test/actions/fixtures/public-test-2.yml`
- `packages/core/test/actions/fixtures/source-github.yml`
- `packages/core/test/actions/fixtures/source-gitlab-inputs.yml`
- `packages/core/test/actions/fixtures/source-gitlab.yml`


### G005 — 80 memberships

```json
{
  "family": "actions",
  "kind": "implementation",
  "depth": "representative_family_boundary",
  "justification": "Substantive actions leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.automation; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.",
  "source_read_status": "not_read",
  "need": "flow",
  "proposed_artifact_key": "s1.core.automation",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/actions/authoring/base.ts`
- `packages/core/src/actions/authoring/github.ts`
- `packages/core/src/actions/authoring/gitlab.ts`
- `packages/core/src/actions/authoring/index.ts`
- `packages/core/src/actions/authoring/input.ts`
- `packages/core/src/actions/authoring/lint.ts`
- `packages/core/src/actions/authoring/remote.ts`
- `packages/core/src/actions/authoring/schedule.ts`
- `packages/core/src/actions/binding.ts`
- `packages/core/src/actions/cursor.ts`
- `packages/core/src/actions/error.ts`
- `packages/core/src/actions/github/catalog.ts`
- `packages/core/src/actions/github/commands.ts`
- `packages/core/src/actions/github/commands/common.ts`
- `packages/core/src/actions/github/commands/inputs.ts`
- `packages/core/src/actions/github/commands/job.ts`
- `packages/core/src/actions/github/commands/run.ts`
- `packages/core/src/actions/github/commands/workflow.ts`
- `packages/core/src/actions/github/index.ts`
- `packages/core/src/actions/github/jobs.ts`
- `packages/core/src/actions/github/native.ts`
- `packages/core/src/actions/github/runs.ts`
- `packages/core/src/actions/gitlab/catalog.ts`
- `packages/core/src/actions/gitlab/commands.ts`
- `packages/core/src/actions/gitlab/commands/inputs.ts`
- `packages/core/src/actions/gitlab/commands/jobs.ts`
- `packages/core/src/actions/gitlab/commands/launch.ts`
- `packages/core/src/actions/gitlab/commands/merge-request.ts`
- `packages/core/src/actions/gitlab/commands/native.ts`
- `packages/core/src/actions/gitlab/commands/runs.ts`
- `packages/core/src/actions/gitlab/commands/shared.ts`
- `packages/core/src/actions/gitlab/index.ts`
- `packages/core/src/actions/gitlab/jobs.ts`
- `packages/core/src/actions/gitlab/native.ts`
- `packages/core/src/actions/gitlab/runs.ts`
- `packages/core/src/actions/operations/outcome.ts`
- `packages/core/src/actions/operations/readback.ts`
- `packages/core/src/actions/operations/sql.ts`
- `packages/core/src/actions/operations/storage.ts`
- `packages/core/src/actions/output/artifacts.ts`
- `packages/core/src/actions/output/download.ts`
- `packages/core/src/actions/output/headers.ts`
- `packages/core/src/actions/output/index.ts`
- `packages/core/src/actions/output/mutations.ts`
- `packages/core/src/actions/output/native.ts`
- `packages/core/src/actions/output/signed.ts`
- `packages/core/src/actions/output/target.ts`
- `packages/core/src/actions/output/version.ts`
- `packages/core/src/actions/readback.ts`
- `packages/core/src/actions/resources.ts`
- `packages/core/src/actions/resources/caches.ts`
- `packages/core/src/actions/resources/config-common.ts`
- `packages/core/src/actions/resources/config-deployment-review.ts`
- `packages/core/src/actions/resources/config-environment-github.ts`
- `packages/core/src/actions/resources/config-environment-gitlab.ts`
- `packages/core/src/actions/resources/config-environment-reviewers.ts`
- `packages/core/src/actions/resources/config-environment-schema.ts`
- `packages/core/src/actions/resources/config-sodium.d.ts`
- `packages/core/src/actions/resources/config-variable-github-page.ts`
- `packages/core/src/actions/resources/environments.ts`
- `packages/core/src/actions/resources/gitlab-graphql.ts`
- `packages/core/src/actions/resources/native.ts`
- `packages/core/src/actions/resources/policy.ts`
- `packages/core/src/actions/resources/runners.ts`
- `packages/core/src/actions/resources/schedule-yaml.ts`
- `packages/core/src/actions/resources/schedules.ts`
- `packages/core/src/actions/resources/variables.ts`
- `packages/core/src/actions/source/document.ts`
- `packages/core/src/actions/source/github.ts`
- `packages/core/src/actions/source/gitlab.ts`
- `packages/core/src/actions/source/graph.ts`
- `packages/core/src/actions/state.ts`
- `packages/core/src/actions/transport.ts`
- `packages/core/src/actions/transport/cli.ts`
- `packages/core/src/actions/transport/credentials.ts`
- `packages/core/src/actions/transport/gitlab.ts`
- `packages/core/src/actions/transport/http.ts`
- `packages/core/src/actions/transport/identity.ts`
- `packages/core/src/actions/transport/process.ts`
- `packages/core/src/actions/transport/response.ts`


### G013 — 1 memberships

```json
{
  "family": "backend-toolkit",
  "kind": "documentation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.research; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "component",
  "proposed_artifact_key": "s1.core.research",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/src/backend-toolkit/README.md`


### G014 — 1 memberships

```json
{
  "family": "backend-toolkit",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.research; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "component",
  "proposed_artifact_key": "s1.core.research",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/backend-toolkit/index.ts`


### G015 — 1 memberships

```json
{
  "family": "backend-toolkit",
  "kind": "generated_output",
  "depth": "grouped_generated_contract",
  "justification": "Generated artifact retained in backend-toolkit disposition; generator/owner contract, not hand-editable semantic authority. Current runtime contract is represented by s1.core.research; regeneration and byte comparison belong to authorized maintenance.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.research",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/src/backend-toolkit/entry-skills.gen.ts`


### G016 — 4 memberships

```json
{
  "family": "backend-toolkit",
  "kind": "runtime_data_or_pin",
  "depth": "grouped_support_contract",
  "justification": "backend-toolkit support input retained under s1.core.research. Runtime text/pins/generator inputs are behavior-relevant when changed; this L1 claims only inspected owner/entry boundaries, not the unseen content.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.research",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/backend-toolkit/packs/kysely-codegen.package-lock.json`
- `packages/core/src/backend-toolkit/packs/modelina.package-lock.json`
- `packages/core/src/backend-toolkit/packs/orval.package-lock.json`
- `packages/core/src/backend-toolkit/packs/protoc-gen-es.package-lock.json`


### G017 — 13 memberships

```json
{
  "family": "backend-toolkit",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under backend-toolkit; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.research",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/backend-toolkit-acquisition.test.ts`
- `packages/core/test/backend-toolkit-cassandra.test.ts`
- `packages/core/test/backend-toolkit-cli.test.ts`
- `packages/core/test/backend-toolkit-floors.test.ts`
- `packages/core/test/backend-toolkit-hosted.test.ts`
- `packages/core/test/backend-toolkit-packs.test.ts`
- `packages/core/test/backend-toolkit-process.test.ts`
- `packages/core/test/backend-toolkit-project-version.test.ts`
- `packages/core/test/backend-toolkit-source-readiness.test.ts`
- `packages/core/test/backend-toolkit-source.test.ts`
- `packages/core/test/backend-toolkit-target.test.ts`
- `packages/core/test/backend-toolkit.test.ts`
- `packages/core/test/pinned-artifact.test.ts`


### G018 — 39 memberships

```json
{
  "family": "backend-toolkit",
  "kind": "implementation",
  "depth": "representative_family_boundary",
  "justification": "Substantive backend-toolkit leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.research; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.research",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/backend-toolkit/acquisition.ts`
- `packages/core/src/backend-toolkit/attempts.ts`
- `packages/core/src/backend-toolkit/cassandra-dialer.ts`
- `packages/core/src/backend-toolkit/cassandra-metadata.ts`
- `packages/core/src/backend-toolkit/diagnostics.ts`
- `packages/core/src/backend-toolkit/hosted.ts`
- `packages/core/src/backend-toolkit/launcher.ts`
- `packages/core/src/backend-toolkit/manifest.ts`
- `packages/core/src/backend-toolkit/packs/ast-grep.ts`
- `packages/core/src/backend-toolkit/packs/buf.ts`
- `packages/core/src/backend-toolkit/packs/controller-gen.ts`
- `packages/core/src/backend-toolkit/packs/datafusion-cli.ts`
- `packages/core/src/backend-toolkit/packs/datamodel-codegen.ts`
- `packages/core/src/backend-toolkit/packs/datamodel-codegen.wheels.ts`
- `packages/core/src/backend-toolkit/packs/gitleaks.ts`
- `packages/core/src/backend-toolkit/packs/gocqlx-schemagen.ts`
- `packages/core/src/backend-toolkit/packs/index.ts`
- `packages/core/src/backend-toolkit/packs/kiota.ts`
- `packages/core/src/backend-toolkit/packs/kopium.ts`
- `packages/core/src/backend-toolkit/packs/kubeconform.ts`
- `packages/core/src/backend-toolkit/packs/kysely-codegen.ts`
- `packages/core/src/backend-toolkit/packs/modelina.ts`
- `packages/core/src/backend-toolkit/packs/ogen.ts`
- `packages/core/src/backend-toolkit/packs/openapi-generator.ts`
- `packages/core/src/backend-toolkit/packs/orval.ts`
- `packages/core/src/backend-toolkit/packs/postgres-language-server.ts`
- `packages/core/src/backend-toolkit/packs/protoc-gen-es.ts`
- `packages/core/src/backend-toolkit/packs/sqlc.ts`
- `packages/core/src/backend-toolkit/packs/sqlglot.ts`
- `packages/core/src/backend-toolkit/packs/sqlx.ts`
- `packages/core/src/backend-toolkit/packs/squawk.ts`
- `packages/core/src/backend-toolkit/project-version.ts`
- `packages/core/src/backend-toolkit/runtimes/go.ts`
- `packages/core/src/backend-toolkit/runtimes/java.ts`
- `packages/core/src/backend-toolkit/runtimes/node.ts`
- `packages/core/src/backend-toolkit/runtimes/python.ts`
- `packages/core/src/backend-toolkit/runtimes/rust.ts`
- `packages/core/src/backend-toolkit/target.ts`
- `packages/core/src/pinned-artifact.ts`


### G019 — 1 memberships

```json
{
  "family": "board",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.automation; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "flow",
  "proposed_artifact_key": "s1.core.automation",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/board/decision.ts`


### G020 — 13 memberships

```json
{
  "family": "board",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under board; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "flow",
  "proposed_artifact_key": "s1.core.automation",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/board-budget.test.ts`
- `packages/core/test/board-ci.test.ts`
- `packages/core/test/board-conflicts.test.ts`
- `packages/core/test/board-github.test.ts`
- `packages/core/test/board-lanes.test.ts`
- `packages/core/test/board-queue-red.test.ts`
- `packages/core/test/board-queue-scoped.test.ts`
- `packages/core/test/board-queue.test.ts`
- `packages/core/test/board-snapshot.test.ts`
- `packages/core/test/board-spend.test.ts`
- `packages/core/test/board-tools.test.ts`
- `packages/core/test/board-tree.test.ts`
- `packages/core/test/board.test.ts`


### G021 — 1 memberships

```json
{
  "family": "board",
  "kind": "implementation",
  "depth": "orientation_read",
  "justification": "Pinned bytes captured; orientation/header inspection does not authorize leaf-specific behavior claims. Family boundary is documented in s1.core.automation; deeper source read required before operational use of this file.",
  "source_read_status": "captured_targeted_orientation_only",
  "need": "flow",
  "proposed_artifact_key": "s1.core.automation",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/board/tools.ts`


### G022 — 23 memberships

```json
{
  "family": "board",
  "kind": "implementation",
  "depth": "representative_family_boundary",
  "justification": "Substantive board leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.automation; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.",
  "source_read_status": "not_read",
  "need": "flow",
  "proposed_artifact_key": "s1.core.automation",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/board/board.ts`
- `packages/core/src/board/ci.ts`
- `packages/core/src/board/conflicts.ts`
- `packages/core/src/board/forecast.ts`
- `packages/core/src/board/github.ts`
- `packages/core/src/board/ledger.ts`
- `packages/core/src/board/money.ts`
- `packages/core/src/board/proof.ts`
- `packages/core/src/board/queue-drift.ts`
- `packages/core/src/board/queue-lanes.ts`
- `packages/core/src/board/queue-record.ts`
- `packages/core/src/board/queue-red.ts`
- `packages/core/src/board/queue-settle.ts`
- `packages/core/src/board/queue-shared.ts`
- `packages/core/src/board/queue.ts`
- `packages/core/src/board/record.ts`
- `packages/core/src/board/rows.ts`
- `packages/core/src/board/shared.ts`
- `packages/core/src/board/snapshot.ts`
- `packages/core/src/board/spend.ts`
- `packages/core/src/board/sql.ts`
- `packages/core/src/board/thread.ts`
- `packages/core/src/board/tree.ts`


### G029 — 1 memberships

```json
{
  "family": "config",
  "kind": "documentation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.configuration; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "component",
  "proposed_artifact_key": "s1.core.configuration",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `docs/specs/v2/config.md`


### G030 — 2 memberships

```json
{
  "family": "config",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.configuration; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "component",
  "proposed_artifact_key": "s1.core.configuration",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/config.ts`
- `packages/core/src/config/trust.ts`


### G031 — 17 memberships

```json
{
  "family": "config",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under config; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.configuration",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/behavior.test.ts`
- `packages/core/test/config/agent-file.test.ts`
- `packages/core/test/config/agent.test.ts`
- `packages/core/test/config/command.test.ts`
- `packages/core/test/config/config-global.test.ts`
- `packages/core/test/config/config.test.ts`
- `packages/core/test/config/lsp.test.ts`
- `packages/core/test/config/markdown.test.ts`
- `packages/core/test/config/plugin-file.test.ts`
- `packages/core/test/config/plugin.test.ts`
- `packages/core/test/config/provider-options.test.ts`
- `packages/core/test/config/provider-policy-migration.test.ts`
- `packages/core/test/config/provider.test.ts`
- `packages/core/test/config/skill.test.ts`
- `packages/core/test/config/tool-output-lean.test.ts`
- `packages/core/test/config/trust.test.ts`
- `packages/core/test/policy.test.ts`


### G032 — 1 memberships

```json
{
  "family": "config",
  "kind": "test_fixture",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under config; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.configuration",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/config/fixtures/plugin/directory-plugin.ts`


### G033 — 41 memberships

```json
{
  "family": "config",
  "kind": "implementation",
  "depth": "representative_family_boundary",
  "justification": "Substantive config leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.configuration; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.configuration",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/behavior.ts`
- `packages/core/src/config/agent-file.ts`
- `packages/core/src/config/agent.ts`
- `packages/core/src/config/attachments.ts`
- `packages/core/src/config/command.ts`
- `packages/core/src/config/compaction.ts`
- `packages/core/src/config/continuity.ts`
- `packages/core/src/config/experimental.ts`
- `packages/core/src/config/formatter.ts`
- `packages/core/src/config/lsp.ts`
- `packages/core/src/config/markdown.ts`
- `packages/core/src/config/plugin-file.ts`
- `packages/core/src/config/plugin.ts`
- `packages/core/src/config/plugin/agent.ts`
- `packages/core/src/config/plugin/command.ts`
- `packages/core/src/config/plugin/external.ts`
- `packages/core/src/config/plugin/provider.ts`
- `packages/core/src/config/plugin/reference.ts`
- `packages/core/src/config/plugin/skill.ts`
- `packages/core/src/config/provider-options.ts`
- `packages/core/src/config/provider.ts`
- `packages/core/src/config/reference.ts`
- `packages/core/src/config/relay.ts`
- `packages/core/src/config/research.ts`
- `packages/core/src/config/tool-output.ts`
- `packages/core/src/config/upgrade/agent.ts`
- `packages/core/src/config/upgrade/attachment.ts`
- `packages/core/src/config/upgrade/command.ts`
- `packages/core/src/config/upgrade/formatter.ts`
- `packages/core/src/config/upgrade/lsp.ts`
- `packages/core/src/config/upgrade/mcp.ts`
- `packages/core/src/config/upgrade/permission.ts`
- `packages/core/src/config/upgrade/plugin.ts`
- `packages/core/src/config/upgrade/provider.ts`
- `packages/core/src/config/upgrade/skills.ts`
- `packages/core/src/config/upgrade/source.ts`
- `packages/core/src/config/upgrade/upgrade.ts`
- `packages/core/src/config/watcher.ts`
- `packages/core/src/flag/flag.ts`
- `packages/core/src/policy.ts`
- `packages/core/src/tui-config-files.ts`


### G060 — 1 memberships

```json
{
  "family": "location",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.project; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "component",
  "proposed_artifact_key": "s1.core.project",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/location-mutation.ts`


### G061 — 2 memberships

```json
{
  "family": "location",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.configuration; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "component",
  "proposed_artifact_key": "s1.core.project",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/location-service-map.ts`
- `packages/core/src/location-services.ts`


### G062 — 6 memberships

```json
{
  "family": "location",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under location; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.project",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/location-filesystem.test.ts`
- `packages/core/test/location-hoisted-map.test.ts`
- `packages/core/test/location-layer.test.ts`
- `packages/core/test/location-mutation.test.ts`
- `packages/core/test/location-startup-globals.test.ts`
- `packages/core/test/location.test.ts`


### G063 — 1 memberships

```json
{
  "family": "location",
  "kind": "implementation",
  "depth": "representative_family_boundary",
  "justification": "Substantive location leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.project; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.project",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/location.ts`


### G090 — 1 memberships

```json
{
  "family": "project",
  "kind": "documentation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.project; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "component",
  "proposed_artifact_key": "s1.core.project",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `docs/specs/project.md`


### G091 — 4 memberships

```json
{
  "family": "project",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.project; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "component",
  "proposed_artifact_key": "s1.core.project",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/filesystem.ts`
- `packages/core/src/project.ts`
- `packages/core/src/project/checkpoint.ts`
- `packages/core/src/project/directories.ts`


### G092 — 22 memberships

```json
{
  "family": "project",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under project; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.project",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/file-mutation.test.ts`
- `packages/core/test/filesystem/filesystem.test.ts`
- `packages/core/test/filesystem/ignore.test.ts`
- `packages/core/test/filesystem/search-fff.test.ts`
- `packages/core/test/filesystem/search-ripgrep.test.ts`
- `packages/core/test/filesystem/search.test.ts`
- `packages/core/test/filesystem/watcher.test.ts`
- `packages/core/test/git-cli.test.ts`
- `packages/core/test/git.test.ts`
- `packages/core/test/guardrail.test.ts`
- `packages/core/test/patch.test.ts`
- `packages/core/test/patched-dependencies.test.ts`
- `packages/core/test/project-checkpoint-errors.test.ts`
- `packages/core/test/project-checkpoint.test.ts`
- `packages/core/test/project-copy.test.ts`
- `packages/core/test/project-directories.test.ts`
- `packages/core/test/project-root.test.ts`
- `packages/core/test/project.test.ts`
- `packages/core/test/pull-request.test.ts`
- `packages/core/test/repository-cache.test.ts`
- `packages/core/test/repository.test.ts`
- `packages/core/test/snapshot.test.ts`


### G093 — 24 memberships

```json
{
  "family": "project",
  "kind": "implementation",
  "depth": "representative_family_boundary",
  "justification": "Substantive project leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.project; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.project",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/file-mutation.ts`
- `packages/core/src/file.ts`
- `packages/core/src/filesystem/fff.bun.ts`
- `packages/core/src/filesystem/fff.node.ts`
- `packages/core/src/filesystem/ignore.ts`
- `packages/core/src/filesystem/protected.ts`
- `packages/core/src/filesystem/search.ts`
- `packages/core/src/filesystem/watcher.ts`
- `packages/core/src/fs-util.ts`
- `packages/core/src/git-cli.ts`
- `packages/core/src/git.ts`
- `packages/core/src/guardrail.ts`
- `packages/core/src/patch.ts`
- `packages/core/src/project/checkpoint.sql.ts`
- `packages/core/src/project/copy-strategies.ts`
- `packages/core/src/project/copy.ts`
- `packages/core/src/project/schema.ts`
- `packages/core/src/project/sql.ts`
- `packages/core/src/pull-request.ts`
- `packages/core/src/repository-cache.ts`
- `packages/core/src/repository.ts`
- `packages/core/src/snapshot.ts`
- `packages/core/src/vcs.ts`
- `packages/core/src/workspace.ts`


### G097 — 4 memberships

```json
{
  "family": "provider",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.models; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "component",
  "proposed_artifact_key": "s1.core.models",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/aisdk.ts`
- `packages/core/src/catalog.ts`
- `packages/core/src/model.ts`
- `packages/core/src/provider.ts`


### G098 — 2 memberships

```json
{
  "family": "provider",
  "kind": "documentation",
  "depth": "grouped_documentation_disposition",
  "justification": "Repository document retained with provider family; no current implementation or executed qualification is inferred from its filename/status. Consult alongside s1.core.models before relying on historical intent or a specific guide requirement.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.models",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `docs/specs/v2/provider-model.md`
- `docs/specs/v2/provider-policy.md`


### G099 — 9 memberships

```json
{
  "family": "provider",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under provider; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.models",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/catalog.test.ts`
- `packages/core/test/github-copilot/convert-to-copilot-messages.test.ts`
- `packages/core/test/github-copilot/copilot-chat-model.test.ts`
- `packages/core/test/github-copilot/openai-responses-language-model.test.ts`
- `packages/core/test/model.test.ts`
- `packages/core/test/models.test.ts`
- `packages/core/test/provider-groq.test.ts`
- `packages/core/test/provider-mistral.test.ts`
- `packages/core/test/provider-xai-responses.test.ts`


### G100 — 25 memberships

```json
{
  "family": "provider",
  "kind": "vendored_compatibility",
  "depth": "grouped_vendor_boundary",
  "justification": "Vendored/upstream compatibility bytes retained as distinct authority. s1.core.models establishes the host boundary; vendor internals and license/update obligations require targeted vendor inspection when touched.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.models",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/github-copilot/README.md`
- `packages/core/src/github-copilot/chat/convert-to-openai-compatible-chat-messages.ts`
- `packages/core/src/github-copilot/chat/get-response-metadata.ts`
- `packages/core/src/github-copilot/chat/map-openai-compatible-finish-reason.ts`
- `packages/core/src/github-copilot/chat/openai-compatible-api-types.ts`
- `packages/core/src/github-copilot/chat/openai-compatible-chat-language-model.ts`
- `packages/core/src/github-copilot/chat/openai-compatible-chat-options.ts`
- `packages/core/src/github-copilot/chat/openai-compatible-metadata-extractor.ts`
- `packages/core/src/github-copilot/chat/openai-compatible-prepare-tools.ts`
- `packages/core/src/github-copilot/copilot-provider.ts`
- `packages/core/src/github-copilot/openai-compatible-error.ts`
- `packages/core/src/github-copilot/responses/convert-to-openai-responses-input.ts`
- `packages/core/src/github-copilot/responses/map-openai-responses-finish-reason.ts`
- `packages/core/src/github-copilot/responses/openai-config.ts`
- `packages/core/src/github-copilot/responses/openai-error.ts`
- `packages/core/src/github-copilot/responses/openai-responses-api-types.ts`
- `packages/core/src/github-copilot/responses/openai-responses-language-model.ts`
- `packages/core/src/github-copilot/responses/openai-responses-prepare-tools.ts`
- `packages/core/src/github-copilot/responses/openai-responses-settings.ts`
- `packages/core/src/github-copilot/responses/tool/code-interpreter.ts`
- `packages/core/src/github-copilot/responses/tool/file-search.ts`
- `packages/core/src/github-copilot/responses/tool/image-generation.ts`
- `packages/core/src/github-copilot/responses/tool/local-shell.ts`
- `packages/core/src/github-copilot/responses/tool/web-search-preview.ts`
- `packages/core/src/github-copilot/responses/tool/web-search.ts`


### G101 — 36 memberships

```json
{
  "family": "provider",
  "kind": "implementation",
  "depth": "representative_family_boundary",
  "justification": "Substantive provider leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.models; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.models",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/models-dev.ts`
- `packages/core/src/plugin/models-dev.ts`
- `packages/core/src/plugin/provider.ts`
- `packages/core/src/plugin/provider/alibaba.ts`
- `packages/core/src/plugin/provider/amazon-bedrock.ts`
- `packages/core/src/plugin/provider/anthropic.ts`
- `packages/core/src/plugin/provider/azure.ts`
- `packages/core/src/plugin/provider/cerebras.ts`
- `packages/core/src/plugin/provider/cloudflare-ai-gateway.ts`
- `packages/core/src/plugin/provider/cloudflare-workers-ai.ts`
- `packages/core/src/plugin/provider/cohere.ts`
- `packages/core/src/plugin/provider/deepinfra.ts`
- `packages/core/src/plugin/provider/dynamic.ts`
- `packages/core/src/plugin/provider/gateway.ts`
- `packages/core/src/plugin/provider/github-copilot.ts`
- `packages/core/src/plugin/provider/gitlab.ts`
- `packages/core/src/plugin/provider/google-vertex.ts`
- `packages/core/src/plugin/provider/google.ts`
- `packages/core/src/plugin/provider/groq.ts`
- `packages/core/src/plugin/provider/kilo.ts`
- `packages/core/src/plugin/provider/llmgateway.ts`
- `packages/core/src/plugin/provider/mistral.ts`
- `packages/core/src/plugin/provider/nvidia.ts`
- `packages/core/src/plugin/provider/openai-compatible.ts`
- `packages/core/src/plugin/provider/openai.ts`
- `packages/core/src/plugin/provider/opencode.ts`
- `packages/core/src/plugin/provider/openrouter.ts`
- `packages/core/src/plugin/provider/perplexity.ts`
- `packages/core/src/plugin/provider/sap-ai-core.ts`
- `packages/core/src/plugin/provider/snowflake-cortex.ts`
- `packages/core/src/plugin/provider/togetherai.ts`
- `packages/core/src/plugin/provider/venice.ts`
- `packages/core/src/plugin/provider/vercel.ts`
- `packages/core/src/plugin/provider/xai.ts`
- `packages/core/src/plugin/provider/zenmux.ts`
- `packages/core/src/plugin/variant.ts`


### G106 — 2 memberships

```json
{
  "family": "research",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.research; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "component",
  "proposed_artifact_key": "s1.core.research",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/research-toolkit/index.ts`
- `packages/core/src/research/ledger.ts`


### G107 — 3 memberships

```json
{
  "family": "research",
  "kind": "runtime_data_or_pin",
  "depth": "grouped_support_contract",
  "justification": "research support input retained under s1.core.research. Runtime text/pins/generator inputs are behavior-relevant when changed; this L1 claims only inspected owner/entry boundaries, not the unseen content.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.research",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/research-toolkit/packs/scip-python.package-lock.json`
- `packages/core/src/research-toolkit/packs/scip-typescript.package-lock.json`
- `packages/core/src/research-toolkit/packs/typescript.package-lock.json`


### G108 — 28 memberships

```json
{
  "family": "research",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under research; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.research",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/code-index-query.test.ts`
- `packages/core/test/code-index-rank.test.ts`
- `packages/core/test/code-index-store.test.ts`
- `packages/core/test/research-allowance.test.ts`
- `packages/core/test/research-artifacts.test.ts`
- `packages/core/test/research-binding.test.ts`
- `packages/core/test/research-inquiry-ledger.test.ts`
- `packages/core/test/research-locate.test.ts`
- `packages/core/test/research-probe-units.test.ts`
- `packages/core/test/research-probe.test.ts`
- `packages/core/test/research-records.test.ts`
- `packages/core/test/research-search.test.ts`
- `packages/core/test/research-toolkit-callers.test.ts`
- `packages/core/test/research-toolkit-enclosing.test.ts`
- `packages/core/test/research-toolkit-liveness.test.ts`
- `packages/core/test/research-toolkit-packs.test.ts`
- `packages/core/test/research-toolkit-scip.test.ts`
- `packages/core/test/research-toolkit.test.ts`
- `packages/core/test/research-toolkit/capability.test.ts`
- `packages/core/test/research-toolkit/code-index-filter.test.ts`
- `packages/core/test/research-toolkit/code-index-go.test.ts`
- `packages/core/test/research-toolkit/code-index-python.test.ts`
- `packages/core/test/research-toolkit/code-index-resolve.test.ts`
- `packages/core/test/research-toolkit/code-index-rust.test.ts`
- `packages/core/test/research-toolkit/code-index-scip-encoding.test.ts`
- `packages/core/test/research-toolkit/code-index-structural.test.ts`
- `packages/core/test/research-toolkit/code-index-toolkit.test.ts`
- `packages/core/test/research-toolkit/code-index-tree-sitter.test.ts`


### G109 — 38 memberships

```json
{
  "family": "research",
  "kind": "implementation",
  "depth": "representative_family_boundary",
  "justification": "Substantive research leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.research; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.research",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/research-toolkit/code-index/build.ts`
- `packages/core/src/research-toolkit/code-index/callers.ts`
- `packages/core/src/research-toolkit/code-index/enclosing.ts`
- `packages/core/src/research-toolkit/code-index/extract.ts`
- `packages/core/src/research-toolkit/code-index/filter.ts`
- `packages/core/src/research-toolkit/code-index/go.ts`
- `packages/core/src/research-toolkit/code-index/python.ts`
- `packages/core/src/research-toolkit/code-index/query.ts`
- `packages/core/src/research-toolkit/code-index/rank.ts`
- `packages/core/src/research-toolkit/code-index/resolve.ts`
- `packages/core/src/research-toolkit/code-index/rust.ts`
- `packages/core/src/research-toolkit/code-index/scip.ts`
- `packages/core/src/research-toolkit/code-index/shard.ts`
- `packages/core/src/research-toolkit/code-index/store.ts`
- `packages/core/src/research-toolkit/code-index/tree-sitter.ts`
- `packages/core/src/research-toolkit/code-index/types.ts`
- `packages/core/src/research-toolkit/liveness.ts`
- `packages/core/src/research-toolkit/locate.ts`
- `packages/core/src/research-toolkit/manifest.ts`
- `packages/core/src/research-toolkit/packs/index.ts`
- `packages/core/src/research-toolkit/packs/rust-analyzer.ts`
- `packages/core/src/research-toolkit/packs/scip-go.ts`
- `packages/core/src/research-toolkit/packs/scip-python.ts`
- `packages/core/src/research-toolkit/packs/scip-typescript.ts`
- `packages/core/src/research-toolkit/packs/typescript.ts`
- `packages/core/src/research-toolkit/probe/assets.ts`
- `packages/core/src/research-toolkit/probe/run.ts`
- `packages/core/src/research-toolkit/probe/runners.ts`
- `packages/core/src/research-toolkit/probe/snapshot.ts`
- `packages/core/src/research-toolkit/probe/typecheck.ts`
- `packages/core/src/research-toolkit/probe/types.ts`
- `packages/core/src/research-toolkit/process.ts`
- `packages/core/src/research-toolkit/search.ts`
- `packages/core/src/research/allowance.ts`
- `packages/core/src/research/artifacts.ts`
- `packages/core/src/research/binding.ts`
- `packages/core/src/research/records.ts`
- `packages/core/src/research/seat-tools.ts`


### G115 — 1 memberships

```json
{
  "family": "scheduled-task",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.automation; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "flow",
  "proposed_artifact_key": "s1.core.automation",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/scheduled-task.ts`


### G116 — 1 memberships

```json
{
  "family": "scheduled-task",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.capability; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "flow",
  "proposed_artifact_key": "s1.core.automation",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/scheduled-task/port.ts`


### G117 — 4 memberships

```json
{
  "family": "scheduled-task",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under scheduled-task; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "flow",
  "proposed_artifact_key": "s1.core.automation",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/scheduled-task-capability-model.test.ts`
- `packages/core/test/scheduled-task-capability.test.ts`
- `packages/core/test/scheduled-task-model.test.ts`
- `packages/core/test/scheduled-task.test.ts`


### G118 — 5 memberships

```json
{
  "family": "scheduled-task",
  "kind": "implementation",
  "depth": "representative_family_boundary",
  "justification": "Substantive scheduled-task leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.automation; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.",
  "source_read_status": "not_read",
  "need": "flow",
  "proposed_artifact_key": "s1.core.automation",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/scheduled-task/capability-model.ts`
- `packages/core/src/scheduled-task/capability.ts`
- `packages/core/src/scheduled-task/model.ts`
- `packages/core/src/scheduled-task/shared.ts`
- `packages/core/src/scheduled-task/sql.ts`


### G121 — 1 memberships

```json
{
  "family": "session",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.models; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "component",
  "proposed_artifact_key": "s1.core.models",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/session/runner/model.ts`


### G122 — 2 memberships

```json
{
  "family": "session",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under session; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.models",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/session-runner-model.test.ts`
- `packages/core/test/session-subagent-models.test.ts`


### G123 — 1 memberships

```json
{
  "family": "session",
  "kind": "implementation",
  "depth": "representative_family_boundary",
  "justification": "Substantive session leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.models; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.models",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/session/subagent-models.ts`


# Original exact decisive source spans

# Producer A L1 exact source evidence — compact judge projection

Source commit: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Excerpts are exact UTF-8 source slices, with source Git blob identity and inclusive line spans. They are evidence for source observations and separately labeled repository intent; they are not executed tests or live qualification. Body hashes bind the artifact map below. The full source archive remains in `sources/`; `review-evidence.md` preserves all cited anchor spans.


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



# Supplemental exact source spans

## Preserved conflicts and mandatory limits

- Session rules: the runner merges Session rules (AEX009) while ordinary PermissionV2.configured returns selected-agent permissions. Both executable branches are included. No universal enforcement/ignoring claim is substituted.
- Bash: original C030 preserves the old unsandboxed wording. Added foreground/background permission→wrapper branches and the current AGENTS requirement preserve the actual conditional confinement boundary. C027/C028 preserve no-requirement/fallback cases.
- Permission rejection: original C026 and C031 retain implementation fan-out versus one-request guide wording. No source here resolves that conflict by fiat.
- Binary read: original C022 and C024 preserve the current supported-image restriction versus the earlier broad binary description.
- Native MCP bounds remain normative README authority. The transport implementation was not captured/read here; behavioral guarantees beyond the inspected policy/registration boundary remain mandatory gaps.
- 599 unread implementation leaves, seven orientation-only frozen entries and external engine/OS/provider boundaries remain outside exhaustive semantic acceptance. This revision supplies material source context; it does not certify those members or qualify runtime.


### AEX047

**Artifacts:** `s1.core.configuration`.

**Claim/limit supported:** Project documents are discovered once at Location opening and general settings apply global, direct, then .orchestra precedence; C032 supplies reverse policy order/global refresh.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/config.ts:52985a1dfc3575efca662dcb0667d81a1ab6f1de`, lines 215–245.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `bc4ce670f2214fcecab7f7a705f04aecd0f48c7cf03076c67e55421956a625e6`; **excerpt SHA256:** `17cf365dac0238a482a31562e9298afeab3817a590d428d65093eb16363b8fca` (1548 bytes).

````text
    const globalDirectory = AbsolutePath.make(global.config)
    const locationIsGlobal = path.resolve(location.directory) === path.resolve(global.config)
    // Read configuration once when this location opens. Later calls reuse these
    // values until the location is reopened.
    const discovered = locationIsGlobal
      ? []
      : yield* fs
          .up({
            targets: [".orchestra", ...names.toReversed()],
            start: location.directory,
            stop: location.project.directory,
          })
          .pipe(Effect.orDie)
    const directories = [
      globalDirectory,
      ...discovered
        .filter((item) => path.basename(item) === ".orchestra")
        .toReversed()
        .map((directory) => AbsolutePath.make(directory)),
    ]
    // A config closer to the opened directory should win over one higher up.
    // Search starts nearby, so reverse the results before applying them.
    const directPaths = discovered.filter((item) => path.basename(item) !== ".orchestra").toReversed()
    const direct = yield* Effect.forEach(directPaths, loadFile).pipe(
      Effect.orDie,
      Effect.map((configs) => configs.filter((config): config is Document => config !== undefined)),
    )
    const supplementary = yield* Effect.forEach(directories, loadDirectory).pipe(Effect.orDie)
    // Apply general settings first and more specific settings last:
    // global config, project files, then `.orchestra` files.
    const configs = [...(supplementary[0] ?? []), ...direct, ...supplementary.slice(1).flat()]
````


### AEX048

**Artifacts:** `s1.core.configuration`.

**Claim/limit supported:** Approve is parent-aware; revoke removes only the folder’s own entry, preserving any trusted parent.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/config/trust.ts:a8b068f1fdb5c01e59ad43c56b9e6241ec3dfc78`, lines 40–56.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `f00fbbf4cb98646c376ff14662e4e43d16ad64b11b439d7abccffae7723569b9`; **excerpt SHA256:** `d2eace66bb17b674247531829de1ab87fd8c3ec15d19057220330530c89f1895` (996 bytes).

````text
/** Approves a project folder in the user's global config. A folder already trusted, directly or through a parent, changes nothing. */
export const approve = Effect.fn("ConfigTrust.approve")(function* (directory: string) {
  const root = yield* canonical(directory)
  const trusted = yield* list()
  if (trusted.some((item) => within(item, root))) return
  yield* Config.updateGlobal({ trustedProjects: [...trusted, root] })
})

/** Removes a folder's own entry from the user's global config. A folder trusted only through a parent stays trusted. */
export const revoke = Effect.fn("ConfigTrust.revoke")(function* (directory: string) {
  const fs = yield* FSUtil.Service
  const root = yield* fs.resolve(directory)
  const trusted = yield* list()
  const resolved = yield* Effect.forEach(trusted, (item) => fs.resolve(item))
  const kept = trusted.filter((_, index) => resolved[index] !== root)
  if (kept.length === trusted.length) return
  yield* Config.updateGlobal({ trustedProjects: kept })
````


### AEX049

**Artifacts:** `s1.core.configuration`.

**Claim/limit supported:** Approval canonicalizes an existing absolute folder and refuses filesystem root.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/config/trust.ts:a8b068f1fdb5c01e59ad43c56b9e6241ec3dfc78`, lines 63–81.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `f00fbbf4cb98646c376ff14662e4e43d16ad64b11b439d7abccffae7723569b9`; **excerpt SHA256:** `c07cc5a986c629e4f7343b329fc5bfb380659d8e2b67f526766c01f64dc6a44f` (997 bytes).

````text
// The real path of an existing absolute folder, so a symlink and its target store as one entry.
const canonical = Effect.fnUntraced(function* (directory: string) {
  const fs = yield* FSUtil.Service
  if (!path.isAbsolute(directory))
    return yield* new DirectoryError({ message: `Project folder must be an absolute path: ${directory}` })
  if (!(yield* fs.isDir(directory)))
    return yield* new DirectoryError({ message: `Project folder does not exist: ${directory}` })
  const real = yield* fs.realPath(directory).pipe(Effect.orDie)
  if (path.parse(real).root === real)
    return yield* new DirectoryError({
      message: "The filesystem root cannot be trusted: it would approve every project on this machine.",
    })
  return real
})

// Whether `target` is `root` or inside it.
export function within(root: string, target: string) {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative.split(path.sep)[0] !== ".." && !path.isAbsolute(relative)
````


### AEX050

**Artifacts:** `s1.core.project`.

**Claim/limit supported:** Repository identity chooses remote, cache, then root commit; no repository returns the global project at filesystem root.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/project.ts:bbedbbf34cbc5b431538db37993c0cc0830fa393`, lines 125–148.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `a430e2c36fdf6544efcb36c6d13da86826083b41073a010d788e8629b9f89a63`; **excerpt SHA256:** `2631a4eb2c67a3812a88e07225a2f208574ba961099f33362eaaa00b267f429f` (1014 bytes).

````text
    const root = Effect.fnUntraced(function* (repo: Git.Repository) {
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
        directory: repo.worktree,
        vcs: { type: "git" as const, store: repo.commonDirectory },
      }
    })

    const commit = Effect.fn("Project.commit")(function* (input: { store: AbsolutePath; id: ID }) {
      yield* fs.writeFileString(path.join(input.store, "orchestra"), input.id).pipe(Effect.ignore)
    })

    return Service.of({ list, directories, resolve, commit })
````


### AEX051

**Artifacts:** `s1.core.project`.

**Claim/limit supported:** Physical resolution follows existing ancestors and bounded dangling symlinks; path authority is not just lexical normalization.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/location-mutation.ts:5c80742365c78301f296d5fe87fd8844a1efc44c`, lines 90–132.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `1eef86e372d56b4137ea0b6576b13f8eff655737d451e2446f87f97c8a02001a`; **excerpt SHA256:** `29ab036acbbfb83b2956cc67a81d1bd69e62659858a2ee37b77a1d0d0aeeff35` (1859 bytes).

````text
    // A dangling symlink is not missing: a write through it creates the file where it points.
    const followDangling = Effect.fnUntraced(function* (start: string) {
      let current = start
      for (let hops = 0; hops < 40; hops++) {
        if ((yield* notFound(fs.realPath(current))) !== undefined) return current
        const link = yield* fs.readLink(current).pipe(Effect.orElseSucceed(() => undefined))
        if (link === undefined) return current
        const parent = (yield* notFound(fs.realPath(path.dirname(current)))) ?? path.dirname(current)
        current = path.resolve(parent, link)
      }
      return current
    })

    const resolvePath = Effect.fnUntraced(function* (requested: string) {
      const absolute = yield* followDangling(requested)
      const existing = yield* notFound(fs.realPath(absolute))
      if (existing !== undefined) {
        const info = yield* fs.stat(existing)
        return {
          canonical: existing,
          type: info.type,
          directory: info.type === "Directory" ? existing : path.dirname(existing),
        } satisfies ResolvedPath
      }

      let anchor = path.dirname(absolute)
      while (true) {
        const canonical = yield* notFound(fs.realPath(anchor))
        if (canonical !== undefined) {
          const info = yield* fs.stat(canonical)
          if (info.type !== "Directory") {
            return yield* new PathError({ path: absolute, reason: "non_directory_ancestor" })
          }
          return {
            canonical: path.resolve(canonical, path.relative(anchor, absolute)),
            directory: canonical,
          } satisfies ResolvedPath
        }
        const parent = path.dirname(anchor)
        if (parent === anchor) return yield* new PathError({ path: absolute, reason: "non_directory_ancestor" })
        anchor = parent
      }
    })
````


### AEX052

**Artifacts:** `s1.core.project`.

**Claim/limit supported:** Checkpoint identity, exact retry and retained owner are checked before requiring the current Session; retries survive source Session deletion.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/project/checkpoint.ts:5972b18ab5b5bd6792447261cd65933aee379e99`, lines 99–132.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `25156c4e4b8cdb91db190f5d388c78b48e198be8511dd95c0aaef4821213531a`; **excerpt SHA256:** `ca177da0a1ce0f23b4dad4e3c1e6ea04fcbc0507177e097ceb4ddc9cc62e6dbf` (1696 bytes).

````text
        const id = `${value.forkID}:${value.attempt}`
        const hash = digest(value.payload)
        return yield* database.db.transaction(
          (tx) =>
            Effect.gen(function* () {
              const existing = yield* tx
                .select({ ...metadata, payload: ProjectCheckpointTable.payload })
                .from(ProjectCheckpointTable)
                .where(eq(ProjectCheckpointTable.id, id))
                .get()
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
              }

              // Exact retries use the retained record, even after the source Session is deleted.
              // Only insertion resolves current ownership; retries never reassign old checkpoints.
              const session = yield* tx
                .select({ projectID: SessionTable.project_id, directory: SessionTable.directory })
                .from(SessionTable)
                .where(eq(SessionTable.id, value.sessionID))
                .get()
              if (!session) return yield* new CheckpointError({ reason: "missing_session" })

              const createdAt = yield* Clock.currentTimeMillis
````


### AEX053

**Artifacts:** `s1.core.project`.

**Claim/limit supported:** Reads bind project and digest; lists enforce the default and maximum page limits.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/project/checkpoint.ts:5972b18ab5b5bd6792447261cd65933aee379e99`, lines 163–185.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `25156c4e4b8cdb91db190f5d388c78b48e198be8511dd95c0aaef4821213531a`; **excerpt SHA256:** `9ed1983086f1c06748156d8a927d51a64e6f8c62fc66f9d8e1132b48c684d54f` (1090 bytes).

````text
      read: Effect.fn("ProjectCheckpoint.read")(function* (input) {
        const row = yield* database.db
          .select({ ...metadata, payload: ProjectCheckpointTable.payload })
          .from(ProjectCheckpointTable)
          .where(and(eq(ProjectCheckpointTable.project_id, input.projectID), eq(ProjectCheckpointTable.id, input.id)))
          .get()
        if (!row) return undefined
        if (digest(row.payload) !== row.digest) return yield* new CheckpointError({ reason: "corrupt" })
        return row
      }, storageBoundary),
      list: Effect.fn("ProjectCheckpoint.list")(function* (input) {
        const offset = input.offset === undefined ? 0 : input.offset
        const limit = input.limit === undefined ? 20 : input.limit
        if (
          !Number.isSafeInteger(offset) ||
          offset < 0 ||
          offset > Number.MAX_SAFE_INTEGER - 50 ||
          !Number.isSafeInteger(limit) ||
          limit < 1 ||
          limit > 50
        )
          return yield* new CheckpointError({ reason: "invalid_input" })
        const items = yield* database.db
````


### AEX054

**Artifacts:** `s1.core.project`.

**Claim/limit supported:** Fork writes copied projections with new message IDs and negative sequence positions, rather than replaying original side effects.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session.ts:402a192a69bcad6a4b08c695657e24ff5e335f93`, lines 537–568.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `d8c38d46bc6b78ec23d7dae7525fa2ad4c4f07f3f6b5963248e0a0e96d1fbe58`; **excerpt SHA256:** `6923b7b8546ba3289b82acdfc199241fb1bb9202ae96ddd67a9ae155201955f7` (1188 bytes).

````text
            () =>
              Effect.forEach(
                kept,
                (row, index) =>
                  decode(row).pipe(
                    Effect.orDie,
                    Effect.flatMap((message) => {
                      const { id, type, ...data } = encodeMessage({
                        ...message,
                        id: SessionMessage.ID.create(),
                        ...(message.type === "synthetic" ? { sessionID: forked.id } : {}),
                      })
                      return db
                        .insert(SessionMessageTable)
                        .values({
                          id: SessionMessage.ID.make(id),
                          session_id: forked.id,
                          type,
                          seq: index - kept.length,
                          time_created: row.time_created,
                          data,
                        })
                        .run()
                    }),
                  ),
                { discard: true },
              ),
            { behavior: "immediate" },
          )
          .pipe(Effect.orDie)
        return yield* result.get(forked.id)
      }),
````


### AEX067

**Artifacts:** `s1.core.automation`.

**Claim/limit supported:** Actions binding is obtained lazily on first operation and provider read adapters are explicit.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/actions.ts:4f81df84763bd63e7680de8fd40c60b583ef68ca`, lines 49–85.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `08c5f306bc1c53b978a4254eba0fc708d9a4bfbb30fb63ead23c237f359fceef`; **excerpt SHA256:** `1da4f54a53d4aa9be81eef8aead409a461a262f0ecadc3467579c5df74eaf214` (2211 bytes).

````text
export const make = Effect.fn("Actions.make")(function* (input: {
  directory: string
  workspaceID?: string
  projectID: string
  stateDirectory: string
  transport?: ActionsContract.Transport
}) {
  const config = { ...input }
  const fs = yield* FSUtil.Service
  const proc = yield* AppProcess.Service
  const transport = config.transport ?? (yield* ActionsTransport.make({ directory: config.directory }))
  const lifetime = yield* Scope.Scope
  const database = yield* Database.Service
  const operations = yield* Effect.cached(ActionsOperations.make(config).pipe(
    Effect.provideService(Database.Service, database), Scope.provide(lifetime),
  ))
  const github = ActionsGitHubRead.make({ transport })
  const gitlab = ActionsGitLabRead.make({ transport })
  const reader = (binding: Actions.Binding) => binding.provider.kind === "github" ? github : gitlab
  const resources = ActionsResources.make({ transport, reader, directory: config.directory, proc })
  const output = (binding: Actions.Binding) => Effect.promise(() => import("./actions/output/index")).pipe(
    Effect.map(({ ActionsOutput }) => ActionsOutput.make({ transport, reader: reader(binding) })),
  )

  // Actions is Location-scoped, but a non-Git Location must still boot other services.
  // Resolve repository state only when an Actions method is requested.
  const store = () => ActionsBinding.make({ ...config, resolve: transport.resolve }).pipe(
    Effect.provideService(FSUtil.Service, fs), Effect.provideService(AppProcess.Service, proc),
  )
  const bindings: ActionsContract.Bindings = {
    list: () => store().pipe(Effect.flatMap((bindings) => bindings.list())),
    create: (input) => store().pipe(Effect.flatMap((bindings) => bindings.create(input))),
    update: (id, input) => store().pipe(Effect.flatMap((bindings) => bindings.update(id, input))),
    remove: (ref) => store().pipe(Effect.flatMap((bindings) => bindings.remove(ref))),
    get: (ref) => store().pipe(Effect.flatMap((bindings) => bindings.get(ref))),
    policy: (ref) => store().pipe(Effect.flatMap((bindings) => bindings.policy(ref))),
    updatePolicy: (ref, policy) => store().pipe(Effect.flatMap((bindings) => bindings.updatePolicy(ref, policy))),
````


### AEX068

**Artifacts:** `s1.core.automation`.

**Claim/limit supported:** Prepare strictly decodes intent, verifies binding revision, reconciles exact retry and refuses capacity/unknown-outcome overflow before insertion.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/actions/operations.ts:83c0b9e03b063bd59bc2d30317f7de85cbb99ee4`, lines 60–96.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `f4180bfeabef99c0eaddace3f1da7242fb8dacd7d63fb948b84cc014f59a89d4`; **excerpt SHA256:** `5b4852195e0aac76b1d9419ba682571f3cc21302168a01c8342ea2feb8eab4a5` (2711 bytes).

````text
  const prepare: ActionsContract.Operations["prepare"] = Effect.fn("ActionsOperations.prepare")(function* (bindingInput, raw) {
    const binding = { ...bindingInput, provider: { ...bindingInput.provider } }
    const invalid = validate(binding)
    if (invalid) return yield* Effect.fail(invalid)
    // Strict decoding rejects extras before encoding elides optional undefined
    // keys. Decode the encoded DTO again to preserve branded identity types.
    const decoded = yield* Schema.decodeUnknownEffect(Schema.toType(Actions.OperationIntent), { onExcessProperty: "error" })(raw).pipe(
      Effect.map((value) => Schema.decodeUnknownSync(Actions.OperationIntent)(Schema.encodeSync(Actions.OperationIntent)(value))),
      Effect.mapError(() => error("invalid_input", "Actions operation intent is invalid")),
    )
    if (decoded.binding.id !== binding.id || decoded.binding.revision !== binding.revision)
      return yield* Effect.fail(error("binding_stale", "Actions operation intent binding changed"))
    // Maintenance commits independently so a refused expired retry still leaves
    // a compact, non-executable tombstone rather than rolling cleanup back.
    yield* safe(database.db.transaction((tx) => Clock.currentTimeMillis.pipe(
      Effect.flatMap((now) => sweep(tx, now)),
    ), { behavior: "immediate" }))
    return yield* safe(database.db.transaction((tx) => Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      const existing = yield* tx.select().from(ActionsOperationTable).where(and(
        eq(ActionsOperationTable.location_key, location), eq(ActionsOperationTable.binding_id, binding.id),
        eq(ActionsOperationTable.client_id, decoded.clientID),
      )).get()
      if (existing) {
        if (!matches(existing, binding) || !equivalent(intent(existing), decoded))
          return yield* Effect.fail(error("intent_conflict", "Actions logical intent was already bound to another command", existing.id))
        const expired = unavailable(existing, now)
        if (expired) return yield* Effect.fail(expired)
        return receipt(existing)
      }
      const ledger = yield* tx.select({ total: count() }).from(ActionsOperationTable).get()
      if (!ledger || ledger.total >= LEDGER_LIMIT)
        return yield* Effect.fail(error("maintenance_required", "Actions admission ledger requires maintenance"))
      const unknown = yield* tx.select({ total: count() }).from(ActionsOperationTable)
        .where(eq(ActionsOperationTable.state, "outcome_unknown")).get()
      if (!unknown || unknown.total >= UNKNOWN_LIMIT)
        return yield* Effect.fail(error("maintenance_required", "Actions unknown outcome storage requires maintenance"))
````


### AEX069

**Artifacts:** `s1.core.automation`.

**Claim/limit supported:** Stale takeover checks exact prior ownership/claim and distinguishes admitted exact retry from void unadmitted dispatch.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/scheduled-task.ts:0a89bbdc576091ca01445e45e1500ed4008898a9`, lines 272–301.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `8c204bd55a8cf8fd1dbddc232f5dfa84b9190822d074ccc72e85594e457af12b`; **excerpt SHA256:** `75232658d0ea0c69eed303e78e05e65b7a85943fe3d5de13c110f143f9c1242f` (1593 bytes).

````text
    // Only a claim whose prompt was admitted happened. It is finished with the exact retry a client would send,
    // which reconciles the admitted prompt and wakes the Session. A claim that never reached admission is void,
    // and its slot is planned again.
    const takeOver = Effect.fn("ScheduledTask.takeOver")(function* (stale: RunRow, now: number) {
      const claimed = yield* immediate(
        Effect.gen(function* () {
          const run = yield* db.select().from(ScheduledTaskRunTable).where(eq(ScheduledTaskRunTable.id, stale.id)).get()
          if (run?.state !== "running" || run.owner !== stale.owner || run.time_claimed !== stale.time_claimed) return
          const task = yield* find(run.task_id)
          if (!task || !run.message_id || run.prompt === null) return
          yield* db
            .update(ScheduledTaskRunTable)
            .set({ owner: lease, time_claimed: now })
            .where(eq(ScheduledTaskRunTable.id, run.id))
            .run()
          return {
            id: run.id,
            task,
            sessionID: run.session_id,
            messageID: run.message_id,
            prompt: run.prompt,
          }
        }),
      )
      if (!claimed) return
      const admitted = yield* SessionInput.find(db, claimed.messageID)
      if (!admitted) return yield* settle(claimed, { type: "void" })
      const retried = yield* dispatch(claimed, true)
      if (retried.type !== "started") yield* Effect.logWarning("Scheduled run retry failed", retried)
      yield* settle(claimed, { type: "started", sessionID: admitted.sessionID })
````


### AEX070

**Artifacts:** `s1.core.automation`.

**Claim/limit supported:** Changing a decision updates standing lineage, while recording an outcome logs a stated reason rather than independently verifying work.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/board/decision.ts:4b219f5b62517b2c4f9749a1a99e6257cfeff167`, lines 90–128.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `7fdd5f2d2d0dfa0414b70b870e4ff75ca62fe7af36c62c90e583663af8833b43`; **excerpt SHA256:** `8acecc7a9f686e37e6a78c98fdcb6ffca32da830f4f6221ddb721978e4002a65` (1817 bytes).

````text
  const activity = yield* log(tx, {
    project: project.id,
    issue: old.issue_id,
    actor: "owner",
    action: "question.answer",
    before: { id: old.question_id, answer_option: old.chosen, answer_text: old.chosen_text },
    after: { id: old.question_id, status: "answered", answer_option: input.option, answer_text: text, decision: next },
  })
  return { result: { activity }, changed: changed(project.id, activity, old.issue_id) }
})

export const outcome = Effect.fnUntraced(function* (tx: Tx, input: Board.DecisionOutcomeInput) {
  const project = yield* loadProject(tx, input.project)
  const row = yield* tx
    .select()
    .from(BoardDecisionTable)
    .where(
      and(
        eq(BoardDecisionTable.project_id, project.id),
        isNull(BoardDecisionTable.overturned_by_id),
        or(eq(BoardDecisionTable.id, input.id as Board.DecisionID), eq(BoardDecisionTable.question_id, input.id as Board.QuestionID)),
      ),
    )
    .orderBy(desc(BoardDecisionTable.answered_at))
    .get()
  if (!row) return yield* new NotFoundError({ message: `No standing decision ${input.id} on ${project.key}.` })
  if (row.outcome === input.outcome) return yield* new RefusedError({ message: "That outcome is already recorded." })
  const now = yield* Clock.currentTimeMillis
  yield* tx.update(BoardDecisionTable).set({ outcome: input.outcome, outcome_at: now }).where(eq(BoardDecisionTable.id, row.id)).run()
  const activity = yield* log(tx, {
    project: project.id,
    issue: row.issue_id,
    actor: "maestro",
    action: "question.answer",
    reason: input.reason,
    before: { id: row.question_id, outcome: row.outcome },
    after: { id: row.question_id, decision: row.id, outcome: input.outcome },
  })
  return { result: { activity }, changed: changed(project.id, activity, row.issue_id) }
````


### AEX071

**Artifacts:** `s1.core.research`.

**Claim/limit supported:** Dependency and host-floor checks precede acquisition; cross-target prefetch is not host execution.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/backend-toolkit/index.ts:e5c8e61d202f8a79a5b967d5abc467a97b58f4a3`, lines 180–198.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `d420651f26050d31c924b078a59fff12081be914cb8cb94685aad720a9275d9a`; **excerpt SHA256:** `f136d164ba697d4df434dc6ef26fe79012c6292f92f21bd201a0221954c0cff0` (1457 bytes).

````text
const request = Effect.fnUntraced(function* (id: string, target: TargetId, host: boolean) {
  const root = yield* Root
  const manifest = yield* Manifest
  const runtimes = yield* Runtimes
  const machine = yield* Machine
  const dependencies = dependencyOrder(manifest, id)
  if (typeof dependencies === "string") return yield* new NotReady({ reason: dependencies })
  const engine = manifest[id]
  const unsupported = "runtime" in engine ? engine.unsupported?.[target] : undefined
  if (unsupported) return yield* new NotReady({ reason: `unsupported-target:${unsupported}` })
  // Before any fetch. A cross-target prefetch (`host` false) is never executed here, so it has no floor to meet.
  const floor = host ? belowFloor(manifest, runtimes, id, target, machine) : undefined
  if (floor) return yield* new NotReady({ reason: `unsupported-target:${id}:${floor}` })
  const directory = path.join(root, "engines", id, `${engine.version}-${target}`)
  const cause = yield* attempts.once(requestKey(directory, host), Effect.gen(function* () {
    yield* Effect.forEach([...dependencies, id], (dependency) => acquire(root, manifest[dependency], runtimes, target, host), { discard: true })
  }))
  if (cause !== undefined) return yield* new NotReady({ reason: cause.startsWith("toolkit-not-ready:") || cause.startsWith("unsupported-target:") ? cause : `toolkit-not-ready:failed:${id}:${cause}` })
  return { executable: executable(engine, directory, target) }
````


### AEX072

**Artifacts:** `s1.core.research`.

**Claim/limit supported:** Config can lower the owner byte caps, never raise them.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/research-toolkit/index.ts:a6e7b3bf6dd0ba44d0f0de5cac3eebe5c9f36095`, lines 52–67.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `9c1bfe5c5a7bc0c8d4d1f835e61031e0cca06b9ed6567415d9d04ff6e84b599c`; **excerpt SHA256:** `8eea3de748bac0964e70c4971f3a78e6ed0119a8c28b58799ce3db7bfaf2af9c` (688 bytes).

````text
/** `Caps` from config `research.limits.*`: each configured value lowers its owner cap and never raises it (D2). */
export function caps(limits?: {
  readonly indexer_bytes?: number
  readonly probe_bytes?: number
  readonly scratch_bytes?: number
  readonly index_bytes?: number
}): typeof Limits {
  const lower = (cap: number, value?: number) => Math.min(cap, value ?? cap)
  return Object.freeze({
    ...Limits,
    indexerBytes: lower(Limits.indexerBytes, limits?.indexer_bytes),
    probeBytes: lower(Limits.probeBytes, limits?.probe_bytes),
    scratchBytes: lower(Limits.scratchBytes, limits?.scratch_bytes),
    indexBytes: lower(Limits.indexBytes, limits?.index_bytes),
  })
}
````


### AEX073

**Artifacts:** `s1.core.research`.

**Claim/limit supported:** Status record writes are best effort; a failed rename/write can lose status and is not evidence of a successful build.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/research-toolkit/index.ts:a6e7b3bf6dd0ba44d0f0de5cac3eebe5c9f36095`, lines 281–300.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `9c1bfe5c5a7bc0c8d4d1f835e61031e0cca06b9ed6567415d9d04ff6e84b599c`; **excerpt SHA256:** `947c7770a0802af915f03dd0fe1db7cdb54e9538a601137209dc5ae59e051c10` (987 bytes).

````text
/** Replace one shard's record (none clears it) through a temp file and one rename; a failed write loses only status. */
const record = (root: string, worktree: string, shard: string, entry?: { readonly status: "building" | "skipped"; readonly reason?: string }) =>
  read(root, worktree).pipe(
    Effect.flatMap((records) =>
      Effect.tryPromise({
        try: async () => {
          const file = recordFile(root, worktree)
          const next = Object.fromEntries([
            ...Object.entries(records).filter(([id]) => id !== shard),
            ...(entry ? [[shard, { ...entry, at: Date.now() }]] : []),
          ])
          await mkdir(path.dirname(file), { recursive: true })
          const temp = `${file}.${randomUUID()}`
          await writeFile(temp, JSON.stringify(next))
          await rename(temp, file).catch(() => rm(temp, { force: true }))
        },
        catch: () => new ShardFailed({ reason: "record-write" }),
      }).pipe(Effect.ignore),
    ),
  )
````


### AEX074

**Artifacts:** `s1.core.research`.

**Claim/limit supported:** Research identity uses canonical object order, operation tuple and execution-scoped event ID.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/research/ledger.ts:6b6ca2931b6aa8bdd2156b47fc13005aab93dcbf`, lines 32–51.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `67e07368ea820ec0c1cb791d601a10acdfa2e9259605a1bec4f556f6bb121839`; **excerpt SHA256:** `c5564eab1a9cda93c47064a3237bbce052337a7b0d950df6990e1c21ecebe651` (990 bytes).

````text
/** Canonical JSON ignores object insertion order and absent optional fields, preserving array order. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value !== null && typeof value === "object") return `{${Object.entries(value)
    .filter((entry) => entry[1] !== undefined).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
    .map((entry) => `${JSON.stringify(entry[0])}:${canonical(entry[1])}`).join(",")}}`
  return JSON.stringify(value)
}

export function digest(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex")
}

export function operation(context: Tool.Context, action: string) {
  return digest(canonical([context.sessionID, context.assistantMessageID, context.toolCallID, action]))
}

export function eventID(binding: Research.Binding, key: string) {
  return EventV2.ID.make(`evt_research_${digest(canonical([binding.executionSessionID, key]))}`)
}
````


### AEX075

**Artifacts:** `s1.core.research`.

**Claim/limit supported:** Retained research events are filtered/decoded and scope/receipt mismatches are refused.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/research/ledger.ts:6b6ca2931b6aa8bdd2156b47fc13005aab93dcbf`, lines 62–84.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `67e07368ea820ec0c1cb791d601a10acdfa2e9259605a1bec4f556f6bb121839`; **excerpt SHA256:** `b2f146c726ed7837f75884bb5496219064da31d486f59876ba2a9c47ea20009b` (1726 bytes).

````text
export const entries = Effect.fn("ResearchLedger.entries")(function* (binding: Research.Binding, explicitID?: string, executionOnly = false) {
  const database = yield* Database.Service
  const rows = yield* database.db.select().from(EventTable).where(and(
    inArray(EventTable.type, types),
    sql`json_extract(${EventTable.data}, '$.binding.projectID') = ${binding.projectID}`,
    executionOnly ? eq(EventTable.aggregate_id, binding.executionSessionID) : undefined,
    explicitID === undefined ? eq(EventTable.aggregate_id, binding.executionSessionID) : sql`(
      json_extract(${EventTable.data}, '$.record.id') = ${explicitID} OR
      json_extract(${EventTable.data}, '$.receipt.ref.id') = ${explicitID} OR
      json_extract(${EventTable.data}, '$.receipt.ref.artifact.id') = ${explicitID} OR
      json_extract(${EventTable.data}, '$.receipt.artifact.id') = ${explicitID})`,
  )).orderBy(asc(EventTable.seq)).all().pipe(Effect.orDie)
  return yield* Effect.forEach(rows, (row) => Schema.decodeUnknownEffect(Entry)({
    id: row.id, type: row.type.slice(0, -2), data: row.data,
    durable: { aggregateID: row.aggregate_id, seq: row.seq, version: 1 },
  }).pipe(
    Effect.mapError(() => new Research.Error({ code: "source_unavailable", message: "Invalid retained research event" })),
    Effect.flatMap((entry) => entry.data.sessionID !== row.aggregate_id || entry.data.binding.executionSessionID !== row.aggregate_id ||
      (entry.type !== "research.record.committed" && !isDeepStrictEqual(entry.data.receipt.binding, entry.data.binding))
      ? Effect.fail(new Research.Error({ code: "source_unavailable", message: "Research event scope does not match admission" }))
      : Effect.succeed(entry)),
  ))
})
````


### AEX088

**Artifacts:** `s1.core.models`.

**Claim/limit supported:** Native routes strip API keys from body settings; unknown explicit variants fail rather than silently changing selection.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/runner/model.ts:188abc7053f9a02b8dd84ce7bdc30e0e7c001b3b`, lines 147–188.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `25c8400ee9162fb798aafa3cf2c540b7364c097e669a7b361489e5cf1610db5f`; **excerpt SHA256:** `37929a967f0f573bf2973a9cc84ee1f0998de36bea2e9116c5d3303d98241610` (1452 bytes).

````text
const withDefaults = (model: ModelV2.Info, route: AnyRoute, generation: GenerationOptions) => {
  const body = model.request.body
  const httpBody = Object.hasOwn(body, "apiKey")
    ? Object.fromEntries(Object.entries(body).filter(([key]) => key !== "apiKey"))
    : body
  return route.with({
    provider: model.providerID,
    endpoint: model.api.url === undefined ? undefined : { baseURL: model.api.url },
    headers: model.request.headers,
    http: { body: httpBody },
    limits: {
      context: model.limit.context,
      ...(model.limit.input === undefined ? {} : { input: model.limit.input }),
      output: model.limit.output,
    },
    generation,
  })
}

const withVariant = (
  model: ModelV2.Info,
  variantID: ModelV2.VariantID | undefined,
): Effect.Effect<ModelV2.Info, VariantUnavailableError> => {
  const id = variantID === "default" || variantID === undefined ? model.request.variant : variantID
  const variant = model.variants.find((item) => item.id === id)
  if (!variant && variantID !== undefined && variantID !== "default")
    return Effect.fail(
      new VariantUnavailableError({
        providerID: model.providerID,
        modelID: model.id,
        variant: variantID,
      }),
    )
  return Effect.succeed(
    variant
      ? produce(model, (draft) => {
          Object.assign(draft.request.headers, variant.headers)
          Object.assign(draft.request.body, variant.body)
        })
      : model,
  )
}
````


### AEX089

**Artifacts:** `s1.core.models`.

**Claim/limit supported:** The actual adapter branches accept a narrower API set than arbitrary SDK/catalog entries and return UnsupportedApiError otherwise.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/runner/model.ts:188abc7053f9a02b8dd84ce7bdc30e0e7c001b3b`, lines 193–245.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `25c8400ee9162fb798aafa3cf2c540b7364c097e669a7b361489e5cf1610db5f`; **excerpt SHA256:** `03c9a05685a4a958e901aa4ae1d0c40ce6306a33a46fb5f9cd6f3c6cef5ed1dd` (2318 bytes).

````text
export const fromCatalogModel = (
  model: ModelV2.Info,
  credential?: Credential.Value,
): Effect.Effect<Model, UnsupportedApiError | ModelUnavailableError> => {
  // Native V2 api.settings.generation uses canonical LLM options, not http.body.
  // Strict decoding rejects misspellings/coercion; absence keeps empty defaults.
  const generation = Schema.decodeUnknownOption(GenerationOptions, { onExcessProperty: "error" })(
    model.api.settings?.generation === undefined ? {} : model.api.settings.generation,
  )
  if (Option.isNone(generation))
    return Effect.fail(
      new ModelUnavailableError({
        providerID: model.providerID,
        modelID: model.id,
        cause: "Invalid api.settings.generation: expected canonical GenerationOptions",
      }),
    )
  const resolved =
    credential?.type !== "key" || credential.metadata === undefined
      ? model
      : produce(model, (draft) => {
          Object.assign(draft.request.body, credential.metadata)
        })
  const key = apiKey(resolved, credential)
  if (resolved.api.type === "aisdk" && resolved.api.package === "@ai-sdk/openai") {
    return Effect.succeed(
      withDefaults(resolved, OpenAIResponses.route, generation.value)
        .with({ auth: key === undefined ? Auth.none : Auth.bearer(key) })
        .model({ id: resolved.api.id }),
    ).pipe(Effect.map((value) => withPrices(withReference(value, model), model)))
  }
  if (resolved.api.type === "aisdk" && resolved.api.package === "@ai-sdk/anthropic") {
    return Effect.succeed(
      withDefaults(resolved, AnthropicMessages.route, generation.value)
        .with({ auth: key === undefined ? Auth.none : Auth.header("x-api-key", key) })
        .model({ id: resolved.api.id }),
    ).pipe(Effect.map((value) => withPrices(withReference(value, model), model)))
  }
  if (openAICompatible(resolved)) {
    return Effect.succeed(
      withDefaults(resolved, OpenAICompatibleChat.route, generation.value)
        .with({ auth: key === undefined ? Auth.none : Auth.bearer(key) })
        .model({ id: resolved.api.id }),
    ).pipe(Effect.map((value) => withPrices(withReference(value, model), model)))
  }
  return Effect.fail(
    new UnsupportedApiError({
      providerID: resolved.providerID,
      modelID: resolved.id,
      api: apiName(resolved),
    }),
  )
}
````


### AEX095

**Artifacts:** `s1.core.entry`, `s1.core.models`.

**Claim/limit supported:** The repository owner inventory places provider/vendor, utilities and data contracts under Core; this is navigation/ownership intent, not acceptance of every member.

**Authority:** `repository_normative_documentation`. **Source:** `packages/core/README.md:742921238462659e1a5a314f2e0238102c6e9f3a`, lines 54–88.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `e74885e18e96297fd931989505937559ecbdce42c595cf8846411d4f0c4de324`; **excerpt SHA256:** `ecd892d2c5f5d48c4388e6b41bda4339921a4e300c33058212e1fd8be7e94f67` (4223 bytes).

````text
- Owner: core platform maintainer
- Public entry: explicit `exports` in package.json
- Legacy and compatibility: `packages/core/src/github-copilot` (vendored)
- Enforced by `bun run check:boundaries`; exceptions in `script/boundary-ledger.json`.

### Domains
- `atlas` — platform — `src/atlas.ts` — packages/core
- `session` — platform — `src/session/`, `src/session.ts`, `src/session-process.ts` — packages/core
- `agent` — platform — `src/agent/`, `src/agent.ts` — packages/core
- `system-context` — platform — `src/system-context/` — packages/core
- `tool` — platform — `src/tool/`, `src/tool-output-store.ts`, `src/mcp/`, `src/mcp.ts`, `src/lsp/`, `src/lsp.ts` — packages/core
- `tool-safety` — platform — `src/tool-safety.ts`, `src/tool-safety-*`, `src/sandbox-parents.ts`, `src/sandbox-project-config.ts` — packages/core
- `relay` — platform — `src/relay.ts`, `src/relay-*` — packages/core
- `config` — platform — `src/config/`, `src/config.ts`, `src/behavior.ts`, `src/policy.ts`, `src/flag/`, `src/tui-config-files.ts` — packages/core
- `permission` — platform — `src/permission/`, `src/permission.ts`, `src/question.ts` — packages/core
- `location` — platform — `src/location.ts`, `src/location-services.ts`, `src/location-service-map.ts`, `src/location-mutation.ts` — packages/core
- `project` — platform — `src/project/`, `src/project.ts`, `src/filesystem/`, `src/filesystem.ts`, `src/fs-util.ts`, `src/file.ts`, `src/file-mutation.ts`, `src/git.ts`, `src/git-cli.ts`, `src/vcs.ts`, `src/repository.ts`, `src/repository-cache.ts`, `src/snapshot.ts`, `src/patch.ts`, `src/pull-request.ts`, `src/guardrail.ts`, `src/workspace.ts`, `src/format.ts`, `src/format/` — packages/core
- `database` — platform — `src/database/`, `src/data-migration.sql.ts` — packages/core
- `event` — platform — `src/event/`, `src/event.ts`, `src/public-event-manifest.ts` — packages/core
- `runtime` — platform — `src/effect/`, `src/global.ts`, `src/host.ts`, `src/host/`, `src/id/`, `src/installation/`, `src/observability/`, `src/observability.ts`, `src/background-job.ts`, `src/state.ts`, `src/schema.ts`, `src/v2-schema.ts` — packages/core
- `process` — platform — `src/process.ts`, `src/child-process-common.ts`, `src/cross-spawn-command.ts`, `src/cross-spawn-spawner.ts`, `src/shell.ts`, `src/pty/`, `src/pty.ts`, `src/tcp-proxy.ts`, `src/omni.ts`, `src/omni-*`, `src/output-inspector.ts`, `src/artifact-native-windows.ts`, `src/artifact-native-windows.rs`, `src/ripgrep/`, `src/ripgrep.ts` — packages/core
- `provider` — platform — `src/provider.ts`, `src/model.ts`, `src/models-dev.ts`, `src/aisdk.ts`, `src/catalog.ts`, `src/github-copilot/`, `src/plugin/provider/`, `src/plugin/provider.ts`, `src/plugin/models-dev.ts`, `src/plugin/variant.ts` — packages/core
- `plugin-host` — platform — `src/plugin/`, `src/plugin.ts` — packages/core
- `identity` — platform — `src/claude-code-account.ts`, `src/account/`, `src/account.ts`, `src/credential/`, `src/credential.ts`, `src/oauth/`, `src/integration/`, `src/integration.ts`, `src/share/` — packages/core
- `instruction` — platform — `src/skill/`, `src/skill.ts`, `src/packaged-skills.ts`, `src/instruction-context.ts`, `src/command.ts`, `src/slash-command.ts`, `src/reference/`, `src/reference.ts` — packages/core
- `research` — platform — `src/research/`, `src/research-toolkit/` — packages/core
- `backend-toolkit` — platform — `src/backend-toolkit/`, `src/pinned-artifact.ts` — packs move to modules/backend-toolkit after the 70-C' cut
- `control-plane` — platform — `src/control-plane/` — packages/core
- `capability` — platform — `src/capability/`, `src/toolkit/` — packages/core
- `board` — platform — `src/board/` — packages/core
- `rag-studio` — platform — `src/rag-studio/` — packages/core
- `scheduled-task` — platform — `src/scheduled-task/`, `src/scheduled-task.ts` — packages/core
- `actions` — platform — `src/actions/`, `src/actions.ts` — packages/core
- `util` — platform — `src/util/`, `src/image/`, `src/image.ts`, `src/npm.ts`, `src/npm-config.ts` — packages/core
<!-- module-contract:end -->
````

