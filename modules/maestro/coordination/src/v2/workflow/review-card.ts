export * as ReviewCardV2 from "./review-card"

import { isDeepStrictEqual } from "node:util"
import { Option, Schema } from "effect"
import { ReviewRouting } from "@orchestra/core/review/routing"
import type { MaestroEvent } from "@orchestra/schema/maestro-event"
import { ReviewResultV2 } from "../governance/review-result"
import { ReviewChecksV2 } from "./review-checks"

export class ValidationError extends Error {
  override readonly name = "ReviewCardValidationError"
  constructor(readonly reason: "malformed-card" | "routing-mismatch" | "scope-mismatch" | "unverified-finding" | "verdict-mismatch") {
    super(reason)
  }
}

export type Confirmed = {
  readonly id: string
  readonly path: string
  readonly line: number
  readonly endLine?: number
  readonly severity: string
  readonly class: string
  readonly node: string
  readonly lens: string
  // Host selects evidence.rule for tool evidence, otherwise the candidate's class.
  readonly rule: string
  readonly trigger: string
  readonly rungs: ReadonlyArray<string>
  readonly evidence: MaestroEvent.Review.Evidence
}

export function validate(reply: string, expected: {
  readonly routing: ReviewRouting.Record
  readonly scope: { readonly base: string; readonly head: string; readonly files: number; readonly changedLines: number }
  readonly verdictRequired?: boolean
  readonly confirmed?: ReadonlyArray<Confirmed>
  readonly checkFacts: ReviewChecksV2.Facts
}): ReviewResultV2.Card {
  const card = ReviewResultV2.parse(reply)
  if (!card) throw new ValidationError("malformed-card")
  if (
    !isDeepStrictEqual(card.routing, expected.routing) ||
    ReviewRouting.digest(card.routing) !== ReviewRouting.digest(expected.routing) ||
    card.profile !== expected.routing.profile.id || card.tier !== ReviewRouting.tier(expected.routing) ||
    !isDeepStrictEqual(card.overlays, expected.routing.overlays.map((overlay) => overlay.id))
  ) throw new ValidationError("routing-mismatch")
  if (!isDeepStrictEqual(card.scope, expected.scope)) throw new ValidationError("scope-mismatch")
  if (card.outcome === "blocked" && card.blockers.length === 0) throw new ValidationError("verdict-mismatch")
  if (card.outcome === "done" && expected.verdictRequired !== false && card.verdict === undefined)
    throw new ValidationError("verdict-mismatch")
  validateFindings(card.findings, { quick: ReviewRouting.tier(expected.routing) === "quick", confirmed: expected.confirmed })
  if (card.outcome === "done" && card.verdict === "APPROVE" &&
    card.findings.some((finding) => finding.status === "open" && ["P0", "P1"].includes(finding.severity))
  ) throw new ValidationError("verdict-mismatch")
  if (card.outcome === "done" && card.verdict === "FIX_FIRST" &&
    !card.findings.some((finding) => finding.status === "open" && ["P0", "P1"].includes(finding.severity))
  ) throw new ValidationError("verdict-mismatch")
  ReviewChecksV2.validate(card, expected.checkFacts)
  return card
}

const decodeFinding = Schema.decodeUnknownOption(ReviewResultV2.Finding)
const strict = { onExcessProperty: "error" } as const

// Receipt findings decode as card findings; omitted K1 fields are not inferred. Quick rungs must all be `quote`.
// Host comparison is exact, including rungs and evidence. Quote bytes are not read here.
export function validateFindings(
  findings: ReadonlyArray<MaestroEvent.Review.Finding>,
  expected: { readonly quick: boolean; readonly confirmed?: ReadonlyArray<Confirmed> },
): void
export function validateFindings(
  findings: ReadonlyArray<ReviewResultV2.Finding>,
  expected: { readonly quick: boolean; readonly confirmed?: ReadonlyArray<Confirmed> },
): void
export function validateFindings(
  findings: ReadonlyArray<MaestroEvent.Review.Finding | ReviewResultV2.Finding>,
  expected: { readonly quick: boolean; readonly confirmed?: ReadonlyArray<Confirmed> },
): void {
  const decoded = findings.map(readFinding)
  if (!expected.quick && expected.confirmed === undefined) throw new ValidationError("unverified-finding")
  if (expected.confirmed && new Set(expected.confirmed.map((item) => item.id)).size !== expected.confirmed.length)
    throw new ValidationError("unverified-finding")
  const ids = decoded.map((finding) => finding.id)
  if (new Set(ids).size !== ids.length) throw new ValidationError("unverified-finding")
  if (expected.confirmed?.some((finding) => ids.filter((id) => id === finding.id).length !== 1))
    throw new ValidationError("unverified-finding")
  for (const finding of decoded) {
    if (finding.status !== "open") throw new ValidationError("unverified-finding")
    if (expected.quick && !quoted(finding)) throw new ValidationError("unverified-finding")
    if (expected.confirmed && !expected.confirmed.some((item) => sameConfirmed(item, finding)))
      throw new ValidationError("unverified-finding")
  }
}

function readFinding(finding: MaestroEvent.Review.Finding | ReviewResultV2.Finding) {
  const decoded = Option.getOrUndefined(decodeFinding(finding, strict))
  if (!decoded) throw new ValidationError("unverified-finding")
  return decoded
}

function quoted(finding: ReviewResultV2.Finding) {
  if (finding.severity !== "P0" && finding.severity !== "P1") return false
  if (finding.rungs.length === 0 || finding.rungs.some((rung) => rung !== "quote")) return false
  if (finding.evidence.kind !== "quote") return false
  return finding.evidence.path === finding.path &&
    finding.evidence.startLine === finding.line &&
    finding.evidence.endLine === (finding.endLine ?? finding.line)
}

function sameConfirmed(item: Confirmed, finding: ReviewResultV2.Finding) {
  return item.id === finding.id && item.path === finding.path && item.line === finding.line && item.endLine === finding.endLine &&
    item.severity === finding.severity && item.class === finding.class && item.node === finding.node &&
    item.lens === finding.lens && item.rule === finding.rule && item.trigger === finding.trigger &&
    isDeepStrictEqual(item.rungs, finding.rungs) && isDeepStrictEqual(item.evidence, finding.evidence)
}
