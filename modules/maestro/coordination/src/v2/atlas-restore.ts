export * as MaestroAtlasRestoreV2 from "./atlas-restore"

import { Database } from "@orchestra/core/database/database"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { Location } from "@orchestra/core/location"
import { SessionStore, SessionV2 } from "@orchestra/core/session"
import { SystemContext, SystemContextRegistry } from "@orchestra/core/system-context"
import { Effect, Layer, Schema } from "effect"
import { MaestroAtlasSourceV2 } from "./atlas-source"
import { ResumeAdmissionV2 } from "./governance/resume-admission"
import { MaestroSeats } from "./seats-service"

export const key = SystemContext.Key.make("maestro/atlas-resume")

/**
 * Where a resume admission rides, as in V1: a message's own metadata or a completed tool call's structured output. A V2
 * Task records it beside the prompt it admits (`ResumeAdmissionV2`), so it rides that prompt's message once promoted.
 */
export const ADMISSION_KEY = "atlasResume"

export type AdmissionKey = {
  readonly projectID: string
  readonly memoryOwner: string
  readonly logicalResumeID: string
  readonly kind: "task" | "pr"
  readonly id: string
}

export type Admission = {
  readonly schema: "atlas-resume-admission-v1"
  readonly key: AdmissionKey
  readonly residency: "admitted" | "restored"
  readonly verdict: { readonly ok: boolean }
  readonly text: string
}

/** One stored Session message with its order. */
export type Entry = {
  readonly seq: number
  readonly message: { readonly type: string; readonly metadata?: unknown; readonly content?: unknown }
}

/**
 * Ruling M3-1 on V2: when a compaction leaves a native Atlas seat's admitted resume fold outside the kept history, the
 * host restores the same admission text, unchanged, as a System Context source of that seat's turns. V1 re-pushed it
 * into a message; V2 compaction may record no Session events and is owned elsewhere, while the Context Epoch it starts
 * re-renders every source into the new baseline, so the restore composes with any compaction without touching it. The
 * restored copy stays resident while the fold is evicted and leaves when a newer admission is visible again.
 */
const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const registry = yield* SystemContextRegistry.Service
    const seats = yield* MaestroSeats.Service
    const location = yield* Location.Service
    const sessions = yield* SessionStore.Service
    const database = yield* Database.Service
    yield* registry.register({
      key,
      load: Effect.gen(function* () {
        const turn = yield* SystemContextRegistry.Turn
        const member = turn && MaestroAtlasSourceV2.owner(turn.agent, seats)
        if (!turn || !member) return SystemContext.empty
        // An unreadable history restores nothing; it never blocks the turn.
        const entries = yield* sessions
          .entries(SessionV2.ID.make(turn.sessionID))
          .pipe(Effect.orElseSucceed(() => []))
        const recorded = yield* ResumeAdmissionV2.admissions(database.db, turn.sessionID)
        const restored = evicted(
          entries.flatMap((entry) => {
            const admission = recorded.get(entry.message.id)
            return admission
              ? [entry, { seq: entry.seq, message: { type: entry.message.type, metadata: { [ADMISSION_KEY]: admission } } }]
              : [entry]
          }),
          member,
          location.project.id,
        )
        if (!restored) return SystemContext.empty
        return SystemContext.make({
          key,
          codec: Schema.toCodecJson(Schema.String),
          load: Effect.succeed(restored.text),
          baseline: (text) => text,
          update: (_previous, text) => text,
        })
      }),
    })
  }),
)

/**
 * The member's latest admitted fold in this project, as its restored copy, when every copy of it lies before the latest
 * compaction and none was restored into the history (V1's legacy restore).
 */
export function evicted(entries: readonly Entry[], member: string, projectID: string): Admission | undefined {
  const compaction = entries.findLast((entry) => entry.message.type === "compaction")?.seq ?? -Infinity
  const all = entries.flatMap((entry) =>
    admissions(entry.message)
      .filter((admission) => admission.key.memoryOwner === member && admission.key.projectID === projectID)
      .map((admission) => ({ seq: entry.seq, admission })),
  )
  const latest = all.findLast((item) => item.admission.residency === "admitted")
  if (!latest?.admission.verdict.ok) return
  const same = all.filter((item) => sameKey(item.admission.key, latest.admission.key))
  if (same.some((item) => item.admission.residency === "restored" || item.seq >= compaction)) return
  return { ...latest.admission, residency: "restored" }
}

function admissions(message: Entry["message"]): Admission[] {
  const tools = Array.isArray(message.content)
    ? message.content.flatMap((part) =>
        isRecord(part) && part.type === "tool" && isRecord(part.state) && isRecord(part.state.structured)
          ? [part.state.structured[ADMISSION_KEY]]
          : [],
      )
    : []
  return [isRecord(message.metadata) ? message.metadata[ADMISSION_KEY] : undefined, ...tools].filter(isAdmission)
}

function isAdmission(value: unknown): value is Admission {
  return (
    isRecord(value) &&
    value.schema === "atlas-resume-admission-v1" &&
    (value.residency === "admitted" || value.residency === "restored") &&
    typeof value.text === "string" &&
    isRecord(value.verdict) &&
    typeof value.verdict.ok === "boolean" &&
    isRecord(value.key) &&
    typeof value.key.projectID === "string" &&
    typeof value.key.memoryOwner === "string" &&
    typeof value.key.logicalResumeID === "string" &&
    (value.key.kind === "task" || value.key.kind === "pr") &&
    typeof value.key.id === "string"
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function sameKey(a: AdmissionKey, b: AdmissionKey) {
  return (
    a.projectID === b.projectID &&
    a.memoryOwner === b.memoryOwner &&
    a.logicalResumeID === b.logicalResumeID &&
    a.kind === b.kind &&
    a.id === b.id
  )
}

export const node = makeLocationNode({
  name: "maestro/atlas-resume",
  layer,
  deps: [Location.node, SessionStore.node, Database.node, SystemContextRegistry.node, MaestroSeats.node],
})
