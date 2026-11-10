export * as ReviewRoundV2 from "./review-round"

import { Option, Schema } from "effect"
import { ReviewRouting } from "@orchestra/core/review/routing"
import type { MaestroEvent } from "@orchestra/schema/maestro-event"
import { ReviewResultV2 } from "../governance/review-result"

// Durable host routing on the receipt. Not a private store, a model input, or a card parse.
// `executionTier` is the fanout's captured run tier. A later catalog must not reinterpret it.

export const VERSION = "host-round-v1"
export const LIMIT = 4 * 1024 * 1024

const decodeRouting = Schema.decodeUnknownOption(ReviewRouting.Record)
const decodeJson = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)
const decodeFinding = Schema.decodeUnknownOption(ReviewResultV2.Finding)
const strict = { onExcessProperty: "error" } as const

export type HostRound = {
  readonly version: typeof VERSION
  readonly executionTier: string
  readonly routing: string
}

type CommonBound = {
  readonly reviewMethodVersion: string
  readonly routingDigest?: string
  readonly catalogDigest?: string
}

type Bound = CommonBound

export function publish(routing: ReviewRouting.Record, bound: Bound & { readonly executionTier?: string }):
  | { readonly status: "ok"; readonly hostRound: HostRound }
  | { readonly status: "corrupt" | "mismatch" | "too-large" } {
  const decoded = Option.getOrUndefined(decodeRouting(routing, strict))
  if (!decoded) return { status: "corrupt" }
  if (!bound.executionTier || !agrees(decoded, bound.executionTier, bound)) return { status: "mismatch" }
  const text = canonicalJson(decoded)
  if (Buffer.byteLength(text, "utf8") > LIMIT) return { status: "too-large" }
  return { status: "ok", hostRound: { version: VERSION, executionTier: bound.executionTier, routing: text } }
}

export function read(receipt: {
  readonly reviewMethodVersion: string
  readonly routingDigest?: string
  readonly catalogDigest?: string
  readonly hostRound?: { readonly version: string; readonly executionTier?: string; readonly routing: string }
  readonly findings: ReadonlyArray<MaestroEvent.Review.Finding>
}):
  | { readonly status: "ok"; readonly routing: ReviewRouting.Record; readonly findings: ReadonlyArray<ReviewResultV2.Finding>; readonly executionTier: string }
  | { readonly status: "unavailable" | "corrupt" | "mismatch" } {
  if (!receipt.hostRound) return { status: "unavailable" }
  if (receipt.hostRound.version !== VERSION || !receipt.hostRound.executionTier || Buffer.byteLength(receipt.hostRound.routing, "utf8") > LIMIT)
    return { status: "corrupt" }
  const routing = Option.getOrUndefined(Option.flatMap(decodeJson(receipt.hostRound.routing), (value) => decodeRouting(value, strict)))
  if (!routing) return { status: "corrupt" }
  if (!agrees(routing, receipt.hostRound.executionTier, receipt)) return { status: "mismatch" }
  const findings = receipt.findings.flatMap((finding) => Option.toArray(decodeFinding(finding, strict)))
  if (findings.length !== receipt.findings.length) return { status: "corrupt" }
  return { status: "ok", routing, findings, executionTier: receipt.hostRound.executionTier }
}

function agrees(routing: ReviewRouting.Record, executionTier: string, bound: CommonBound) {
  const catalog = bound.catalogDigest?.replace(/^sha256:/, "")
  if (bound.routingDigest === undefined || catalog === undefined) return false
  if (ReviewResultV2.method({ profile: routing.profile.id, tier: executionTier }) !== bound.reviewMethodVersion) return false
  if (bound.routingDigest !== ReviewRouting.digest(routing)) return false
  return catalog === routing.catalog
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .filter((item) => item[1] !== undefined)
      .sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0))
      .map((item) => `${JSON.stringify(item[0])}:${canonicalJson(item[1])}`)
      .join(",")}}`
  }
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string")
    return JSON.stringify(value)
  throw new Error("host-round-corrupt")
}
