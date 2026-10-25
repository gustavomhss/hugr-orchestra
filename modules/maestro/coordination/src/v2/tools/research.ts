export * as MaestroResearchTools from "./research"

import { Effect, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import { LocationMutation } from "@orchestra/core/location-mutation"
import type { PermissionV2 } from "@orchestra/core/permission"
import { ResearchBinding } from "@orchestra/core/research/binding"
import { ResearchLedger } from "@orchestra/core/research/ledger"
import type { ResearchRecords } from "@orchestra/core/research/records"
import { ResearchSeatTools } from "@orchestra/core/research/seat-tools"
import { AbsolutePath } from "@orchestra/core/schema"
import { Tool } from "@orchestra/core/tool/tool"
import { ReadToolFileSystem } from "@orchestra/core/tool/read-filesystem"
import { Research } from "@orchestra/schema/research"
import { ResearchDispatchV2 } from "../governance/research"
import type { MaestroToolGate } from "./gate"

// V1's research seat tools (`apps/orchestra/src/tool/research-*.ts`) on V2. Each call is the research seat's own, under
// its dispatch allowance and its retained logical-task binding (V1's `ResearchTools.run`); the runner's invocation frame
// is what core `ResearchRecords` checks before it writes. `v2/seats.ts` hides these tools from every other agent.

export const names = { capture: "research_capture", view: "research_view", record: "research_record" } as const

export const Output = Schema.Struct({ title: Schema.String, output: Schema.String, research: Schema.optional(Schema.Unknown) })

export type Services = ResearchDispatchV2.Services & {
  readonly records: ResearchRecords.Interface
  readonly permission: PermissionV2.Interface
  readonly mutation: LocationMutation.Interface
  readonly reader: ReadToolFileSystem.Interface
  readonly database: Database.Interface
  readonly gate: MaestroToolGate.Gate
}

export const captureDescription = [
  "Capture permitted file evidence in the bound worktree (kind \"file\").",
  "Line numbers are always original-file lines, 1-based and inclusive: start/end select them, and a file capture returns lines {basis:\"original\", start, end}.",
  "A new capture returns its receipt (cite its ref) on the first line, then the captured text, so do not read the same span again. A capture whose bytes are already retained in this dispatch returns {ref, unchanged:true} and nothing else; a changed span returns the new capture with changed:true and the previous ref.",
  "Receipts mark partial captures. Use research_view for retained bytes; no owner, digest, body or storage path accepted as authority.",
].join(" ")

export const viewDescription = [
  "Reopen retained research: corpus lists bounded admitted source/record/document handles; attempts pages actual acquisition outcomes;",
  "records/source/document reopen exact revisions; find searches literal text in one admitted representation and gives each match its line.",
  "Use returned handles/revisions/cursors, never filesystem paths or guessed owner/root fields. Bounded pages and partial captures remain explicit.",
  "Line numbers are original-file lines, 1-based and inclusive (lines.basis \"original\"); basis \"retained\" means the source has no original line origin.",
  "Historical records do not prove present applicability.",
].join(" ")

export const recordDescription =
  "Retain a research question, evidenced finding, justified relation or cohesive Markdown document. Supply authored fields and exact admitted references only. Updates require id/baseRevision and findings require a material revision reason. Documents use citations mapped to EvidenceRef and Markdown links research:<label>. Returned IDs/receipts are host facts. Product files, approval and shared Knowledge are not edited. Simple source answers need not create a dossier."

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
    const binding = yield* ResearchBinding.resolve(session.id, session.projectID).pipe(
      Effect.provideService(Database.Service, services.database),
      Effect.catch(denied),
    )
    if (binding.directory !== services.location.directory)
      return yield* denied(new Research.Error({ code: "binding_mismatch", message: "Research execution directory does not match its binding" }))
    return { binding, allowance: admitted.allowance }
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
          // V1 also captured URLs through webfetch and Git history; neither acquisition is on V2 yet.
          if (input.kind !== "file")
            return yield* denied(new Research.Error({ code: "unsupported", message: `research_capture kind "${input.kind}" is not available on this host` }))
          const start = input.start ?? 1
          if (input.end !== undefined && input.end < start)
            return yield* denied(new Research.Error({ code: "reference_invalid", message: "File capture range does not exist" }))
          const source = { type: "tool" as const, messageID: context.assistantMessageID, callID: context.toolCallID }
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
          const before = yield* services.records.view(research.binding, { action: "corpus" }).pipe(Effect.catch(denied))
          yield* services.allowances
            .reserveBytes(research.allowance, `bytes:${context.assistantMessageID}:${context.toolCallID}:text`, Buffer.byteLength(content, "utf8"))
            .pipe(Effect.catch(denied))
          const receipt = yield* services.records
            .capture(research.binding, context, {
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
            .pipe(Effect.catch(denied))
          const span = { basis: "original" as const, start, end }
          // Read dedup (V1 `compact`): equal bytes of the same file come back as their ref alone.
          const sources = "sources" in before ? before.sources : []
          const same = (entry: Research.SourceReceipt) =>
            entry.origin.kind === receipt.origin.kind && entry.origin.uri === receipt.origin.uri && entry.ref.representation === receipt.ref.representation
          const retained = sources.find((entry) => same(entry) && entry.ref.digest === receipt.ref.digest)
          if (retained)
            return {
              title: "Research source captured",
              output: JSON.stringify({
                ref: retained.ref,
                unchanged: true,
                summary: `${receipt.origin.uri} lines ${start}-${end} is already retained in this dispatch with the same digest; reopen it with research_view only if it left your context`,
              }),
              research: receipt,
            }
          const previous = sources.find((entry) =>
            same(entry) && entry.observed?.lineStart === receipt.observed?.lineStart && entry.observed?.lineEnd === receipt.observed?.lineEnd)
          return {
            title: "Research source captured",
            output: `${JSON.stringify({ ...receipt, lines: span, ...(previous ? { changed: true, previous: previous.ref } : {}) })}\n\n${content}`,
            research: receipt,
          }
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
          const result = yield* services.records.view(research.binding, input).pipe(Effect.catch(denied))
          const page = (value: unknown) => ({ title: `Research ${input.action}`, output: JSON.stringify(value), research: value })
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
  }
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
const qualify = Effect.fn("MaestroResearchTools.qualify")(function* (
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
