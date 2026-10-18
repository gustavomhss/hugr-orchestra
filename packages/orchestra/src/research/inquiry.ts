export * as ResearchInquiry from "./inquiry"

// The dispatch's investigation (J5.1-J5.2): a fold over the records and inquiry events its ledger already holds. Nothing
// here keeps state of its own, so the inquiry, the closed state and the per-turn snapshot survive compaction and restarts.
import { Effect } from "effect"
import { Research } from "@orchestra/schema/research"
import { ResearchLedger } from "@orchestra/core/research/ledger"
import { ResearchExecution } from "./allowance"

export type Phase = "none" | "open" | "investigating" | "checked" | "closed"
export type Subquestion = { readonly ref: Research.RecordRef; readonly question: string; claims: Research.RecordRef[]; gap?: string }
export type Hypothesis = {
  readonly ref: Research.RecordRef; readonly proposition: string; readonly subquestion: string
  status: "open" | "confirmed" | "refuted" | "dropped"; evidence: Research.EvidenceRef[]; reason?: string
}
export type Claim = {
  readonly ref: Research.RecordRef; readonly proposition: string; readonly nature: string; readonly subquestion: string
  readonly evidence: readonly Research.EvidenceRef[]; readonly contrary: readonly Research.EvidenceRef[]
  readonly conditions: readonly string[]; dropped?: string
}
export type State = {
  phase: Phase
  question?: Research.QuestionRecord
  subquestions: Subquestion[]
  hypotheses: Hypothesis[]
  claims: Claim[]
  /** The last check, and whether a write since then invalidated it (J5.2). */
  check?: Research.CheckResult
  stale: boolean
  card?: Research.CardV2
  sources: Research.SourceReceipt[]
  used: { provider: number; tool: number; bytes: number }
  searches: number
}

// Tool ids whose calls count as searches on the card, on the loop and in Claude mode.
const SEARCHES = new Set(["grep", "glob", "Grep", "Glob", "code_search", "code_locate", "code_query"])

export function fold(steps: readonly ResearchLedger.Step[]): State {
  const records = new Map<string, Research.Record>()
  const state: State = { phase: "none", subquestions: [], hypotheses: [], claims: [], stale: false, sources: [],
    used: { provider: 0, tool: 0, bytes: 0 }, searches: 0 }
  steps.forEach((step) => {
    if (step.type === "research.source.admitted") state.sources.push(step.data.receipt)
    if (step.type === "research.allowance.charged") {
      state.used[step.data.kind] += step.data.amount
      if (step.data.kind === "tool" && SEARCHES.has(step.data.operation.split(":").at(-1) ?? "")) state.searches++
    }
    if (step.type === "research.inquiry.opened") {
      const question = records.get(step.data.question.id)
      state.phase = "open"
      state.question = question?.kind === "question" ? question : undefined
      state.subquestions = step.data.subquestions.map((ref) => {
        const record = records.get(ref.id)
        return { ref, question: record?.kind === "question" ? record.question : "", claims: [] }
      })
    }
    if (step.type === "research.inquiry.checked") {
      state.phase = "checked"
      state.check = step.data.check
      state.stale = false
    }
    if (step.type === "research.inquiry.closed") {
      state.phase = "closed"
      state.card = step.data.card
    }
    if (step.type !== "research.record.committed") return
    const record = step.data.record
    records.set(record.id, record)
    if (state.phase === "none" || state.phase === "closed") return
    // Any write after the check invalidates it; the inquiry is investigating again.
    if (state.phase === "checked") state.stale = true
    state.phase = "investigating"
    if (record.kind === "relation") link(state, records, record)
  })
  return state
}

function link(state: State, records: Map<string, Research.Record>, relation: Research.RelationRecord) {
  const from = records.get(relation.from.id)
  const sub = state.subquestions.find((item) => item.ref.id === relation.to.id)
  const hypothesis = state.hypotheses.find((item) => item.ref.id === relation.to.id)
  // A drop points at the main question: it abandons a hypothesis or claim, or declares a subquestion's gap.
  if (relation.relation === "related" && relation.to.id === state.question?.id) {
    const reason = relation.reason.replace(/^drop: /, "")
    const dropped = state.subquestions.find((item) => item.ref.id === relation.from.id)
    if (dropped) dropped.gap = reason
    state.hypotheses.filter((item) => item.ref.id === relation.from.id).forEach((item) => {
      item.status = "dropped"
      item.reason = reason
    })
    state.claims.filter((item) => item.ref.id === relation.from.id).forEach((item) => { item.dropped = reason })
    return
  }
  if (from?.kind !== "finding") return
  if (sub && relation.relation === "answers" && from.nature !== "hypothesis") {
    sub.claims.push(relation.from)
    state.claims.push({ ref: relation.from, proposition: from.proposition, nature: from.nature, subquestion: sub.ref.id,
      evidence: from.evidence, contrary: from.contrary, conditions: from.conditions })
  }
  if (sub && relation.relation === "related" && from.nature === "hypothesis")
    state.hypotheses.push({ ref: relation.from, proposition: from.proposition, subquestion: sub.ref.id, status: "open", evidence: [] })
  if (hypothesis && (relation.relation === "supports" || relation.relation === "refutes")) {
    hypothesis.status = relation.relation === "supports" ? "confirmed" : "refuted"
    hypothesis.evidence = [...from.evidence]
  }
}

/** Evidence as the seat cites it, as the retained locator records hold. Lines are original-file coordinates (J5.3). */
export function evidence(item: Research.Evidence): Research.EvidenceRef {
  if ("lines" in item) return { source: item.source, locator: { kind: "lines", start: item.lines.start, end: item.lines.end, basis: "original" } }
  if ("quote" in item) return { source: item.source, locator: { kind: "quote", exact: item.quote } }
  return { source: item.source, locator: { kind: "json", pointer: item.pointer } }
}

/**
 * The structural rules of the check (J5.6): R2 non-vacuity, R3 locators, R7 coverage and R8 hypotheses. `verify`
 * re-resolves one evidence locator against the retained bytes. A partial or blocked close turns failures into limitations.
 */
export const check = Effect.fn("ResearchInquiry.check")(function* (state: State, sufficiency: Research.Sufficiency,
  verify: (ref: Research.EvidenceRef) => Effect.Effect<void, Research.Error>) {
  const issues: Array<Research.CheckResult["issues"][number]> = []
  const claims = state.claims.filter((claim) => !claim.dropped)
  const answered = sufficiency === "answered"
  // R2: an answered inquiry has at least one claim with evidence; zero claims never pass (J5.8).
  const evidenced = claims.filter((claim) => claim.evidence.length > 0)
  if (answered && !evidenced.length) issues.push({ rule: "R2", reason: "no claim with evidence: an answered inquiry needs at least one" })
  // R3: every cited locator still resolves in its retained source.
  const cited = [...claims.flatMap((claim) => [...claim.evidence, ...claim.contrary].map((ref) => ({ ref: claim.ref, evidence: ref }))),
    ...state.hypotheses.filter((item) => item.status !== "open" && item.status !== "dropped")
      .flatMap((item) => item.evidence.map((ref) => ({ ref: item.ref, evidence: ref })))]
  const located = yield* Effect.forEach(cited, (item) => verify(item.evidence).pipe(Effect.result))
  located.forEach((result, index) => {
    if (result._tag === "Failure") issues.push({ rule: "R3", ref: cited[index].ref, reason: `${result.failure.code}: ${result.failure.message}` })
  })
  // R7: every subquestion has an answering claim; a declared gap is honest coverage only short of answered.
  const subs = state.subquestions.map((sub) => ({ sub, covered: claims.some((claim) => claim.subquestion === sub.ref.id) }))
  subs.filter((item) => !item.covered && (answered || !item.sub.gap)).forEach((item) => issues.push({ rule: "R7", ref: item.sub.ref,
    reason: item.sub.gap ? `subquestion has a declared gap (${item.sub.gap}), so the inquiry is not answered` : "subquestion has no answering claim" }))
  // R8: no open hypothesis in an answered inquiry; a decided one carries evidence.
  const hypotheses = state.hypotheses.filter((item) => item.status !== "dropped")
  hypotheses.filter((item) => (item.status === "open" && answered) || (item.status !== "open" && !item.evidence.length))
    .forEach((item) => issues.push({ rule: "R8", ref: item.ref,
      reason: item.status === "open" ? "hypothesis is still open" : `hypothesis ${item.status} without evidence` }))
  const count = (rule: Research.CheckResult["issues"][number]["rule"]) => issues.filter((issue) => issue.rule === rule).length
  const rules = [
    { id: "R2" as const, checked: claims.length, failed: count("R2") },
    { id: "R3" as const, checked: cited.length, failed: count("R3") },
    { id: "R7" as const, checked: subs.length, failed: count("R7") },
    { id: "R8" as const, checked: hypotheses.length, failed: count("R8") },
  ]
  return { verdict: issues.length ? "fail" as const : "pass" as const, rules, issues: issues.slice(0, 256), urls: [] }
})

/** Why the inquiry cannot close now, or undefined. The host refuses to close over an uncovered subquestion (efficiency.md). */
export function refusal(state: State, sufficiency: Research.Sufficiency) {
  if (state.phase === "none") return "open the inquiry first"
  if (state.phase === "closed") return "inquiry closed"
  if (!state.check) return "no check is registered: run inquiry check before close"
  if (state.stale) return "a write after the last check invalidated it: run inquiry check again"
  if (sufficiency === "answered" && state.check.verdict !== "pass") return "the last check failed: answered needs a passing check; close partial or blocked, or fix the issues"
  if (sufficiency === "blocked") return undefined
  const open = state.subquestions.filter((sub) => !sub.gap && !state.claims.some((claim) => !claim.dropped && claim.subquestion === sub.ref.id))
  if (open.length) return `subquestion ${open.map((sub) => sub.ref.id).join(", ")} has neither an answering claim nor a declared gap: claim it, or drop it with the reason`
  return undefined
}

/** The card the host assembles on close (J5.12); the model never writes card JSON. */
export function card(state: State, input: { readonly allowance: Research.Allowance; readonly close: Extract<Research.InquiryInput, { action: "close" }>
  readonly check: Research.CheckResult; readonly domains: readonly string[] | undefined }): Research.CardV2 {
  const claims = state.claims.filter((claim) => !claim.dropped)
  const gaps = state.subquestions.flatMap((sub) => sub.gap ? [`gap ${sub.ref.id}: ${sub.gap}`] : [])
  const dropped = state.hypotheses.flatMap((item) => item.status === "dropped" ? [`hypothesis ${item.ref.id} dropped: ${item.reason ?? ""}`] : [])
  const failures = input.close.sufficiency === "answered" ? [] : input.check.issues.map((issue) => `${issue.rule}: ${issue.reason}`)
  return {
    schema: "jimmy-card-v2",
    answer: input.close.answer,
    profile: state.question?.selection.profile ?? "understand",
    depth: input.allowance.tier,
    sufficiency: input.close.sufficiency,
    subquestions: state.subquestions.map((sub) => ({ ref: sub.ref, question: sub.question.slice(0, 4096) || sub.ref.id,
      status: claims.some((claim) => claim.subquestion === sub.ref.id) ? "answered" as const : "uncovered" as const })),
    claims: claims.slice(0, 256).map((claim) => ({ ref: claim.ref, proposition: claim.proposition, nature: claim.nature,
      evidence: [...claim.evidence], contrary: [...claim.contrary], conditions: [...claim.conditions] })),
    hypotheses: state.hypotheses.filter((item) => item.status !== "dropped").slice(0, 256).map((item) => ({ ref: item.ref,
      proposition: item.proposition, status: item.status === "dropped" ? "open" as const : item.status, probes: [] })),
    probes: [],
    sources: { total: state.sources.length, shown: state.sources.slice(0, 50).map((source) => ({ ref: source.ref,
      origin: source.origin.kind, uri: source.origin.uri })) },
    searches: state.searches,
    web: { domains: input.domains ? [...input.domains] : "unrestricted", urls: [] },
    coverage: { examined: state.subquestions.filter((sub) => !sub.gap).map((sub) => sub.ref.id), excluded: [],
      failures: [...gaps, ...failures].slice(0, 256) },
    limitations: [...(input.close.limitations ?? []), ...failures, ...dropped].slice(0, 256),
    nextActions: [...(input.close.nextActions ?? [])].slice(0, 32),
    documentRefs: [],
    check: input.check,
  }
}

/** This turn's snapshot inside a research dispatch, or undefined outside one. */
export const turn = Effect.fn("ResearchInquiry.turn")(function* () {
  const frame = yield* ResearchExecution.Current
  if (!frame) return undefined
  return snapshot(fold(yield* ResearchLedger.dispatch(frame.allowance)), frame.allowance)
})

const SNAPSHOT_CHARS = 4500

/**
 * The compact state the host puts before each turn: ids, counts and short labels, never retained text. It is rebuilt
 * from the ledger every turn, so it survives compaction. Kept under about 1.1k tokens at four characters per token.
 */
export function snapshot(state: State, allowance: Research.Allowance) {
  const budget = `tier ${allowance.tier}; used tools ${state.used.tool}/${allowance.toolLimit}, provider ${state.used.provider}/${allowance.providerLimit}, bytes ${state.used.bytes}/${allowance.byteLimit}, deadline ${allowance.deadlineSeconds}s, probe ${allowance.probeSecondsLimit}s`
  if (state.phase === "none") return [`<inquiry state="none">`, budget, "Open it with inquiry open before investigating.", "</inquiry>"].join("\n")
  const ref = (item: Research.RecordRef) => `${item.id}@${item.revision}`
  const label = (text: string) => JSON.stringify(text.length > 80 ? `${text.slice(0, 77)}...` : text)
  const check = state.check
    ? `check ${state.check.verdict}${state.stale ? " (stale: a write followed it)" : ""}${state.check.issues.length ? `; issues ${state.check.issues.slice(0, 8).map((issue) => `${issue.rule}${issue.ref ? ` ${issue.ref.id}` : ""}`).join(", ")}` : ""}`
    : "check none"
  const lines = [
    `<inquiry state="${state.phase}">`,
    budget,
    `question ${state.question ? `${state.question.id} ${label(state.question.question)}` : "unknown"}`,
    ...state.subquestions.map((sub) => {
      const claims = state.claims.filter((claim) => claim.subquestion === sub.ref.id && !claim.dropped)
      const hypotheses = state.hypotheses.filter((item) => item.subquestion === sub.ref.id && item.status !== "dropped")
      const status = claims.length ? "covered" : sub.gap ? "gap" : "open"
      return [`- ${ref(sub.ref)} ${status} ${label(sub.question)}`,
        claims.length ? `claims ${claims.map((claim) => `${ref(claim.ref)}(${claim.evidence.length}ev)`).join(" ")}` : "",
        hypotheses.length ? `hypotheses ${hypotheses.map((item) => `${ref(item.ref)}:${item.status}`).join(" ")}` : ""].filter(Boolean).join("; ")
    }),
    `sources retained ${state.sources.length}; searches ${state.searches}`,
    ...state.sources.slice(-12).map((source) => `  ${label(source.origin.uri)}${source.observed?.lineStart ? `:${source.observed.lineStart}-${source.observed.lineEnd ?? source.observed.lineStart}` : ""}`),
    check,
    `next: ${next(state)}`,
    "</inquiry>",
  ]
  const text = lines.join("\n")
  return text.length <= SNAPSHOT_CHARS ? text : `${text.slice(0, SNAPSHOT_CHARS - 12)}\n</inquiry>`
}

function next(state: State) {
  if (state.phase === "closed") return "nothing: the inquiry is closed"
  const open = state.subquestions.filter((sub) => !sub.gap && !state.claims.some((claim) => !claim.dropped && claim.subquestion === sub.ref.id))
  if (open.length) return `cover ${open.map((sub) => sub.ref.id).join(", ")} with a claim, or drop it with the gap`
  if (state.hypotheses.some((item) => item.status === "open")) return "resolve or drop the open hypotheses"
  if (!state.check || state.stale) return "inquiry check"
  return state.check.verdict === "pass" ? "inquiry close" : "fix the check issues, or close partial or blocked"
}
