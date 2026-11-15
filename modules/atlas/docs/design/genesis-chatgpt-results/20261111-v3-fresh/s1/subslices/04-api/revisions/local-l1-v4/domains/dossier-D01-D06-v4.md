# B3/v4 — revisão da redução explícita — D01–D06

Critério: disposição de domínio com membership exato, propósito/contrato/owner, evidência ou gap obrigatório e razão da profundidade. A revisão retira os claims locais detalhados da tabela antiga do corpo promovido, sem retirar paths, domínios ou necessidades. Os dois juízes decidem se a forma reduzida cumpre a necessidade congelada; o produtor não concede PASS. B1/B2 permanecem fora desta mudança; D07 preserva seus campos e membros.

Disposição das especificidades retiradas: `RETIRED_EXTRA_CLAIM`; suas lacunas não são declaradas resolvidas por fonte. Lacunas de bounded_claims retidos continuam obrigatórias.

Corpo único: `domain-disposition.md`, 38080 bytes, SHA256 `12248d1cc39a27b1655f1a683f02cd1af864f87945300a86b0ee4326227a4edd`. Histórico original preservado: 65726 bytes, SHA256 `95b17106dc5c26bb6d39c8d2d80b48fca8f75d35fe4f5f8ec3f232c7d71411c3`. As linhas antigas não são evidência nova nem claims atuais; disposição individual em `retired-row-claims.json`.

Base literal já enviada à mesma dupla: `b3/v2/dossier-D01-D06.md`, 31892 bytes, SHA256 `b31b058452a3f0162589eb543f8163a31c3ad7646268d1fde832e81062b0ae5a`. Reutilizam-se somente os intervalos de fonte abaixo nomeados; as tabelas locais daquele v2 não são promovidas nesta revisão. Nenhum literal necessário do corpus v2 foi alterado. O mapa por domínio conserva ID e linha para reaproveitamento do contexto existente.

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

The Schema modules represent file entries/diffs, reference sources, VCS answers and host-CLI pull requests. Protocol declares the VCS diff query and response shapes; Server delegates reference/Git/PR work to Location services and projects the PR host error. No file access or remote PR was performed by this production.

**Evidência decisiva:** Q025:L6–12, Q027:L15–18, Q028:L3–4, Q030:L28–30, Q031:L6–8, P44:L41–48, G57-E077:L20–24, G57-E078:L30–40, G57-E092:L6–8, G57-E127:L37–39. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`.

**Lacuna condicional — conditional_gap:**

Path confinement, host credentials, Git correctness and remote writes remain dependent implementation/runtime claims.

