import { Effect, Option, Schema } from "effect"
import { PositiveInt } from "@orchestra/core/schema"
import path from "path"
import { Tool } from "./tool"
import { FSUtil } from "@orchestra/core/fs-util"
import DESCRIPTION from "./read.txt"
import { InstanceState } from "@/effect/instance-state"
import { assertExternalDirectoryEffect } from "./external-directory"
import { Instruction } from "../session/instruction"
import { isPdfAttachment, sniffAttachmentMime } from "@/util/media"
import { OutputInspector } from "@orchestra/core/output-inspector"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { Research } from "@orchestra/schema/research"
import { ResearchSourceCapture } from "@/research/source-capture"
import { TRUNCATION_DIR } from "./truncation-dir"

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

type Metadata = { preview: string; truncated: boolean; loaded: string[]; display?: Display; researchSource?: Research.SourceReceipt; researchReceived?: Research.SourceReceipt }
/** `next` is how many lines after the page fit in one more page; 0 when the page ends the file. */
type Page = { lines: string[]; start: number; more: boolean; total?: number; capped: boolean; next: number }

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
      reserve: (first: number, lineCount: number) => number,
      byteStart = 0,
      savedDisplay = false,
    ) {
      const lines: string[] = []
      const decoder = new TextDecoder("utf-8")
      const inspector = OutputInspector.make()
      const page = { first: start, count: 0, bytes: 0 }
      const capture = yield* ResearchSourceCapture.Current
      const observed = { chunks: Array<Uint8Array>(), bytes: 0, capped: false, eof: false }
      // Lines after the page are measured as one more page, so the footer can name a limit that fits.
      let next: typeof page | undefined
      let pending = ""
      let line = byteStart ? start : 1
      let done = false
      const fit = (target: typeof page, value: string) => {
        const size = Buffer.byteLength(`${target.first + target.count}: ${value}`, "utf-8") + (target.count ? 1 : 0)
        if (target.count >= limit || target.bytes + size + reserve(target.first, target.count + 1) > MAX_BYTES)
          return false
        target.count++
        target.bytes += size
        return true
      }
      const take = (raw: string) => {
        if (line++ < start) return
        const value = trim(raw)
        if (!next && fit(page, value)) {
          lines.push(value)
          return
        }
        next ??= { first: start + lines.length, count: 0, bytes: 0 }
        if (!fit(next, value)) done = true
      }
      const consume = (chunk: string) => {
        const segments = chunk.split("\n")
        for (const [index, segment] of segments.entries()) {
          pending = Array.from(pending + segment).slice(0, MAX_LINE_LENGTH + 1).join("")
          if (index === segments.length - 1) return
          take(pending)
          pending = ""
          if (done) return
        }
      }
      yield* Effect.scoped(
        Effect.gen(function* () {
          const file = yield* fs.open(filepath, { flag: "r" })
          if (byteStart) yield* file.seek(byteStart, "start")
          while (!done) {
            const bytes = yield* file.readAlloc(CHUNK_BYTES)
            if (Option.isNone(bytes)) {
              observed.eof = true
              break
            }
            if (capture) {
              const remaining = Research.Limits.sourceBytes - observed.bytes
              const kept = bytes.value.subarray(0, remaining)
              if (kept.byteLength) observed.chunks.push(kept)
              observed.bytes += kept.byteLength
              if (kept.byteLength < bytes.value.byteLength) observed.capped = true
            }
            // Measured lines are never returned, so inspection ends with the chunk that ends the page.
            const reason = next ? undefined : inspector.push(bytes.value)
            if (reason) return yield* new ToolSafety.Denied({ reason })
            consume(decoder.decode(bytes.value, { stream: true }))
          }
          if (!done) {
            consume(decoder.decode())
            if (!done && pending.length) take(pending)
          }
          const reason = inspector.finish()
          if (reason) return yield* new ToolSafety.Denied({ reason })
        }),
      )
      const received = capture ? yield* capture({
        origin: { kind: savedDisplay ? "tool-output" : "file", uri: filepath }, representation: "received", mediaType: "text/plain",
        content: Buffer.concat(observed.chunks), complete: observed.eof && byteStart === 0 && !observed.capped,
        observed: { byteStart },
      }) : undefined
      // A retained prefix cannot authenticate a projection read beyond it.
      if (capture && observed.capped)
        return yield* new Research.Error({ code: "over_cap", message: "Observed file bytes exceed retained source limit; only the explicit partial prefix was retained" })
      if (capture) yield* Effect.try({
        // A valid scalar may finish in the next unobserved chunk, but malformed bytes must never become replacement text.
        try: () => new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(observed.chunks), { stream: !observed.eof }),
        catch: () => new Research.Error({ code: "unsupported", message: "Observed file bytes are not supported UTF-8 text" }),
      })
      return {
        lines,
        start,
        more: next !== undefined,
        capped: next !== undefined && lines.length < limit,
        // Only the reserved reminder, which the continuation does not repeat, can leave none; one line fits without it.
        next: next ? Math.max(1, next.count) : 0,
        ...(received ? { received } : {}),
        ...(lines.length ? {} : { total: line - 1 }),
      } satisfies Page
    })

    const tail = Effect.fn("ReadTool.tail")(function* (filepath: string, size: number, count: number) {
      return yield* Effect.scoped(
        Effect.gen(function* () {
          const file = yield* fs.open(filepath, { flag: "r" })
          let position = size
          let total = 0
          let start: number | undefined
          let trailing = false
          let overlap = new Uint8Array()
          while (position > 0) {
            const width = Math.min(CHUNK_BYTES, position)
            position -= width
            yield* file.seek(position, "start")
            const bytes = Option.getOrElse(yield* file.readAlloc(width), () => new Uint8Array())
            yield* ToolSafety.inspect(Buffer.concat([bytes, overlap]).toString("utf8"))
            overlap = bytes.slice(0, 128)
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
      const requested =
        process.platform === "win32"
          ? FSUtil.normalizePath(path.resolve(instance.directory, params.filePath))
          : path.resolve(instance.directory, params.filePath)
      const filepath = ctx.agentID === "jimmy" ? yield* fs.realPath(requested).pipe(
        Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(requested)),
      ) : requested
      const title = path.relative(instance.worktree, filepath)
      const stat = yield* fs.stat(filepath).pipe(
        Effect.catchIf(
          (err) => "reason" in err && err.reason._tag === "NotFound",
          () => Effect.succeed(undefined),
        ),
      )
      // Grants name the configured saved-output root. Parent aliases (/var on macOS) may resolve elsewhere,
      // but neither a symlink replacing tool-output itself nor a child escaping it inherits that grant.
      const savedRoot = ctx.agentID === "jimmy" && stat?.type === "File"
        ? path.join(yield* fs.realPath(path.dirname(TRUNCATION_DIR)), path.basename(TRUNCATION_DIR))
        : undefined
      const savedDisplay = savedRoot !== undefined && path.dirname(filepath) === savedRoot &&
        (yield* fs.realPath(TRUNCATION_DIR)) === savedRoot
      yield* assertExternalDirectoryEffect(ctx, savedDisplay ? path.join(TRUNCATION_DIR, path.basename(filepath)) : filepath, {
        bypass: ctx.agentID !== "jimmy" && Boolean(ctx.extra?.["bypassCwdCheck"]),
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
          metadata: { preview: output, truncated: false, loaded: [] },
          attachments: [
            { type: "file" as const, mime, url: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}` },
          ],
        }
      }
      if (binary(filepath, first)) return yield* Effect.fail(new Error(`Cannot read binary file: ${filepath}`))
      // Resolving claims nested instruction files as shown, and only text output carries their reminder.
      const loaded = yield* instruction.resolve(ctx.messages, filepath, ctx.messageID)

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
      const partial = (first: number, last: number, next: number) =>
        `(PARTIAL view. Showing lines ${first}-${last}. Use offset=${last + 1} limit=${next} to continue.)`
      const finish = (lines: string[], next = 0) => {
        const last = start + lines.length - 1
        const footer = next
          ? partial(start, last, next)
          : total === undefined
            ? "(End of file)"
            : `(End of file - total ${total} lines)`
        return (
          prefix +
          lines.map((line, index) => `${start + index}: ${line}`).join("\n") +
          `\n${footer}\n</content>${reminder}`
        )
      }
      if (Buffer.byteLength(finish([]), "utf-8") > MAX_BYTES)
        return yield* Effect.fail(new Error(`System reminders exceed ${MAX_BYTES / 1024} KB output limit.`))
      const page = yield* forward(
        filepath,
        start,
        limit,
        // Footers never name a limit above this read's, so measuring with it bounds this page and the next one.
        (first, lineCount) =>
          Buffer.byteLength(
            `${prefix}\n${partial(first, first + lineCount - 1, limit)}\n</content>${reminder}`,
            "utf-8",
          ),
        byteStart,
        savedDisplay,
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
      const output = finish(page.lines, page.next)
      const capture = yield* ResearchSourceCapture.Current
      const researchSource = capture && page.received ? yield* capture({
        origin: page.received.origin, representation: "text", mediaType: "text/plain", content: page.lines.join("\n"),
        complete: page.received.complete && start === 1 && !page.more && !page.lines.some((line) => line.endsWith(MAX_LINE_SUFFIX)),
        derivedFrom: page.received.ref, transformation: "read-line-projection-v1",
        observed: { byteStart, lineStart: start, ...(page.lines.length ? { lineEnd: last } : {}) },
      }) : undefined
      return {
        title,
        output,
        metadata: {
          preview: page.lines.slice(0, 20).join("\n"),
          truncated: page.more,
          loaded: loaded.map((item) => item.filepath),
          ...(researchSource ? { researchSource, researchReceived: page.received } : {}),
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
