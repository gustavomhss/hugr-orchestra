import { Context, Effect, Option } from "effect"
import { isDeepStrictEqual } from "node:util"
import { Research } from "@orchestra/schema/research"
import { Database } from "@orchestra/core/database/database"
import { FSUtil } from "@orchestra/core/fs-util"
import { ResearchLedger } from "@orchestra/core/research/ledger"
import { ResearchRecords } from "@orchestra/core/research/records"
import { Liveness } from "@orchestra/core/research-toolkit/liveness"
import { AllowedDomains } from "@orchestra/core/tool/websearch"
import { MessageV2 } from "@/session/message-v2"
import { ResearchExecution } from "@/research/allowance"
import { ResearchTools } from "@/research/binding"
import { ResearchInquiry } from "@/research/inquiry"
import { Tool } from "./tool"
import { ToolJsonSchema } from "./json-schema"
import DESCRIPTION from "./inquiry.txt"

type Input = Research.InquiryInput

/** URL liveness for R10 (J5.9): a plain HEAD/GET from the host. Read per call, so a test can bind a fake network policy. */
export const Links = Context.Reference<typeof Liveness.check>("@orchestra/Inquiry/Links", { defaultValue: () => Liveness.check })

// The seat's investigation (J5.4): every action writes the existing records or an inquiry event, then answers with the
// compact state, so the model keeps ids instead of rereading.
export const InquiryTool = Tool.define("inquiry", Effect.gen(function* () {
  const records = yield* ResearchRecords.Service
  const database = yield* Database.Service
  const fs = yield* Effect.serviceOption(FSUtil.Service)
  const run = yield* ResearchTools.make
  return {
    description: DESCRIPTION,
    parameters: Research.InquiryInput,
    jsonSchema: ToolJsonSchema.fromSchema(Research.InquiryInput),
    execute: (input: Input, ctx: Tool.Context) => run(ctx, "inquiry", (binding, context) => Effect.gen(function* () {
      const frame = yield* ResearchExecution.Current
      if (!frame || !isDeepStrictEqual(frame.allowance.binding, binding))
        return yield* new Research.Error({ code: "binding_missing", message: "inquiry requires its native research dispatch" })
      const allowance = frame.allowance
      const load = () => records.dispatch(allowance)
      const steps = yield* load()
      const state = ResearchInquiry.fold(steps)
      const refuse = (message: string) => new Research.Error({ code: "inquiry_state", message })
      if (state.phase === "closed") return yield* refuse("inquiry closed")
      if (state.phase === "none" && input.action !== "open" && input.action !== "status")
        return yield* refuse("open the inquiry first: inquiry open with the question and its subquestions")
      const write = (record: Research.RecordInput, slot: string) => records.record(binding, context, record, slot).pipe(
        Effect.flatMap((mutation) => mutation.record ? Effect.succeed({ id: mutation.record.id, revision: mutation.record.revision })
          : Effect.fail(new Research.Error({ code: "publication_uncertain", message: "Inquiry record was not retained" }))))
      const relate = (from: Research.RecordRef, to: Research.RecordRef, relation: "depends-on" | "related" | "answers" | "supports" | "refutes",
        reason: string, slot: string) => write({ action: "relation", from, to, relation, reason }, slot)
      // The check's dependencies beyond the ledger: the record verifier and retained bytes (records), the domain list,
      // the Session's code searches for R5/R6, URL liveness, and real paths so a symlinked citation resolves like read.
      const deps = Effect.gen(function* () {
        const messages = yield* MessageV2.stream(ctx.sessionID).pipe(Effect.provideService(Database.Service, database), Effect.orElseSucceed(() => []))
        return { records, binding, domains: yield* AllowedDomains, searches: ResearchInquiry.searches(messages), links: yield* Links,
          ...(Option.isSome(fs) ? { real: (target: string) => fs.value.resolve(target).pipe(Effect.catchDefect(() => Effect.succeed(target))) } : {}) }
      })
      const subquestion = (ref: Research.RecordRef) => {
        const found = state.subquestions.find((sub) => sub.ref.id === ref.id)
        return found ? Effect.succeed(found) : Effect.fail(refuse(`${ref.id} is not a subquestion of this inquiry`))
      }
      const reply: unknown = yield* Effect.gen(function* () {
        if (input.action === "open") {
          // An exact retry replays its writes; a second open of the same dispatch is refused before any write.
          const retry = steps.some((step) => step.type === "research.inquiry.opened" &&
            step.data.operation === ResearchLedger.operation(context, "research.inquiry.opened"))
          if (state.phase !== "none" && !retry) return yield* refuse("the inquiry is already open in this dispatch")
          const selection = { profile: input.profile, depth: allowance.tier, genre: input.genre ?? "answer" } as const
          const question = yield* write({ action: "question", question: input.question, selection }, "open:question")
          const subquestions = yield* Effect.forEach(input.subquestions, (text, index) => write({ action: "question", question: text, selection },
            `open:subquestion:${index}`).pipe(Effect.tap((ref) => relate(ref, question, "depends-on", "subquestion", `open:depends:${index}`))))
          yield* records.inquire(allowance, context, { type: "research.inquiry.opened", question, subquestions })
          return { question, subquestions }
        }
        if (input.action === "hypothesize") {
          const sub = yield* subquestion(input.subquestion)
          const hypothesis = yield* write({ action: "finding", proposition: input.proposition, nature: "hypothesis",
            conditions: [], evidence: [], contrary: [] }, "hypothesis")
          yield* relate(hypothesis, sub.ref, "related", "hypothesis", "hypothesis:link")
          return { hypothesis }
        }
        if (input.action === "claim") {
          const sub = yield* subquestion(input.subquestion)
          const claim = yield* write({ action: "finding", proposition: input.proposition, nature: input.nature,
            conditions: [...(input.conditions ?? []), ...(input.scope ? [`scope:${input.scope}`] : [])],
            evidence: input.evidence.map(ResearchInquiry.evidence), contrary: (input.contrary ?? []).map(ResearchInquiry.evidence) }, "claim")
          yield* relate(claim, sub.ref, "answers", "claim", "claim:link")
          return { claim }
        }
        if (input.action === "resolve") {
          const hypothesis = state.hypotheses.find((item) => item.ref.id === input.hypothesis.id)
          if (!hypothesis || hypothesis.status !== "open") return yield* refuse(`${input.hypothesis.id} is not an open hypothesis of this inquiry`)
          if (!input.evidence.length) return yield* refuse("resolve needs evidence: cite the source or probe that decides it")
          const decision = yield* write({ action: "finding", proposition: `${input.status}: ${hypothesis.proposition}`.slice(0, 8192),
            nature: "observation", conditions: [], evidence: input.evidence.map(ResearchInquiry.evidence), contrary: [] }, "resolve")
          yield* relate(decision, hypothesis.ref, input.status === "confirmed" ? "supports" : "refutes", input.status, "resolve:link")
          return { hypothesis: hypothesis.ref, status: input.status, decision }
        }
        if (input.action === "drop") {
          const known = [...state.subquestions, ...state.hypotheses, ...state.claims].find((item) => item.ref.id === input.ref.id)
          if (!known || !state.question) return yield* refuse(`${input.ref.id} is not a subquestion, hypothesis or claim of this inquiry`)
          yield* relate(known.ref, { id: state.question.id, revision: state.question.revision }, "related",
            `drop: ${input.reason}`.slice(0, 4096), "drop")
          return { dropped: known.ref }
        }
        if (input.action === "check") {
          const check = (yield* ResearchInquiry.check(state, undefined, yield* deps)).result
          yield* records.inquire(allowance, context, { type: "research.inquiry.checked", check })
          return { check }
        }
        if (input.action === "close") {
          const refusal = ResearchInquiry.refusal(state, input.sufficiency)
          if (refusal) return yield* refuse(refusal)
          // The close re-runs the check on the final state; its failures become the card's limitations short of answered.
          const outcome = yield* ResearchInquiry.check(state, input, yield* deps)
          if (input.sufficiency === "answered" && outcome.result.verdict !== "pass")
            return yield* refuse(`the closing check failed: ${outcome.result.issues.slice(0, 16).map((issue) =>
              `${issue.rule}${issue.citation ? ` ${issue.citation}` : ""} ${issue.reason}`).join("; ")}`)
          const corpus = yield* records.view(binding, { action: "corpus" })
          const documents = "documents" in corpus ? corpus.documents.map((document) => document.ref) : []
          const card = ResearchInquiry.card(state, { allowance, close: input, outcome, domains: yield* AllowedDomains, documents })
          yield* records.inquire(allowance, context, { type: "research.inquiry.closed", card })
          return { closed: input.sufficiency, check: outcome.result.verdict }
        }
        return { phase: state.phase, check: state.check ?? null }
      })
      const after = ResearchInquiry.fold(yield* load())
      return { title: `Inquiry ${input.action}`, output: `${JSON.stringify(reply)}\n${ResearchInquiry.snapshot(after, allowance)}`,
        metadata: { inquiry: reply } }
    })).pipe(Effect.orDie),
  }
}))
