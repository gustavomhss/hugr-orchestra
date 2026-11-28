export * as ReviewEngagementArtifactsV2 from "./review-engagement-artifacts"

import { join } from "node:path"
import { Effect, Schema, type Scope } from "effect"
import { CapabilityArtifacts } from "@orchestra/core/capability/artifact/index"
import { Database } from "@orchestra/core/database/database"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import type { SessionStore } from "@orchestra/core/session"
import { SessionMessage } from "@orchestra/core/session/message"
import { Tool } from "@orchestra/core/tool/tool"
import { ReviewEvidenceSchemaV2 } from "./review-engagement-artifact-schema"
import { ReviewEvidenceValidationV2 } from "./review-engagement-artifact-validation"
import { ReviewEvidenceCollectorV2 } from "./review-engagement-artifact-collector"
import { ReviewHistoryEvidenceV2 } from "./review-history-evidence"
import type { ReviewEngagementReportV2 } from "./review-engagement-report"
import { ReviewVariantSchemaV2 } from "./review-variant-schema"
import { ReviewVariantValidationV2 } from "./review-variant-validation"

export const Input = ReviewEvidenceSchemaV2.Input
export type Input = ReviewEvidenceSchemaV2.Input
export const EvidenceState = ReviewEvidenceSchemaV2.EvidenceState
export type EvidenceState = ReviewEvidenceSchemaV2.EvidenceState
export type Sealed = { readonly receiptID: string; readonly bytes: number }
type TerminalValue = { readonly terminal: ReviewEngagementReportV2.Stored; readonly evidence?: EvidenceState }
export type Terminal = TerminalValue & (
  { readonly schema: "review-engagement-state-v1" | "review-engagement-state-v2" } |
  { readonly schema: "review-engagement-state-v3"; readonly identity: { readonly key: string; readonly leadID: string };
    readonly source?: ReviewVariantValidationV2.Authority["source"]; readonly variants: ReviewVariantSchemaV2.VariantJournal } &
  Pick<ReviewVariantValidationV2.Authority, "input" | "budget" | "children">
)
export type Collector = Omit<ReviewEvidenceCollectorV2.Collector, "seal"> & {
  readonly seal: (report: ReviewEngagementReportV2.Stored, host: ReviewEvidenceCollectorV2.Host) => Effect.Effect<Sealed, Tool.Failure>
}
export type PriorData = {
  readonly receipt: ReviewEvidenceSchemaV2.Receipt
  readonly bytes: Uint8Array
  readonly receiptID: string
  readonly context: ReturnType<typeof ReviewEvidenceValidationV2.validate>
}
export type Repository = {
  readonly storage: ReviewEvidenceCollectorV2.Storage
  readonly priorData: (view: Terminal) => Effect.Effect<PriorData, Tool.Failure>
  readonly collectFix: (context: ReviewEvidenceCollectorV2.FixContext) => Effect.Effect<ReviewEvidenceCollectorV2.Collector, never, Scope.Scope>
  readonly collect: (context: ReviewEvidenceCollectorV2.Context) => Effect.Effect<Collector, never, Scope.Scope>
  readonly fixReviewRecipes: (view: Terminal, findingIDs: ReadonlyArray<string>) => Effect.Effect<ReadonlyArray<{ readonly findingID: string; readonly proof: ReviewEvidenceSchemaV2.Proof; readonly recipe: typeof ReviewEvidenceSchemaV2.Recipe.Type }>, Tool.Failure>
  readonly replay: (view: Terminal) => Effect.Effect<string, Tool.Failure>
  readonly resolve: (view: Terminal, input: Input) => Effect.Effect<string, Tool.Failure>
}
type Mint = { readonly reportText: string } & (
  { readonly receiptSchema: "review-engagement-evidence-v1" } |
  { readonly receiptSchema: "review-engagement-evidence-v2"; readonly journalSha256: string }
)
const minted = new WeakMap<Sealed, Mint>()

/** Only a completed publication from this host can enter Store.finish; a structurally similar object is not a seal. */
export function assertBinding(value: Sealed, report: ReviewEngagementReportV2.Stored,
  expectedJournal?: ReviewVariantSchemaV2.VariantJournal): EvidenceState {
  const binding = minted.get(value)
  if (!binding || binding.reportText !== report.text) throw ReviewEvidenceSchemaV2.failure("corrupt", "completion has no matching sealed evidence")
  if (binding.receiptSchema === "review-engagement-evidence-v1" ? expectedJournal !== undefined
    : expectedJournal === undefined || expectedJournal.phase !== "closed" ||
      binding.journalSha256 !== ReviewVariantSchemaV2.digest(expectedJournal))
    throw ReviewEvidenceSchemaV2.failure("corrupt", "sealed receipt version or closed variant journal differs")
  return { policy: "required-completed-v1", receiptID: value.receiptID, bytes: value.bytes }
}

function authority(view: Terminal, receipt: ReviewEvidenceSchemaV2.Receipt): ReviewVariantValidationV2.Authority | undefined {
  if (view.schema === "review-engagement-state-v2" && receipt.schema === "review-engagement-evidence-v1") return undefined
  if (view.schema !== "review-engagement-state-v3" || receipt.schema !== "review-engagement-evidence-v2" || !view.source)
    throw ReviewEvidenceSchemaV2.failure("corrupt", "receipt version differs from its durable admission")
  return { namespace: view.identity.key, leadID: view.identity.leadID, children: view.children,
    input: view.input, budget: view.budget, source: view.source, journal: view.variants }
}

export function make(input: { readonly database: Database.Interface; readonly fs: FSUtil.Interface; readonly global?: Global.Interface;
  readonly readMessage?: SessionStore.Interface["message"] }): Effect.Effect<Repository> {
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
      if (view.schema === "review-engagement-state-v1") return yield* ReviewEvidenceSchemaV2.failure("unavailable", "legacy-record")
      if (!view.evidence) return yield* ReviewEvidenceSchemaV2.failure("missing", "completed record has no required evidence policy or reference")
      const reference = view.evidence
      if (!reference.receiptID || reference.bytes === undefined) return yield* ReviewEvidenceSchemaV2.failure("missing", "completed record has no required receipt reference")
      yield* parse(() => Schema.decodeUnknownSync(EvidenceState)(reference, ReviewEvidenceSchemaV2.strict))
      const bytes = yield* storage.read(reference.receiptID, reference.bytes, "application/json")
      const receipt = yield* parse(() => ReviewEvidenceValidationV2.read(bytes, view.terminal))
      const bound = yield* parse(() => authority(view, receipt))
      return { receipt, bytes, receiptID: reference.receiptID, authority: bound }
    })
    const complete = (report: ReviewEngagementReportV2.Stored, receipt: ReviewEvidenceSchemaV2.Receipt,
      bound?: ReviewVariantValidationV2.Authority) => Effect.gen(function* () {
      const bodies = new Map(yield* Effect.forEach(receipt.artifacts, (artifact) => storage.read(artifact.sha256, artifact.bytes, artifact.mime)
        .pipe(Effect.map((bytes) => [artifact.artifactID, bytes] as const))))
      const context = yield* parse(() => {
        const context = ReviewEvidenceValidationV2.validate(receipt, report, bodies)
        if (receipt.schema !== "review-engagement-evidence-v2") return context
        if (!bound) throw ReviewEvidenceSchemaV2.failure("corrupt", "variant receipt has no durable authority")
        ReviewVariantValidationV2.validate(receipt, report, bodies, bound)
        return context
      }).pipe(Effect.mapError((error) => receipt.schema === "review-engagement-evidence-v2" &&
        error.metadata?.reason === "engagement-report-invalid"
        ? ReviewEvidenceSchemaV2.failure("corrupt", error.message) : error))
      if (context.history.length) {
        const readMessage = input.readMessage
        if (!readMessage) return yield* ReviewEvidenceSchemaV2.failure("corrupt", "history native message reader is unavailable")
        // Point reads include original messages hidden by compaction. Reuse only within this fresh public read.
        const messages = new Map<string, { readonly sessionID: string; readonly message: SessionMessage.Message }>()
        for (const history of context.history) {
          const id = history.proof.assistantMessageID
          const messageID = yield* parse(() => SessionMessage.ID.make(id))
          const row = messages.get(id) ?? (yield* readMessage(messageID))
          if (!row) return yield* ReviewEvidenceSchemaV2.failure("corrupt", "history native completed message is unavailable")
          yield* parse(() => ReviewHistoryEvidenceV2.settled(history, row.sessionID, row.message))
          messages.set(id, row)
        }
      }
      return { bodies, context }
    })
    const bounded = <A>(effect: Effect.Effect<A, Tool.Failure>) => effect.pipe(Effect.timeoutOrElse({ duration: "60 seconds",
      orElse: () => Effect.fail(ReviewEvidenceSchemaV2.failure("timeout", "evidence read exceeded its bounded deadline")) }))
    const repository: Repository = {
      storage,
      priorData: (view) => Effect.gen(function* () {
        const held = yield* retained(view)
        const { context } = yield* complete(view.terminal, held.receipt, held.authority)
        return { receipt: held.receipt, bytes: held.bytes, receiptID: held.receiptID, context }
      }),
      collectFix: (context) => ReviewEvidenceCollectorV2.make(context, storage),
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
          const bound = verified.schema === "review-engagement-evidence-v2" ? yield* context.authority : undefined
          yield* complete(report, verified, bound)
          yield* context.active
          const value = Object.freeze({ receiptID, bytes: bytes.byteLength })
          minted.set(value, verified.schema === "review-engagement-evidence-v1"
            ? { reportText: report.text, receiptSchema: verified.schema }
            : { reportText: report.text, receiptSchema: verified.schema,
              journalSha256: ReviewVariantSchemaV2.digest(ReviewVariantSchemaV2.projectJournal(verified.variants)) })
          return value
        }) }
        return result
      }),
      fixReviewRecipes: (view, findingIDs) => bounded(Effect.gen(function* () {
        const noRecipe = () => new Tool.Failure({ message: "engagement-fix-review-no-recipe: no uniquely qualified retained recipe",
          metadata: { reason: "engagement-fix-review-no-recipe" } })
        if (view.schema === "review-engagement-state-v1" || findingIDs.length === 0 || new Set(findingIDs).size !== findingIDs.length)
          return yield* noRecipe()
        const held = yield* retained(view)
        const { context } = yield* complete(view.terminal, held.receipt, held.authority)
        return yield* parse(() => findingIDs.map((findingID) => {
          const matches = view.terminal.value.report?.findings.filter((finding) => finding.id === findingID) ?? []
          const finding = matches[0]
          if (matches.length !== 1 || !finding || finding.evidence.kind !== "tool") throw noRecipe()
          const evidence = finding.evidence
          const checks = context.operation.checks.filter((check) => check.pack === evidence.pack && check.version === evidence.version && check.uri === evidence.uri)
          const proofs = context.proofs.filter((proof) => proof.analysisOperationID === context.operation.operationID &&
            context.artifacts.find((artifact) => artifact.artifactID === proof.stdoutArtifactID)?.uri === evidence.uri)
          if (checks.length !== 1 || proofs.length !== 1 || !checks[0].proofIDs.includes(proofs[0].proofID) ||
            !checks[0].artifactIDs.includes(proofs[0].stdoutArtifactID) || !["pass", "fail"].includes(checks[0].status)) throw noRecipe()
          const proof = ReviewEvidenceValidationV2.qualifiedTool(context, finding)
          const recipe = context.recipes.get(proof.proofID)
          if (!recipe || proof !== proofs[0] || proof.side !== "head" || proof.sourceSha256 !== context.source.sha256 ||
            proof.runtime.target !== "linux-x64" || recipe.template !== "oxlint-host-sarif" ||
            !recipe.files.some((file) => file.path === finding.path) || ![0, 1].includes(proof.outcome.exitCode ?? -1) ||
            proof.outcome.timedOut || proof.outcome.overflow || proof.outcome.memoryExceeded || proof.outcome.failure ||
            proof.outcome.stdout.truncated || proof.outcome.stderr.truncated) throw noRecipe()
          return { findingID, proof, recipe }
        }))
      })),
      replay: (view) => {
        if (view.terminal.value.status !== "completed" || view.schema === "review-engagement-state-v1") return Effect.succeed(view.terminal.text)
        return bounded(Effect.gen(function* () {
          const held = yield* retained(view)
          yield* complete(view.terminal, held.receipt, held.authority)
          return view.terminal.text
        }))
      },
      resolve: (view, request) => bounded(Effect.gen(function* () {
        if (request.reportID !== view.terminal.value.reportID) return yield* ReviewEvidenceSchemaV2.failure("not-found", "report is unavailable")
        const held = yield* retained(view)
        return yield* resolveEvidence(request, { ...held, bodies: complete(view.terminal, held.receipt, held.authority).pipe(
          Effect.map((validated) => validated.bodies)) })
      })),
    }
    return repository
  })
}

/** Membership precedes body validation for ordinary and fix evidence pages. */
export function resolveEvidence(request: Input, held: {
  readonly bytes: Uint8Array
  readonly receiptID: string
  readonly receipt: Pick<ReviewEvidenceSchemaV2.ReceiptV1, "operations" | "hostProofs"> & {
    readonly artifacts: readonly { readonly artifactID: string; readonly sha256: string; readonly bytes: number; readonly mime: string }[]
    readonly history?: readonly ReviewHistoryEvidenceV2.Reference[]
  }
  readonly bodies: Effect.Effect<ReviewEvidenceSchemaV2.Bodies, Tool.Failure>
}) {
  return Effect.gen(function* () {
    const manifest = { artifactID: held.receiptID, sha256: held.receiptID, bytes: held.bytes.byteLength, mime: "application/json" }
    if (request.op === "manifest") {
      yield* held.bodies
      return ReviewEvidenceSchemaV2.canonical({ schema: "review-engagement-evidence-index-v1", reportID: request.reportID,
        receiptID: held.receiptID, manifest, counts: { operations: held.receipt.operations.length + (held.receipt.history?.length ?? 0),
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
    const bodies = yield* held.bodies
    const bytes = request.artifactID === held.receiptID ? held.bytes : bodies.get(request.artifactID)
    if (!bytes) return yield* ReviewEvidenceSchemaV2.failure("corrupt", "required body is unavailable")
    const slice = bytes.subarray(offset, offset + ReviewEvidenceSchemaV2.limits.page)
    const nextOffset = offset + slice.byteLength
    return ReviewEvidenceSchemaV2.canonical({ schema: "review-engagement-evidence-page-v1", reportID: request.reportID,
      receiptID: held.receiptID, artifactID: descriptor.artifactID, sha256: descriptor.sha256,
      bytes: descriptor.bytes, mime: descriptor.mime, offset, encoding: "base64", data: Buffer.from(slice).toString("base64"),
      ...(nextOffset < bytes.byteLength ? { next: Buffer.from(ReviewEvidenceSchemaV2.canonical({ ...identity, offset: nextOffset })).toString("base64url") } : {}) })
  })
}
