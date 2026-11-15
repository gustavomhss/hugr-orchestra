# B3/v4 — revisão da redução explícita — D19–D24

Critério: disposição de domínio com membership exato, propósito/contrato/owner, evidência ou gap obrigatório e razão da profundidade. A revisão retira os claims locais detalhados da tabela antiga do corpo promovido, sem retirar paths, domínios ou necessidades. Os dois juízes decidem se a forma reduzida cumpre a necessidade congelada; o produtor não concede PASS. B1/B2 permanecem fora desta mudança; D07 preserva seus campos e membros.

Disposição das especificidades retiradas: `RETIRED_EXTRA_CLAIM`; suas lacunas não são declaradas resolvidas por fonte. Lacunas de bounded_claims retidos continuam obrigatórias.

Corpo único: `domain-disposition.md`, 38062 bytes, SHA256 `36339a1329421f80d15e37b40ce26edd6e1c793a0ac1b5056471e4df2bfed57c`. Histórico original preservado: 65726 bytes, SHA256 `95b17106dc5c26bb6d39c8d2d80b48fca8f75d35fe4f5f8ec3f232c7d71411c3`. As linhas antigas não são evidência nova nem claims atuais; disposição individual em `retired-row-claims.json`.

Este lote é autossuficiente para os claims de domínio: os literais decisivos seguem após as seções exatas do corpo. Nenhum endpoint/campo incidental da tabela antiga é claim deste v4.

## Regras comuns aos 24 domínios

Os três campos a seguir são idênticos nos 24 registros herdados e aplicam-se integralmente a cada domínio; aparecem uma vez para evitar repetição.

**Necessidade L1 (herdada):** Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

**Dependentes bloqueados (herdado):** Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

**Profundidade e razão de adequação (herdadas):** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

As expressões de leitura “now” e “was read in full” pertencem ao registro histórico B-v3, não declaram uma releitura nesta revisão. O contrato/owner específico e o limite de aplicação desta profundidade são o bounded_claim e o conditional_gap de cada domínio abaixo.

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

## Literais decisivos do lote

### D19

`packages/schema/src/rag-studio.ts` — blob `b553ee9dc72cbb7d87ff01eba7cb7608a5ab89df`.

`Q077` L47–55
```ts
export interface Pipeline extends Schema.Schema.Type<typeof Pipeline> {}
export const Pipeline = Schema.Struct({
  parser: Schema.String,
  boundary: Schema.String,
  tokenizer: Schema.String,
  lexical: Schema.Literal(true),
  embedding: Schema.Literal(false),
  k: Schema.Int,
}).annotate({ identifier: "RagStudioPipeline" })
```

`packages/schema/src/research.ts` — blob `f865f7cd4cd76eb7e89f562c155d8593b69af369`.

`Q078` L52–60
```ts
export const Binding = struct("Research.Binding", {
  projectID: Project.ID,
  memberID: Schema.Literal("jimmy"),
  taskId: text(256),
  executionSessionID: SessionID,
  authoritySessionID: SessionID,
  directory: AbsolutePath,
  worktree: AbsolutePath,
})
```

`Q078` L87–94
```ts
export const SourceRef = struct("Research.SourceRef", {
  artifact: Capability.ArtifactRef,
  representation: Representation,
  digest: Digest,
})
export type SourceRef = typeof SourceRef.Type
export const EvidenceRef = struct("Research.EvidenceRef", { source: SourceRef, locator: Locator })
export type EvidenceRef = typeof EvidenceRef.Type
```

`Q078` L100–107
```ts
export const SourceReceipt = struct("Research.SourceReceipt", {
  binding: Binding,
  ref: SourceRef,
  origin: struct("Research.SourceOrigin", {
    kind: Schema.Literals(["file", "url", "tool-output", "atlas-own"]),
    uri: text(8192),
    revision: optional(text(256)),
  }),
```

`U07` L405–408
```ts
/** Payloads of the ledger events I1 defines as research.inquiry.{opened,checked,closed} (J5.1). */
export const InquiryOpened = struct("Research.InquiryOpened", { binding: Binding, question: RecordRef, subquestions: list(RecordRef, 6) })
export const InquiryChecked = struct("Research.InquiryChecked", { binding: Binding, check: CheckResult })
export const InquiryClosed = struct("Research.InquiryClosed", { binding: Binding, card: CardV2 })
```

`packages/protocol/src/groups/rag-studio.ts` — blob `d0abf2ac581e1e560e6cc3769bdf6b5afd51ea36`.

`P35` L11–18
```ts
// Rag Studio over the requested Location. Embedding stays off. Project source is refused as Atlas.
export const RagStudioGroup = HttpApiGroup.make("server.ragStudio")
  .add(
    HttpApiEndpoint.get("ragStudio.sources", "/api/rag-studio/sources", {
      query: LocationQuery,
      success: Location.response(Schema.Array(RagStudio.Source)),
      error: ServiceUnavailableError,
    }).annotateMerge(locationQueryOpenApi),
```

`packages/protocol/src/groups/research-artifact.ts` — blob `517434f6b238a90ee46da5790343c4c0f58b4cd5`.

`P40` L13–19
```ts
export const makeResearchArtifactGroup = <I extends HttpApiMiddleware.AnyId, S>(middleware: Context.Key<I, S>) =>
  HttpApiGroup.make("server.research")
    .add(HttpApiEndpoint.get("research.artifact", "/api/session/:sessionID/research/:artifactID", {
      params: Schema.Struct({ sessionID: SessionID, artifactID: Capability.ArtifactID }),
      query: Schema.Struct({ revision: Schema.NumberFromString.pipe(Schema.decodeTo(PositiveInt)), cursor: optional(Schema.String) }),
      success: Research.ArtifactPage,
      error: [ResearchArtifactNotFoundError, ConflictError, InvalidRequestError, ServiceUnavailableError],
```

`packages/server/src/handlers/rag-studio-session.ts` — blob `42a0cb7a6250df1edc566fa0409dde0463f29639`.

`G57-E082` L18–23
```ts
export function session<A>(db: Database.Interface["db"], run: (store: Store, locationId: string) => Promise<A>) {
  return Effect.gen(function* () {
    const location = yield* Location.Service
    const locationId = location.directory
    const sources = yield* db.select().from(RagSourceTable).where(eq(RagSourceTable.location_id, locationId)).all().pipe(Effect.orDie)
    const chunks = yield* db.select().from(RagChunkTable).where(eq(RagChunkTable.location_id, locationId)).all().pipe(Effect.orDie)
```

`G57-E084` L61–65
```ts
    const store = memoryStore({
      projectRoot: location.project.directory,
      locationRoot: location.directory,
      files,
    })
```

`G57-E085` L132–135
```ts
    yield* Effect.promise(() => withStore(store, () => Promise.all(sources.map((row) => noteBytes(row.id)))))
    const result = yield* Effect.promise(() => withStore(store, () => run(store, locationId)))
    yield* save(db, store, locationId, revisionIds, questionIds)
    return result
```

`packages/server/src/handlers/research-artifact.ts` — blob `fe08e43a395c59631633353043bbd724adf03451`.

`G57-E113` L16–25
```ts
    return handlers.handle("research.artifact", (ctx) => Effect.gen(function* () {
      const session = yield* database.db.select({ projectID: SessionTable.project_id }).from(SessionTable)
        .where(eq(SessionTable.id, ctx.params.sessionID)).get().pipe(Effect.orDie)
      if (!session) return yield* new ResearchArtifactNotFoundError({ message: "Research artifact not found" })
      const binding = yield* ResearchBinding.resolve(ctx.params.sessionID, session.projectID)
      const page = yield* artifacts.read(binding, { id: ctx.params.artifactID, revision: ctx.query.revision }, ctx.query.cursor, "task")
      if (page.receipt.binding.executionSessionID !== binding.executionSessionID || page.receipt.binding.taskId !== binding.taskId)
        return yield* new ResearchArtifactNotFoundError({ message: "Research artifact not found" })
      return page
    }).pipe(
```

### D20

`packages/schema/src/guardrail.ts` — blob `1f9e89fb3ec9259b12d268e17103bd19a2658bee`.

`Q087` L5–7
```ts
// Guardrail: declarative CI guard rules (script/guards) judged against a change. These shapes mirror the
// engine's `--rules` and `--json` output, which is the contract the app screen is built on.
export const Severity = Schema.Literals(["gate", "warn"]).annotate({ identifier: "Guardrail.Severity" })
```

`Q087` L77–86
```ts
export const Report = Schema.Struct({
  base: Schema.NullOr(Schema.String),
  bootstrap: Schema.Boolean,
  rules: Schema.Int,
  files: Schema.Int,
  // Gate findings first, then by path and line.
  findings: Schema.Array(Finding),
  errors: Schema.Array(RunError),
  approved: Schema.Array(Schema.String),
  touchesGuards: Schema.Boolean,
```

`Q087` L96–100
```ts
// The engine could not be started at all, as opposed to running and reporting `errors`.
export const EngineErrorKind = Schema.Literals(["no-engine", "no-bun", "failed", "unreadable"]).annotate({
  identifier: "Guardrail.EngineErrorKind",
})
export type EngineErrorKind = typeof EngineErrorKind.Type
```

`packages/protocol/src/groups/guardrail.ts` — blob `a9c3d5c6643d271619f61f68444dca1fc5adcbc6`.

`P21` L8–17
```ts
export class GuardrailError extends Schema.ErrorClass<GuardrailError>("GuardrailError")(
  {
    name: Schema.Literal("GuardrailError"),
    data: Schema.Struct({
      kind: Guardrail.EngineErrorKind,
      message: Schema.String,
    }),
  },
  { httpApiStatus: 400 },
) {}
```

`P21` L21–24
```ts
    HttpApiEndpoint.get("guardrail.rules", "/api/guardrail/rules", {
      query: LocationQuery,
      success: Location.response(Guardrail.Rules),
      error: GuardrailError,
```

`packages/server/src/handlers/guardrail.ts` — blob `b3348283ee22836d8ff08f2237574fd5b82931bc`.

`G57-E046` L11–24
```ts
      .handle("guardrail.rules", () =>
        response(
          Effect.gen(function* () {
            const guardrail = yield* Guardrail.Service
            return yield* guardrail.rules().pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("guardrail.run", (ctx) =>
        response(
          Effect.gen(function* () {
            const guardrail = yield* Guardrail.Service
            return yield* guardrail.run(ctx.payload).pipe(Effect.mapError(apiError))
          }),
```

`G57-E047` L30–32
```ts
function apiError(error: Guardrail.EngineError) {
  return new GuardrailError({ name: "GuardrailError", data: { kind: error.kind, message: error.message } })
}
```

### D21

`packages/schema/src/index.ts` — blob `cfd60052ec047b947dd7c9cb9bc534cc02b9d1c5`.

`Q089` L1–3
```ts
export { Agent } from "./agent"
export { Actions } from "./actions"
export { AgentFile } from "./agent-file"
```

`packages/schema/src/plugin.ts` — blob `c23f79582e37f4d2924d5b6cf869fa0ad0f5f629`.

`Q090` L9–13
```ts
const Added = define({
  type: "plugin.added",
  schema: { id: ID },
})
export const Event = { Added, Definitions: inventory(Added) }
```

`packages/schema/src/server-event.ts` — blob `138d0cf5f699b775af573b32d99e924af4a54a4f`.

`Q091` L5–7
```ts
export const Connected = Event.define({ type: "server.connected", schema: {} })

export const Definitions = Event.inventory(Connected)
```

`packages/schema/src/ide-event.ts` — blob `ca4218602143882beaff4dc3f2990497a6f025e9`.

`Q092` L6–11
```ts
export const Installed = Event.define({
  type: "ide.installed",
  schema: {
    ide: Schema.String,
  },
})
```

`packages/schema/src/tui-event.ts` — blob `28952dcfa3197d670e072f542ab758c45cc4be70`.

`Q093` L11–11
```ts
export const PromptAppend = Event.define({ type: "tui.prompt.append", schema: { text: Schema.String } })
```

`packages/schema/src/installation-event.ts` — blob `69ecf670846871ca50cbefe66de442fe0faea754`.

`Q094` L6–18
```ts
export const Updated = Event.define({
  type: "installation.updated",
  schema: {
    version: Schema.String,
  },
})

export const UpdateAvailable = Event.define({
  type: "installation.update-available",
  schema: {
    version: Schema.String,
  },
})
```

`packages/protocol/src/groups/health.ts` — blob `be777a5f8d482fcb5f3b06c1a21077e2fc452bb5`.

`P22` L5–11
```ts
  HttpApiEndpoint.get("health.get", "/api/health", {
    success: Schema.Struct({
      healthy: Schema.Literal(true),
      pid: Schema.optional(Schema.Int),
      version: Schema.String,
    }),
  }).annotateMerge(
```

`packages/protocol/src/groups/installation.ts` — blob `ea13ec670bb99929cc76dcfdccc0c481870dcc0b`.

`P23` L5–10
```ts
export const InstallationGroup = HttpApiGroup.make("server.installation").add(
  HttpApiEndpoint.post("installation.upgrade", "/api/installation/upgrade", {
    payload: Schema.Struct({ target: Schema.String }),
    success: Schema.Struct({ success: Schema.Literal(true), version: Schema.String }),
    error: [InvalidRequestError, UnknownError],
  }).annotateMerge(
```

`packages/server/src/handlers/health.ts` — blob `2de8e84ad6fe8833aaf3843ff0d292de49bd825a`.

`G57-E048` L6–9
```ts
export const HealthHandler = HttpApiBuilder.group(Api, "server.health", (handlers) =>
  handlers.handle("health.get", () =>
    Effect.succeed({ healthy: true as const, pid: process.pid, version: InstallationVersion }),
  ),
```

`packages/server/src/handlers/installation.ts` — blob `5f877ca7ccfc706ed9ca1e1c8cc9ac6971c698c2`.

`G57-E049` L9–22
```ts
    const installation = yield* Installation.Service
    return handlers.handle(
      "installation.upgrade",
      Effect.fn(function* (ctx) {
        const method = yield* installation.method()
        if (method === "unknown")
          return yield* new InvalidRequestError({
            message: "Unknown installation method",
            kind: "installation_unknown",
          })
        yield* installation
          .upgrade(method, ctx.payload.target)
          .pipe(Effect.mapError((error) => new UnknownError({ message: error.stderr })))
        return { success: true as const, version: ctx.payload.target }
```

### D22

`packages/server/src/cors.ts` — blob `767f94807b1c6437467f6f1e35bd784fbd004b16`.

`G57-E005` L10–31
```ts
export function isAllowedCorsOrigin(input: string | undefined, opts?: CorsOptions) {
  if (!input) return true
  if (input.startsWith("http://localhost:")) return true
  if (input.startsWith("http://127.0.0.1:")) return true
  if (input.startsWith("oc://renderer")) return true
  if (input === "tauri://localhost" || input === "http://tauri.localhost" || input === "https://tauri.localhost")
    return true
  return opts?.cors?.includes(input) ?? false
}

export function isAllowedRequestOrigin(input: string | undefined, host: string | undefined, opts?: CorsOptions) {
  if (!input) return true
  if (host && sameHost(input, host)) return true
  return isAllowedCorsOrigin(input, opts)
}

function sameHost(origin: string, host: string) {
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
```

`G57-E007` L55–66
```ts
    Effect.gen(function* () {
      const response = yield* effect
      const allowOrigin = response.headers["access-control-allow-origin"]
      if (!allowOrigin || allowOrigin === "*") return response

      const vary = response.headers["vary"]
      if (!vary) return HttpServerResponse.setHeader(response, "vary", "Origin")

      const tokens = vary.split(",").map((s) => s.trim().toLowerCase())
      if (tokens.includes("origin") || tokens.includes("*")) return response

      return HttpServerResponse.setHeader(response, "vary", `${vary}, Origin`)
```

`packages/server/src/web-ui.ts` — blob `6bdd0f2213ecb53ca74ac935c0a16da1198fae77`.

`G57-E139` L30–46
```ts
export function layer(root: string) {
  const base = path.resolve(root)
  return HttpRouter.add(
    "GET",
    "/*",
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname)
      const requested = path.resolve(base, "." + pathname)
      // A path that climbs out of the root is answered like a missing file, never read.
      const inside = requested === base || requested.startsWith(base + path.sep)
      return yield* Effect.promise(async () => {
        const file = inside && (await exists(requested)) ? requested : path.join(base, "index.html")
        const body = new Uint8Array(await Bun.file(file).arrayBuffer())
        const headers = new Headers({ "content-type": Bun.file(file).type })
        if (file.endsWith(".html")) headers.set("content-security-policy", cspForHtml(new TextDecoder().decode(body)))
        return HttpServerResponse.raw(body, { headers })
```

`G57-E140` L52–55
```ts
async function exists(file: string) {
  const stat = await Bun.file(file).stat().catch(() => undefined)
  return stat?.isFile() ?? false
}
```

### D23

`packages/schema/src/elf.ts` — blob `18147b545a3acecee29244bfa5c7ca26e4c9c323`.

`Q088` L3–15
```ts
// Pure ELF64 byte admission shared by producers and packaged runtime loaders.
// No filesystem, process, platform detection or module loading at this boundary.
export function inspect(bytes: Uint8Array, label = "ELF bytes") {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const span = (offset: number, size: number) => {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || offset + size > bytes.length)
      throw new Error(`ELF_TRUNCATED: ${label}`)
    return offset
  }
  span(0, 64)
  if (![127, 69, 76, 70, 2, 1, 1].every((value, i) => bytes[i] === value) || view.getUint16(54, true) !== 56 ||
      ![2, 3].includes(view.getUint16(16, true)) || view.getUint32(20, true) !== 1)
    throw new Error(`ELF64_UNSUPPORTED: ${label}`)
```

`Q088` L72–89
```ts
  if ((tables.length || sizes.length || needed.length) && (tables.length !== 1 || sizes.length !== 1))
    throw new Error(`ELF_STRING_TABLE_INVALID: ${label}`)
  const table = tables.length ? mapped(tables[0]!, sizes[0]!) : undefined
  const dependencies = needed.map((n) => {
    if (table === undefined || n >= sizes[0]!) throw new Error(`ELF_STRING_TABLE_INVALID: ${label}`)
    return strings(table + Number(n), Number(sizes[0]! - n))
  })
  return { machine: view.getUint16(18, true), interpreter, needed: dependencies }
}

export function requireLibc(bytes: Uint8Array, expected: "musl" | "glibc", label = "ELF bytes") {
  const elf = inspect(bytes, label)
  const musl = elf.needed.some((name) => /^(?:libc\.musl-(?:x86_64|aarch64)\.so\.1|ld-musl-(?:x86_64|aarch64)\.so\.1|libc\.so)$/.test(name))
  const glibc = elf.needed.includes("libc.so.6")
  if (expected === "musl" ? !musl || glibc : !glibc || musl)
    throw new Error(`ELF_LIBC_MISMATCH: ${label}: expected ${expected}; needed ${JSON.stringify(elf.needed)}`)
  return elf
}
```

### D24

`packages/sdk-next/src/tool.ts` — blob `3250ee802f6aeb08799db7b124140ca1aa274292`.

`Q095` L1–2
```ts
export { Failure, RegistrationError, make } from "@orchestra/core/tool/tool"
export type { AnyTool, Content, Context, Definition } from "@orchestra/core/tool/tool"
```

