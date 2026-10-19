export * as SessionMentions from "./mentions"

// What a promoted prompt's attachments point at, read once at promotion as V1 read them at send: a `file://` file or
// directory through the Location's read filesystem, any other non-data URI as a resource of a connected MCP server.
// The runner records the text as a synthetic message after the prompt; the prompt itself stays as admitted.

import { fileURLToPath } from "node:url"
import { Cause, Effect, Exit } from "effect"
import type { Mcp } from "../../mcp"
import { AbsolutePath, PositiveInt } from "../../schema"
import { ReadToolFileSystem } from "../../tool/read-filesystem"
import type { FileAttachment, Prompt } from "../prompt"

export const read = Effect.fn("SessionMentions.read")(function* (
  services: { readonly reader: ReadToolFileSystem.Interface; readonly mcp: Mcp.Interface },
  prompt: Prompt,
) {
  const texts = yield* Effect.forEach(prompt.files ?? [], (file) =>
    Effect.gen(function* () {
      if (!URL.canParse(file.uri)) return undefined
      const url = new URL(file.uri)
      if (url.protocol === "data:" || url.protocol === "http:" || url.protocol === "https:") return undefined
      if (url.protocol === "file:") return yield* local(services.reader, url)
      return yield* resource(services.mcp, file)
    }),
  )
  return texts.filter((text): text is string => text !== undefined).join("\n\n")
})

const local = Effect.fnUntraced(function* (reader: ReadToolFileSystem.Interface, url: URL) {
  const filepath = AbsolutePath.make(fileURLToPath(url))
  const exit = yield* Effect.gen(function* () {
    if ((yield* reader.inspect(filepath)) === "directory") {
      const listing = yield* reader.list(filepath)
      return `Attached the directory ${filepath}. Its listing as of when it was sent:\n${listing.entries
        .map((entry) => entry.path)
        .join("\n")}${listing.truncated ? "\n(listing truncated)" : ""}`
    }
    const read = yield* reader.read(filepath, filepath, page(url))
    if (read instanceof ReadToolFileSystem.TextPage)
      return `Attached ${filepath}. Its content as of when it was sent:\n${read.content}${
        read.truncated ? `\n(truncated; read ${filepath} for the rest)` : ""
      }`
    if (read.encoding === "base64")
      return `Attached ${filepath} (${read.mime}); its content is binary and is not included.`
    return `Attached ${filepath}. Its content as of when it was sent:\n${read.content}`
  }).pipe(Effect.exit)
  if (Exit.isSuccess(exit)) return exit.value
  return `Attached ${filepath}, but it could not be read: ${messageOf(Cause.squash(exit.cause))}`
})

// `?start=a&end=b` mentions a line range, as the app sends for a selection.
function page(url: URL): ReadToolFileSystem.PageInput {
  const start = Number(url.searchParams.get("start"))
  if (!Number.isInteger(start) || start < 1) return {}
  const end = Number(url.searchParams.get("end"))
  if (!Number.isInteger(end) || end < start) return { offset: PositiveInt.make(start) }
  return {
    offset: PositiveInt.make(start),
    limit: PositiveInt.make(Math.min(end - start + 1, ReadToolFileSystem.MAX_READ_LINES)),
  }
}

const resource = Effect.fnUntraced(function* (mcp: Mcp.Interface, file: FileAttachment) {
  const label = file.name ? `${file.name} (${file.uri})` : file.uri
  const exit = yield* mcp.readResource(file.uri).pipe(Effect.exit)
  if (Exit.isFailure(exit))
    return `Failed to read MCP resource ${label}: ${messageOf(Cause.squash(exit.cause))}`
  if (exit.value === undefined) return `Attached ${label}, but no connected MCP server lists it.`
  const parts = exit.value.map((content) =>
    "text" in content && typeof content.text === "string"
      ? content.text
      : `[Binary MCP resource omitted: ${content.uri} (${content.mimeType ?? "unknown type"})]`,
  )
  return `MCP resource ${label}:\n${parts.join("\n")}`
})

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
