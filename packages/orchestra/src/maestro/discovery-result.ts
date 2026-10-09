export * as DiscoveryResult from "./discovery-result"

import { Effect, Option, Schema } from "effect"
import { Research } from "@orchestra/schema/research"
import { Project } from "@orchestra/schema/project"
import { SessionID } from "@orchestra/schema/session-id"
import { ResearchBinding } from "@orchestra/core/research/binding"
import { ResearchRecords } from "@orchestra/core/research/records"
import { Database } from "@orchestra/core/database/database"
import { InstanceRef } from "@/effect/instance-ref"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { BackendResult } from "./backend-result"

export const assemble = Effect.fn("DiscoveryResult.assemble")(function* (
  message: SessionV1.WithParts,
  history: readonly SessionV1.WithParts[],
): Effect.fn.Return<BackendResult.WorkResult, never, Database.Service> {
  const text = message.parts.findLast((part) => part.type === "text")
  const block = text?.type === "text" && text.text.split("```jimmy-result").length === 2
    ? /```jimmy-result[ \t]*\r?\n([\s\S]*?)\r?\n```/.exec(text.text)?.[1] : undefined
  const card = block === undefined ? undefined : Option.getOrUndefined(
    Option.flatMap(Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(block),
      (value) => Schema.decodeUnknownOption(Research.Card)(value)),
  )
  const placement = yield* InstanceRef
   const retained = placement ? yield* Effect.gen(function* () {
    const service = yield* Effect.serviceOption(ResearchRecords.Service)
    if (Option.isNone(service)) return undefined
     const records = service.value
     const binding = yield* ResearchBinding.resolve(SessionID.make(message.info.sessionID), Project.ID.make(placement.project.id))
     const corpus = yield* records.view(binding, { action: "corpus" })
     return { records, binding, corpus: "sources" in corpus ? corpus : undefined }
   }).pipe(Effect.orElseSucceed(() => undefined)) : undefined
   const references = card && retained ? yield* Effect.gen(function* () {
     const records = retained.records
     const binding = retained.binding
     yield* Effect.forEach(card.findingRefs, (ref) => records.view(binding, { action: "record", ref }).pipe(
       Effect.flatMap((value) => "kind" in value && value.kind === "finding" ? Effect.void
         : Effect.fail(new Research.Error({ code: "reference_invalid", message: "Card finding reference is not a finding" }))),
     ), { discard: true })
    yield* Effect.forEach(card.evidenceRefs, (ref) => records.verifyEvidence(binding, ref), { discard: true })
    const documents = yield* Effect.forEach(card.documentRefs, (ref) => records.view(binding, { action: "document", ref }))
    return documents.flatMap((value) => "receipt" in value && "publishedAt" in value.receipt ? [value.receipt] : [])
  }).pipe(Effect.orElseSucceed(() => undefined)) : undefined
  const host = BackendResult.terminal(message)
  return {
    schema: "discovery-work-result-v1",
     card: { parsed: card !== undefined, messageID: message.info.id },
     ...(retained?.corpus ? { corpus: retained.corpus } : {}),
     ...(card && references !== undefined ? { discovery: card, documents: references,
       ...(card.sufficiency === "blocked" ? { outcome: "blocked" as const } : card.sufficiency === "answered" ? { outcome: "done" as const } : {}),
     } : {}),
    referencesChecked: references !== undefined,
    changes: [], checks: [], blockers: [],
    risks: card && references !== undefined ? [...card.limitations, ...card.coverage.failures] : ["Discovery card or its admitted references could not be verified."],
    nextActions: card && references !== undefined ? card.nextActions : ["Reopen retained research evidence before relying on the final report."],
     terminal: { reason: host },
     memory: BackendResult.memory([...history.filter((stored) => stored.info.id !== message.info.id), message]),
  }
})
