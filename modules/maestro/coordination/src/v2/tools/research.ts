export * as MaestroResearchTools from "./research"

import path from "node:path"
import { Effect, Schema } from "effect"
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
import { CodeIndex } from "@orchestra/core/research-toolkit/code-index/types"
import { Locate } from "@orchestra/core/research-toolkit/locate"
import { ProbeRun } from "@orchestra/core/research-toolkit/probe/run"
import { Probe } from "@orchestra/core/research-toolkit/probe/types"
import { CodeSearch } from "@orchestra/core/research-toolkit/search"
import { SessionHistory } from "@orchestra/core/session"
import { AbsolutePath } from "@orchestra/core/schema"
import { Tool } from "@orchestra/core/tool/tool"
import type { HttpClient } from "effect/unstable/http"
import { ReadToolFileSystem } from "@orchestra/core/tool/read-filesystem"
import { HttpRedirect } from "@orchestra/core/tool/http-redirect"
import { WebFetchTool } from "@orchestra/core/tool/webfetch"
import { Ripgrep } from "@orchestra/core/ripgrep"
import { Research } from "@orchestra/schema/research"
import { ResearchDispatchV2 } from "../governance/research"
import type { MaestroToolGate } from "./gate"
import { ResearchInquiry } from "./inquiry"
import {
  captureDescription,
  inquiryDescription,
  locateDescription,
  probeDescription,
  queryDescription,
  recordDescription,
  searchDescription,
  viewDescription,
} from "./research-descriptions"
import { denied } from "./research-denied"
import { history } from "./research-history"
import { basis, CONTEXT_CALLERS, CONTEXT_IMPORTS, enclosing, head, index, RANGE_LINES, scoped, section, SHOWN_LINES } from "./research-index"
import { inquire } from "./research-inquire"

export {
  captureDescription,
  inquiryDescription,
  locateDescription,
  probeDescription,
  queryDescription,
  recordDescription,
  searchDescription,
  viewDescription,
} from "./research-descriptions"
export { environment } from "./research-history"
export { caps, warm } from "./research-index"

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
    return { binding: admitted.allowance.binding, allowance: admitted.allowance, domains: admitted.domains, elapsed: admitted.elapsed }
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
          // The earlier runtime charges each retained representation under its own call before it admits the bytes.
          const retain = (capture: ResearchRecords.CaptureInput) =>
            services.allowances
              .reserveBytes(
                research.allowance,
                `bytes:${context.assistantMessageID}:${context.toolCallID}:${capture.representation}`,
                typeof capture.content === "string" ? Buffer.byteLength(capture.content, "utf8") : capture.content.byteLength,
              )
              .pipe(Effect.andThen(services.records.capture(research.binding, context, capture)), Effect.catch(denied))
          // Read dedup (the earlier runtime's `compact`): bytes already retained in this dispatch come back as their ref alone, and a
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
            const assert = (url: string) =>
              services.permission.assert({ action: WebFetchTool.name, resources: [url], save: ["*"], sessionID: context.sessionID, agent: context.agent, source })
            yield* assert(input.url).pipe(
              Effect.mapError((error) => new Tool.Failure({ message: `Unable to fetch ${input.url}`, error })),
            )
            // A redirect to another origin asks the same permission again; a refused one names its target.
            const fetched = yield* WebFetchTool.fetch(services.http, input.url, input.format, undefined, (url) => assert(url.href)).pipe(
              Effect.mapError((error) =>
                new Tool.Failure({ message: HttpRedirect.isRefusal(error) ? error.message : `Unable to fetch ${input.url}` })),
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
          // Bounded as the earlier runtime's read page: at most its lines and bytes.
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
          // The earlier runtime's `shown`: an earlier completed call with the same input whose output is still in this Session's context
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
            return page({ ...result, lines: lineBasis(result.receipt) })
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
          const origin = lineBasis(state.receipt)
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
          // The earlier runtime's `ResearchExecution.probe`: the dispatch's probe seconds bound the run, and whole seconds are charged after it.
          const limit = allowance.probeSecondsLimit
          const used = (yield* ResearchLedger.dispatch(allowance).pipe(Effect.provideService(Database.Service, services.database), Effect.catch(denied))).reduce(
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

/** Where line 1 of a retained representation sits in its original file (J5.3). */
function lineBasis(receipt: Research.SourceReceipt) {
  if (receipt.observed?.lineStart !== undefined) return { basis: "original" as const, start: receipt.observed.lineStart }
  return { basis: (receipt.observed?.byteStart ?? 0) === 0 ? ("original" as const) : ("retained" as const), start: 1 }
}

/**
 * A document's qualifying findings (the earlier runtime's `ResearchQualifications.collect`): this Task's own exact finding admissions,
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
