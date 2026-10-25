export * as WorkflowKnowledgeV2 from "./knowledge"

import { Buffer } from "node:buffer"
import { isDeepStrictEqual } from "node:util"
import { Effect, Option, Schema } from "effect"
import { SessionStore, SessionV2 } from "@orchestra/core/session"
import { AtlasKnowledge } from "@orchestra/schema/atlas-knowledge"
import { MaestroAtlasSourceV2 } from "../atlas-source"
import type { MaestroSeats } from "../seats-service"
import { MaestroAtlasToolV2 } from "../tools/atlas"

// `AtlasKnowledge.resolve`: a workflow publication
// cites an anchor reference, and the host accepts it only when native Archie produced it through one completed
// `atlas_context` call in the author Session and the same units still load unchanged from the Atlas source. V2 keeps one
// message projection, so V1's legacy/modern projection cross-checks have nothing to compare here.

export type Services = {
  readonly store: SessionStore.Interface
  readonly seats: MaestroSeats.Interface
  readonly atlas: MaestroAtlasSourceV2.Services
}

/**
 * The anchor a reference names, or a `MaestroAtlasSourceV2.Held` with V1's reason; the workflow host reports it as
 * `WORKFLOW_KNOWLEDGE_${reason}`.
 */
export const resolve = Effect.fn("WorkflowKnowledgeV2.resolve")(function* (
  services: Services,
  input: { readonly projectID: string; readonly authorSessionID: string; readonly reference: unknown },
) {
  if (!Schema.is(AtlasKnowledge.Reference)(input.reference)) return yield* held("anchor-reference-invalid", [])
  if (MaestroAtlasSourceV2.owner("archie", services.seats) !== "archie")
    return yield* held("native-archie-required", [input.authorSessionID])
  const sessionID = SessionV2.ID.make(input.authorSessionID)
  const session = yield* services.store.get(sessionID)
  if (!session) return yield* held("author-session-unavailable", [input.authorSessionID])
  if (session.projectID !== input.projectID || session.agent !== "archie")
    return yield* held("author-session-binding-mismatch", [input.authorSessionID, input.projectID])
  // The full history, so an anchor older than a compaction still resolves.
  const entries = yield* services.store
    .entries(sessionID)
    .pipe(Effect.mapError(() => new MaestroAtlasSourceV2.Held({ reason: "author-history-invalid", evidence: [sessionID] })))
  const calls = entries.flatMap((entry) => {
    const message = entry.message
    if (message.type !== "assistant") return []
    return message.content.flatMap((part) => {
          if (part.type !== "tool" || !("structured" in part.state)) return []
          const receipt = Option.getOrUndefined(
            Schema.decodeUnknownOption(Schema.Struct({ atlasContext: Schema.Struct({ anchor: Schema.Unknown }) }))(
              part.state.structured,
            ),
          )
          const record = Option.getOrUndefined(
            Schema.decodeUnknownOption(Schema.Struct({ reference: Schema.Unknown }))(receipt?.atlasContext.anchor),
          )
          return record?.reference === input.reference
            ? [{ message, part, anchor: receipt?.atlasContext.anchor }]
            : []
        })
  })
  if (calls.length > 1) return yield* held("anchor-duplicate", [])
  const call = calls[0]
  if (!call) return yield* held("anchor-not-found", [])
  const anchor = Option.getOrUndefined(Schema.decodeUnknownOption(AtlasKnowledge.Anchor)(call.anchor))
  const invocation = Option.getOrUndefined(Schema.decodeUnknownOption(MaestroAtlasToolV2.Input)(call.part.state.input))
  if (
    call.message.error ||
    call.message.finish === "error" ||
    call.message.agent !== "archie" ||
    call.part.name !== MaestroAtlasToolV2.name ||
    call.part.provider?.executed === true ||
    call.part.state.status !== "completed" ||
    !anchor ||
    invocation?.action !== "anchor" ||
    anchor.projectID !== input.projectID ||
    anchor.authorSessionID !== sessionID ||
    anchor.assistantMessageID !== call.message.id ||
    anchor.callID !== call.part.id ||
    !isDeepStrictEqual(anchor.target, invocation.target) ||
    !isDeepStrictEqual(
      anchor.units.map((unit) => unit.unit),
      invocation.units,
    )
  )
    return yield* held("anchor-invocation-mismatch", [input.reference])
  if (anchor.units.reduce((bytes, unit) => bytes + Buffer.byteLength(unit.content, "utf8"), 0) > AtlasKnowledge.MAX_BYTES)
    return yield* held("knowledge-body-budget-exceeded", [input.reference])
  if (
    MaestroAtlasToolV2.digest(AtlasKnowledge.canonical(anchor)) !== anchor.reference ||
    anchor.units.some((unit) => MaestroAtlasToolV2.digest(unit.content) !== unit.bodyHash)
  )
    return yield* held("anchor-digest-mismatch", [input.reference])
  const units = yield* MaestroAtlasToolV2.acquire(
    services.atlas,
    { projectID: session.projectID, directory: session.location.directory },
    invocation.units,
  )
  if (!isDeepStrictEqual(units, anchor.units)) return yield* held("anchor-source-drift", [input.reference])
  return anchor
})

function held(reason: string, evidence: readonly string[]) {
  return Effect.fail(new MaestroAtlasSourceV2.Held({ reason, evidence }))
}
