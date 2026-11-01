import { Effect } from "effect"
import { ResearchLedger } from "@orchestra/core/research/ledger"
import { Liveness } from "@orchestra/core/research-toolkit/liveness"
import { SessionHistory } from "@orchestra/core/session"
import { Tool } from "@orchestra/core/tool/tool"
import { Research } from "@orchestra/schema/research"
import { ResearchInquiry } from "./inquiry"
import type { InquiryCheck } from "./inquiry-check"
import type { Services } from "./research"

/**
 * The seat's investigation (J5.4): every action writes the existing records or
 * an inquiry event, then answers with the compact state, so the model keeps ids instead of rereading.
 */
export const inquire = Effect.fn("MaestroResearchTools.inquire")(function* (
  services: Services,
  research: {
    readonly binding: Research.Binding
    readonly allowance: Research.Allowance
    readonly domains: readonly string[] | undefined
    readonly elapsed: number
  },
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
      const card = ResearchInquiry.card(final, {
        allowance,
        close: input,
        outcome: settled,
        domains: research.domains,
        documents,
        elapsed: research.elapsed,
      })
      yield* records.inquire(allowance, context, { type: "research.inquiry.closed", card })
      return { closed: input.sufficiency, check: settled.result.verdict }
    }
    return { phase: state.phase, check: state.check ?? null }
  })
  const after = ResearchInquiry.fold(yield* load())
  return {
    title: `Inquiry ${input.action}`,
    output: `${JSON.stringify(reply)}\n${ResearchInquiry.snapshot(after, allowance, research.elapsed)}`,
    research: { inquiry: reply },
  }
})
