import { isAbsolute, join } from "node:path"
import { Effect, FileSystem, PlatformError, Schema, SchemaAST, SchemaRepresentation } from "effect"
import type { HttpRouter } from "effect/unstable/http"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"
import { format } from "prettier"
import { renderEffectMake } from "./effect-headers"
import { GenerationError } from "./error-symbol"
import { assertPromiseEndpoint, renderPromiseClient, renderPromiseTypes } from "./promise"
import {
  assertPortable,
  isDataEnvelope,
  isStreamSchema,
  metadataPortable,
  resolveHttpApiEncoding,
  resolveHttpApiStatus,
  responseSchemas,
  sameEncoding,
  streamDataSchema,
  streamEffectPortable,
  taggedErrorFields,
} from "./schema-analysis"

export type InputField = {
  readonly name: string
  readonly source: "params" | "query" | "headers" | "payload"
}

export type Operation = {
  readonly group: string
  readonly name: string
  readonly input: ReadonlyArray<InputField>
  readonly inputMode: "none" | "optional" | "required"
  readonly success: "value" | "void" | "stream"
  readonly errors: ReadonlyArray<string>
}

export type Output = {
  readonly operations: ReadonlyArray<Operation>
  readonly files: ReadonlyArray<{
    readonly path: string
    readonly content: string
  }>
}

export type Contract = {
  readonly groups: ReadonlyArray<Group>
}

export { GenerationError } from "./error-symbol"

export type Endpoint = {
  readonly group: string
  readonly sourceGroup: string
  readonly topLevel: boolean
  readonly endpoint: HttpApiEndpoint.AnyWithProps
  readonly params: Schema.Top | undefined
  readonly query: Schema.Top | undefined
  readonly headers: Schema.Top | undefined
  readonly payloads: ReadonlyArray<Schema.Top>
  readonly operation: Operation
  readonly input: ReadonlyArray<InputField & { readonly optional: boolean }>
  readonly unwrapData: boolean
  readonly errors: ReadonlyArray<{ readonly status: number; readonly schema: Schema.Top }>
  readonly successes: ReadonlyArray<Schema.Top>
  readonly effectPortable: boolean
}

export type Group = {
  readonly identifier: string
  readonly sourceIdentifier: string
  readonly module: string
  readonly endpoints: ReadonlyArray<Endpoint>
}

type Slot = {
  readonly name: string
  readonly schema: Schema.Top
}

const Manifest = Schema.fromJsonString(Schema.Array(Schema.String))
const manifestName = ".httpapi-codegen.json"

export function compile<Id extends string, Groups extends HttpApiGroup.Any>(
  api: HttpApi.HttpApi<Id, Groups>,
  options?: {
    readonly groupNames?: Readonly<Record<string, string>>
    readonly endpointNames?: Readonly<Record<string, string>>
    readonly omitEndpoints?: ReadonlySet<string>
  },
): Contract {
  const endpoints: Array<Endpoint> = []
  const portable = new Map<SchemaAST.AST, boolean>()

  HttpApi.reflect(api, {
    onGroup() {},
    onEndpoint({ endpoint, errors, group, middleware }) {
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

      const params = normalizeTransport(endpoint.params, "params", endpoint, name)
      const query = normalizeTransport(endpoint.query, "query", endpoint, name)
      const headers = normalizeTransport(endpoint.headers, "headers", endpoint, name)
      const sourcePayloads = Array.from(endpoint.payload.values()).flatMap(({ schemas }) => schemas)
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

      const schemaPaths: Array<readonly [string, Schema.Top]> = [
        ...(params === undefined ? [] : [[`${name}.params`, params.schema] as const]),
        ...(query === undefined ? [] : [[`${name}.query`, query.schema] as const]),
        ...(headers === undefined ? [] : [[`${name}.headers`, headers.schema] as const]),
        ...payloads.map((item) => [`${name}.payload`, item.schema] as const),
        ...responseSchemas(success.schema, `${name}.success`),
        ...errorSchemas.map((item) => [`${name}.error.${item.status}`, item.schema] as const),
      ]
      const effectPortable =
        [params, query, headers, ...payloads, success, ...errorSchemas].every(
          (item) => item?.effectPortable !== false,
        ) && streamEffectPortable(success.schema)
      if (effectPortable) {
        for (const [path, schema] of schemaPaths) assertPortable(schema, path, portable)
      }

      endpoints.push({
        group: groupName,
        sourceGroup: group.identifier,
        topLevel: group.topLevel,
        endpoint,
        params: params?.schema,
        query: query?.schema,
        headers: headers?.schema,
        payloads: payloads.map((item) => item.schema),
        input: inputs,
        unwrapData: isDataEnvelope(success.schema),
        successes: [success.schema],
        errors: errorSchemas.map((item) => ({ status: item.status, schema: item.schema })),
        effectPortable,
        operation: {
          group: groupName,
          name: options?.endpointNames?.[endpoint.name] ?? clientEndpointName(endpoint.name),
          input: inputs.map(({ name, source }) => ({ name, source })),
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
              "ClientError",
            ]),
          ],
        },
      })
    },
  })

  const modules = new Set(["client", "client-error", "index"])
  const groups = Array.from(
    Map.groupBy(endpoints, (endpoint) => endpoint.group),
    ([identifier, endpoints], index) => {
      if (new Set(endpoints.map((endpoint) => endpoint.sourceGroup)).size > 1) {
        throw new GenerationError({ reason: `Client group name collision: ${identifier}` })
      }
      const base = /^[A-Za-z0-9_-]+$/.test(identifier) ? identifier : `group-${index}`
      const module = uniqueModule(base, index, modules)
      modules.add(module.toLowerCase())
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
    groups,
  }
}

export function emitEffect(contract: Contract): Output {
  const endpoint = contract.groups.flatMap((group) => group.endpoints).find((endpoint) => !endpoint.effectPortable)
  if (endpoint !== undefined) {
    throw new GenerationError({
      reason: `Effect schema requires authoritative import: ${endpoint.group}.${endpoint.endpoint.name}`,
    })
  }
  return { operations: operations(contract.groups), files: renderEffectFiles(contract.groups) }
}

export function emitEffectImported(
  contract: Contract,
  options:
    | { readonly module: string; readonly api: string }
    | { readonly module: string; readonly group: string }
    | { readonly module: string; readonly endpoints: Readonly<Record<string, string>> },
): Output {
  return {
    operations: operations(contract.groups),
    files: renderImportedEffectFiles(contract.groups, options),
  }
}

export function emitPromise(
  contract: Contract,
  options?: {
    readonly outputTypes?: Readonly<Record<string, { readonly name: string; readonly import: string }>>
  },
): Output {
  const groups = contract.groups
  for (const group of groups) {
    for (const endpoint of group.endpoints) assertPromiseEndpoint(endpoint)
  }
  return {
    operations: operations(groups),
    files: [
      { path: "types.ts", content: renderPromiseTypes(groups, options?.outputTypes) },
      {
        path: "client-error.ts",
        content: `export type ClientErrorReason = "Transport" | "UnexpectedStatus" | "UnsupportedContentType" | "MalformedResponse"\n\nexport class ClientError extends Error {\n  override readonly name = "ClientError"\n  constructor(readonly reason: ClientErrorReason, options?: ErrorOptions) {\n    super(reason, options)\n  }\n}\n`,
      },
      {
        path: "client.ts",
        content: renderPromiseClient(groups).replace("let next: ReadableStreamReadResult<Uint8Array>", "let next"),
      },
      {
        path: "index.ts",
        content:
          'export { ClientError, type ClientErrorReason } from "./client-error"\nexport * as Orchestra from "./client"\nexport * from "./types"\n',
      },
    ],
  }
}

function operations(groups: ReadonlyArray<Group>) {
  return groups.flatMap((group) => group.endpoints.map((endpoint) => endpoint.operation))
}

function renderEffectFiles(groups: ReadonlyArray<Group>): Output["files"] {
  return [
    ...groups.map((group, index) => ({ path: `${group.module}.ts`, content: renderGroup(group, index) })),
    {
      path: "client-error.ts",
      content:
        'import { Schema } from "effect"\n\nexport class ClientError extends Schema.TaggedErrorClass<ClientError>()("ClientError", {\n  cause: Schema.Defect(),\n}) {}\n',
    },
    { path: "client.ts", content: renderClient(groups) },
    {
      path: "index.ts",
      content: 'export { ClientError } from "./client-error"\nexport * as Orchestra from "./client"\n',
    },
  ]
}

function renderImportedEffectFiles(
  groups: ReadonlyArray<Group>,
  options:
    | { readonly module: string; readonly api: string }
    | { readonly module: string; readonly group: string }
    | { readonly module: string; readonly endpoints: Readonly<Record<string, string>> },
): Output["files"] {
  const adapters = groups.map((group, groupIndex) => {
    const rawGroup = group.endpoints[0]?.topLevel ? "RawClient" : `RawClient[${JSON.stringify(group.sourceIdentifier)}]`
    const methods = group.endpoints.map((item, endpointIndex) => {
      const prefix = `Endpoint${groupIndex}_${endpointIndex}`
      const request = (["params", "query", "headers", "payload"] as const)
        .flatMap((source) => {
          const fields = item.input.filter((field) => field.source === source)
          if (fields.length === 0 && (source !== "query" || item.query === undefined)) return []
          return [
            `${source}: { ${fields.map((field) => renderInputField(field, item.operation.inputMode)).join(", ")} }`,
          ]
        })
        .join(", ")
      const input = item.input
        .map(
          (field) =>
            `readonly ${JSON.stringify(field.name)}${field.optional ? "?" : ""}: ${prefix}Request[${JSON.stringify(field.source)}][${JSON.stringify(field.name)}]`,
        )
        .join("; ")
      const argument =
        item.operation.inputMode === "none"
          ? ""
          : `input${item.operation.inputMode === "optional" ? "?" : ""}: ${prefix}Input`
      const rawCall = `raw[${JSON.stringify(item.endpoint.name)}]({ ${request} })`
      const mapped = `${rawCall}.pipe(Effect.mapError(mapClientError)${item.unwrapData ? ", Effect.map((value) => value.data)" : ""})`
      return `${item.operation.inputMode === "none" ? "" : `type ${prefix}Request = Parameters<${rawGroup}[${JSON.stringify(item.endpoint.name)}]>[0]\ntype ${prefix}Input = { ${input} }\n`}const ${prefix} = (raw: ${rawGroup}) => (${argument}) => ${item.operation.success === "stream" ? `Stream.unwrap(${rawCall}.pipe(Effect.mapError(mapClientError), Effect.map((stream) => stream.pipe(Stream.mapError(mapClientError)))))` : mapped}`
    })
    return `${methods.join("\n\n")}\n\nconst adaptGroup${groupIndex} = (raw: ${rawGroup}) => ({ ${group.endpoints.map((item, endpointIndex) => `${JSON.stringify(item.operation.name)}: Endpoint${groupIndex}_${endpointIndex}(raw)`).join(", ")} })`
  })
  const fields = groups.flatMap((group, index) =>
    group.endpoints[0]?.topLevel
      ? [`...adaptGroup${index}(raw)`]
      : [`${JSON.stringify(group.identifier)}: adaptGroup${index}(raw[${JSON.stringify(group.sourceIdentifier)}])`],
  )
  const usesStream = groups.some((group) => group.endpoints.some((item) => item.operation.success === "stream"))
  const imported = "api" in options
  const projection = imported
    ? undefined
    : "group" in options
      ? renderImportedGroup(options.group)
      : renderImportedProjection(groups, options.endpoints)
  const api = imported ? options.api : "Api"
  const imports =
    projection === undefined
      ? `import { ${api} } from ${JSON.stringify(options.module)}`
      : `import { HttpApi, HttpApiClient${"endpoints" in options ? ", HttpApiGroup" : ""} } from "effect/unstable/httpapi"\nimport { ${projection.imports.join(", ")} } from ${JSON.stringify(options.module)}`
  const httpApiImport = projection === undefined ? 'import { HttpApiClient } from "effect/unstable/httpapi"\n' : ""
  const client = `// Generated by @orchestra/httpapi-codegen. Do not edit.\nimport { Effect${usesStream ? ", Stream" : ""}, Schema } from "effect"\nimport { Sse } from "effect/unstable/encoding"\nimport { HttpClient, HttpClientError, HttpClientRequest } from "effect/unstable/http"\n${httpApiImport}${imports}\nimport { ClientError } from "./client-error"\n\n${projection?.source ?? ""}type RawClient = HttpApiClient.ForApi<typeof ${api}>\n\nconst mapClientError = <E>(error: E) => HttpClientError.isHttpClientError(error) || Schema.isSchemaError(error) || Sse.Retry.is(error) ? new ClientError({ cause: error }) : error\n\n${adapters.join("\n\n")}\n\nconst adaptClient = (raw: RawClient) => ({ ${fields.join(", ")} })\n\n${renderEffectMake(api)}\n`
  return [
    {
      path: "client-error.ts",
      content:
        'import { Schema } from "effect"\n\nexport class ClientError extends Schema.TaggedErrorClass<ClientError>()("ClientError", {\n  cause: Schema.Defect(),\n}) {}\n',
    },
    { path: "client.ts", content: client },
    {
      path: "index.ts",
      content: 'export { ClientError } from "./client-error"\nexport * as Orchestra from "./client"\n',
    },
  ]
}

function renderInputField(field: InputField & { readonly optional: boolean }, inputMode: Operation["inputMode"]) {
  const key = JSON.stringify(field.name)
  const value = `input${inputMode === "optional" ? "?." : ""}[${key}]`
  // Strict optional keys accept absence, not an own property whose value is undefined.
  return field.source === "query" && field.optional
    ? `...(${value} === undefined ? {} : { ${key}: ${value} })`
    : `${key}: ${value}`
}

function renderImportedGroup(group: string) {
  return {
    imports: [group],
    source: `const Api = HttpApi.make("generated").add(${group})\n\n`,
  }
}

function renderImportedProjection(groups: ReadonlyArray<Group>, endpoints: Readonly<Record<string, string>>) {
  const imports = groups.flatMap((group) =>
    group.endpoints.map((endpoint) => {
      const name = endpoints[`${group.identifier}.${endpoint.endpoint.name}`]
      if (name === undefined) {
        throw new GenerationError({
          reason: `Missing imported endpoint: ${group.identifier}.${endpoint.endpoint.name}`,
        })
      }
      return name
    }),
  )
  const source = `const Api = HttpApi.make("generated").${groups
    .map((group) => {
      const options = group.endpoints[0]?.topLevel ? ", { topLevel: true }" : ""
      return `add(HttpApiGroup.make(${JSON.stringify(group.identifier)}${options})${group.endpoints.map((endpoint) => `.add(${endpoints[`${group.identifier}.${endpoint.endpoint.name}`]})`).join("")})`
    })
    .join(".")}\n\n`
  return { imports: [...new Set(imports)], source }
}

function clientEndpointName(name: string) {
  return name.slice(name.lastIndexOf(".") + 1)
}

function uniqueModule(base: string, index: number, modules: ReadonlySet<string>) {
  if (!modules.has(base.toLowerCase())) return base
  const seed = `${base}-${index}`
  let suffix = 0
  while (modules.has(`${seed}${suffix === 0 ? "" : `-${suffix}`}`.toLowerCase())) suffix++
  return `${seed}${suffix === 0 ? "" : `-${suffix}`}`
}

function normalizeTransport(
  schema: Schema.Top | undefined,
  source: InputField["source"] | "success" | "error",
  endpoint: HttpApiEndpoint.AnyWithProps,
  operation: string,
) {
  if (schema === undefined) return undefined
  if (isStreamSchema(schema)) return { schema, effectPortable: true } as const
  if (!metadataPortable(schema.ast, new Set())) {
    throw new GenerationError({ reason: `Unportable schema: ${operation}.${source}` })
  }
  const decoded = Schema.toType(schema)
  if (!isPathInput(endpoint.path)) {
    throw new GenerationError({ reason: `Invalid endpoint path: ${operation}` })
  }
  const rebuilt = HttpApiEndpoint.make(endpoint.method)(endpoint.name, endpoint.path, {
    ...(source === "params" ? { params: decoded } : undefined),
    ...(source === "query" ? { query: decoded } : undefined),
    ...(source === "headers" ? { headers: decoded } : undefined),
    ...(source === "payload" ? { payload: decoded } : undefined),
    ...(source === "success" ? { success: decoded } : { success: Schema.String }),
    ...(source === "error" ? { error: decoded } : undefined),
  })
  const normalized =
    source === "params"
      ? rebuilt.params
      : source === "query"
        ? rebuilt.query
        : source === "headers"
          ? rebuilt.headers
          : source === "payload"
            ? Array.from(rebuilt.payload.values())[0]?.schemas[0]
            : source === "success"
              ? Array.from(rebuilt.success)[0]
              : Array.from(rebuilt.error)[0]
  if (normalized === undefined) throw new GenerationError({ reason: `Unportable schema: ${operation}.${source}` })
  if (!sameEncoding(schema.ast, normalized.ast)) return { schema, effectPortable: false } as const
  return { schema: decoded, effectPortable: true } as const
}

function isPathInput(path: string): path is HttpRouter.PathInput {
  return path === "*" || path.startsWith("/")
}

export function write(
  output: Output,
  directory: string,
): Effect.Effect<void, GenerationError | PlatformError.PlatformError, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const paths = new Set<string>()
    const normalizedPaths = new Set<string>()
    for (const file of output.files) {
      if (!isSafeOutputPath(file.path)) yield* new GenerationError({ reason: `Unsafe output path: ${file.path}` })
      const path = file.path.toLowerCase()
      if (normalizedPaths.has(path)) yield* new GenerationError({ reason: `Duplicate output path: ${file.path}` })
      normalizedPaths.add(path)
      paths.add(file.path)
    }
    const fs = yield* FileSystem.FileSystem
    yield* fs.makeDirectory(directory, { recursive: true })
    const manifest = join(directory, manifestName)
    const previous = (yield* fs.exists(manifest))
      ? yield* fs.readFileString(manifest).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(Manifest)),
          Effect.mapError(() => new GenerationError({ reason: `Invalid generated file manifest: ${manifest}` })),
        )
      : []
    if (previous.some((path) => !isSafeOutputPath(path))) {
      yield* new GenerationError({ reason: `Invalid generated file manifest: ${manifest}` })
    }
    yield* Effect.forEach(
      previous.filter((path) => !paths.has(path)),
      (path) => fs.remove(join(directory, path), { force: true }),
      { concurrency: 8, discard: true },
    )
    yield* Effect.forEach(
      output.files,
      (file) =>
        fs.exists(join(directory, file.path)).pipe(
          Effect.flatMap((exists) => (exists ? fs.stat(join(directory, file.path)) : Effect.succeed(undefined))),
          Effect.flatMap((info) =>
            info?.type === "SymbolicLink"
              ? new GenerationError({ reason: `Unsafe output path: ${file.path}` })
              : Effect.void,
          ),
        ),
      { concurrency: 8, discard: true },
    )
    yield* Effect.forEach(
      output.files,
      (file) =>
        Effect.tryPromise({
          try: () => format(file.content, { filepath: file.path, parser: "typescript", semi: false, printWidth: 120 }),
          catch: (error) => new GenerationError({ reason: `Failed to format ${file.path}: ${String(error)}` }),
        }).pipe(Effect.flatMap((content) => fs.writeFileString(join(directory, file.path), content))),
      { concurrency: 8, discard: true },
    )
    yield* fs.writeFileString(manifest, JSON.stringify(output.files.map((file) => file.path).sort(), null, 2) + "\n")
  })
}

function isSafeOutputPath(path: string) {
  return path !== manifestName && !isAbsolute(path) && path !== "." && path !== ".." && !/[\\/]/.test(path)
}

export function generate<Id extends string, Groups extends HttpApiGroup.Any>(
  api: HttpApi.HttpApi<Id, Groups>,
  options: { readonly directory: string },
): Effect.Effect<void, GenerationError | PlatformError.PlatformError, FileSystem.FileSystem> {
  return Effect.try({
    try: () => emitEffect(compile(api)),
    catch: (error) => (error instanceof GenerationError ? error : new GenerationError({ reason: String(error) })),
  }).pipe(Effect.flatMap((output) => write(output, options.directory)))
}

function inputFields(schema: Schema.Top | undefined, source: InputField["source"], operation: string) {
  if (schema === undefined) return []
  const ast = Schema.toType(schema).ast
  if (!SchemaAST.isObjects(ast) || ast.indexSignatures.length > 0) {
    throw new GenerationError({ reason: `Input schema must be a struct: ${operation}.${source}` })
  }
  return ast.propertySignatures.map((field) => {
    if (typeof field.name !== "string") {
      throw new GenerationError({ reason: `Input field must have a string name: ${operation}.${source}` })
    }
    return {
      name: field.name,
      source,
      optional: SchemaAST.isOptional(field.type),
    }
  })
}

function renderGroup(group: Group, groupIndex: number) {
  const slots: Array<Slot> = []
  const adapters: Array<string> = []
  const endpointSources = group.endpoints.map((operation, endpointIndex) => {
    const {
      endpoint,
      errors,
      headers: endpointHeaders,
      params: endpointParams,
      payloads: endpointPayloads,
      query: endpointQuery,
      successes,
    } = operation
    const prefix = `Endpoint${endpointIndex}`
    const params = addSlot(endpointParams, `${prefix}Params`)
    const query = addSlot(endpointQuery, `${prefix}Query`)
    const headers = addSlot(endpointHeaders, `${prefix}Headers`)
    const payloads = endpointPayloads.map((schema, index) => addSlot(schema, `${prefix}Payload${index}`)!)
    const success = renderSuccess(successes[0], `${prefix}Success`)
    const errorSlots = errors.map((error, index) => addSlot(error.schema, `${prefix}Error${index}`)!)
    const options = [
      params === undefined ? undefined : `params: ${params.name}`,
      query === undefined ? undefined : `query: ${query.name}`,
      headers === undefined ? undefined : `headers: ${headers.name}`,
      payloads.length === 0
        ? undefined
        : `payload: ${payloads.length === 1 ? payloads[0].name : `[${payloads.map((slot) => slot.name).join(", ")}]`}`,
      `success: ${success.source}`,
      errorSlots.length === 0
        ? undefined
        : `error: ${errorSlots.length === 1 ? errorSlots[0].name : `[${errorSlots.map((slot) => slot.name).join(", ")}]`}`,
    ].filter((option): option is string => option !== undefined)
    const schemaBySource = { params, query, headers, payload: payloads[0] }
    const inputType = operation.input
      .map((field) => {
        const slot = schemaBySource[field.source]
        if (slot === undefined) {
          throw new GenerationError({ reason: `Missing input schema: ${group.identifier}.${endpoint.name}` })
        }
        return `readonly ${JSON.stringify(field.name)}${field.optional ? "?" : ""}: (typeof ${slot.name}.Type)[${JSON.stringify(field.name)}]`
      })
      .join("; ")
    const argument =
      operation.operation.inputMode === "none"
        ? ""
        : `input${operation.operation.inputMode === "optional" ? "?" : ""}: ${prefix}Input`
    const request = (["params", "query", "headers", "payload"] as const)
      .flatMap((source) => {
        const slot = schemaBySource[source]
        if (slot === undefined) return []
        const fields = operation.input
          .filter((field) => field.source === source)
          .map((field) => renderInputField(field, operation.operation.inputMode))
        return [`${source}: { ${fields.join(", ")} }`]
      })
      .join(", ")
    const declared = [...errorSlots, ...(success.streamError === undefined ? [] : [success.streamError])]
    const declaredSchema =
      declared.length === 0 ? "Schema.Never" : `Schema.Union([${declared.map((slot) => slot.name).join(", ")}])`
    const rawCall = `raw[${JSON.stringify(endpoint.name)}]({ ${request} })`
    const mapped = `${rawCall}.pipe(Effect.mapError(map${prefix}Error)${operation.unwrapData ? ", Effect.map((value) => value.data)" : ""})`
    const inputDeclaration = operation.operation.inputMode === "none" ? "" : `type ${prefix}Input = { ${inputType} }\n`
    adapters.push(
      `${inputDeclaration}const ${prefix}DeclaredError = ${declaredSchema}\nconst map${prefix}Error = (error: unknown) => HttpClientError.isHttpClientError(error) || Schema.isSchemaError(error) || Sse.Retry.is(error) ? new ClientError({ cause: error }) : Schema.is(${prefix}DeclaredError)(error) ? error : new ClientError({ cause: error })\nconst ${prefix} = (raw: RawGroup) => (${argument}) => ${operation.operation.success === "stream" ? `Stream.unwrap(${rawCall}.pipe(Effect.mapError(map${prefix}Error), Effect.map((stream) => stream.pipe(Stream.mapError(map${prefix}Error)))))` : mapped}`,
    )
    return `HttpApiEndpoint.make(${JSON.stringify(endpoint.method)})(${JSON.stringify(endpoint.name)}, ${JSON.stringify(endpoint.path)}, { ${options.join(", ")} })`
  })

  function addSlot(schema: Schema.Top | undefined, name: string) {
    if (schema === undefined) return undefined
    const slot = { name, schema }
    slots.push(slot)
    return slot
  }

  function renderSuccess(schema: Schema.Top, name: string) {
    if (!isStreamSchema(schema)) return { source: addSlot(schema, name)!.name }
    const status = resolveHttpApiStatus(schema.ast) ?? 200
    const annotate = status === 200 ? "" : `.pipe(HttpApiSchema.status(${status}))`
    if (schema._tag === "StreamUint8Array") {
      return {
        source: `HttpApiSchema.StreamUint8Array({ contentType: ${JSON.stringify(schema.contentType)} })${annotate}`,
      }
    }
    const value = addSlot(
      schema.sseMode === "data" ? streamDataSchema(schema) : schema.events,
      `${name}${schema.sseMode === "data" ? "Data" : "Events"}`,
    )!
    const error = addSlot(schema.error, `${name}Error`)!
    return {
      source: `HttpApiSchema.StreamSse({ ${schema.sseMode}: ${value.name}, error: ${error.name}, contentType: ${JSON.stringify(schema.contentType)} })${annotate}`,
      streamError: error,
    }
  }

  const declarations = renderSchemas(slots)
  const groupSource = `HttpApiGroup.make(${JSON.stringify(group.identifier)}, { topLevel: ${group.endpoints[0]?.topLevel ?? false} })${endpointSources.map((endpoint) => `.add(${endpoint})`).join("")}`
  const usesHttpApiSchema = endpointSources.some((source) => source.includes("HttpApiSchema."))
  const methods = group.endpoints
    .map((item, index) => `${JSON.stringify(item.operation.name)}: Endpoint${index}(raw)`)
    .join(", ")
  const rawGroup = group.endpoints[0]?.topLevel
    ? `HttpApiClient.Client<typeof Group${groupIndex}>`
    : `HttpApiClient.Client.Group<typeof Group${groupIndex}, ${JSON.stringify(group.identifier)}, never, never>`
  const usesStream = group.endpoints.some((item) => item.operation.success === "stream")
  return `// Generated by @orchestra/httpapi-codegen. Do not edit.\nimport { Effect, Schema${usesStream ? ", Stream" : ""} } from "effect"\nimport { Sse } from "effect/unstable/encoding"\nimport { HttpClientError } from "effect/unstable/http"\nimport { HttpApiClient, HttpApiEndpoint, HttpApiGroup${usesHttpApiSchema ? ", HttpApiSchema" : ""} } from "effect/unstable/httpapi"\nimport { ClientError } from "./client-error"\n\n${declarations}\n\nexport const Group${groupIndex} = ${groupSource}\n\ntype RawGroup = ${rawGroup}\n\n${adapters.join("\n\n")}\n\nexport const adaptGroup${groupIndex} = (raw: RawGroup) => ({ ${methods} })\n`
}

function renderSchemas(slots: ReadonlyArray<Slot>) {
  if (slots.length === 0) return ""
  const classes = new Map(
    slots.flatMap((slot, index) => {
      const tagged = taggedErrorFields(slot.schema)
      return tagged === undefined ? [] : [[index, tagged] as const]
    }),
  )
  const expanded = [
    ...slots.map((slot, index) => (classes.has(index) ? { name: slot.name, schema: Schema.Never } : slot)),
    ...Array.from(classes.values()).flatMap((tagged, classIndex) =>
      tagged.fields.map(([name, schema]) => ({ name: `Class${classIndex}${name}`, schema })),
    ),
  ]
  const [first, ...rest] = expanded
  const document = SchemaRepresentation.toCodeDocument(
    SchemaRepresentation.fromASTs([first.schema.ast, ...rest.map((slot) => slot.schema.ast)]),
  )
  const artifacts = document.artifacts.flatMap((artifact) => {
    if (artifact._tag === "Import") return [artifact.importDeclaration]
    if (artifact._tag === "Enum") return [artifact.generation.runtime]
    return [`const ${artifact.identifier} = ${artifact.generation.runtime}`]
  })
  const references = [
    ...document.references.nonRecursives.map(({ $ref, code }) => `const ${$ref} = ${code.runtime}`),
    ...Object.entries(document.references.recursives).map(
      ([$ref, code]) => `type ${$ref} = ${code.Type}\nconst ${$ref}: Schema.Codec<${$ref}> = ${code.runtime}`,
    ),
  ]
  let fieldIndex = slots.length
  const declarations = slots.map((slot, index) => {
    const tagged = classes.get(index)
    if (tagged === undefined) return `const ${slot.name} = ${document.codes[index].runtime}`
    const fields = tagged.fields
      .map(([name]) => `${JSON.stringify(name)}: ${document.codes[fieldIndex++].runtime}`)
      .join(", ")
    const annotations = Object.entries({
      httpApiStatus: resolveHttpApiStatus(slot.schema.ast),
      "~httpApiEncoding": resolveHttpApiEncoding(slot.schema.ast),
    }).filter((entry) => entry[1] !== undefined)
    const annotate =
      annotations.length === 0
        ? ""
        : `.annotate({ ${annotations.map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(", ")} })`
    return `class ${slot.name}Class extends Schema.TaggedErrorClass<${slot.name}Class>(${JSON.stringify(tagged.identifier)})(${JSON.stringify(tagged.tag)}, { ${fields} }) {}\nconst ${slot.name} = ${slot.name}Class${annotate}`
  })
  return [...artifacts, ...references, ...declarations].join("\n\n")
}

function renderClient(groups: ReadonlyArray<Group>) {
  const imports = groups
    .map((group, index) => `import { adaptGroup${index}, Group${index} } from ${JSON.stringify(`./${group.module}`)}`)
    .join("\n")
  const api = `HttpApi.make("generated")${groups.map((_, index) => `.add(Group${index})`).join("")}`
  const fields = groups.flatMap((group, index) => {
    if (!group.endpoints[0]?.topLevel) {
      return [`${JSON.stringify(group.identifier)}: adaptGroup${index}(raw[${JSON.stringify(group.identifier)}])`]
    }
    const raw = `{ ${group.endpoints.map((item) => `${JSON.stringify(item.endpoint.name)}: raw[${JSON.stringify(item.endpoint.name)}]`).join(", ")} }`
    return [`...adaptGroup${index}(${raw})`]
  })
  return `// Generated by @orchestra/httpapi-codegen. Do not edit.\nimport { Effect } from "effect"\nimport { HttpClient, HttpClientRequest } from "effect/unstable/http"\nimport { HttpApi, HttpApiClient } from "effect/unstable/httpapi"\n${imports}\n\nconst Api = ${api}\nconst adaptClient = (raw: HttpApiClient.ForApi<typeof Api>) => ({ ${fields.join(", ")} })\n\n${renderEffectMake("Api")}\n`
}
