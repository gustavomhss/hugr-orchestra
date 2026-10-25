export * as MaestroResearchTools from "./research"

import path from "node:path"
import { Effect, Option, Schema } from "effect"
import { Config } from "@orchestra/core/config"
import { Database } from "@orchestra/core/database/database"
import { FSUtil } from "@orchestra/core/fs-util"
import type { GitCli } from "@orchestra/core/git-cli"
import { LocationMutation } from "@orchestra/core/location-mutation"
import type { PermissionV2 } from "@orchestra/core/permission"
import { AppProcess } from "@orchestra/core/process"
import { ResearchLedger } from "@orchestra/core/research/ledger"
import type { ResearchRecords } from "@orchestra/core/research/records"
import { ResearchSeatTools } from "@orchestra/core/research/seat-tools"
import { CodeIndexExtract } from "@orchestra/core/research-toolkit/code-index/extract"
import { CodeIndexQuery } from "@orchestra/core/research-toolkit/code-index/query"
import { CodeIndex } from "@orchestra/core/research-toolkit/code-index/types"
import { ResearchToolkit } from "@orchestra/core/research-toolkit/index"
import { Liveness } from "@orchestra/core/research-toolkit/liveness"
import { Locate } from "@orchestra/core/research-toolkit/locate"
import { ProbeRun } from "@orchestra/core/research-toolkit/probe/run"
import { Probe } from "@orchestra/core/research-toolkit/probe/types"
import { CodeSearch } from "@orchestra/core/research-toolkit/search"
import { SessionHistory } from "@orchestra/core/session"
import { AbsolutePath } from "@orchestra/core/schema"
import { Tool } from "@orchestra/core/tool/tool"
import type { HttpClient } from "effect/unstable/http"
import { ReadToolFileSystem } from "@orchestra/core/tool/read-filesystem"
import { WebFetchTool } from "@orchestra/core/tool/webfetch"
import { Ripgrep } from "@orchestra/core/ripgrep"
import { Research } from "@orchestra/schema/research"
import { ResearchDispatchV2 } from "../governance/research"
import type { MaestroToolGate } from "./gate"
import { ResearchInquiry } from "./inquiry"
import type { InquiryCheck } from "./inquiry-check"

// The research seat tools. Each call is the research seat's own, under
// its dispatch allowance and its retained logical-task binding; the runner's invocation frame
// is what core `ResearchRecords` checks before it writes. `v2/seats.ts` hides these tools from every other agent.

export const names = {
  capture: "research_capture",
  view: "research_view",
  record: "research_record",
  inquiry: "inquiry",
  search: "code_search",
  query: "code_query",
  locate: "code_locate",
  probe: "probe_run",
} as const

export const Output = Schema.Struct({ title: Schema.String, output: Schema.String, research: Schema.optional(Schema.Unknown) })

export type Services = ResearchDispatchV2.Services & {
  readonly records: ResearchRecords.Interface
  readonly permission: PermissionV2.Interface
  readonly mutation: LocationMutation.Interface
  readonly reader: ReadToolFileSystem.Interface
  readonly database: Database.Interface
  readonly gate: MaestroToolGate.Gate
  readonly fs: FSUtil.Interface
  readonly processes: AppProcess.Interface
  readonly ripgrep: Ripgrep.RipgrepBinary.Interface
  readonly git: GitCli.Interface
  readonly config: Config.Interface
  readonly http: HttpClient.HttpClient
}

export const captureDescription = [
  "Capture permitted file/URL evidence (kind \"file\" or \"url\", the URL under webfetch's permission), or Git state in the bound worktree (kind \"history\").",
  "History operations: log (full hashes of commits touching one path); show (one file at a commit); diff (one file between base and revision);",
  "blame (who last changed each line of one file at a commit, optional start/end lines: line, commit, authorTime, summary, content), for attributing current code;",
  "compare (range diff between base and revision over 1-16 worktree paths or directories, stat:true for per-file added/deleted counts only; refused when it touches over 100 files or any file the read policy denies), for what changed between two known commits;",
  "search (commits filtered by a case-insensitive message substring and/or a path, newest first, limit 1-50: commit, authorTime, summary), for regression archaeology when the introducing commit is unknown;",
  "resolve (one ref such as HEAD~1, a branch or a tag to its full commit hash); status (HEAD hash, current branch and dirty paths of the working tree).",
  "Other history operations take full commit hashes only (use resolve first), default revision to native HEAD, and report shallow/limited coverage and byte-bounded partial captures; no commands or process roots are accepted.",
  "Line numbers are always original-file lines, 1-based and inclusive: start/end select them, and a file capture returns lines {basis:\"original\", start, end}.",
  "A new capture returns its receipt (cite its ref) on the first line, then the captured text, so do not read the same span again. A capture whose bytes are already retained in this dispatch returns {ref, unchanged:true} and nothing else; a changed span returns the new capture with changed:true and the previous ref.",
  "Receipts mark partial captures. Use research_view for retained bytes; no owner, digest, body or storage path accepted as authority.",
].join(" ")

export const viewDescription = [
  "Reopen retained research: corpus lists bounded admitted source/record/document handles; attempts pages actual acquisition outcomes;",
  "records/source/document reopen exact revisions; find searches literal text in one admitted representation and gives each match its line.",
  "Use returned handles/revisions/cursors, never filesystem paths or guessed owner/root fields. Bounded pages and partial captures remain explicit.",
  "Line numbers are original-file lines, 1-based and inclusive (lines.basis \"original\"); basis \"retained\" means the source has no original line origin.",
  "A source or document page still in your context comes back as {ref, unchanged:true}, not its bytes again.",
  "Historical records do not prove present applicability.",
].join(" ")

export const recordDescription =
  "Retain a research question, evidenced finding, justified relation or cohesive Markdown document. Supply authored fields and exact admitted references only. Updates require id/baseRevision and findings require a material revision reason. Documents use citations mapped to EvidenceRef and Markdown links research:<label>. Returned IDs/receipts are host facts. Product files, approval and shared Knowledge are not edited. Simple source answers need not create a dossier."

export const inquiryDescription = [
  "This dispatch's investigation; the host keeps its state and returns it with every action.",
  "",
  "Actions:",
  "- close: sufficiency (answered, partial, blocked), answer, and claims [{proposition, nature, evidence, subquestion?, scope?}], numbered claim-1 on. It checks them with the answer before writing anything and names what to fix. At tier quick, pass question instead of opening first.",
  "- open: question, 1-6 subquestions, profile.",
  "- claim: one claim before close, same fields plus subquestion.",
  "- hypothesize, resolve (with evidence), drop (with reason), check, status.",
  "nature: extraction, observation or inference. evidence: {source, lines:{start,end}} or {source, quote}.",
  "",
  "Lines: original-file, 1-based, inclusive.",
  "Empty: zero claims or no resolved evidence is never answered.",
  "Retains: every write; the host builds the card.",
  "Fails: inquiry_state, binding_missing.",
].join("\n")

export const searchDescription = [
  "Ripgrep search of the working tree for exact text. For a symbol's definition or callers use code_query; to find where a behavior lives, code_locate. Batch several patterns in one regex or parallel calls.",
  "",
  "pattern: at most 512 characters. mode: literal (default), identifier (bounded by identifier characters) or regex. caseSensitive: false ignores case. paths: up to 16 globs, e.g. src/**/*.ts or !**/test/**. context: 0 to 5 lines. limit: default 50, max 200; next gives the offset. Hidden files are searched, .gitignore respected.",
  "",
  "Lines: rows are path:line text, 1-based, sorted by path.",
  "Empty: absent from this scope only when coverage.complete is true; otherwise it proves nothing.",
  "Retains: nothing; capture the range to cite it.",
  "Fails: index_unavailable (no ripgrep), unsupported (invalid pattern), source_unavailable.",
].join("\n")

export const locateDescription = [
  "Start here for where, how and why questions about code. One call runs many searches (ripgrep and the code index), fuses them, rereads every range on disk and returns ranked file:line ranges with their lines.",
  "",
  "Give everything you know in one call: terms (up to 16), symbols (up to 16, e.g. DiscoveryResult.assemble), question (plain words). paths (globs) narrows; limit defaults to 12, max 40.",
  "",
  "Lines: original 1-based, inclusive startLine and endLine; a long range shows its first 40 lines.",
  "Empty: no range matched; check searches and basis.coverage.complete before claiming absence.",
  "Retains: one snapshot of every range, citable by its ref and original lines, with no further capture.",
  "Fails: index_unavailable (no ripgrep), unsupported (no input, or outside a research dispatch).",
].join("\n")

export const queryDescription = [
  "Ask the prebuilt code index about a named symbol or file; one call answers what several greps would.",
  "",
  "op: definition (also first callers and file imports), references, callers, callees, implementations, imports and importers (need path), symbols (outline of path, or by name, kind, exported), map (files ranked by importance).",
  "Target: name (\"DiscoveryResult.assemble\") narrowed by path, or symbol id, or at {path, line, column}. An ambiguous name returns candidates only: repeat with symbol. limit max 200; next pages.",
  "",
  "Lines: 1-based, inclusive, as on disk.",
  "Empty: no match in the index; absence is claimed only when basis.coverage.complete and freshness allow.",
  "Retains: nothing; capture the file range to cite it.",
  "Fails: index_unavailable, index_building, reference_invalid.",
].join("\n")

export const probeDescription = [
  "Run one probe in a fresh read-only snapshot of the worktree or a commit: `typecheck` (a tsconfig), `test` (one test file, optional name) or `script` (ts, js or py, up to 16 KiB). No network, no writes outside its scratch. `expect` makes the verdict reproduced or not_reproduced; `hypothesis` lets the host record and resolve it. Charged in probe seconds.",
  "",
  "Lines: diagnostics carry the original file path with 1-based line and column.",
  "Empty: an empty stdout or stderr means the runner printed nothing; it proves nothing beyond this run.",
  "Retains: every result, failed or not, as structured JSON; cite its source with a JSON pointer such as /verdict.",
  "Fails: probe_timeout, probe_memory, probe_denied, budget_exhausted.",
].join("\n")

// The verdicts that end a probe early, as the named failures the seat reads (J4.7).
const FAILURE: Partial<Record<Probe.Verdict, "probe_timeout" | "probe_memory">> = {
  timeout: "probe_timeout",
  memory_exceeded: "probe_memory",
}

export function tools(services: Services) {
  const bound = Effect.fn("MaestroResearchTools.bound")(function* (name: string, context: Tool.Context) {
    yield* services.gate(context, ResearchSeatTools.SEAT, `${name} runs only as the research seat`)
    yield* services.permission
      .assert({
        action: name,
        resources: [ResearchSeatTools.SEAT],
        save: [ResearchSeatTools.SEAT],
        sessionID: context.sessionID,
        agent: context.agent,
        source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
      })
      .pipe(Effect.mapError((error) => new Tool.Failure({ message: `${name} was not permitted`, error })))
    const session = yield* services.store.get(context.sessionID)
    if (!session) return yield* denied(new Research.Error({ code: "binding_missing", message: "Native execution Session is not retained" }))
    const admitted = yield* ResearchDispatchV2.allowance(services, session)
    if (!admitted)
      return yield* denied(new Research.Error({ code: "binding_missing", message: "Research runs only under its dispatch allowance" }))
    if (admitted.allowance.binding.directory !== services.location.directory)
      return yield* denied(new Research.Error({ code: "binding_mismatch", message: "Research execution directory does not match its binding" }))
    return { binding: admitted.allowance.binding, allowance: admitted.allowance, domains: admitted.domains }
  })

  return {
    [names.capture]: Tool.make({
      description: captureDescription,
      input: Research.CaptureInput,
      output: Output,
      toModelOutput: ({ output }) => [{ type: "text", text: output.output }],
      execute: (input, context) =>
        Effect.gen(function* () {
          const research = yield* bound(names.capture, context)
          const source = { type: "tool" as const, messageID: context.assistantMessageID, callID: context.toolCallID }
          const before = yield* services.records.view(research.binding, { action: "corpus" }).pipe(Effect.catch(denied))
          // V1 charges each retained representation under its own call before it admits the bytes.
          const retain = (capture: ResearchRecords.CaptureInput) =>
            services.allowances
              .reserveBytes(
                research.allowance,
                `bytes:${context.assistantMessageID}:${context.toolCallID}:${capture.representation}`,
                typeof capture.content === "string" ? Buffer.byteLength(capture.content, "utf8") : capture.content.byteLength,
              )
              .pipe(Effect.andThen(services.records.capture(research.binding, context, capture)), Effect.catch(denied))
          // Read dedup (V1 `compact`): bytes already retained in this dispatch come back as their ref alone, and a
          // recaptured span whose bytes changed says so. A tool-output origin names its call, so equal bytes are its only
          // identity; a file or URL must also be the same one.
          const reply = (receipt: Research.SourceReceipt, content: string, span?: { basis: "original"; start: number; end: number }) => {
            const sources = "sources" in before ? before.sources : []
            const same = (entry: Research.SourceReceipt) =>
              entry.origin.kind === receipt.origin.kind &&
              entry.ref.representation === receipt.ref.representation &&
              (receipt.origin.kind === "tool-output" || entry.origin.uri === receipt.origin.uri)
            const retained = sources.find((entry) => same(entry) && entry.ref.digest === receipt.ref.digest)
            if (retained)
              return {
                title: "Research source captured",
                output: JSON.stringify({
                  ref: retained.ref,
                  unchanged: true,
                  summary: `${receipt.origin.kind === "tool-output" ? "output" : receipt.origin.uri}${span ? ` lines ${span.start}-${span.end}` : ""} is already retained in this dispatch with the same digest; reopen it with research_view only if it left your context`,
                }),
                research: receipt,
              }
            const previous =
              receipt.origin.kind === "tool-output"
                ? undefined
                : sources.find((entry) =>
                    same(entry) && entry.observed?.lineStart === receipt.observed?.lineStart && entry.observed?.lineEnd === receipt.observed?.lineEnd)
            return {
              title: "Research source captured",
              output: `${JSON.stringify({ ...receipt, ...(span ? { lines: span } : {}), ...(previous ? { changed: true, previous: previous.ref } : {}) })}\n\n${content}`,
              research: receipt,
            }
          }
          if (input.kind === "history") {
            const projected = yield* history(services, research.binding, context, input, retain)
            return reply(projected.receipt, projected.content)
          }
          if (input.kind === "url") {
            yield* services.permission
              .assert({ action: WebFetchTool.name, resources: [input.url], save: ["*"], sessionID: context.sessionID, agent: context.agent, source })
              .pipe(Effect.mapError((error) => new Tool.Failure({ message: `Unable to fetch ${input.url}`, error })))
            const fetched = yield* WebFetchTool.fetch(services.http, input.url, input.format).pipe(
              Effect.mapError(() => new Tool.Failure({ message: `Unable to fetch ${input.url}` })),
            )
            const received = yield* retain({
              origin: { kind: "url", uri: fetched.url },
              representation: "received",
              mediaType: fetched.contentType || "application/octet-stream",
              content: fetched.body,
              complete: true,
            })
            const text = yield* Effect.try({
              try: () => new TextDecoder("utf-8", { fatal: true }).decode(fetched.body),
              catch: () => new Tool.Failure({ message: "Research response is not lossless UTF-8 text" }),
            })
            const converted = yield* Effect.try({
              try: () => WebFetchTool.convert(text, fetched.contentType, input.format),
              catch: () => new Tool.Failure({ message: `Unable to convert ${input.url} to ${input.format}` }),
            })
            const html = fetched.contentType.includes("text/html")
            const receipt = yield* retain({
              origin: received.origin,
              representation: input.format,
              mediaType: input.format === "html" ? "text/html" : input.format === "markdown" ? "text/markdown" : "text/plain",
              content: converted,
              complete: true,
              derivedFrom: received.ref,
              transformation: html && input.format !== "html" ? `webfetch-${input.format}-v1` : "utf8-decode-v1",
            })
            return reply(receipt, converted)
          }
          const start = input.start ?? 1
          if (input.end !== undefined && input.end < start)
            return yield* denied(new Research.Error({ code: "reference_invalid", message: "File capture range does not exist" }))
          const target = yield* services.mutation.resolve({ path: input.path, kind: "directory" }).pipe(
            Effect.mapError(() => new Tool.Failure({ message: `Unable to read ${input.path}` })),
          )
          if (target.externalDirectory)
            yield* services.permission.assert({
              ...LocationMutation.externalDirectoryPermission(target.externalDirectory),
              sessionID: context.sessionID,
              agent: context.agent,
              source,
            }).pipe(Effect.mapError((error) => new Tool.Failure({ message: `Unable to read ${input.path}`, error })))
          if ((yield* services.reader.inspect(AbsolutePath.make(target.canonical)).pipe(Effect.orElseSucceed(() => "missing" as const))) !== "file")
            return yield* denied(new Research.Error({ code: "source_unavailable", message: `${input.path} is not a readable file` }))
          yield* services.permission.assert({
            action: "read",
            resources: [target.resource],
            save: ["*"],
            sessionID: context.sessionID,
            agent: context.agent,
            source,
          }).pipe(Effect.mapError((error) => new Tool.Failure({ message: `Unable to read ${input.path}`, error })))
          const bytes = yield* Effect.promise(() => Bun.file(target.canonical).bytes())
          const text = yield* Effect.try({
            try: () => new TextDecoder("utf-8", { fatal: true }).decode(bytes),
            catch: () => new Tool.Failure({ message: `${input.path} is not UTF-8 text` }),
          })
          // Original line breaks stay in the capture, so a retained span is the file's own bytes.
          const lines = text.split(/(?<=\r\n|\n|\r)/)
          if (start > Math.max(lines.length, 1))
            return yield* denied(new Research.Error({ code: "reference_invalid", message: `Line ${start} is out of range (${lines.length} lines)` }))
          const wanted = lines.slice(start - 1, input.end ?? lines.length)
          // Bounded as V1's read page: at most its lines and bytes.
          const kept = wanted.slice(0, ReadToolFileSystem.MAX_READ_LINES).reduce<string[]>((page, line) =>
            Buffer.byteLength(page.join("") + line, "utf8") <= ReadToolFileSystem.MAX_READ_BYTES || page.length === 0 ? [...page, line] : page, [])
          const content = kept.join("")
          const end = start + Math.max(kept.length, 1) - 1
          const receipt = yield* retain({
            origin: { kind: "file", uri: target.canonical },
            representation: "text",
            mediaType: "text/plain",
            content,
            complete: start === 1 && kept.length === lines.length,
            observed: {
              byteStart: Buffer.byteLength(lines.slice(0, start - 1).join(""), "utf8"),
              lineStart: start,
              ...(kept.length ? { lineEnd: end } : {}),
            },
          })
          return reply(receipt, content, { basis: "original", start, end })
        }),
    }),
    [names.view]: Tool.make({
      description: viewDescription,
      input: Research.ViewInput,
      output: Output,
      toModelOutput: ({ output }) => [{ type: "text", text: output.output }],
      execute: (input, context) =>
        Effect.gen(function* () {
          const research = yield* bound(names.view, context)
          const page = (value: unknown) => ({ title: `Research ${input.action}`, output: JSON.stringify(value), research: value })
          // V1 `shown`: an earlier completed call with the same input whose output is still in this Session's context
          // (after the latest compaction and not pruned) returns its ref, never the immutable bytes again.
          const key = ResearchLedger.canonical(input)
          if (
            (input.action === "source" || input.action === "document") &&
            (yield* SessionHistory.load(services.db, context.sessionID).pipe(Effect.orElseSucceed(() => [])))
              .flatMap((message) => (message.type === "assistant" ? message.content : []))
              .some(
                (part) =>
                  part.type === "tool" &&
                  part.name.split("__").at(-1) === names.view &&
                  part.id !== context.toolCallID &&
                  part.state.status === "completed" &&
                  part.time.pruned === undefined &&
                  ResearchLedger.canonical(part.state.input) === key,
              )
          )
            return {
              title: `Research ${input.action}`,
              output: JSON.stringify({
                ref: input.ref,
                ...(input.cursor ? { cursor: input.cursor } : {}),
                unchanged: true,
                summary: "This exact page is already in your context from an earlier research_view call; its bytes are immutable",
              }),
              research: { ref: input.ref, unchanged: true },
            }
          const result = yield* services.records.view(research.binding, input).pipe(Effect.catch(denied))
          if (input.action === "source" && "receipt" in result && "origin" in result.receipt && !input.cursor)
            return page({ ...result, lines: basis(result.receipt) })
          if (input.action !== "find" || !("matches" in result) || result.matches.length === 0) return page(result)
          // Match offsets are UTF-16 indexes into the whole retained text, so the pages up to the last match are reassembled.
          const last = result.matches.at(-1)?.start ?? 0
          const state = { text: "", cursor: undefined as string | undefined, receipt: undefined as Research.SourceReceipt | undefined }
          do {
            const next = yield* services.records
              .view(research.binding, { action: "source", ref: input.ref, ...(state.cursor ? { cursor: state.cursor } : {}) })
              .pipe(Effect.catch(denied))
            if (!("receipt" in next) || !("origin" in next.receipt)) return page(result)
            state.text += next.text
            state.cursor = next.cursor
            state.receipt = next.receipt
          } while (state.cursor && state.text.length <= last)
          if (!state.receipt) return page(result)
          const origin = basis(state.receipt)
          const breaks = [...state.text.matchAll(/\r\n|\n|\r/g)].map((match) => match.index)
          return page({
            ...result,
            lineBasis: origin.basis,
            matches: result.matches.map((match) => ({ ...match, line: origin.start + breaks.filter((index) => index < match.start).length })),
          })
        }),
    }),
    [names.record]: Tool.make({
      description: recordDescription,
      input: Research.RecordInput,
      output: Output,
      toModelOutput: ({ output }) => [{ type: "text", text: output.output }],
      execute: (input, context) =>
        Effect.gen(function* () {
          const research = yield* bound(names.record, context)
          // Reject foreign references before byte admission or durable document publication, including exact retries.
          const qualifications =
            input.action === "document"
              ? yield* qualify(services, research.binding, input.document.findingRefs).pipe(Effect.catch(denied))
              : undefined
          yield* services.allowances
            .reserveBytes(
              research.allowance,
              `bytes:${context.assistantMessageID}:${context.toolCallID}:${input.action}`,
              input.action === "document" ? Buffer.byteLength(input.document.body, "utf8") : 0,
            )
            .pipe(Effect.catch(denied))
          const result = yield* services.records.record(research.binding, context, input).pipe(Effect.catch(denied))
          const reply = { ...(qualifications ? { qualifications } : {}), ...result }
          return {
            title: result.document ? `Research document: ${result.document.title}` : `Research ${input.action} retained`,
            output: JSON.stringify(reply, null, result.document ? 2 : undefined),
            research: reply,
          }
        }),
    }),
    [names.inquiry]: Tool.make({
      description: inquiryDescription,
      input: Research.InquiryInput,
      output: Output,
      toModelOutput: ({ output }) => [{ type: "text", text: output.output }],
      execute: (input, context) =>
        Effect.gen(function* () {
          const research = yield* bound(names.inquiry, context)
          return yield* inquire(services, research, input, context).pipe(Effect.catch(denied))
        }),
    }),
    // The host builds the ripgrep argv and the seat supplies only values.
    // Each line carries the index symbol enclosing it when an index serves the worktree.
    [names.search]: Tool.make({
      description: searchDescription,
      input: CodeIndex.SearchInput,
      output: Output,
      toModelOutput: ({ output }) => [{ type: "text", text: output.output }],
      execute: (input, context) =>
        Effect.gen(function* () {
          const research = yield* bound(names.search, context)
          const directory = services.location.directory
          const worktree = research.binding.worktree
          const head = yield* services.git.run(["rev-parse", "HEAD"], { cwd: directory })
          const resolve = enclosing(services, worktree)
          // Search paths are relative to the directory, index paths to the git worktree.
          const searched = yield* CodeSearch.run(input, {
            cwd: directory,
            ...(head.exitCode === 0 ? { commit: head.text().trim() } : {}),
            enclosing: (file, line) => resolve(path.relative(worktree, path.join(directory, file)).replaceAll("\\", "/"), line),
          }).pipe(
            Effect.provideService(AppProcess.Service, services.processes),
            Effect.provideService(Ripgrep.RipgrepBinary.Service, services.ripgrep),
            Effect.map((result) => ({ ok: true as const, result })),
            Effect.catchTag("CodeSearch.Failure", (failure) => Effect.succeed({ ok: false as const, failure })),
          )
          if (!searched.ok) return { title: input.pattern, output: `${searched.failure.reason}: ${searched.failure.message}` }
          const found = searched.result
          // Compact by contract: one row per hit, then one coverage line; no raw dump.
          const rows = found.matches.flatMap((match) => [
            ...(match.before ?? []).map((text, index, before) => `${match.path}-${match.line - (before.length - index)}- ${text}`),
            `${match.path}:${match.line}:${match.enclosing ? ` [${match.enclosing.name}]` : ""} ${match.text}`,
            ...(match.after ?? []).map((text, index) => `${match.path}-${match.line + index + 1}- ${text}`),
          ])
          const coverage = found.basis.coverage
          return {
            title: input.pattern,
            output: [
              ...rows,
              `${found.matches.length} hit(s)${found.next === undefined ? "" : `; more: offset ${found.next}`}`,
              `coverage: files=${coverage.documents} ignoreRespected=${coverage.ignoreRespected} binariesSkipped=${coverage.binariesSkipped} complete=${coverage.complete}` +
                coverage.skipped.map((item) => ` skipped(${item.reason})`).join(""),
            ].join("\n"),
          }
        }),
    }),
    // The index fails `index_unavailable` rather than answering empty.
    [names.query]: Tool.make({
      description: queryDescription,
      input: CodeIndex.CodeQuery,
      output: Output,
      toModelOutput: ({ output }) => [{ type: "text", text: output.output }],
      execute: (input, context) =>
        Effect.gen(function* () {
          const research = yield* bound(names.query, context)
          const worktree = research.binding.worktree
          const query = yield* scoped(worktree, input).pipe(Effect.catch(denied))
          const result = yield* index(services, worktree, query).pipe(Effect.catch(denied))
          const lines = head(query, result)
          // A definition also carries its first callers and the imports of its file.
          const related =
            query.op === "definition" && result.resolved
              ? [
                  ...(yield* index(services, worktree, { op: "callers", symbol: result.resolved.symbol, limit: CONTEXT_CALLERS }).pipe(
                    Effect.map((callers) =>
                      section(`callers${callers.next === undefined ? "" : ` (first ${CONTEXT_CALLERS}; op=callers for more)`}`, callers.hits),
                    ),
                    Effect.orElseSucceed(() => []),
                  )),
                  ...(yield* index(services, worktree, { op: "imports", path: result.resolved.range.path, limit: CONTEXT_IMPORTS }).pipe(
                    Effect.map((imports) =>
                      section(
                        `imports of ${result.resolved?.range.path}${imports.next === undefined ? "" : ` (first ${CONTEXT_IMPORTS}; op=imports for more)`}`,
                        imports.hits,
                      ),
                    ),
                    Effect.orElseSucceed(() => []),
                  )),
                ]
              : []
          return {
            title: `code_query ${input.op}`,
            output: [
              ...lines,
              ...related,
              ...section("hits", result.hits),
              ...(result.next === undefined ? [] : [`next: offset=${result.next}`]),
              basis(result.basis),
            ].join("\n"),
          }
        }),
    }),
    // One closed runner in a fresh jailed snapshot (core ProbeRun, through
    // AppProcess), charged in probe seconds, retained as citable structured JSON even when it fails, and with a
    // hypothesis recorded against it.
    [names.probe]: Tool.make({
      description: probeDescription,
      input: Probe.ProbeInput,
      output: Output,
      toModelOutput: ({ output }) => [{ type: "text", text: output.output }],
      execute: (input, context) =>
        Effect.gen(function* () {
          const research = yield* bound(names.probe, context)
          const binding = research.binding
          const allowance = research.allowance
          const records = services.records
          // The hypothesis must be open before anything runs, so a probe never spends seconds it cannot record.
          const hypothesis = input.hypothesis
            ? ResearchInquiry.fold(yield* records.dispatch(allowance).pipe(Effect.catch(denied))).hypotheses.find(
                (item) => item.ref.id === input.hypothesis?.id,
              )
            : undefined
          if (input.hypothesis && hypothesis?.status !== "open")
            return yield* denied(
              new Research.Error({ code: "inquiry_state", message: `${input.hypothesis.id} is not an open hypothesis of this inquiry` }),
            )
          // V1 `ResearchExecution.probe`: the dispatch's probe seconds bound the run, and whole seconds are charged after it.
          const limit = allowance.probeSecondsLimit
          const used = (yield* ResearchLedger.dispatch(allowance).pipe(Effect.provideService(Database.Service, services.database))).reduce(
            (total, step) => (step.type === "research.allowance.charged" && step.data.kind === "probe" ? total + step.data.amount : total),
            0,
          )
          if (used >= limit)
            return yield* denied(
              new Research.Error({
                code: "budget_exhausted",
                message: `Research probe allowance exhausted (${used}/${limit} seconds); retained work remains available`,
              }),
            )
          const result = yield* ProbeRun.run(input, {
            worktree: binding.worktree,
            executionSessionID: binding.executionSessionID,
            dispatchID: `${binding.executionSessionID}:${allowance.dispatchCallID}`,
            remainingSeconds: limit - used,
          }).pipe(
            Effect.scoped,
            Effect.provideService(AppProcess.Service, services.processes),
            Effect.mapError(
              (error) =>
                new Tool.Failure({
                  message: `Research denied: ${error.code}: ${error.reason}${error.options ? ` (options: ${error.options.join(", ")})` : ""}`,
                }),
            ),
          )
          // Whole seconds, at least one per probe that ran; the timeout already bounds it by what remained.
          yield* services.allowances
            .charge(
              allowance,
              "probe",
              `probe:${context.assistantMessageID}:${context.toolCallID}`,
              Math.min(limit - used, Math.max(1, Math.ceil(result.durationMs / 1000))),
            )
            .pipe(Effect.catch(denied))
          const uri = ProbeRun.uri(binding.executionSessionID, result.probeID)
          const script =
            input.runner.kind === "script"
              ? (yield* records
                  .capture(binding, context, {
                    origin: { kind: "tool-output", uri: `${uri}/script` },
                    representation: "text",
                    mediaType: "text/plain",
                    content: input.runner.source,
                    complete: true,
                  })
                  .pipe(Effect.catch(denied))).ref
              : undefined
          const retained: Probe.ProbeResult = script ? { ...result, script } : result
          const receipt = yield* records
            .capture(binding, context, {
              origin: { kind: "tool-output", uri },
              representation: "structured-json",
              mediaType: "application/json",
              content: JSON.stringify(retained),
              complete: true,
            })
            .pipe(Effect.catch(denied))
          const relation = !hypothesis
            ? undefined
            : result.verdict === "not_reproduced"
              ? ("refutes" as const)
              : input.expect && (result.verdict === "reproduced" || result.verdict === "passed")
                ? ("supports" as const)
                : undefined
          if (hypothesis && relation) {
            const write = (record: Research.RecordInput, slot: string) =>
              records.record(binding, context, record, slot).pipe(
                Effect.flatMap((mutation) =>
                  mutation.record
                    ? Effect.succeed({ id: mutation.record.id, revision: mutation.record.revision })
                    : Effect.fail(new Research.Error({ code: "publication_uncertain", message: "Probe observation was not retained" })),
                ),
                Effect.catch(denied),
              )
            const observation = yield* write(
              {
                action: "finding",
                nature: "observation",
                conditions: [],
                contrary: [],
                proposition: `probe ${result.probeID} ${result.verdict}: ${hypothesis.proposition}`.slice(0, 8192),
                evidence: [{ source: receipt.ref, locator: { kind: "json", pointer: "/verdict" } }],
              },
              "probe:observation",
            )
            yield* write({ action: "relation", from: observation, to: hypothesis.ref, relation, reason: `probe ${result.verdict}` }, "probe:relation")
          }
          const failure = FAILURE[result.verdict]
          return {
            title: `${failure ?? result.verdict}: probe ${result.runner.kind}`,
            output: JSON.stringify({
              ...(failure ? { error: failure } : {}),
              source: receipt.ref,
              ...(hypothesis ? { hypothesis: { ref: hypothesis.ref, resolved: relation ?? null } } : {}),
              ...retained,
            }),
            research: receipt,
          }
        }),
    }),
    // One deterministic fan-out over ripgrep and the index whose ranges are
    // retained as one snapshot the seat cites without a second read.
    [names.locate]: Tool.make({
      description: locateDescription,
      input: CodeIndex.LocateInput,
      output: Output,
      toModelOutput: ({ output }) => [{ type: "text", text: output.output }],
      execute: (input, context) =>
        Effect.gen(function* () {
          const research = yield* bound(names.locate, context)
          const worktree = research.binding.worktree
          const resolve = enclosing(services, worktree)
          const state: { receipt?: Research.SourceReceipt; snapshot?: string } = {}
          const result = yield* Locate.run(input, {
            search: (search) =>
              CodeSearch.run(search, { cwd: worktree, enclosing: resolve }).pipe(
                Effect.provideService(AppProcess.Service, services.processes),
                Effect.provideService(Ripgrep.RipgrepBinary.Service, services.ripgrep),
                Effect.mapError(
                  (failure) =>
                    new Research.Error({
                      code:
                        failure.reason === "index_unavailable"
                          ? "index_unavailable"
                          : failure.reason === "pattern_invalid"
                            ? "unsupported"
                            : "source_unavailable",
                      message: failure.message,
                    }),
                ),
              ),
            query: (query) => index(services, worktree, query),
            read: (file) => {
              const absolute = path.resolve(worktree, file)
              const relative = path.relative(worktree, absolute)
              if (relative.startsWith("..") || path.isAbsolute(relative)) return Effect.succeed(undefined)
              return Effect.promise(() => Bun.file(absolute).text().catch(() => undefined))
            },
            // One snapshot of every range, in original coordinates; the worktree is its origin since ranges span files.
            retain: (snapshot) =>
              services.allowances
                .reserveBytes(research.allowance, `bytes:${context.assistantMessageID}:${context.toolCallID}:text`, Buffer.byteLength(snapshot, "utf8"))
                .pipe(
                  Effect.andThen(
                    services.records.capture(research.binding, context, {
                      origin: { kind: "file", uri: worktree },
                      representation: "text",
                      mediaType: "text/plain",
                      content: snapshot,
                      complete: true,
                    }),
                  ),
                  Effect.tap((receipt) =>
                    Effect.sync(() => {
                      state.receipt = receipt
                      state.snapshot = snapshot
                    }),
                  ),
                  Effect.map((receipt) => receipt.ref),
                ),
          }).pipe(Effect.catch(denied))
          // The result on the first line, then the lines of every range from the retained snapshot, cut to a budget.
          const budget = { left: SHOWN_LINES }
          const shown = (state.snapshot ?? "")
            .split("\n\n")
            .slice(1)
            .map((block) => {
              const [first, ...rows] = block.split("\n")
              const keep = rows.slice(0, Math.max(0, Math.min(RANGE_LINES, budget.left)))
              budget.left -= keep.length
              const rest = rows.length - keep.length
              return [first, ...keep, ...(rest ? [`(${rest} more lines held in the snapshot; research_capture the file range to see them)`] : [])].join("\n")
            })
            .join("\n\n")
          return {
            title: `${result.ranges.length} located range${result.ranges.length === 1 ? "" : "s"}`,
            output: [JSON.stringify(result), ...(state.snapshot ? [shown] : [])].join("\n\n"),
            ...(state.receipt ? { research: state.receipt } : {}),
          }
        }),
    }),
  }
}

const CONTEXT_CALLERS = 5
const CONTEXT_IMPORTS = 10
const RANGE_LINES = 40
const SHOWN_LINES = 320

/**
 * The code index query (V1 `CodeIndexTools` Engine) over the real build path. Pack readiness is read per query, so a
 * pack installed after startup serves the next call, and config `research.limits` is read per query too.
 */
function index(services: Services, worktree: string, input: CodeIndex.CodeQuery) {
  return Effect.gen(function* () {
    const parts = yield* CodeIndexExtract.make
    const engine = yield* CodeIndexQuery.engine({
      storeRoot: yield* ResearchToolkit.Root,
      indexers: yield* CodeIndexExtract.indexers(),
      overlay: parts.overlay,
      extract: parts.extract,
    })
    return yield* engine.query(worktree, input).pipe(Effect.provideService(ResearchToolkit.Caps, yield* caps(services.config)))
  }).pipe(Effect.provideService(AppProcess.Service, services.processes))
}

/** `ResearchToolkit.Caps` from config `research.limits`, which may only lower the owner caps (V1 `code-index.ts`). */
export function caps(config: Config.Interface) {
  return config.entries().pipe(Effect.map((entries) => ResearchToolkit.caps(Config.latest(entries, "research")?.limits)))
}

/**
 * The code-index warm-up V1 starts with the tool registry (`registry.ts` `research.prewarm`): only where the research
 * seat exists and the worktree is a real one, and only on a platform that can confine the indexer. `prewarm` forks
 * detached and runs once per worktree per process.
 */
export function warm(input: { config: Config.Interface; processes: AppProcess.Interface; seat: boolean; worktree: string }) {
  return Effect.gen(function* () {
    if (!input.seat || input.worktree === "/") return
    if (process.platform !== "darwin" && process.platform !== "linux") return
    yield* ResearchToolkit.prewarm(input.worktree).pipe(
      Effect.provideService(ResearchToolkit.Index, yield* CodeIndexExtract.toolkit),
      Effect.provideService(ResearchToolkit.Caps, yield* caps(input.config)),
    )
  }).pipe(Effect.provideService(AppProcess.Service, input.processes))
}

/**
 * The innermost index definition around a line, from one `symbols` outline per file, shared by every search the
 * resolver serves. Without an index, or while it builds, no line has an enclosing symbol, and the first such answer
 * stops further index calls.
 */
function enclosing(services: Services, worktree: string) {
  const outlines = new Map<string, ReadonlyArray<CodeIndex.SymbolRef>>()
  const state = { unavailable: false }
  return (file: string, line: number) =>
    Effect.gen(function* () {
      if (state.unavailable) return undefined
      const symbols =
        outlines.get(file) ??
        (yield* index(services, worktree, { op: "symbols", path: file, limit: 200 }).pipe(
          Effect.map((result) => result.hits.flatMap((hit) => (hit.via && hit.via.range.path === file ? [hit.via] : []))),
          Effect.catch(() =>
            Effect.sync((): ReadonlyArray<CodeIndex.SymbolRef> => {
              state.unavailable = true
              return []
            }),
          ),
        ))
      outlines.set(file, symbols)
      return symbols
        .filter((symbol) => symbol.range.startLine <= line && line <= symbol.range.endLine)
        .toSorted((a, b) => a.range.endLine - a.range.startLine - (b.range.endLine - b.range.startLine))[0]
    })
}

function head(query: CodeIndex.CodeQuery, result: CodeIndex.CodeQueryResult) {
  if (result.resolved) return [`${query.op}: ${symbol(result.resolved)}`]
  if (result.candidates.length === 0) return [`${query.op}: no target resolved`]
  return [
    `${query.op}: ambiguous, ${result.candidates.length} candidates; repeat with symbol or path`,
    ...result.candidates.map((candidate) => `  ${symbol(candidate)} id=${candidate.symbol}`),
  ]
}

function section(title: string, hits: CodeIndex.CodeQueryResult["hits"]) {
  if (hits.length === 0) return []
  return [
    `${title} (${hits.length}):`,
    ...hits.map((hit) =>
      [
        "  ",
        range(hit.range),
        " ",
        hit.role,
        hit.via ? ` in ${hit.via.name}` : "",
        hit.sites ? ` lines ${hit.sites.join(",")}` : "",
        hit.opaque ? " opaque" : "",
      ].join(""),
    ),
  ]
}

function symbol(ref: CodeIndex.SymbolRef) {
  return `${ref.name} ${ref.kind}${ref.exported ? " exported" : ""} ${range(ref.range)}`
}

function range(value: CodeIndex.Range) {
  return value.startLine === value.endLine ? `${value.path}:${value.startLine}` : `${value.path}:${value.startLine}-${value.endLine}`
}

// The six dimensions beside every finding (JT.1), one line.
function basis(value: CodeIndex.Basis) {
  const skipped = value.coverage.skipped.slice(0, 5).map((item) => `${item.path} (${item.reason})`)
  return [
    `basis: commit ${value.basis.commit.slice(0, 12)}${value.basis.dirtyDigest ? "+dirty" : ""}`,
    // The indexer tells a precise shard from a structural one (`tree-sitter`), which has no references.
    `shards ${value.basis.shards.map((shard) => `${shard.language}:${shard.project}@${shard.indexer}`).join(",") || "none"}`,
    `${value.execution.op} ${value.execution.ms}ms`,
    `docs ${value.coverage.documents}${value.coverage.complete ? "" : " INCOMPLETE"}`,
    ...(value.coverage.languagesMissing.length ? [`missing ${value.coverage.languagesMissing.join(",")}`] : []),
    ...(value.coverage.opaqueSites ? [`opaque ${value.coverage.opaqueSites}`] : []),
    ...(skipped.length
      ? [`skipped ${skipped.join("; ")}${value.coverage.skipped.length > skipped.length ? ` +${value.coverage.skipped.length - skipped.length}` : ""}`]
      : []),
    value.freshness,
    `limit ${value.bounds.limit}${value.bounds.truncated ? " TRUNCATED" : ""}`,
  ].join(" | ")
}

/** Paths are worktree-relative; anything that leaves the worktree is `reference_invalid` (J2.12). */
function scoped(worktree: string, input: CodeIndex.CodeQuery) {
  const inside = (value: string) => {
    const relative = path.isAbsolute(value) ? path.relative(worktree, value) : path.normalize(value)
    return relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
      ? undefined
      : relative.split(path.sep).join("/")
  }
  const fields = ["path" in input ? input.path : undefined, "at" in input ? input.at?.path : undefined]
  if (fields.some((value) => value !== undefined && inside(value) === undefined))
    return Effect.fail(new Research.Error({ code: "reference_invalid", message: "Path is outside the linked worktree" }))
  return Effect.succeed({
    ...input,
    ...("path" in input && input.path !== undefined ? { path: inside(input.path) } : {}),
    ...("at" in input && input.at ? { at: { ...input.at, path: inside(input.at.path) ?? input.at.path } } : {}),
  } as CodeIndex.CodeQuery)
}

/**
 * The seat's investigation (J5.4): every action writes the existing records or
 * an inquiry event, then answers with the compact state, so the model keeps ids instead of rereading.
 */
const inquire = Effect.fn("MaestroResearchTools.inquire")(function* (
  services: Services,
  research: { readonly binding: Research.Binding; readonly allowance: Research.Allowance; readonly domains: readonly string[] | undefined },
  input: Research.InquiryInput,
  context: Tool.Context,
) {
  const records = services.records
  const binding = research.binding
  const allowance = research.allowance
  const load = () => records.dispatch(allowance)
  const steps = yield* load()
  const state = ResearchInquiry.fold(steps)
  const refuse = (message: string) => new Research.Error({ code: "inquiry_state", message })
  if (state.phase === "closed") return yield* refuse("inquiry closed")
  if (state.phase === "none" && input.action !== "open" && input.action !== "status" && input.action !== "close")
    return yield* refuse("open the inquiry first: inquiry open with the question and its subquestions")
  const write = (record: Research.RecordInput, slot: string) =>
    records.record(binding, context, record, slot).pipe(
      Effect.flatMap((mutation) =>
        mutation.record
          ? Effect.succeed({ id: mutation.record.id, revision: mutation.record.revision })
          : Effect.fail(new Research.Error({ code: "publication_uncertain", message: "Inquiry record was not retained" })),
      ),
    )
  const relate = (
    from: Research.RecordRef,
    to: Research.RecordRef,
    relation: "depends-on" | "related" | "answers" | "supports" | "refutes",
    reason: string,
    slot: string,
  ) => write({ action: "relation", from, to, relation, reason }, slot)
  // The check's dependencies beyond the ledger: the record verifier and retained bytes (records), the domain list, the
  // Session's code searches for R5/R6, URL liveness, and real paths so a symlinked citation resolves like read.
  const deps = Effect.gen(function* () {
    const messages = yield* SessionHistory.loadAll(services.db, context.sessionID).pipe(Effect.orElseSucceed(() => []))
    return {
      records,
      binding,
      domains: research.domains,
      searches: ResearchInquiry.searches(messages),
      links: Liveness.check,
      real: (target: string) => services.fs.resolve(target).pipe(Effect.catchDefect(() => Effect.succeed(target))),
    }
  })
  const subquestion = (ref: Research.RecordRef) => {
    const found = state.subquestions.find((sub) => sub.ref.id === ref.id)
    return found ? Effect.succeed(found) : Effect.fail(refuse(`${ref.id} is not a subquestion of this inquiry`))
  }
  const open = (opening: Pick<Extract<Research.InquiryInput, { action: "open" }>, "question" | "subquestions" | "profile" | "genre">) =>
    Effect.gen(function* () {
      const selection = { profile: opening.profile, depth: allowance.tier, genre: opening.genre ?? "answer" } as const
      const question = yield* write({ action: "question", question: opening.question, selection }, "open:question")
      const subquestions = yield* Effect.forEach(opening.subquestions, (text, index) =>
        write({ action: "question", question: text, selection }, `open:subquestion:${index}`).pipe(
          Effect.tap((ref) => relate(ref, question, "depends-on", "subquestion", `open:depends:${index}`)),
        ),
      )
      yield* records.inquire(allowance, context, { type: "research.inquiry.opened", question, subquestions })
      return { question, subquestions }
    })
  const claim = (item: Research.InlineClaim, sub: Research.RecordRef, slot: string) =>
    Effect.gen(function* () {
      const ref = yield* write(
        {
          action: "finding",
          proposition: item.proposition,
          nature: item.nature,
          conditions: ResearchInquiry.conditions(item),
          evidence: item.evidence.map(ResearchInquiry.evidence),
          contrary: (item.contrary ?? []).map(ResearchInquiry.evidence),
        },
        slot,
      )
      yield* relate(ref, sub, "answers", "claim", `${slot}:link`)
      return ref
    })
  const failed = (outcome: InquiryCheck.Outcome) =>
    refuse(
      `the closing check failed: ${outcome.result.issues
        .slice(0, 16)
        .map((issue) => `${issue.rule}${issue.ref ? ` ${issue.ref.id}` : ""}${issue.citation ? ` ${issue.citation}` : ""} ${issue.reason}`)
        .join("; ")}`,
    )
  const reply: unknown = yield* Effect.gen(function* () {
    if (input.action === "open") {
      // An exact retry replays its writes; a second open of the same dispatch is refused before any write.
      const retry = steps.some(
        (step) =>
          step.type === "research.inquiry.opened" && step.data.operation === ResearchLedger.operation(context, "research.inquiry.opened"),
      )
      if (state.phase !== "none" && !retry) return yield* refuse("the inquiry is already open in this dispatch")
      return yield* open(input)
    }
    if (input.action === "hypothesize") {
      const sub = yield* subquestion(input.subquestion)
      const hypothesis = yield* write(
        { action: "finding", proposition: input.proposition, nature: "hypothesis", conditions: [], evidence: [], contrary: [] },
        "hypothesis",
      )
      yield* relate(hypothesis, sub.ref, "related", "hypothesis", "hypothesis:link")
      return { hypothesis }
    }
    if (input.action === "claim") {
      const sub = yield* subquestion(input.subquestion)
      return { claim: yield* claim(input, sub.ref, "claim") }
    }
    if (input.action === "resolve") {
      const hypothesis = state.hypotheses.find((item) => item.ref.id === input.hypothesis.id)
      if (!hypothesis || hypothesis.status !== "open") return yield* refuse(`${input.hypothesis.id} is not an open hypothesis of this inquiry`)
      if (!input.evidence.length) return yield* refuse("resolve needs evidence: cite the source or probe that decides it")
      const decision = yield* write(
        {
          action: "finding",
          proposition: `${input.status}: ${hypothesis.proposition}`.slice(0, 8192),
          nature: "observation",
          conditions: [],
          evidence: input.evidence.map(ResearchInquiry.evidence),
          contrary: [],
        },
        "resolve",
      )
      yield* relate(decision, hypothesis.ref, input.status === "confirmed" ? "supports" : "refutes", input.status, "resolve:link")
      return { hypothesis: hypothesis.ref, status: input.status, decision }
    }
    if (input.action === "drop") {
      const known = [...state.subquestions, ...state.hypotheses, ...state.claims].find((item) => item.ref.id === input.ref.id)
      if (!known || !state.question) return yield* refuse(`${input.ref.id} is not a subquestion, hypothesis or claim of this inquiry`)
      yield* relate(
        known.ref,
        { id: state.question.id, revision: state.question.revision },
        "related",
        `drop: ${input.reason}`.slice(0, 4096),
        "drop",
      )
      return { dropped: known.ref }
    }
    if (input.action === "check") {
      const check = (yield* ResearchInquiry.check(state, undefined, yield* deps)).result
      yield* records.inquire(allowance, context, { type: "research.inquiry.checked", check })
      return { check }
    }
    if (input.action === "close") {
      // At tier quick a close may open the inquiry itself, with its question as the one subquestion.
      if (state.phase === "none" && (allowance.tier !== "quick" || !input.question))
        return yield* refuse(
          allowance.tier === "quick"
            ? "with no open inquiry, close needs question: the question it answers"
            : "open the inquiry first: inquiry open with the question and its subquestions",
        )
      // The close checks its own claims and answer on a draft before writing anything, so a refused close leaves
      // nothing to drop; its failures refuse an answered close by name and become limitations short of answered.
      const draft = ResearchInquiry.draft(state, input)
      if (typeof draft === "string") return yield* refuse(draft)
      const refusal = ResearchInquiry.refusal(draft, input.sufficiency)
      if (refusal) return yield* refuse(refusal)
      const outcome = yield* ResearchInquiry.check(draft, input, yield* deps)
      if (input.sufficiency === "answered" && outcome.result.verdict !== "pass") return yield* failed(outcome)
      const question = input.question ?? ""
      const opened =
        state.phase === "none" ? yield* open({ question, subquestions: [question], profile: "understand" }) : undefined
      // Each inline claim is written under the subquestion the draft placed it in.
      const placement = new Map<string, number>(
        draft.subquestions.flatMap((sub, position) => sub.claims.map((ref) => [ref.id, position] as const)),
      )
      const subquestions = opened ? opened.subquestions : state.subquestions.map((sub) => sub.ref)
      yield* Effect.forEach(
        input.claims ?? [],
        (item, index) => claim(item, subquestions[placement.get(`claim-${index + 1}`) ?? 0], `claim:${index}`),
        { discard: true },
      )
      const final = opened || input.claims?.length ? ResearchInquiry.fold(yield* load()) : state
      const settled = final === state ? outcome : yield* ResearchInquiry.check(final, input, yield* deps)
      if (input.sufficiency === "answered" && settled.result.verdict !== "pass") return yield* failed(settled)
      const corpus = yield* records.view(binding, { action: "corpus" })
      const documents = "documents" in corpus ? corpus.documents.map((document) => document.ref) : []
      const card = ResearchInquiry.card(final, { allowance, close: input, outcome: settled, domains: research.domains, documents })
      yield* records.inquire(allowance, context, { type: "research.inquiry.closed", card })
      return { closed: input.sufficiency, check: settled.result.verdict }
    }
    return { phase: state.phase, check: state.check ?? null }
  })
  const after = ResearchInquiry.fold(yield* load())
  return {
    title: `Inquiry ${input.action}`,
    output: `${JSON.stringify(reply)}\n${ResearchInquiry.snapshot(after, allowance)}`,
    research: { inquiry: reply },
  }
})

const FULL_HASH = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
// A range diff gates every changed file it would project, so a path set that touches more is refused, not sampled.
const COMPARE_FILE_LIMIT = 100

type Retain = (capture: ResearchRecords.CaptureInput) => Effect.Effect<Research.SourceReceipt, Tool.Failure>

/**
 * Git state in the bound worktree (V1 `research/history.ts`): the received Git output, then its structured projection
 * derived from it. Every path it names or projects passes the read gates a file capture passes.
 */
const history = Effect.fn("MaestroResearchTools.history")(function* (
  services: Services,
  binding: Research.Binding,
  context: Tool.Context,
  input: Research.HistoryInput,
  retain: Retain,
) {
  if (input.operation === "blame" && input.end !== undefined && input.end < (input.start ?? 1))
    return yield* denied(new Research.Error({ code: "reference_invalid", message: "Blame line range does not exist" }))
  if (input.operation === "search" && input.message === undefined && input.path === undefined)
    return yield* denied(new Research.Error({ code: "reference_invalid", message: "Commit search requires a message substring, a path, or both" }))
  const root = yield* services.fs.realPath(binding.worktree).pipe(
    Effect.mapError(() => new Tool.Failure({ message: "Research worktree is unavailable" })),
  )
  const requested = "paths" in input ? input.paths : "path" in input && input.path !== undefined ? [input.path] : []
  const relatives = requested.map((entry) => path.relative(root, path.resolve(binding.directory, entry)).replaceAll("\\", "/"))
  if (relatives.some((relative) => !relative || relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)))
    return yield* denied(new Research.Error({ code: "binding_mismatch", message: "Historical path must address one file inside the bound worktree" }))
  yield* gate(services, context, root, relatives)
  // A redirected caller environment (a VS Code terminal sets GIT_ASKPASS, a hook sets GIT_DIR) never reaches Git (J2.14).
  const exec = { cwd: root, env: environment(), extendEnv: false }
  const actual = yield* services.git.run(["rev-parse", "--show-toplevel"], { ...exec, maxOutputBytes: 8192, timeout: "10 seconds" })
  const top = actual.exitCode === 0 && !actual.truncated
    ? yield* services.fs.realPath(actual.text().trim()).pipe(Effect.orElseSucceed(() => undefined))
    : undefined
  if (top !== root)
    return yield* denied(new Research.Error({ code: "binding_mismatch", message: "Git repository differs from native research worktree" }))
  const resolve = (revision: string) =>
    services.git
      .run(["rev-parse", "--verify", "--end-of-options", `${revision}^{commit}`], { ...exec, maxOutputBytes: 1024, timeout: "10 seconds" })
      .pipe(
        Effect.flatMap((head) =>
          head.exitCode !== 0 || head.truncated || !FULL_HASH.test(head.text().trim())
            ? denied(new Research.Error({ code: "source_unavailable", message: "Requested historical commit is unavailable" }))
            : Effect.succeed(head.text().trim()),
        ),
      )
  const origin = (operation: string, revision?: string) =>
    ({
      kind: "tool-output",
      uri: `native:${context.sessionID}/${context.assistantMessageID}/${context.toolCallID}/git-${operation}`,
      ...(revision ? { revision } : {}),
    }) as const
  if (input.operation === "status") {
    const head = yield* resolve("HEAD").pipe(Effect.option)
    const result = yield* services.git.run(
      ["--no-pager", "status", "--porcelain=v2", "--branch", "-z", "--untracked-files=normal"],
      { ...exec, maxOutputBytes: Research.Limits.sourceBytes, timeout: "30 seconds" },
    )
    if (result.exitCode !== 0)
      return yield* denied(new Research.Error({ code: "source_unavailable", message: "Working tree status failed; no empty successful source was admitted" }))
    if (result.truncated)
      return yield* denied(new Research.Error({ code: "over_cap", message: "Working tree status exceeds the capture bound" }))
    const where = origin("status", Option.getOrUndefined(head))
    const received = yield* retain({ origin: where, representation: "received", mediaType: "text/plain", content: result.stdout, complete: true })
    const text = yield* Effect.try({
      try: () => new TextDecoder("utf-8", { fatal: true }).decode(result.stdout),
      catch: () => new Tool.Failure({ message: "Research denied: unsupported: Working tree status is not lossless UTF-8 text" }),
    })
    const parsed = porcelain(text)
    if (!parsed)
      return yield* denied(new Research.Error({ code: "publication_uncertain", message: "Working tree status projection is malformed" }))
    const content = JSON.stringify({
      operation: "status", head: Option.getOrNull(head), ...parsed, complete: true,
      scope: "working-tree-status", dirtyWorkingTreeObserved: true,
    })
    const receipt = yield* retain({ origin: where, representation: "structured-json", mediaType: "application/json", content, complete: true,
      derivedFrom: received.ref, transformation: "native-git-status-v1" })
    return { receipt, content }
  }
  const revision = yield* resolve(input.operation === "resolve" ? input.ref : input.revision ?? "HEAD")
  const base = input.operation === "compare" || input.operation === "diff" ? yield* resolve(input.base) : undefined
  const shallow = yield* services.git.run(["rev-parse", "--is-shallow-repository"], { ...exec, maxOutputBytes: 1024, timeout: "10 seconds" })
  if (shallow.exitCode !== 0 || shallow.truncated || !["true", "false"].includes(shallow.text().trim()))
    return yield* denied(new Research.Error({ code: "publication_uncertain", message: "Historical repository coverage is unavailable" }))
  const changed = input.operation === "compare" && base ? yield* changedFiles(services, exec, base, revision, relatives) : relatives
  if (input.operation === "compare") yield* gate(services, context, root, changed)
  // An empty changed set keeps the requested pathspecs: an empty pathspec would widen the query to the whole tree.
  const literal = (changed.length > 0 ? changed : relatives).map((relative) => `:(literal)${relative}`)
  const limit = input.operation === "log" || input.operation === "search" ? input.limit ?? 20 : 0
  const result = yield* services.git.run(
    input.operation === "resolve" ? ["rev-parse", "--verify", "--end-of-options", `${revision}^{commit}`]
      : input.operation === "log"
      ? ["-c", "log.showSignature=false", "--no-pager", "log", "--format=%H", `--max-count=${limit + 1}`, revision, "--", ...literal]
      : input.operation === "show" ? ["--no-pager", "show", "--no-ext-diff", "--no-textconv", `${revision}:${relatives[0]}`]
      : input.operation === "diff" ? ["--no-pager", "diff", "--no-ext-diff", "--no-textconv", "--no-color", "--unified=3", base ?? input.base, revision, "--", ...literal]
      : input.operation === "blame" ? ["--no-pager", "blame", "--porcelain", "--no-progress",
        ...(input.start !== undefined || input.end !== undefined ? [`-L${input.start ?? 1},${input.end ?? ""}`] : []), revision, "--", relatives[0]]
      : input.operation === "compare" ? ["--no-pager", "diff", "--no-ext-diff", "--no-textconv", "--no-color", "--no-renames",
        ...(input.stat ? ["--numstat", "-z"] : ["--unified=3"]), base ?? input.base, revision, "--", ...literal]
      : ["-c", "log.showSignature=false", "--no-pager", "log", "--format=%H%x00%at%x00%s", `--max-count=${limit + 1}`,
        ...(input.message === undefined ? [] : ["--fixed-strings", "--regexp-ignore-case", `--grep=${input.message}`]), revision, "--", ...literal],
    { ...exec, maxOutputBytes: Research.Limits.sourceBytes, timeout: "30 seconds" },
  )
  if (result.exitCode !== 0)
    return yield* denied(new Research.Error({ code: "source_unavailable", message: "Historical query failed; no empty successful source was admitted" }))
  const where = origin(input.operation, revision)
  const received = yield* retain({ origin: where, representation: "received", mediaType: "text/plain", content: result.stdout, complete: !result.truncated })
  // A byte-bounded capture may stop inside a record or a UTF-8 scalar; project only whole records.
  const whole = result.truncated
    ? result.stdout.subarray(0, result.stdout.lastIndexOf(input.operation === "compare" && input.stat ? 0 : 10) + 1)
    : result.stdout
  const text = yield* Effect.try({
    try: () => new TextDecoder("utf-8", { fatal: true }).decode(whole),
    catch: () => new Tool.Failure({ message: "Research denied: unsupported: Historical output is not lossless UTF-8 text" }),
  })
  const projection = project(input, text, limit)
  if (!projection)
    return yield* denied(new Research.Error({ code: "publication_uncertain", message: "Historical commit projection is malformed" }))
  const complete = !result.truncated && (["compare", "diff", "show", "resolve"].includes(input.operation)
    || (shallow.text().trim() === "false" && projection.count <= limit))
  const content = JSON.stringify({
    operation: input.operation, ...(input.operation === "compare" ? { paths: relatives, files: changed, stat: input.stat === true }
      : relatives.length > 0 ? { path: relatives[0] } : {}),
    revision, ...(base ? { base } : {}), ...(input.operation === "search" && input.message !== undefined ? { message: input.message } : {}),
    complete, ...projection.fields,
    scope: "committed-history-only", shallow: shallow.text().trim() === "true", dirtyWorkingTreeObserved: false,
  })
  const receipt = yield* retain({ origin: where, representation: "structured-json", mediaType: "application/json", content, complete,
    derivedFrom: received.ref, transformation: "native-git-history-v1" })
  // The output is the projection itself, so the seat sees the commits or lines it retained without a research_view.
  return { receipt, content }
})

// Every worktree path a history query names or projects passes the read gates a file capture passes; none names the root.
const gate = Effect.fn("MaestroResearchTools.gate")(function* (services: Services, context: Tool.Context, root: string, relatives: string[]) {
  const source = { type: "tool" as const, messageID: context.assistantMessageID, callID: context.toolCallID }
  const targets = yield* Effect.forEach(relatives.length > 0 ? relatives : ["."], (relative) =>
    services.mutation.resolve({ path: path.join(root, relative), kind: "directory" }).pipe(
      Effect.mapError(() => new Tool.Failure({ message: `Unable to read ${relative}` })),
    ),
  )
  yield* Effect.forEach(
    targets.flatMap((target) => (target.externalDirectory ? [target.externalDirectory] : [])),
    (external) =>
      services.permission
        .assert({ ...LocationMutation.externalDirectoryPermission(external), sessionID: context.sessionID, agent: context.agent, source })
        .pipe(Effect.mapError((error) => new Tool.Failure({ message: "Historical path was not permitted", error }))),
    { discard: true },
  )
  yield* services.permission
    .assert({
      action: "read",
      resources: targets.map((target) => target.resource),
      save: ["*"],
      sessionID: context.sessionID,
      agent: context.agent,
      source,
    })
    .pipe(Effect.mapError((error) => new Tool.Failure({ message: "Historical path was not permitted", error })))
})

/**
 * The caller environment without GIT_*, NODE_OPTIONS or NODE_PATH, and with no global or system config, prompt or
 * optional lock (J2.14, as modules/maestro/arsenal/src/engine/process.ts).
 */
export function environment(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return {
    ...Object.fromEntries(Object.entries(source).filter((entry): entry is [string, string] => entry[1] !== undefined &&
      !entry[0].toUpperCase().startsWith("GIT_") && !["NODE_OPTIONS", "NODE_PATH"].includes(entry[0].toUpperCase()))),
    GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0",
  }
}

// Porcelain v2 -z: NUL-terminated headers and entries; a rename entry ("2") is followed by its original path.
function porcelain(text: string) {
  const tokens = text.split("\0")
  if (tokens.pop() !== "") return
  const state = { branch: null as string | null, skip: false, malformed: false }
  const dirty = tokens.flatMap((token) => {
    if (state.skip) {
      state.skip = false
      return []
    }
    if (token.startsWith("# ")) {
      const head = /^# branch\.head (.+)$/.exec(token)
      if (head) state.branch = head[1] === "(detached)" ? null : head[1]
      return []
    }
    const entry = /^(?:1 (\S\S)(?: \S+){6}|2 (\S\S)(?: \S+){7}|u (\S\S)(?: \S+){8}|(\?)) (.+)$/s.exec(token)
    if (!entry) {
      state.malformed = true
      return []
    }
    if (token.startsWith("2 ")) state.skip = true
    return [{ path: entry[5], status: entry[1] ?? entry[2] ?? entry[3] ?? "??" }]
  })
  if (state.malformed || state.skip) return
  return { branch: state.branch, dirty }
}

const changedFiles = Effect.fn("MaestroResearchTools.changedFiles")(function* (
  services: Services,
  exec: GitCli.Options,
  base: string,
  revision: string,
  relatives: string[],
) {
  const names = yield* services.git.run(
    ["--no-pager", "diff", "--no-ext-diff", "--no-renames", "--name-only", "-z", base, revision, "--",
      ...relatives.map((relative) => `:(literal)${relative}`)],
    { ...exec, maxOutputBytes: 1024 * 1024, timeout: "30 seconds" },
  )
  if (names.exitCode !== 0 || names.truncated)
    return yield* denied(new Research.Error({ code: "source_unavailable", message: "Historical range file set is unavailable" }))
  const files = names.text().split("\0").filter(Boolean)
  if (files.length > COMPARE_FILE_LIMIT)
    return yield* denied(new Research.Error({ code: "over_cap", message: `Range diff touches ${files.length} files; narrow the path set to at most ${COMPARE_FILE_LIMIT}` }))
  return files
})

function project(input: Research.HistoryInput, text: string, limit: number) {
  if (input.operation === "resolve") {
    const commit = text.trim()
    if (!FULL_HASH.test(commit)) return
    return { count: 0, fields: { ref: input.ref, commit } }
  }
  if (input.operation === "log") {
    const commits = text.split(/\r?\n/).filter(Boolean)
    if (commits.some((commit) => !FULL_HASH.test(commit))) return
    return { count: commits.length, fields: { commits: commits.slice(0, limit), limit } }
  }
  if (input.operation === "search") {
    const commits = text.split("\n").filter(Boolean).map((line) => line.split("\0"))
    if (commits.some((fields) => fields.length !== 3 || !FULL_HASH.test(fields[0]) || !/^\d+$/.test(fields[1]))) return
    return { count: commits.length, fields: { limit, commits: commits.slice(0, limit)
      .map((fields) => ({ commit: fields[0], authorTime: Number(fields[1]), summary: fields[2] })) } }
  }
  if (input.operation === "blame") return blame(text)
  if (input.operation === "compare" && input.stat) {
    const rows = text.split("\0").filter(Boolean).map((row) => row.split("\t"))
    if (rows.some((row) => row.length !== 3)) return
    return { count: 0, fields: { files: rows.map((row) => ({ path: row[2], added: row[0] === "-" ? null : Number(row[0]), deleted: row[1] === "-" ? null : Number(row[1]) })) } }
  }
  return { count: 0, fields: { text } }
}

// Porcelain prints commit details once per commit, then every line as a header followed by its tab-prefixed content.
function blame(text: string) {
  const commits = new Map<string, { authorTime?: number; summary?: string }>()
  const state = { current: undefined as { commit: string; line: number } | undefined, malformed: false }
  const lines = text.split("\n").flatMap((row) => {
    const header = /^([0-9a-f]{40}|[0-9a-f]{64}) \d+ (\d+)(?: \d+)?$/.exec(row)
    if (header) {
      state.current = { commit: header[1], line: Number(header[2]) }
      if (!commits.has(header[1])) commits.set(header[1], {})
      return []
    }
    if (!state.current) {
      state.malformed = state.malformed || row !== ""
      return []
    }
    const details = commits.get(state.current.commit)
    if (row.startsWith("author-time ") && details) details.authorTime = Number(row.slice(12))
    if (row.startsWith("summary ") && details) details.summary = row.slice(8)
    if (!row.startsWith("\t")) return []
    const entry = { ...state.current, content: row.slice(1) }
    state.current = undefined
    return [entry]
  })
  if (state.malformed) return
  return { count: 0, fields: { lines: lines.map((entry) => ({ line: entry.line, commit: entry.commit,
    authorTime: commits.get(entry.commit)?.authorTime, summary: commits.get(entry.commit)?.summary, content: entry.content })) } }
}

function denied(error: Research.Error) {
  return Effect.fail(new Tool.Failure({ message: `Research denied: ${error.code}: ${error.message}` }))
}

/** Where line 1 of a retained representation sits in its original file (J5.3). */
function basis(receipt: Research.SourceReceipt) {
  if (receipt.observed?.lineStart !== undefined) return { basis: "original" as const, start: receipt.observed.lineStart }
  return { basis: (receipt.observed?.byteStart ?? 0) === 0 ? ("original" as const) : ("retained" as const), start: 1 }
}

/**
 * A document's qualifying findings (V1 `ResearchQualifications.collect`): this Task's own exact finding admissions,
 * never a project-wide explicit-ID reuse, bounded to what fits the reply.
 */
export const qualify = Effect.fn("MaestroResearchTools.qualify")(function* (
  services: Pick<Services, "records" | "database">,
  binding: Research.Binding,
  refs: readonly Research.RecordRef[],
) {
  const unique = [...new Map(refs.map((ref) => [`${ref.id}:${ref.revision}`, ref])).values()]
  if (unique.length > 32) return yield* new Research.Error({ code: "over_cap", message: "Qualification references exceed 32 own findings" })
  if (unique.some((ref) => !ref.id.startsWith("rfnd_")))
    return yield* new Research.Error({ code: "reference_invalid", message: "Qualification reference is not a finding" })
  const findings = yield* Effect.forEach(unique, (ref) =>
    Effect.gen(function* () {
      const admitted = (yield* ResearchLedger.entries(binding, ref.id, true).pipe(Effect.provideService(Database.Service, services.database)))
        .find((entry) =>
          entry.type === "research.record.committed" && entry.data.record.kind === "finding" && entry.data.record.id === ref.id &&
          entry.data.record.revision === ref.revision && ResearchLedger.canonical(entry.data.binding) === ResearchLedger.canonical(binding))
      if (!admitted || admitted.type !== "research.record.committed")
        return yield* new Research.Error({ code: "reference_invalid", message: "Qualification finding is not admitted by this Task" })
      const value = yield* services.records.view(binding, { action: "record", ref })
      if (!("kind" in value) || value.kind !== "finding" || ResearchLedger.canonical(value) !== ResearchLedger.canonical(admitted.data.record))
        return yield* new Research.Error({ code: "reference_invalid", message: "Qualification view differs from own finding admission" })
      return value
    }),
  )
  // Include the document reply's nesting/indentation; reserve 1 KiB for host framing.
  return findings.reduce<{ records: typeof findings; complete: boolean; total: number; omitted: number }>(
    (summary, finding) => {
      const candidate = {
        records: [...summary.records, finding],
        complete: summary.records.length + 1 === unique.length,
        total: unique.length,
        omitted: unique.length - summary.records.length - 1,
      }
      return Buffer.byteLength(JSON.stringify({ qualifications: candidate }, null, 2), "utf8") <= 15 * 1024 ? candidate : summary
    },
    { records: [], complete: unique.length === 0, total: unique.length, omitted: unique.length },
  )
})
