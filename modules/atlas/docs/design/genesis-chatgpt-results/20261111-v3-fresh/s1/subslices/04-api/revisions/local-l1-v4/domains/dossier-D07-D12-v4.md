# B3/v4 — revisão da redução explícita — D07–D12

Critério: disposição de domínio com membership exato, propósito/contrato/owner, evidência ou gap obrigatório e razão da profundidade. A revisão retira os claims locais detalhados da tabela antiga do corpo promovido, sem retirar paths, domínios ou necessidades. Os dois juízes decidem se a forma reduzida cumpre a necessidade congelada; o produtor não concede PASS. B1/B2 permanecem fora desta mudança; D07 preserva seus campos e membros.

Disposição das especificidades retiradas: `RETIRED_EXTRA_CLAIM`; suas lacunas não são declaradas resolvidas por fonte. Lacunas de bounded_claims retidos continuam obrigatórias.

Corpo único: `domain-disposition.md`, 38062 bytes, SHA256 `36339a1329421f80d15e37b40ce26edd6e1c793a0ac1b5056471e4df2bfed57c`. Histórico original preservado: 65726 bytes, SHA256 `95b17106dc5c26bb6d39c8d2d80b48fca8f75d35fe4f5f8ec3f232c7d71411c3`. As linhas antigas não são evidência nova nem claims atuais; disposição individual em `retired-row-claims.json`.

Base literal já enviada à mesma dupla: `b3/v2/dossier-D07-D12.md`, 34510 bytes, SHA256 `68ce7d7715261164b4c112982e3b7ff9e7e9219634138840878371257c47ed40`. Reutilizam-se somente os intervalos de fonte abaixo nomeados; as tabelas locais daquele v2 não são promovidas nesta revisão. Nenhum literal necessário do corpus v2 foi alterado. O mapa por domínio conserva ID e linha para reaproveitamento do contexto existente.

## Regras comuns aos 24 domínios

Os três campos a seguir são idênticos nos 24 registros herdados e aplicam-se integralmente a cada domínio; aparecem uma vez para evitar repetição.

**Necessidade L1 (herdada):** Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

**Dependentes bloqueados (herdado):** Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

**Profundidade e razão de adequação (herdadas):** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

As expressões de leitura “now” e “was read in full” pertencem ao registro histórico B-v3, não declaram uma releitura nesta revisão. O contrato/owner específico e o limite de aplicação desta profundidade são o bounded_claim e o conditional_gap de cada domínio abaixo.

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

## D12 — uniões completas pertinentes, complemento novo

“Present” no bounded_claim herdado é uma descrição de resultado não vazio, não um discriminante literal prometido. As fontes mostram AtlasSnapshotResult = Union([AtlasEmpty, AtlasSnapshot]), AtlasReviewResult = Union([AtlasEmpty, AtlasReview]), AtlasIndexResult = Union([AtlasEmpty, AtlasIndexOk]) e AtlasMineResult = Union([AtlasEmpty, AtlasMineOk]); AtlasEmpty usa state: "empty", e os ramos snapshot/index/mine inspecionados usam state: "ok". AtlasReasoningResult também inclui state: "missing". Esta precisão não promove um resultado de transporte a recibo de execução nem altera o bounded_claim.

`packages/schema/src/atlas-screen.ts` — blob `e1709c1d7f25b68a8c7e2e0a86388994703112c6`, SHA256 `98bcb28c924bf204251cbbb0d4f47d0210d10e07f138fd2186dcc9350daa3fea`.

`D12-U08` L9–9
```ts
export const AtlasEmpty = Schema.Struct({ state: Schema.Literal("empty") }).annotate({ identifier: "AtlasEmpty" })
```

`D12-U08` L88–90
```ts
export const AtlasSnapshot = Schema.Struct({
  state: Schema.Literal("ok"),
  project: Schema.String,
```

`D12-U08` L128–136
```ts
export const AtlasSnapshotResult = Schema.Union([AtlasEmpty, AtlasSnapshot]).annotate({
  identifier: "AtlasSnapshotResult",
})

export const AtlasReasoningResult = Schema.Union([
  AtlasEmpty,
  Schema.Struct({ state: Schema.Literal("ok"), id: Schema.String, text: Schema.String }),
  Schema.Struct({ state: Schema.Literal("missing"), id: Schema.String }),
]).annotate({ identifier: "AtlasReasoningResult" })
```

`D12-U08` L307–320
```ts
export const AtlasReviewResult = Schema.Union([AtlasEmpty, AtlasReview]).annotate({ identifier: "AtlasReviewResult" })

/** Every review write (hold, release, propose, decide, answer, memory-decide, territory) answers this verdict. */
export const AtlasReviewWriteResult = Schema.Union([
  AtlasEmpty,
  Schema.Struct({
    ...VerdictFields,
    data: Schema.optional(Schema.Struct({ id: Schema.String })),
  }).annotate({ identifier: "AtlasReviewWrite" }),
]).annotate({ identifier: "AtlasReviewWriteResult" })

export const AtlasDelegateResult = Schema.Union([AtlasEmpty, AtlasDelegateOk]).annotate({
  identifier: "AtlasDelegateResult",
})
```

`D12-U08` L332–334
```ts
export const AtlasIndexResult = Schema.Union([AtlasEmpty, AtlasIndexOk]).annotate({ identifier: "AtlasIndexResult" })

export const AtlasMineResult = Schema.Union([AtlasEmpty, AtlasMineOk]).annotate({ identifier: "AtlasMineResult" })
```

`packages/schema/src/atlas-setup.ts` — blob `73f8ceecf7a353f7b7952c146cf8885dde18c144`, SHA256 `e16cfab589094bedb8d609d16bb63914de5daf3e74b5d152e137c45bf620c876`.

`D12-U09` L3–13
```ts
// D38 and D40 wire shapes (an absent value is `null`, never omitted). This file imports nothing from atlas-screen.ts; the
// unions that need `AtlasEmpty` live there.

export const AtlasIndexOk = Schema.Struct({
  state: Schema.Literal("ok"),
  ran: Schema.Boolean,
  tool: Schema.NullOr(Schema.String),
  exitCode: Schema.NullOr(Schema.Finite),
  documents: Schema.NullOr(Schema.Finite),
  message: Schema.NullOr(Schema.String),
}).annotate({ identifier: "AtlasIndex" })
```

`D12-U09` L21–28
```ts
export const AtlasMineOk = Schema.Struct({
  state: Schema.Literal("ok"),
  sites: Schema.Finite,
  facts: Schema.Finite,
  complete: Schema.Boolean,
  why: Schema.NullOr(Schema.String),
  refusal: Schema.NullOr(Schema.Literals(["contended", "unreadable", "untrusted"])),
}).annotate({ identifier: "AtlasMine" })
```

