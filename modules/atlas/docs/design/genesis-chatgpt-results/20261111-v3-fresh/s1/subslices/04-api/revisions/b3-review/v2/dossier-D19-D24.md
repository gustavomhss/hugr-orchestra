# S1-04 / B3 / D19–D24

Revisão de transporte v2: tabelas locais dos 190 membros copiadas byte a byte de `review-domain-disposition.md`; os campos e alegações locais não foram reescritos. A leitura integral indicada na origem pertence à produção B-v3 herdada. Esta revisão transporta evidência, sem criar aceite.

B3: propósito, contrato e delegação local; transporte sem novo julgamento/execução. Claims e gaps abaixo são exatos; Core/runtime amplos permanecem bloqueados.
Fonte `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocolo `ee2521a5b966bd505cc95bd1c733e09e12f33531`.
M<n> = `membership-exact.json#/domains/<n-1>`: 24 arrays/190 paths conferidos, nenhuma falta/duplicação/troca; hashes no manifesto. Não houve nova leitura integral dos190.
Q/P/G57 = suplemento herdado; U = complemento autorizado do baseline. Intervalos literais separados, sem elipse inserida. Comentários não são recibos.
Paths: S=`packages/schema/src/`; P=`packages/protocol/src/groups/`; H=`packages/server/src/handlers/`; R=`packages/server/src/`; T=`packages/sdk-next/src/`.

## D19 — RAG retrieval and task-bound research

Membership: M19; 8 paths exatos.

bounded_claim:

RAG declares lexical-only pipeline diagnostics and Research declares bound evidence/receipt/inquiry shapes. Protocol separates RAG operations from task-bound artifact reads. Server bridges RAG memory state and SQL through the session helper, while the research adapter obtains Session/project binding and rejects a returned receipt with another executionSessionID or taskId. Shapes/results are not proof of grounded answer quality.

conditional_gap:

RAG persistence atomicity/file policy/algorithms and Research storage integrity, budget/admission/publication truth require their implementations/runtime evidence.

Tabela local herdada (bytes exatos):

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

`Q077 · S:rag-studio.ts` L47–55
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

`Q078 · S:research.ts` L52–60
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

`U07 · S:research.ts` L405–408
```ts
/** Payloads of the ledger events I1 defines as research.inquiry.{opened,checked,closed} (J5.1). */
export const InquiryOpened = struct("Research.InquiryOpened", { binding: Binding, question: RecordRef, subquestions: list(RecordRef, 6) })
export const InquiryChecked = struct("Research.InquiryChecked", { binding: Binding, check: CheckResult })
export const InquiryClosed = struct("Research.InquiryClosed", { binding: Binding, card: CardV2 })
```

`P35 · P:rag-studio.ts` L11–18
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

`P40 · P:research-artifact.ts` L13–19
```ts
export const makeResearchArtifactGroup = <I extends HttpApiMiddleware.AnyId, S>(middleware: Context.Key<I, S>) =>
  HttpApiGroup.make("server.research")
    .add(HttpApiEndpoint.get("research.artifact", "/api/session/:sessionID/research/:artifactID", {
      params: Schema.Struct({ sessionID: SessionID, artifactID: Capability.ArtifactID }),
      query: Schema.Struct({ revision: Schema.NumberFromString.pipe(Schema.decodeTo(PositiveInt)), cursor: optional(Schema.String) }),
      success: Research.ArtifactPage,
      error: [ResearchArtifactNotFoundError, ConflictError, InvalidRequestError, ServiceUnavailableError],
```

`G57-E082 · H:rag-studio-session.ts` L18–23
```ts
export function session<A>(db: Database.Interface["db"], run: (store: Store, locationId: string) => Promise<A>) {
  return Effect.gen(function* () {
    const location = yield* Location.Service
    const locationId = location.directory
    const sources = yield* db.select().from(RagSourceTable).where(eq(RagSourceTable.location_id, locationId)).all().pipe(Effect.orDie)
    const chunks = yield* db.select().from(RagChunkTable).where(eq(RagChunkTable.location_id, locationId)).all().pipe(Effect.orDie)
```

`G57-E084 · H:rag-studio-session.ts` L61–65
```ts
    const store = memoryStore({
      projectRoot: location.project.directory,
      locationRoot: location.directory,
      files,
    })
```

`G57-E085 · H:rag-studio-session.ts` L132–135
```ts
    yield* Effect.promise(() => withStore(store, () => Promise.all(sources.map((row) => noteBytes(row.id)))))
    const result = yield* Effect.promise(() => withStore(store, () => run(store, locationId)))
    yield* save(db, store, locationId, revisionIds, questionIds)
    return result
```

`G57-E113 · H:research-artifact.ts` L16–25
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

## D20 — Guardrail contract and engine adapter

Membership: M20; 3 paths exatos.

bounded_claim:

Guardrail schemas and Protocol endpoints distinguish rules, run reports and engine errors. Server delegates rules/run to Guardrail.Service and maps the engine error. This identifies the product boundary without asserting a guard ran or applying its result as a Genesis verdict.

conditional_gap:

Rule selection, universal enforcement, engine correctness and observed outcomes remain their own implementation/runtime obligations.

Tabela local herdada (bytes exatos):

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/guardrail.ts` | Rules e run/reports com erro400 kind/message e descrição de baseline merge-base. | P21 |
| `packages/schema/src/guardrail.ts` | Rules, findings and engine acquisition/report errors are DTOs. | Q087 |
| `packages/server/src/handlers/guardrail.ts` | Expose Guardrail rule discovery and requested engine runs. | G57-E046, G57-E047 |

`Q087 · S:guardrail.ts` L5–7
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

`P21 · P:guardrail.ts` L8–17
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

`G57-E046 · H:guardrail.ts` L11–24
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

`G57-E047 · H:guardrail.ts` L30–32
```ts
function apiError(error: Guardrail.EngineError) {
  return new GuardrailError({ name: "GuardrailError", data: { kind: error.kind, message: error.message } })
}
```

## D21 — Catalog exports, notifications, health and upgrade

Membership: M21; 10 paths exatos.

bounded_claim:

Shared exports and IDE/plugin/server/TUI/installation events declare notification data, not side effects. Health returns a basic literal healthy/version process response; it is not a downstream readiness probe. Installation delegates upgrade and reports the requested target after success, which is not a separate installed-version measurement.

conditional_gap:

Notification delivery, UI behavior, software installation integrity and runtime health/upgrade success require actual implementation/execution evidence.

Tabela local herdada (bytes exatos):

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

`Q089 · S:index.ts` L1–3
```ts
export { Agent } from "./agent"
export { Actions } from "./actions"
export { AgentFile } from "./agent-file"
```

`Q090 · S:plugin.ts` L9–13
```ts
const Added = define({
  type: "plugin.added",
  schema: { id: ID },
})
export const Event = { Added, Definitions: inventory(Added) }
```

`Q091 · S:server-event.ts` L5–7
```ts
export const Connected = Event.define({ type: "server.connected", schema: {} })

export const Definitions = Event.inventory(Connected)
```

`Q092 · S:ide-event.ts` L6–11
```ts
export const Installed = Event.define({
  type: "ide.installed",
  schema: {
    ide: Schema.String,
  },
})
```

`Q093 · S:tui-event.ts` L11–11
```ts
export const PromptAppend = Event.define({ type: "tui.prompt.append", schema: { text: Schema.String } })
```

`Q094 · S:installation-event.ts` L6–18
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

`P22 · P:health.ts` L5–11
```ts
  HttpApiEndpoint.get("health.get", "/api/health", {
    success: Schema.Struct({
      healthy: Schema.Literal(true),
      pid: Schema.optional(Schema.Int),
      version: Schema.String,
    }),
  }).annotateMerge(
```

`P23 · P:installation.ts` L5–10
```ts
export const InstallationGroup = HttpApiGroup.make("server.installation").add(
  HttpApiEndpoint.post("installation.upgrade", "/api/installation/upgrade", {
    payload: Schema.Struct({ target: Schema.String }),
    success: Schema.Struct({ success: Schema.Literal(true), version: Schema.String }),
    error: [InvalidRequestError, UnknownError],
  }).annotateMerge(
```

`G57-E048 · H:health.ts` L6–9
```ts
export const HealthHandler = HttpApiBuilder.group(Api, "server.health", (handlers) =>
  handlers.handle("health.get", () =>
    Effect.succeed({ healthy: true as const, pid: process.pid, version: InstallationVersion }),
  ),
```

`G57-E049 · H:installation.ts` L9–22
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

## D22 — HTTP origin and static UI boundary

Membership: M22; 2 paths exatos.

bounded_claim:

CORS helpers define origin predicates and Vary behavior separately from credential authority. Web UI serves static files/SPA fallback through lexical path resolution and HTML policy. The inspected helper does not supply a general symlink/TOCTOU confinement proof.

conditional_gap:

Complete origin security, malicious-filesystem confinement and actual browser/runtime behavior remain blocked for claims that need them.

Tabela local herdada (bytes exatos):

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/server/src/cors.ts` | Define CORS/request-origin predicates and repair the response Vary header for dynamically echoed origins. | G57-E005, G57-E006, G57-E007 |
| `packages/server/src/web-ui.ts` | Serve the built static UI with HTML CSP and SPA fallback outside API routing. | G57-E139, G57-E140 |

`G57-E005 · R:cors.ts` L10–31
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

`G57-E007 · R:cors.ts` L55–66
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

`G57-E139 · R:web-ui.ts` L30–46
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

`G57-E140 · R:web-ui.ts` L52–55
```ts
async function exists(file: string) {
  const stat = await Bun.file(file).stat().catch(() => undefined)
  return stat?.isFile() ?? false
}
```

## D23 — ELF byte admission helper

Membership: M23; 1 paths exatos.

bounded_claim:

Elf is executable pure byte-inspection code, not a DTO-only module: it parses ELF64 little-endian program metadata and compares needed libc names. It performs no filesystem/process/module loading itself.

conditional_gap:

Authenticity, arbitrary-loader safety and packaged-runtime compatibility require the relevant producer/loader and execution evidence.

Tabela local herdada (bytes exatos):

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/schema/src/elf.ts` | Pure ELF64-LE byte admission and libc dependency check. | Q088 |

`Q088 · S:elf.ts` L3–15
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

## D24 — SDK Core tool facade

Membership: M24; 1 paths exatos.

bounded_claim:

The complete two-line SDK module reexports Core tool values and types, supplying no independent registration/execution implementation. It fits the existing sdk-composition body’s returned tool-registration interface.

conditional_gap:

New claims about Core tool registration/execution must read that implementation; no runtime tool operation was performed.

Tabela local herdada (bytes exatos):

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/sdk-next/src/tool.ts` | Complete Core tool value/type reexport facade. | Q095 |

`Q095 · T:tool.ts` L1–2
```ts
export { Failure, RegistrationError, make } from "@orchestra/core/tool/tool"
export type { AnyTool, Content, Context, Definition } from "@orchestra/core/tool/tool"
```

