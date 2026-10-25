export * as MaestroAtlasMemoryTools from "./atlas-memory"

import { createNativeMemory, proposeProjectRule } from "@orchestra/atlas-boundary/native-memory"
import type {
  AtlasBinding,
  BoundEntry,
  MemoryRejected,
  NativeMemory,
  RecordRef,
  StoreState,
} from "@orchestra/atlas-boundary/native-memory"
import { AgentV2 } from "@orchestra/core/agent"
import { BackendToolkit } from "@orchestra/core/backend-toolkit"
import { GitCli } from "@orchestra/core/git-cli"
import { Location } from "@orchestra/core/location"
import { PermissionV2 } from "@orchestra/core/permission"
import { Tool } from "@orchestra/core/tool/tool"
import { Context, Effect, Schema } from "effect"
import { MaestroAtlasSourceV2 } from "../atlas-source"
import { MaestroSeats } from "../seats-service"

// The native Atlas Memory tools. The host binds owner, storage and
// the call; the model supplies a unit or an entry and nothing else. Only native seats carrying Atlas Memory reach them:
// `v2/seats.ts` hides them from every other agent and each call checks its caller again. Atlas storage is harness-owned,
// so neither tool is a file write.

export const names = { recall: "atlas_memory_recall", emit: "atlas_memory_emit" } as const

/** Where a call's receipt rides, as V1's tool metadata key: here the structured tool output. */
export const RECEIPT_KEY = "atlasMemory"

/**
 * The Memory each call binds: always Atlas's `createNativeMemory` in production. A test may wrap it to pin the scanner
 * binary, since Bun resolves a child-process command against the PATH the process started with.
 */
export const Open = Context.Reference<(binding: AtlasBinding) => NativeMemory>("@orchestra/MaestroAtlasMemory/Open", {
  defaultValue: () => createNativeMemory,
})

export type Outcome = "admitted" | "proposed" | "refused" | "unavailable" | "uncertain"

export type Receipt = {
  readonly schema: "atlas-memory-receipt-v1"
  readonly op: "recall" | "emit"
  readonly outcome: Outcome | "read"
  readonly binding: {
    readonly projectID: string
    readonly root: string
    readonly memoryOwner: MaestroAtlasSourceV2.Owner
    readonly sessionID: string
    readonly callID: string
    readonly assistantMessageID: string
  }
  readonly ref?: RecordRef
  readonly proposalId?: string
  readonly reconciled?: true
  readonly refusal?: MemoryRejected
  readonly store?: StoreState
  readonly refs?: readonly RecordRef[]
}

const Id = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256))
const closed = { parseOptions: { onExcessProperty: "error" } } as const
export const RecallInput = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("task"), taskId: Id }).annotate(closed),
  Schema.Struct({ kind: Schema.Literal("pr"), prId: Id }).annotate(closed),
])
// The entry stays raw: Atlas's closed templates are its only judge, so the host adds no schema of its own.
export const EmitInput = Schema.Struct({ entry: Schema.Record(Schema.String, Schema.Unknown) }).annotate(closed)
export const Output = Schema.Struct({
  title: Schema.String,
  output: Schema.String,
  [RECEIPT_KEY]: Schema.optional(Schema.Unknown),
})

export const recallDescription =
  'Recall your own Atlas Memory records for one task or PR: {"kind":"task","taskId":...} or {"kind":"pr","prId":...}. Only your own task and PR records are reachable; records of other memory owners, project rules and the logbook are not. The result names the store state: complete (an empty list means nothing is recorded), partial (some lines could not be read, so the list may be incomplete) or unavailable (nothing could be read; never an empty result).'

export const emitDescription =
  'Record one Atlas Memory entry as your own: {"entry": ...}, a task entry {taskId, attempted[], failedWith[], stoppedAt, lesson, ref?}, a PR entry {prId, decisions[], reviewOutcomes[], knowledgeDelta[], ref?} or a project rule {rule, scope} (never set frecency or grounding). A project rule is not written: it is proposed to the steward and joins your rules only once a person indexes it. Atlas\'s closed templates judge the entry: use exactly the template keys, with no owner, status, session or provenance field. The host binds owner and storage. The tool reconciles before writing, so an identical resubmission writes nothing new; after an uncertain outcome resubmit the identical entry, never a variant. Outcomes: admitted (with its record ref), proposed (a project rule, with its proposal id), refused (the Atlas refusal verbatim; not remembered), unavailable or uncertain (not confirmed as remembered). A memory outcome never changes the outcome of your work.'

type Services = {
  readonly agents: AgentV2.Interface
  readonly seats: MaestroSeats.Interface
  readonly permission: PermissionV2.Interface
  readonly git: GitCli.Interface
  readonly location: Location.Interface
}

export function tools(services: Services) {
  return {
    [names.recall]: Tool.make({
      description: recallDescription,
      input: RecallInput,
      output: Output,
      toModelOutput: ({ output }) => [{ type: "text", text: output.output }],
      execute: (input, context) =>
        Effect.gen(function* () {
          const bound = yield* bind(services, names.recall, context)
          if ("refused" in bound) return unavailable(bound.refused)
          const receipt = (fields: Pick<Receipt, "outcome" | "store" | "refs">): Receipt => ({
            schema: "atlas-memory-receipt-v1",
            op: "recall",
            binding: bound.binding,
            ...fields,
          })
          if ("unavailable" in bound.memory)
            return {
              title: "Atlas memory unavailable",
              output: JSON.stringify({ store: "unavailable", reason: bound.memory.unavailable }),
              [RECEIPT_KEY]: receipt({ outcome: "unavailable" }),
            }
          const recall = bound.memory.recall(input)
          const records = recall.records.map((record, index) => ({
            ref: recall.refs[index],
            kind: record.kind,
            entry: record.entry,
          }))
          return {
            title: `${input.kind === "task" ? input.taskId : input.prId}: ${recall.store === "unavailable" ? "unavailable" : `${records.length} record(s)`}`,
            output: JSON.stringify(
              recall.store === "unavailable"
                ? { store: "unavailable", note: "The Memory store could not be read. This is not an empty result." }
                : {
                    store: recall.store,
                    records,
                    ...(recall.store === "partial" && {
                      note: "Some Memory lines could not be read, so this list may be incomplete.",
                    }),
                  },
            ),
            [RECEIPT_KEY]: receipt({ outcome: "read", store: recall.store, refs: recall.refs }),
          }
        }),
    }),
    [names.emit]: Tool.make({
      description: emitDescription,
      input: EmitInput,
      output: Output,
      toModelOutput: ({ output }) => [{ type: "text", text: output.output }],
      execute: (input, context) =>
        Effect.gen(function* () {
          const bound = yield* bind(services, names.emit, context)
          if ("refused" in bound) return unavailable(bound.refused)
          const memory = bound.memory
          const verdict: Verdict =
            "unavailable" in memory
              ? { outcome: "unavailable", reason: memory.unavailable }
              : yield* emit(memory, input.entry)
          return {
            title: `memory ${verdict.outcome}${verdict.refusal ? `: ${verdict.refusal.refusal}` : ""}`,
            output: JSON.stringify({ ...verdict, note: note(verdict) }),
            [RECEIPT_KEY]: {
              schema: "atlas-memory-receipt-v1",
              op: "emit",
              outcome: verdict.outcome,
              binding: bound.binding,
              ...(verdict.ref && { ref: verdict.ref }),
              ...(verdict.proposalId && { proposalId: verdict.proposalId }),
              ...(verdict.reconciled && { reconciled: verdict.reconciled }),
              ...(verdict.refusal && { refusal: verdict.refusal }),
              ...(verdict.store && { store: verdict.store }),
            } satisfies Receipt,
          }
        }),
    }),
  }
}

type Verdict = Omit<Receipt, "schema" | "op" | "binding" | "outcome"> & {
  readonly outcome: Outcome
  readonly reason?: string
}

// Reconcile first, so an identical resubmission writes nothing new. A throw may follow an append, so it is neither
// admitted nor refused: `uncertain`.
function emit(memory: NativeMemory, raw: Record<string, unknown>) {
  // Atlas validates the raw entry against its closed templates; the cast only names the door's type.
  const entry = raw as unknown as BoundEntry
  return Effect.try({
    try: (): Verdict => {
      const reconciled = memory.reconcile(entry)
      if (reconciled.present) return { outcome: "admitted", ref: reconciled.ref, reconciled: true }
      if (reconciled.store === "unavailable") return { outcome: "unavailable", store: "unavailable" }
      // A project rule is proposed for the steward; the member never writes it itself.
      if (Object.hasOwn(raw, "rule")) {
        const proposed = proposeProjectRule(memory.binding, raw, new Date().toISOString())
        if (!proposed.ok) return { outcome: "refused", refusal: proposed }
        return {
          outcome: "proposed",
          proposalId: proposed.proposalId,
          ...(proposed.reconciled && { reconciled: true as const }),
        }
      }
      const written = memory.write(entry)
      if (written.ok) return { outcome: "admitted", ref: written.ref }
      return { outcome: "refused", refusal: written }
    },
    catch: (cause) => cause,
  }).pipe(Effect.catch((cause) => Effect.succeed<Verdict>({ outcome: "uncertain", reason: firstLine(cause) })))
}

function note(verdict: Verdict) {
  if (verdict.outcome === "admitted")
    return verdict.reconciled ? "Already recorded; nothing new was written." : "Remembered."
  if (verdict.outcome === "proposed")
    return verdict.reconciled
      ? "Already proposed; nothing new was written. It joins your rules only once a person indexes it."
      : "Proposed for the steward; it joins your rules only once a person indexes it."
  if (verdict.outcome === "refused") return "Not remembered."
  return "Not confirmed as remembered."
}

// Missing identity cannot produce an owner-bound receipt.
function unavailable(reason: string) {
  return { title: "Atlas memory unavailable", output: JSON.stringify({ outcome: "unavailable", reason }) }
}

/**
 * One binding per call, to the execution worktree (the root the running header reads) and to this tool call. Storage
 * and owner come only from the host; an unreadable HEAD or a binding Atlas rejects is `unavailable`, never thrown into
 * the turn. An unavailable Memory still gets the real call's placement and resolved owner.
 */
const bind = Effect.fn("MaestroAtlasMemoryTools.bind")(function* (
  services: Services,
  action: string,
  context: Tool.Context,
) {
  if (!context.agent || !context.toolCallID || !context.assistantMessageID)
    return { refused: "the tool call carries incomplete execution identity" }
  const agent = yield* services.agents.get(context.agent)
  const member = MaestroAtlasSourceV2.owner(context.agent, services.seats)
  if (!member || agent?.id !== context.agent)
    return { refused: "the executing member is not a supported native Atlas owner" }
  yield* services.permission
    .assert({
      action,
      resources: [member],
      save: [member],
      sessionID: context.sessionID,
      agent: context.agent,
      source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
    })
    .pipe(Effect.mapError((error) => new Tool.Failure({ message: "Atlas memory was not permitted", error })))
  return yield* open(services, member, {
    sessionID: context.sessionID,
    callID: context.toolCallID,
    assistantMessageID: context.assistantMessageID,
  })
})

/**
 * The member's Memory bound to the execution worktree and one call of `execution.sessionID`. The tools bind their own
 * call; a resume admission binds the child Session to the dispatching Task call, as V1's `AtlasResume.admit` does.
 */
export const open = Effect.fn("MaestroAtlasMemoryTools.open")(function* (
  services: Pick<Services, "git" | "location">,
  member: MaestroAtlasSourceV2.Owner,
  execution: { readonly sessionID: string; readonly callID: string; readonly assistantMessageID: string },
) {
  const storage = {
    projectID: services.location.project.id,
    root: services.location.vcs?.type === "git" ? services.location.project.directory : services.location.directory,
  }
  const binding = { ...storage, memoryOwner: member, ...execution }
  const head = yield* services.git.run(["rev-parse", "HEAD"], { cwd: storage.root })
  const revision = head.text().trim()
  if (head.exitCode !== 0 || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision))
    return { binding, memory: { unavailable: `the worktree '${storage.root}' has no readable HEAD revision` } }
  // Atlas scans writes with the toolkit's pinned gitleaks, fetched on first use. When the toolkit cannot supply it,
  // Atlas looks for a scanner on PATH and, without one, refuses every write `scanner-unavailable`.
  const scanner = yield* BackendToolkit.ensure("gitleaks").pipe(
    Effect.map((ready) => ({ name: "gitleaks" as const, command: ready.executable })),
    Effect.orElseSucceed(() => undefined),
  )
  // The legacy backend owner id derives from the roster, which loads lazily like the seats it describes.
  const legacy =
    member === "backend"
      ? yield* Effect.tryPromise(() => import("../../roster")).pipe(
          Effect.map((roster) => [roster.LEGACY_BACKEND_ID]),
          Effect.orElseSucceed((): string[] => []),
        )
      : []
  const create = yield* Open
  const memory = yield* Effect.try({
    try: (): NativeMemory | { readonly unavailable: string } =>
      create({
        storage,
        source: { worktree: storage.root, revision },
        memoryOwner: member,
        legacyOwners: legacy,
        execution: {
          actor: { memberId: member, projectId: storage.projectID, sessionId: execution.sessionID },
          executionSessionID: execution.sessionID,
          invocation: { callID: execution.callID, assistantMessageID: execution.assistantMessageID },
        },
        ...(scanner && { scanner }),
      }),
    catch: (cause) => cause,
  }).pipe(Effect.catch((cause) => Effect.succeed({ unavailable: firstLine(cause) })))
  return { binding, memory }
})

function firstLine(cause: unknown) {
  return (cause instanceof Error ? cause.message : String(cause)).split("\n")[0]!.slice(0, 160)
}
