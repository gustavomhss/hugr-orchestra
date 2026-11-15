# B-v3 — domain need disposition for review

Source pin `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocol pin `ee2521a5b966bd505cc95bd1c733e09e12f33531`; scope `orchestra.s1`; L1 only.

This is the B3 review projection over the exact 190 historical G30/G39/G52/G57 members: 94 Schema, 44 Protocol, 51 Server and SDK tool.ts. The four historical groups and every member record remain verbatim in semantic-disposition.json; new read state is appended separately. Twenty-four domains connect the relevant layers. All 190 captured modules were read in full. This is source evidence awaiting judgment, not a semantic PASS.

The present mandatory need is purpose, observable contract and local ownership/delegation. The named conditional gaps block broader claims only; they are not a postponed current L1 reading. F02–F08 remain preserved in conditional-needs.json. The other 282 assigned entries retain their historical fixture/generated/test/documentation/support disposition.

Protocol was read by `/root/producer_b/protocol_triage`, Server by `/root/producer_c`, and Schema/SDK by `/root/producer_b`. The original native requests/responses, literal-read receipts and extensive observations remain in delegates/ and support/. Those additional notes are not all promoted to claims in this packet.

| Domain | Members | Current L1 source disposition |
| --- | ---: | --- |
| D01 — Actions provider automation | 25 | Full literal reads; bounded contract/owner claims supplied; unjudged |
| D02 — Agent, behavior, skill and prompt instructions | 16 | Full literal reads; bounded contract/owner claims supplied; unjudged |
| D03 — Permission and question requests | 7 | Full literal reads; bounded contract/owner claims supplied; unjudged |
| D04 — Session projections and invalidations | 4 | Full literal reads; bounded contract/owner claims supplied; unjudged |
| D05 — Project, workspace and copy context | 15 | Full literal reads; bounded contract/owner claims supplied; unjudged |
| D06 — Files, references, Git and pull requests | 13 | Full literal reads; bounded contract/owner claims supplied; unjudged |
| D07 — PTY records and tickets | 2 | Full literal reads; bounded contract/owner claims supplied; unjudged |
| D08 — Providers, credentials and integration attempts | 11 | Full literal reads; bounded contract/owner claims supplied; unjudged |
| D09 — MCP, LSP and formatting | 12 | Full literal reads; bounded contract/owner claims supplied; unjudged |
| D10 — Global configuration and project trust | 4 | Full literal reads; bounded contract/owner claims supplied; unjudged |
| D11 — Capability authority and management | 14 | Full literal reads; bounded contract/owner claims supplied; unjudged |
| D12 — Atlas product surface | 6 | Full literal reads; bounded contract/owner claims supplied; unjudged |
| D13 — Board owner and planning surface | 4 | Full literal reads; bounded contract/owner claims supplied; unjudged |
| D14 — Relay workflow, hooks and external ledgers | 16 | Full literal reads; bounded contract/owner claims supplied; unjudged |
| D15 — Maestro product attribution and events | 4 | Full literal reads; bounded contract/owner claims supplied; unjudged |
| D16 — Meeting records and owner review | 3 | Full literal reads; bounded contract/owner claims supplied; unjudged |
| D17 — Scheduled prompt admission | 3 | Full literal reads; bounded contract/owner claims supplied; unjudged |
| D18 — Lean output and numeric provenance | 6 | Full literal reads; bounded contract/owner claims supplied; unjudged |
| D19 — RAG retrieval and task-bound research | 8 | Full literal reads; bounded contract/owner claims supplied; unjudged |
| D20 — Guardrail contract and engine adapter | 3 | Full literal reads; bounded contract/owner claims supplied; unjudged |
| D21 — Catalog exports, notifications, health and upgrade | 10 | Full literal reads; bounded contract/owner claims supplied; unjudged |
| D22 — HTTP origin and static UI boundary | 2 | Full literal reads; bounded contract/owner claims supplied; unjudged |
| D23 — ELF byte admission helper | 1 | Full literal reads; bounded contract/owner claims supplied; unjudged |
| D24 — SDK Core tool facade | 1 | Full literal reads; bounded contract/owner claims supplied; unjudged |

## Domain contracts, exact members and limits

### D01 — Actions provider automation

Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

Schema separates binding/revision, prepared operation identity and execution input; Protocol declares the provider-command API and shared Actions errors; Server delegates to Actions.Service through a binding reference and common error projection. A binding reference does not itself prove provider authorization or an executed remote effect.

**Body relationship:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`. These are same-package context links, not accepted build predecessors.

**Depth:** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

**Conditional missing evidence / blocked claim:** Provider authorization, atomic operation/reconcile semantics and remote results require Actions/Core and relevant runtime evidence. Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/actions-binding.ts` | CRUD de binding e acesso a capabilities/policy; create/update recebem BindingInput, policy usa Policy/PolicyState. | P01 |
| `packages/protocol/src/groups/actions-common.ts` | Define erro público ActionsError 400, bindingID, revision positiva e limites/attempt opcionais positivos. | P02 |
| `packages/protocol/src/groups/actions-job.ts` | retry/play/cancel/erase usam jobID não vazio e retornam CommandExecution; comandos de cancel/erase são GitLabCommand. | P03 |
| `packages/protocol/src/groups/actions-operation.ts` | prepare recebe OperationIntent; get/reconcile usam OperationID e devolvem Operation. A fonte separa admissão/readback de writes específicos. | P04 |
| `packages/protocol/src/groups/actions-pipeline.ts` | merge-request usa mergeRequestID e MergeRequestCommand; trigger usa TriggerPipelineCommand; ambos devolvem CommandExecution. | P05 |
| `packages/protocol/src/groups/actions-resource.ts` | list combina ResourceListInput e limit positivo; command restringe action a create/update/delete/play/pause/keep/clear e recebe ResourceCommand. | P06 |
| `packages/protocol/src/groups/actions-run.ts` | List/get/jobs são readback paginado; retry/cancel/forceCancel/remove/approveFork/rename têm comandos com schemas específicos de provedor. | P07 |
| `packages/protocol/src/groups/actions-source.ts` | Validação de source/draft retorna Graph, com onExcessProperty:error nos DTOs de validação; branch/write/review são actions admitidas. | P08 |
| `packages/protocol/src/groups/actions-workflow.ts` | List/source/graph são leitura; dispatch/state aceitam DispatchCommand/WorkflowStateCommand e retornam CommandExecution. | P09 |
| `packages/schema/src/actions.ts` | Actions six-module public barrel. | Q047 |
| `packages/schema/src/actions/command.ts` | Strict provider commands and request-only secret-bearing output. | Q051 |
| `packages/schema/src/actions/identity.ts` | Binding revision/reference and closed refusal/send-disposition vocabulary. | Q048 |
| `packages/schema/src/actions/operation.ts` | Prepared identity/preconditions and distinct execution payload. | Q049 |
| `packages/schema/src/actions/resource.ts` | Resource metadata/redaction ownership and transfer contract. | Q050 |
| `packages/schema/src/actions/run.ts` | Provider run/job state projections and pagination. | Q052 |
| `packages/schema/src/actions/workflow.ts` | Workflow/source binding and partial/unresolved graph states. | Q053 |
| `packages/server/src/handlers/actions-binding.ts` | Adapt binding CRUD, capability inspection, and binding-policy operations to Actions.Service. | G57-E008, G57-E009 |
| `packages/server/src/handlers/actions-common.ts` | Share the binding reference and typed error projection used by Actions handlers. | G57-E011 |
| `packages/server/src/handlers/actions-job.ts` | Delegate retry/play/cancel/erase commands for a job through Actions.execute. | G57-E012 |
| `packages/server/src/handlers/actions-operation.ts` | Prepare, fetch, and reconcile Actions operations. | G57-E013 |
| `packages/server/src/handlers/actions-pipeline.ts` | Select and forward merge-request and trigger pipeline operations. | G57-E014 |
| `packages/server/src/handlers/actions-resource.ts` | Translate resource listing filters and generic resource commands into Actions calls. | G57-E015 |
| `packages/server/src/handlers/actions-run.ts` | Delegate run queries, job listing, retry and run lifecycle commands to Actions. | G57-E017 |
| `packages/server/src/handlers/actions-source.ts` | Expose source base and draft/source validation, and translate source mutation commands. | G57-E020 |
| `packages/server/src/handlers/actions-workflow.ts` | Delegate workflow listing/source/graph/dispatch and enabled-state operations. | G57-E022 |

### D02 — Agent, behavior, skill and prompt instructions

Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

These contracts separate agent/skill/command configuration and host-rendered reminders from executing turns. Agent-file revisions and behavior replacement are public inputs; Server resolves the Location-owned catalog/services and delegates writes, with local name/conflict/error handling. SDK or HTTP exposure is not evidence that a tool/model ran.

**Body relationship:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`. These are same-package context links, not accepted build predecessors.

**Depth:** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

**Conditional missing evidence / blocked claim:** File containment, effective permission policy, reload convergence and provider/tool execution need their implementation or execution evidence. Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/agent.ts` | Detail anuncia tools, skills e engines/status; file get/update usam AgentFile e update declara 409 por revision stale. | P10 |
| `packages/protocol/src/groups/behavior.ts` | PUT recebe SetInput, devolve array Info e declara substituição do contexto de comportamento do projeto. | P12 |
| `packages/protocol/src/groups/command.ts` | GET retorna catálogo Command.Info na localização; execução de comando não pertence a este grupo. | P17 |
| `packages/protocol/src/groups/skill.ts` | List e save/remove para catálogo/arquivos de projeto; save declara globals/built-ins/Atlas-governed read-only, com InvalidRequest/Conflict. | P42 |
| `packages/schema/src/agent-file.ts` | Agent markdown input/read revision and ordered permission update contract. | Q001 |
| `packages/schema/src/agent.ts` | Agent engine/model/request/mode/toolkit/permission representation. | Q002 |
| `packages/schema/src/behavior.ts` | Stable behavior ID and ordered project instruction replacement. | Q003 |
| `packages/schema/src/command.ts` | Command template/catalog shape, not a command executor. | Q004 |
| `packages/schema/src/llm.ts` | Provider metadata and text/file tool-content union. | Q005 |
| `packages/schema/src/prompt-context.ts` | Host-owned reminders explicitly do not override permissions/tools. | Q006 |
| `packages/schema/src/session-subagent-models.ts` | Delegated provider/model allowlist or inherited policy. | Q008 |
| `packages/schema/src/skill.ts` | Skill metadata/save revision intent and local/URL/embedded source identity. | Q007 |
| `packages/server/src/handlers/agent.ts` | List/annotate agents, present materialized tools and available skills, and edit configuration agent files. | G57-E024, G57-E026, G57-E027 |
| `packages/server/src/handlers/behavior.ts` | Set the Location behavior selection through BehaviorV2. | G57-E031 |
| `packages/server/src/handlers/command.ts` | Expose the slash-command catalog. | G57-E040 |
| `packages/server/src/handlers/skill.ts` | List/save/remove skill files through the Location skill service. | G57-E120, G57-E121, G57-E122 |

### D03 — Permission and question requests

Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

Schema defines request/reply/saved-rule forms and Protocol distinguishes Location and Session endpoints. Server permission get/reply and question reply/reject inspect the requested record and compare its sessionID before delegation; absent/foreign records map to the corresponding not-found error. These local checks do not establish every Core lifecycle invariant.

**Body relationship:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`, `s1.api.session-contract`, `s1.api.stream-contract`. These are same-package context links, not accepted build predecessors.

**Depth:** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

**Conditional missing evidence / blocked claim:** Decision policy, saved-entry authorization, persistence and concurrent lifecycle behavior remain Core/runtime prerequisites. Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/permission.ts` | Queries de requests/saved e recursos de sessão; middleware placement separa endpoints prévios e session endpoints; reply é NoContent. | P30 |
| `packages/protocol/src/groups/question.ts` | Pending list por Location; list/reply/reject por sessionID e requestID com middleware de sessão e erros404. | P34 |
| `packages/schema/src/permission-saved.ts` | Saved project/action/resource permission record. | Q010 |
| `packages/schema/src/permission.ts` | Request/reply plus modern and historical Session permission shapes. | Q009 |
| `packages/schema/src/question.ts` | Session request identity and ordered answer payload. | Q011 |
| `packages/server/src/handlers/permission.ts` | Expose pending/saved permission requests and session-specific ask/read/reply routes. | G57-E067, G57-E069 |
| `packages/server/src/handlers/question.ts` | List questions and answer/reject a question belonging to the path Session. | G57-E079, G57-E081 |

### D04 — Session projections and invalidations

Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

Revert, activity, todo and compaction modules describe session-bound records/notifications. They do not perform revert or activity computation; todo status/priority remain String fields. Existing session/stream bodies cover admission and delivery boundaries separately.

**Body relationship:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`, `s1.api.session-contract`, `s1.api.stream-contract`. These are same-package context links, not accepted build predecessors.

**Depth:** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

**Conditional missing evidence / blocked claim:** Revert effects, activity calculation, compaction and todo persistence require the owning service before an implementation claim. Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/schema/src/revert.ts` | Revert anchor and optional snapshot/diff/file list. | Q012 |
| `packages/schema/src/session-activity.ts` | Activity projection with period, timestamps and truncated status. | Q013 |
| `packages/schema/src/session-compaction-event.ts` | session.compacted notification. | Q014 |
| `packages/schema/src/session-todo.ts` | Todo fields use String status/priority and publish session-linked updates. | Q015 |

### D05 — Project, workspace and copy context

Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

Schema supplies identity and project/workspace/copy shapes; Protocol separates global project/catalog calls from Location query context. Server location registration, project initialization and copy creation delegate to the corresponding services; copy creation supplies project/source context from the route and Location. ID/path representations are not complete filesystem authority.

**Body relationship:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`. These are same-package context links, not accepted build predecessors.

**Depth:** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

**Conditional missing evidence / blocked claim:** Isolation, copy destruction/force behavior, Git effects, uniqueness under every execution and workspace lifecycle require their owners and pertinent runtime evidence. Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/location.ts` | Query directory/workspace opcionais deepObject; Info direto e paths.home no endpoint de caminhos. | P26 |
| `packages/protocol/src/groups/project-copy.ts` | Create omite projectID/sourceDirectory do payload e usa params/contexto; Remove omite projectID; erro400 inclui forceRequired opcional. | P31 |
| `packages/protocol/src/groups/project.ts` | Catálogo global e mutation por Project.ID; initGit é operação com LocationQuery e resposta nullable dentro do envelope. | P32 |
| `packages/schema/src/identifier.ts` | Ascending/descending identifier construction with timestamp/counter/random input. | Q016 |
| `packages/schema/src/project-copy.ts` | Named strategy with create/remove copy context. | Q022 |
| `packages/schema/src/project-directories.ts` | Project directory invalidation. | Q021 |
| `packages/schema/src/project-id.ts` | Project brand and global sentinel. | Q017 |
| `packages/schema/src/project.ts` | Repository project Info and project.updated event. | Q020 |
| `packages/schema/src/workspace-event.ts` | Workspace ready/failed/connectivity status events. | Q023 |
| `packages/schema/src/workspace-id.ts` | Workspace prefix validator and constructor. | Q018 |
| `packages/schema/src/workspace.ts` | Workspace identity/event facade. | Q019 |
| `packages/schema/src/worktree-event.ts` | Worktree ready/failed notifications. | Q024 |
| `packages/server/src/handlers/location.ts` | Describe a requested Location and make its project known before Sessions exist. | G57-E058, G57-E059 |
| `packages/server/src/handlers/project-copy.ts` | Delegate copy lifecycle and supply optional LLM-generated copy names. | G57-E072 |
| `packages/server/src/handlers/project.ts` | List/update projects and initialize a Git project before Location services can exist. | G57-E075, G57-E076 |

### D06 — Files, references, Git and pull requests

Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

The Schema modules represent file entries/diffs, reference sources, VCS answers and host-CLI pull requests. Protocol declares query/input/error shapes; Server delegates reference/Git/PR work to Location services and maps the PR host error. No file access or remote PR was performed by this production.

**Body relationship:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`. These are same-package context links, not accepted build predecessors.

**Depth:** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

**Conditional missing evidence / blocked claim:** Path confinement, host credentials, Git correctness and remote writes remain dependent implementation/runtime claims. Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/pull-request.ts` | List/create com erro400 kind/message e contexto host; declaração atribui efeitos ao gh/glab autenticado do servidor. | P33 |
| `packages/protocol/src/groups/reference.ts` | Somente catálogo Reference.Info na localização; não fornece acesso de conteúdo. | P36 |
| `packages/protocol/src/groups/vcs.ts` | Info/status/diff working\|branch, métricas entre millis e atividade de sessão por período. | P44 |
| `packages/schema/src/file-diff.ts` | File delta counts/status and optional patch. | Q025 |
| `packages/schema/src/filesystem-watcher.ts` | Watcher add/change/unlink notification. | Q026 |
| `packages/schema/src/filesystem.ts` | Relative file/directory entry and search match DTOs. | Q027 |
| `packages/schema/src/pull-request.ts` | Host-CLI remote PR contract with typed refusal kinds. | Q031 |
| `packages/schema/src/reference.ts` | Local absolute-path or Git repository/branch reference source. | Q030 |
| `packages/schema/src/vcs-event.ts` | Branch change notification. | Q029 |
| `packages/schema/src/vcs.ts` | Branch/diff/apply/activity responses; no Git operation. | Q028 |
| `packages/server/src/handlers/pull-request.ts` | List/create pull requests using the Location PullRequest service. | G57-E077, G57-E078 |
| `packages/server/src/handlers/reference.ts` | Expose the reference catalog. | G57-E092 |
| `packages/server/src/handlers/vcs.ts` | Expose Location Git status/diff/activity and scoped Session activity. | G57-E127, G57-E129 |

### D07 — PTY records and tickets

Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

PTY and PtyTicket supply process/event/create-update and ticket-expiry DTOs. The existing server-edge and stream-contract bodies supply the separately inspected ticket-consumption/raw-upgrade and queue boundaries; a ticket string DTO does not itself authorize access.

**Body relationship:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`, `s1.api.session-contract`, `s1.api.stream-contract`. These are same-package context links, not accepted build predecessors.

**Depth:** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

**Conditional missing evidence / blocked claim:** Actual subprocess behavior, ticket lifecycle, resize and backpressure guarantees require their relevant runtime evidence. Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/schema/src/pty-ticket.ts` | Connection ticket and expiry DTO; no authorization logic. | Q033 |
| `packages/schema/src/pty.ts` | PTY process Info, lifecycle events and create/update inputs. | Q032 |

### D08 — Providers, credentials and integration attempts

Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

Provider/API kinds, secret-bearing Credential.Value and safe Connection references are distinct shapes. Integration describes methods/attempts, and Server delegates credentials/OAuth to Integration.Service. Integration-scoped attempt routes invoke an ownership comparison; generic attempt routes are separate delegation paths. No authentication success or secure-storage guarantee is inferred from a DTO.

**Body relationship:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`. These are same-package context links, not accepted build predecessors.

**Depth:** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

**Conditional missing evidence / blocked claim:** Generic attempt policy, encryption/storage, OAuth resource cleanup and real external authentication remain Core/runtime claims. Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/credential.ts` | PATCH altera somente label; DELETE remove por Credential.ID; os dois retornam NoContent e declaram ConflictError. | P19 |
| `packages/protocol/src/groups/integration.ts` | Discovery de métodos, connect por key/OAuth e polling/completion/cancel; endpoints OAuth por integrationID preservam compatibilidade. | P24 |
| `packages/schema/src/catalog.ts` | Catalog invalidation event. | Q039 |
| `packages/schema/src/connection.ts` | Safe credential-reference/environment-name projection. | Q038 |
| `packages/schema/src/credential.ts` | OAuth/API-key secret-bearing value representation. | Q035 |
| `packages/schema/src/integration-id.ts` | Integration and method identity brands. | Q036 |
| `packages/schema/src/integration.ts` | Authentication method/attempt lifecycle DTOs. | Q037 |
| `packages/schema/src/models-dev.ts` | Models catalog refresh event. | Q040 |
| `packages/schema/src/provider.ts` | AISDK/Native API distinction and request/info shape. | Q034 |
| `packages/server/src/handlers/credential.ts` | Rename or remove a credential through Integration.connection. | G57-E043, G57-E044 |
| `packages/server/src/handlers/integration.ts` | Manage integration discovery, key/OAuth connections, attempts and disconnect. | G57-E051, G57-E054, G57-E055 |

### D09 — MCP, LSP and formatting

Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

MCP local/remote configuration, status/resource/auth projections and LSP/formatter status are public contracts. Server delegates these operations through Location services and maps MCP missing/config/auth failures. A masking comment or reduced Entry DTO is not proof that every debug payload was sanitized or a connection succeeded.

**Body relationship:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`. These are same-package context links, not accepted build predecessors.

**Depth:** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

**Conditional missing evidence / blocked claim:** Trust enforcement, process/transport isolation, secret masking and OAuth/reconnect behavior need the service implementation or execution evidence. Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/formatter.ts` | Status dos formatters configurados/disponíveis por Location, Array(Formatter.Status). | P20 |
| `packages/protocol/src/groups/lsp.ts` | Status de language servers conectados na Location, Array(Lsp.Status). | P27 |
| `packages/protocol/src/groups/mcp.ts` | Discovery/status/config/resources/tools, mutations de config/conexão e OAuth; descrições distinguem redaction e env refs não resolvidas. | P28 |
| `packages/schema/src/config-mcp.ts` | Local versus remote MCP config with optional auth/timeouts. | Q041 |
| `packages/schema/src/formatter.ts` | Formatter enabled/extensions status. | Q046 |
| `packages/schema/src/lsp-event.ts` | LSP invalidation notification. | Q045 |
| `packages/schema/src/lsp.ts` | Language server root/name and connected/error status. | Q044 |
| `packages/schema/src/mcp-event.ts` | MCP tools/status/browser failure notifications. | Q043 |
| `packages/schema/src/mcp.ts` | MCP connection-state union, debug intent and endpoint-only Entry. | Q042 |
| `packages/server/src/handlers/formatter.ts` | Expose formatter status. | G57-E045 |
| `packages/server/src/handlers/lsp.ts` | Expose LSP status. | G57-E060 |
| `packages/server/src/handlers/mcp.ts` | Adapt MCP catalog/configuration/connections and OAuth actions. | G57-E061, G57-E064 |

### D10 — Global configuration and project trust

Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

Config and Trust are process-global contracts rather than independent per-request Location documents. Server captures global services, writes/changes trust and visits open Locations to reload/apply it; the visible per-Location failure handling is ignored. A successful response therefore does not establish convergence of every open Location.

**Body relationship:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`. These are same-package context links, not accepted build predecessors.

**Depth:** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

**Conditional missing evidence / blocked claim:** Complete reload/trust convergence and downstream MCP behavior remain blocked until independently supported. Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/config.ts` | Patch global de modelo/shell/engines/providers/permissions; listas substituem as anteriores; update é NoContent. | P18 |
| `packages/protocol/src/groups/trust.ts` | Lista/aprova/revoga trust global com directory String; não é Location-scoped; realpath e herança são descrições de behavior. | P43 |
| `packages/server/src/handlers/config.ts` | Read/update global configuration and request reload of agents and catalog in open Locations. | G57-E041, G57-E042 |
| `packages/server/src/handlers/trust.ts` | Read/approve/revoke global project trust and reapply it to MCP in open Locations. | G57-E123, G57-E124, G57-E125 |

### D11 — Capability authority and management

Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

Capability references identify data while trusted authority belongs to Core. Receipts/outcome statuses, bounded FailureDetail and operator projections are distinct. Protocol applies CapabilityAuthorization and management request contracts; Server builds host-owned operator/verifier facades and delegates request/placement-bound management. Content-ticket code carries stored authority, session and artifact revision through a process-local random-token map.

**Body relationship:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`. These are same-package context links, not accepted build predecessors.

**Depth:** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

**Conditional missing evidence / blocked claim:** Revocation/placement correctness, provider identity, persistent idempotency and end-to-end artifact policy require the actual Core/runtime evidence. The stored token is not described as an HMAC construction. Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/capability-connections.ts` | Páginas 1..32, mutations com idempotency-key, input de setup/binding/target e receipts diretos; aplica CapabilityAuthorization. | P14 |
| `packages/protocol/src/groups/capability-operator.ts` | Inspeciona requestID/principal/origin/scopeHash; origin é configured-auth/desktop/cli/sdk; aplica CapabilityAuthorization. | P15 |
| `packages/protocol/src/groups/capability-schedules.ts` | Ações list/pause/resume/run/remove de schedules de agente; create/edit ficam no tool do agente; mutations exigem key. | P16 |
| `packages/schema/src/capability-artifact-management.ts` | Operator artifact metadata, cursor/page bounds and share/pin input. | Q055 |
| `packages/schema/src/capability-management.ts` | Versioned management refs, live pages, bindings and reused receipts. | Q056 |
| `packages/schema/src/capability-schedule-management.ts` | Richer schedule cadence plus operator/session projection and manual-run receipt. | Q057 |
| `packages/schema/src/capability-setup.ts` | Key/bearer setup and explicit verified/credential-only outcome. | Q058 |
| `packages/schema/src/capability.ts` | Core authority boundary, opaque outcome receipt, symmetric UTF-8 JSON detail limit. | Q054 |
| `packages/server/src/capability-content-ticket.ts` | Issue and verify short-lived opaque content references bound to the minting authority, session, and artifact revision. | G57-E001, G57-E003 |
| `packages/server/src/capability-verification.ts` | Supply the capability connection verifier as a host-constructed Effect service. | G57-E004 |
| `packages/server/src/handlers/capability-connections.ts` | Construct connection setup/binding/management adapters and expose their operations. | G57-E034, G57-E035, G57-E036 |
| `packages/server/src/handlers/capability-operator.ts` | Inspect the authenticated operator binding for the current placement. | G57-E037 |
| `packages/server/src/handlers/capability-schedules.ts` | Operate agent capability schedules through CapabilityScheduleOperator. | G57-E038, G57-E039 |
| `packages/server/src/operator.ts` | Expose the host operator facade and create its default Core authority scope. | G57-E130 |

### D12 — Atlas product surface

Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

Atlas knowledge anchors and empty/present screen/review/setup results are transport contracts. Knowledge target identity is not Task execution authorization. Protocol exposes the Location surface; Server opens the Atlas application with project/Location context and maps its unavailable error. These product routes and result labels do not constitute Genesis review or runtime receipts.

**Body relationship:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`. These are same-package context links, not accepted build predecessors.

**Depth:** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

**Conditional missing evidence / blocked claim:** Atlas CAS, semantic governance, source realization, mine/index/import and actual review results remain their own authority/runtime obligations. Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/atlas.ts` | Fachada da tela/store Atlas: distingue draft, emit, review, decisões e setup/index/mine; todos os endpoints declaram ServiceUnavailable. | P11 |
| `packages/schema/src/atlas-knowledge.ts` | Proposed knowledge target and host anchor with explicit canonical field order. | Q059 |
| `packages/schema/src/atlas-review.ts` | Atlas review/decision wire forms; not review authority for this campaign. | Q060 |
| `packages/schema/src/atlas-screen.ts` | Empty/present Atlas wire projection and verdict data. | Q061 |
| `packages/schema/src/atlas-setup.ts` | Atlas indexing/mining transport results. | Q062 |
| `packages/server/src/handlers/atlas.ts` | Expose the Location-owned Atlas surface and supply chosen-model callbacks for delegate/mine. | G57-E028 |

### D13 — Board owner and planning surface

Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

Board DTOs distinguish Board planning entities, owner payloads and tree/attempt-scoped check/queue facts. Protocol declares read/mutation results and refusals. Server uses the process Board.Service and a literal owner role in the settings adapter; this is not a per-person role resolution proof or evidence that CI/merge succeeded.

**Body relationship:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`. These are same-package context links, not accepted build predecessors.

**Depth:** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

**Conditional missing evidence / blocked claim:** Board authorization, budget/queue algorithms, GitHub synchronization, CI truth and merge behavior require their implementations/runtime evidence. Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/board.ts` | Projeto por key e issue por número positivo; reads têm DTOs específicos e writes OwnerResult, com 404/409; ownership de notas é declarado. | P13 |
| `packages/schema/src/board-queue.ts` | Derived queue state and tree-scoped check/attempt facts. | Q064 |
| `packages/schema/src/board.ts` | Maestro/owner payload distinction and input/output secret boundary. | Q063 |
| `packages/server/src/handlers/board.ts` | Expose Board queries and owner/action commands using the process service. | G57-E032, G57-E033 |

### D14 — Relay workflow, hooks and external ledgers

Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

Relay distinguishes editable drafts, immutable publication, workflow execution binding, structural hook export and ledger integrity. Hook matchers contain actual shared matching code; export shape alone does not validate graph rules or installation. Protocol separates authoring/check/trial and external audit. Server explicitly refuses public executable check with Maestro-required 403, coordinates project authoring/install services, and treats intact external self-reported ledgers as pending rather than independent proof.

**Body relationship:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`. These are same-package context links, not accepted build predecessors.

**Depth:** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

**Conditional missing evidence / blocked claim:** Compiler/store invariants, matching equivalence, signature truth, hook enforcement, execution/recovery and atomic file/store/receipt updates remain blocked for claims requiring them. Product judge/oracle fields do not replace this task’s oracle. Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/relay-document.ts` | Authoring e publicação; revision/checksum/force, recusa de check público e trial separado; versão publicada tem porta própria. | P37 |
| `packages/protocol/src/groups/relay-hook.ts` | Instalações versionadas, enable/disable/order/uninstall/decision read; repair explícito exige confirm:true e preserva ledger no uninstall. | P38 |
| `packages/protocol/src/groups/relay-run.ts` | Leitura de runs e ledger externo; audit schema admite pass, mas descrição exige pending para cadeia íntegra self-reported. | P39 |
| `packages/schema/src/hook-glob.ts` | UTF-8 glob matcher shared by engine/UI with bounded brace nesting and platform separator. | Q065 |
| `packages/schema/src/hook-match.ts` | Path delegation and nonpath normalized wildcard matching. | Q066 |
| `packages/schema/src/relay-arm.ts` | Publication versus authority and plan/execution/task binding; host-owned checks and checkpoint intent. | Q080 |
| `packages/schema/src/relay-authoring.ts` | Incomplete draft contract preserves unknown keys; immutable version separate from live publication. | Q081 |
| `packages/schema/src/relay-external.ts` | Decoded ledger-to-display projection, not chain integrity verification. | Q082 |
| `packages/schema/src/relay-hook.ts` | Strict structural export delegates graph validation and install authority. | Q083 |
| `packages/schema/src/relay-ledger.ts` | Original-byte verification boundary and non-authorizing allow outcomes. | Q084 |
| `packages/schema/src/relay-run.ts` | Supervisor-owned run events are distinct from Relay arm ledger. | Q085 |
| `packages/schema/src/relay-sprint.ts` | Preserved original plan fields and deliberately limited control validation. | Q086 |
| `packages/server/src/handlers/relay-document.ts` | Adapt Relay document authoring, preview, trial and publication, including installed-hook lifecycle coordination. | G57-E094, G57-E096, G57-E099 |
| `packages/server/src/handlers/relay-hook.ts` | Install/update/enable/disable/reorder/uninstall and inspect pinned Relay hooks. | G57-E101, G57-E104, G57-E106 |
| `packages/server/src/handlers/relay-run.ts` | Read external Relay run ledgers, derive their displayed state, and expose a bounded audit result. | G57-E109, G57-E111 |
| `packages/server/src/relay-documents.ts` | Own the server-side project store adapter, document views, draft saving, skill compilation and refusal mapping. | G57-E131, G57-E134, G57-E135 |

### D15 — Maestro product attribution and events

Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

Maestro context/attribution schemas carry actor/source references and versioned product events. PlanRevision V3 has a real missing-upstream-attribution filter; UpstreamAttribution explicitly says structural validation does not establish host-verified authorship. Public and durable-only inventories differ, and product work acceptance is separate from host verification.

**Body relationship:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`. These are same-package context links, not accepted build predecessors.

**Depth:** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

**Conditional missing evidence / blocked claim:** Authenticity, author/dispatch authority, review independence, recovery and actual verification require product implementations and execution; these declarations grant no current Genesis PASS. Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/schema/src/config-maestro.ts` | Optional Atlas project/directory context configuration. | Q067 |
| `packages/schema/src/maestro-context.ts` | Grounding and actor/source-bound tool plan representation. | Q068 |
| `packages/schema/src/maestro-event.ts` | Versioned product governance facts; actual upstream-missing filter and durable-only inventory. | Q069 |
| `packages/schema/src/upstream-attribution.ts` | Strict versioned actor/dispatch references explicitly do not verify authorship. | Q070 |

### D16 — Meeting records and owner review

Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

Meeting represents session-bound final transcript segments, retention/consent and owner review/handoff forms. Protocol exposes that lifecycle; Server delegates to SessionMeeting/Handoff services and starts consolidation on stop. A stop response is not a completed-card receipt and the wrappers do not prove all meeting ownership rules.

**Body relationship:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`, `s1.api.session-contract`, `s1.api.stream-contract`. These are same-package context links, not accepted build predecessors.

**Depth:** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

**Conditional missing evidence / blocked claim:** Deduplication, retention/erasure, consolidation, ownership and handoff effects require the owning implementation/runtime evidence. Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/meeting.ts` | Start/append/stop/read/list, confirmações e handoff; ErrorReason estruturado em400, append NoContent e descrição de deduplicação. | P29 |
| `packages/schema/src/meeting.ts` | Final segments, retention/consent, owner consolidation and handoff intent. | Q071 |
| `packages/server/src/handlers/meeting.ts` | Adapt meeting capture, state edits, consolidation start and handoff. | G57-E065, G57-E066 |

### D17 — Scheduled prompt admission

Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

ScheduledTask represents legacy-compatible IDs, cadence and started/failed admission results. Protocol declares directory-scoped scheduling operations. Server supplies Location.directory to the task service and maps invalid/not-found/run failures; returning a Session ID describes prompt admission, not completed model work.

**Body relationship:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`, `s1.api.session-contract`, `s1.api.stream-contract`. These are same-package context links, not accepted build predecessors.

**Depth:** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

**Conditional missing evidence / blocked claim:** Timing, timezone, cross-directory policy, persistent idempotency and exactly-once scheduling remain Core/runtime claims. Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/schedule.ts` | CRUD e run de ScheduledTask; erros404/500 explícitos para run, descrição separa admissão e execução. | P41 |
| `packages/schema/src/scheduled-task.ts` | Legacy IDs and admission-level started/failed run contract. | Q072 |
| `packages/server/src/handlers/schedule.ts` | List/create/update/remove/run regular schedules in the current directory. | G57-E114, G57-E115, G57-E118, G57-E119 |

### D18 — Lean output and numeric provenance

Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

Lean separates reducer/preserve inventory, accepted engine IDs, local savings estimates and an actual strict persisted-record decoder. The decoder checks shape/eligibility/count arithmetic but cannot establish the truth of supplied metrics. Protocol and Server expose Location-derived profile preferences/collector history; no savings or performance was measured.

**Body relationship:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`. These are same-package context links, not accepted build predecessors.

**Depth:** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

**Conditional missing evidence / blocked claim:** Reducer correctness, recorded history, realized savings and runtime application of settings remain dependent implementation/execution claims. Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/lean.ts` | Dashboard/update/history por item, todos com ServiceUnavailableError; não calcula economia nesta camada. | P25 |
| `packages/schema/src/lean-coverage.ts` | Coverage inventory distinguishes reducer/preserve and maps profiles. | Q073 |
| `packages/schema/src/lean-dashboard.ts` | Saved-profile savings projection explicitly labels local token estimates. | Q074 |
| `packages/schema/src/lean-engine.ts` | Current and legacy persisted engine IDs. | Q075 |
| `packages/schema/src/lean-metrics.ts` | Strict decoder of numeric provenance and arithmetic, separate from factual truth. | Q076 |
| `packages/server/src/handlers/lean.ts` | Expose Lean preferences, collector state, and history for a Location-derived owner. | G57-E056 |

### D19 — RAG retrieval and task-bound research

Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

RAG declares lexical-only pipeline diagnostics and Research declares bound evidence/receipt/inquiry shapes. Protocol separates RAG operations from task-bound artifact reads. Server bridges RAG memory state and SQL through the session helper, while the research adapter obtains Session/project binding and rejects a returned receipt with another executionSessionID or taskId. Shapes/results are not proof of grounded answer quality.

**Body relationship:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`, `s1.api.session-contract`, `s1.api.stream-contract`. These are same-package context links, not accepted build predecessors.

**Depth:** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

**Conditional missing evidence / blocked claim:** RAG persistence atomicity/file policy/algorithms and Research storage integrity, budget/admission/publication truth require their implementations/runtime evidence. Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/rag-studio.ts` | Sources/pipeline/revisions/search/ask/proofs; tipos explícitos de refusal embedding_off e one_pass restringem duas rotas. | P35 |
| `packages/protocol/src/groups/research-artifact.ts` | SessionID + ArtifactID + revisão positiva, cursor opcional, ArtifactPage direto e middleware recebido; sem path de filesystem. | P40 |
| `packages/schema/src/rag-studio.ts` | Lexical-only pipeline and staged retrieval diagnostics. | Q077 |
| `packages/schema/src/research-event.ts` | Research session-ledger source/record/document/allowance and inquiry event ownership. | Q079 |
| `packages/schema/src/research.ts` | Strict binding/evidence/receipt structures with completeness and host-owned card declarations. | Q078 |
| `packages/server/src/handlers/rag-studio-session.ts` | Rehydrate a Location RAG memory store from SQL, execute a callback, then persist its state. | G57-E082, G57-E084, G57-E085 |
| `packages/server/src/handlers/rag-studio.ts` | Expose RAG admission, parsing, revisions, query/proof operations and source views through the session adapter. | G57-E088, G57-E089 |
| `packages/server/src/handlers/research-artifact.ts` | Read a task-bound research artifact page for a Session. | G57-E113 |

### D20 — Guardrail contract and engine adapter

Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

Guardrail schemas and Protocol endpoints distinguish rules, run reports and engine errors. Server delegates rules/run to Guardrail.Service and maps the engine error. This identifies the product boundary without asserting a guard ran or applying its result as a Genesis verdict.

**Body relationship:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`. These are same-package context links, not accepted build predecessors.

**Depth:** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

**Conditional missing evidence / blocked claim:** Rule selection, universal enforcement, engine correctness and observed outcomes remain their own implementation/runtime obligations. Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/guardrail.ts` | Rules e run/reports com erro400 kind/message e descrição de baseline merge-base. | P21 |
| `packages/schema/src/guardrail.ts` | Rules, findings and engine acquisition/report errors are DTOs. | Q087 |
| `packages/server/src/handlers/guardrail.ts` | Expose Guardrail rule discovery and requested engine runs. | G57-E046, G57-E047 |

### D21 — Catalog exports, notifications, health and upgrade

Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

Shared exports and IDE/plugin/server/TUI/installation events declare notification data, not side effects. Health returns a basic literal healthy/version process response; it is not a downstream readiness probe. Installation delegates upgrade and reports the requested target after success, which is not a separate installed-version measurement.

**Body relationship:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`. These are same-package context links, not accepted build predecessors.

**Depth:** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

**Conditional missing evidence / blocked claim:** Notification delivery, UI behavior, software installation integrity and runtime health/upgrade success require actual implementation/execution evidence. Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/health.ts` | GET declara healthy:true, version e pid opcional; é schema de resposta, não medição de disponibilidade desta sessão. | P22 |
| `packages/protocol/src/groups/installation.ts` | POST target seleciona release, resposta success:true/version e erros 400/500; upgrade executado não foi observado. | P23 |
| `packages/schema/src/ide-event.ts` | IDE installed event. | Q092 |
| `packages/schema/src/index.ts` | Public shared-module reexport inventory, not runtime logic. | Q089 |
| `packages/schema/src/installation-event.ts` | Installation updated/update-available notifications. | Q094 |
| `packages/schema/src/plugin.ts` | Plugin identity and added event. | Q090 |
| `packages/schema/src/server-event.ts` | Server connected event. | Q091 |
| `packages/schema/src/tui-event.ts` | Open command names and positive toast duration decoding default. | Q093 |
| `packages/server/src/handlers/health.ts` | Return a basic process/version liveness response. | G57-E048 |
| `packages/server/src/handlers/installation.ts` | Delegate an installation upgrade with an identified method and requested target. | G57-E049 |

### D22 — HTTP origin and static UI boundary

Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

CORS helpers define origin predicates and Vary behavior separately from credential authority. Web UI serves static files/SPA fallback through lexical path resolution and HTML policy. The inspected helper does not supply a general symlink/TOCTOU confinement proof.

**Body relationship:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`. These are same-package context links, not accepted build predecessors.

**Depth:** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

**Conditional missing evidence / blocked claim:** Complete origin security, malicious-filesystem confinement and actual browser/runtime behavior remain blocked for claims that need them. Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/server/src/cors.ts` | Define CORS/request-origin predicates and repair the response Vary header for dynamically echoed origins. | G57-E005, G57-E006, G57-E007 |
| `packages/server/src/web-ui.ts` | Serve the built static UI with HTML CSP and SPA fallback outside API routing. | G57-E139, G57-E140 |

### D23 — ELF byte admission helper

Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

Elf is executable pure byte-inspection code, not a DTO-only module: it parses ELF64 little-endian program metadata and compares needed libc names. It performs no filesystem/process/module loading itself.

**Body relationship:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`. These are same-package context links, not accepted build predecessors.

**Depth:** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

**Conditional missing evidence / blocked claim:** Authenticity, arbitrary-loader safety and packaged-runtime compatibility require the relevant producer/loader and execution evidence. Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/schema/src/elf.ts` | Pure ELF64-LE byte admission and libc dependency check. | Q088 |

### D24 — SDK Core tool facade

Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

The complete two-line SDK module reexports Core tool values and types, supplying no independent registration/execution implementation. It fits the existing sdk-composition body’s returned tool-registration interface.

**Body relationship:** `s1.api.sdk-composition`, `s1.api.surface-disposition`. These are same-package context links, not accepted build predecessors.

**Depth:** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

**Conditional missing evidence / blocked claim:** New claims about Core tool registration/execution must read that implementation; no runtime tool operation was performed. Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/sdk-next/src/tool.ts` | Complete Core tool value/type reexport facade. | Q095 |
