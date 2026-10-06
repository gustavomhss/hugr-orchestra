import { createNativeMemory } from "@opencode-ai/atlas-boundary/native-memory"
import type {
  FoldRefusal,
  MemoryRejected,
  NativeMemory,
  RecordRef,
  StoreState,
} from "@opencode-ai/atlas-boundary/native-memory"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { Effect, Schema } from "effect"
import { InstanceRef } from "@/effect/instance-ref"
import { Git } from "@/git"
import { LEGACY_BACKEND_ID } from "./roster"

// The host side of the backend seat's bound Atlas Memory (F3): one binding per tool execution, the receipt every
// recall/emit persists in its tool part, and the once-only resume admission a logical resume leaves in the Session.

export const MEMBER = "backend"

export const UnitParam = Schema.optional(
  Schema.Union([
    Schema.Struct({ kind: Schema.Literal("task"), id: Schema.NonEmptyString }),
    Schema.Struct({ kind: Schema.Literal("pr"), id: Schema.NonEmptyString }),
  ]),
)

export type Execution = { sessionID: string; callID: string; assistantMessageID: string }

export type MemoryOutcome = "admitted" | "refused" | "unavailable" | "uncertain"

export type Receipt = {
  schema: "atlas-memory-receipt-v1"
  op: "recall" | "emit"
  outcome: MemoryOutcome | "read"
  binding: { projectID: string; root: string; memoryOwner: "backend" } & Execution
  ref?: RecordRef
  reconciled?: true
  refusal?: MemoryRejected
  store?: StoreState
  refs?: readonly RecordRef[]
}

// `logicalResumeID` is `${parentSessionID}/${dispatchCallID}`: the dispatching (parent) Session ID and the ID of the
// task tool call that dispatched the resume.
export type AdmissionKey = {
  projectID: string
  memoryOwner: "backend"
  logicalResumeID: string
  kind: "task" | "pr"
  id: string
}

export type Admission = {
  schema: "atlas-resume-admission-v1"
  key: AdmissionKey
  residency: "admitted" | "restored"
  verdict: { ok: true; ref: RecordRef } | { ok: false; refusal: FoldRefusal }
  text: string
}

export const RECEIPT_KEY = "atlasMemory"
export const ADMISSION_KEY = "atlasResume"

// Binds the seat's Memory to the execution worktree (owner ruling F3-D5, as the running header does) and to this
// tool call. Storage and owner come only from the host; a missing placement, an unreadable HEAD or a binding Atlas
// rejects is returned as `unavailable`, never thrown into the turn.
export const open = Effect.fn("AtlasMemory.open")(function* (execution: Execution) {
  const instance = yield* InstanceRef
  if (!instance) return { unavailable: "no project placement is bound to this call" }
  const root = instance.worktree === "/" ? instance.directory : instance.worktree
  const git = yield* Git.Service
  const head = yield* git.run(["rev-parse", "HEAD"], { cwd: root })
  const revision = head.text().trim()
  if (head.exitCode !== 0 || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision))
    return { unavailable: `the worktree '${root}' has no readable HEAD revision` }
  return yield* Effect.try({
    try: (): NativeMemory =>
      createNativeMemory({
        storage: { projectID: instance.project.id, root },
        source: { worktree: root, revision },
        memoryOwner: MEMBER,
        legacyOwners: [LEGACY_BACKEND_ID],
        execution: {
          actor: { memberId: MEMBER, projectId: instance.project.id, sessionId: execution.sessionID },
          executionSessionID: execution.sessionID,
          invocation: { callID: execution.callID, assistantMessageID: execution.assistantMessageID },
        },
      }),
    catch: (cause) => cause,
  }).pipe(
    Effect.catch((cause) =>
      Effect.succeed({
        unavailable: (cause instanceof Error ? cause.message : String(cause)).split("\n")[0]!.slice(0, 160),
      }),
    ),
  )
})

// An admission is host-written into a part's own metadata or, for a tool part, its result metadata.
export function findAdmission(msgs: readonly SessionV1.WithParts[], key: AdmissionKey): Admission | undefined {
  return msgs
    .flatMap((msg) => msg.parts)
    .flatMap((part) => [
      "metadata" in part ? part.metadata?.[ADMISSION_KEY] : undefined,
      part.type === "tool" && "metadata" in part.state ? part.state.metadata?.[ADMISSION_KEY] : undefined,
    ])
    .find(
      (value): value is Admission =>
        value?.schema === "atlas-resume-admission-v1" &&
        value.key?.projectID === key.projectID &&
        value.key.memoryOwner === key.memoryOwner &&
        value.key.logicalResumeID === key.logicalResumeID &&
        value.key.kind === key.kind &&
        value.key.id === key.id,
    )
}

export * as AtlasMemory from "./atlas-memory"
