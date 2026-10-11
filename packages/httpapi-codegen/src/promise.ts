import { Schema, SchemaAST, SchemaRepresentation } from "effect"
import { HttpMethod } from "effect/unstable/http"
import { HttpApiSchema } from "effect/unstable/httpapi"
import { assertErrorSymbols, errorSymbols, GenerationError, identifierPart } from "./error-symbol"
import type { Endpoint, Group, InputField } from "./index"
import {
  declaredErrorFields,
  isStreamSchema,
  resolveHttpApiEncoding,
  resolveHttpApiStatus,
  streamEncodedDataSchema,
} from "./schema-analysis"

export function assertPromiseEndpoint(endpoint: Endpoint) {
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
    (resolveHttpApiEncoding(success.ast)?._tag ?? "Json") !== "Json"
  ) {
    throw new GenerationError({ reason: `Unsupported Promise success encoding: ${name}` })
  }
  for (const error of endpoint.errors) {
    if (declaredErrorFields(error.schema) === undefined) {
      throw new GenerationError({ reason: `Promise error must have a literal discriminator: ${name}` })
    }
    if ((resolveHttpApiEncoding(error.schema.ast)?._tag ?? "Json") !== "Json") {
      throw new GenerationError({ reason: `Unsupported Promise error encoding: ${name}` })
    }
  }
}

export function renderPromiseTypes(
  groups: ReadonlyArray<Group>,
  outputTypes?: Readonly<Record<string, { readonly name: string; readonly import: string }>>,
) {
  const types = new Map<SchemaAST.AST, string>()
  const typeOf = (schema: Schema.Top, decoded = false) => {
    const projected = decoded ? Schema.toType(schema) : Schema.toEncoded(schema)
    const cached = types.get(projected.ast)
    if (cached !== undefined) return cached
    const type = structuralType(projected)
    types.set(projected.ast, type)
    return type
  }
  const errors = errorSymbols(
    groups.flatMap((group) =>
      group.endpoints.flatMap((endpoint) =>
        endpoint.errors.flatMap((error) => {
          const tagged = declaredErrorFields(error.schema)
          return tagged === undefined ? [] : [tagged]
        }),
      ),
    ),
  )
  const errorTypes = Array.from(errors, ([identifier, error]) => {
    const fields = error.fields
      .map(([name, schema, optional]) => `readonly ${JSON.stringify(name)}${optional ? "?" : ""}: ${typeOf(schema)}`)
      .join("; ")
    return `export type ${identifier} = { readonly ${JSON.stringify(error.key)}: ${JSON.stringify(error.tag)}; ${fields} }\nexport const is${identifier} = (value: unknown): value is ${identifier} => typeof value === "object" && value !== null && ${JSON.stringify(error.key)} in value && value[${JSON.stringify(error.key)}] === ${JSON.stringify(error.tag)}`
  })
  const operations = groups
    .flatMap((group) =>
      group.endpoints.flatMap((endpoint) => {
        const prefix = promiseTypePrefix(group.identifier, endpoint.operation.name)
        const schemas = {
          params: endpoint.params,
          query: endpoint.query,
          headers: endpoint.headers,
          payload: endpoint.payloads[0],
        }
        const input = endpoint.input
          .map((field) => {
            const schema = schemas[field.source]
            if (schema === undefined)
              throw new GenerationError({ reason: `Missing input schema: ${prefix}.${field.name}` })
            return `readonly ${JSON.stringify(field.name)}${field.optional ? "?" : ""}: (${typeOf(schema, field.source === "query")})[${JSON.stringify(field.name)}]`
          })
          .join("; ")
        const successSchema = endpoint.successes[0]
        const success =
          outputTypes?.[`${group.identifier}.${endpoint.operation.name}`]?.name ??
          typeOf(
            isStreamSchema(successSchema) && successSchema._tag === "StreamSse"
              ? successSchema.sseMode === "data"
                ? streamEncodedDataSchema(successSchema)
                : successSchema.events
              : successSchema,
          )
        return [
          ...(endpoint.operation.inputMode === "none" ? [] : [`export type ${prefix}Input = { ${input} }`]),
          `export type ${prefix}Output = ${endpoint.unwrapData ? `(${success})["data"]` : success}`,
        ]
      }),
    )
    .join("\n\n")
  const json = Array.from(types.values()).some((type) => type.includes("JsonValue"))
    ? "export type JsonValue = null | boolean | number | string | ReadonlyArray<JsonValue> | { readonly [key: string]: JsonValue }"
    : ""
  const imports = [...new Set(Object.values(outputTypes ?? {}).map((override) => override.import))]
  assertErrorSymbols(
    errors.keys(),
    [...imports, json, operations].filter(Boolean).join("\n\n"),
    errorTypes.join("\n\n"),
  )
  return [...imports, json, ...errorTypes, operations].filter(Boolean).join("\n\n")
}

export function renderPromiseClient(groups: ReadonlyArray<Group>) {
  const imports = groups.flatMap((group) =>
    group.endpoints.flatMap((endpoint) => {
      const prefix = promiseTypePrefix(group.identifier, endpoint.operation.name)
      return [...(endpoint.operation.inputMode === "none" ? [] : [`${prefix}Input`]), `${prefix}Output`]
    }),
  )
  const fields = groups.map((group) => {
    const methods = group.endpoints.map((endpoint) => {
      const prefix = promiseTypePrefix(group.identifier, endpoint.operation.name)
      const argument =
        endpoint.operation.inputMode === "none"
          ? "requestOptions?: RequestOptions"
          : `input${endpoint.operation.inputMode === "optional" ? "?" : ""}: ${prefix}Input, requestOptions?: RequestOptions`
      const path = promisePath(endpoint.endpoint.path, endpoint.input)
      const access = (name: string) =>
        `input${endpoint.operation.inputMode === "optional" ? "?." : ""}[${JSON.stringify(name)}]`
      const part = (source: InputField["source"]) => {
        const inputs = endpoint.input.filter((field) => field.source === source)
        return inputs.length === 0
          ? undefined
          : `{ ${inputs.map((field) => `${JSON.stringify(field.name)}: ${access(field.name)}`).join(", ")} }`
      }
      const parts = [
        endpoint.query === undefined ? undefined : `query: ${part("query")}`,
        endpoint.headers === undefined ? undefined : `headers: ${part("headers")}`,
        endpoint.payloads.length === 0 ? undefined : `body: ${part("payload")}`,
      ].filter((value): value is string => value !== undefined)
      const declaredStatuses = [...new Set(endpoint.errors.map((error) => error.status))]
      const descriptor = `{ method: ${JSON.stringify(endpoint.endpoint.method)}, path: ${path}${parts.length === 0 ? "" : `, ${parts.join(", ")}`}, successStatus: ${resolveHttpApiStatus(endpoint.successes[0].ast) ?? 200}, declaredStatuses: [${declaredStatuses.join(", ")}], empty: ${endpoint.operation.success === "void"} }`
      if (endpoint.operation.success === "stream") {
        const success = endpoint.successes[0]
        if (!isStreamSchema(success) || success._tag !== "StreamSse" || success.sseMode !== "data") {
          throw new GenerationError({
            reason: `Promise stream emission is not implemented: ${group.identifier}.${endpoint.endpoint.name}`,
          })
        }
        return `${JSON.stringify(endpoint.operation.name)}: (${argument}): AsyncIterable<${prefix}Output> => sse<${prefix}Output>(${descriptor}, requestOptions)`
      }
      const unwrap = endpoint.unwrapData ? ".then((value) => value.data)" : ""
      return `${JSON.stringify(endpoint.operation.name)}: (${argument}) => request<${endpoint.unwrapData ? `{ readonly data: ${prefix}Output }` : `${prefix}Output`}>(${descriptor}, requestOptions)${unwrap}`
    })
    if (group.endpoints[0]?.topLevel) return methods.join(", ")
    return `${JSON.stringify(group.identifier)}: { ${methods.join(", ")} }`
  })
  return `import type { ${imports.join(", ")} } from "./types"\nimport { ClientError } from "./client-error"\n\nexport interface ClientOptions {\n  readonly baseUrl: string\n  readonly fetch?: typeof globalThis.fetch\n  readonly headers?: HeadersInit\n}\n\nexport interface RequestOptions {\n  readonly signal?: AbortSignal\n  readonly headers?: HeadersInit\n}\n\ninterface RequestDescriptor {\n  readonly method: string\n  readonly path: string\n  readonly query?: Record<string, unknown>\n  readonly headers?: Record<string, unknown>\n  readonly body?: unknown\n  readonly successStatus: number\n  readonly declaredStatuses: ReadonlyArray<number>\n  readonly empty: boolean\n}\n\nexport function make(options: ClientOptions) {\n  const fetch = options.fetch ?? globalThis.fetch\n\n  const prepare = (descriptor: RequestDescriptor, requestOptions?: RequestOptions) => {\n    const url = new URL(descriptor.path, options.baseUrl)\n    for (const [key, value] of Object.entries(descriptor.query ?? {})) appendQuery(url.searchParams, key, value)\n    const headers = new Headers(options.headers)\n    for (const [key, value] of Object.entries(descriptor.headers ?? {})) {\n      if (value !== undefined && value !== null) headers.set(key, String(value))\n    }\n    for (const [key, value] of new Headers(requestOptions?.headers)) headers.set(key, value)\n    if (descriptor.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json")\n    return {\n      url,\n      init: {\n        method: descriptor.method,\n        signal: requestOptions?.signal,\n        headers,\n        body: descriptor.body === undefined ? undefined : JSON.stringify(descriptor.body),\n      } satisfies RequestInit,\n    }\n  }\n\n  const execute = async (descriptor: RequestDescriptor, requestOptions?: RequestOptions) => {\n    try {\n      const prepared = prepare(descriptor, requestOptions)\n      return await fetch(prepared.url, prepared.init)\n    } catch (cause) {\n      throw new ClientError("Transport", { cause })\n    }\n  }\n\n  const responseError = async (response: Response, descriptor: RequestDescriptor): Promise<never> => {\n    if (descriptor.declaredStatuses.includes(response.status)) throw await json(response)\n    try {\n      await response.body?.cancel()\n    } catch {}\n    throw new ClientError("UnexpectedStatus", { cause: { status: response.status } })\n  }\n\n  const request = async <A>(descriptor: RequestDescriptor, requestOptions?: RequestOptions): Promise<A> => {\n    const response = await execute(descriptor, requestOptions)\n    if (response.status !== descriptor.successStatus) return responseError(response, descriptor)\n    if (descriptor.empty) {\n      try {\n        await response.body?.cancel()\n      } catch {}\n      return undefined as A\n    }\n    return await json(response) as A\n  }\n\n  const sse = <A>(descriptor: RequestDescriptor, requestOptions?: RequestOptions): AsyncIterable<A> => ({\n    async *[Symbol.asyncIterator]() {\n      const response = await execute(descriptor, requestOptions)\n      if (response.status !== descriptor.successStatus) await responseError(response, descriptor)\n      if (!isContentType(response, "text/event-stream")) {\n        try {\n          await response.body?.cancel()\n        } catch {}\n        throw new ClientError("UnsupportedContentType")\n      }\n      if (response.body === null) throw new ClientError("MalformedResponse")\n      const reader = response.body.getReader()\n      const decoder = new TextDecoder()\n      let buffer = ""\n      try {\n        while (true) {\n          let next: ReadableStreamReadResult<Uint8Array>\n          try {\n            next = await reader.read()\n          } catch (cause) {\n            throw new ClientError("Transport", { cause })\n          }\n          buffer += decoder.decode(next.value, { stream: !next.done })\n          if (buffer.length > 1_048_576) throw new ClientError("MalformedResponse")\n          const trailingCarriageReturn = !next.done && buffer.endsWith("\\r")\n          if (trailingCarriageReturn) buffer = buffer.slice(0, -1)\n          buffer = buffer.replaceAll("\\r\\n", "\\n").replaceAll("\\r", "\\n")\n          if (trailingCarriageReturn) buffer += "\\r"\n          if (next.done && buffer !== "") buffer += "\\n\\n"\n          let boundary = buffer.indexOf("\\n\\n")\n          while (boundary >= 0) {\n            const block = buffer.slice(0, boundary)\n            buffer = buffer.slice(boundary + 2)\n            const data = block.split("\\n").flatMap((line) => line.startsWith("data:") ? [line.slice(5).trimStart()] : []).join("\\n")\n            if (data !== "") {\n              try {\n                yield JSON.parse(data) as A\n              } catch (cause) {\n                throw new ClientError("MalformedResponse", { cause })\n              }\n            }\n            boundary = buffer.indexOf("\\n\\n")\n          }\n          if (next.done) return\n        }\n      } finally {\n        try {\n          await reader.cancel()\n        } catch {}\n        reader.releaseLock()\n      }\n    },\n  })\n\n  return { ${fields.join(", ")} }\n}\n\nfunction appendQuery(params: URLSearchParams, key: string, value: unknown): void {\n  if (value === undefined || value === null) return\n  if (Array.isArray(value)) {\n    for (const item of value) appendQuery(params, key, item)\n    return\n  }\n  if (typeof value === "object") {\n    for (const [child, item] of Object.entries(value)) appendQuery(params, \`\${key}[\${child}]\`, item)\n    return\n  }\n  params.append(key, String(value))\n}\n\nasync function json(response: Response): Promise<unknown> {\n  if (!isContentType(response, "application/json") && !response.headers.get("content-type")?.includes("+json")) {\n    try {\n      await response.body?.cancel()\n    } catch {}\n    throw new ClientError("UnsupportedContentType")\n  }\n  let text: string\n  try {\n    text = await response.text()\n  } catch (cause) {\n    throw new ClientError("Transport", { cause })\n  }\n  if (text === "") throw new ClientError("MalformedResponse")\n  try {\n    return JSON.parse(text)\n  } catch (cause) {\n    throw new ClientError("MalformedResponse", { cause })\n  }\n}\n\nfunction isContentType(response: Response, expected: string) {\n  return response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() === expected\n}\n`
}

function promiseTypePrefix(group: string, endpoint: string) {
  return `${identifierPart(group)}${identifierPart(endpoint)}`
}

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
      type = type.replace(new RegExp(pattern, "g"), `(${expand(value, new Set([...seen, reference]))})`)
    }
    return type
  }
  return expand(document.codes[0].Type)
    .replaceAll(/ & Brand\.Brand<"[^"]+">/g, "")
    .replaceAll("Schema.Json", "JsonValue")
}

export function promisePath(path: string, input: ReadonlyArray<InputField>) {
  if (path.includes("*")) throw new GenerationError({ reason: `Unsupported Promise path wildcard: ${path}` })
  const fields = new Set(input.filter((field) => field.source === "params").map((field) => field.name))
  const segments = path.split(/(:[A-Za-z_][A-Za-z0-9_]*)/g).filter(Boolean)
  const template = segments
    .map((segment) => {
      if (!segment.startsWith(":")) return segment.replaceAll("`", "\\`")
      const name = segment.slice(1)
      if (!fields.has(name)) throw new GenerationError({ reason: `Missing path parameter: ${name}` })
      return `\${encodeURIComponent(input.${name})}`
    })
    .join("")
  return `\`${template}\``
}
