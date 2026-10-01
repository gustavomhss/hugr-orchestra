import { Effect, Option, Schema } from "effect"
import { PositiveInt } from "@opencode-ai/core/schema"
import * as path from "path"
import * as Tool from "./tool"
import { FSUtil } from "@opencode-ai/core/fs-util"
import DESCRIPTION from "./read.txt"
import { InstanceState } from "@/effect/instance-state"
import { assertExternalDirectoryEffect } from "./external-directory"
import { Instruction } from "../session/instruction"
import { isPdfAttachment, sniffAttachmentMime } from "@/util/media"

const DEFAULT_READ_LIMIT = 2000
const MAX_LINE_LENGTH = 2000
const MAX_LINE_SUFFIX = `... (line truncated to ${MAX_LINE_LENGTH} chars)`
const MAX_BYTES = 50 * 1024
const MAX_MEDIA_BYTES = 20 * 1024 * 1024
const SAMPLE_BYTES = 4096
const CHUNK_BYTES = 64 * 1024
const SUPPORTED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"])
const SignedNonZeroInt = Schema.Union([PositiveInt, Schema.Int.check(Schema.isLessThan(0))])
const SignedNonZeroIntInput = Schema.Union([
  SignedNonZeroInt,
  Schema.NumberFromString.pipe(Schema.decodeTo(SignedNonZeroInt)),
])
const PositiveIntInput = Schema.Union([PositiveInt, Schema.NumberFromString.pipe(Schema.decodeTo(PositiveInt))])

export const Parameters = Schema.Struct({
  filePath: Schema.String.annotate({ description: "The absolute path to the file or directory to read" }),
  offset: Schema.optional(SignedNonZeroIntInput).annotate({
    description:
      "Line number to start reading from (1-indexed). Negative values read from end (for example, -3 reads last 3 lines).",
  }),
  limit: Schema.optional(PositiveIntInput).annotate({
    description: "Maximum number of lines to read (defaults to 2000)",
  }),
})

type Display =
  | { type: "directory"; path: string; entries: string[]; offset: number; totalEntries: number; truncated: boolean }
  | {
      type: "file"
      path: string
      text: string
      lineStart: number
      lineEnd: number
      totalLines?: number
      truncated: boolean
    }

type Metadata = { preview: string; truncated: boolean; loaded: string[]; display?: Display }
type Page = { lines: string[]; start: number; more: boolean; total?: number; capped: boolean }

export const ReadTool = Tool.define<typeof Parameters, Metadata, FSUtil.Service | Instruction.Service>(
  "read",
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const instruction = yield* Instruction.Service

    const sample = Effect.fn("ReadTool.sample")(function* (filepath: string, size: number) {
      if (size === 0) return new Uint8Array()
      return yield* Effect.scoped(
        Effect.gen(function* () {
          const file = yield* fs.open(filepath, { flag: "r" })
          return Option.getOrElse(yield* file.readAlloc(Math.min(SAMPLE_BYTES, size)), () => new Uint8Array())
        }),
      )
    })

    const miss = Effect.fn("ReadTool.miss")(function* (filepath: string) {
      const base = path.basename(filepath)
      const items = yield* fs.readDirectory(path.dirname(filepath)).pipe(
        Effect.map((items) =>
          items
            .filter(
              (item) =>
                item.toLowerCase().includes(base.toLowerCase()) || base.toLowerCase().includes(item.toLowerCase()),
            )
            .map((item) => path.join(path.dirname(filepath), item))
            .slice(0, 3),
        ),
        Effect.catch(() => Effect.succeed([] as string[])),
      )
      if (items.length)
        return yield* Effect.fail(
          new Error(`File not found: ${filepath}\n\nDid you mean one of these?\n${items.join("\n")}`),
        )
      return yield* Effect.fail(new Error(`File not found: ${filepath}`))
    })

    const list = Effect.fn("ReadTool.list")(function* (filepath: string) {
      const items = yield* fs.readDirectoryEntries(filepath)
      return yield* Effect.forEach(
        items,
        Effect.fnUntraced(function* (item) {
          if (item.type === "directory") return item.name + "/"
          if (item.type !== "symlink") return item.name
          const target = yield* fs.stat(path.join(filepath, item.name)).pipe(Effect.catch(() => Effect.void))
          return target?.type === "Directory" ? item.name + "/" : item.name
        }),
        { concurrency: "unbounded" },
      ).pipe(Effect.map((items: string[]) => items.sort((a, b) => a.localeCompare(b))))
    })

    const binary = (filepath: string, bytes: Uint8Array) => {
      if (
        new Set([
          ".zip",
          ".tar",
          ".gz",
          ".exe",
          ".dll",
          ".so",
          ".class",
          ".jar",
          ".war",
          ".7z",
          ".doc",
          ".docx",
          ".xls",
          ".xlsx",
          ".ppt",
          ".pptx",
          ".odt",
          ".ods",
          ".odp",
          ".bin",
          ".dat",
          ".obj",
          ".o",
          ".a",
          ".lib",
          ".wasm",
          ".pyc",
          ".pyo",
        ]).has(path.extname(filepath).toLowerCase())
      )
        return true
      if (!bytes.length) return false
      let nonPrintable = 0
      for (const byte of bytes) {
        if (byte === 0) return true
        if (byte < 9 || (byte > 13 && byte < 32)) nonPrintable++
      }
      return nonPrintable / bytes.length > 0.3
    }

    const trim = (line: string) => {
      const crlf = line.endsWith("\r") ? line.slice(0, -1) : line
      const chars = Array.from(crlf)
      return chars.length > MAX_LINE_LENGTH ? chars.slice(0, MAX_LINE_LENGTH).join("") + MAX_LINE_SUFFIX : crlf
    }

    const forward = Effect.fn("ReadTool.forward")(function* (
      filepath: string,
      start: number,
      limit: number,
      reserve: (lineCount: number) => number,
      byteStart = 0,
    ) {
      const lines: string[] = []
      const decoder = new TextDecoder("utf-8")
      let pending = ""
      let line = byteStart ? start : 1
      let more = false
      let capped = false
      let done = false
      let bytes = 0
      const take = (raw: string) => {
        if (line++ < start) return
        if (lines.length >= limit) {
          more = true
          done = true
          return
        }
        const value = trim(raw)
        const rendered = `${start + lines.length}: ${value}`
        const size = Buffer.byteLength(rendered, "utf-8") + (lines.length ? 1 : 0)
        if (bytes + size + reserve(lines.length + 1) > MAX_BYTES) {
          more = true
          capped = true
          done = true
          return
        }
        lines.push(value)
        bytes += size
      }
      const consume = (chunk: string) => {
        pending += chunk
        let index = pending.indexOf("\n")
        while (index !== -1) {
          take(pending.slice(0, index))
          pending = pending.slice(index + 1)
          if (done) return
          index = pending.indexOf("\n")
        }
      }
      yield* Effect.scoped(
        Effect.gen(function* () {
          const file = yield* fs.open(filepath, { flag: "r" })
          if (byteStart) yield* file.seek(byteStart, "start")
          while (!done) {
            const bytes = yield* file.readAlloc(CHUNK_BYTES)
            if (Option.isNone(bytes)) break
            consume(decoder.decode(bytes.value, { stream: true }))
          }
          if (!done) {
            consume(decoder.decode())
            if (!done && pending.length) take(pending)
          }
        }),
      )
      return { lines, start, more, capped, ...(lines.length ? {} : { total: line - 1 }) } satisfies Page
    })

    const tail = Effect.fn("ReadTool.tail")(function* (filepath: string, size: number, count: number) {
      return yield* Effect.scoped(
        Effect.gen(function* () {
          const file = yield* fs.open(filepath, { flag: "r" })
          let position = size
          let total = 0
          let start: number | undefined
          let trailing = false
          while (position > 0) {
            const width = Math.min(CHUNK_BYTES, position)
            position -= width
            yield* file.seek(position, "start")
            const bytes = Option.getOrElse(yield* file.readAlloc(width), () => new Uint8Array())
            if (position + bytes.length === size) trailing = bytes[bytes.length - 1] === 10
            for (let index = bytes.length - 1; index >= 0; index--) {
              if (bytes[index] !== 10) continue
              total++
              if (start === undefined && total === count + (trailing ? 1 : 0)) start = position + index + 1
            }
          }
          return { start: start ?? 0, total: size === 0 ? 0 : total + (trailing ? 0 : 1) }
        }),
      )
    })

    const run = Effect.fn("ReadTool.execute")(function* (
      params: Schema.Schema.Type<typeof Parameters>,
      ctx: Tool.Context<Metadata>,
    ) {
      const instance = yield* InstanceState.context
      const filepath =
        process.platform === "win32"
          ? FSUtil.normalizePath(path.resolve(instance.directory, params.filePath))
          : path.resolve(instance.directory, params.filePath)
      const title = path.relative(instance.worktree, filepath)
      const stat = yield* fs.stat(filepath).pipe(
        Effect.catchIf(
          (err) => "reason" in err && err.reason._tag === "NotFound",
          () => Effect.succeed(undefined),
        ),
      )
      yield* assertExternalDirectoryEffect(ctx, filepath, {
        bypass: Boolean(ctx.extra?.["bypassCwdCheck"]),
        kind: stat?.type === "Directory" ? "directory" : "file",
      })
      yield* ctx.ask({
        permission: "read",
        patterns: [path.relative(instance.worktree, filepath)],
        always: ["*"],
        metadata: {},
      })
      if (!stat) return yield* miss(filepath)

      if (stat.type === "Directory") {
        const items = yield* list(filepath)
        const offset = params.offset ?? 1
        if (offset < 0) return yield* Effect.fail(new Error("Negative offset is only supported for files."))
        const limit = params.limit ?? DEFAULT_READ_LIMIT
        const entries = items.slice(offset - 1, offset - 1 + limit)
        const truncated = offset - 1 + entries.length < items.length
        return {
          title,
          output: [
            `<path>${filepath}</path>`,
            "<type>directory</type>",
            "<entries>",
            entries.join("\n"),
            truncated
              ? `\n(Showing ${entries.length} of ${items.length} entries. Use offset=${offset + entries.length} to continue.)`
              : `\n(${items.length} entries)`,
            "</entries>",
          ].join("\n"),
          metadata: {
            preview: entries.slice(0, 20).join("\n"),
            truncated,
            loaded: [],
            display: {
              type: "directory" as const,
              path: filepath,
              entries,
              offset,
              totalEntries: items.length,
              truncated,
            },
          },
        }
      }

      const loaded = yield* instruction.resolve(ctx.messages, filepath, ctx.messageID)
      const first = yield* sample(filepath, Number(stat.size))
      const mime = sniffAttachmentMime(first, FSUtil.mimeType(filepath))
      if (SUPPORTED_IMAGE_MIMES.has(mime) || isPdfAttachment(mime)) {
        if (Number(stat.size) > MAX_MEDIA_BYTES)
          return yield* Effect.fail(
            new Error(
              `Cannot read ${mime} attachment at ${filepath}: ${stat.size} bytes exceeds maximum ${MAX_MEDIA_BYTES} bytes. Use a file at or below ${MAX_MEDIA_BYTES} bytes.`,
            ),
          )
        const bytes = yield* fs.readFile(filepath)
        const output = isPdfAttachment(mime) ? "PDF read successfully" : "Image read successfully"
        return {
          title,
          output,
          metadata: { preview: output, truncated: false, loaded: loaded.map((item) => item.filepath) },
          attachments: [
            { type: "file" as const, mime, url: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}` },
          ],
        }
      }
      if (binary(filepath, first)) return yield* Effect.fail(new Error(`Cannot read binary file: ${filepath}`))

      const explicit = params.offset !== undefined || params.limit !== undefined
      const limit = params.limit ?? DEFAULT_READ_LIMIT
      const negative = (params.offset ?? 1) < 0
      const tailInfo = negative ? yield* tail(filepath, Number(stat.size), -params.offset!) : undefined
      const total = tailInfo?.total
      const start = negative ? Math.max(1, total! + 1 + params.offset!) : (params.offset ?? 1)
      if (negative && total === 0)
        return yield* Effect.fail(new Error(`Offset ${params.offset} is out of range for this file (0 lines)`))
      const byteStart = tailInfo?.start ?? 0
      const reminder = loaded.length
        ? `\n<system-reminder>\n${loaded.map((item) => item.content).join("\n\n")}\n</system-reminder>`
        : ""
      const prefix = `<path>${filepath}</path>\n<type>file</type>\n<content>\n`
      const finish = (lines: string[], more: boolean) => {
        const last = start + lines.length - 1
        const footer = more
          ? `(PARTIAL view. Showing lines ${start}-${last}. Use offset=${last + 1} to continue.)`
          : total === undefined
            ? "(End of file)"
            : `(End of file - total ${total} lines)`
        return (
          prefix +
          lines.map((line, index) => `${start + index}: ${line}`).join("\n") +
          `\n${footer}\n</content>${reminder}`
        )
      }
      if (Buffer.byteLength(finish([], false), "utf-8") > MAX_BYTES)
        return yield* Effect.fail(new Error(`System reminders exceed ${MAX_BYTES / 1024} KB output limit.`))
      const page = yield* forward(
        filepath,
        start,
        limit,
        (lineCount) => {
          const last = start + lineCount - 1
          const footer = `(PARTIAL view. Showing lines ${start}-${last}. Use offset=${last + 1} to continue.)`
          return Buffer.byteLength(`${prefix}\n${footer}\n</content>${reminder}`, "utf-8")
        },
        byteStart,
      )
      if (!page.lines.length && start !== 1)
        return yield* Effect.fail(
          new Error(`Offset ${start} is out of range for this file (${total ?? page.total ?? 0} lines)`),
        )
      if (page.capped && !page.lines.length)
        return yield* Effect.fail(
          new Error(
            `One complete rendered line cannot fit under ${MAX_BYTES / 1024} KB output cap. Reduce system reminder or path size.`,
          ),
        )
      if (page.capped && explicit)
        return yield* Effect.fail(
          new Error(`Requested range exceeds ${MAX_BYTES / 1024} KB output limit. Use a smaller limit or offset.`),
        )

      const last = start + page.lines.length - 1
      const output = finish(page.lines, page.more)
      return {
        title,
        output,
        metadata: {
          preview: page.lines.slice(0, 20).join("\n"),
          truncated: page.more,
          loaded: loaded.map((item) => item.filepath),
          display: {
            type: "file" as const,
            path: filepath,
            text: page.lines.join("\n"),
            lineStart: start,
            lineEnd: last,
            ...(total === undefined ? {} : { totalLines: total }),
            truncated: page.more,
          },
        },
      }
    })

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        run(params, ctx).pipe(Effect.orDie),
    }
  }),
)
