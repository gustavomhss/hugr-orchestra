import { expect } from "bun:test"
import { Effect, Schema, Stream } from "effect"
import type { LLMRequest } from "@orchestra/llm"
import { SessionSchema } from "@orchestra/core/session"
import { fence, text, type Controls, type Ctx, type RequestLog } from "./lucy-engagement"
import { canonical, decoded, digest, receipt, request, type Report } from "./lucy-engagement-artifacts"
import { FixFinding, FixResult, FixSource, FixVerifierReturn, Observation } from "./lucy-fix-review-schema"
import { data, nativeCalls, variantScript } from "./lucy-variants"
import { strict } from "./lucy-variant-schema"

export const fixedText = 'export const sharedValue = "FIXED-GUARD" // reject the prohibited state\n'
export type FixTurn = {
  readonly kind: "fix-verify"
  readonly findingID: string
  readonly sessionID: string
  readonly index: number
  readonly log: RequestLog
  readonly request: LLMRequest
}
export type FixBasis = {
  readonly finding: FixFinding
  readonly current: typeof FixSource.Type
  readonly observations: readonly Observation[]
}
export type FixOptions = {
  readonly prior?: NonNullable<Controls["stream"]>
  readonly onTurn?: (turn: FixTurn) => Effect.Effect<void>
  readonly override?: (turn: FixTurn) => ReturnType<NonNullable<Controls["stream"]>> | undefined
  readonly verdict?: (turn: FixTurn, basis: FixBasis) => FixVerifierReturn
  /** False omits the scripted call; it does not replace any host read or observation. */
  readonly code?: boolean
}

/** Only transport is scripted. run/open, native permissions, CODE, provider turns and acknowledgements are unchanged. */
export function fixScript(options: FixOptions = {}) {
  const previous = options.prior ?? variantScript().stream
  const turns: FixTurn[] = []
  const indices = new Map<string, number>()
  const stream: NonNullable<Controls["stream"]> = (log, modelRequest) => {
    const stage = /^Stage: fix verify, finding ([^\r\n]+)\.$/m.exec(log.text)
    if (!stage) return previous(log, modelRequest)
    const index = indices.get(log.sessionID) ?? 0
    indices.set(log.sessionID, index + 1)
    const turn: FixTurn = { kind: "fix-verify", findingID: stage[1], sessionID: log.sessionID,
      index, log, request: modelRequest }
    turns.push(turn)
    return Stream.unwrap((options.onTurn?.(turn) ?? Effect.void).pipe(Effect.map(() => {
      const replacement = options.override?.(turn)
      if (replacement) return replacement
      const basis = fixBasis(turn)
      if (index === 0 && options.code !== false) return nativeCalls([{
        id: "fix_search", name: "code_search", input: { pattern: ".", mode: "regex",
          paths: [basis.finding.finding.path], limit: 200, offset: 0, context: 0 },
      }])
      return text(fence("review-fix-verify", options.verdict?.(turn, basis) ?? defaultVerdict(basis)))
    })))
  }
  return { stream, turns }
}

export function fixBasis(turn: FixTurn): FixBasis {
  const finding = Schema.decodeUnknownSync(FixFinding)(data(turn.log.text, "fix finding"), strict)
  const current = Schema.decodeUnknownSync(FixSource)(data(turn.log.text, "fix source"), strict)
  const observations = Schema.decodeUnknownSync(Schema.Array(Observation))(
    data(turn.log.text, "fix observations"), strict,
  )
  expect(finding.finding.id).toBe(turn.findingID)
  expect(finding.priorFindingSha256).toBe(digest(canonical(finding.finding)))
  expect(current.regions.every((region) => region.sourceSha256 === current.source.sha256)).toBe(true)
  return { finding, current, observations }
}

export function defaultVerdict(basis: FixBasis): FixVerifierReturn {
  const candidate = basis.finding.finding
  const region = basis.current.regions.find((value) => value.path === candidate.path)
  if (!region) throw new Error("fix fixture received no bounded current finding region")
  const support: FixVerifierReturn["supporting"] = candidate.evidence.kind === "tool"
    ? basis.observations.filter((value) => value.findingID === candidate.id)
      .map((value) => ({ kind: "tool", observationID: value.observationID }))
    : [{ kind: "quote", path: region.path, startLine: region.startLine, endLine: region.endLine }]
  return { findingID: candidate.id, priorFindingSha256: basis.finding.priorFindingSha256,
    disposition: "resolved", reason: "The current captured guard removes the stated trigger; the original evidence remains available.",
    supporting: support }
}

export function fixRequest(prior: Report, requestID: string, revision?: string, findingIDs?: readonly string[]) {
  if (prior.status !== "completed" || !prior.report) throw new Error("fix fixture requires an actual completed predecessor")
  return { kind: "engagement" as const, requestID, profile: prior.report.profile,
    brief: "Recheck only these existing finding IDs against the current captured source. Preserve human decisions and prior evidence.",
    timeBoxMinutes: 5, ...(revision === undefined ? {} : { revision }),
    fixReview: { reportID: prior.reportID, findingIDs: [...(findingIDs ?? prior.report.findings.map((finding) => finding.id))] } }
}

export const completedPrior = (host: Ctx, requestID = "fix-prior", profile = "diligence") => Effect.gen(function* () {
  const input = request(requestID, profile)
  const output = yield* host.invoke(input)
  const report = decoded(output)
  expect(report.status).toBe("completed")
  expect(report.report?.findings.length).toBeGreaterThan(0)
  expect(report.report).not.toHaveProperty("verdict")
  const card = report.report
  const source = report.source
  if (!card || !source) return yield* Effect.die("actual completed predecessor omitted card/source")
  const evidence = yield* receipt(host, report)
  return { input, output, report: { ...report, report: card, source }, evidence }
})

export function decodedFix(output: { readonly type: string; readonly text: string }) {
  expect(output.type, output.text).toBe("text")
  const value = Schema.decodeUnknownSync(FixResult)(JSON.parse(output.text), strict)
  expect(output.text).toBe(canonical(value))
  const { reportID, ...payload } = value
  expect(reportID).toBe(digest(canonical(payload)))
  expect(value).not.toHaveProperty("verdict")
  expect(value).not.toHaveProperty("report")
  if (value.status === "completed") {
    expect(value.prior).toBeDefined()
    expect(value.source).toBeDefined()
    if (!value.prior || !value.source) throw new Error("completed fix omitted prior/source")
    expect(value.dispositions.map((item) => item.findingID).sort()).toEqual(value.prior.findings.map((item) => item.findingID).sort())
    expect(new Set(value.dispositions.map((item) => item.findingID)).size).toBe(value.dispositions.length)
  } else {
    expect(value.dispositions).toEqual([])
    expect(value.citations).toEqual([])
    expect(value.questions).toEqual([])
    expect(value.notExamined).toContainEqual({ item: "engagement:evidence-publication",
      reason: value.status === "expired" ? "time-box" : value.status === "cancelled" ? "cancelled" : "failure" })
  }
  return value
}

export const fixInputs = (host: Ctx, turn: FixTurn) => host.sessions.context(SessionSchema.ID.make(turn.sessionID)).pipe(
  Effect.map((messages) => messages.flatMap((message) => message.type === "assistant"
    ? message.content.flatMap((part) => part.type === "tool" ? [{ sessionID: turn.sessionID, messageID: message.id,
      id: part.id, name: part.name, status: part.state.status, providerExecuted: part.provider?.executed === true }] : []) : [])),
)
