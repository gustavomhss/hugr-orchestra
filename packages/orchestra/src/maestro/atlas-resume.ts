import type { FoldVerdict, ResumeUnit } from "@orchestra/atlas-boundary/native-memory"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { Effect, Schema } from "effect"
import type { Agent } from "@/agent/agent"
import { InstanceRef } from "@/effect/instance-ref"
import type { SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import type { Tool } from "@/tool/tool"
import { AtlasMemory } from "./atlas-memory"

// F3 clauses 15-20, rulings F3-D3 and S-3: when Maestro dispatches a backend resume for a unit, the host pushes that
// unit's latest admitted checkpoint into the child Session once per logical resume. Every verdict, a fold or a refusal,
// becomes one synthetic part whose metadata carries the Admission with the exact text the seat reads.

export const Param = AtlasMemory.UnitParam.annotate({
  description:
    "Backend specialist resume only: the task or PR unit whose latest admitted Atlas Memory checkpoint the host adds to the resumed Session once. Ignored for other agents.",
})

export const admit = Effect.fn("AtlasResume.admit")(function* (input: {
  agent: Agent.Info
  sessionID: SessionID
  unit: Schema.Schema.Type<typeof Param>
  ctx: Tool.Context
}) {
  const unit = input.unit
  const callID = input.ctx.callID
  if (!unit || !AtlasMemory.supports(input.agent) || !callID) return []
  const instance = yield* InstanceRef
  const key: AtlasMemory.AdmissionKey = {
    projectID: instance?.project.id ?? "",
    memoryOwner: AtlasMemory.MEMBER,
    logicalResumeID: `${input.ctx.sessionID}/${callID}`,
    kind: unit.kind,
    id: unit.id,
  }
  const sessions = yield* Session.Service
  const history = yield* sessions.messages({ sessionID: input.sessionID })
  // Once per logical resume: a replay of the same dispatch call finds its admission and adds nothing.
  if (AtlasMemory.findAdmission(history, key)) return []
  const memory = yield* AtlasMemory.open({ sessionID: input.sessionID, callID, assistantMessageID: input.ctx.messageID })
  const verdict: FoldVerdict =
    "unavailable" in memory
      ? { ok: false, refusal: "store-unavailable", reason: memory.unavailable }
      : yield* Effect.try({
          try: () => memory.resolveFold(unit, selectedRef(history, key)),
          catch: (cause) => cause,
        }).pipe(
          Effect.catch((cause) =>
            Effect.succeed<FoldVerdict>({
              ok: false,
              refusal: "store-unavailable",
              reason: (cause instanceof Error ? cause.message : String(cause)).split("\n")[0]!.slice(0, 160),
            }),
          ),
        )
  const text = render(unit, verdict)
  const admission: AtlasMemory.Admission = {
    schema: "atlas-resume-admission-v1",
    key,
    residency: "admitted",
    verdict: verdict.ok ? { ok: true, ref: verdict.ref } : { ok: false, refusal: verdict.refusal },
    text,
  }
  return [{ type: "text" as const, synthetic: true, text, metadata: { [AtlasMemory.ADMISSION_KEY]: admission } }]
})

// F3 clause 16: the latest admitted emit receipt for the unit in this Session's own tool evidence names the checkpoint.
// Refused, unavailable and uncertain writes never advance it, and neither does an identical resubmission of a record an
// earlier receipt already admitted. Without a receipt Atlas selects (one own record) or refuses (none, or several).
function selectedRef(history: readonly SessionV1.WithParts[], key: AtlasMemory.AdmissionKey) {
  const admitted = history
    .flatMap((msg) => msg.parts)
    .flatMap((part) => {
      if (part.type !== "tool" || part.state.status !== "completed") return []
      const receipt: AtlasMemory.Receipt | undefined = part.state.metadata[AtlasMemory.RECEIPT_KEY]
      const entry = part.state.input.entry
      if (
        receipt?.schema !== "atlas-memory-receipt-v1" ||
        receipt.op !== "emit" ||
        receipt.outcome !== "admitted" ||
        !receipt.ref ||
        receipt.binding?.memoryOwner !== key.memoryOwner ||
        receipt.binding.projectID !== key.projectID ||
        (key.kind === "task" ? entry?.taskId : entry?.prId) !== key.id
      )
        return []
      return [{ ref: receipt.ref, reconciled: receipt.reconciled === true }]
    })
  return admitted
    .filter((item, index) => !item.reconciled || !admitted.slice(0, index).some((prior) => prior.ref.eventId === item.ref.eventId))
    .at(-1)?.ref
}

// S-3: a missing or ambiguous fold is a `packet` blocker, a partial or unavailable store an `atlas` blocker. The fold
// is the latest admitted checkpoint and is never presented as a final one (F3 clause 19).
function render(unit: ResumeUnit, verdict: FoldVerdict) {
  const head = `Atlas Memory resume of your ${unit.kind} "${unit.id}"`
  if (verdict.ok)
    return [
      `${head}: your latest admitted checkpoint, record ${verdict.ref.eventId}. Work may have continued after it; confirm it still matches the packet before relying on it.`,
      JSON.stringify(verdict.fold, null, 2),
    ].join("\n")
  const blocker = verdict.refusal === "store-partial" || verdict.refusal === "store-unavailable" ? "atlas" : "packet"
  return `${head}: no checkpoint was admitted (${verdict.refusal}: ${verdict.reason}). If the work depends on that checkpoint, return a \`${blocker}\` blocker naming \`${verdict.refusal}\`; never search for it or recall another owner's records.`
}

export * as AtlasResume from "./atlas-resume"
