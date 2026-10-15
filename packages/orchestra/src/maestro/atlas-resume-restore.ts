import type { SessionV1 } from "@orchestra/core/v1/session"
import { Effect } from "effect"
import type { Agent } from "@/agent/agent"
import type { Prepared } from "@/continuity/memory-types"
import { MessageV2 } from "@/session/message-v2"
import { PartID, type MessageID, type SessionID } from "@/session/schema"
import type { Session } from "@/session/session"
import { AtlasMemory } from "./atlas-memory"
import { canonicalMemberId } from "./roster"

// Ruling M3-1 (F3-D4 over F2.8): when a compaction leaves a backend Session's admitted resume fold outside the kept
// context, the host re-pushes the same Admission once, as residency "restored", with identical text and ref. This is
// the legacy compaction's restore, for compaction tasks stored before continuity: the part rides the compaction's own
// user message, which the compacted view keeps ahead of the summary, so it opens no turn.
export const restore = Effect.fn("AtlasResumeRestore.restore")(
  function* (input: { session: Session.Interface; sessionID: SessionID; messageID: MessageID }) {
    const info = yield* input.session.get(input.sessionID)
    if (!AtlasMemory.supports({ id: canonicalMemberId(info.agent), native: true })) return
    const history = yield* input.session.messages({ sessionID: input.sessionID })
    const restored = evicted(history, MessageV2.filterCompacted(history.toReversed()))
    if (restored) yield* write(input.session, input.sessionID, input.messageID, restored)
  },
  // A restore never fails the compaction it follows.
  (effect) => Effect.ignore(effect),
)

// Ruling M3-1 for continuity compaction (manual or automatic), which writes no compaction message: the restore rides
// the request's current user message once the fold is missing from the view the model is about to receive. A message
// the applied memory covers is never edited, since that would break the memory's fingerprints; the restore then waits
// for a request whose user message is past the memory boundary.
export const request = Effect.fn("AtlasResumeRestore.request")(function* (input: {
  session: Session.Interface
  agent: Agent.Info
  sessionID: SessionID
  user: MessageID
  prepared: Prepared
}) {
  if (!AtlasMemory.supports(input.agent)) return input.prepared
  const history = yield* input.session.messages({ sessionID: input.sessionID }).pipe(Effect.orElseSucceed(() => []))
  const restored = evicted(history, input.prepared.messages)
  const target = input.prepared.messages.find((message) => message.info.id === input.user)
  const boundary = input.prepared.coverage
    ? history.findIndex((message) => message.info.id === input.prepared.coverage?.boundary)
    : input.prepared.system.length
      ? history.length
      : -1
  if (!restored || !target || history.findIndex((message) => message.info.id === input.user) <= boundary)
    return input.prepared
  const part = yield* write(input.session, input.sessionID, input.user, restored)
  return {
    ...input.prepared,
    messages: input.prepared.messages.map((message) =>
      message === target ? { ...message, parts: [...message.parts, part] } : message,
    ),
  }
})

// The latest admitted fold, as its restored copy, when it is missing from the kept view and was never restored.
function evicted(history: readonly SessionV1.WithParts[], kept: readonly SessionV1.WithParts[]) {
  const all = admissions(history)
  const latest = all.findLast((admission) => admission.residency === "admitted")
  if (!latest?.verdict.ok) return
  if (all.some((admission) => admission.residency === "restored" && sameKey(admission.key, latest.key))) return
  if (AtlasMemory.findAdmission(kept, latest.key)) return
  return { ...latest, residency: "restored" } satisfies AtlasMemory.Admission
}

function write(
  session: Session.Interface,
  sessionID: SessionID,
  messageID: MessageID,
  restored: AtlasMemory.Admission,
) {
  return session.updatePart({
    id: PartID.ascending(),
    messageID,
    sessionID,
    type: "text",
    synthetic: true,
    text: restored.text,
    metadata: { [AtlasMemory.ADMISSION_KEY]: restored },
  } satisfies SessionV1.TextPart)
}

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
