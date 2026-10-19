export * as ResearchRecords from "./records"

import { Capability } from "@orchestra/schema/capability"
import { Research } from "@orchestra/schema/research"
import { ResearchEvent } from "@orchestra/schema/research-event"
import { Cause, Context, Effect, Exit, Layer, Schema } from "effect"
import { and, asc, eq } from "drizzle-orm"
import { EventTable } from "../event/sql"
import { Database } from "../database/database"
import { EventV2 } from "../event"
import { makeGlobalNode } from "../effect/app-node"
import type { Tool } from "../tool/tool"
import { ResearchArtifacts } from "./artifacts"
import { ResearchBinding } from "./binding"
import { ResearchLedger } from "./ledger"
import { Locate } from "../research-toolkit/locate"

export type CaptureInput = {
  readonly origin: Research.SourceReceipt["origin"]
  readonly representation: typeof Research.Representation.Type
  readonly mediaType: string
  readonly content: Uint8Array | string
  readonly complete: boolean
  readonly derivedFrom?: Research.SourceRef
  readonly transformation?: string
  readonly atlas?: Research.SourceReceipt["atlas"]
  readonly observed?: Research.SourceReceipt["observed"]
}
export type Mutation = {
  readonly receipt: Research.MutationReceipt
  readonly record?: Research.Record
  readonly document?: Research.DocumentReceipt
}
export type View = Research.Record | Research.ArtifactPage | Research.Corpus | {
  readonly attempts: readonly Research.AttemptReceipt[]
  readonly complete: boolean
  readonly cursor?: string
} | {
  readonly records: readonly Research.Record[]
  readonly complete: boolean
  readonly cursor?: string
} | {
  readonly source: Research.SourceRef
  readonly matches: readonly { readonly start: number; readonly end: number }[]
  readonly coordinates: "utf16"
  readonly complete: boolean
}
/** One inquiry event a dispatch appends (J5.1); the host supplies the operation fields. */
export type InquiryEvent =
  | { readonly type: "research.inquiry.opened"; readonly question: Research.RecordRef; readonly subquestions: readonly Research.RecordRef[] }
  | { readonly type: "research.inquiry.checked"; readonly check: Research.CheckResult }
  | { readonly type: "research.inquiry.closed"; readonly card: Research.CardV2 }
export interface Interface {
  /** `slot` names one of several writes a single tool call makes; each slot is its own replayable operation. */
  readonly record: (binding: Research.Binding, context: Tool.Context, input: Research.RecordInput, slot?: string) => Effect.Effect<Mutation, Research.Error>
  readonly capture: (binding: Research.Binding, context: Tool.Context, input: CaptureInput) => Effect.Effect<Research.SourceReceipt, Research.Error>
  readonly beginAcquisition: (binding: Research.Binding, context: Tool.Context, requestHash: string) => Effect.Effect<Research.AttemptReceipt | undefined, Research.Error>
  readonly attempt: (binding: Research.Binding, context: Tool.Context, input: Pick<Research.AttemptReceipt, "outcome" | "stage" | "reason" | "source" | "returned">) => Effect.Effect<Research.AttemptReceipt, Research.Error>
  readonly view: (binding: Research.Binding, input: Research.ViewInput) => Effect.Effect<View, Research.Error>
  readonly verifyEvidence: (binding: Research.Binding, ref: Research.EvidenceRef) => Effect.Effect<void, Research.Error>
  /** Append an inquiry event. Opened and closed happen once per dispatch; an exact retry replays the stored event. */
  readonly inquire: (allowance: Research.Allowance, context: Tool.Context, input: InquiryEvent) => Effect.Effect<ResearchLedger.Inquiry, Research.Error>
  /** The dispatch's ledger stream the inquiry folds over. */
  readonly dispatch: (allowance: Research.Allowance) => Effect.Effect<readonly ResearchLedger.Step[], Research.Error>
}
export class Service extends Context.Service<Service, Interface>()("@orchestra/ResearchRecords") {}

const RecordCursor = Schema.Struct({ bindingHash: Research.Digest, offset: Schema.Int, snapshot: Research.Digest, limit: Schema.Int })

export const layer = Layer.effect(Service, Effect.gen(function* () {
  const database = yield* Database.Service
  const events = yield* EventV2.Service
  const artifacts = yield* ResearchArtifacts.Service
  const entries = (binding: Research.Binding, id?: string) => ResearchLedger.entries(binding, id).pipe(Effect.provideService(Database.Service, database))
  const retained = (binding: Research.Binding) => ResearchLedger.retained(binding).pipe(Effect.provideService(Database.Service, database))
  const require = (binding: Research.Binding, context: Tool.Context) => ResearchBinding.require(binding, context).pipe(Effect.provideService(Database.Service, database))

  const recordRef = Effect.fn("ResearchRecords.recordRef")(function* (binding: Research.Binding, ref: Research.RecordRef) {
    const found = (yield* entries(binding, ref.id)).find((entry) => entry.type === "research.record.committed" &&
      entry.data.record.id === ref.id && entry.data.record.revision === ref.revision)
    if (!found || found.type !== "research.record.committed")
      return yield* new Research.Error({ code: "reference_invalid", message: "Research record reference is not admitted" })
    yield* retained(found.data.binding)
    return found.data.record
  })

  const source = Effect.fn("ResearchRecords.source")(function* (binding: Research.Binding, ref: Research.SourceRef) {
    const first = yield* artifacts.read(binding, ref.artifact)
    if (!("origin" in first.receipt) || first.receipt.ref.digest !== ref.digest || first.representation !== ref.representation)
      return yield* new Research.Error({ code: "reference_invalid", message: "Source representation does not match its admission" })
    const pages: string[] = [first.text]
    // Each continuation is bound to the same immutable artifact and receipt; no live reacquisition.
    const drain = (cursor: string): Effect.Effect<void, Research.Error> => artifacts.read(binding, ref.artifact, cursor).pipe(
      Effect.flatMap((page) => {
        pages.push(page.text)
        return page.cursor ? drain(page.cursor) : Effect.void
      }),
    )
    if (first.cursor) yield* drain(first.cursor)
    return { text: pages.join(""), receipt: first.receipt }
  })

  const evidence = Effect.fn("ResearchRecords.evidence")(function* (binding: Research.Binding, ref: Research.EvidenceRef) {
    const content = yield* source(binding, ref.source)
    // A code_locate snapshot holds ranges of many worktree files: original lines resolve inside one of its ranges.
    const snapshot = ref.locator.kind === "lines" && ref.locator.basis === "original" && "origin" in content.receipt &&
      content.receipt.origin.kind === "file" && content.receipt.origin.uri === binding.worktree ? Locate.blocks(content.text) : undefined
    if (snapshot && ref.locator.kind === "lines") {
      const lines = ref.locator
      if (snapshot.some((block) => block.start <= lines.start && lines.end <= block.end && lines.start <= lines.end)) return
      return yield* new Research.Error({ code: "reference_invalid", message: `Lines ${lines.start}-${lines.end} are not inside one range of this code_locate snapshot` })
    }
    return yield* Effect.try({ try: () => checkLocator(content.text, ref.source.representation, retainedLocator(ref.locator, content.receipt)),
      catch: (error) => error instanceof Research.Error ? error : new Research.Error({ code: "reference_invalid", message: "Source locator does not match" }) })
  })

  const mutation = (entry: Exclude<ResearchLedger.Entry, { type: "research.source.admitted" }>): Mutation => {
    return {
      receipt: { operation: entry.data.operation, binding: entry.data.binding, eventID: entry.id,
        ref: entry.type === "research.record.committed" ? { id: entry.data.record.id, revision: entry.data.record.revision } : entry.data.receipt.ref },
      ...(entry.type === "research.record.committed" ? { record: entry.data.record } : { document: entry.data.receipt }),
    }
  }
  const replay = (list: readonly ResearchLedger.Entry[], operation: string, hash: string) => Effect.try({
    try: () => ResearchLedger.replay(list, operation, hash),
    catch: () => new Research.Error({ code: "conflict", message: "Research operation conflicts with admitted input" }),
  })

  const record = Effect.fn("ResearchRecords.record")(function* (binding: Research.Binding, context: Tool.Context, raw: Research.RecordInput, slot?: string) {
    yield* fieldBounds(raw)
    yield* ResearchLedger.bounded(raw.action === "document" ? { ...raw, document: { ...raw.document, body: undefined } } : raw)
    const input = yield* Schema.decodeUnknownEffect(Schema.toType(Research.RecordInput))(raw).pipe(
      Effect.mapError(() => new Research.Error({ code: "reference_invalid", message: "Invalid research mutation" })),
    )
    yield* require(binding, context)
    const operation = ResearchLedger.operation(context, slot === undefined ? input.action : `${input.action}:${slot}`)
    const inputHash = ResearchLedger.digest(ResearchLedger.canonical(input))
    const current = yield* entries(binding)
    const existing = yield* replay(current, operation, inputHash)
    if (existing?.type === "research.source.admitted")
      return yield* new Research.Error({ code: "conflict", message: "Operation is not a record mutation" })
    if (existing) return mutation(existing)
    if (input.action === "finding") yield* Effect.forEach([...input.evidence, ...input.contrary], (ref) => evidence(binding, ref), { discard: true })
    if (input.action === "relation") yield* Effect.forEach([input.from, input.to], (ref) => recordRef(binding, ref), { discard: true })
    if (input.action === "document") {
      yield* Effect.forEach(input.document.findingRefs, (ref) => recordRef(binding, ref).pipe(Effect.flatMap((record) =>
        record.kind === "finding" ? Effect.void : Effect.fail(new Research.Error({ code: "reference_invalid", message: "Document finding reference is not a finding" })))), { discard: true })
      yield* Effect.forEach(Object.values(input.document.citations), (ref) => evidence(binding, ref), { discard: true })
      yield* checkCitations(input.document)
    }
    const supplied = input.action === "relation" ? undefined : input.id
    const base = input.action === "relation" ? undefined : input.baseRevision
    if ((supplied === undefined) !== (base === undefined))
      return yield* new Research.Error({ code: "conflict", message: "Updates require both an admitted identity and base revision" })
    const id = supplied ?? mint(input.action, operation)
    const history = current.flatMap((entry) => {
      if (entry.type === "research.record.committed" && entry.data.record.id === id) return [entry.data.record.revision]
      if (entry.type === "research.document.published" && entry.data.receipt.ref.id === id) return [entry.data.receipt.ref.revision]
      return []
    })
    const latest = Math.max(0, ...history)
    if ((base ?? 0) !== latest || (supplied && !latest))
      return yield* new Research.Error({ code: "conflict", message: "Research base revision is stale or missing" })
    if (supplied && input.action === "finding" && !input.reason)
      return yield* new Research.Error({ code: "reference_invalid", message: "Material finding revision requires its reason" })
    const revision = latest + 1
    const eventID = ResearchLedger.eventID(binding, `${id}:${revision}`)
    const shared = { sessionID: binding.executionSessionID, operation, inputHash, binding }
    const committed = yield* artifacts.prepare(binding, input.action === "document" ? {
      id: eventID, type: "research.document.published", data: { ...shared, receipt: {
        binding, ref: { id: Research.DocumentID.make(id), revision },
        artifact: { id: Capability.ArtifactID.make(`cart_${ResearchLedger.digest(ResearchLedger.canonical([binding, operation])).slice(0, 26)}`), revision: 1 },
        digest: ResearchLedger.digest(input.document.body), bytes: Buffer.byteLength(input.document.body),
        title: input.document.title, genre: input.document.genre, findingRefs: input.document.findingRefs,
        citations: input.document.citations, publishedAt: Date.now(),
      } },
    } : {
      id: eventID, type: "research.record.committed", data: { ...shared, record: makeRecord(input, id, revision) },
    })
    if (committed.type === "research.source.admitted")
      return yield* new Research.Error({ code: "conflict", message: "Operation is not a record mutation" })
    const publish = Effect.gen(function* () {
      if (input.action === "document" && committed.type === "research.document.published") {
        const stored = yield* artifacts.put(binding, { content: input.document.body, representation: "markdown", artifact: committed.data.receipt.artifact }, operation)
        if (stored.digest !== committed.data.receipt.digest) return yield* new Research.Error({ code: "publication_uncertain", message: "Document artifact differs from receipt" })
      }
      // The native event transaction owns this CAS. Deterministic next-revision event IDs are a second race barrier.
      const commit = () => Effect.gen(function* () {
        const actual = yield* entries(binding)
        const revisions = actual.flatMap((entry) => {
          if (entry.type === "research.record.committed" && entry.data.record.id === id) return [entry.data.record.revision]
          if (entry.type === "research.document.published" && entry.data.receipt.ref.id === id) return [entry.data.receipt.ref.revision]
          return []
        })
        if (Math.max(0, ...revisions) !== latest)
          yield* Effect.die(new Research.Error({ code: "conflict", message: "Research revision changed during publication" }))
      }).pipe(Effect.orDie)
      if (committed.type === "research.record.committed")
        yield* events.publish(ResearchEvent.RecordCommitted, committed.data, { id: eventID, persist: true, commit })
      if (committed.type === "research.document.published")
        yield* events.publish(ResearchEvent.DocumentPublished, committed.data, { id: eventID, persist: true, commit })
      return mutation(committed)
    })
    return yield* publish.pipe(Effect.catchCauseIf((cause) => !Cause.hasInterrupts(cause), (cause) => Effect.gen(function* () {
      const stored = yield* replay(yield* entries(binding), operation, inputHash)
      if (stored?.type === "research.source.admitted")
        return yield* new Research.Error({ code: "conflict", message: "Operation is not a record mutation" })
      if (stored) return mutation(stored)
      const conflict = cause.reasons.flatMap((reason) => Cause.isDieReason(reason) ? [reason.defect]
        : Cause.isFailReason(reason) ? [reason.error] : []).find((error) => error instanceof Research.Error)
      if (conflict instanceof Research.Error) return yield* conflict
      const raced = (yield* entries(binding)).some((entry) => entry.id === eventID)
      return yield* new Research.Error({ code: raced ? "conflict" : "publication_uncertain", message: raced ? "Research revision conflicts" : "Research event publication is uncertain" })
    })))
  })

  const capture = Effect.fn("ResearchRecords.capture")(function* (binding: Research.Binding, context: Tool.Context, input: CaptureInput) {
    if ((typeof input.content === "string" ? Buffer.byteLength(input.content, "utf8") : input.content.byteLength) > Research.Limits.sourceBytes)
      return yield* new Research.Error({ code: "over_cap", message: "Research source exceeds source byte limit" })
    const content = typeof input.content === "string" ? Buffer.from(input.content, "utf8") : Buffer.from(input.content)
    const operation = ResearchLedger.operation(context, `capture:${input.representation}`)
    const inputHash = ResearchLedger.digest(ResearchLedger.canonical({ ...input, content: ResearchLedger.digest(content) }))
    const receipt = yield* Schema.decodeUnknownEffect(Schema.toType(Research.SourceReceipt))({
      binding, origin: input.origin, mediaType: input.mediaType, bytes: content.byteLength,
      complete: input.complete, capturedAt: Date.now(),
      ref: { artifact: { id: `cart_${ResearchLedger.digest(ResearchLedger.canonical([binding, operation])).slice(0, 26)}`, revision: 1 },
        representation: input.representation, digest: ResearchLedger.digest(content) },
      ...(input.derivedFrom ? { derivedFrom: input.derivedFrom } : {}),
      ...(input.transformation ? { transformation: input.transformation } : {}),
      ...(input.atlas ? { atlas: input.atlas } : {}),
      ...(input.observed ? { observed: input.observed } : {}),
    }).pipe(Effect.mapError(() => new Research.Error({ code: "reference_invalid", message: "Invalid source capture metadata" })))
    yield* fieldBounds(receipt)
    const data = { sessionID: binding.executionSessionID, operation, inputHash, binding, receipt }
    yield* ResearchLedger.bounded(data)
    yield* require(binding, context)
    const previous = yield* replay(yield* entries(binding), operation, inputHash)
    if (previous) {
      if (previous.type !== "research.source.admitted") return yield* new Research.Error({ code: "conflict", message: "Capture operation conflicts" })
      // Replay returns the original admission; availability is checked separately on retrieval.
      return previous.data.receipt
    }
    if (Boolean(input.derivedFrom) !== Boolean(input.transformation) || (input.origin.kind === "atlas-own" && !input.atlas))
      return yield* new Research.Error({ code: "reference_invalid", message: "Derived and Atlas captures require their provenance" })
    // A partial received-byte parent can end inside a UTF-8 scalar. Verify custody, not textual decodability.
    if (input.derivedFrom) yield* artifacts.verifySource(binding, input.derivedFrom)
    const staged = yield* artifacts.prepare(binding, {
      id: ResearchLedger.eventID(binding, `source:${operation}`), type: "research.source.admitted", data,
    })
    if (staged.type !== "research.source.admitted")
      return yield* new Research.Error({ code: "conflict", message: "Source publication intent conflicts" })
    yield* artifacts.put(binding, { content, representation: input.representation, artifact: staged.data.receipt.ref.artifact }, operation)
    return yield* events.publish(ResearchEvent.SourceAdmitted, staged.data, {
      id: staged.id, persist: true,
    }).pipe(Effect.map(() => staged.data.receipt), Effect.catchCauseIf((cause) => !Cause.hasInterrupts(cause), () => Effect.gen(function* () {
      const stored = yield* replay(yield* entries(binding), operation, inputHash)
      if (stored?.type === "research.source.admitted") return stored.data.receipt
      return yield* new Research.Error({ code: "publication_uncertain", message: "Source event publication is uncertain" })
    })))
  })

  const attempt = Effect.fn("ResearchRecords.attempt")(function* (
    binding: Research.Binding, context: Tool.Context, input: Pick<Research.AttemptReceipt, "outcome" | "stage" | "reason" | "source" | "returned">,
  ) {
    yield* require(binding, context)
    const operation = ResearchLedger.operation(context, "acquisition-outcome")
    const inputHash = ResearchLedger.digest(ResearchLedger.canonical(input))
    const id = ResearchLedger.eventID(binding, operation)
    const replay = Effect.gen(function* () {
      const row = yield* database.db.select().from(EventTable).where(eq(EventTable.id, id)).get().pipe(Effect.orDie)
      if (!row) return undefined
      const entry = yield* Schema.decodeUnknownEffect(ResearchEvent.SourceAttempted.data)(row.data).pipe(
        Effect.mapError(() => new Research.Error({ code: "publication_uncertain", message: "Invalid retained acquisition outcome" })),
      )
      if (row.type !== "research.source.attempted.1" || row.aggregate_id !== binding.executionSessionID ||
        entry.inputHash !== inputHash || ResearchLedger.canonical(entry.binding) !== ResearchLedger.canonical(binding))
        return yield* new Research.Error({ code: "conflict", message: "Acquisition outcome conflicts with retained operation" })
      return entry.receipt
    })
    const previous = yield* replay
    if (previous) return previous
    const receipt = yield* Schema.decodeUnknownEffect(Research.AttemptReceipt)({ ...input, binding, operation, attemptedAt: Date.now() }).pipe(
      Effect.mapError(() => new Research.Error({ code: "reference_invalid", message: "Invalid acquisition outcome" })),
    )
    const data = { sessionID: binding.executionSessionID, operation, inputHash, binding, receipt }
    yield* ResearchLedger.bounded(data)
    return yield* events.publish(ResearchEvent.SourceAttempted, data, { id, persist: true }).pipe(
      Effect.map(() => receipt),
      Effect.catchCauseIf((cause) => !Cause.hasInterrupts(cause), () => replay.pipe(Effect.flatMap((saved) => saved
        ? Effect.succeed(saved) : Effect.fail(new Research.Error({ code: "publication_uncertain", message: "Acquisition outcome publication is uncertain" }))))),
    )
  })

  const beginAcquisition = Effect.fn("ResearchRecords.beginAcquisition")(function* (binding: Research.Binding, context: Tool.Context, requestHash: string) {
    yield* require(binding, context)
    const operation = ResearchLedger.operation(context, "acquisition-request")
    const data = { sessionID: binding.executionSessionID, operation, inputHash: requestHash, binding }
    const id = ResearchLedger.eventID(binding, operation)
    const existing = yield* database.db.select().from(EventTable).where(eq(EventTable.id, id)).get().pipe(Effect.orDie)
    const replay = Effect.gen(function* () {
      const request = yield* database.db.select().from(EventTable).where(eq(EventTable.id, id)).get().pipe(Effect.orDie)
      const saved = request ? yield* Schema.decodeUnknownEffect(ResearchEvent.SourceRequested.data)(request.data).pipe(
        Effect.mapError(() => new Research.Error({ code: "publication_uncertain", message: "Retained acquisition request is invalid" })),
      ) : undefined
      if (!request || !saved || request.type !== "research.source.requested.1" || request.aggregate_id !== binding.executionSessionID ||
        ResearchLedger.canonical(saved) !== ResearchLedger.canonical(data))
        return yield* new Research.Error({ code: "conflict", message: "Acquisition request conflicts with retained invocation" })
      const outcome = yield* database.db.select().from(EventTable).where(eq(EventTable.id,
        ResearchLedger.eventID(binding, ResearchLedger.operation(context, "acquisition-outcome")),
      )).get().pipe(Effect.orDie)
      if (!outcome || outcome.type !== "research.source.attempted.1" || outcome.aggregate_id !== binding.executionSessionID)
        return yield* new Research.Error({ code: "publication_uncertain", message: "Prior acquisition has no settled outcome; live reacquisition is forbidden" })
      const receipt = yield* Schema.decodeUnknownEffect(ResearchEvent.SourceAttempted.data)(outcome.data).pipe(
        Effect.mapError(() => new Research.Error({ code: "publication_uncertain", message: "Retained acquisition outcome is invalid" })),
      )
      if (ResearchLedger.canonical(receipt.binding) !== ResearchLedger.canonical(binding) ||
        ResearchLedger.canonical(receipt.receipt.binding) !== ResearchLedger.canonical(binding))
        return yield* new Research.Error({ code: "binding_mismatch", message: "Retained acquisition outcome scope differs" })
      if (!receipt.receipt.returned || !receipt.receipt.source)
        return yield* new Research.Error({ code: "source_unavailable", message: "Prior acquisition did not return retained evidence; use a new native call for a new attempt" })
      return receipt.receipt
    })
    if (existing) return yield* replay
    yield* ResearchLedger.bounded(data)
    const input = yield* Schema.decodeUnknownEffect(ResearchEvent.SourceRequested.data)(data).pipe(
      Effect.mapError(() => new Research.Error({ code: "reference_invalid", message: "Invalid native acquisition request" })),
    )
    return yield* events.publish(ResearchEvent.SourceRequested, input, { id, persist: true }).pipe(
      Effect.map(() => undefined),
      Effect.catchCauseIf((cause) => !Cause.hasInterrupts(cause), () => replay),
    )
  })

  const view = Effect.fn("ResearchRecords.view")(function* (binding: Research.Binding, raw: Research.ViewInput): Effect.fn.Return<View, Research.Error> {
    const input = yield* Schema.decodeUnknownEffect(Schema.toType(Research.ViewInput))(raw).pipe(
      Effect.mapError(() => new Research.Error({ code: "reference_invalid", message: "Invalid research view" })),
    )
    yield* retained(binding)
    if (input.action === "corpus") {
      const all = yield* entries(binding)
      const corpus: { sources: Research.SourceReceipt[]; records: Research.RecordRef[]; documents: Research.DocumentReceipt[]; complete: boolean; total: number } = {
        sources: [], records: [], documents: [], complete: true, total: all.length,
      }
      all.some((entry) => {
        const candidate = { ...corpus,
          sources: entry.type === "research.source.admitted" ? [...corpus.sources, entry.data.receipt] : corpus.sources,
          records: entry.type === "research.record.committed" ? [...corpus.records, { id: entry.data.record.id, revision: entry.data.record.revision }] : corpus.records,
          documents: entry.type === "research.document.published" ? [...corpus.documents, entry.data.receipt] : corpus.documents,
        }
        if (Buffer.byteLength(ResearchLedger.canonical(candidate), "utf8") > Research.Limits.pageBytes) {
          corpus.complete = false
          return true
        }
        Object.assign(corpus, candidate)
        return false
      })
      return corpus
    }
    if (input.action === "attempts") {
      const rows = yield* database.db.select().from(EventTable).where(and(
        eq(EventTable.aggregate_id, binding.executionSessionID), eq(EventTable.type, "research.source.attempted.1"),
      )).orderBy(asc(EventTable.seq)).all().pipe(Effect.orDie)
      const snapshot = ResearchLedger.digest(ResearchLedger.canonical(rows.map((row) => row.id)))
      const limit = input.limit ?? 20
      const decoded = input.cursor ? Schema.decodeUnknownOption(Schema.fromJsonString(RecordCursor))(Buffer.from(input.cursor, "base64url").toString("utf8")) : undefined
      if (decoded && (decoded._tag === "None" || decoded.value.bindingHash !== ResearchLedger.digest(ResearchLedger.canonical(binding)) ||
        decoded.value.snapshot !== snapshot || decoded.value.limit !== limit || decoded.value.offset < 0 || decoded.value.offset > rows.length))
        return yield* new Research.Error({ code: "conflict", message: "Research attempt cursor is stale or mismatched" })
      const offset = decoded?._tag === "Some" ? decoded.value.offset : 0
      const attempts = yield* Effect.forEach(rows.slice(offset, offset + limit), (row) =>
        Schema.decodeUnknownEffect(ResearchEvent.SourceAttempted.data)(row.data).pipe(
          Effect.mapError(() => new Research.Error({ code: "source_unavailable", message: "Invalid retained acquisition outcome" })),
          Effect.flatMap((entry) => entry.sessionID !== binding.executionSessionID || ResearchLedger.canonical(entry.receipt.binding) !== ResearchLedger.canonical(binding)
            ? Effect.fail(new Research.Error({ code: "source_unavailable", message: "Acquisition outcome scope differs" })) : Effect.succeed(entry.receipt)),
        ))
      yield* ResearchLedger.bounded(attempts)
      const next = offset + attempts.length
      return { attempts, complete: next === rows.length, ...(next < rows.length ? { cursor: Buffer.from(ResearchLedger.canonical({
        bindingHash: ResearchLedger.digest(ResearchLedger.canonical(binding)), offset: next, snapshot, limit,
      })).toString("base64url") } : {}) }
    }
    if (input.action === "record") return yield* recordRef(binding, input.ref)
    if (input.action === "source") {
      const page = yield* artifacts.read(binding, input.ref.artifact, input.cursor)
      if (!("origin" in page.receipt) || page.receipt.ref.digest !== input.ref.digest || page.representation !== input.ref.representation)
        return yield* new Research.Error({ code: "reference_invalid", message: "Source reference differs from admission" })
      return page
    }
    if (input.action === "document") {
      const found = (yield* entries(binding, input.ref.id)).find((entry) => entry.type === "research.document.published" &&
        entry.data.receipt.ref.id === input.ref.id && entry.data.receipt.ref.revision === input.ref.revision)
      if (!found || found.type !== "research.document.published") return yield* new Research.Error({ code: "not_found", message: "Research document not found" })
      return yield* artifacts.read(binding, found.data.receipt.artifact, input.cursor)
    }
    if (input.action === "find") {
      const content = yield* source(binding, input.ref)
      const matches: { start: number; end: number }[] = []
      // Stop consuming the iterator once the bounded result is known to be incomplete.
      for (const match of content.text.matchAll(new RegExp(escapeLiteral(input.query), "gu"))) {
        matches.push({ start: match.index, end: match.index + input.query.length })
        if (matches.length === 101) break
      }
      return { source: input.ref, matches: matches.slice(0, 100), coordinates: "utf16", complete: matches.length <= 100 && content.receipt.complete }
    }
    const all = (yield* entries(binding)).filter((entry) => entry.type === "research.record.committed")
    const snapshot = ResearchLedger.digest(ResearchLedger.canonical(all.map((entry) => entry.id)))
    const limit = input.limit ?? 20
    const decoded = input.cursor ? Schema.decodeUnknownOption(Schema.fromJsonString(RecordCursor))(Buffer.from(input.cursor, "base64url").toString("utf8")) : undefined
    if (decoded && (decoded._tag === "None" || decoded.value.bindingHash !== ResearchLedger.digest(ResearchLedger.canonical(binding)) ||
      decoded.value.snapshot !== snapshot || decoded.value.limit !== limit || decoded.value.offset < 0 || decoded.value.offset > all.length))
      return yield* new Research.Error({ code: "conflict", message: "Research record cursor is stale or mismatched" })
    const offset = decoded?._tag === "Some" ? decoded.value.offset : 0
    const page = all.slice(offset, offset + limit)
    const selected: Research.Record[] = []
    // Bound the entire structured projection, even when a requested count would exceed the event-sized page.
    page.some((entry) => {
      if (entry.type !== "research.record.committed") return false
      if (Buffer.byteLength(ResearchLedger.canonical([...selected, entry.data.record])) > Research.Limits.eventBytes - 512) return true
      selected.push(entry.data.record)
      return false
    })
    const next = offset + selected.length
    if (next === offset && next < all.length)
      return yield* new Research.Error({ code: "over_cap", message: "Research record cannot fit a bounded page" })
    return { records: selected, complete: next === all.length, ...(next < all.length ? { cursor: Buffer.from(ResearchLedger.canonical({
      bindingHash: ResearchLedger.digest(ResearchLedger.canonical(binding)), offset: next, snapshot, limit,
    })).toString("base64url") } : {}) }
  })
  const dispatch = (allowance: Research.Allowance) => ResearchLedger.dispatch(allowance).pipe(Effect.provideService(Database.Service, database))

  const inquire = Effect.fn("ResearchRecords.inquire")(function* (allowance: Research.Allowance, context: Tool.Context, input: InquiryEvent) {
    const binding = allowance.binding
    yield* ResearchLedger.bounded(input)
    yield* require(binding, context)
    const operation = ResearchLedger.operation(context, input.type)
    const inputHash = ResearchLedger.digest(ResearchLedger.canonical(input))
    const stored = (list: readonly ResearchLedger.Step[]) => {
      const found = list.flatMap((step) => isInquiry(step) && step.data.operation === operation ? [step] : [])
      if (found.some((step) => step.data.inputHash !== inputHash))
        throw new Research.Error({ code: "conflict", message: "Inquiry operation was reused with different input" })
      return found[0]
    }
    const replayed = (list: readonly ResearchLedger.Step[]) => Effect.try({ try: () => stored(list),
      catch: (error) => error instanceof Research.Error ? error : new Research.Error({ code: "conflict", message: "Inquiry operation conflicts" }) })
    const existing = yield* replayed(yield* dispatch(allowance))
    if (existing) return existing
    const id = ResearchLedger.eventID(binding, `inquiry:${allowance.dispatchCallID}:${operation}`)
    const shared = { sessionID: binding.executionSessionID, operation, inputHash, binding }
    // The native event transaction owns this check: a dispatch opens and closes its inquiry once, and nothing follows a close.
    const commit = () => dispatch(allowance).pipe(Effect.flatMap((list) => {
      const inquiries = list.filter(isInquiry)
      if (inquiries.some((step) => step.type === "research.inquiry.closed"))
        return Effect.die(new Research.Error({ code: "inquiry_state", message: "inquiry closed: this dispatch admits no further inquiry events" }))
      if (input.type !== "research.inquiry.checked" && inquiries.some((step) => step.type === input.type))
        return Effect.die(new Research.Error({ code: "inquiry_state", message: `${input.type} already happened in this dispatch` }))
      return Effect.void
    }), Effect.orDie)
    const publish: Effect.Effect<unknown, unknown> = input.type === "research.inquiry.opened"
      ? events.publish(ResearchEvent.InquiryOpened, { ...shared, question: input.question, subquestions: input.subquestions }, { id, persist: true, commit })
      : input.type === "research.inquiry.checked"
        ? events.publish(ResearchEvent.InquiryChecked, { ...shared, check: input.check }, { id, persist: true, commit })
        : events.publish(ResearchEvent.InquiryClosed, { ...shared, card: input.card }, { id, persist: true, commit })
    const outcome = yield* Effect.exit(publish)
    const after = yield* replayed(yield* dispatch(allowance))
    if (after) return after
    if (Exit.isSuccess(outcome)) return yield* new Research.Error({ code: "publication_uncertain", message: "Inquiry event was not retained" })
    if (Cause.hasInterrupts(outcome.cause)) return yield* Effect.failCause(outcome.cause).pipe(Effect.orDie)
    const reason = outcome.cause.reasons.flatMap((reason) => Cause.isDieReason(reason) ? [reason.defect]
      : Cause.isFailReason(reason) ? [reason.error] : []).find((error) => error instanceof Research.Error)
    return yield* reason instanceof Research.Error ? reason
      : new Research.Error({ code: "publication_uncertain", message: "Inquiry event publication is uncertain" })
  })

  return Service.of({ record, capture, beginAcquisition, attempt, view, verifyEvidence: evidence, inquire, dispatch })
}))

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node, EventV2.node, ResearchArtifacts.node] })

function mint(action: Research.RecordInput["action"], operation: string) {
  const prefix = { question: "rque_", finding: "rfnd_", relation: "rrel_", document: "rdoc_" }[action]
  return prefix + ResearchLedger.digest(operation).slice(0, 26)
}

function makeRecord(input: Exclude<Research.RecordInput, { action: "document" }>, id: string, revision: number): Research.Record {
  if (input.action === "question") return { kind: "question", id: Research.QuestionID.make(id), revision, question: input.question, selection: input.selection }
  if (input.action === "finding") return { kind: "finding", id: Research.FindingID.make(id), revision,
    proposition: input.proposition, nature: input.nature, conditions: input.conditions, evidence: input.evidence, contrary: input.contrary,
    ...(input.reason ? { reason: input.reason } : {}) }
  return { kind: "relation", id: Research.RelationID.make(id), revision, from: input.from, to: input.to, relation: input.relation, reason: input.reason }
}

function fieldBounds(value: unknown): Effect.Effect<void, Research.Error> {
  return Effect.try({ try: () => {
    const walk = (value: unknown, key: string) => {
      if (typeof value === "string") {
        const max = { body: Research.Limits.documentBytes, question: 8192, proposition: 8192, exact: 8192,
          uri: 8192, title: 1024, pointer: 2048, taskId: 256, mediaType: 256, transformation: 256,
          specialization: 256, unit: 256, contentHash: 256, revision: 256 }[key] ?? 4096
        ResearchLedger.cap(value, max)
      }
      if (Array.isArray(value)) value.forEach((item) => walk(item, key))
      if (value !== null && typeof value === "object") Object.entries(value).forEach((entry) => walk(entry[1], entry[0]))
    }
    walk(value, "")
  }, catch: () => new Research.Error({ code: "over_cap", message: "Research field UTF-8 limit exceeded" }) })
}

function isInquiry(step: ResearchLedger.Step): step is ResearchLedger.Inquiry {
  return step.type === "research.inquiry.opened" || step.type === "research.inquiry.checked" || step.type === "research.inquiry.closed"
}

// Original-file lines (J5.3) address the captured span through the receipt's first line; retained lines start at 1.
function retainedLocator(locator: Research.Locator, receipt: Research.SourceReceipt | Research.DocumentReceipt): Research.Locator {
  if (locator.kind !== "lines" || locator.basis !== "original") return locator
  const first = "origin" in receipt ? receipt.observed?.lineStart ?? 1 : 1
  if (locator.start < first)
    throw new Research.Error({ code: "reference_invalid", message: `Lines ${locator.start}-${locator.end} start before the captured span (line ${first})` })
  return { kind: "lines", start: locator.start - first + 1, end: locator.end - first + 1 }
}

function checkLocator(text: string, representation: typeof Research.Representation.Type, locator: Research.Locator) {
  if (locator.kind === "lines") {
    if (locator.start > locator.end || locator.end > text.split(/\r\n|\n|\r/).length)
      throw new Research.Error({ code: "reference_invalid", message: "Source line range does not exist" })
    return
  }
  if (locator.kind === "quote") {
    // Lookahead includes overlapping matches ("aa" occurs twice in "aaa").
    const matches: number[] = []
    for (const match of text.matchAll(new RegExp(`(?=${escapeLiteral(locator.exact)})`, "gu"))) {
      if ((locator.prefix && !text.slice(Math.max(0, match.index - locator.prefix.length), match.index).endsWith(locator.prefix)) ||
        (locator.suffix && !text.slice(match.index + locator.exact.length, match.index + locator.exact.length + locator.suffix.length).startsWith(locator.suffix))) continue
      if (matches.length) throw new Research.Error({ code: "locator_ambiguous", message: "Quote matches more than one location" })
      matches.push(match.index)
    }
    if (!matches.length) throw new Research.Error({ code: "reference_invalid", message: "Quote does not match admitted representation" })
    return
  }
  if (representation !== "structured-json") throw new Research.Error({ code: "reference_invalid", message: "JSON locator requires structured-json representation" })
  const parsed = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text)
  if (parsed._tag === "None") throw new Research.Error({ code: "source_unavailable", message: "Admitted JSON representation cannot be decoded" })
  if (locator.pointer !== "" && (!locator.pointer.startsWith("/") || /~(?:[^01]|$)/.test(locator.pointer)))
    throw new Research.Error({ code: "reference_invalid", message: "Invalid JSON pointer" })
  if (locator.pointer === "") return
  locator.pointer.slice(1).split("/").reduce((value: unknown, part) => {
    const key = part.replace(/~1/g, "/").replace(/~0/g, "~")
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, key) ||
      (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key)))
      throw new Research.Error({ code: "reference_invalid", message: "JSON pointer does not resolve" })
    return Reflect.get(value, key)
  }, parsed.value)
}

function escapeLiteral(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") }

const MarkdownToken = Schema.Struct({
  type: Schema.String, href: Schema.optional(Schema.String), tokens: Schema.optional(Schema.Array(Schema.Unknown)),
  items: Schema.optional(Schema.Array(Schema.Unknown)), header: Schema.optional(Schema.Array(Schema.Unknown)),
  rows: Schema.optional(Schema.Array(Schema.Array(Schema.Unknown))),
})
const checkCitations = Effect.fn("ResearchRecords.checkCitations")(function* (document: Research.DocumentInput) {
  const { Lexer } = yield* Effect.tryPromise({ try: () => import("marked"),
    catch: () => new Research.Error({ code: "unsupported", message: "Markdown parser is unavailable" }) })
  // Research labels are Markdown links with research:<label> destinations. Code and raw HTML are not citations.
  const walk = (raw: unknown) => Schema.decodeUnknownSync(Schema.Array(MarkdownToken))(raw).forEach((token) => {
    if (token.type === "link" && token.href?.startsWith("research:") && !Object.hasOwn(document.citations, token.href.slice(9)))
      throw new Research.Error({ code: "reference_invalid", message: "Document citation label is not admitted" })
    if (token.tokens) walk(token.tokens)
    if (token.type === "list") token.items?.forEach((item) => walk(Schema.decodeUnknownSync(MarkdownToken)(item).tokens))
    if (token.type === "table") {
      const cell = Schema.Struct({ tokens: Schema.Array(Schema.Unknown) })
      token.header?.forEach((value) => walk(Schema.decodeUnknownSync(cell)(value).tokens))
      token.rows?.forEach((row) => row.forEach((value) => walk(Schema.decodeUnknownSync(cell)(value).tokens)))
    }
  })
  yield* Effect.try({ try: () => walk(Lexer.lex(document.body)), catch: () => new Research.Error({ code: "reference_invalid", message: "Document citation label is not admitted" }) })
})
