## C39 — `packages/protocol/src/groups/actions-transfer.ts`

Git blob `e39a1a8900b6808f0a80be14af702b14c3dc3c44`.

Lines 10–17:

```
export const ActionsTransferGroup = HttpApiGroup.make("server.actionsTransfer")
  .add(HttpApiEndpoint.get("actions.transfer.info", "/api/actions/transfer/:bindingID/info", {
    params: BindingParams, query: TransferQuery, success: Location.response(Actions.TransferInfo), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.get("actions.transfer.read", "/api/actions/transfer/:bindingID", {
    params: BindingParams, query: TransferQuery,
    success: Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array()), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
```

## C40 — `packages/client/script/build.ts`

Git blob `99ae2184b9c13f6175d7ba8e3025068bee07ee4f`.

Lines 1–12:

```
import { NodeFileSystem } from "@effect/platform-node"
import { compile, emitEffectImported, emitPromise, write } from "@orchestra/httpapi-codegen"
import { ClientApi, endpointNames, groupNames, omitEndpoints } from "../src/contract"
import { Effect } from "effect"
import { fileURLToPath } from "url"

const contract = compile(ClientApi, { groupNames, endpointNames, omitEndpoints })
const splitGroups = new Set([
  "research",
  "schedules",
  "actionsBindings",
  "actionsOperations",
```

Lines 28–48:

```
          outputTypes: {
            "sessions.events": {
              name: "SessionEventEncoded",
              import: 'import type { SessionEventEncoded } from "../wire"',
            },
            "events.subscribe": {
              name: "OrchestraEventEncoded",
              import: 'import type { OrchestraEventEncoded } from "@orchestra/protocol/groups/event"',
            },
          },
        }),
        fileURLToPath(new URL("../src/generated", import.meta.url)),
      ),
      write(
        emitEffectImported(contract, { module: "../contract", api: "ClientApi" }, { splitGroups }),
        fileURLToPath(new URL("../src/generated-effect", import.meta.url)),
      ),
    ],
    { concurrency: 2, discard: true },
  ).pipe(Effect.provide(NodeFileSystem.layer)),
)
```

## C41 — `tooling/httpapi-codegen/src/index.ts`

Git blob `0467e68001715795e0851cf5d8a8b3dad1d75126`.

Lines 75–82:

```
export function compile<Id extends string, Groups extends HttpApiGroup.Any>(
  api: HttpApi.HttpApi<Id, Groups>,
  options?: {
    readonly groupNames?: Readonly<Record<string, string>>
    readonly endpointNames?: Readonly<Record<string, string>>
    readonly omitEndpoints?: ReadonlySet<string>
  },
): Contract {
```

Lines 89–99:

```
      if (options?.omitEndpoints?.has(endpoint.name)) return
      const groupName = options?.groupNames?.[group.identifier] ?? group.identifier
      const name = `${groupName}.${endpoint.name}`
      const required = Array.from(middleware).find((item) => item.requiredForClient)
      if (required !== undefined) {
        throw new GenerationError({ reason: `Client middleware requires adapter: ${required.key}` })
      }

      const successSchemas = Array.from(endpoint.success)
      if (successSchemas.length === 0) successSchemas.push(HttpApiSchema.NoContent)
      if (successSchemas.length > 1) throw new GenerationError({ reason: `Multiple success schemas: ${name}` })
```

Lines 105–123:

```
      if (sourcePayloads.length > 1) {
        throw new GenerationError({ reason: `Multiple payload schemas: ${name}` })
      }
      const payloads = sourcePayloads.map((schema) => normalizeTransport(schema, "payload", endpoint, name)!)
      const success = normalizeTransport(successSchemas[0], "success", endpoint, name)!
      const errorSchemas = Array.from(errors).flatMap(([status, schemas]) =>
        schemas.map((schema) => ({ status, ...normalizeTransport(schema, "error", endpoint, name)! })),
      )
      const inputs = [
        ...inputFields(params?.schema, "params", name),
        ...inputFields(query?.schema, "query", name),
        ...inputFields(headers?.schema, "headers", name),
        ...payloads.flatMap((item) => inputFields(item.schema, "payload", name)),
      ]
      const names = new Set<string>()
      for (const field of inputs) {
        if (names.has(field.name)) throw new GenerationError({ reason: `Input field collision: ${field.name}` })
        names.add(field.name)
      }
```

Lines 150–159:

```
        input: inputs,
        unwrapData: isDataEnvelope(success.schema),
        binary: resolveHttpApiEncoding(success.schema.ast)?._tag === "Uint8Array",
        successes: [success.schema],
        errors: errorSchemas.map((item) => ({ status: item.status, schema: item.schema })),
        effectPortable,
        operation: {
          group: groupName,
          name: options?.endpointNames?.[endpoint.name] ?? clientEndpointName(endpoint.name),
          input: inputs.map(({ name, source }) => ({ name, source })),
```

Lines 212–219:

```
    groups,
  }
}

export function emitEffect(contract: Contract): Output {
  const endpoint = contract.groups.flatMap((group) => group.endpoints).find((endpoint) => !endpoint.effectPortable)
  if (endpoint !== undefined) {
    throw new GenerationError({
```

Lines 318–343:

```
function assertPromiseEndpoint(endpoint: Endpoint) {
  const name = `${endpoint.group}.${endpoint.endpoint.name}`
  const payload = endpoint.payloads[0]
  const payloadEncoding = payload === undefined ? undefined : resolveHttpApiEncoding(payload.ast)
  if (
    payload !== undefined &&
    (payloadEncoding?._tag ?? (HttpMethod.hasBody(endpoint.endpoint.method) ? "Json" : "FormUrlEncoded")) !== "Json"
  ) {
    throw new GenerationError({ reason: `Unsupported Promise payload encoding: ${name}` })
  }
  const success = endpoint.successes[0]
  const successEncoding = resolveHttpApiEncoding(success.ast)?._tag ?? "Json"
  if (isStreamSchema(success)) {
    if (
      success._tag !== "StreamSse" ||
      success.sseMode !== "data" ||
      !SchemaAST.isNever(Schema.toType(success.error).ast)
    ) {
      throw new GenerationError({ reason: `Unsupported Promise stream: ${name}` })
    }
  } else if (
    !HttpApiSchema.isNoContent(success.ast) &&
    successEncoding !== "Json" &&
    successEncoding !== "Uint8Array"
  ) {
    throw new GenerationError({ reason: `Unsupported Promise success encoding: ${name}` })
```

Lines 698–704:

```
    for (const file of files) {
      if (!isSafeOutputPath(file.path)) yield* new GenerationError({ reason: `Unsafe output path: ${file.path}` })
      const path = file.path.toLowerCase()
      if (normalizedPaths.has(path)) yield* new GenerationError({ reason: `Duplicate output path: ${file.path}` })
      normalizedPaths.add(path)
      paths.add(file.path)
    }
```

Lines 714–719:

```
    if (previous.some((path) => !isSafeOutputPath(path))) {
      yield* new GenerationError({ reason: `Invalid generated file manifest: ${manifest}` })
    }
    yield* Effect.forEach(
      previous.filter((path) => !paths.has(path)),
      (path) => fs.remove(join(directory, path), { force: true }),
```

Lines 727–739:

```
          Effect.flatMap((info) =>
            info?.type === "SymbolicLink"
              ? new GenerationError({ reason: `Unsafe output path: ${file.path}` })
              : Effect.void,
          ),
        ),
      { concurrency: 8, discard: true },
    )
    yield* Effect.forEach(files, (file) => fs.writeFileString(join(directory, file.path), file.content), {
      concurrency: 8,
      discard: true,
    })
    yield* fs.writeFileString(manifest, JSON.stringify(files.map((file) => file.path).sort(), null, 2) + "\n")
```

Lines 743–745:

```
function isSafeOutputPath(path: string) {
  return path !== manifestName && !isAbsolute(path) && path !== "." && path !== ".." && !/[\\/]/.test(path)
}
```

Lines 757–763:

```
function inputFields(schema: Schema.Top | undefined, source: InputField["source"], operation: string) {
  if (schema === undefined) return []
  const ast = Schema.toType(schema).ast
  if (!SchemaAST.isObjects(ast) || ast.indexSignatures.length > 0) {
    throw new GenerationError({ reason: `Input schema must be a struct: ${operation}.${source}` })
  }
  return ast.propertySignatures.map((field) => {
```

Lines 946–955:

```
function isDataEnvelope(schema: Schema.Top) {
  if (isStreamSchema(schema) || HttpApiSchema.isNoContent(schema.ast)) return false
  const ast = Schema.toType(schema).ast
  return (
    SchemaAST.isObjects(ast) &&
    ast.indexSignatures.length === 0 &&
    ast.propertySignatures.length === 1 &&
    ast.propertySignatures[0]?.name === "data"
  )
}
```

## C42 — `tooling/httpapi-codegen/src/imported-effect.ts`

Git blob `6434e356b20197746aa9f0bbd5727ab80dcdd831`.

Lines 58–64:

```
  const imports =
    projection === undefined
      ? `import { ${api} } from ${JSON.stringify(options.module)}`
      : `import { HttpApi, HttpApiClient${"endpoints" in options ? ", HttpApiGroup" : ""} } from "effect/unstable/httpapi"\nimport { ${projection.imports.join(", ")} } from ${JSON.stringify(options.module)}`
  const httpApiImport = projection === undefined ? 'import { HttpApiClient } from "effect/unstable/httpapi"\n' : ""
  const usesStream = groups.some((group) => group.endpoints.some((item) => item.operation.success === "stream"))
  const mapper = `const mapClientError = <E>(error: E) => HttpClientError.isHttpClientError(error) || Schema.isSchemaError(error) || Sse.Retry.is(error) ? new ClientError({ cause: error }) : error`
```

## C43 — `tooling/httpapi-codegen/src/effect-headers.ts`

Git blob `e2e2c1da3504df7c8080aa2a9efe31d00816f92c`.

Lines 8–12:

```
  const formHeaders = Object.fromEntries(Object.entries(headers).filter(([name]) => name !== "content-type"))
  return HttpApiClient.make(${api}, {
    baseUrl: options.baseUrl,
    transformClient: (client) => HttpClient.mapRequest(client, (request) =>
      HttpClientRequest.setHeaders(request, { ...(request.body._tag === "FormData" ? formHeaders : headers), ...request.headers })),
```

Lines 21–29:

```
  const entries = Object.entries(Object.getOwnPropertyDescriptors(input)).flatMap(([name, descriptor]) => {
    if (!/^[!#$%&'*+.^_|~0-9A-Za-z\\x60-]+$/.test(name) || !("value" in descriptor) ||
      typeof descriptor.value !== "string" || /[\\r\\n]/.test(descriptor.value)) {
      throw new TypeError("Invalid client headers")
    }
    return descriptor.enumerable ? [[name, descriptor.value] as const] : []
  })
  try {
    return Object.freeze(Object.fromEntries(new Headers(Object.fromEntries(entries))))
```

## C44 — `tooling/httpapi-codegen/src/layout.ts`

Git blob `b14d3a3f669e096c4e72d1fd2ad65ed8c483826f`.

Lines 98–103:

```
    printWidth: 120,
  })
  if (!file.boundedTypes || physicalLines(formatted) <= 400) return [{ path: file.path, content: formatted }]
  const ast: unknown = Reflect.apply(parsers.typescript.parse, undefined, [formatted, {}])
  if (!isNode(ast) || !Array.isArray(ast.body)) {
    throw new GenerationError({ reason: `Invalid bounded type layout: ${file.path}` })
```

Lines 151–161:

```
    const candidate = await print(render([...current, node], provisional))
    if (physicalLines(candidate) <= 350) {
      current.push(node)
      continue
    }
    const single = await print(render([node], provisional))
    if (physicalLines(single) > 400) {
      throw new GenerationError({
        reason: `Promise declaration exceeds 400 lines: ${file.path}:${declarationName(node)}`,
      })
    }
```

Lines 188–190:

```
  const oversized = files.find((part) => physicalLines(part.content) > 400)
  if (oversized) throw new GenerationError({ reason: `Promise type layout exceeds 400 lines: ${oversized.path}` })
  return files
```

## C45 — `packages/sdk-next/src/orchestra.ts`

Git blob `0a8009ba9ac8d51b0a0c27363786176479dc8532`.

Lines 14–30:

```
export const create = Effect.fn("Orchestra.create")(function* () {
  const scope = yield* Scope.Scope
  const memoMap = yield* Layer.makeMemoMap
  const context = yield* Layer.buildWithMemoMap(
    AppNodeBuilder.build(LayerNode.group([ApplicationTools.node, PermissionSaved.node, ClaudeCodeAccount.node])),
    memoMap,
    scope,
  )
  const tools = Context.get(context, ApplicationTools.Service)
  const permissions = Context.get(context, PermissionSaved.Service)
  const account = Context.get(context, ClaudeCodeAccount.Service)
  const operator = yield* CapabilityOperator.make({ principal: Principal.account(),
    scope: { placements: "instance", actions: ["*"] } }).pipe(Effect.orDie)
  const web = yield* Effect.acquireRelease(
    Effect.sync(() =>
      HttpRouter.toWebHandler(
        createEmbeddedRoutes({ operator }).pipe(
```

Lines 38–52:

```
        ),
        { disableLogger: true, memoMap },
      ),
    ),
    (web) => Effect.promise(web.dispose),
  )
  const transport = yield* makeOperatorTransport(web.handler, operator).pipe(Effect.orDie)
  const client = yield* Orchestra.make({ baseUrl: "http://orchestra.local", headers: transport.headers }).pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.Fetch, transport.fetch),
  )
  return {
    ...client,
    tools: { register: tools.register },
  }
```

## C46 — `packages/sdk-next/src/operator-transport.ts`

Git blob `ef67f666b8ef7a94c270058903d1f8ecf34abbf0`.

Lines 8–27:

```
  const first = yield* operator.issue({ origin: "sdk" })
  const current = { credential: first }
  const renewal = Semaphore.makeUnsafe(1)
  const fetch = Object.assign((input: RequestInfo | URL, init?: RequestInit) => Effect.runPromise(Effect.gen(function* () {
    const request = new Request(input, init)
    // Preserve explicit per-request credentials. Only our captured default is eligible for host renewal.
    if (request.headers.get("authorization") !== `Bearer ${first.bearer}`) return yield* Effect.promise(() => handler(request))
    const credential = yield* renewal.withPermit(Effect.gen(function* () {
      const authenticated = yield* operator.authenticate(current.credential.bearer).pipe(Effect.exit)
      if (Exit.isSuccess(authenticated)) return current.credential
      if (!authenticated.cause.reasons.length || !authenticated.cause.reasons.every((reason) => reason._tag === "Fail" &&
        reason.error._tag === "Capability.Failure" && reason.error.code === "authentication_required"))
        return yield* Effect.failCause(authenticated.cause)
      current.credential = yield* operator.issue({ origin: "sdk" })
      return current.credential
    }))
    request.headers.set("authorization", `Bearer ${credential.bearer}`)
    return yield* Effect.promise(() => handler(request))
  })), { preconnect: () => undefined }) satisfies typeof globalThis.fetch
  return { fetch, headers: Object.freeze({ Authorization: `Bearer ${first.bearer}` }) }
```

## C47 — `packages/server/src/routes.ts`

Git blob `75b0f9753e4c879767ef186f5003519e2b681025`.

Lines 104–105:

```
export function createEmbeddedRoutes(options: Pick<Options, "host" | "operator" | "verifier"> = {}) {
  return makeRoutes(ServerAuth.Config.configLayer({ username: "orchestra", password: Option.none() }), options)
```

Lines 112–112:

```
  const merged = Host.merge(options.host ?? [])
```



# Semantic coverage projection

Exact supplied data; SHA256 `c07e08f228b5d10953a2b009c2a7fdade2430e92bd70f7bc07623d8743e58d81`; bytes 23010.

# Projeção exata de cobertura e necessidades — L1 B

Dossiê-base verificado: `6c0face0fd44960dbc7bae233ec90607956af5a6a8b40fc50a8fc2a82dc5ce86`. Fragmento-base: `1d018091d48893b69d390db03c01d39d785ce58c1a52230471308a1bfacab98b`. Fonte `1cde2ff7a71bcf7aecb5d030917b577165135d38`, protocolo `ee2521a5b966bd505cc95bd1c733e09e12f33531`, scope `orchestra.s1`. Esta revisão adiciona evidência e uma única correção autorizada; não julga o candidato e não altera os originais.

## CC-1 e limite desta projeção

Fonte normativa identificada pelo registro público de critérios: `modules/atlas/docs/design/genesis-ownership-plan.md`, blob `b45a73f17c34341097a8c8725a1df6260cd273b5`, SHA-256 `6164db5c520fd86f12f36b0165bae8cd5b4091a62d7b80596b77774f9a26d697`, linha 159:

```
| CC-1 | Scope, sources, gaps, existing/missing knowledge and the finite required-artifact inventory are frozen. | AC-01, AC-04 |
```

O inventário finito deste fragmento contém nove L1 obrigatórios, todos com corpo; missing_required_artifact_keys está vazio. Isso não significa que toda a população tenha conhecimento semântico completo nem que CC-1 de S1 inteiro esteja satisfeito. Há 472 entradas atribuídas, 52 famílias, 68 grupos de disposição, 289 fontes atribuídas capturadas e duas autoridades de fronteira externas. A classificação é copiada sem promoção de profundidade.

## Os nove keys obrigatórios

| ID | Key | Need | Entradas primárias | Full / representative / surface / captured / inventory | Corpo candidato |
| --- | --- | --- | ---: | --- | --- |
| A01 | `s1.api.boundaries` | `ownership` | 16 | 16 / 0 / 0 / 0 / 0 | Original intacto |
| A02 | `s1.api.schema-contracts` | `component` | 19 | 19 / 0 / 0 / 0 / 0 | Original intacto |
| A03 | `s1.api.session-contract` | `flow` | 5 | 5 / 0 / 0 / 0 / 0 | Nova versão separada, somente logging MCP |
| A04 | `s1.api.server-edge` | `operational` | 22 | 22 / 0 / 0 / 0 / 0 | Original intacto |
| A05 | `s1.api.stream-contract` | `flow` | 3 | 3 / 0 / 0 / 0 / 0 | Original intacto |
| A06 | `s1.api.client-projection` | `component` | 68 | 17 / 2 / 0 / 2 / 47 | Original intacto |
| A07 | `s1.api.codegen` | `maintenance` | 32 | 8 / 0 / 0 / 0 / 24 | Original intacto |
| A08 | `s1.api.sdk-composition` | `component` | 6 | 5 / 0 / 1 / 0 / 0 | Original intacto |
| A09 | `s1.api.surface-disposition` | `entry` | 301 | 0 / 0 / 189 / 0 / 112 | Original intacto |

Entradas primárias são uma partição de coverage, não o número de source_refs: fontes de fronteira e referências compartilhadas sobrepõem-se entre artefatos. A entrada `packages/sdk-next/src/tool.ts` continua surface, embora seu key primário seja sdk-composition. Os demais 189 surface são 94 Schema + 44 Protocol + 51 Server.

### Identidades de corpos

| Key | Corpo original SHA-256 / bytes | Corpo candidato SHA-256 / bytes |
| --- | --- | --- |
| A01 | `f6b230ed8578b6bd9fdb1e4eaca26892df9355a58fc1f5e2e6a157bffabf7310` / 4634 | `f6b230ed8578b6bd9fdb1e4eaca26892df9355a58fc1f5e2e6a157bffabf7310` / 4634 |
| A02 | `1a8dce30625d8d8641a48f8594736b1da4bbb6bd23c13562bd332fd5990cd8cb` / 4868 | `1a8dce30625d8d8641a48f8594736b1da4bbb6bd23c13562bd332fd5990cd8cb` / 4868 |
| A03 | `f0b4af4b966886be0858cc9ab27c8ec1f481ef8093018a567d8e08b071c52db5` / 5130 | `22b526a2423572f2bbc17f3bfccd2eb0ea8f7fb16f2215bb0904f1cc5c2125bc` / 5155 |
| A04 | `f4b99d7a6bafb6a6aa672eeb5a63aa7621a14e65cfe863fe0f9d9eb36e0981de` / 5106 | `f4b99d7a6bafb6a6aa672eeb5a63aa7621a14e65cfe863fe0f9d9eb36e0981de` / 5106 |
| A05 | `d1f68eb106131ba1efd61c4157b91826a25b176ab87ff74defc140ef9f4d67d8` / 3824 | `d1f68eb106131ba1efd61c4157b91826a25b176ab87ff74defc140ef9f4d67d8` / 3824 |
| A06 | `089304921b004984de3b15b75af18fea3c7ebf15191f3874e9f668066569d478` / 5193 | `089304921b004984de3b15b75af18fea3c7ebf15191f3874e9f668066569d478` / 5193 |
| A07 | `2ec55afad54a871de673a252b6b7c604a8ecdb648cc1df9c80128d83a3f8e270` / 4752 | `2ec55afad54a871de673a252b6b7c604a8ecdb648cc1df9c80128d83a3f8e270` / 4752 |
| A08 | `a2cb2fc21fc1a771d81cd83e75dfe8b07c82c1712b15396ff4e40774f861d4d3` / 3478 | `a2cb2fc21fc1a771d81cd83e75dfe8b07c82c1712b15396ff4e40774f861d4d3` / 3478 |
| A09 | `611b4ff21c0aa4bd1de072f0b16b6c2560a3446b2bad0b31271cd1f61807dbda` / 5168 | `611b4ff21c0aa4bd1de072f0b16b6c2560a3446b2bad0b31271cd1f61807dbda` / 5168 |

## Matriz need × profundidade

| Need | full | representative | surface | captured | inventory | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `entry` | 0 | 0 | 189 | 0 | 112 | 301 |
| `ownership` | 16 | 0 | 0 | 0 | 0 | 16 |
| `maintenance` | 8 | 0 | 0 | 0 | 24 | 32 |
| `operational` | 22 | 0 | 0 | 0 | 0 | 22 |
| `flow` | 8 | 0 | 0 | 0 | 0 | 8 |
| `evidence` | 0 | 0 | 0 | 0 | 0 | 0 |
| `component` | 41 | 2 | 1 | 2 | 47 | 93 |

`evidence` é um need legal sem key primário neste fragmento; a evidência é vinculada aos nove artefatos, e não foi inventado um décimo key. Totais atribuídos: 95 full, 2 representative, 190 surface, 2 captured-only, 183 inventory. As duas autoridades externas full elevam o registro global de leitura a 97 full.

## Justificativas exatas do original

- **R01:** Exact source read for this bounded L1 contract; no execution and no semantic acceptance implied.
- **R02:** Generated bytes preserved and hash-verified; content not semantically read. Authority is the generator, Client build and output manifests.
- **R03:** Handwritten production source captured; literal imports/exports/route or handler declarations indexed. Domain implementation internals not semantically reviewed.
- **R04:** Large generated client: runtime and decisive endpoint regions read; generation authority and manifest own remaining output. Not every generated method inspected.
- **R05:** Pinned generated-family membership recorded; source not read. Regeneration authority and representative outputs are separately evidenced.
- **R06:** Pinned support-file membership recorded; contents not read and configuration semantics not inferred.
- **R07:** Pinned verification/fixture membership recorded; no assertion or fixture behavior inferred from an unread file and no test executed.

## Grupos exatos por família, tipo, profundidade e key

As 68 linhas abaixo particionam as 472 entradas sem perda. `coverage-projection.json` preserva todos os membros e todos os campos originais; cada membro herda os sete campos common. Reconstituir common + member reproduz a linha original exatamente.

| Grupo | Família | Tipo | Count | Profundidade | Key / need | Razão |
| --- | --- | --- | ---: | --- | --- | --- |
| G01 | `architecture.historical-intent` | `documentation` | 4 | `full` | A01 / `ownership` | R01 |
| G02 | `client.build-support` | `build-script` | 1 | `full` | A07 / `maintenance` | R01 |
| G03 | `client.configuration` | `support` | 2 | `inventory` | A09 / `entry` | R06 |
| G04 | `client.documentation` | `documentation` | 1 | `full` | A06 / `component` | R01 |
| G05 | `client.fixtures` | `fixture` | 1 | `inventory` | A09 / `entry` | R07 |
| G06 | `client.generated-effect` | `generated` | 1 | `full` | A06 / `component` | R01 |
| G07 | `client.generated-effect` | `generated` | 1 | `representative` | A06 / `component` | R04 |
| G08 | `client.generated-effect` | `generated` | 12 | `inventory` | A06 / `component` | R05 |
| G09 | `client.generated-effect` | `generated-manifest` | 1 | `full` | A06 / `component` | R01 |
| G10 | `client.generated-promise` | `generated` | 2 | `full` | A06 / `component` | R01 |
| G11 | `client.generated-promise` | `generated` | 1 | `representative` | A06 / `component` | R04 |
| G12 | `client.generated-promise` | `generated` | 2 | `captured` | A06 / `component` | R02 |
| G13 | `client.generated-promise` | `generated` | 35 | `inventory` | A06 / `component` | R05 |
| G14 | `client.generated-promise` | `generated-manifest` | 1 | `full` | A06 / `component` | R01 |
| G15 | `client.handwritten` | `production` | 6 | `full` | A06 / `component` | R01 |
| G16 | `client.package-authority` | `manifest` | 1 | `full` | A01 / `ownership` | R01 |
| G17 | `client.verification` | `test` | 3 | `full` | A06 / `component` | R01 |
| G18 | `client.verification` | `test` | 5 | `inventory` | A09 / `entry` | R07 |
| G19 | `codegen.production` | `production` | 5 | `full` | A07 / `maintenance` | R01 |
| G20 | `httpapi-codegen.configuration` | `support` | 2 | `inventory` | A09 / `entry` | R06 |
| G21 | `httpapi-codegen.documentation` | `documentation` | 1 | `full` | A07 / `maintenance` | R01 |
| G22 | `httpapi-codegen.fixtures` | `fixture` | 2 | `inventory` | A07 / `maintenance` | R07 |
| G23 | `httpapi-codegen.generated-test-fixtures` | `generated-fixture` | 13 | `inventory` | A07 / `maintenance` | R05 |
| G24 | `httpapi-codegen.package-authority` | `manifest` | 1 | `full` | A07 / `maintenance` | R01 |
| G25 | `httpapi-codegen.verification` | `test` | 7 | `inventory` | A07 / `maintenance` | R07 |
| G26 | `httpapi-codegen.verification` | `test-support` | 2 | `inventory` | A07 / `maintenance` | R07 |
| G27 | `protocol.composition` | `production` | 1 | `full` | A01 / `ownership` | R01 |
| G28 | `protocol.configuration` | `support` | 2 | `inventory` | A09 / `entry` | R06 |
| G29 | `protocol.documentation` | `documentation` | 1 | `full` | A01 / `ownership` | R01 |
| G30 | `protocol.domain-surfaces` | `production` | 44 | `surface` | A09 / `entry` | R03 |
| G31 | `protocol.edge-adapters` | `production` | 9 | `full` | A04 / `operational` | R01 |
| G32 | `protocol.package-authority` | `manifest` | 1 | `full` | A01 / `ownership` | R01 |
| G33 | `protocol.raw-transfer-boundary` | `production` | 1 | `full` | A06 / `component` | R01 |
| G34 | `protocol.session-adapter` | `production` | 2 | `full` | A03 / `flow` | R01 |
| G35 | `protocol.stream-adapter` | `production` | 1 | `full` | A05 / `flow` | R01 |
| G36 | `protocol.verification` | `test` | 3 | `inventory` | A09 / `entry` | R07 |
| G37 | `schema.configuration` | `support` | 2 | `inventory` | A09 / `entry` | R06 |
| G38 | `schema.documentation` | `documentation` | 1 | `full` | A02 / `component` | R01 |
| G39 | `schema.domain-surfaces` | `production` | 94 | `surface` | A09 / `entry` | R03 |
| G40 | `schema.instructions` | `instruction` | 1 | `full` | A01 / `ownership` | R01 |
| G41 | `schema.package-authority` | `manifest` | 1 | `full` | A01 / `ownership` | R01 |
| G42 | `schema.session-event-foundation` | `production` | 15 | `full` | A02 / `component` | R01 |
| G43 | `schema.verification` | `test` | 3 | `full` | A02 / `component` | R01 |
| G44 | `schema.verification` | `test` | 7 | `inventory` | A09 / `entry` | R07 |
| G45 | `sdk-next.configuration` | `support` | 2 | `inventory` | A09 / `entry` | R06 |
| G46 | `sdk-next.documentation` | `documentation` | 1 | `full` | A08 / `component` | R01 |
| G47 | `sdk-next.package-authority` | `manifest` | 1 | `full` | A01 / `ownership` | R01 |
| G48 | `sdk-next.verification` | `test` | 1 | `full` | A08 / `component` | R01 |
| G49 | `sdk-next.verification` | `test` | 1 | `full` | A01 / `ownership` | R01 |
| G50 | `sdk-next.verification` | `test` | 3 | `inventory` | A09 / `entry` | R07 |
| G51 | `sdk.embedded-composition` | `production` | 3 | `full` | A08 / `component` | R01 |
| G52 | `sdk.embedded-composition` | `production` | 1 | `surface` | A08 / `component` | R03 |
| G53 | `server.build-support` | `test-support` | 1 | `inventory` | A09 / `entry` | R07 |
| G54 | `server.composition` | `production` | 2 | `full` | A01 / `ownership` | R01 |
| G55 | `server.configuration` | `support` | 2 | `inventory` | A09 / `entry` | R06 |
| G56 | `server.documentation` | `documentation` | 1 | `full` | A04 / `operational` | R01 |
| G57 | `server.domain-surfaces` | `production` | 51 | `surface` | A09 / `entry` | R03 |
| G58 | `server.edge-adapters` | `production` | 12 | `full` | A04 / `operational` | R01 |
| G59 | `server.exercise-harness` | `fixture` | 3 | `inventory` | A09 / `entry` | R07 |
| G60 | `server.exercise-harness` | `test-support` | 45 | `inventory` | A09 / `entry` | R07 |
| G61 | `server.fixtures` | `fixture` | 6 | `inventory` | A09 / `entry` | R07 |
| G62 | `server.package-authority` | `manifest` | 1 | `full` | A01 / `ownership` | R01 |
| G63 | `server.raw-transfer-boundary` | `production` | 1 | `full` | A06 / `component` | R01 |
| G64 | `server.session-adapter` | `production` | 3 | `full` | A03 / `flow` | R01 |
| G65 | `server.stream-adapter` | `production` | 1 | `full` | A05 / `flow` | R01 |
| G66 | `server.verification` | `test` | 1 | `full` | A05 / `flow` | R01 |
| G67 | `server.verification` | `test` | 1 | `full` | A01 / `ownership` | R01 |
| G68 | `server.verification` | `test` | 26 | `inventory` | A09 / `entry` | R07 |

### Resumo das 52 famílias

| Família | Count | Profundidades e counts |
| --- | ---: | --- |
| `architecture.historical-intent` | 4 | full=4 |
| `client.build-support` | 1 | full=1 |
| `client.configuration` | 2 | inventory=2 |
| `client.documentation` | 1 | full=1 |
| `client.fixtures` | 1 | inventory=1 |
| `client.generated-effect` | 15 | full=2, representative=1, inventory=12 |
| `client.generated-promise` | 41 | full=3, representative=1, captured=2, inventory=35 |
| `client.handwritten` | 6 | full=6 |
| `client.package-authority` | 1 | full=1 |
| `client.verification` | 8 | full=3, inventory=5 |
| `codegen.production` | 5 | full=5 |
| `httpapi-codegen.configuration` | 2 | inventory=2 |
| `httpapi-codegen.documentation` | 1 | full=1 |
| `httpapi-codegen.fixtures` | 2 | inventory=2 |
| `httpapi-codegen.generated-test-fixtures` | 13 | inventory=13 |
| `httpapi-codegen.package-authority` | 1 | full=1 |
| `httpapi-codegen.verification` | 9 | inventory=9 |
| `protocol.composition` | 1 | full=1 |
| `protocol.configuration` | 2 | inventory=2 |
| `protocol.documentation` | 1 | full=1 |
| `protocol.domain-surfaces` | 44 | surface=44 |
| `protocol.edge-adapters` | 9 | full=9 |
| `protocol.package-authority` | 1 | full=1 |
| `protocol.raw-transfer-boundary` | 1 | full=1 |
| `protocol.session-adapter` | 2 | full=2 |
| `protocol.stream-adapter` | 1 | full=1 |
| `protocol.verification` | 3 | inventory=3 |
| `schema.configuration` | 2 | inventory=2 |
| `schema.documentation` | 1 | full=1 |
| `schema.domain-surfaces` | 94 | surface=94 |
| `schema.instructions` | 1 | full=1 |
| `schema.package-authority` | 1 | full=1 |
| `schema.session-event-foundation` | 15 | full=15 |
| `schema.verification` | 10 | full=3, inventory=7 |
| `sdk-next.configuration` | 2 | inventory=2 |
| `sdk-next.documentation` | 1 | full=1 |
| `sdk-next.package-authority` | 1 | full=1 |
| `sdk-next.verification` | 5 | full=2, inventory=3 |
| `sdk.embedded-composition` | 4 | full=3, surface=1 |
| `server.build-support` | 1 | inventory=1 |
| `server.composition` | 2 | full=2 |
| `server.configuration` | 2 | inventory=2 |
| `server.documentation` | 1 | full=1 |
| `server.domain-surfaces` | 51 | surface=51 |
| `server.edge-adapters` | 12 | full=12 |
| `server.exercise-harness` | 48 | inventory=48 |
| `server.fixtures` | 6 | inventory=6 |
| `server.package-authority` | 1 | full=1 |
| `server.raw-transfer-boundary` | 1 | full=1 |
| `server.session-adapter` | 3 | full=3 |
| `server.stream-adapter` | 1 | full=1 |
| `server.verification` | 28 | full=2, inventory=26 |

## Obrigações futuras já decorrentes dos limites congelados

Estas condições não são novos artefatos L2–L4 nem testes impostos por esta revisão. Os nomes dos artefatos futuros não foram observados no fragmento; permanecem null no JSON. A principal deve fixá-los no trabalho correspondente, sem copiar um PASS de inventário ou de hashing.

| ID | Condição | Obrigação preservada | Dependentes ainda bloqueados |
| --- | --- | --- | --- |
| F01 | Antes de liberar L2–L4 dependente dos nove L1 | A principal precisa dos dois juízos aplicáveis aos bytes e evidências exatos; esta projeção e a correção não constituem aceite. | Explicações locais L2, relações/impactos L3 e ownership/manutenção L4 que usam estes L1. |
| F02 | Antes de afirmar entendimento semântico completo dos módulos de domínio | Tratar as 190 fontes apenas indexadas (94 Schema, 44 Protocol, 51 Server e SDK tool.ts) com a profundidade justificada para a necessidade real. O inventário não prova regras internas. | Explicações ou procedimentos sobre regras/efeitos/falhas dos domínios ainda não lidos semanticamente. |
| F03 | Antes de elevar inventário de gerados/testes/fixtures/configs a prova de comportamento | Manter as 183 entradas inventory-only e os 2 gerados capturados sem leitura distintos de fonte lida. Agrupamento por autoridade de geração continua válido para disposição; não exige ler todos os gerados por rotina. | Alegações de comportamento ou sucesso derivadas apenas desses arquivos não lidos. |
| F04 | Antes de afirmar ciclo de sessão, persistência, agendamento ou recuperação ponta a ponta | Vincular evidência aceita dos donos Core às delegações observadas. Os adaptadores por si só não provam transação, execução exatamente uma vez, recuperação distribuída ou isolamento sob toda concorrência. | Fluxos integrados de sessão, impacto de mudanças de runtime e diagnósticos de recuperação. |
| F05 | Após mudança pública de HttpApi ou antes de alegar frescor/import boundary executado | Seguir a autoridade de regeneração e obter as verificações reais pertinentes. Este trabalho executou zero geração/build/testes; não transforma testes lidos em PASS. | Procedimento de mudança segura com frescor de gerados, prova de bundle/browser e interoperabilidade executada. |
| F06 | Antes de afirmar comportamento operacional observado | Produzir a prova de runtime correspondente quando autorizada. Manter distintos origem/autoridade, live versus durable, limite de fila e ausência de reconnect automático; os testes existentes aqui são apenas fonte. | Garantias operacionais de autorização, boot, socket, overflow/replay, transporte e concorrência SDK. |
| F07 | Ao manter as superfícies onde fonte e intenção divergem | Preservar e resolver com o dono a divergência README/fs.read, o upload sem declaração no grupo/handler inspecionado e os identificadores V2. Não alegar que esta revisão os corrigiu. | Manutenção que pressupõe alinhamento total de documentação, nomes e transporte de upload. |
| F08 | Antes de binding do input generated/types.ts no runtime atual | Resolver explicitamente o limite de 256.000 bytes para o arquivo capturado de 462.732 bytes, ou manter o binding bloqueado. Não omitir, subdividir disfarçadamente ou fabricar versão observada. | Import/binding/publicação que dependem da observação fiel desse input. |
| F09 | Antes de declarar entrega S1 inteira ou publicação consumível | A principal completa o inventário finito das camadas posteriores e os recibos separados de revisão, binding, publicação e consumo. As chaves futuras não foram inventadas neste suplemento. | Declaração de completude de S1 e aceitação/publicação operacional além deste L1 B. |

### Gaps por key, copiados literalmente

