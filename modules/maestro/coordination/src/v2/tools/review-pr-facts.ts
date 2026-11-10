export * as ReviewPRFactsV2 from "./review-pr-facts"

import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { ReviewRouting } from "@orchestra/core/review/routing"
import { Tool } from "@orchestra/core/tool/tool"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { NonNegativeInt, PositiveInt } from "@orchestra/schema/schema"
import { Context, Effect, Option, Schema } from "effect"
import { ReviewPrecisionEvent } from "@orchestra/schema/review-precision-event"
import { ReviewChecksV2 } from "../workflow/review-checks"
import { ReviewPRStoreV2 } from "./review-pr-store"

const LIMIT = 4 * 1024 * 1024
/** Test coordination before the real link; production has no asynchronous hook. */
export const BeforePublish = Context.Reference<() => Promise<void>>("@orchestra/ReviewPRFacts/BeforePublish", { defaultValue: () => () => Promise.resolve() })
const Digest = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/))
const Confirmed = Schema.Struct({
  id: Schema.NonEmptyString, path: Schema.NonEmptyString, line: PositiveInt, endLine: Schema.optional(PositiveInt),
  severity: Schema.NonEmptyString, class: Schema.NonEmptyString, node: Schema.NonEmptyString,
  lens: Schema.NonEmptyString, rule: Schema.NonEmptyString, trigger: Schema.NonEmptyString,
  rungs: Schema.Array(Schema.NonEmptyString), evidence: MaestroEvent.Review.Evidence,
})
export const Facts = Schema.Struct({
  candidate: Digest,
  method: Schema.NonEmptyString,
  routing: ReviewRouting.Record,
  scope: Schema.Struct({ base: Schema.NonEmptyString, head: Schema.NonEmptyString, files: NonNegativeInt, changedLines: NonNegativeInt }),
  confirmed: Schema.Array(Confirmed),
  checkFacts: ReviewChecksV2.Facts,
  outcomes: Schema.Array(ReviewPrecisionEvent.Read),
})
export type Facts = typeof Facts.Type

const decodeJson = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)
const decode = Schema.decodeUnknownOption(Facts)
const reason = (code: string, detail: string) => new Tool.Failure({ message: `${code}: ${detail}`, metadata: { reason: code } })

/** `store` is the host's analysisStore(`pr_${candidate}`), never model-selected. */
export function file(store: string, candidate: string) {
  if (!/^[0-9a-f]{64}$/.test(candidate) || path.basename(store) !== `pr_${candidate}`)
    throw reason("pr-facts-identity", "invalid candidate or analysis store")
  return path.join(store, "host-facts.json")
}

/** Undefined means absent; invalid, oversized, unreadable and mismatched files fail closed. */
export const read = Effect.fn("ReviewPRFactsV2.read")(function* (store: string, candidate: string) {
  if (!ReviewPRStoreV2.supported()) return yield* reason("pr-facts-unsupported", "private replay store requires supported Unix")
  const target = yield* Effect.try({ try: () => file(store, candidate), catch: (error) => error instanceof Tool.Failure ? error : reason("pr-facts-identity", String(error)) })
  const bytes = yield* Effect.tryPromise({
    try: async () => {
      if (!(await ReviewPRStoreV2.directory(store, false))) return undefined
      const handle = await ReviewPRStoreV2.open(target)
      if (!handle) return undefined
      try {
        const buffer = Buffer.alloc(LIMIT + 1)
        let offset = 0
        while (offset < buffer.length) {
          const chunk = await handle.read(buffer, offset, buffer.length - offset, null)
          if (chunk.bytesRead === 0) break
          offset += chunk.bytesRead
        }
        return buffer.subarray(0, offset)
      } finally {
        await handle.close()
      }
    },
    catch: (error) => reason("pr-facts-unavailable", String(error)),
  })
  if (bytes === undefined) return undefined
  if (bytes.length > LIMIT) return yield* reason("pr-facts-oversized", "host facts exceed 4 MiB")
  const text = yield* Effect.try({ try: () => new TextDecoder("utf-8", { fatal: true }).decode(bytes), catch: () => reason("pr-facts-corrupt", "invalid UTF-8") })
  const parsed = Option.flatMap(decodeJson(text), (value) => decode(value, { onExcessProperty: "error" }))
  if (Option.isNone(parsed)) return yield* reason("pr-facts-corrupt", "invalid host facts")
  if (parsed.value.candidate !== candidate) return yield* reason("pr-facts-identity", "candidate mismatch")
  return parsed.value
})

/** Call only after completed fanout; no card, verdict, approval or review receipt belongs here. */
export const write = (store: string, facts: Facts) => Effect.uninterruptible(Effect.gen(function* () {
  if (!ReviewPRStoreV2.supported()) return yield* reason("pr-facts-unsupported", "private replay store requires supported Unix")
  const target = yield* Effect.try({ try: () => file(store, facts.candidate), catch: (error) => error instanceof Tool.Failure ? error : reason("pr-facts-identity", String(error)) })
  const decoded = decode(facts, { onExcessProperty: "error" })
  if (Option.isNone(decoded)) return yield* reason("pr-facts-corrupt", "invalid host facts")
  const text = JSON.stringify(facts)
  if (Buffer.byteLength(text, "utf8") > LIMIT) return yield* reason("pr-facts-oversized", "host facts exceed 4 MiB")
  const beforePublish = yield* BeforePublish
  const published = yield* Effect.tryPromise({
    try: async () => {
      await ReviewPRStoreV2.directory(store, true)
      const existing = await ReviewPRStoreV2.open(target)
      if (existing) await existing.close()
      const temporary = `${target}.${randomUUID()}.tmp`
      const handle = await fs.open(temporary, "wx", 0o600)
      try {
        try {
          await handle.writeFile(text, "utf8")
        } finally {
          await handle.close()
        }
        await beforePublish()
        await ReviewPRStoreV2.directory(store, false)
        return await fs.link(temporary, target).then(() => true, (error: NodeJS.ErrnoException) => {
          if (error.code === "EEXIST") return false
          throw error
        })
      } finally {
        await fs.rm(temporary, { force: true })
      }
    },
    catch: (error) => reason("pr-facts-unavailable", String(error)),
  })
  if (!published) {
    const existing = yield* read(store, facts.candidate)
    if (!existing || !isDeepStrictEqual(existing, decoded.value))
      return yield* reason("pr-facts-conflict", "candidate already has different host facts")
  }
}))
