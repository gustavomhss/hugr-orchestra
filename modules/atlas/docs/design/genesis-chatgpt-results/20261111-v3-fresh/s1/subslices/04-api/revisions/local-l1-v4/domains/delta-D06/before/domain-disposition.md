# L1 — disposição limitada dos 24 domínios de API

Candidato S1-04/B3/v4. Fonte `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocolo `ee2521a5b966bd505cc95bd1c733e09e12f33531`. Revisão submetida à mesma dupla, sem novo PASS atribuído por este produtor.

## Necessidade e escopo promovido

A necessidade de B3 é entendimento de propósito, contrato observável e ownership/delegação local. Este corpo agrupa os 190 paths exatos em 24 domínios. Não promove uma enumeração de todos os endpoints, campos ou efeitos de cada módulo. Os bounded_claim e conditional_gap abaixo são os campos herdados exatos; cada domínio conserva seus membros, contexto de artefatos, evidência e limite de profundidade.

Ownership local: os paths Schema fornecem os valores/contratos ou helpers explicitamente descritos; Protocol declara a superfície de transporte; Server faz as verificações e delegações locais descritas; o único membro SDK é a fachada indicada em D24. O serviço delegado e a autoridade externa necessários a afirmações mais amplas estão nomeados no bounded_claim e no conditional_gap do domínio. A pertença a um pacote não substitui esses limites.

As tabelas antigas “Exact member / Local L1 purpose / Additional evidence” estão preservadas integralmente em `original-review-domain-disposition.md` como histórico não promovido por v4. Os 190 claims locais dessas tabelas não são claims adicionais deste corpo, nem são declarados falsos ou aceitos. Sua disposição individual é `RETIRED_EXTRA_CLAIM`, registrada em `retired-row-claims.json`: a lacuna de evidência da especificidade retirada não é declarada resolvida por fonte. A mudança retira especificidade incidental que a seleção de evidência não sustentava; mantém a necessidade de entendimento dos 24 domínios, os 190 paths e todos os gaps obrigatórios. Lacunas que pertençam ao bounded_claim continuam obrigatórias e não recebem essa disposição. A dupla julgará explicitamente esta redução.

As afirmações sobre leitura completa e profundidade herdada descrevem a produção B-v3 original. Esta revisão reaproveita aquela evidência, não alega uma nova leitura integral dos 190 arquivos e não produz L2–L4. A escolha de profundidade é adequada somente à necessidade limitada declarada: contrato local com trechos decisivos e limites explícitos; não autoriza conclusões de execução, garantia de Core ou auditoria de toda folha. Contextos de artefato são navegação; não recebem automaticamente status de predecessor aceito.

## Regras comuns aos 24 domínios

Os três campos a seguir são idênticos nos 24 registros herdados e aplicam-se integralmente a cada domínio; aparecem uma vez para evitar repetição.

**Necessidade L1 (herdada):** Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

**Dependentes bloqueados (herdado):** Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

**Profundidade e razão de adequação (herdadas):** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

As expressões de leitura “now” e “was read in full” pertencem ao registro histórico B-v3, não declaram uma releitura nesta revisão. O contrato/owner específico e o limite de aplicação desta profundidade são o bounded_claim e o conditional_gap de cada domínio abaixo.

## D01 — Actions provider automation

**Membros exatos (25):**

- `packages/protocol/src/groups/actions-binding.ts`
- `packages/protocol/src/groups/actions-common.ts`
- `packages/protocol/src/groups/actions-job.ts`
- `packages/protocol/src/groups/actions-operation.ts`
- `packages/protocol/src/groups/actions-pipeline.ts`
- `packages/protocol/src/groups/actions-resource.ts`
- `packages/protocol/src/groups/actions-run.ts`
- `packages/protocol/src/groups/actions-source.ts`
- `packages/protocol/src/groups/actions-workflow.ts`
- `packages/schema/src/actions.ts`
- `packages/schema/src/actions/command.ts`
- `packages/schema/src/actions/identity.ts`
- `packages/schema/src/actions/operation.ts`
- `packages/schema/src/actions/resource.ts`
- `packages/schema/src/actions/run.ts`
- `packages/schema/src/actions/workflow.ts`
- `packages/server/src/handlers/actions-binding.ts`
- `packages/server/src/handlers/actions-common.ts`
- `packages/server/src/handlers/actions-job.ts`
- `packages/server/src/handlers/actions-operation.ts`
- `packages/server/src/handlers/actions-pipeline.ts`
- `packages/server/src/handlers/actions-resource.ts`
- `packages/server/src/handlers/actions-run.ts`
- `packages/server/src/handlers/actions-source.ts`
- `packages/server/src/handlers/actions-workflow.ts`

**Propósito, contrato e delegação local — bounded_claim:**

Schema separates binding/revision, prepared operation identity and execution input; Protocol declares the provider-command API and shared Actions errors; Server delegates to Actions.Service through a binding reference and common error projection. A binding reference does not itself prove provider authorization or an executed remote effect.

**Evidência decisiva:** Q048:L49–50, Q049:L17–17, Q049:L38–44, Q049:L77–78, P02:L6–8, P03:L11–14, G57-E013:L9–12, G57-E011:L7–20. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`.

**Lacuna condicional — conditional_gap:**

Provider authorization, atomic operation/reconcile semantics and remote results require Actions/Core and relevant runtime evidence.

## D02 — Agent, behavior, skill and prompt instructions

**Membros exatos (16):**

- `packages/protocol/src/groups/agent.ts`
- `packages/protocol/src/groups/behavior.ts`
- `packages/protocol/src/groups/command.ts`
- `packages/protocol/src/groups/skill.ts`
- `packages/schema/src/agent-file.ts`
- `packages/schema/src/agent.ts`
- `packages/schema/src/behavior.ts`
- `packages/schema/src/command.ts`
- `packages/schema/src/llm.ts`
- `packages/schema/src/prompt-context.ts`
- `packages/schema/src/session-subagent-models.ts`
- `packages/schema/src/skill.ts`
- `packages/server/src/handlers/agent.ts`
- `packages/server/src/handlers/behavior.ts`
- `packages/server/src/handlers/command.ts`
- `packages/server/src/handlers/skill.ts`

**Propósito, contrato e delegação local — bounded_claim:**

These contracts separate agent/skill/command configuration and host-rendered reminders from executing turns. Agent-file revisions and behavior replacement are public inputs; Server resolves the Location-owned catalog/services and delegates writes, with local name/conflict/error handling. SDK or HTTP exposure is not evidence that a tool/model ran.

**Evidência decisiva:** Q001:L29–34, Q003:L19–22, Q006:L5–9, P10:L77–83, G57-E026:L75–85, G57-E027:L129–138, G57-E031:L11–18, G57-E040:L6–8, G57-E120:L16–27. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`.

**Lacuna condicional — conditional_gap:**

File containment, effective permission policy, reload convergence and provider/tool execution need their implementation or execution evidence.

## D03 — Permission and question requests

**Membros exatos (7):**

- `packages/protocol/src/groups/permission.ts`
- `packages/protocol/src/groups/question.ts`
- `packages/schema/src/permission-saved.ts`
- `packages/schema/src/permission.ts`
- `packages/schema/src/question.ts`
- `packages/server/src/handlers/permission.ts`
- `packages/server/src/handlers/question.ts`

**Propósito, contrato e delegação local — bounded_claim:**

Schema defines request/reply/saved-rule forms and Protocol distinguishes Location and Session endpoints. Server permission get/reply and question reply/reject inspect the requested record and compare its sessionID before delegation; absent/foreign records map to the corresponding not-found error. These local checks do not establish every Core lifecycle invariant.

**Evidência decisiva:** Q009:L34–40, Q010:L14–19, Q011:L52–58, P30:L60–64, G57-E067:L10–12, G57-E069:L62–64, G57-E069:L69–75, G57-E079:L19–23, G57-E081:L40–46, U01:L8–10, U01:L51–57. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`, `s1.api.session-contract`, `s1.api.stream-contract`.

**Lacuna condicional — conditional_gap:**

Decision policy, saved-entry authorization, persistence and concurrent lifecycle behavior remain Core/runtime prerequisites.

## D04 — Session projections and invalidations

**Membros exatos (4):**

- `packages/schema/src/revert.ts`
- `packages/schema/src/session-activity.ts`
- `packages/schema/src/session-compaction-event.ts`
- `packages/schema/src/session-todo.ts`

**Propósito, contrato e delegação local — bounded_claim:**

Revert, activity, todo and compaction modules describe session-bound records/notifications. They do not perform revert or activity computation; todo status/priority remain String fields. Existing session/stream bodies cover admission and delivery boundaries separately.

**Evidência decisiva:** Q012:L17–24, Q013:L33–34, Q013:L40–45, Q014:L6–11, Q015:L7–15, Q015:L18–25. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`, `s1.api.session-contract`, `s1.api.stream-contract`.

**Lacuna condicional — conditional_gap:**

Revert effects, activity calculation, compaction and todo persistence require the owning service before an implementation claim.

## D05 — Project, workspace and copy context

**Membros exatos (15):**

- `packages/protocol/src/groups/location.ts`
- `packages/protocol/src/groups/project-copy.ts`
- `packages/protocol/src/groups/project.ts`
- `packages/schema/src/identifier.ts`
- `packages/schema/src/project-copy.ts`
- `packages/schema/src/project-directories.ts`
- `packages/schema/src/project-id.ts`
- `packages/schema/src/project.ts`
- `packages/schema/src/workspace-event.ts`
- `packages/schema/src/workspace-id.ts`
- `packages/schema/src/workspace.ts`
- `packages/schema/src/worktree-event.ts`
- `packages/server/src/handlers/location.ts`
- `packages/server/src/handlers/project-copy.ts`
- `packages/server/src/handlers/project.ts`

**Propósito, contrato e delegação local — bounded_claim:**

Schema supplies identity and project/workspace/copy shapes; Protocol separates global project/catalog calls from Location query context. Server location registration, project initialization and copy creation delegate to the corresponding services; copy creation supplies project/source context from the route and Location. ID/path representations are not complete filesystem authority.

**Evidência decisiva:** Q018:L5–7, Q020:L31–34, Q022:L11–17, P26:L5–12, P32:L11–14, G57-E058:L19–24, G57-E072:L52–60, G57-E076:L35–37. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`.

**Lacuna condicional — conditional_gap:**

Isolation, copy destruction/force behavior, Git effects, uniqueness under every execution and workspace lifecycle require their owners and pertinent runtime evidence.

## D06 — Files, references, Git and pull requests

**Membros exatos (13):**

- `packages/protocol/src/groups/pull-request.ts`
- `packages/protocol/src/groups/reference.ts`
- `packages/protocol/src/groups/vcs.ts`
- `packages/schema/src/file-diff.ts`
- `packages/schema/src/filesystem-watcher.ts`
- `packages/schema/src/filesystem.ts`
- `packages/schema/src/pull-request.ts`
- `packages/schema/src/reference.ts`
- `packages/schema/src/vcs-event.ts`
- `packages/schema/src/vcs.ts`
- `packages/server/src/handlers/pull-request.ts`
- `packages/server/src/handlers/reference.ts`
- `packages/server/src/handlers/vcs.ts`

**Propósito, contrato e delegação local — bounded_claim:**

The Schema modules represent file entries/diffs, reference sources, VCS answers and host-CLI pull requests. Protocol declares query/input/error shapes; Server delegates reference/Git/PR work to Location services and maps the PR host error. No file access or remote PR was performed by this production.

**Evidência decisiva:** Q025:L6–12, Q027:L15–18, Q028:L3–4, Q030:L28–30, Q031:L6–8, P44:L41–48, G57-E077:L20–24, G57-E078:L30–40, G57-E092:L6–8, G57-E127:L37–39. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`.

**Lacuna condicional — conditional_gap:**

Path confinement, host credentials, Git correctness and remote writes remain dependent implementation/runtime claims.

## D07 — PTY records and tickets

**Membros exatos (2):**

- `packages/schema/src/pty-ticket.ts`
- `packages/schema/src/pty.ts`

**Propósito, contrato e delegação local — bounded_claim:**

PTY and PtyTicket supply process/event/create-update and ticket-expiry DTOs. The existing server-edge and stream-contract bodies supply the separately inspected ticket-consumption/raw-upgrade and queue boundaries; a ticket string DTO does not itself authorize access.

**Evidência decisiva:** Q032:L22–29, Q032:L34–38, Q032:L40–44, Q032:L52–59, Q033:L6–9. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`, `s1.api.session-contract`, `s1.api.stream-contract`.

**Lacuna condicional — conditional_gap:**

Actual subprocess behavior, ticket lifecycle, resize and backpressure guarantees require their relevant runtime evidence.

## D08 — Providers, credentials and integration attempts

**Membros exatos (11):**

- `packages/protocol/src/groups/credential.ts`
- `packages/protocol/src/groups/integration.ts`
- `packages/schema/src/catalog.ts`
- `packages/schema/src/connection.ts`
- `packages/schema/src/credential.ts`
- `packages/schema/src/integration-id.ts`
- `packages/schema/src/integration.ts`
- `packages/schema/src/models-dev.ts`
- `packages/schema/src/provider.ts`
- `packages/server/src/handlers/credential.ts`
- `packages/server/src/handlers/integration.ts`

**Propósito, contrato e delegação local — bounded_claim:**

Provider/API kinds, secret-bearing Credential.Value and safe Connection references are distinct shapes. Integration describes methods/attempts, and Server delegates credentials/OAuth to Integration.Service. Integration-scoped attempt routes invoke an ownership comparison; generic attempt routes are separate delegation paths. No authentication success or secure-storage guarantee is inferred from a DTO.

**Evidência decisiva:** Q034:L27–29, Q034:L35–37, Q034:L41–43, Q035:L16–22, Q035:L26–35, Q038:L7–22, Q037:L73–76, Q037:L123–128, P24:L100–105, P24:L169–175, G57-E043:L13–17, G57-E051:L42–51, G57-E054:L114–120, G57-E055:L140–145, U04:L122–128, U04:L131–137, U04:L147–152, U04:L155–160. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`.

**Lacuna condicional — conditional_gap:**

Generic attempt policy, encryption/storage, OAuth resource cleanup and real external authentication remain Core/runtime claims.

## D09 — MCP, LSP and formatting

**Membros exatos (12):**

- `packages/protocol/src/groups/formatter.ts`
- `packages/protocol/src/groups/lsp.ts`
- `packages/protocol/src/groups/mcp.ts`
- `packages/schema/src/config-mcp.ts`
- `packages/schema/src/formatter.ts`
- `packages/schema/src/lsp-event.ts`
- `packages/schema/src/lsp.ts`
- `packages/schema/src/mcp-event.ts`
- `packages/schema/src/mcp.ts`
- `packages/server/src/handlers/formatter.ts`
- `packages/server/src/handlers/lsp.ts`
- `packages/server/src/handlers/mcp.ts`

**Propósito, contrato e delegação local — bounded_claim:**

MCP local/remote configuration, status/resource/auth projections and LSP/formatter status are public contracts. Server delegates these operations through Location services and maps MCP missing/config/auth failures. A masking comment or reduced Entry DTO is not proof that every debug payload was sanitized or a connection succeeded.

**Evidência decisiva:** Q041:L15–17, Q041:L34–41, Q042:L6–8, Q042:L15–17, Q042:L69–70, Q042:L100–106, Q044:L5–10, Q046:L5–9, P28:L41–45, G57-E045:L7–7, G57-E060:L7–7, G57-E061:L10–12, G57-E064:L89–95. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`.

**Lacuna condicional — conditional_gap:**

Trust enforcement, process/transport isolation, secret masking and OAuth/reconnect behavior need the service implementation or execution evidence.

## D10 — Global configuration and project trust

**Membros exatos (4):**

- `packages/protocol/src/groups/config.ts`
- `packages/protocol/src/groups/trust.ts`
- `packages/server/src/handlers/config.ts`
- `packages/server/src/handlers/trust.ts`

**Propósito, contrato e delegação local — bounded_claim:**

Config and Trust are process-global contracts rather than independent per-request Location documents. Server captures global services, writes/changes trust and visits open Locations to reload/apply it; the visible per-Location failure handling is ignored. A successful response therefore does not establish convergence of every open Location.

**Evidência decisiva:** P43:L5–7, G57-E041:L14–17, G57-E041:L24–29, G57-E042:L31–44, G57-E123:L14–29, G57-E124:L41–49, G57-E125:L55–60. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`.

**Lacuna condicional — conditional_gap:**

Complete reload/trust convergence and downstream MCP behavior remain blocked until independently supported.

## D11 — Capability authority and management

**Membros exatos (14):**

- `packages/protocol/src/groups/capability-connections.ts`
- `packages/protocol/src/groups/capability-operator.ts`
- `packages/protocol/src/groups/capability-schedules.ts`
- `packages/schema/src/capability-artifact-management.ts`
- `packages/schema/src/capability-management.ts`
- `packages/schema/src/capability-schedule-management.ts`
- `packages/schema/src/capability-setup.ts`
- `packages/schema/src/capability.ts`
- `packages/server/src/capability-content-ticket.ts`
- `packages/server/src/capability-verification.ts`
- `packages/server/src/handlers/capability-connections.ts`
- `packages/server/src/handlers/capability-operator.ts`
- `packages/server/src/handlers/capability-schedules.ts`
- `packages/server/src/operator.ts`

**Propósito, contrato e delegação local — bounded_claim:**

Capability references identify data while trusted authority belongs to Core. Receipts/outcome statuses, bounded FailureDetail and operator projections are distinct. Protocol applies CapabilityAuthorization and management request contracts; Server builds host-owned operator/verifier facades and delegates request/placement-bound management. Content-ticket code carries stored authority, session and artifact revision through a process-local random-token map.

**Evidência decisiva:** Q054:L41–47, Q054:L105–119, Q054:L150–153, Q054:L175–186, Q055:L7–7, P14:L26–32, P14:L93–95, G57-E130:L8–15, G57-E004:L7–12, G57-E034:L20–25, G57-E034:L32–36, G57-E001:L9–13, U05:L27–31, G57-E003:L38–46. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`.

**Lacuna condicional — conditional_gap:**

Revocation/placement correctness, provider identity, persistent idempotency and end-to-end artifact policy require the actual Core/runtime evidence. The stored token is not described as an HMAC construction.

## D12 — Atlas product surface

**Membros exatos (6):**

- `packages/protocol/src/groups/atlas.ts`
- `packages/schema/src/atlas-knowledge.ts`
- `packages/schema/src/atlas-review.ts`
- `packages/schema/src/atlas-screen.ts`
- `packages/schema/src/atlas-setup.ts`
- `packages/server/src/handlers/atlas.ts`

**Propósito, contrato e delegação local — bounded_claim:**

Atlas knowledge anchors and empty/present screen/review/setup results are transport contracts. Knowledge target identity is not Task execution authorization. Protocol exposes the Location surface; Server opens the Atlas application with project/Location context and maps its unavailable error. These product routes and result labels do not constitute Genesis review or runtime receipts.

**Evidência decisiva:** Q059:L23–28, Q059:L43–53, Q061:L9–9, Q061:L307–316, Q062:L6–13, P11:L43–48, G57-E028:L23–24, G57-E028:L28–36, D12-U08:L9–9, D12-U08:L88–90, D12-U08:L128–136, D12-U08:L307–320, D12-U08:L332–334, D12-U09:L3–13, D12-U09:L21–28. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`.

**Lacuna condicional — conditional_gap:**

Atlas CAS, semantic governance, source realization, mine/index/import and actual review results remain their own authority/runtime obligations.

**Precisão das uniões D12:** “Present” no bounded_claim herdado é uma descrição de resultado não vazio, não um discriminante literal prometido. As fontes mostram AtlasSnapshotResult = Union([AtlasEmpty, AtlasSnapshot]), AtlasReviewResult = Union([AtlasEmpty, AtlasReview]), AtlasIndexResult = Union([AtlasEmpty, AtlasIndexOk]) e AtlasMineResult = Union([AtlasEmpty, AtlasMineOk]); AtlasEmpty usa state: "empty", e os ramos snapshot/index/mine inspecionados usam state: "ok". AtlasReasoningResult também inclui state: "missing". Esta precisão não promove um resultado de transporte a recibo de execução nem altera o bounded_claim.

## D13 — Board owner and planning surface

**Membros exatos (4):**

- `packages/protocol/src/groups/board.ts`
- `packages/schema/src/board-queue.ts`
- `packages/schema/src/board.ts`
- `packages/server/src/handlers/board.ts`

**Propósito, contrato e delegação local — bounded_claim:**

Board DTOs distinguish Board planning entities, owner payloads and tree/attempt-scoped check/queue facts. Protocol declares read/mutation results and refusals. Server uses the process Board.Service and a literal owner role in the settings adapter; this is not a per-person role resolution proof or evidence that CI/merge succeeded.

**Evidência decisiva:** Q063:L11–12, Q063:L687–693, Q064:L78–85, Q064:L103–109, P13:L12–17, P13:L102–107, G57-E032:L9–12, U02:L20–20. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`.

**Lacuna condicional — conditional_gap:**

Board authorization, budget/queue algorithms, GitHub synchronization, CI truth and merge behavior require their implementations/runtime evidence.

## D14 — Relay workflow, hooks and external ledgers

**Membros exatos (16):**

- `packages/protocol/src/groups/relay-document.ts`
- `packages/protocol/src/groups/relay-hook.ts`
- `packages/protocol/src/groups/relay-run.ts`
- `packages/schema/src/hook-glob.ts`
- `packages/schema/src/hook-match.ts`
- `packages/schema/src/relay-arm.ts`
- `packages/schema/src/relay-authoring.ts`
- `packages/schema/src/relay-external.ts`
- `packages/schema/src/relay-hook.ts`
- `packages/schema/src/relay-ledger.ts`
- `packages/schema/src/relay-run.ts`
- `packages/schema/src/relay-sprint.ts`
- `packages/server/src/handlers/relay-document.ts`
- `packages/server/src/handlers/relay-hook.ts`
- `packages/server/src/handlers/relay-run.ts`
- `packages/server/src/relay-documents.ts`

**Propósito, contrato e delegação local — bounded_claim:**

Relay distinguishes editable drafts, immutable publication, workflow execution binding, structural hook export and ledger integrity. Hook matchers contain actual shared matching code; export shape alone does not validate graph rules or installation. Protocol separates authoring/check/trial and external audit. Server explicitly refuses public executable check with Maestro-required 403, coordinates project authoring/install services, and treats intact external self-reported ledgers as pending rather than independent proof.

**Evidência decisiva:** Q081:L7–9, Q081:L120–124, Q080:L52–59, Q083:L125–137, Q084:L11–13, Q066:L5–6, Q066:L13–23, P37:L20–26, P37:L306–312, P37:L353–358, P39:L8–10, G57-E096:L158–164, G57-E094:L79–83, G57-E104:L154–157, G57-E101:L48–55, G57-E111:L94–108. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`.

**Lacuna condicional — conditional_gap:**

Compiler/store invariants, matching equivalence, signature truth, hook enforcement, execution/recovery and atomic file/store/receipt updates remain blocked for claims requiring them. Product judge/oracle fields do not replace this task’s oracle.

## D15 — Maestro product attribution and events

**Membros exatos (4):**

- `packages/schema/src/config-maestro.ts`
- `packages/schema/src/maestro-context.ts`
- `packages/schema/src/maestro-event.ts`
- `packages/schema/src/upstream-attribution.ts`

**Propósito, contrato e delegação local — bounded_claim:**

Maestro context/attribution schemas carry actor/source references and versioned product events. PlanRevision V3 has a real missing-upstream-attribution filter; UpstreamAttribution explicitly says structural validation does not establish host-verified authorship. Public and durable-only inventories differ, and product work acceptance is separate from host verification.

**Evidência decisiva:** Q068:L10–16, Q068:L20–25, Q069:L240–240, Q069:L249–266, Q069:L273–276, Q070:L35–38, Q069:L710–714, Q069:L728–731, Q069:L766–768. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`.

**Lacuna condicional — conditional_gap:**

Authenticity, author/dispatch authority, review independence, recovery and actual verification require product implementations and execution; these declarations grant no current Genesis PASS.

## D16 — Meeting records and owner review

**Membros exatos (3):**

- `packages/protocol/src/groups/meeting.ts`
- `packages/schema/src/meeting.ts`
- `packages/server/src/handlers/meeting.ts`

**Propósito, contrato e delegação local — bounded_claim:**

Meeting represents session-bound final transcript segments, retention/consent and owner review/handoff forms. Protocol exposes that lifecycle; Server delegates to SessionMeeting/Handoff services and starts consolidation on stop. A stop response is not a completed-card receipt and the wrappers do not prove all meeting ownership rules.

**Evidência decisiva:** Q071:L8–9, Q071:L40–41, Q071:L44–47, Q071:L130–132, U03:L183–191, U03:L200–204, P29:L21–25, G57-E065:L26–34, G57-E066:L86–92. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`, `s1.api.session-contract`, `s1.api.stream-contract`.

**Lacuna condicional — conditional_gap:**

Deduplication, retention/erasure, consolidation, ownership and handoff effects require the owning implementation/runtime evidence.

## D17 — Scheduled prompt admission

**Membros exatos (3):**

- `packages/protocol/src/groups/schedule.ts`
- `packages/schema/src/scheduled-task.ts`
- `packages/server/src/handlers/schedule.ts`

**Propósito, contrato e delegação local — bounded_claim:**

ScheduledTask represents legacy-compatible IDs, cadence and started/failed admission results. Protocol declares directory-scoped scheduling operations. Server supplies Location.directory to the task service and maps invalid/not-found/run failures; returning a Session ID describes prompt admission, not completed model work.

**Evidência decisiva:** Q072:L8–18, Q072:L25–30, Q072:L33–38, Q072:L40–42, P41:L91–96, G57-E115:L24–28, G57-E118:L65–69, G57-E119:L77–82. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`, `s1.api.session-contract`, `s1.api.stream-contract`.

**Lacuna condicional — conditional_gap:**

Timing, timezone, cross-directory policy, persistent idempotency and exactly-once scheduling remain Core/runtime claims.

## D18 — Lean output and numeric provenance

**Membros exatos (6):**

- `packages/protocol/src/groups/lean.ts`
- `packages/schema/src/lean-coverage.ts`
- `packages/schema/src/lean-dashboard.ts`
- `packages/schema/src/lean-engine.ts`
- `packages/schema/src/lean-metrics.ts`
- `packages/server/src/handlers/lean.ts`

**Propósito, contrato e delegação local — bounded_claim:**

Lean separates reducer/preserve inventory, accepted engine IDs, local savings estimates and an actual strict persisted-record decoder. The decoder checks shape/eligibility/count arithmetic but cannot establish the truth of supplied metrics. Protocol and Server expose Location-derived profile preferences/collector history; no savings or performance was measured.

**Evidência decisiva:** Q073:L6–6, Q073:L10–11, Q075:L3–9, Q074:L14–20, Q076:L28–36, Q076:L53–56, Q076:L71–80, Q076:L87–92, P25:L26–31, G57-E056:L17–22, G57-E056:L29–29, U06:L40–47. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`.

**Lacuna condicional — conditional_gap:**

Reducer correctness, recorded history, realized savings and runtime application of settings remain dependent implementation/execution claims.

## D19 — RAG retrieval and task-bound research

**Membros exatos (8):**

- `packages/protocol/src/groups/rag-studio.ts`
- `packages/protocol/src/groups/research-artifact.ts`
- `packages/schema/src/rag-studio.ts`
- `packages/schema/src/research-event.ts`
- `packages/schema/src/research.ts`
- `packages/server/src/handlers/rag-studio-session.ts`
- `packages/server/src/handlers/rag-studio.ts`
- `packages/server/src/handlers/research-artifact.ts`

**Propósito, contrato e delegação local — bounded_claim:**

RAG declares lexical-only pipeline diagnostics and Research declares bound evidence/receipt/inquiry shapes. Protocol separates RAG operations from task-bound artifact reads. Server bridges RAG memory state and SQL through the session helper, while the research adapter obtains Session/project binding and rejects a returned receipt with another executionSessionID or taskId. Shapes/results are not proof of grounded answer quality.

**Evidência decisiva:** Q077:L47–55, Q078:L52–60, Q078:L87–94, Q078:L100–107, U07:L405–408, P35:L11–18, P40:L13–19, G57-E082:L18–23, G57-E084:L61–65, G57-E085:L132–135, G57-E113:L16–25. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`, `s1.api.session-contract`, `s1.api.stream-contract`.

**Lacuna condicional — conditional_gap:**

RAG persistence atomicity/file policy/algorithms and Research storage integrity, budget/admission/publication truth require their implementations/runtime evidence.

## D20 — Guardrail contract and engine adapter

**Membros exatos (3):**

- `packages/protocol/src/groups/guardrail.ts`
- `packages/schema/src/guardrail.ts`
- `packages/server/src/handlers/guardrail.ts`

**Propósito, contrato e delegação local — bounded_claim:**

Guardrail schemas and Protocol endpoints distinguish rules, run reports and engine errors. Server delegates rules/run to Guardrail.Service and maps the engine error. This identifies the product boundary without asserting a guard ran or applying its result as a Genesis verdict.

**Evidência decisiva:** Q087:L5–7, Q087:L77–86, Q087:L96–100, P21:L8–17, P21:L21–24, G57-E046:L11–24, G57-E047:L30–32. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`.

**Lacuna condicional — conditional_gap:**

Rule selection, universal enforcement, engine correctness and observed outcomes remain their own implementation/runtime obligations.

## D21 — Catalog exports, notifications, health and upgrade

**Membros exatos (10):**

- `packages/protocol/src/groups/health.ts`
- `packages/protocol/src/groups/installation.ts`
- `packages/schema/src/ide-event.ts`
- `packages/schema/src/index.ts`
- `packages/schema/src/installation-event.ts`
- `packages/schema/src/plugin.ts`
- `packages/schema/src/server-event.ts`
- `packages/schema/src/tui-event.ts`
- `packages/server/src/handlers/health.ts`
- `packages/server/src/handlers/installation.ts`

**Propósito, contrato e delegação local — bounded_claim:**

Shared exports and IDE/plugin/server/TUI/installation events declare notification data, not side effects. Health returns a basic literal healthy/version process response; it is not a downstream readiness probe. Installation delegates upgrade and reports the requested target after success, which is not a separate installed-version measurement.

**Evidência decisiva:** Q089:L1–3, Q090:L9–13, Q091:L5–7, Q092:L6–11, Q093:L11–11, Q094:L6–18, P22:L5–11, P23:L5–10, G57-E048:L6–9, G57-E049:L9–22. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`.

**Lacuna condicional — conditional_gap:**

Notification delivery, UI behavior, software installation integrity and runtime health/upgrade success require actual implementation/execution evidence.

## D22 — HTTP origin and static UI boundary

**Membros exatos (2):**

- `packages/server/src/cors.ts`
- `packages/server/src/web-ui.ts`

**Propósito, contrato e delegação local — bounded_claim:**

CORS helpers define origin predicates and Vary behavior separately from credential authority. Web UI serves static files/SPA fallback through lexical path resolution and HTML policy. The inspected helper does not supply a general symlink/TOCTOU confinement proof.

**Evidência decisiva:** G57-E005:L10–31, G57-E007:L55–66, G57-E139:L30–46, G57-E140:L52–55. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`.

**Lacuna condicional — conditional_gap:**

Complete origin security, malicious-filesystem confinement and actual browser/runtime behavior remain blocked for claims that need them.

## D23 — ELF byte admission helper

**Membros exatos (1):**

- `packages/schema/src/elf.ts`

**Propósito, contrato e delegação local — bounded_claim:**

Elf is executable pure byte-inspection code, not a DTO-only module: it parses ELF64 little-endian program metadata and compares needed libc names. It performs no filesystem/process/module loading itself.

**Evidência decisiva:** Q088:L3–15, Q088:L72–89. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`.

**Lacuna condicional — conditional_gap:**

Authenticity, arbitrary-loader safety and packaged-runtime compatibility require the relevant producer/loader and execution evidence.

## D24 — SDK Core tool facade

**Membros exatos (1):**

- `packages/sdk-next/src/tool.ts`

**Propósito, contrato e delegação local — bounded_claim:**

The complete two-line SDK module reexports Core tool values and types, supplying no independent registration/execution implementation. It fits the existing sdk-composition body’s returned tool-registration interface.

**Evidência decisiva:** Q095:L1–2. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.sdk-composition`, `s1.api.surface-disposition`.

**Lacuna condicional — conditional_gap:**

New claims about Core tool registration/execution must read that implementation; no runtime tool operation was performed.

