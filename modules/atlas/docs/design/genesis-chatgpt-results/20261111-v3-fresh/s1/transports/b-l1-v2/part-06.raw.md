## S20 — `packages/server/src/middleware/capability-authorization.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `ca7a6eaeef94c55cb8c4df36a7b7a89a6256b58d`; arquivo SHA-256 `437afc6342984a2cabf7cd72c01ea77c4422fb61761d1a24b2a8bf867f798c88`; 4035 bytes.

Finalidade: Cause preservation and canonical Basic decoding.

Linhas 49–60; trecho SHA-256 `530ac19c5666271e33c6450c12c2630aad1799be007f1568a74bf22e2dd453d5`:

```
        // Keep every defect, interrupt and failure annotation, including mixed lifecycle causes.
        Effect.catchCause((cause) =>
          Effect.failCause(
            Cause.fromReasons(
              cause.reasons.flatMap((reason) => {
                if (reason._tag !== "Fail") return [reason]
                return Cause.fail(
                  reason.error instanceof Capability.Failure ? capabilityError(reason.error) : reason.error,
                ).reasons.map((next) => next.annotate(Context.makeUnsafe(new Map(reason.annotations))))
              }),
            ),
          ),
```

Linhas 68–78; trecho SHA-256 `98d726712f6f0f0b2a76517214c7ee840cafdb1122fd1cc3fc12140da8830f85`:

```
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})(?![\s\S])/i.exec(header)
  if (!match) return undefined
  const decoded = Encoding.decodeBase64String(match[1])
  if (Result.isFailure(decoded) || Encoding.encodeBase64(decoded.success) !== match[1]) return undefined
  const separator = decoded.success.indexOf(":")
  if (separator === -1) return undefined
  return {
    username: decoded.success.slice(0, separator),
    password: Redacted.make(decoded.success.slice(separator + 1)),
  }
}
```


## S21 — `packages/server/src/location.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `1881a570a893ec8c55aa436598db44ad19edde04`; arquivo SHA-256 `57032232ea6a37a046399f147479eef2ccdd21376a59c62de3fcfbfaae78953e`; 3966 bytes.

Finalidade: Cached location caveat.

Linhas 43–48; trecho SHA-256 `07d32bb610eab174f5e2e21948ba4b01541bed65f7161dcfdad3734a39f70759`:

```
/**
 * The Location's services, failing with a declared 400 when they cannot boot. A failed boot (most often a project whose
 * directory was removed) otherwise surfaces as an error no route declares, which the HttpApi answers as an empty 500 on
 * every route of that Location. Only booting is mapped: a Location already booted keeps serving from the map's cache,
 * so database-backed routes such as removing a session stay usable after its directory goes away.
 */
```


## S22 — `packages/server/src/principal.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `f854d83e8c4b760f9c56282a59af87e73a7fbf51`; arquivo SHA-256 `e0932d6e27e750a1664b3a9c20818610126c810d8b41ad8e3900a1c43dd3f260`; 829 bytes.

Finalidade: OS account principal, not one identity per Basic username.

Linhas 1–20; trecho SHA-256 `e0932d6e27e750a1664b3a9c20818610126c810d8b41ad8e3900a1c43dd3f260`:

```
export * as Principal from "./principal"

import os from "os"
import { Result } from "effect"
import type { HttpServerRequest } from "effect/unstable/http"

/**
 * Who a request acts for, recorded on owner actions (publish, hook install and lifecycle; run release later). The
 * server has no per-person accounts: its Basic credential is one shared service identity (the desktop sidecar always
 * signs in with the same fixed username), so that name says nothing about who acted. The person is the OS account
 * running the server, which is the signed-in user of the machine.
 */
export function of(_request: HttpServerRequest.HttpServerRequest) {
  return account()
}

export function account() {
  const user = Result.try(() => os.userInfo().username)
  return Result.isSuccess(user) && user.success ? user.success : "local"
}
```


## S23 — `packages/server/src/handlers/model.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `51ecfd876092dd1e2752f4ead4d40d99d34d6010`; arquivo SHA-256 `5bb4dd3dceaf99373c595b30753ea69322999bcd38bc55db36ce165325f5ee9b`; 1731 bytes.

Finalidade: Catalog availability, deduplication and preferred/default model.

Linhas 14–43; trecho SHA-256 `ce03015b7eb030f157757fa76509f64da1c7e05b63fea1b9c6b3c164e89b7c80`:

```
          const catalog = yield* Catalog.Service
          const additional = yield* CatalogAvailability.AdditionalProviders
          return yield* response(
            Effect.gen(function* () {
              const available = yield* catalog.model.available()
              const extra = new Set((yield* additional(catalog)).map((provider) => provider.id))
              if (extra.size === 0) return available
              return [
                ...available,
                ...(yield* catalog.model.all()).filter(
                  (model) =>
                    extra.has(model.providerID) &&
                    model.enabled &&
                    !available.some((item) => item.providerID === model.providerID && item.id === model.id),
                ),
              ]
            }),
          )
        }),
      )
      .handle(
        "model.default",
        Effect.fn(function* () {
          const catalog = yield* Catalog.Service
          const preferred = yield* CatalogAvailability.DefaultModel
          return yield* response(
            Effect.gen(function* () {
              return (yield* preferred(catalog)) ?? (yield* catalog.model.default()) ?? null
            }),
          )
```


## S24 — `packages/server/src/handlers/provider.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `407a5c5ce66f41da27a4f793cbe8ff3c9c9bbafd`; arquivo SHA-256 `9d0167b85aaebb4db6c802ea918c1ff38f47978c6877aadd788863201593714d`; 2475 bytes.

Finalidade: Provider list/sign-in adapter declarations.

Linhas 13–56; trecho SHA-256 `aefe20cd3e11cbd6369975a394ba57e7f2fde1d89855cbcdf575547f3ac27573`:

```
      .handle(
        "provider.list",
        Effect.fn(function* () {
          const catalog = yield* Catalog.Service
          const additional = yield* CatalogAvailability.AdditionalProviders
          return yield* response(Effect.gen(function* () {
            const available = yield* catalog.provider.available()
            const extra = yield* additional(catalog)
            return [...available, ...extra.filter((provider) => !available.some((item) => item.id === provider.id))]
          }))
        }),
      )
      .handle(
        "provider.claudeCode.account",
        Effect.fn(function* () {
          const account = yield* ClaudeCodeAccount.Service
          return yield* account.account
        }),
      )
      .handle(
        "provider.claudeCode.login",
        Effect.fn(function* () {
          const account = yield* ClaudeCodeAccount.Service
          return yield* account.startLogin.pipe(
            Effect.catchTag("ClaudeCodeAccount.LoginError", (error) =>
              Effect.fail(new ServiceUnavailableError({ message: error.message, service: "claude-code" })),
            ),
          )
        }),
      )
      .handle(
        "provider.claudeCode.loginCode",
        Effect.fn(function* (ctx) {
          const account = yield* ClaudeCodeAccount.Service
          return yield* account.sendCode(ctx.payload.code)
        }),
      )
      .handle(
        "provider.get",
        Effect.fn(function* (ctx) {
          const catalog = yield* Catalog.Service
          const provider = yield* catalog.provider.get(ctx.params.providerID)
          if (!provider)
            return yield* new ProviderNotFoundError({
```


## S25 — `packages/client/src/generated/client.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `93cab27e0b902d6e8fbd21d6aaec320a2b9fe09c`; arquivo SHA-256 `f032a64d8223ac1b584ba17cf39e7f8da9e0be05f88682425692304a3a8ba20b`; 146714 bytes.

Finalidade: Header precedence and binary files.read method identity.

Linhas 539–556; trecho SHA-256 `4cb197d044088598ffa2be90e4ca124f89aea7033448127a48c5365d902d68fb`:

```
}

export interface RequestOptions {
  readonly signal?: AbortSignal
  readonly headers?: HeadersInit
}

export function make(options: ClientOptions) {
  const fetch = options.fetch ?? globalThis.fetch

  const prepare = (descriptor: RequestDescriptor, requestOptions?: RequestOptions) => {
    const url = new URL(descriptor.path, options.baseUrl)
    for (const [key, value] of Object.entries(descriptor.query ?? {})) appendQuery(url.searchParams, key, value)
    const headers = new Headers(options.headers)
    for (const [key, value] of Object.entries(descriptor.headers ?? {})) {
      if (value !== undefined && value !== null) headers.set(key, String(value))
    }
    for (const [key, value] of new Headers(requestOptions?.headers)) headers.set(key, value)
```

Linhas 1548–1561; trecho SHA-256 `f2c64de57ae0b35880ae3806fbc0cfa2909b64f5cc026c0e72fa56a102885185`:

```
          requestOptions,
        ),
    },
    files: {
      read: (input: FilesReadInput, requestOptions?: RequestOptions) =>
        request<FilesReadOutput>(
          {
            method: "GET",
            path: `/api/fs/read`,
            query: { location: input["location"], path: input["path"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
            binary: true,
```


## S26 — `packages/client/src/generated-effect/client.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `97d52b0a17eece1a7ddf6a52904a88d047e2b51f`; arquivo SHA-256 `24114bfba58645693c8db03ffca4f04b3c6ecbb0d6a9d18f82de15addd1556f6`; 171208 bytes.

Finalidade: Actual generated adapter uses original ClientApi and validates headers.

Linhas 3410–3464; trecho SHA-256 `1124fa5bf5d87305d45327ae0e1c09f7980ba8f6db11b9cba55e17c6b90971a3`:

```
  meeting: adaptGroup48(raw["server.meeting"]),
  operator: adaptGroup49(raw["server.capability.operator"]),
  connections: adaptGroup50(raw["server.capability.connections"]),
  artifacts: adaptGroup51(raw["server.capability.artifacts"]),
  capabilitySchedules: adaptGroup52(raw["server.capability.schedules"]),
})

export const make = (options?: {
  readonly baseUrl?: URL | string
  readonly headers?: Readonly<Record<string, string>>
}) => {
  if (options?.headers === undefined) return HttpApiClient.make(ClientApi, options).pipe(Effect.map(adaptClient))
  // Snapshot and validate host configuration now, before this Effect can be executed or reused.
  const headers = snapshotHeaders(options.headers)
  if (Object.keys(headers).length === 0) return HttpApiClient.make(ClientApi, options).pipe(Effect.map(adaptClient))
  // Fetch must supply the multipart boundary; only explicit request headers may override it.
  const formHeaders = Object.fromEntries(Object.entries(headers).filter(([name]) => name !== "content-type"))
  return HttpApiClient.make(ClientApi, {
    baseUrl: options.baseUrl,
    transformClient: (client) =>
      HttpClient.mapRequest(client, (request) =>
        HttpClientRequest.setHeaders(request, {
          ...(request.body._tag === "FormData" ? formHeaders : headers),
          ...request.headers,
        }),
      ),
  }).pipe(Effect.map(adaptClient))
}

function snapshotHeaders(input: Readonly<Record<string, string>>) {
  if (
    typeof input !== "object" ||
    input === null ||
    (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)
  ) {
    throw new TypeError("Invalid client headers")
  }
  const entries = Object.entries(Object.getOwnPropertyDescriptors(input)).flatMap(([name, descriptor]) => {
    if (
      !/^[!#$%&'*+.^_|~0-9A-Za-z\x60-]+$/.test(name) ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "string" ||
      /[\r\n]/.test(descriptor.value)
    ) {
      throw new TypeError("Invalid client headers")
    }
    return descriptor.enumerable ? [[name, descriptor.value] as const] : []
  })
  try {
    return Object.freeze(Object.fromEntries(new Headers(Object.fromEntries(entries))))
  } catch (error) {
    if (error instanceof TypeError) throw new TypeError("Invalid client headers")
    throw error
  }
}
```


## S27 — `packages/client/src/wire.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `8ff88190163e1254d4c92ea5c70ef0f9c8fc8d04`; arquivo SHA-256 `0f4373c1e09abbaa92b6769a80c2a9e9de8a1193ed99b9c9e404263c61388fdf`; 190 bytes.

Finalidade: Encoded session-event projection.

Linhas 1–4; trecho SHA-256 `0f4373c1e09abbaa92b6769a80c2a9e9de8a1193ed99b9c9e404263c61388fdf`:

```
import type { SessionEvent } from "@orchestra/schema/session-event"
import type { Schema } from "effect"

export type SessionEventEncoded = Schema.Codec.Encoded<typeof SessionEvent.Durable>
```


## S28 — `packages/client/src/actions-transfer.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `0d8607699a560ae9fb671f8bc37bc9d1b473424e`; arquivo SHA-256 `3403fb575546d15a203a063ae9e8135dac6593276bf056e63a918129fb9bd47d`; 9473 bytes.

Finalidade: Streaming successful response ownership and stream support probe.

Linhas 15–62; trecho SHA-256 `bb5c86f7916cf6976eaa68b0660d6c44ce28f0d76b71d8a2f819b1815ce8b9a2`:

```
export function makeActionsTransfer(options: ClientOptions) {
  const request = async (prepared: ReturnType<typeof prepareTransfer>): Promise<Response> => {
    const fetch = prepared.fetch
    const response = await Promise.resolve()
      .then(() => fetch(prepared.url, prepared.init))
      .catch((cause: unknown) => {
        prepared.controller.abort()
        throw new ActionsTransferError("Transport", { cause })
      })
    if (!response.ok) return actionsTransferResponseError(response).finally(() => prepared.controller.abort())
    return response
  }

  return {
    download: async (
      input: { binding: Actions.BindingRef; target: Actions.TransferInput; location?: Location },
      requestOptions?: RequestOptions,
    ): Promise<Response> => {
      try {
        requireRecord(input, ["binding", "target", "location"], "download")
        const captured = {
          ...input,
          binding: input.binding && { ...input.binding },
          target: input.target && { ...input.target },
          location: input.location && { ...input.location },
        }
        requireTarget(captured.target)
        return request(
          prepareTransfer(
            options,
            captured.binding,
            captured.location,
            {
              kind: captured.target.kind,
              id: captured.target.id,
              runID: captured.target.runID,
              attempt: captured.target.attempt,
              path: captured.target.path,
            },
            undefined,
            requestOptions,
          ),
        )
      } catch (cause) {
        if (cause instanceof ActionsTransferError) throw cause
        throw new ActionsTransferError("Transport", { cause })
      }
    },
```

Linhas 107–121; trecho SHA-256 `e55337760519469f82cf8e51cd2bf70f4b1716c9ad749508d054f34f6d8bf02f`:

```
          if (captured.body.locked) invalid("Upload stream is locked")
          let duplexRead = false
          const probe: StreamingRequestInit = {
            method: "POST",
            body: captured.body,
            get duplex(): "half" {
              duplexRead = true
              return "half"
            },
          }
          const supported = await Promise.resolve()
            .then(() => new Request(prepared.url, probe))
            .catch((cause: unknown) => {
              throw new ActionsTransferError("Transport", { code: "UnsupportedStreaming", cause })
            })
```


## S29 — `packages/client/src/actions-transfer-error.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `314b2dc47f3e63182dec1324c1c31f3839dc12d9`; arquivo SHA-256 `bef765b9b85ec33b12317a84d6266d5713793768d3f4a63deba06d47c2a66477`; 5266 bytes.

Finalidade: Outcome retained and retry-after parser.

Linhas 4–34; trecho SHA-256 `3b785b5c210bcb68f26be823ae087084c87a5db9e3c025b67da3f0b3836ef9f3`:

```
export class ActionsTransferError extends ClientError {
  readonly code?: "UnsupportedStreaming"
  readonly status?: number
  readonly data?: Actions.ErrorData
  readonly kind?: Actions.ErrorKind
  // The frozen ErrorData has no outcome schema yet. Preserve the wire value without guessing its shape.
  readonly outcome?: unknown
  readonly retryAfter?: number
  readonly truncated: boolean

  constructor(
    reason: ClientErrorReason,
    details: {
      code?: "UnsupportedStreaming"
      cause?: unknown
      status?: number
      data?: Actions.ErrorData & { outcome?: unknown }
      retryAfter?: number
      truncated?: boolean
    } = {},
  ) {
    super(reason, { cause: details.cause })
    this.code = details.code
    this.status = details.status
    this.data = details.data
    this.kind = details.data?.kind
    this.outcome = details.data?.outcome
    this.retryAfter = details.data?.retryAfter ?? details.retryAfter
    this.truncated = details.truncated ?? false
    this.message = details.data?.message ?? details.code ?? reason
  }
```

Linhas 130–136; trecho SHA-256 `ad3bd0dffb2e62ff9b5468e43df46bfd301dd08c5eafe79a7ab9450ae4adb007`:

```

function retryAfter(value: string | null) {
  if (value === null) return undefined
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number.isFinite(Number(value)) ? Number(value) : undefined
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, (date - Date.now()) / 1_000) : undefined
}
```


## S30 — `packages/server/src/handlers/actions-transfer.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `50b7434c5595f4868cd3bd2429ec39b6441cba1c`; arquivo SHA-256 `c385e884606f956b76aea7b2e4c9f6d892ab87976342dafce06428c84449bba3`; 2203 bytes.

Finalidade: Complete inspected group contains info/read handlers, not upload.

Linhas 1–35; trecho SHA-256 `34022a182e3721bb05ab6063f3b0c5c22e891fc3f0e37d2371b2b05319f87e54`:

```
import { Actions } from "@orchestra/core/actions"
import { TransferQuery } from "@orchestra/protocol/groups/actions-transfer"
import { BindingID } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { apiError, bindingRef, result } from "./actions-common"

export const ActionsTransferHandler = HttpApiBuilder.group(Api, "server.actionsTransfer", (handlers) => Effect.succeed(
  handlers
    .handle("actions.transfer.info", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.transferInfo(bindingRef(ctx), {
        kind: ctx.query.kind, id: ctx.query.id, runID: ctx.query.runID, attempt: ctx.query.attempt, path: ctx.query.path,
      })
    })))
    .handleRaw("actions.transfer.read", (ctx) => Effect.gen(function* () {
      const url = new URL(ctx.request.url, "http://localhost")
      const query = yield* Schema.decodeUnknownEffect(TransferQuery)(Object.fromEntries(url.searchParams)).pipe(
        Effect.mapError(() => apiError(new Actions.ActionsError({ kind: "invalid_input", message: "Invalid Actions transfer query" }))),
      )
      const id = yield* Schema.decodeUnknownEffect(BindingID)(decodeURIComponent(url.pathname.split("/").at(-1) ?? "")).pipe(
        Effect.mapError(() => apiError(new Actions.ActionsError({ kind: "invalid_input", message: "Invalid Actions transfer binding" }))),
      )
      const actions = yield* Actions.Service
      const target = { kind: query.kind, id: query.id, runID: query.runID, attempt: query.attempt, path: query.path }
      const binding = { id, revision: query.revision }
      const info = yield* actions.transferInfo(binding, target).pipe(Effect.mapError(apiError))
      return HttpServerResponse.stream(actions.transfer(binding, target), {
        contentType: info.contentType,
        headers: { "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(info.filename)}`,
          ...(info.size === undefined ? {} : { "content-length": String(info.size) }) },
      })
    })),
```


## S31 — `tooling/httpapi-codegen/src/index.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `0467e68001715795e0851cf5d8a8b3dad1d75126`; arquivo SHA-256 `8a0e0c82edbddb08097d285ce523a80f70e9d98b764073941fecdefd0390b069`; 59915 bytes.

Finalidade: Input mode, collision rejection, recursive-type refusal and manifest ownership read.

Linhas 160–171; trecho SHA-256 `92bb307bd954c887721a166bedbd4af6cddec785ca715c02c2841ca1f46b692e`:

```
          inputMode: inputs.length === 0 ? "none" : inputs.every((field) => field.optional) ? "optional" : "required",
          success: isStreamSchema(success.schema)
            ? "stream"
            : HttpApiSchema.isNoContent(success.schema.ast)
              ? "void"
              : "value",
          errors: [
            ...new Set([
              ...errorSchemas.flatMap((item) => {
                const identifier = SchemaAST.resolveIdentifier(item.schema.ast)
                return identifier === undefined ? [] : [identifier]
              }),
```

Linhas 178–211; trecho SHA-256 `5a4b8e5852a7af2699102cb1e5df7165e556fdadad06a66f27c61ee3bb2546be`:

```
  })

  const modules = new Set(["client", "client-error", "index", "request", "errors", "types"])
  const groups = Array.from(
    Map.groupBy(endpoints, (endpoint) => endpoint.group),
    ([identifier, endpoints], index) => {
      if (new Set(endpoints.map((endpoint) => endpoint.sourceGroup)).size > 1) {
        throw new GenerationError({ reason: `Client group name collision: ${identifier}` })
      }
      const base = /^[A-Za-z0-9_-]+$/.test(identifier) ? identifier : `group-${index}`
      const module = uniqueModule(base, index, modules)
      modules.add(module.toLowerCase())
      modules.add(`${module}-types`.toLowerCase())
      return { identifier, sourceIdentifier: endpoints[0].sourceGroup, module, endpoints }
    },
  )
  const publicNames = new Set<string>()
  for (const group of groups) {
    const endpointNames = new Set<string>()
    for (const endpoint of group.endpoints) {
      if (endpointNames.has(endpoint.operation.name)) {
        throw new GenerationError({
          reason: `Client endpoint name collision: ${group.identifier}.${endpoint.operation.name}`,
        })
      }
      endpointNames.add(endpoint.operation.name)
    }
    const names = group.endpoints[0]?.topLevel ? group.endpoints.map((item) => item.operation.name) : [group.identifier]
    for (const name of names) {
      if (publicNames.has(name)) throw new GenerationError({ reason: `Client name collision: ${name}` })
      publicNames.add(name)
    }
  }
  return {
```

Linhas 531–551; trecho SHA-256 `80609ad8cc1430abe53c3397911671fd58258d40e0ef6e0735c11785489d3204`:

```
function structuralType(schema: Schema.Top) {
  const document = SchemaRepresentation.toCodeDocument(SchemaRepresentation.fromASTs([schema.ast]))
  if (
    document.artifacts.some(
      (artifact) =>
        artifact._tag !== "Import" || artifact.importDeclaration !== 'import type * as Brand from "effect/Brand"',
    ) ||
    Object.keys(document.references.recursives).length > 0
  ) {
    throw new GenerationError({ reason: "Referenced Promise types are not implemented" })
  }
  const references = new Map(
    document.references.nonRecursives.map((reference) => [reference.$ref, reference.code.Type]),
  )
  const expand = (type: string, seen = new Set<string>()): string => {
    for (const [reference, value] of references) {
      const pattern = `(?<![A-Za-z0-9_$.'"])${reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_$.'"])`
      if (!new RegExp(pattern).test(type)) continue
      if (seen.has(reference)) {
        throw new GenerationError({ reason: `Recursive Promise types are not implemented: ${reference}` })
      }
```

Linhas 707–713; trecho SHA-256 `7ba4dcceb0bb7f4c25b85d29216a848ce631654747de64ba588a5f61a88b60ae`:

```
    const manifest = join(directory, manifestName)
    const previous = (yield* fs.exists(manifest))
      ? yield* fs.readFileString(manifest).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(Manifest)),
          Effect.mapError(() => new GenerationError({ reason: `Invalid generated file manifest: ${manifest}` })),
        )
      : []
```


## S32 — `packages/client/src/generated/.httpapi-codegen.json`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `190f92c2c10e6b0126e10ef23b217ef33688dd68`; arquivo SHA-256 `8c3b0fc3a95aed8ba5a2efe2033addb2e753444a15bc4b308f5deb618096b243`; 1086 bytes.

Finalidade: Exact Promise generated output membership, 40 names.

Linhas 1–42; trecho SHA-256 `8c3b0fc3a95aed8ba5a2efe2033addb2e753444a15bc4b308f5deb618096b243`:

```
[
  "actionsBindings-types.ts",
  "actionsBindings.ts",
  "actionsJobs-types-part-1.ts",
  "actionsJobs-types-part-2.ts",
  "actionsJobs-types.ts",
  "actionsJobs.ts",
  "actionsOperations-types-part-1.ts",
  "actionsOperations-types-part-2.ts",
  "actionsOperations-types.ts",
  "actionsOperations.ts",
  "actionsPipelines-types.ts",
  "actionsPipelines.ts",
  "actionsResources-types-part-1.ts",
  "actionsResources-types-part-2.ts",
  "actionsResources-types.ts",
  "actionsResources.ts",
  "actionsRuns-types-part-1.ts",
  "actionsRuns-types-part-2.ts",
  "actionsRuns-types-part-3.ts",
  "actionsRuns-types-part-4.ts",
  "actionsRuns-types.ts",
  "actionsRuns.ts",
  "actionsSource-types.ts",
  "actionsSource.ts",
  "actionsTransfers-types.ts",
  "actionsTransfers.ts",
  "actionsWorkflows-types-part-1.ts",
  "actionsWorkflows-types-part-2.ts",
  "actionsWorkflows-types.ts",
  "actionsWorkflows.ts",
  "client-error.ts",
  "client.ts",
  "errors.ts",
  "index.ts",
  "request.ts",
  "research-types.ts",
  "research.ts",
  "schedules-types.ts",
  "schedules.ts",
  "types.ts"
]
```


## S33 — `packages/client/src/generated-effect/.httpapi-codegen.json`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `4caf4225fe4d24c569bcdc5b4c4310580cea4bbb`; arquivo SHA-256 `4e839ccacb669ba2392da1a5173c08c6636c0b64f86f8faa79b0051969bd7285`; 300 bytes.

Finalidade: Exact Effect generated output membership, 14 names.

Linhas 1–16; trecho SHA-256 `4e839ccacb669ba2392da1a5173c08c6636c0b64f86f8faa79b0051969bd7285`:

```
[
  "actionsBindings.ts",
  "actionsJobs.ts",
  "actionsOperations.ts",
  "actionsPipelines.ts",
  "actionsResources.ts",
  "actionsRuns.ts",
  "actionsSource.ts",
  "actionsTransfers.ts",
  "actionsWorkflows.ts",
  "client-error.ts",
  "client.ts",
  "index.ts",
  "research.ts",
  "schedules.ts"
]
```


## S34 — `packages/client/test/promise.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `a7afeff494a0f19c84eb53b90c716112b8a956f1`; arquivo SHA-256 `6327e27a858011cb7d10c752c589ff49fa6e5a3ee8e4a14ba7569fdc85b1b21f`; 14627 bytes.

Finalidade: Unexecuted intended wire timestamp assertion.

Linhas 101–115; trecho SHA-256 `824dfba3e2ecce2e5e6330b8d9c04d0a38f21edc533d401b142523da3c8c1b47`:

```
test("sessions.get returns the wire projection", async () => {
  const client = Orchestra.make({
    baseUrl: "http://localhost:3000",
    fetch: async (input) => {
      expect(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).toBe(
        "http://localhost:3000/api/session/ses_test",
      )
      return Response.json(session)
    },
  })

  const result = await client.sessions.get({ sessionID: "ses_test" })

  expect(result.time.created).toBe(1_717_171_717_000)
})
```


## S35 — `packages/client/test/effect.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `84ec5ea971c9599163b7a8ac45576337bdf380a8`; arquivo SHA-256 `5c92d1972ecc58f1b6c918341af29a0f6240ffa61b14f1f6b9dd74c9a2c943ac`; 9925 bytes.

Finalidade: Unexecuted intended decoded timestamp assertion.

Linhas 6–16; trecho SHA-256 `2d471da6e7791e74e4e7128d8bb3d9132bdf53aa8d689198b5c604a7218feb50`:

```
test("sessions.get returns the decoded Effect projection", async () => {
  const httpClient = HttpClient.make((request) =>
    Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(session))),
  )
  const result = await Effect.gen(function* () {
    const client = yield* Orchestra.make({ baseUrl: "http://localhost:3000" })
    return yield* client.sessions.get({ sessionID: Session.ID.make("ses_test") })
  }).pipe(Effect.provideService(HttpClient.HttpClient, httpClient), Effect.runPromise)

  expect(DateTime.toEpochMillis(result.time.created)).toBe(1_717_171_717_000)
})
```


## S36 — `packages/server/test/event-stream.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `fbff2eb0f6d4e4affd069c662da7c61c4ead7a2a`; arquivo SHA-256 `fb7b290eab795201302829f1e2b78a7a836b0eec42af50a03c96e3dd68681be6`; 3896 bytes.

Finalidade: Test stand-in scope and unexecuted burst/encoding assertions.

Linhas 8–16; trecho SHA-256 `2e01900552409e3105b8e8b3d4098a5bcb0ac97e543155403eb90cc43ff61ac4`:

```
// Only the event bus is a stand-in: it hands the stream's listener back so the test can publish while nothing reads.
function bus() {
  const listeners: Subscriber[] = []
  const service = {
    listen: (listener: Subscriber) =>
      Effect.sync(() => {
        listeners.push(listener)
        return Effect.void
      }),
```

Linhas 51–59; trecho SHA-256 `237d742db404e12ce0c8fabc9d28e7842a55faea8514d334025bb0dcfe238db8`:

```
          // The first pull installs the subscriber and delivers the connected event.
          let received = frames(yield* pull)
          // A slow renderer reads nothing while a model streams: the queue has to hold the whole burst.
          yield* events.publish(1000)
          while (received < 1001) received += frames(yield* pull)

          expect(received).toBe(1001)
        }),
      ),
```

Linhas 87–94; trecho SHA-256 `7691d0cca5fbd0fc06708463da43faa3c8f7883d986d09d3ceebfa5e7d055b10`:

```
          const received = yield* Effect.forEach(pulls, (pull) => frameOf(pull, id))

          expect(received[0]).toContain(id)
          expect(received[1]).toBe(received[0])
          expect(received[2]).toBe(received[0])
          expect(encoded.get(id)).toBe(1)
        }),
      ),
```


## S37 — `packages/sdk-next/test/embedded.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `6fe30ce4ee65de629cbb63dbba7de447a0a2464c`; arquivo SHA-256 `a32e565a4bdaa2154208128e035c805577684b7d233f9f58b2ffe3c2f93932da`; 10581 bytes.

Finalidade: Unexecuted admission/wake/durable/missing-session/isolation assertions.

Linhas 59–75; trecho SHA-256 `2d9e6b1f442182a32ff7729350b6648f117259f022c3b1e7aac00999218af066`:

```
      const admitted = yield* orchestra.sessions.prompt({
        sessionID,
        prompt: Prompt.make({ text: "Do not run" }),
        resume: false,
      })
      const context = yield* orchestra.sessions.context({ sessionID })
      const wake = yield* orchestra.sessions.prompt({
        sessionID,
        prompt: Prompt.make({ text: "Promote this input" }),
      })
      const prompted = yield* orchestra.sessions.events({ sessionID }).pipe(
        Stream.filter((event) => event.type === "session.next.prompted" && event.data.messageID === wake.id),
        Stream.runHead,
        Effect.timeout("10 seconds"),
        Effect.map(Option.getOrThrow),
      )
      const wakeContext = yield* orchestra.sessions.context({ sessionID })
```

Linhas 108–123; trecho SHA-256 `f98942bc14eb5edb8b46c3a5786eb0350d70ce72bcd9d896deb2c5b1502aaa4b`:

```
      expect(admitted.sessionID).toBe(sessionID)
      expect(prompted.type).toBe("session.next.prompted")
      expect(wakeContext).toContainEqual(expect.objectContaining({ id: wake.id, type: "user" }))
      expect(context.some((message) => message.type === "model-switched")).toBe(true)
      expect(Array.from(events)).toMatchObject([
        { type: "session.next.created", durable: { seq: 0 } },
        { type: "session.next.model.switched", durable: { seq: 1 } },
      ])
      expect(message).toEqual(modelMessage)
      expect(missing.map((error) => error._tag)).toEqual([
        "SessionNotFoundError",
        "SessionNotFoundError",
        "SessionNotFoundError",
      ])
      expect(missingMessage._tag).toBe("MessageNotFoundError")
    })
```

Linhas 166–166; trecho SHA-256 `3ad4ec71e0e93efc14f38645bab8350a691d438d8541c35577a63a8277cf13af`:

```
test("independent embedded hosts do not share live notifications", async () => {
```

Linhas 187–199; trecho SHA-256 `d5d3a712a94cab7fc622f0b085ada04436b463cb2caa77b9126b534e7b0c282c`:

```

      yield* first.events.subscribe().pipe(observe(firstReady, firstEvent), Effect.forkScoped)
      yield* second.events.subscribe().pipe(observe(secondReady, secondEvent), Effect.forkScoped)
      yield* Effect.all([firstReady.await, secondReady.await], { discard: true })
      yield* first.sessions.create({
        id: sessionID,
        location: Location.Ref.make({ directory: AbsolutePath.make(directory) }),
      })
      yield* first.sessions.switchAgent({ sessionID, agent: Agent.ID.make("reviewer") })

      yield* firstEvent.await.pipe(Effect.timeout("2 seconds"))
      expect(Option.isNone(yield* secondEvent.await.pipe(Effect.timeoutOption("100 millis")))).toBe(true)
    })
```


## S38 — `packages/server/test/client-contract-identity.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `6438c7f63dc24ec9406f56be0f451c0e9c49bf9c`; arquivo SHA-256 `122799d92aee38fdf9a64316bcf31861df53fcf9d484cdda1566f0c559a151b9`; 3077 bytes.

Finalidade: Unexecuted intended canonical identity and client/server generation checks.

Linhas 24–45; trecho SHA-256 `7df565cb46018cb7de8439d3610c5ead6870d6078757ef522a6ae79b62f1a307`:

```
test("Core and Server reuse the authoritative Schema and Protocol values", () => {
  expect(AgentV2.ID).toBe(Agent.ID)
  expect(CoreLocation.Ref).toBe(Location.Ref)
  expect(ModelV2.Ref).toBe(Model.Ref)
  expect(SessionV2.Info).toBe(Session.Info)
  expect(CoreSessionInput.Admitted).toBe(SessionInput.Admitted)
  expect(CoreSessionMessage.Message).toBe(SessionMessage.Message)
  expect(CorePrompt).toBe(Prompt)
  expect(Api.groups["server.session"].identifier).toBe("server.session")
  expect(Object.keys(ClientApi.groups)).toEqual(Object.keys(Api.groups))
  expect(Session.ID.create()).toStartWith("ses_")
  expect<string>(Project.ID.global).toBe("global")
  expect<string>(Provider.ID.anthropic).toBe("anthropic")
  expect(Workspace.ID.create()).toStartWith("wrk_")
})

test("client and Server contracts generate identically", () => {
  const server = compile(Api, { groupNames, endpointNames, omitEndpoints })
  const client = compile(ClientApi, { groupNames, endpointNames, omitEndpoints })

  expect(emitPromise(client)).toEqual(emitPromise(server))
})
```

