export * as MaestroResearchTools from "./research"

import { Effect, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import { FSUtil } from "@orchestra/core/fs-util"
import { LocationMutation } from "@orchestra/core/location-mutation"
import type { PermissionV2 } from "@orchestra/core/permission"
import { ResearchLedger } from "@orchestra/core/research/ledger"
import type { ResearchRecords } from "@orchestra/core/research/records"
import { ResearchSeatTools } from "@orchestra/core/research/seat-tools"
import { Liveness } from "@orchestra/core/research-toolkit/liveness"
import { SessionHistory } from "@orchestra/core/session"
import { AbsolutePath } from "@orchestra/core/schema"
import { Tool } from "@orchestra/core/tool/tool"
import { ReadToolFileSystem } from "@orchestra/core/tool/read-filesystem"
import { Research } from "@orchestra/schema/research"
import { ResearchDispatchV2 } from "../governance/research"
import type { MaestroToolGate } from "./gate"
import { ResearchInquiry } from "./inquiry"
import type { InquiryCheck } from "./inquiry-check"

// V1's research seat tools (`apps/orchestra/src/tool/research-*.ts`) on V2. Each call is the research seat's own, under
// its dispatch allowance and its retained logical-task binding (V1's `ResearchTools.run`); the runner's invocation frame
// is what core `ResearchRecords` checks before it writes. `v2/seats.ts` hides these tools from every other agent.

export const names = { capture: "research_capture", view: "research_view", record: "research_record", inquiry: "inquiry" } as const

export const Output = Schema.Struct({ title: Schema.String, output: Schema.String, research: Schema.optional(Schema.Unknown) })

export type Services = ResearchDispatchV2.Services & {
  readonly records: ResearchRecords.Interface
  readonly permission: PermissionV2.Interface
  readonly mutation: LocationMutation.Interface
  readonly reader: ReadToolFileSystem.Interface
  readonly database: Database.Interface
  readonly gate: MaestroToolGate.Gate
  readonly fs: FSUtil.Interface
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
  }
}

/**
 * The seat's investigation (V1 `apps/orchestra/src/tool/inquiry.ts`, J5.4): every action writes the existing records or
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
