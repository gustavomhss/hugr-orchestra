import type { SessionV1 } from "@orchestra/core/v1/session"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Effect } from "effect"
import { Agent } from "@/agent/agent"
import { MessageV2 } from "@/session/message-v2"
import { PartID, type MessageID, type SessionID } from "@/session/schema"
import type { Session } from "@/session/session"
import { AtlasMemory } from "./atlas-memory"
import { canonicalMemberId } from "./roster"

// When compaction leaves a native Atlas Session's admitted resume fold outside the kept
// context, the host re-pushes the same Admission once, as residency "restored", with identical text and ref. The part
// rides the compaction's own user message, which the compacted view keeps ahead of the summary, so it opens no turn.
export const restore = Effect.fn("AtlasResumeRestore.restore")(
  function* (input: { session: Session.Interface; sessionID: SessionID; messageID: MessageID }) {
    const info = yield* input.session.get(input.sessionID)
    if (!info.agent) return
    const agents = yield* Agent.Service
    const agent = yield* agents.get(canonicalMemberId(info.agent))
    const member = AtlasMemory.owner(agent)
    if (!member) return
    const history = yield* input.session.messages({ sessionID: input.sessionID })
    const all = admissions(history).filter(
      (admission) => admission.key.memoryOwner === member && admission.key.projectID === info.projectID,
    )
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
  (effect) => effect.pipe(Effect.provide(LayerNode.compile(Agent.node)), Effect.ignore),
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
