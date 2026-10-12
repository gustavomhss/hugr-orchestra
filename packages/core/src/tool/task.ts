export * as TaskTool from "./task"

import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { ToolFailure } from "@orchestra/llm"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { AgentV2 } from "../agent"
import { Catalog } from "../catalog"
import { Database } from "../database/database"
import { makeLocationNode, Node } from "../effect/app-node"
import { LayerNode } from "../effect/layer-node"
import { EventV2 } from "../event"
import { Location } from "../location"
import { ModelV2 } from "../model"
import { PermissionV2 } from "../permission"
import { SessionV2 } from "../session"
import { SessionEvent } from "../session/event"
import { SessionExecution } from "../session/execution"
import { SessionInput } from "../session/input"
import { SessionMessage } from "../session/message"
import { SessionRunnerModel } from "../session/runner/model"
import { SessionSchema } from "../session/schema"
import { SessionStore } from "../session/store"
import { SessionSubagentModels } from "../session/subagent-models"
import { ToolRegistry } from "./registry"
import { ToolText } from "./text"
import { Tool } from "./tool"
import { Tools } from "./tools"

export const name = "task"
const MAX_DEPTH = 8

export const Input = Schema.Struct({
  description: Schema.String.annotate({ description: "A short description of the delegated task" }),
  prompt: Schema.String.annotate({ description: "The complete instructions for the subagent" }),
  subagent_type: Schema.String.annotate({ description: "The stable ID of a visible subagent or all-mode agent" }),
  model: Schema.String.pipe(Schema.optional).annotate({ description: "Optional exact provider/model identity" }),
  task_id: SessionSchema.ID.pipe(Schema.optional).annotate({ description: "An existing child Session to resume" }),
})

export const Output = Schema.Struct({
  sessionID: SessionSchema.ID,
  agent: AgentV2.ID,
  model: ModelV2.Ref.pipe(Schema.optional),
  text: Schema.String,
  title: Schema.String.pipe(Schema.optional),
  sessionId: SessionSchema.ID,
  parentSessionId: SessionSchema.ID,
  agentId: AgentV2.ID,
})

export const description = ToolText.task

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const location = yield* Location.Service
    const agents = yield* AgentV2.Service
    const catalog = yield* Catalog.Service
    const database = yield* Database.Service
    const permission = yield* PermissionV2.Service
    const sessions = yield* SessionV2.Service
    const store = yield* SessionStore.Service
    const execution = yield* SessionExecution.Service
    const events = yield* EventV2.Service
    const policy = yield* SessionSubagentModels.Service
    yield* tools.register({
      [name]: Tool.make({
        description,
        input: Input,
        output: Output,
        toModelOutput: ({ output }) => [
          { type: "text", text: `task_id: ${output.sessionID}\n\n<task_result>\n${output.text}\n</task_result>` },
        ],
        execute: (input, context) => Effect.gen(function* () {
          yield* requireParent(store, location, context, input)
          const target = yield* requireTarget(agents, input.subagent_type)
          const childID = input.task_id ?? SessionSchema.ID.make(`ses_${identity("task-child", context)}`)
          const existing = yield* store.get(childID)
          if (input.task_id && !existing)
            return yield* new ToolFailure({ message: `Task child not found: ${childID}` })
          const model = yield* resolveModel(catalog, policy, context, target, input.model, existing)
          const revalidateTarget = Effect.fnUntraced(function* (child: SessionSchema.Info | undefined) {
            const current = yield* requireTarget(agents, input.subagent_type)
            const selected = yield* resolveModel(catalog, policy, context, current, input.model, child)
            if (!sameModel(selected, model))
              return yield* new ToolFailure({ message: `Task target model changed after authorization: ${target.id}` })
          })
          if (existing) {
            const failure = requireChild(existing, location, context, target.id, model)
            if (failure) return yield* failure
          }
          yield* policy.assertChild(context.sessionID, model)
          yield* permission.assert({
            action: name,
            resources: [target.id, `${model.providerID}/${model.id}`],
            sessionID: context.sessionID,
            agent: context.agent,
            source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
          })
          // Approval may wait while placement, ancestry, or the hard ceiling changes.
          yield* requireParent(store, location, context, input)
          yield* revalidateTarget(existing)
          yield* policy.assertChild(context.sessionID, model)
          const child = yield* sessions.create({
            id: childID,
            parentID: context.sessionID,
            agent: target.id,
            model,
            location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }),
          })
          const failure = requireChild(child, location, context, target.id, model)
          if (failure) return yield* failure
          return yield* Effect.gen(function* () {
            yield* policy.assert(child.id, model)
            yield* events.publish(SessionEvent.Tool.Progress, {
              sessionID: context.sessionID,
              assistantMessageID: context.assistantMessageID,
              callID: context.toolCallID,
              timestamp: yield* DateTime.now,
              structured: {
                sessionId: child.id,
                parentSessionId: context.sessionID,
                agentId: target.id,
                title: input.description,
              },
              content: [],
            })
            const promptID = SessionMessage.ID.make(`msg_${identity("task-prompt", context, child.id)}`)
            // Exact retries retain the delivery admitted by an earlier Task version.
            const recordedInput = yield* SessionInput.find(database.db, promptID)
            const admitted = yield* sessions.prompt({
              id: promptID,
              sessionID: child.id,
              prompt: { text: input.prompt },
              delivery: recordedInput?.delivery ?? "queue",
              resume: false,
            })
            const previous =
              admitted.promotedSeq === undefined
                ? undefined
                : completedReply(yield* sessions.messages({ sessionID: child.id, order: "asc" }), promptID)
            yield* policy.assert(child.id, model)
            yield* revalidateTarget(child)
            yield* Effect.uninterruptibleMask((restore) => Effect.gen(function* () {
              if (previous !== undefined) return
              // This snapshot gates post-crash eligibility only; the coordinator decides cancellation ownership.
              const active = (yield* execution.active).has(child.id)
              if (!active && admitted.promotedSeq !== undefined && !input.task_id)
                return yield* new ToolFailure({
                  message: `Task ${child.id} has unfinished promoted work; resume explicitly with task_id`,
                })
              yield* restore(execution.resume(child.id, { interruptOnCancel: true }))
            }))
            const reply =
              previous ?? completedReply(yield* sessions.messages({ sessionID: child.id, order: "asc" }), promptID)
            if (reply === undefined)
              return yield* new ToolFailure({ message: `Task ${child.id} finished without a completed assistant reply` })
            if (reply.agent !== target.id)
              return yield* new ToolFailure({ message: `Task ${child.id} reply agent differs from the recorded child` })
            return {
              sessionID: child.id,
              agent: target.id,
              model: child.model,
              text: reply.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n"),
              title: child.title,
              sessionId: child.id,
              parentSessionId: context.sessionID,
              agentId: target.id,
            }
          }).pipe(
            Effect.mapError((error) =>
              new ToolFailure({ message: `Task ${child.id} failed: ${error.message}`, error }),
            ),
          )
        }).pipe(
          Effect.mapError((error) =>
            error instanceof ToolFailure ? error : new ToolFailure({ message: error.message, error }),
          ),
        ),
      }),
    }).pipe(Effect.orDie)
  }),
)

// Locations acquire the existing process-owned Session and execution services. Rebuilding
// Session.node here would recursively compile the Location map during its own acquisition.
export const node: LayerNode.Node<never, never, typeof Node.tags.values.location> = makeLocationNode({
  name: "tool/task",
  layer,
  deps: [
    ToolRegistry.node,
    Location.node,
    AgentV2.node,
    Catalog.node,
    Database.node,
    PermissionV2.node,
    captureGlobal(SessionV2.Service),
    SessionStore.node,
    captureGlobal(SessionExecution.Service),
    EventV2.node,
    SessionSubagentModels.node,
  ],
})

function captureGlobal<I, A extends object>(service: Context.Key<I, A>) {
  return Node.makeGlobalNode({
    // Constructor replacements must not turn this capture back into a fresh global service graph.
    name: `tool/task/global/${service.key}`,
    layer: Layer.effect(
      service,
      Effect.serviceOption(service).pipe(
        Effect.flatMap((current) =>
          Option.isSome(current)
            ? Effect.succeed(current.value)
            : Effect.die(`Task requires an exported process-global service: ${service.key}`),
        ),
      ),
    ),
    deps: [],
  })
}

const resolveModel = Effect.fn("TaskTool.resolveModel")(function* (
  catalog: Catalog.Interface,
  policy: SessionSubagentModels.Interface,
  context: Tool.Context,
  target: AgentV2.Info,
  explicit: string | undefined,
  child: SessionSchema.Info | undefined,
) {
  if (explicit !== undefined && (explicit.indexOf("/") <= 0 || explicit.endsWith("/")))
    return yield* new ToolFailure({ message: `Invalid task model identity: ${explicit}` })
  const parsed = explicit === undefined ? undefined : ModelV2.parse(explicit)
  const named = parsed ? { providerID: parsed.providerID, id: parsed.modelID } : target.model
  const available = (yield* catalog.model.available()).filter(SessionRunnerModel.supported)
  const ceilings = yield* policy.forChild(context.sessionID)
  const candidate = child?.model ?? named
  if (child && !child.model)
    return yield* new ToolFailure({ message: `Task child has no recorded model: ${child.id}` })
  if (child && named && !sameModel(child.model, named))
    return yield* new ToolFailure({ message: `Task cannot change the recorded child model: ${child.id}` })
  if (candidate) {
    yield* policy.assertChild(context.sessionID, candidate)
    const selected = available.find((model) => model.providerID === candidate.providerID && model.id === candidate.id)
    if (!selected || !hasVariant(selected, candidate))
      return yield* new ToolFailure({ message: `Task model unavailable: ${candidate.providerID}/${candidate.id}` })
    return candidate
  }
  const inherited = context.model
  if (
    inherited &&
    available.some((model) =>
      model.providerID === inherited.providerID && model.id === inherited.id &&
      hasVariant(model, inherited) && SessionSubagentModels.permits(ceilings, inherited),
    )
  ) return inherited
  const preferred = yield* catalog.model.default()
  const allowed = available.filter((model) => SessionSubagentModels.permits(ceilings, model))
  const selected =
    allowed.find((model) => model.providerID === preferred?.providerID && model.id === preferred.id) ?? allowed[0]
  if (!selected) return yield* new ToolFailure({ message: "No supported task model is allowed and available" })
  return { providerID: selected.providerID, id: selected.id }
})

function hasVariant(model: ModelV2.Info, ref: ModelV2.Ref) {
  return (
    ref.variant === undefined || ref.variant === "default" || model.variants.some((variant) => variant.id === ref.variant)
  )
}

// Length-delimited JSON avoids collisions between arbitrary provider call IDs.
const identity = (domain: string, context: Tool.Context, childID?: SessionSchema.ID) =>
  createHash("sha256")
    .update(JSON.stringify([domain, context.sessionID, context.assistantMessageID, context.toolCallID, childID]))
    .digest("hex")

const sameModel = (left: ModelV2.Ref | undefined, right: ModelV2.Ref | undefined) =>
  left?.providerID === right?.providerID &&
  left?.id === right?.id &&
  (left?.variant ?? "default") === (right?.variant ?? "default")

const samePlacement = (session: SessionSchema.Info, location: Location.Interface) =>
  session.location.directory === location.directory && session.location.workspaceID === location.workspaceID

const requireParent = Effect.fn("TaskTool.requireParent")(function* (
  store: SessionStore.Interface,
  location: Location.Interface,
  context: Tool.Context,
  input: typeof Input.Type,
) {
  const parent = yield* store.get(context.sessionID)
  if (!parent) return yield* new ToolFailure({ message: `Task parent not found: ${context.sessionID}` })
  if (!samePlacement(parent, location))
    return yield* new ToolFailure({ message: `Task parent placement mismatch: ${parent.id}` })
  const recorded = yield* store.message(context.assistantMessageID)
  if (
    recorded?.sessionID !== parent.id ||
    recorded.message.type !== "assistant" ||
    recorded.message.agent !== context.agent ||
    !recorded.message.content.some((part) => part.type === "tool" && part.id === context.toolCallID && part.name === name)
  )
    return yield* new ToolFailure({ message: "Task invocation does not match its recorded assistant and turn owner" })
  const call = recorded.message.content.find(
    (part): part is SessionMessage.AssistantTool => part.type === "tool" && part.id === context.toolCallID && part.name === name,
  )
  const called = call && call.state.status !== "pending" ? Schema.decodeUnknownOption(Input)(call.state.input) : Option.none()
  if (Option.isNone(called))
    return yield* new ToolFailure({ message: "Task invocation has no valid recorded called input" })
  const childID = SessionSchema.ID.make(`ses_${identity("task-child", context)}`)
  if (!isDeepStrictEqual(
    { ...called.value, task_id: called.value.task_id ?? childID },
    { ...input, task_id: input.task_id ?? childID },
  )) return yield* new ToolFailure({ message: "Task executor input conflicts with its recorded called input" })
  yield* requireDepth(store, parent)
  return parent
})

const requireTarget = Effect.fn("TaskTool.requireTarget")(function* (agents: AgentV2.Interface, id: string) {
  const target = yield* agents.get(AgentV2.ID.make(id))
  if (!target || target.hidden || target.mode === "primary" || target.id === AgentV2.defaultID)
    return yield* new ToolFailure({ message: `Task target is not a visible subagent: ${id}` })
  if (target.engine === "claude-code")
    return yield* new ToolFailure({ message: `Task target requires an unsupported engine: ${target.id}` })
  return target
})

const requireDepth = Effect.fn("TaskTool.requireDepth")(function* (
  store: SessionStore.Interface,
  session: SessionSchema.Info,
  seen: ReadonlySet<SessionSchema.ID> = new Set(),
): Effect.fn.Return<void, ToolFailure> {
  if (seen.has(session.id)) return yield* new ToolFailure({ message: "Task ancestry contains a cycle" })
  if (seen.size >= MAX_DEPTH) return yield* new ToolFailure({ message: `Task delegation depth exceeds ${MAX_DEPTH}` })
  if (!session.parentID) return
  const parent = yield* store.get(session.parentID)
  if (!parent) return yield* new ToolFailure({ message: `Task ancestor not found: ${session.parentID}` })
  yield* requireDepth(store, parent, new Set([...seen, session.id]))
})

function requireChild(
  child: SessionSchema.Info,
  location: Location.Interface,
  context: Tool.Context,
  agent: AgentV2.ID,
  model: ModelV2.Ref,
) {
  if (child.parentID !== context.sessionID || child.agent !== agent || !samePlacement(child, location))
    return new ToolFailure({ message: `Task child parent, agent, or placement mismatch: ${child.id}` })
  if (!sameModel(child.model, model))
    return new ToolFailure({ message: `Task cannot change the recorded child model: ${child.id}` })
}

function completedReply(messages: ReadonlyArray<SessionMessage.Message>, promptID: SessionMessage.ID) {
  const index = messages.findIndex((message) => message.id === promptID && message.type === "user")
  if (index < 0) return
  const following = messages.slice(index + 1)
  const boundary = following.findIndex((message) => message.type === "user")
  const reply = (boundary < 0 ? following : following.slice(0, boundary)).findLast(
    (message): message is SessionMessage.Assistant => message.type === "assistant",
  )
  if (
    !reply?.time.completed ||
    !reply.finish ||
    ["tool-calls", "unknown", "error", "content-filter"].includes(reply.finish) ||
    reply.error ||
    reply.content.some((part) => part.type === "tool" && !part.provider?.executed)
  )
    return
  return reply
}
