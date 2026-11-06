export * as FabricDocuments from "./document"

import { FabricRecord } from "@orchestra/schema/fabric-record"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { Capability } from "@orchestra/schema/capability"
import { PositiveInt, optional } from "@orchestra/schema/schema"
import { Effect, Option, Schema } from "effect"
import type { FabricDocumentsContract } from "./document-contract"
import { FabricRecords } from "./record"
import type { FabricRecordsContract } from "./record-contract"

const week = 7 * 24 * 60 * 60 * 1000
const Kind = Schema.Literals(["draft", "composition", "evidence"])
const Selection = Schema.Struct({ context: FabricContext.Ref, record: FabricRecord.Ref })
const Query = Schema.Struct({ ...FabricRecord.Query.fields, kind: Kind })
const Removal = Schema.Struct({ ...Selection.fields, confirm: Schema.Boolean })
const Sweep = Schema.Struct({ ...Query.fields, confirm: Schema.Boolean })
const Write = Schema.Struct({
  context: FabricContext.Ref,
  id: FabricRecord.ID,
  kind: Kind,
  expected: Schema.NullOr(PositiveInt),
  payload: Schema.String,
  consent: optional(Schema.Boolean),
})
const Header = Schema.Struct({
  format: Schema.Literal("fabric-studio.document"),
  version: Schema.Literal(1),
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
  expiresAt: Schema.NullOr(Schema.Number),
  consent: Schema.Boolean,
})
const decodeHeader = Schema.decodeUnknownOption(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Header)))

/** Retention is local only. Constructing this service neither saves user content nor starts a cleanup timer. */
export const make: FabricDocumentsContract.Factory = (options) => {
  const now = options.now ?? Date.now
  return Effect.gen(function* () {
    const records = yield* FabricRecords.make(options)

    function instant() {
      return Effect.try({ try: now, catch: () => failure("unavailable") }).pipe(
        Effect.flatMap((time) =>
          Number.isSafeInteger(time) && time >= 0 && Number.isSafeInteger(time + week)
            ? Effect.succeed(time)
            : Effect.fail(failure("unavailable")),
        ),
      )
    }

    function read(selection: FabricRecordsContract.Selection) {
      return Effect.gen(function* () {
        if (Option.isNone(Schema.decodeUnknownOption(Kind)(selection.record.kind)))
          return yield* failure("invalid-input")
        const content = yield* records.get(selection)
        const at = yield* instant()
        const decoded = decodeHeader(content.metadata, { onExcessProperty: "error" })
        if (Option.isNone(decoded)) return yield* failure("unavailable")
        const header = decoded.value
        if (
          ![header.createdAt, header.updatedAt].every((time) => Number.isSafeInteger(time) && time >= 0) ||
          header.updatedAt < header.createdAt ||
          at < header.updatedAt
        )
          return yield* failure("unavailable")
        const expected =
          content.record.kind === "composition"
            ? null
            : (content.record.kind === "draft" ? header.updatedAt : header.createdAt) + week
        if (
          header.expiresAt !== expected ||
          (expected !== null && !Number.isSafeInteger(expected)) ||
          header.consent !== (content.record.kind === "evidence")
        )
          return yield* failure("unavailable")
        const metadata = {
          record: content.record,
          createdAt: header.createdAt,
          updatedAt: header.updatedAt,
          expiresAt: header.expiresAt,
          expired: header.expiresAt !== null && at >= header.expiresAt,
        }
        return { metadata, payload: content.payload }
      })
    }

    const put: FabricDocumentsContract.Interface["put"] = (supplied) =>
      Effect.gen(function* () {
        const input = Schema.decodeUnknownOption(Write)(supplied, { onExcessProperty: "error" })
        if (Option.isNone(input) || (input.value.expected !== null && !Number.isSafeInteger(input.value.expected)))
          return yield* failure("invalid-input")
        const value = input.value
        if (value.kind === "evidence" && value.consent !== true) return yield* failure("denied")
        const previous =
          value.expected === null
            ? undefined
            : yield* read({
                context: value.context,
                record: { id: value.id, kind: value.kind, revision: value.expected },
              })
        if (previous?.metadata.expired) return yield* failure("expired")
        const at = yield* instant()
        if (previous && previous.metadata.expiresAt !== null && at >= previous.metadata.expiresAt)
          return yield* failure("expired")
        const createdAt = previous?.metadata.createdAt ?? at
        return yield* records.put({
          context: value.context,
          id: value.id,
          kind: value.kind,
          expected: value.expected,
          payload: value.payload,
          metadata: JSON.stringify({
            format: "fabric-studio.document",
            version: 1,
            createdAt,
            updatedAt: at,
            expiresAt: value.kind === "composition" ? null : (value.kind === "draft" ? at : createdAt) + week,
            consent: value.kind === "evidence",
          }),
        })
      })

    const get: FabricDocumentsContract.Interface["get"] = (supplied) =>
      Effect.gen(function* () {
        const input = Schema.decodeUnknownOption(Selection)(supplied, { onExcessProperty: "error" })
        if (Option.isNone(input)) return yield* failure("invalid-input")
        const content = yield* read(input.value)
        if (content.metadata.expired) return yield* failure("expired")
        return { ...content.metadata, payload: content.payload }
      })

    const inspect: FabricDocumentsContract.Interface["inspect"] = (supplied) =>
      Effect.gen(function* () {
        const input = Schema.decodeUnknownOption(Query)(supplied, { onExcessProperty: "error" })
        if (Option.isNone(input)) return yield* failure("invalid-input")
        const page = yield* records.list(input.value)
        const items = yield* Effect.forEach(page.items, (record) =>
          read({ context: input.value.context, record }).pipe(Effect.map((content) => content.metadata)),
        )
        return { items, ...(page.after === undefined ? {} : { after: page.after }) }
      })

    const remove: FabricDocumentsContract.Interface["remove"] = (supplied) =>
      Effect.gen(function* () {
        const input = Schema.decodeUnknownOption(Removal)(supplied, { onExcessProperty: "error" })
        if (Option.isNone(input)) return yield* failure("invalid-input")
        if (!input.value.confirm) return yield* failure("denied")
        const selection = { context: input.value.context, record: input.value.record }
        yield* read(selection)
        return yield* records.remove(selection)
      })

    const sweep: FabricDocumentsContract.Interface["sweep"] = (supplied) =>
      Effect.gen(function* () {
        const input = Schema.decodeUnknownOption(Sweep)(supplied, { onExcessProperty: "error" })
        if (Option.isNone(input)) return yield* failure("invalid-input")
        if (!input.value.confirm) return yield* failure("denied")
        const value = input.value
        const page = yield* records.list({
          context: value.context,
          kind: value.kind,
          ...(value.after === undefined ? {} : { after: value.after }),
          ...(value.limit === undefined ? {} : { limit: value.limit }),
        })
        const items = yield* Effect.forEach(page.items, (record) =>
          Effect.gen(function* () {
            const selection = { context: value.context, record }
            const content = yield* read(selection)
            if (!content.metadata.expired) return { record, status: "retained" as const }
            const removed = yield* records.remove(selection)
            return { record: removed, status: "removed" as const }
          }).pipe(
            Effect.catch((problem) => {
              // A live authority can receive a partial per-resource receipt. Lost authority cannot receive a new report.
              if (
                problem instanceof FabricContext.Failure ||
                (problem instanceof Capability.Failure && problem.code !== "target_denied")
              )
                return Effect.fail(problem)
              return Effect.succeed({ record, status: "failed" as const, problem })
            }),
          ),
        )
        return {
          items,
          complete: items.every((item) => item.status !== "failed"),
          ...(page.after === undefined ? {} : { after: page.after }),
        }
      })

    return Object.freeze({ put, get, inspect, remove, sweep }) satisfies FabricDocumentsContract.Interface
  })
}

function failure(code: FabricRecord.Failure["code"]) {
  return new FabricRecord.Failure({
    code,
    message:
      code === "expired"
        ? "Fabric document retention has expired"
        : code === "denied"
          ? "Fabric document retention action requires explicit consent"
          : code === "invalid-input"
            ? "Fabric document input is invalid"
            : "Fabric document is unavailable",
  })
}
