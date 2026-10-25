export * as ResumeAdmissionV2 from "./resume-admission"

import { createHash } from "node:crypto"
import type { FoldVerdict, RecordRef, ResumeUnit } from "@orchestra/atlas-boundary/native-memory"
import { ToolFailure } from "@orchestra/llm"
import { and, eq, sql } from "drizzle-orm"
import { Effect, Schema } from "effect"
import type { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import type { GitCli } from "@orchestra/core/git-cli"
import type { Location } from "@orchestra/core/location"
import type { SessionMessage } from "@orchestra/core/session/message"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import type { MaestroAtlasSourceV2 } from "../atlas-source"
import { MaestroAtlasMemoryTools } from "../tools/atlas-memory"
import { GovernanceRecordsV2 } from "./records"

// What the Task tool adds to a child's prompt: the resume marker of a
// resumed child (`LogicalTask.resumeMarker`) and a native Atlas seat's resume admission (`AtlasResume.admit`). V2
// prompts carry text only, so the parts' metadata becomes one Maestro record keyed by the child and its prompt, written
// before the prompt is admitted; the admission text joins the prompt text, and the Atlas restore reads the record.

export type Recorded = Schema.Schema.Type<typeof MaestroEvent.Task.ResumeAdmitted.data>
export type Admission = NonNullable<Recorded["atlasResume"]>

type Services = {
  readonly db: Database.Interface["db"]
  readonly events: EventV2.Interface
  readonly git: GitCli.Interface
  readonly location: Location.Interface
}

const decode = Schema.decodeUnknownSync(MaestroEvent.Task.ResumeAdmitted.data)

/** F2.11: one logical resume per dispatching Session and Task call, as V1's `LogicalTask.resumeRef`. */
export function resumeRef(parentSessionID: string, callID: string) {
  return `${parentSessionID}/${callID}`
}

/**
 * Record what this Task call adds to the prompt `promptID` of its child, once: an exact retry reads the stored record,
 * so it admits the same text. A resumed child gets its resume marker; an Atlas seat dispatched with a unit gets the
 * fold of its latest admitted checkpoint, or a refusal, as V1 renders it. Nothing to add records nothing.
 */
export const admit = Effect.fn("ResumeAdmissionV2.admit")(function* (
  services: Services,
  input: {
    readonly childID: string
    readonly promptID: string
    readonly parentID: string
    readonly callID: string
    readonly assistantMessageID: string
    readonly resumed: boolean
    readonly member: MaestroAtlasSourceV2.Owner | undefined
    readonly unit: ResumeUnit | undefined
    readonly history: ReadonlyArray<SessionMessage.Message>
  },
) {
  const stored = yield* read(services.db, input.childID, input.promptID)
  if (stored) return stored
  const ref = resumeRef(input.parentID, input.callID)
  const atlasResume =
    input.member && input.unit ? yield* atlas(services, { ...input, member: input.member, unit: input.unit }, ref) : undefined
  if (!input.resumed && !atlasResume) return undefined
  const record: Recorded = {
    executionSessionID: input.childID,
    promptID: input.promptID,
    ...(input.resumed ? { resumeRef: ref } : {}),
    ...(atlasResume ? { atlasResume } : {}),
  }
  const id = eventID(input.childID, input.promptID)
  return yield* services.events.publish(MaestroEvent.Task.ResumeAdmitted, record, { id }).pipe(
    Effect.as(record),
    // A concurrent retry of the same call won the insert: the stored record decides.
    Effect.catchCause(() =>
      Effect.gen(function* () {
        const raced = yield* read(services.db, input.childID, input.promptID)
        if (!raced) return yield* new ToolFailure({ message: "Task denied: resume-admission-hold" })
        return raced
      }),
    ),
  )
})

/** The record of the child's prompt `promptID`, or undefined when its Task call added nothing. */
export const read = Effect.fn("ResumeAdmissionV2.read")(function* (
  db: Database.Interface["db"],
  childID: string,
  promptID: string,
) {
  const row = yield* GovernanceRecordsV2.row(db, eventID(childID, promptID))
  if (!row || row.type !== EventV2.versionedType(MaestroEvent.Task.ResumeAdmitted.type, 1)) return undefined
  const record = decode(row.data)
  return record.executionSessionID === childID && record.promptID === promptID ? record : undefined
})

/**
 * V1's `LogicalTask.readResumeRef` over the record: the resume marker of the child's prompt `promptID`, only when the
 * dispatching Session is the child's own parent.
 */
export const readResumeRef = Effect.fn("ResumeAdmissionV2.readResumeRef")(function* (
  db: Database.Interface["db"],
  input: { readonly childID: string; readonly promptID: string; readonly parentID: string | undefined },
) {
  const ref = (yield* read(db, input.childID, input.promptID))?.resumeRef
  return ref && input.parentID && ref.startsWith(`${input.parentID}/`) ? ref : undefined
})

/** Every Atlas resume admission recorded for the child's prompts, by prompt. */
export const admissions = Effect.fn("ResumeAdmissionV2.admissions")(function* (
  db: Database.Interface["db"],
  childID: string,
) {
  const rows = yield* db
    .select({ data: EventV2.EventTable.data })
    .from(EventV2.EventTable)
    .where(
      and(
        eq(EventV2.EventTable.type, EventV2.versionedType(MaestroEvent.Task.ResumeAdmitted.type, 1)),
        sql`json_extract(${EventV2.EventTable.data}, '$.executionSessionID') = ${childID}`,
      ),
    )
    .all()
    .pipe(Effect.orDie)
  return new Map(
    rows.flatMap((row) => {
      const record = decode(row.data)
      return record.atlasResume ? [[record.promptID, record.atlasResume] as const] : []
    }),
  )
})

// V1 binds the child Session to the dispatching call; a Memory that cannot open or resolve is a refusal, never a throw.
const atlas = Effect.fnUntraced(function* (
  services: Services,
  input: {
    readonly childID: string
    readonly callID: string
    readonly assistantMessageID: string
    readonly member: MaestroAtlasSourceV2.Owner
    readonly unit: ResumeUnit
    readonly history: ReadonlyArray<SessionMessage.Message>
  },
  logicalResumeID: string,
) {
  const key = {
    projectID: services.location.project.id,
    memoryOwner: input.member,
    logicalResumeID,
    kind: input.unit.kind,
    id: input.unit.id,
  }
  const opened = yield* MaestroAtlasMemoryTools.open(services, input.member, {
    sessionID: input.childID,
    callID: input.callID,
    assistantMessageID: input.assistantMessageID,
  })
  const memory = opened.memory
  const verdict: FoldVerdict =
    "unavailable" in memory
      ? { ok: false, refusal: "store-unavailable", reason: memory.unavailable }
      : yield* Effect.try({
          try: () => memory.resolveFold(input.unit, selectedRef(input.history, key)),
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
  return {
    schema: "atlas-resume-admission-v1",
    key,
    residency: "admitted",
    verdict: verdict.ok ? { ok: true, ref: verdict.ref } : { ok: false, refusal: verdict.refusal },
    text: render(input.unit, verdict),
  } satisfies Admission
})

/**
 * V1's `AtlasResume.selectedRef` (F3 clause 16) over V2 history: the latest admitted emit receipt for the unit in the
 * child's own tool results names the checkpoint. Refused, unavailable and uncertain writes never advance it, nor does
 * an identical resubmission of a record an earlier receipt admitted. Without one, Atlas selects or refuses.
 */
export function selectedRef(
  history: ReadonlyArray<SessionMessage.Message>,
  key: { readonly projectID: string; readonly memoryOwner: string; readonly kind: "task" | "pr"; readonly id: string },
): RecordRef | undefined {
  const admitted = history
    .flatMap((message) => (message.type === "assistant" ? message.content : []))
    .flatMap((part) => {
      if (part.type !== "tool" || part.state.status !== "completed") return []
      const receipt = part.state.structured[MaestroAtlasMemoryTools.RECEIPT_KEY] as
        | Partial<MaestroAtlasMemoryTools.Receipt>
        | undefined
      const entry = part.state.input.entry as { readonly taskId?: unknown; readonly prId?: unknown } | undefined
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
    .filter(
      (item, index) =>
        !item.reconciled || !admitted.slice(0, index).some((prior) => prior.ref.eventId === item.ref.eventId),
    )
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

function eventID(childID: string, promptID: string) {
  return EventV2.ID.make(
    `evt_maestro_task_resume_admitted_${createHash("sha256").update(`${childID}\n${promptID}`, "utf8").digest("hex")}`,
  )
}
