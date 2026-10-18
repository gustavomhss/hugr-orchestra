import { Effect, Schema } from "effect"
import { Research } from "@orchestra/schema/research"
import type { ResearchRecords } from "@orchestra/core/research/records"
import { ResearchLedger } from "@orchestra/core/research/ledger"
import { Database } from "@orchestra/core/database/database"

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
): Effect.fn.Return<Summary, Research.Error, Database.Service> {
  const decoded = yield* Schema.decodeUnknownEffect(Schema.Array(Research.RecordRef))(refs).pipe(
    Effect.mapError(() => new Research.Error({ code: "reference_invalid", message: "Invalid finding references" })),
  )
  const unique = [...new Map(decoded.map((ref) => [`${ref.id}:${ref.revision}`, ref])).values()]
  if (unique.length > 32)
    return yield* new Research.Error({ code: "over_cap", message: "Qualification references exceed 32 own findings" })
  if (unique.some((ref) => !ref.id.startsWith("rfnd_")))
    return yield* new Research.Error({ code: "reference_invalid", message: "Qualification reference is not a finding" })
  const findings = yield* Effect.forEach(unique, (ref) => Effect.gen(function* () {
    // Explicit-ID views allow project-wide reuse; handoff requires this Task's own exact admission.
    const admitted = (yield* ResearchLedger.entries(binding, ref.id, true)).find((entry) =>
      entry.type === "research.record.committed" && entry.data.record.kind === "finding" &&
      entry.data.record.id === ref.id && entry.data.record.revision === ref.revision &&
      ResearchLedger.canonical(entry.data.binding) === ResearchLedger.canonical(binding))
    if (!admitted || admitted.type !== "research.record.committed")
      return yield* new Research.Error({ code: "reference_invalid", message: "Qualification finding is not admitted by this Task" })
    const value = yield* records.view(binding, { action: "record", ref })
    if (!("kind" in value) || value.kind !== "finding" || ResearchLedger.canonical(value) !== ResearchLedger.canonical(admitted.data.record))
      return yield* new Research.Error({ code: "reference_invalid", message: "Qualification view differs from own finding admission" })
    return value
  }))
  // Include the document reply's nesting/indentation; reserve 1 KiB for host framing.
  return findings.reduce<Summary>((summary, finding) => {
    const candidate = { records: [...summary.records, finding], complete: summary.records.length + 1 === unique.length,
      total: unique.length, omitted: unique.length - summary.records.length - 1 }
    return Buffer.byteLength(JSON.stringify({ qualifications: candidate }, null, 2), "utf8") <= 15 * 1024 ? candidate : summary
  }, { records: [], complete: unique.length === 0, total: unique.length, omitted: unique.length })
})

export * as ResearchQualifications from "./qualifications"
