import { expect } from "bun:test"
import { Effect, Schema, Stream } from "effect"
import { LLMEvent, type LLMRequest } from "@orchestra/llm"
import { CodeIndex } from "@orchestra/core/research-toolkit/code-index/types"
import { SessionSchema } from "@orchestra/core/session"
import { ReviewResultV2 } from "../../src/v2/governance/review-result"
import { ReviewFanoutV2 } from "../../src/v2/workflow/review-fanout"
import { fence, reply, sourcePath, sourceText, stage, text, type Controls, type Ctx, type RequestLog } from "./lucy-engagement"

export type VariantCandidate = {
  readonly path: string
  readonly line: number
  readonly endLine?: number
  readonly severity: "P0" | "P1" | "P2" | "P3"
  readonly trigger: string
  readonly quote: string
  /** Scripted model evidence only. The real host must read and validate this separate captured range. */
  readonly support?: { readonly path: string; readonly startLine: number; readonly endLine: number }
}

export type VariantDisposition = {
  readonly path: string
  readonly line: number
  readonly state: "confirmed" | "noise" | "question"
  readonly reason?: string
}

export type VariantGeneration = {
  readonly search: CodeIndex.SearchInput
  readonly candidates: readonly VariantCandidate[]
  readonly dispositions?: readonly VariantDisposition[]
}

export type VariantTurn = {
  readonly kind: "entry" | "lens" | "verify" | "finish" | "variant-proposal" | "variant-verify" | "unexpected"
  readonly ordinal?: number
  readonly sessionID: string
  /** Provider turn within this actual Session/stage, including continuations after native tool settlement. */
  readonly index: number
  readonly log: RequestLog
  readonly request: LLMRequest
}

export type VariantOptions = {
  readonly initial?: readonly VariantCandidate[]
  readonly generations?: readonly VariantGeneration[]
  readonly onTurn?: (turn: VariantTurn) => Effect.Effect<void>
  readonly override?: (turn: VariantTurn) => ReturnType<NonNullable<Controls["stream"]>> | undefined
  readonly forgeInitialTool?: boolean
}

export const initialCandidate: VariantCandidate = {
  path: sourcePath, line: 1, endLine: 1, severity: "P1", quote: sourceText.trimEnd(),
  trigger: "The captured declaration violates the review's explicit invariant.",
}

export const fullSearch = (pattern = "sharedValue"): CodeIndex.SearchInput => ({
  pattern, mode: "regex", paths: ["**"], offset: 0, limit: 200, context: 0,
})

/** Only LLM transport is scripted. Tools, Session admission/execution, captured source and evidence stay real. */
export function variantScript(options: VariantOptions = {}) {
  const turns: VariantTurn[] = []
  const proposals: VariantTurn[] = []
  const verifiers: VariantTurn[] = []
  const indices = new Map<string, number>()
  const initial = options.initial ?? [initialCandidate]
  const stream: NonNullable<Controls["stream"]> = (log, request) => {
    const proposal = /^Stage: variant proposal, generation (\d+)\./m.exec(log.text)
    const verification = /^Stage: variant verify, generation (\d+), class /m.exec(log.text)
    const kind = proposal ? "variant-proposal" : verification ? "variant-verify" : stage(log.text)
    const ordinal = proposal?.[1] ?? verification?.[1]
    const key = JSON.stringify([log.sessionID, kind, ordinal])
    const index = indices.get(key) ?? 0
    indices.set(key, index + 1)
    const turn: VariantTurn = { kind, ...(ordinal ? { ordinal: Number(ordinal) } : {}),
      sessionID: log.sessionID, index, log, request }
    turns.push(turn)
    if (kind === "variant-proposal" && index === 0) proposals.push(turn)
    if (kind === "variant-verify" && index === 0) verifiers.push(turn)
    return Stream.unwrap((options.onTurn?.(turn) ?? Effect.void).pipe(Effect.map(() => {
      const overridden = options.override?.(turn)
      if (overridden) return overridden
      if (kind === "variant-proposal") {
        const generation = options.generations?.[(turn.ordinal ?? 1) - 1] ?? { search: fullSearch(), candidates: [] }
        if (index === 0) return nativeCalls([{ name: "code_search", input: generation.search, id: "variant_search" }])
        return text(proposalReply(turn, generation.candidates))
      }
      if (kind === "variant-verify") {
        const generation = options.generations?.[(turn.ordinal ?? 1) - 1]
        if (!generation) throw new Error("fixture received an unplanned variant verifier")
        return text(verificationReply(turn, generation.candidates, generation.dispositions))
      }
      if (kind === "lens") return text(initialLens(turn, initial))
      if (kind === "verify") return text(verificationReply(turn, initial, undefined, options.forgeInitialTool))
      if (kind === "finish") return text(finishReply(turn))
      return text(reply(log, request))
    })))
  }
  return { stream, turns, proposals, verifiers }
}

export function nativeCalls(calls: readonly { readonly name: string; readonly input: unknown; readonly id: string }[]) {
  return Stream.fromIterable([
    LLMEvent.stepStart({ index: 0 }),
    ...calls.flatMap((call) => [
      LLMEvent.toolInputStart({ id: call.id, name: call.name }),
      LLMEvent.toolInputDelta({ id: call.id, name: call.name, text: JSON.stringify(call.input) }),
      LLMEvent.toolInputEnd({ id: call.id, name: call.name }),
      LLMEvent.toolCall({ id: call.id, name: call.name, input: call.input }),
    ]),
    LLMEvent.stepFinish({ index: 0, reason: "tool-calls" }), LLMEvent.finish({ reason: "tool-calls" }),
  ])
}

export function data(brief: string, name: string): unknown {
  const marker = `<data name="${name}">\n`
  const start = brief.indexOf(marker)
  const end = brief.indexOf("\n</data>", start + marker.length)
  if (start < 0 || end < 0) throw new Error(`fixture did not receive host ${name}`)
  return JSON.parse(brief.slice(start + marker.length, end))
}

export function proposalReply(turn: VariantTurn, candidates: readonly VariantCandidate[], replacement?: unknown) {
  const seed = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))(data(turn.log.text, "seed"))
  return fence("review-variant", replacement ?? {
    seedFindingID: seed.id,
    patternChange: "Generalize the same captured invariant while retaining the known instance as a control.",
    candidates: candidates.map(({ support, ...candidate }) => {
      void support
      return candidate
    }),
  })
}

function initialLens(turn: VariantTurn, initial: readonly VariantCandidate[]) {
  const lens = /Stage: hunt, lens ([^,]+),/.exec(turn.log.text)?.[1]
  if (!lens) throw new Error("fixture received a lens without its native stage identity")
  return fence(ReviewFanoutV2.TAGS.lens, {
    lens, candidates: lens === "correctness-logic" ? initial.map(({ support, ...candidate }) => {
      void support
      return { ...candidate, class: "logic.invariant", node: "lucy-lens-correctness-logic-invariants" }
    }) : [], observations: [], hunks: [], items: [],
  })
}

const OfferedCandidates = Schema.Array(Schema.Struct({
  id: Schema.String, class: Schema.String, path: Schema.String, line: Schema.Number,
  endLine: Schema.optional(Schema.Number), region: Schema.String,
  options: Schema.Array(Schema.Struct({ id: Schema.String })),
}))

function verificationReply(turn: VariantTurn, expected: readonly VariantCandidate[],
  dispositions: readonly VariantDisposition[] = [], forge = false) {
  const offered = Schema.decodeUnknownSync(OfferedCandidates)(data(turn.log.text, "candidates"))
  expect(offered.length).toBeGreaterThan(0)
  const results = offered.map((candidate) => {
    expect(candidate.class).toBe("logic.invariant")
    expect(candidate.options.some((option) => option.id === "quote")).toBe(true)
    const source = expected.find((item) => item.path === candidate.path && item.line === candidate.line)
    if (!source) throw new Error(`unexpected candidate ${candidate.path}:${candidate.line}`)
    expect(candidate.region).toContain(source.quote)
    const disposition = dispositions.find((item) => item.path === candidate.path && item.line === candidate.line)
    if (disposition?.state === "noise") return {
      candidate: candidate.id, state: "dropped", history: [{ option: "quote", outcome: "unsettled" }],
      refutation: disposition.reason ?? "The captured line is a bounded negative control; the asserted trigger is absent.",
    }
    if (disposition?.state === "question") return {
      candidate: candidate.id, state: "question", history: [{ option: "quote", outcome: "unsettled" }],
      reason: disposition.reason ?? "The source does not settle the required invariant without a human decision.",
    }
    return {
      candidate: candidate.id, state: "confirmed", rung: "quote", history: [{ option: "quote", outcome: "settled" }],
      evidence: forge ? { kind: "tool", pack: "oxlint", rule: "eslint(no-debugger)", version: "1.91.0",
        uri: "review:12345678-1234-4123-8123-123456789abc/raw/oxlint-head.sarif" }
        : { kind: "quote", ...(source.support ?? { path: source.path, startLine: source.line, endLine: source.endLine ?? source.line }) },
    }
  })
  return fence(ReviewFanoutV2.TAGS.verify, { class: "logic.invariant", results })
}

function finishReply(turn: VariantTurn) {
  const independent = turn.log.text.includes('<data name="confirmed findings, as the host merged them">')
  const returned = reply(turn.log, turn.request, { quote: independent })
  const card = ReviewResultV2.parse(returned)
  if (!card) throw new Error("fixture did not produce a strict host-bound final card")
  const questions = turn.log.text.includes('<data name="questions">')
    ? Schema.decodeUnknownSync(Schema.Array(ReviewResultV2.Question))(data(turn.log.text, "questions")) : []
  return fence(ReviewResultV2.TAG, { ...card, questions })
}

/** Observe native messages after the real continuation, never the provider's claimed call/result text. */
export const nativeSearches = (host: Ctx, sessionID: string) => host.sessions.context(SessionSchema.ID.make(sessionID)).pipe(
  Effect.map((messages) => messages.flatMap((message) => message.type === "assistant"
    ? message.content.flatMap((part) => part.type === "tool" && part.name === "code_search"
      ? [{ sessionID, assistantMessageID: message.id, toolCallID: part.id,
        status: part.state.status, providerExecuted: part.provider?.executed === true, state: part.state }] : []) : [])),
)

export function nativeSearchResult(call: Effect.Success<ReturnType<typeof nativeSearches>>[number]) {
  expect(call.status).toBe("completed")
  expect(call.providerExecuted).toBe(false)
  if (call.state.status !== "completed") throw new Error("native search did not complete")
  const output = Schema.decodeUnknownSync(Schema.Struct({ output: Schema.String }))(call.state.structured).output
  return Schema.decodeUnknownSync(SearchOutput)(JSON.parse(output))
}

export const SearchOutput = Schema.Struct({
  result: Schema.Struct({ matches: Schema.Array(Schema.Struct({ path: Schema.String, line: Schema.Number, text: Schema.String })),
    next: Schema.optional(Schema.Number), basis: Schema.Struct({
      coverage: Schema.Struct({ complete: Schema.Boolean, skipped: Schema.Array(Schema.Unknown), binariesSkipped: Schema.Number }),
      bounds: Schema.Struct({ truncated: Schema.Boolean, limit: Schema.Number }),
    }) }), evidence: Schema.Struct({ uri: Schema.String, sha256: Schema.String }),
})
