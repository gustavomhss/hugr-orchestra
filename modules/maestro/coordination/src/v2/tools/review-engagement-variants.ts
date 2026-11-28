export * as ReviewEngagementVariantsV2 from "./review-engagement-variants"

import { Effect } from "effect"
import { Tool } from "@orchestra/core/tool/tool"
import type { ReviewEvidenceCollectorV2 } from "../workflow/review-engagement-artifact-collector"
import { ReviewEvidenceSchemaV2 } from "../workflow/review-engagement-artifact-schema"
import type { ReviewEngagementEvidenceV2 } from "../workflow/review-engagement-evidence"
import type { ReviewEngagementSourceV2 } from "../workflow/review-engagement-source"
import { ReviewVariantSchemaV2 } from "../workflow/review-variant-schema"
import type { ReviewVariantsV2 } from "../workflow/review-variants"
import type { ReviewEngagementStoreV2 } from "./review-engagement-store"

type Input = {
  readonly ticket: ReviewEngagementStoreV2.Ticket
  readonly store: ReviewEngagementStoreV2.Interface
  readonly collector: Omit<ReviewEvidenceCollectorV2.Collector, "seal">
  readonly source: ReviewEngagementEvidenceV2.Prepared
  readonly read: (path: string, startLine: number, endLine: number) => ReturnType<typeof ReviewEngagementSourceV2.read>
}

/** Owns the durable journal and captured reader; the coordinator cannot acquire another source or deadline. */
export function make(input: Input): ReviewVariantsV2.Port {
  const readRegion: ReviewEvidenceCollectorV2.ReadRegion = (path, startLine, endLine) => input.read(path, startLine, endLine).pipe(
    Effect.map((value) => {
      const region = { sourceSha256: input.source.sha256, path: value.path, oid: value.oid,
        blobSha256: value.sha256, startLine: value.startLine, endLine: value.endLine,
        text: value.text, textSha256: ReviewEvidenceSchemaV2.hash(value.text) }
      return { regionID: ReviewVariantSchemaV2.regionID(region), ...region }
    }),
  )
  const running = (record: ReviewEngagementStoreV2.Record) => Effect.gen(function* () {
    if (record.state === "terminal") return yield* new Tool.Failure({
      message: "engagement-expired: variant admission is closed", metadata: { reason: "engagement-expired" },
    })
    if (record.owner !== input.ticket.owner || record.identity.key !== input.ticket.identity.key)
      return yield* new Tool.Failure({ message: "engagement-owner-lost: variant journal ownership changed",
        metadata: { reason: "engagement-owner-lost" } })
    if (record.schema !== "review-engagement-state-v3" || record.source?.sha256 !== input.source.sha256)
      return yield* ReviewEvidenceSchemaV2.failure("corrupt", "variant journal lost its captured admission")
    return record
  })
  return {
    validateSeeds: (values, captured) => input.collector.validateVariantSeeds(values, captured === undefined ? readRegion
      : (path, startLine, endLine) => Effect.suspend(() => {
        const region = captured.find((region) => region.path === path && region.startLine === startLine && region.endLine === endLine)
        return region ? Effect.succeed(region) : Effect.fail(ReviewEvidenceSchemaV2.failure("corrupt", "confirmed variant has no pre-read exact region"))
      })),
    reserveVariant: (seed) => Effect.gen(function* () {
      const record = yield* running(yield* input.store.reserveVariant(input.ticket, { seed }))
      const reservation = record.variants.reservations.at(-1)
      if (!reservation || reservation.status !== "reserved" || !ReviewVariantSchemaV2.same(reservation.seed, seed))
        return yield* ReviewEvidenceSchemaV2.failure("corrupt", "variant reservation was not retained")
      return { generationID: reservation.generationID, ordinal: reservation.ordinal, sourceSha256: reservation.sourceSha256,
        seed: reservation.seed, reservedAt: reservation.reservedAt, proposalKey: reservation.proposalKey }
    }),
    settleVariant: (generation) => input.store.settleVariant(input.ticket, { generation }).pipe(Effect.flatMap(running), Effect.asVoid),
    closeVariants: (stop) => input.store.closeVariants(input.ticket, { stop }).pipe(Effect.flatMap(running), Effect.asVoid),
    readRegion,
    turn: (sessionID, turnKey) => input.collector.variantTurn(sessionID,
      ReviewVariantSchemaV2.promptID(input.ticket.identity.key, sessionID, turnKey)),
    recordVariants: input.collector.recordVariants,
    check: input.collector.gaps().pipe(Effect.asVoid),
  }
}
