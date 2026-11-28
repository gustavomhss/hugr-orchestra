export * as ReviewEngagementArtifactsV2 from "./review-engagement-artifacts"

import { join } from "node:path"
import { Effect, Schema, type Scope } from "effect"
import { CapabilityArtifacts } from "@orchestra/core/capability/artifact/index"
import { Database } from "@orchestra/core/database/database"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { Tool } from "@orchestra/core/tool/tool"
import { ReviewEvidenceSchemaV2 } from "./review-engagement-artifact-schema"
import { ReviewEvidenceValidationV2 } from "./review-engagement-artifact-validation"
import { ReviewEvidenceCollectorV2 } from "./review-engagement-artifact-collector"
import type { ReviewEngagementReportV2 } from "./review-engagement-report"

export const Input = ReviewEvidenceSchemaV2.Input
export type Input = ReviewEvidenceSchemaV2.Input
export const EvidenceState = ReviewEvidenceSchemaV2.EvidenceState
export type EvidenceState = ReviewEvidenceSchemaV2.EvidenceState
export type Sealed = { readonly receiptID: string; readonly bytes: number }
export type Terminal = { readonly terminal: ReviewEngagementReportV2.Stored; readonly evidence?: EvidenceState }
export type Collector = Omit<ReviewEvidenceCollectorV2.Collector, "seal"> & {
  readonly seal: (report: ReviewEngagementReportV2.Stored, host: ReviewEvidenceCollectorV2.Host) => Effect.Effect<Sealed, Tool.Failure>
}
export type Repository = {
  readonly collect: (context: ReviewEvidenceCollectorV2.Context) => Effect.Effect<Collector, never, Scope.Scope>
  readonly replay: (view: Terminal) => Effect.Effect<string, Tool.Failure>
  readonly resolve: (view: Terminal, input: Input) => Effect.Effect<string, Tool.Failure>
}
const minted = new WeakMap<Sealed, string>()

/** Only a completed publication from this host can enter Store.finish; a structurally similar object is not a seal. */
export function assertBinding(value: Sealed, report: ReviewEngagementReportV2.Stored): EvidenceState {
  if (minted.get(value) !== report.text) throw ReviewEvidenceSchemaV2.failure("corrupt", "completion has no matching sealed evidence")
  return { policy: "required-completed-v1", receiptID: value.receiptID, bytes: value.bytes }
}

export function make(input: { readonly database: Database.Interface; readonly fs: FSUtil.Interface; readonly global?: Global.Interface }): Effect.Effect<Repository> {
  return Effect.gen(function* () {
    // Legacy replay needs neither an artifact directory nor a synthetic persistent storage identity.
    const settings = yield* Effect.cached(Effect.suspend(() => {
      const storageID = input.database.storageID
      if (!storageID || !input.global) return Effect.fail(ReviewEvidenceSchemaV2.failure("storage-unavailable", "persistent storage identity or data root is unavailable"))
      return CapabilityArtifacts.storage({ root: join(input.global.data, "lucy-evidence", ReviewEvidenceSchemaV2.hash(storageID)), boundedBytes: ReviewEvidenceSchemaV2.limits.body,
        quota: ReviewEvidenceSchemaV2.limits.total }).pipe(
        Effect.provideService(Database.Service, input.database), Effect.provideService(FSUtil.Service, input.fs),
        Effect.provideService(Global.Service, input.global),
        Effect.mapError(() => ReviewEvidenceSchemaV2.failure("storage-unavailable", "durable artifact storage is unavailable")),
      )
    }))
    const storage: ReviewEvidenceCollectorV2.Storage = {
      publish: (bytes, mime) => Effect.gen(function* () {
        const { blobs } = yield* settings
        return yield* blobs.publish(bytes, mime).pipe(Effect.mapError((error) => ReviewEvidenceSchemaV2.failure(
          error.code === "artifact_corrupt" ? "corrupt" : "storage-unavailable", "durable artifact publication failed")))
      }),
      read: (sha256, bytes, mime) => Effect.gen(function* () {
        const { blobs } = yield* settings
        return yield* blobs.read(sha256, bytes, mime).pipe(Effect.mapError(() => ReviewEvidenceSchemaV2.failure("corrupt", "required artifact is unavailable or corrupt")))
      }),
    }
    const parse = <A>(body: () => A) => Effect.try({ try: body,
      catch: (error) => error instanceof Tool.Failure ? error : ReviewEvidenceSchemaV2.failure("corrupt", String(error)) })
    const retained = (view: Terminal) => Effect.gen(function* () {
      if (view.terminal.value.status !== "completed") return yield* ReviewEvidenceSchemaV2.failure("unavailable", "terminal-status")
      if (!view.evidence) return yield* ReviewEvidenceSchemaV2.failure("unavailable", "legacy-record")
      const reference = view.evidence
      if (!reference.receiptID || reference.bytes === undefined) return yield* ReviewEvidenceSchemaV2.failure("missing", "completed record has no required receipt reference")
      yield* parse(() => Schema.decodeUnknownSync(EvidenceState)(reference, ReviewEvidenceSchemaV2.strict))
      const bytes = yield* storage.read(reference.receiptID, reference.bytes, "application/json")
      const receipt = yield* parse(() => ReviewEvidenceValidationV2.read(bytes, view.terminal))
      return { receipt, bytes, receiptID: reference.receiptID }
    })
    const complete = (view: Terminal, receipt: ReviewEvidenceSchemaV2.Receipt) => Effect.gen(function* () {
      const bodies = new Map(yield* Effect.forEach(receipt.artifacts, (artifact) => storage.read(artifact.sha256, artifact.bytes, artifact.mime)
        .pipe(Effect.map((bytes) => [artifact.artifactID, bytes] as const))))
      yield* parse(() => ReviewEvidenceValidationV2.validate(receipt, view.terminal, bodies))
      return bodies
    })
    const bounded = <A>(effect: Effect.Effect<A, Tool.Failure>) => effect.pipe(Effect.timeoutOrElse({ duration: "60 seconds",
      orElse: () => Effect.fail(ReviewEvidenceSchemaV2.failure("timeout", "evidence read exceeded its bounded deadline")) }))
    const repository: Repository = {
      collect: (context) => Effect.gen(function* () {
        const collector = yield* ReviewEvidenceCollectorV2.make(context, storage)
        const result: Collector = { ...collector, seal: (report, host) => Effect.gen(function* () {
          const receipt = yield* collector.seal(report, host)
          const bytes = yield* parse(() => Buffer.from(ReviewEvidenceSchemaV2.canonical(receipt)))
          if (bytes.byteLength > ReviewEvidenceSchemaV2.limits.receipt) return yield* ReviewEvidenceSchemaV2.failure("bound-exceeded", "receipt")
          yield* context.active
          const receiptID = yield* storage.publish(bytes, "application/json")
          // Verify the published receipt and all of its required bodies before the small terminal CAS.
          const published = yield* storage.read(receiptID, bytes.byteLength, "application/json")
          const verified = yield* parse(() => ReviewEvidenceValidationV2.read(published, report))
          yield* complete({ terminal: report }, verified)
          yield* context.active
          const value = Object.freeze({ receiptID, bytes: bytes.byteLength })
          minted.set(value, report.text)
          return value
        }) }
        return result
      }),
      replay: (view) => {
        if (view.terminal.value.status !== "completed" || view.evidence === undefined) return Effect.succeed(view.terminal.text)
        return bounded(Effect.gen(function* () {
          const held = yield* retained(view)
          yield* complete(view, held.receipt)
          return view.terminal.text
        }))
      },
      resolve: (view, request) => bounded(Effect.gen(function* () {
        if (request.reportID !== view.terminal.value.reportID) return yield* ReviewEvidenceSchemaV2.failure("not-found", "report is unavailable")
        const held = yield* retained(view)
        const manifest = { artifactID: held.receiptID, sha256: held.receiptID, bytes: held.bytes.byteLength, mime: "application/json" }
        if (request.op === "manifest") {
          yield* complete(view, held.receipt)
          return ReviewEvidenceSchemaV2.canonical({ schema: "review-engagement-evidence-index-v1", reportID: request.reportID,
            receiptID: held.receiptID, manifest, counts: { operations: held.receipt.operations.length,
              artifacts: held.receipt.artifacts.length, hostProofs: held.receipt.hostProofs.length } })
        }
        // Membership precedes every producer-body read. A digest or URI is not an authority.
        const descriptor = request.artifactID === held.receiptID ? manifest
          : held.receipt.artifacts.find((artifact) => artifact.artifactID === request.artifactID)
        if (!descriptor) return yield* ReviewEvidenceSchemaV2.failure("not-found", "artifact is unavailable")
        const identity = { schema: "review-engagement-evidence-cursor-v1" as const, reportID: request.reportID,
          receiptID: held.receiptID, artifactID: descriptor.artifactID, sha256: descriptor.sha256 }
        const offset = yield* Effect.try({ try: () => {
          if (request.cursor === undefined) return 0
          if (request.cursor.length > ReviewEvidenceSchemaV2.limits.cursor || !/^[A-Za-z0-9_-]+$/.test(request.cursor)) throw new Error("invalid encoding")
          const bytes = Buffer.from(request.cursor, "base64url")
          const cursor = Schema.decodeUnknownSync(ReviewEvidenceSchemaV2.Cursor)(ReviewEvidenceSchemaV2.json(bytes), ReviewEvidenceSchemaV2.strict)
          const { offset, ...binding } = cursor
          if (Buffer.from(ReviewEvidenceSchemaV2.canonical(cursor)).toString("base64url") !== request.cursor ||
            offset % ReviewEvidenceSchemaV2.limits.page !== 0 || offset >= descriptor.bytes ||
            !ReviewEvidenceSchemaV2.same(binding, identity)) throw new Error("cursor binding differs")
          return offset
        }, catch: () => ReviewEvidenceSchemaV2.failure("cursor-invalid", "cursor does not name this authorized page") })
        const bodies = yield* complete(view, held.receipt)
        const bytes = request.artifactID === held.receiptID ? held.bytes : bodies.get(request.artifactID)
        if (!bytes) return yield* ReviewEvidenceSchemaV2.failure("corrupt", "required body is unavailable")
        const slice = bytes.subarray(offset, offset + ReviewEvidenceSchemaV2.limits.page)
        const nextOffset = offset + slice.byteLength
        return ReviewEvidenceSchemaV2.canonical({ schema: "review-engagement-evidence-page-v1", reportID: request.reportID,
          receiptID: held.receiptID, artifactID: descriptor.artifactID, sha256: descriptor.sha256,
          bytes: descriptor.bytes, mime: descriptor.mime, offset, encoding: "base64", data: Buffer.from(slice).toString("base64"),
          ...(nextOffset < bytes.byteLength ? { next: Buffer.from(ReviewEvidenceSchemaV2.canonical({ ...identity, offset: nextOffset })).toString("base64url") } : {}) })
      })),
    }
    return repository
  })
}
