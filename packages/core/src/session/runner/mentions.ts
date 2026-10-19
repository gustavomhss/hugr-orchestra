export * as SessionMentions from "./mentions"

// What a promoted prompt's attachments point at, read once at promotion as V1 read them at send: a `file://` file or
// directory through the Location's read filesystem, any other non-data URI as a resource of a connected MCP server.
// The runner records the result as a synthetic message after the prompt; the prompt itself stays as admitted. Images,
// PDFs and binary MCP resources of a type a model reads come back as inline media, as V1 attached them.

import path from "node:path"
import { fileURLToPath } from "node:url"
import { Cause, Effect, Exit } from "effect"
import type { FSUtil } from "../../fs-util"
import type { Mcp } from "../../mcp"
import { AbsolutePath, PositiveInt } from "../../schema"
import { ReadToolFileSystem } from "../../tool/read-filesystem"
import type { FileAttachment, Prompt } from "../prompt"

const MAX_RESOURCE_BLOB_BYTES = 10 * 1024 * 1024
const MEDIA_MIMES = new Set(["application/pdf", "image/gif", "image/jpeg", "image/png", "image/webp"])

type Mention = { readonly text: string; readonly files?: ReadonlyArray<FileAttachment> }

export const read = Effect.fn("SessionMentions.read")(function* (
  services: {
    readonly reader: ReadToolFileSystem.Interface
    readonly mcp: Mcp.Interface
    readonly fs: FSUtil.Interface
  },
  prompt: Prompt,
) {
  const mentions = yield* Effect.forEach(prompt.files ?? [], (file) =>
    Effect.gen(function* () {
      if (!URL.canParse(file.uri)) return undefined
      const url = new URL(file.uri)
      if (url.protocol === "data:" || url.protocol === "http:" || url.protocol === "https:") return undefined
      if (url.protocol === "file:") return yield* local(services, url)
      return yield* resource(services.mcp, file)
    }),
  )
  const read = mentions.filter((mention): mention is Mention => mention !== undefined)
  return {
    text: read.map((mention) => mention.text).join("\n\n"),
    files: read.flatMap((mention) => mention.files ?? []),
  }
})

const local = Effect.fnUntraced(function* (
  services: { readonly reader: ReadToolFileSystem.Interface; readonly fs: FSUtil.Interface },
  url: URL,
) {
  const filepath = AbsolutePath.make(fileURLToPath(url))
  const exit = yield* Effect.gen(function* (): Effect.fn.Return<Mention, ReadToolFileSystem.ReadError | FSUtil.Error> {
    if ((yield* services.reader.inspect(filepath)) === "directory") {
      const listing = yield* services.reader.list(filepath)
      return {
        text: `Attached the directory ${filepath}. Its listing as of when it was sent:\n${listing.entries
          .map((entry) => entry.path)
          .join("\n")}${listing.truncated ? "\n(listing truncated)" : ""}`,
      }
    }
    const read = yield* services.reader.read(filepath, filepath, page(url)).pipe(
      Effect.catchTag("ReadTool.BinaryFileError", (error) =>
        path.extname(filepath).toLowerCase() === ".pdf" ? pdf(services.fs, filepath) : Effect.fail(error),
      ),
    )
    if (read instanceof ReadToolFileSystem.TextPage)
      return {
        text: `Attached ${filepath}. Its content as of when it was sent:\n${read.content}${
          read.truncated ? `\n(truncated; read ${filepath} for the rest)` : ""
        }`,
      }
    if (read.encoding !== "base64") return { text: `Attached ${filepath}. Its content as of when it was sent:\n${read.content}` }
    if (!MEDIA_MIMES.has(read.mime))
      return { text: `Attached ${filepath} (${read.mime}); its content is binary and is not included.` }
    return {
      text: `Attached ${filepath} (${read.mime}).`,
      files: [{ uri: `data:${read.mime};base64,${read.content}`, mime: read.mime, name: path.basename(filepath) }],
    }
  }).pipe(Effect.exit)
  if (Exit.isSuccess(exit)) return exit.value
  const failure = Cause.squash(exit.cause)
  if (failure instanceof ReadToolFileSystem.BinaryFileError)
    return { text: `Attached ${filepath}; its content is binary and is not included.` }
  return { text: `Attached ${filepath}, but it could not be read: ${messageOf(failure)}` }
})

// The read filesystem refuses PDFs as binary; V1 sent them to the model whole, within the media ingest limit.
const pdf = Effect.fnUntraced(function* (fs: FSUtil.Interface, filepath: string) {
  const info = yield* fs.stat(filepath)
  if (Number(info.size) > ReadToolFileSystem.MAX_MEDIA_INGEST_BYTES)
    return yield* new ReadToolFileSystem.MediaIngestLimitError({
      resource: filepath,
      maximumBytes: ReadToolFileSystem.MAX_MEDIA_INGEST_BYTES,
    })
  return {
    encoding: "base64" as const,
    mime: "application/pdf",
    content: Buffer.from(yield* fs.readFile(filepath)).toString("base64"),
  }
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
    return { text: `Failed to read MCP resource ${label}: ${messageOf(Cause.squash(exit.cause))}` }
  if (exit.value === undefined) return { text: `Attached ${label}, but no connected MCP server lists it.` }
  const parts = exit.value.map((content): Mention => {
    if ("text" in content && typeof content.text === "string") return { text: content.text }
    const blob = "blob" in content && typeof content.blob === "string" ? content.blob : ""
    const mime = content.mimeType ?? file.mime
    const size = base64Size(blob)
    if (!blob || !MEDIA_MIMES.has(mime))
      return { text: `[Binary MCP resource omitted: ${content.uri} (${mime}) is not a supported attachment type]` }
    if (size > MAX_RESOURCE_BLOB_BYTES)
      return { text: `[Binary MCP resource omitted: ${content.uri} (${mime}, ${size} bytes) exceeds 10 MB]` }
    return {
      text: `[Binary MCP resource attached: ${content.uri} (${mime})]`,
      files: [{ uri: `data:${mime};base64,${blob}`, mime, name: content.uri }],
    }
  })
  return {
    text: `MCP resource ${label}:\n${parts.map((part) => part.text).join("\n")}`,
    files: parts.flatMap((part) => part.files ?? []),
  }
})

function base64Size(value: string) {
  const trimmed = value.replace(/\s/g, "")
  const padding = trimmed.endsWith("==") ? 2 : trimmed.endsWith("=") ? 1 : 0
  return Math.max(0, Math.floor((trimmed.length * 3) / 4) - padding)
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
