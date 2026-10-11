import type { BoundEntry } from "@orchestra/atlas-boundary/native-memory"
import { Context, Effect, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { InstanceRef } from "@/effect/instance-ref"
import { Git } from "@/git"
import { AtlasMemory } from "@/maestro/atlas-memory"
import { ToolJsonSchema } from "./json-schema"
import { Tool } from "./tool"

// Native Atlas Memory tools. The host binds owner, storage and the call;
// the model supplies a unit or an entry and nothing else. Atlas storage is harness-owned (F3-D7): neither tool is a file
// write, so the task's ToolSafety write roots never hold it.

// The Memory each call binds: always AtlasMemory.open in production. A test may wrap it to pin the scanner binary, since
// Bun resolves a child-process command against the PATH the process started with.
export const Open = Context.Reference<typeof AtlasMemory.open>("@orchestra/AtlasMemoryTool/Open", {
  defaultValue: () => AtlasMemory.open,
})

const Id = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256))
const closed = { parseOptions: { onExcessProperty: "error" } } as const
const RecallParameters = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("task"), taskId: Id }).annotate(closed),
  Schema.Struct({ kind: Schema.Literal("pr"), prId: Id }).annotate(closed),
])
// The entry stays raw: Atlas's closed templates are its only judge, so the host adds no schema of its own.
const EmitParameters = Schema.Struct({ entry: Schema.Record(Schema.String, Schema.Unknown) }).annotate(closed)
const recallSchema = ToolJsonSchema.fromSchema(RecallParameters)

export const AtlasMemoryRecallTool = Tool.define(
  "atlas_memory_recall",
  Effect.gen(function* () {
    // Captured here: execute runs in the parent tool context.
    const git = yield* Git.Service
    const agents = yield* Agent.Service
    return {
      parameters: RecallParameters,
      jsonSchema: {
        ...recallSchema,
        anyOf: recallSchema.anyOf?.map((mode) =>
          typeof mode === "boolean" ? mode : { ...mode, additionalProperties: false },
        ),
      },
      description:
        'Recall your own Atlas Memory records for one task or PR: {"kind":"task","taskId":...} or {"kind":"pr","prId":...}. Only your own task and PR records are reachable; records of other memory owners, project rules and the logbook are not. The result names the store state: complete (an empty list means nothing is recorded), partial (some lines could not be read, so the list may be incomplete) or unavailable (nothing could be read; never an empty result).',
      execute: (input: Schema.Schema.Type<typeof RecallParameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const caller = yield* nativeCaller(ctx, agents)
          if (!caller.ok) return unavailable(caller.reason)
          yield* ctx.ask({
            permission: "atlas_memory_recall",
            patterns: [caller.member],
            always: [caller.member],
            metadata: {},
          })
          const bound = yield* bind(ctx, caller).pipe(Effect.provideService(Git.Service, git))
          const receipt = (fields: Pick<AtlasMemory.Receipt, "outcome" | "store" | "refs">): AtlasMemory.Receipt => ({
            schema: "atlas-memory-receipt-v1",
            op: "recall",
            binding: bound.binding,
            ...fields,
          })
          if ("unavailable" in bound.memory)
            return {
              title: "Atlas memory unavailable",
              output: JSON.stringify({ store: "unavailable", reason: bound.memory.unavailable }),
              metadata: { [AtlasMemory.RECEIPT_KEY]: receipt({ outcome: "unavailable" }) },
            }
          const recall = bound.memory.recall(input)
          const records = recall.records.map((record, index) => ({ ref: recall.refs[index], kind: record.kind, entry: record.entry }))
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
            metadata: {
              [AtlasMemory.RECEIPT_KEY]: receipt({ outcome: "read", store: recall.store, refs: recall.refs }),
            },
          }
        }),
    }
  }),
)

export const AtlasMemoryEmitTool = Tool.define(
  "atlas_memory_emit",
  Effect.gen(function* () {
    const git = yield* Git.Service
    const agents = yield* Agent.Service
    return {
      parameters: EmitParameters,
      jsonSchema: { ...ToolJsonSchema.fromSchema(EmitParameters), additionalProperties: false },
      description:
        'Record one Atlas Memory entry as your own: {"entry": ...}, a task entry {taskId, attempted[], failedWith[], stoppedAt, lesson, ref?}, a PR entry {prId, decisions[], reviewOutcomes[], knowledgeDelta[], ref?} or a project rule {rule, scope, grounding?} (never set frecency). Atlas\'s closed templates judge the entry: use exactly the template keys, with no owner, status, session or provenance field. The host binds owner and storage. The tool reconciles before writing, so an identical resubmission writes nothing new; after an uncertain outcome resubmit the identical entry, never a variant. Outcomes: admitted (with its record ref), refused (the Atlas refusal verbatim; not remembered), unavailable or uncertain (not confirmed as remembered). A memory outcome never changes the outcome of your work.',
      execute: (input: Schema.Schema.Type<typeof EmitParameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const caller = yield* nativeCaller(ctx, agents)
          if (!caller.ok) return unavailable(caller.reason)
          yield* ctx.ask({
            permission: "atlas_memory_emit",
            patterns: [caller.member],
            always: [caller.member],
            metadata: {},
          })
          const bound = yield* bind(ctx, caller).pipe(Effect.provideService(Git.Service, git))
          const memory = bound.memory
          const verdict: Omit<AtlasMemory.Receipt, "schema" | "op" | "binding"> & { reason?: string } =
            "unavailable" in memory
              ? { outcome: "unavailable", reason: memory.unavailable }
              : yield* Effect.try({
                  try: (): Omit<AtlasMemory.Receipt, "schema" | "op" | "binding"> => {
                    // Atlas validates the raw entry against its closed templates; the cast only names the door's type.
                    const entry = input.entry as unknown as BoundEntry
                    const reconciled = memory.reconcile(entry)
                    if (reconciled.present) return { outcome: "admitted", ref: reconciled.ref, reconciled: true }
                    if (reconciled.store === "unavailable") return { outcome: "unavailable", store: "unavailable" }
                    const written = memory.write(entry)
                    if (written.ok) return { outcome: "admitted", ref: written.ref }
                    return { outcome: "refused", refusal: written }
                  },
                  catch: (cause) => cause,
                }).pipe(
                  // A throw may follow an append, so the write is neither admitted nor refused.
                  Effect.catch((cause) =>
                    Effect.succeed({
                      outcome: "uncertain" as const,
                      reason: (cause instanceof Error ? cause.message : String(cause)).split("\n")[0]!.slice(0, 160),
                    }),
                  ),
                )
          const receipt: AtlasMemory.Receipt = {
            schema: "atlas-memory-receipt-v1",
            op: "emit",
            outcome: verdict.outcome,
            binding: bound.binding,
            ...(verdict.ref && { ref: verdict.ref }),
            ...(verdict.reconciled && { reconciled: verdict.reconciled }),
            ...(verdict.refusal && { refusal: verdict.refusal }),
            ...(verdict.store && { store: verdict.store }),
          }
          return {
            title: `memory ${verdict.outcome}${verdict.refusal ? `: ${verdict.refusal.refusal}` : ""}`,
            output: JSON.stringify({
              ...verdict,
              note:
                verdict.outcome === "admitted"
                  ? verdict.reconciled
                    ? "Already recorded; nothing new was written."
                    : "Remembered."
                  : verdict.outcome === "refused"
                    ? "Not remembered."
                    : "Not confirmed as remembered.",
            }),
            metadata: { [AtlasMemory.RECEIPT_KEY]: receipt },
          }
        }),
    }
  }),
)

const nativeCaller = Effect.fn("AtlasMemoryTool.nativeCaller")(function* (ctx: Tool.Context, agents: Agent.Interface) {
  if (!ctx.agentID) return { ok: false as const, reason: "the tool call carries no executing member identity" }
  const agent = yield* agents.get(ctx.agentID)
  const member = AtlasMemory.owner(agent)
  if (!member || agent.id !== ctx.agentID)
    return { ok: false as const, reason: "the executing member is not a supported native Atlas owner" }
  return { ok: true as const, agent, member }
})

function unavailable(reason: string): Tool.ExecuteResult<{ atlasMemory?: AtlasMemory.Receipt }> {
  // Missing identity cannot produce an owner-bound receipt.
  return { title: "Atlas memory unavailable", output: JSON.stringify({ outcome: "unavailable", reason }), metadata: {} }
}

// One binding per call. An unavailable Memory still gets the real call's placement and resolved owner.
const bind = Effect.fn("AtlasMemoryTool.bind")(function* (
  ctx: Tool.Context,
  caller: { agent: Agent.Info; member: AtlasMemory.Owner },
) {
  const execution = { sessionID: ctx.sessionID, callID: ctx.callID ?? "", assistantMessageID: ctx.messageID }
  const open = yield* Open
  const memory = ctx.callID
    ? yield* open(execution, caller.agent)
    : { unavailable: "the tool call carries no call identity" }
  const instance = yield* InstanceRef
  const storage =
    "unavailable" in memory
      ? {
          projectID: instance?.project.id ?? "",
          root: instance ? (instance.worktree === "/" ? instance.directory : instance.worktree) : "",
        }
      : memory.binding.storage
  const binding: AtlasMemory.Receipt["binding"] = {
    projectID: storage.projectID,
    root: storage.root,
    memoryOwner: caller.member,
    ...execution,
  }
  return { memory, binding }
})
