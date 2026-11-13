export * as ReviewEngagementPolicyV2 from "./review-engagement-policy"

import { Schema } from "effect"
import type { ReviewResultV2 } from "../governance/review-result"
import { ReviewCardV2 } from "./review-card"

const profiles = ["audit", "diligence", "artifact", "compliance"] as const
const auditLabels = ["material weakness", "significant deficiency", "deficiency", "observation"] as const
const diligenceLabels = ["deal-breaker", "price or structure item", "condition or remediation", "observation"] as const

export const Input = Schema.Struct({
  kind: Schema.Literal("engagement"),
  requestID: Schema.NonEmptyString,
  profile: Schema.NonEmptyString,
  brief: Schema.NonEmptyString,
  timeBoxMinutes: Schema.Number,
  revision: Schema.optional(Schema.NonEmptyString),
  paths: Schema.optional(Schema.Array(Schema.NonEmptyString)),
  fixReview: Schema.optional(Schema.Struct({
    reportID: Schema.NonEmptyString,
    findingIDs: Schema.Array(Schema.NonEmptyString),
  }).annotate({ parseOptions: { onExcessProperty: "error" } })),
}).check(Schema.makeFilter((value) => {
  const issue = inputIssue(value)
  return issue ? { path: [], issue } : undefined
})).annotate({ parseOptions: { onExcessProperty: "error" } })
export type Input = typeof Input.Type

export type Budget = {
  readonly startedAt: number
  readonly deadlineAt: number
  readonly maxGenerations: number
}

export function createBudget(input: Pick<Input, "profile" | "timeBoxMinutes">, now: number): Budget {
  if (!safeCount(now)) refuse("now")
  if (!safeCount(input.timeBoxMinutes) || input.timeBoxMinutes < 1 || input.timeBoxMinutes > 120) refuse("time-box")
  if (!accepted(input.profile)) refuse("profile")
  const deadlineAt = now + input.timeBoxMinutes * 60_000
  if (!Number.isSafeInteger(deadlineAt)) refuse("deadline")
  return { startedAt: now, deadlineAt, maxGenerations: input.profile === "audit" ? 3 : 0 }
}

export function nextGeneration(input: {
  readonly profile: string
  readonly completed: number
  readonly matches: number
  readonly noise: number
  readonly now: number
  readonly deadlineAt: number
}): boolean {
  if (!accepted(input.profile)) refuse("profile")
  if (!safeCount(input.completed) || !safeCount(input.matches) || !safeCount(input.noise)) refuse("count")
  if (input.noise > input.matches) refuse("noise")
  if (!safeCount(input.now) || !safeCount(input.deadlineAt)) refuse("time")
  return input.profile === "audit"
    && input.completed < 3
    && input.now < input.deadlineAt
    && input.matches > 0
    && input.noise * 2 < input.matches
}

export function validateReport(reply: string, expected: Parameters<typeof ReviewCardV2.validate>[1]): ReviewResultV2.Card {
  const card = ReviewCardV2.validate(reply, { ...expected, verdictRequired: false })
  if (card.verdict !== undefined) refuse("present-verdict")
  const profile = expected.routing.profile.id
  if (!accepted(profile)) refuse("profile")
  if (profile === "artifact" && !hasOwnerBehavioralEval(card)) refuse("artifact-r20")
  return card
}

export function severity(profile: string, value: "P0" | "P1" | "P2" | "P3"): string {
  if (!accepted(profile)) refuse("profile")
  const rank = value === "P0" ? 0 : value === "P1" ? 1 : value === "P2" ? 2 : 3
  if (profile === "audit") return auditLabels[rank]
  if (profile === "diligence") return diligenceLabels[rank]
  return value
}

function inputIssue(value: {
  readonly requestID: string
  readonly profile: string
  readonly brief: string
  readonly timeBoxMinutes: number
  readonly revision?: string
  readonly paths?: ReadonlyArray<string>
  readonly fixReview?: { readonly reportID: string; readonly findingIDs: ReadonlyArray<string> }
}): string | undefined {
  if (value.requestID.length > 128) return "request-id"
  if (!accepted(value.profile)) return "profile"
  if (new TextEncoder().encode(value.brief).byteLength > 65536) return "brief"
  if (!Number.isSafeInteger(value.timeBoxMinutes) || value.timeBoxMinutes < 1 || value.timeBoxMinutes > 120) return "time-box"
  if (value.revision !== undefined && revisionIssue(value.revision)) return "revision"
  if (value.paths !== undefined && pathsIssue(value.paths)) return "paths"
  if (value.fixReview !== undefined && fixIssue(value.fixReview)) return "fix-review"
  return undefined
}

function revisionIssue(revision: string): boolean {
  return revision.length > 1024 || revision.includes("\0") || revision.includes("\n") || revision.startsWith("-")
}

function pathsIssue(paths: ReadonlyArray<string>): boolean {
  return paths.length < 1 || paths.length > 256 || paths.some(pathIssue) || new Set(paths).size !== paths.length
}

function pathIssue(path: string): boolean {
  if (path === ".") return false
  if (path.includes("\0") || path.includes("\\") || /^[A-Za-z]:/.test(path) || path.startsWith("/")) return true
  return path.split("/").some((part) => part === "" || part === "." || part === "..")
}

function fixIssue(fixReview: { readonly reportID: string; readonly findingIDs: ReadonlyArray<string> }): boolean {
  return !/^[0-9a-f]{64}$/.test(fixReview.reportID)
    || fixReview.findingIDs.length < 1
    || fixReview.findingIDs.length > 64
    || new Set(fixReview.findingIDs).size !== fixReview.findingIDs.length
}

function hasOwnerBehavioralEval(card: ReviewResultV2.Card): boolean {
  return card.coverage.notExamined.some((entry) =>
    entry.item === "artifact:behavioral-eval" && entry.reason === "owner-permission"
  )
}

function accepted(profile: string): profile is (typeof profiles)[number] {
  return (profiles as readonly string[]).includes(profile)
}

function safeCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function refuse(reason: string): never {
  throw new Error(`engagement-policy: ${reason}`)
}
