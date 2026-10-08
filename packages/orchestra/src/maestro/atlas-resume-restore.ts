import type { SessionV1 } from "@orchestra/core/v1/session"
import { Effect } from "effect"
import { MessageV2 } from "@/session/message-v2"
import { PartID, type MessageID, type SessionID } from "@/session/schema"
import type { Session } from "@/session/session"
import { AtlasMemory } from "./atlas-memory"
import { canonicalMemberId } from "./roster"

// Ruling M3-1 (F3-D4 over F2.8): when a compaction leaves a backend Session's admitted resume fold outside the kept
// context, the host re-pushes the same Admission once, as residency "restored", with identical text and ref. The part
// rides the compaction's own user message, which the compacted view keeps ahead of the summary, so it opens no turn.
export const restore = Effect.fn("AtlasResumeRestore.restore")(
  function* (input: { session: Session.Interface; sessionID: SessionID; messageID: MessageID }) {
    const info = yield* input.session.get(input.sessionID)
    if (!AtlasMemory.supports({ id: canonicalMemberId(info.agent), native: true })) return
    const history = yield* input.session.messages({ sessionID: input.sessionID })
    const all = admissions(history)
    const latest = all.findLast((admission) => admission.residency === "admitted")
    if (!latest?.verdict.ok) return
    if (all.some((admission) => admission.residency === "restored" && sameKey(admission.key, latest.key))) return
    if (AtlasMemory.findAdmission(MessageV2.filterCompacted(history.toReversed()), latest.key)) return
    const restored: AtlasMemory.Admission = { ...latest, residency: "restored" }
    yield* input.session.updatePart({
      id: PartID.ascending(),
      messageID: input.messageID,
      sessionID: input.sessionID,
      type: "text",
      synthetic: true,
      text: restored.text,
      metadata: { [AtlasMemory.ADMISSION_KEY]: restored },
    })
  },
  // A restore never fails the compaction it follows.
  (effect) => Effect.ignore(effect),
)

function admissions(history: readonly SessionV1.WithParts[]) {
  return history
    .flatMap((msg) => msg.parts)
    .flatMap((part) => ("metadata" in part ? [part.metadata?.[AtlasMemory.ADMISSION_KEY]] : []))
    .filter((value): value is AtlasMemory.Admission => value?.schema === "atlas-resume-admission-v1")
}

function sameKey(a: AtlasMemory.AdmissionKey, b: AtlasMemory.AdmissionKey) {
  return (
    a.projectID === b.projectID &&
    a.memoryOwner === b.memoryOwner &&
    a.logicalResumeID === b.logicalResumeID &&
    a.kind === b.kind &&
    a.id === b.id
  )
}

export * as AtlasResumeRestore from "./atlas-resume-restore"
