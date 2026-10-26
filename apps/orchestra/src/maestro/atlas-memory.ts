import { createNativeMemory } from "@orchestra/atlas-boundary/native-memory"
import type {
  FoldRefusal,
  MemoryRejected,
  NativeMemory,
  RecordRef,
  StoreState,
} from "@orchestra/atlas-boundary/native-memory"
import { BackendToolkit } from "@orchestra/core/backend-toolkit"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { Effect, Schema } from "effect"
import { InstanceRef } from "@/effect/instance-ref"
import { Git } from "@/git"
import { LEGACY_BACKEND_ID } from "@orchestra/maestro/roster"
import { Seats } from "@orchestra/maestro/seats"

// The host side of native seats' bound Atlas Memory: one binding per tool execution, the receipt every
// recall/emit persists in its tool part, and the once-only resume admission a logical resume leaves in the Session.

export type Owner = "backend" | "jimmy" | "archie" | "live"

// Stable executing identity and explicit seat capability are both required; labels never choose an owner.
export function owner(agent: { id?: string; native?: boolean } | undefined): Owner | undefined {
  if (agent?.native !== true || (agent.id !== "backend" && agent.id !== "jimmy" && agent.id !== "archie" && agent.id !== "live")) return undefined
  return Seats.find(agent.id)?.atlasMemory === true ? agent.id : undefined
}

export function supports(agent: { id?: string; native?: boolean }) {
  return owner(agent) !== undefined
}

export const UnitParam = Schema.optional(
  Schema.Union([
    Schema.Struct({ kind: Schema.Literal("task"), id: Schema.NonEmptyString }),
    Schema.Struct({ kind: Schema.Literal("pr"), id: Schema.NonEmptyString }),
  ]),
)

export type Execution = { sessionID: string; callID: string; assistantMessageID: string }

export type MemoryOutcome = "admitted" | "proposed" | "refused" | "unavailable" | "uncertain"

export type Receipt = {
  schema: "atlas-memory-receipt-v1"
  op: "recall" | "emit"
  outcome: MemoryOutcome | "read"
  binding: { projectID: string; root: string; memoryOwner: Owner } & Execution
  ref?: RecordRef
  proposalId?: string
  reconciled?: true
  refusal?: MemoryRejected
  store?: StoreState
  refs?: readonly RecordRef[]
}

// `logicalResumeID` is `${parentSessionID}/${dispatchCallID}`: the dispatching (parent) Session ID and the ID of the
// task tool call that dispatched the resume.
export type AdmissionKey = {
  projectID: string
  memoryOwner: Owner
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
export const open = Effect.fn("AtlasMemory.open")(function* (
  execution: Execution,
  agent: { id?: string; native?: boolean },
) {
  const member = owner(agent)
  if (!member) return { unavailable: "no supported native Atlas owner is bound to this call" }
  if (!execution.sessionID || !execution.callID || !execution.assistantMessageID)
    return { unavailable: "the tool call carries incomplete execution identity" }
  const instance = yield* InstanceRef
  if (!instance) return { unavailable: "no project placement is bound to this call" }
  const root = instance.worktree === "/" ? instance.directory : instance.worktree
  const git = yield* Git.Service
  const head = yield* git.run(["rev-parse", "HEAD"], { cwd: root })
  const revision = head.text().trim()
  if (head.exitCode !== 0 || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision))
    return { unavailable: `the worktree '${root}' has no readable HEAD revision` }
  // F3-D9: Atlas scans writes with the toolkit's pinned gitleaks, fetched on first use. When the toolkit cannot supply
  // it, Atlas looks for a scanner on PATH and, without one, refuses every write `scanner-unavailable`.
  const scanner = yield* BackendToolkit.ensure("gitleaks").pipe(
    Effect.map((ready) => ({ name: "gitleaks" as const, command: ready.executable })),
    Effect.orElseSucceed(() => undefined),
  )
  return yield* Effect.try({
    try: (): NativeMemory =>
      createNativeMemory({
        storage: { projectID: instance.project.id, root },
        source: { worktree: root, revision },
        memoryOwner: member,
        legacyOwners: member === "backend" ? [LEGACY_BACKEND_ID] : [],
        execution: {
          actor: { memberId: member, projectId: instance.project.id, sessionId: execution.sessionID },
          executionSessionID: execution.sessionID,
          invocation: { callID: execution.callID, assistantMessageID: execution.assistantMessageID },
        },
        ...(scanner && { scanner }),
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
