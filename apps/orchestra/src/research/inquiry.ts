export * as ResearchInquiry from "./inquiry"

// The dispatch's investigation (J5.1-J5.2): a fold over the records and inquiry events its ledger already holds. Nothing
// here keeps state of its own, so the inquiry, the closed state and the per-turn snapshot survive compaction and restarts.
import { Effect } from "effect"
import { Research } from "@orchestra/schema/research"
import { ResearchLedger } from "@orchestra/core/research/ledger"
import type { ResearchRecords } from "@orchestra/core/research/records"
import type { Liveness } from "@orchestra/core/research-toolkit/liveness"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { ResearchExecution } from "./allowance"
import { InquiryCheck } from "./inquiry-check"

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
  question?: Extract<Research.Record, { kind: "question" }>
  subquestions: Subquestion[]
  hypotheses: Hypothesis[]
  claims: Claim[]
  /** The last check, and whether a write since then invalidated it (J5.2). */
  check?: Research.CheckResult
  stale: boolean
  card?: Research.CardV2
  sources: Research.SourceReceipt[]
  used: { provider: number; tool: number; bytes: number; probe: number }
  searches: number
}

// Tool ids whose calls count as searches on the card, on the loop and in Claude mode.
const SEARCHES = new Set(["grep", "glob", "Grep", "Glob", "code_search", "code_locate", "code_query"])

export function fold(steps: readonly ResearchLedger.Step[]): State {
  const records = new Map<string, Research.Record>()
  const state: State = { phase: "none", subquestions: [], hypotheses: [], claims: [], stale: false, sources: [],
    used: { provider: 0, tool: 0, bytes: 0, probe: 0 }, searches: 0 }
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

function link(state: State, records: Map<string, Research.Record>, relation: Extract<Research.Record, { kind: "relation" }>) {
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

/** What the check reads beyond the ledger fold; the inquiry tool binds them to its dispatch (J5.6, J5.9-J5.11). */
export type Deps = {
  readonly records: ResearchRecords.Interface
  readonly binding: Research.Binding
  /** The dispatch's domain list (J1.9); undefined is unrestricted. */
  readonly domains: readonly string[] | undefined
  readonly searches: readonly InquiryCheck.Search[]
  readonly links: (urls: readonly string[], options: Liveness.Options) => Effect.Effect<readonly Liveness.Result[]>
  readonly real?: (target: string) => Effect.Effect<string>
}

/**
 * R1-R11 (InquiryCheck.run) over the folded state, with the retained bytes, the record verifier and URL liveness. A
 * mid-run check has no close and is held to the answered bar; a close is checked on its own sufficiency and answer.
 */
export const check = Effect.fn("ResearchInquiry.check")(function* (state: State,
  close: Pick<Extract<Research.InquiryInput, { action: "close" }>, "sufficiency" | "answer"> | undefined, deps: Deps) {
  const records = deps.records
  const binding = deps.binding
  const read = (ref: Research.SourceRef) => drain(records, binding, { action: "source", ref })
  // R1 owns sources by binding: a resumed dispatch of the same Task may cite what an earlier one retained.
  const corpus = yield* records.view(binding, { action: "corpus" })
  const owned = [...new Map([...state.sources, ...("sources" in corpus ? corpus.sources : [])]
    .map((source) => [ResearchLedger.canonical(source.ref), source])).values()]
  // URLs the dispatch's retained web searches returned, in loop (websearch) and Claude mode (WebSearch) alike.
  const results = yield* Effect.forEach(state.sources.filter((source) => source.origin.kind === "tool-output" &&
    /\/websearch$/i.test(source.origin.uri)), (source) => read(source.ref).pipe(Effect.orElseSucceed(() => "")))
  const seenUrls = results.flatMap((text) => InquiryCheck.extract(text).flatMap((item) => item.kind === "url" ? [item.target] : []))
  const pages = owned.filter((source) => source.origin.kind === "url")
  const seen = [...seenUrls, ...pages.map((source) => source.origin.uri)]
  const captured = pages.filter((source) => source.complete).map((source) => ({ url: source.origin.uri, capturedAt: source.capturedAt }))
  const subquestions = new Map<string, Research.RecordRef>(state.subquestions.map((sub) => [sub.ref.id, sub.ref]))
  return yield* InquiryCheck.run({
    binding,
    ...(close ? { sufficiency: close.sufficiency } : {}),
    answer: close?.answer ?? "",
    allowedDomains: deps.domains ? [...deps.domains] : "unrestricted",
    sources: owned,
    attempts: yield* attempts(records, binding),
    subquestions: state.subquestions.map((sub) => ({ ref: sub.ref, question: sub.question })),
    claims: state.claims.flatMap((claim) => {
      const subquestion = subquestions.get(claim.subquestion)
      if (claim.dropped || !subquestion || !isNature(claim.nature)) return []
      const scope = claim.conditions.includes("scope:universal") ? "universal" as const
        : claim.conditions.includes("scope:existential") ? "existential" as const : undefined
      return [{ ref: claim.ref, subquestion, proposition: claim.proposition, nature: claim.nature, ...(scope ? { scope } : {}),
        conditions: claim.conditions, evidence: claim.evidence.map(cited), contrary: claim.contrary.map(cited) }]
    }),
    hypotheses: state.hypotheses.flatMap((item) => item.status === "dropped" ? []
      : [{ ref: item.ref, proposition: item.proposition, status: item.status, evidence: item.evidence.map(cited) }]),
    searches: deps.searches,
    seenUrls,
    read,
    verify: (ref) => records.verifyEvidence(binding, ref),
    liveness: (urls) => urls.length ? deps.links(urls.slice(0, 256), { seen, captured }).pipe(Effect.map((list) => list.map((item) =>
      ({ url: item.url, status: item.status, ...(item.httpStatus !== undefined ? { httpStatus: item.httpStatus } : {}) })))) : Effect.succeed([]),
    ...(deps.real ? { real: deps.real } : {}),
  })
})

/**
 * The code_search and code_query calls of the execution Session, as R5 and R6 read them: what each covered (its
 * pattern, name and paths) and whether its coverage was complete. Tool names may carry an MCP prefix in Claude mode.
 */
export function searches(messages: readonly SessionV1.WithParts[]): InquiryCheck.Search[] {
  return messages.flatMap((message) => message.parts).flatMap((part) => {
    if (part.type !== "tool" || part.state.status !== "completed") return []
    const tool = part.tool.split("__").at(-1)
    if (tool !== "code_search" && tool !== "code_query") return []
    const input = part.state.input
    const scope = [input.pattern, input.name, input.path, input.symbol, ...(Array.isArray(input.paths) ? input.paths : [])]
      .filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
    const output = part.state.output
    const complete = tool === "code_search" ? /\bcomplete=true\b/.test(output)
      : /\| docs \d+ \|/.test(output) && !/ (?:INCOMPLETE|TRUNCATED)\b/.test(output)
    return [{ tool, complete, scope }]
  })
}

function isNature(nature: string): nature is InquiryCheck.Claim["nature"] {
  return nature === "extraction" || nature === "observation" || nature === "inference"
}

/** A retained locator as the seat cited it; lines of either basis are checked in original coordinates. */
function cited(ref: Research.EvidenceRef): Research.Evidence {
  if (ref.locator.kind === "lines") return { source: ref.source, lines: { start: ref.locator.start, end: ref.locator.end } }
  if (ref.locator.kind === "quote") return { source: ref.source, quote: ref.locator.exact }
  return { source: ref.source, pointer: ref.locator.pointer }
}

function attempts(records: ResearchRecords.Interface, binding: Research.Binding, cursor?: string): Effect.Effect<Research.AttemptReceipt[], Research.Error> {
  return records.view(binding, { action: "attempts", limit: 100, ...(cursor ? { cursor } : {}) }).pipe(Effect.flatMap((page) => {
    if (!("attempts" in page)) return Effect.succeed([])
    if (!page.cursor) return Effect.succeed([...page.attempts])
    return attempts(records, binding, page.cursor).pipe(Effect.map((rest) => [...page.attempts, ...rest]))
  }))
}

/** Every page of a retained source or document, joined. */
export function drain(
  records: ResearchRecords.Interface,
  binding: Research.Binding,
  input: { action: "source"; ref: Research.SourceRef; cursor?: string } | { action: "document"; ref: Research.DocumentRef; cursor?: string },
): Effect.Effect<string, Research.Error> {
  return records.view(binding, input).pipe(Effect.flatMap((page) => {
    if (!("text" in page)) return Effect.fail(new Research.Error({ code: "source_unavailable", message: "Retained research page is not text" }))
    if (!page.cursor) return Effect.succeed(page.text)
    return drain(records, binding, { ...input, cursor: page.cursor }).pipe(Effect.map((rest) => page.text + rest))
  }))
}

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
  readonly outcome: InquiryCheck.Outcome; readonly domains: readonly string[] | undefined
  /** Documents this Task published; the parent qualifies their findings too. */
  readonly documents: readonly Research.DocumentRef[] }): Research.CardV2 {
  const check = input.outcome.result
  const claims = state.claims.filter((claim) => !claim.dropped)
  const gaps = state.subquestions.flatMap((sub) => sub.gap ? [`gap ${sub.ref.id}: ${sub.gap}`] : [])
  const dropped = state.hypotheses.flatMap((item) => item.status === "dropped" ? [`hypothesis ${item.ref.id} dropped: ${item.reason ?? ""}`] : [])
  // Short of answered, the closing check's failures become limitations (J5.2).
  const failures = input.close.sufficiency === "answered" ? [] : check.issues.map((issue) => `${issue.rule}: ${issue.reason}`)
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
    web: { domains: input.domains ? [...input.domains] : "unrestricted", urls: check.urls },
    coverage: { examined: state.subquestions.filter((sub) => !sub.gap).map((sub) => sub.ref.id), excluded: [],
      failures: [...gaps, ...input.outcome.coverageFailures, ...failures].slice(0, 256) },
    limitations: [...(input.close.limitations ?? []), ...failures, ...dropped, ...input.outcome.limitations].slice(0, 256),
    nextActions: [...(input.close.nextActions ?? [])].slice(0, 32),
    documentRefs: [...input.documents],
    check,
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
  const budget = `tier ${allowance.tier}; used tools ${state.used.tool}/${allowance.toolLimit}, provider ${state.used.provider}/${allowance.providerLimit}, bytes ${state.used.bytes}/${allowance.byteLimit}, deadline ${allowance.deadlineSeconds}s, probe ${state.used.probe}/${allowance.probeSecondsLimit}s`
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
