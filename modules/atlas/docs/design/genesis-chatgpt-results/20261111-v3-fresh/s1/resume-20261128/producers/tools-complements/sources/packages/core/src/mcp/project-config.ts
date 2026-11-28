export * as McpProjectConfig from "./project-config"

import path from "path"
import { Effect, Schema } from "effect"
import type { ConfigMCP } from "@orchestra/schema/config-mcp"
import { KeyedMutex } from "../effect/keyed-mutex"
import { applyEdits, modify, parse, parseTree, type ParseError, printParseErrorCode } from "jsonc-parser"
import { FSUtil } from "../fs-util"

/** A profile config file that cannot be read, parsed, or written as asked. */
export class FileError extends Schema.TaggedErrorClass<FileError>()("McpProjectConfig.FileError", {
  file: Schema.String,
  message: Schema.String,
}) {}

/** The fields the MCP page edits, exactly as written in the file (`{env:...}` stays unresolved). */
export const Entry = Schema.Struct({
  type: Schema.optional(Schema.Literals(["local", "remote"])),
  command: Schema.optional(Schema.Array(Schema.String)),
  url: Schema.optional(Schema.String),
})
export type Entry = Schema.Schema.Type<typeof Entry>

/** One server as `write` stores it: the shape `orchestra mcp add` writes, which V2 config reads through its legacy migration. */
export type Written = { readonly type: "local" | "remote"; readonly [key: string]: unknown }

type Document = { file: string; text?: string; value?: unknown; errors: readonly ParseError[] }

const format = { formattingOptions: { tabSize: 2, insertSpaces: true } }
// Keys that only make sense for one transport; switching transport drops the other side's keys.
const exclusive = {
  local: ["command", "cwd", "environment"],
  remote: ["url", "headers", "oauth"],
} as const
// One writer per profile directory; a directory's lock is dropped once no writer holds or waits for it.
export const writers = KeyedMutex.makeUnsafe<string>()

// The profile-scoped files `orchestra mcp add` writes, in load order (a later file wins).
export function files(directory: string) {
  return [
    path.join(directory, "orchestra.json"),
    path.join(directory, "orchestra.jsonc"),
    path.join(directory, ".orchestra", "orchestra.json"),
    path.join(directory, ".orchestra", "orchestra.jsonc"),
  ]
}

// Names become JSON keys and URL path segments.
export function validName(name: string) {
  return name.trim() !== "" && name !== "." && name !== ".." && name !== "__proto__" && !/[/\\\p{Cc}]/u.test(name)
}

/** Servers defined in the profile's own files, with the raw fields of the file that wins. */
export const entries = Effect.fn("McpProjectConfig.entries")(function* (directory: string) {
  return Object.fromEntries(
    (yield* read(directory))
      .filter((document) => document.errors.length === 0)
      .flatMap((document) => Object.entries(servers(document)).map(([name, value]) => [name, select(value)] as const)),
  )
})

/**
 * Creates or updates one MCP server in the profile's own config file. Only the given fields are
 * written, so values the dialog does not edit (environment, headers, `{env:...}` references,
 * comments) stay exactly as the owner wrote them. Returns the file that was written.
 */
export const write = Effect.fn("McpProjectConfig.write")(function* (
  directory: string,
  name: string,
  config: Written,
) {
  return yield* exclusiveTo(
    directory,
    Effect.gen(function* () {
      const documents = yield* read(directory)
      const ambiguity = documents.map((document) => duplicateError(document, name)).find((error) => error !== undefined)
      if (ambiguity) return yield* ambiguity
      const target =
        documents.findLast((document) => Object.hasOwn(servers(document), name)) ??
        documents.find((document) => document.text !== undefined) ??
        documents[0]
      yield* editable(target, name)
      const current = servers(target)[name]
      // jsonc-parser cannot delete a missing path, so only drop keys the entry really has.
      const stale = exclusive[config.type === "local" ? "remote" : "local"].filter(
        (key) => isRecord(current) && Object.hasOwn(current, key),
      )
      const text = [
        ...stale.map((key) => [key, undefined] as const),
        ...Object.entries(config).map(([key, value]) => [key, value] as const),
      ].reduce(
        (result, [key, value]) => applyEdits(result, modify(result, ["mcp", name, key], value, format)),
        target.text ?? "{}",
      )
      yield* save(target.file, text)
      return target.file
    }),
  )
})

// Removes the server from every profile file that defines it; returns the files that changed.
export const remove = Effect.fn("McpProjectConfig.remove")(function* (directory: string, name: string) {
  return yield* exclusiveTo(
    directory,
    Effect.gen(function* () {
      const documents = yield* read(directory)
      const ambiguity = documents.map((document) => duplicateError(document, name)).find((error) => error !== undefined)
      if (ambiguity) return yield* ambiguity
      const defining = documents.filter((document) => Object.hasOwn(servers(document), name))
      yield* Effect.forEach(defining, (document) => editable(document, name))
      yield* Effect.forEach(defining, (document) =>
        save(
          document.file,
          applyEdits(document.text ?? "", modify(document.text ?? "", ["mcp", name], undefined, format)),
        ),
      )
      return defining.map((document) => document.file)
    }),
  )
})

// One writer per profile directory so concurrent saves cannot interleave read-modify-write.
function exclusiveTo<A, E, R>(directory: string, effect: Effect.Effect<A, E, R>) {
  return writers.withLock(path.resolve(directory))(effect)
}

const read = Effect.fnUntraced(function* (directory: string) {
  const fs = yield* FSUtil.Service
  return yield* Effect.forEach(files(directory), (file) =>
    fs.readFileStringSafe(file).pipe(
      Effect.mapError(() => new FileError({ file, message: `Could not read ${file}` })),
      Effect.map((text): Document => {
        if (text === undefined) return { file, errors: [] }
        const errors: ParseError[] = []
        return { file, text, value: parse(text, errors, { allowTrailingComma: true }), errors }
      }),
    ),
  )
})

// Atomic replace next to the real file, so a symlinked config keeps its link.
const save = Effect.fnUntraced(function* (file: string, text: string) {
  const fs = yield* FSUtil.Service
  const real = yield* fs.realPath(file).pipe(Effect.orElseSucceed(() => file))
  const temp = `${real}.${process.pid}-${Date.now()}.tmp`
  yield* Effect.gen(function* () {
    yield* fs.ensureDir(path.dirname(real))
    yield* fs.writeFileString(temp, text)
    yield* fs.rename(temp, real)
  }).pipe(
    Effect.tapError(() => fs.remove(temp).pipe(Effect.ignore)),
    Effect.mapError(
      (error) =>
        new FileError({
          file,
          message:
            "reason" in error && error.reason._tag === "PermissionDenied"
              ? `Permission denied writing ${file}`
              : `Could not write ${file}`,
        }),
    ),
  )
})

// modify() chooses the first matching property, while parse() loads the last. Refuse ambiguous
// mutation paths before any file changes; parsed key values also catch JSON-escaped duplicates.
function duplicateError(document: Document, name: string) {
  let node = document.text === undefined ? undefined : parseTree(document.text, [], { allowTrailingComma: true })
  for (const key of ["mcp", name]) {
    const properties =
      node?.type === "object" ? (node.children?.filter((property) => property.children?.[0]?.value === key) ?? []) : []
    if (properties.length > 1)
      return new FileError({
        file: document.file,
        message: `Cannot edit duplicate property ${JSON.stringify(key)} in ${document.file}`,
      })
    node = properties[0]?.children?.[1]
  }
  const keys = node?.type === "object" ? (node.children?.map((property) => property.children?.[0]?.value) ?? []) : []
  const duplicate = keys.find((key, index) => keys.indexOf(key) !== index)
  if (duplicate !== undefined)
    return new FileError({
      file: document.file,
      message: `Cannot edit duplicate property ${JSON.stringify(duplicate)} in mcp.${name} in ${document.file}`,
    })
}

function editable(document: Document, name: string) {
  const reason = (() => {
    if (document.errors.length > 0)
      return `${document.file} is not valid JSONC (${printParseErrorCode(document.errors[0].error)} at offset ${document.errors[0].offset})`
    if (document.value === undefined) return
    if (!isRecord(document.value)) return `${document.file} must contain a JSON object`
    if (document.value.mcp !== undefined && !isRecord(document.value.mcp))
      return `"mcp" in ${document.file} must be an object`
    const current = servers(document)[name]
    if (current !== undefined && !isRecord(current)) return `"mcp.${name}" in ${document.file} must be an object`
  })()
  if (reason) return Effect.fail(new FileError({ file: document.file, message: reason }))
  return Effect.void
}

function servers(document: Document): Record<string, unknown> {
  if (!isRecord(document.value) || !isRecord(document.value.mcp)) return {}
  return document.value.mcp
}

function select(value: unknown): Entry {
  if (!isRecord(value)) return {}
  return {
    ...(value.type === "local" || value.type === "remote" ? { type: value.type } : {}),
    ...(Array.isArray(value.command) && value.command.every((part) => typeof part === "string")
      ? { command: value.command }
      : {}),
    ...(typeof value.url === "string" ? { url: value.url } : {}),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** A V2 config server in the shape `write` stores. */
export function written(server: ConfigMCP.Local | ConfigMCP.Remote): Written {
  const enabled = server.disabled === undefined ? {} : { enabled: !server.disabled }
  if (server.type === "local")
    return {
      type: "local",
      command: [...server.command],
      ...(server.cwd === undefined ? {} : { cwd: server.cwd }),
      ...(server.environment === undefined ? {} : { environment: server.environment }),
      ...enabled,
    }
  return {
    type: "remote",
    url: server.url,
    ...(server.headers === undefined ? {} : { headers: server.headers }),
    ...enabled,
  }
}
