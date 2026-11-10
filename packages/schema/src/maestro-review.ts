import { Event } from "./event"
import { Schema } from "effect"
import { PositiveInt, optional } from "./schema"

export namespace Review {
  export const Received = Event.define({
    type: "maestro.review.received",
    durable: { version: 1, aggregate: "sessionID" },
    schema: {
      sessionID: Schema.NonEmptyString,
      projectID: Schema.NonEmptyString,
      validationRecordID: Schema.NonEmptyString,
      workCardHash: Schema.NonEmptyString,
      routedMemberID: Schema.NonEmptyString,
      rosterHash: Schema.NonEmptyString,
      grantHash: Schema.NonEmptyString,
      reviewPolicyHash: Schema.NonEmptyString,
      actor: Schema.Struct({
        version: Schema.Literal("rfc8785-v1"),
        bytes: Schema.NonEmptyString,
        sha256: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
      }),
      reviewerID: Schema.Literal("lucy"),
      reviewMethodVersion: Schema.NonEmptyString,
      artifact: Schema.Struct({
        workCardHash: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
        sha256: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
        baseSHA: Schema.NonEmptyString,
        headSHA: Schema.NonEmptyString,
        worktree: Schema.NonEmptyString,
        changedPaths: Schema.Array(Schema.NonEmptyString),
        bytes: Schema.NonEmptyString,
      }),
      verdict: Schema.Literals(["APPROVE", "FIX_FIRST", "REJECT"]),
      findings: Schema.Array(
        Schema.Struct({ path: Schema.NonEmptyString, line: PositiveInt, message: Schema.NonEmptyString }),
      ),
    },
  })
  export type Received = typeof Received.Type

  const Digest = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/))

  export const Severity = Schema.Literals(["P0", "P1", "P2", "P3"])
  export type Severity = typeof Severity.Type

  export const Confidence = Schema.Literals(["high", "medium", "low"])
  export type Confidence = typeof Confidence.Type

  export const FindingStatus = Schema.Literals(["open", "resolved", "dismissed"])
  export type FindingStatus = typeof FindingStatus.Type

  /** A finding's strongest evidence: a probe that failed, an analyzer rule that hit, or the lines that show it. */
  export const Evidence = Schema.Union([
    Schema.Struct({
      kind: Schema.Literal("probe"),
      option: Schema.NonEmptyString,
      command: Schema.NonEmptyString,
      result: Schema.NonEmptyString,
      uri: optional(Schema.String),
    }),
    Schema.Struct({
      kind: Schema.Literal("tool"),
      pack: Schema.NonEmptyString,
      rule: Schema.NonEmptyString,
      version: Schema.NonEmptyString,
      uri: optional(Schema.String),
    }),
    Schema.Struct({
      kind: Schema.Literal("quote"),
      path: Schema.NonEmptyString,
      startLine: PositiveInt,
      endLine: PositiveInt,
    }),
  ])
  export type Evidence = typeof Evidence.Type

  // `path`, `line` and `message` stay required so receipts recorded before the richer record decode. Every other field
  // is optional on the event; `recordReview` requires them on `review-v2` receipts. Ids (lens, class, node, rule, rungs)
  // are catalog ids of the running build, so they stay open strings. A legacy entry without `severity` counts as P1.
  export interface Finding extends Schema.Schema.Type<typeof Finding> {}
  export const Finding = Schema.Struct({
    path: Schema.NonEmptyString,
    line: PositiveInt,
    message: Schema.NonEmptyString,
    // Stable across review rounds.
    id: optional(Schema.NonEmptyString),
    endLine: optional(PositiveInt),
    severity: optional(Severity),
    confidence: optional(Confidence),
    // Security findings only.
    difficulty: optional(Schema.Literals(["low", "medium", "high"])),
    lens: optional(Schema.NonEmptyString),
    class: optional(Schema.NonEmptyString),
    node: optional(Schema.NonEmptyString),
    rule: optional(Schema.NonEmptyString),
    trigger: optional(Schema.NonEmptyString),
    // Catalog option ids climbed, e.g. ["quote", "probe:regress"].
    rungs: optional(Schema.Array(Schema.NonEmptyString)),
    evidence: optional(Evidence),
    // The added diff line that causes a finding on an unchanged line.
    cause: optional(Schema.Struct({ path: Schema.NonEmptyString, line: PositiveInt })),
    status: optional(FindingStatus),
    dismissedReason: optional(Schema.NonEmptyString),
    suggestedTest: optional(Schema.String),
  })

  /** The outcome of one analyzer item a model read; unread items are never listed. */
  export interface Item extends Schema.Schema.Type<typeof Item> {}
  export const Item = Schema.Struct({
    pack: Schema.NonEmptyString,
    rule: Schema.NonEmptyString,
    fingerprint: Schema.NonEmptyString,
    outcome: Schema.Literals(["confirmed", "refuted", "not-pursued"]),
  })

  // Binds the receipt to the reviewed diff by digest; the server recomputes the diff, so the bytes
  // never have to travel through the model or into the event log.
  export const ReceivedV2 = Event.define({
    type: Received.type,
    durable: { version: 2, aggregate: "sessionID" },
    schema: {
      ...Received.data.fields,
      artifact: Schema.Struct({
        workCardHash: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
        sha256: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
        baseSHA: Schema.NonEmptyString,
        headSHA: Schema.NonEmptyString,
        worktree: Schema.NonEmptyString,
        changedPaths: Schema.Array(Schema.NonEmptyString),
      }),
      // `plan` judges the plan and its committed diff before approval. `code` judges the workers' uncommitted result:
      // its artifact `baseSHA` is the plan review's head and `headSHA` the result written as a Git tree. Receipts
      // recorded before stages existed carry none and read as `plan`.
      stage: optional(Schema.Literals(["plan", "code"])),
      findings: Schema.Array(Finding),
      // Which arsenal produced the receipt: the routing record's and the catalog's digests. Optional so receipts
      // recorded before the routed review decode; `recordReview` requires both and `items` on `review-v2` receipts.
      routingDigest: optional(Digest),
      catalogDigest: optional(Digest),
      items: optional(Schema.Array(Item)),
      // Host routing for a scoped finish. Optional so older receipts decode; absence is not a trust fallback.
      // `routing` is JSON text for Core `ReviewRouting.Record`. Schema does not import Core.
      hostRound: optional(Schema.Struct({
        version: Schema.Literal("host-round-v1"),
        executionTier: Schema.NonEmptyString,
        routing: Schema.NonEmptyString,
      })),
    },
  })
  export type ReceivedV2 = typeof ReceivedV2.Type
}
