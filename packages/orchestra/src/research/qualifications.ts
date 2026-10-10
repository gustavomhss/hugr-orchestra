import { Effect, Schema } from "effect"
import { Research } from "@orchestra/schema/research"
import type { ResearchRecords } from "@orchestra/core/research/records"

export type Summary = {
  readonly records: readonly Extract<Research.Record, { kind: "finding" }>[]
  readonly complete: boolean
  readonly total: number
  readonly omitted: number
}

export const collect = Effect.fn("ResearchQualifications.collect")(function* (
  records: ResearchRecords.Interface,
  binding: Research.Binding,
  refs: readonly Research.RecordRef[],
): Effect.fn.Return<Summary, Research.Error> {
  const decoded = yield* Schema.decodeUnknownEffect(Schema.Array(Research.RecordRef))(refs).pipe(
    Effect.mapError(() => new Research.Error({ code: "reference_invalid", message: "Invalid finding references" })),
  )
  const unique = [...new Map(decoded.map((ref) => [`${ref.id}:${ref.revision}`, ref])).values()]
  if (unique.some((ref) => !ref.id.startsWith("rfnd_")))
    return yield* new Research.Error({ code: "reference_invalid", message: "Qualification reference is not a finding" })
  const findings = yield* Effect.forEach(unique.slice(0, 32), (ref) => records.view(binding, { action: "record", ref }).pipe(
    Effect.flatMap((value) => "kind" in value && value.kind === "finding"
      ? Effect.succeed(value)
      : Effect.fail(new Research.Error({ code: "reference_invalid", message: "Qualification reference is not a finding" }))),
  ))
  // Keep whole authored records. Omitted refs are not claimed checked or semantically verified.
  const selected = findings.reduce<Extract<Research.Record, { kind: "finding" }>[]>((selected, finding) =>
    Buffer.byteLength(JSON.stringify([...selected, finding]), "utf8") <= 16 * 1024
      ? [...selected, finding] : selected, [])
  return { records: selected, complete: selected.length === unique.length,
    total: unique.length, omitted: unique.length - selected.length }
})

export * as ResearchQualifications from "./qualifications"
