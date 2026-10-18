import { Effect, Schema } from "effect"
import { Research } from "@orchestra/schema/research"
import { ResearchRecords } from "@orchestra/core/research/records"
import { ResearchTools } from "@/research/binding"
import { ResearchSourceCapture } from "@/research/source-capture"
import { Tool } from "./tool"
import { ToolJsonSchema } from "./json-schema"
import { ReadTool } from "./read"
import { WebFetchTool } from "./webfetch"
import { ResearchHistory } from "@/research/history"

export const ResearchCaptureTool = Tool.define("research_capture", Effect.gen(function* () {
  const read = yield* ReadTool.pipe(Effect.flatMap(Tool.init))
  const fetch = yield* WebFetchTool.pipe(Effect.flatMap(Tool.init))
  const records = yield* ResearchRecords.Service
  const run = yield* ResearchTools.make
  const capture = yield* ResearchSourceCapture.make
  const history = yield* ResearchHistory.make
  const acquire = (input: Research.CaptureInput, ctx: Tool.Context, binding: Research.Binding) => {
    if (input.kind === "history") return capture.withCapture(ctx, "research_capture", history(binding, input, ctx), input)
    if (input.kind === "file" && input.end !== undefined && input.end < (input.start ?? 1))
      return Effect.fail(new Research.Error({ code: "reference_invalid", message: "File capture range does not exist" }))
    const acquired = input.kind === "file"
      ? read.execute({ filePath: input.path, offset: input.start ?? 1,
        ...(input.end === undefined ? {} : { limit: input.end - (input.start ?? 1) + 1 }) }, ctx)
      : fetch.execute({ url: input.url, format: input.format }, ctx)
    return capture.withCapture(ctx, "research_capture", acquired.pipe(Effect.flatMap((result) => {
        if (!result.metadata.researchSource)
          return Effect.fail(new Research.Error({ code: "unsupported", message: "Acquisition returned no supported retained source" }))
        return Effect.succeed({ title: "Research source captured", output: JSON.stringify(result.metadata.researchSource),
          metadata: { researchSource: result.metadata.researchSource,
            ...("researchReceived" in result.metadata ? { researchReceived: result.metadata.researchReceived } : {}) } })
      })), input)
  }
  return {
    parameters: Research.CaptureInput,
    jsonSchema: ToolJsonSchema.fromSchema(Research.CaptureInput),
    description: [
      "Capture permitted file/URL evidence through native read/webfetch, or Git state in the bound worktree (kind \"history\").",
      "History operations: log (full hashes of commits touching one path); show (one file at a commit); diff (one file between base and revision);",
      "blame (who last changed each line of one file at a commit, optional start/end lines: line, commit, authorTime, summary, content), for attributing current code;",
      "compare (range diff between base and revision over 1-16 worktree paths or directories, stat:true for per-file added/deleted counts only; refused when it touches over 100 files or any file the read policy denies), for what changed between two known commits;",
      "search (commits filtered by a case-insensitive message substring and/or a path, newest first, limit 1-50: commit, authorTime, summary), for regression archaeology when the introducing commit is unknown;",
      "resolve (one ref such as HEAD~1, a branch or a tag to its full commit hash); status (HEAD hash, current branch and dirty paths of the working tree).",
      "Other history operations take full commit hashes only (use resolve first), default revision to native HEAD, and report shallow/limited coverage and byte-bounded partial captures; no commands or process roots are accepted.",
      "Line numbers are always original-file lines, 1-based and inclusive: start/end select them, and a file capture returns lines {basis:\"original\", start, end}.",
      "A capture whose bytes are already retained in this dispatch returns {ref, unchanged:true} and nothing else; a changed span returns the new capture with changed:true and the previous ref.",
      "Receipts mark partial captures. Use research_view for retained bytes; no owner, digest, body or storage path accepted as authority.",
    ].join(" "),
    execute: (input: Research.CaptureInput, ctx: Tool.Context) => run(ctx, "research_capture", (binding) => Effect.gen(function* () {
      const before = yield* records.view(binding, { action: "corpus" })
      const result = yield* acquire(input, ctx, binding)
      return compact(result, "sources" in before ? before.sources : [])
    })).pipe(Effect.orDie),
  }
}))

/**
 * Read dedup: bytes already retained in this dispatch come back as their ref alone, and a recaptured span whose bytes
 * changed says so. Retention itself is unchanged; only what the model reads shrinks.
 */
function compact(result: Tool.ExecuteResult, before: ReadonlyArray<Research.SourceReceipt>) {
  const decoded = Schema.decodeUnknownOption(Research.SourceReceipt)(result.metadata.researchSource)
  if (decoded._tag === "None") return result
  const receipt = decoded.value
  // A tool-output origin names its call, so equal bytes are the only identity; a file or URL must also be the same one.
  const same = (source: Research.SourceReceipt) => source.origin.kind === receipt.origin.kind &&
    source.ref.representation === receipt.ref.representation && (receipt.origin.kind === "tool-output" || source.origin.uri === receipt.origin.uri)
  const lines = receipt.observed?.lineStart === undefined ? undefined
    : { basis: "original" as const, start: receipt.observed.lineStart, end: receipt.observed.lineEnd ?? receipt.observed.lineStart }
  const retained = before.find((source) => same(source) && source.ref.digest === receipt.ref.digest)
  if (retained) return { ...result, output: JSON.stringify({ ref: retained.ref, unchanged: true,
    summary: `${receipt.origin.kind === "tool-output" ? "output" : receipt.origin.uri}${lines ? ` lines ${lines.start}-${lines.end}` : ""} is already retained in this dispatch with the same digest; reopen it with research_view only if it left your context` }) }
  const previous = receipt.origin.kind === "tool-output" ? undefined : before.find((source) => same(source) &&
    source.observed?.lineStart === receipt.observed?.lineStart && source.observed?.lineEnd === receipt.observed?.lineEnd)
  return { ...result, output: JSON.stringify({ ...receipt, ...(lines ? { lines } : {}), ...(previous ? { changed: true, previous: previous.ref } : {}) }) }
}
