export * as TaskTool from "./task"

import { createHash } from "node:crypto"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { ToolFailure } from "@orchestra/llm"
import { Context, DateTime, Effect, Fiber, Layer, Option, Schema } from "effect"
import { AgentV2 } from "../agent"
import { Catalog } from "../catalog"
import { Config } from "../config"
import { Database } from "../database/database"
import { FSUtil } from "../fs-util"
import { makeLocationNode, Node } from "../effect/app-node"
import { LayerNode } from "../effect/layer-node"
import { EventV2 } from "../event"
import { Location } from "../location"
import { ModelV2 } from "../model"
import { PermissionV2 } from "../permission"
import { Project } from "../project"
import { ProviderV2 } from "../provider"
import { ProjectCopy } from "../project/copy"
import { AbsolutePath } from "../schema"
import { SessionV2 } from "../session"
import { SessionEvent } from "../session/event"
import { SessionExecution } from "../session/execution"
import { SessionInput } from "../session/input"
import { SessionMessage } from "../session/message"
import { ExecutionHost } from "../session/runner/execution-host"
import { SessionRunnerModel } from "../session/runner/model"
import { SessionSchema } from "../session/schema"
import { SessionStore } from "../session/store"
import { SessionSubagentModels } from "../session/subagent-models"
import { ToolRegistry } from "./registry"
import { TaskBackground } from "./task-background"
import { TaskGovernance } from "./task-governance"
import { ToolText } from "./text"
import { Tool } from "./tool"
import { Tools } from "./tools"
import { inheritedPermissions, primaryTools } from "./task-permission"

export const name = "task"
const MAX_DEPTH = 8

export const Input = Schema.Struct({
  description: Schema.String.annotate({ description: "A short description of the delegated task" }),
  prompt: Schema.String.annotate({ description: "The complete instructions for the subagent" }),
  subagent_type: Schema.String.annotate({ description: "The stable ID of a visible subagent or all-mode agent" }),
  model: Schema.String.pipe(Schema.optional).annotate({ description: "Optional exact provider/model identity" }),
  // A Location's TaskGovernance may resolve a logical task id; core resumes only a Session ID it owns.
  task_id: Schema.String.pipe(Schema.optional).annotate({ description: "An existing child Session or task to resume" }),
  directory: Schema.String.pipe(Schema.optional).annotate({
    description: "Absolute root of a git worktree of this repository for the child to work in; default this Session's directory",
  }),
  worktree: Schema.Boolean.pipe(Schema.optional).annotate({
    description: "Start the child in a new git worktree of this repository, named after description; the reply names its directory",
  }),
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
  /** The child's worktree when it is not this Session's directory. */
  directory: Schema.String.pipe(Schema.optional),
  /** Structured result a Location's TaskGovernance derived from the child's reply. */
  structured: Schema.Record(Schema.String, Schema.Unknown).pipe(Schema.optional),
})

export const description = ToolText.task

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const location = yield* Location.Service
    const fs = yield* FSUtil.Service
    const agents = yield* AgentV2.Service
    const catalog = yield* Catalog.Service
    const database = yield* Database.Service
    const permission = yield* PermissionV2.Service
    const sessions = yield* SessionV2.Service
    const store = yield* SessionStore.Service
    const execution = yield* SessionExecution.Service
    const events = yield* EventV2.Service
    const policy = yield* SessionSubagentModels.Service
    const governance = yield* TaskGovernance.Service
    const config = yield* Config.Service
    const background = yield* TaskBackground.Service
    const projects = yield* Project.Service
    const copies = yield* ProjectCopy.Service
    const engineOf = ExecutionHost.engineOf(agents, store)
    // Governance fields are recorded with the call, so the recorded input decodes with this same schema.
    const taskInput = Schema.Struct({ ...Input.fields, ...governance.input })
    const decodeCalled = Schema.decodeUnknownOption(taskInput)
    yield* tools.register({
      [name]: Tool.make({
        description,
        input: taskInput,
        output: Output,
        toModelOutput: ({ output }) => [
          {
            type: "text",
            text: `task_id: ${output.sessionID}${output.directory ? `\ndirectory: ${output.directory}` : ""}\n\n<task_result>\n${output.text}\n</task_result>`,
          },
        ],
        execute: (called, context) => Effect.gen(function* () {
          const input = yield* Schema.decodeUnknownEffect(Input)(called).pipe(
            Effect.mapError((error) => new ToolFailure({ message: `Invalid tool input: ${error.message}` })),
          )
          const parent = yield* requireParent(store, location, context, decodeCalled, called)
          const target = yield* requireTarget(agents, input.subagent_type)
          const directory = input.worktree ? yield* createWorktree(copies, fs, store, location, input, taskChildID(context)) : input.directory
          const placement = yield* requirePlacement(projects, fs, location, directory)
          const admission = yield* governance.admit({ parent, target, input: called, context, location: placement })
          const childID =
            admission.childID ??
            (input.task_id && Schema.is(SessionSchema.ID)(input.task_id) ? input.task_id : undefined) ??
            taskChildID(context)
          const existing = yield* store.get(childID)
          if (input.task_id && !existing)
            return yield* new ToolFailure({ message: `Task child not found: ${input.task_id}` })
          // As the runner decides: a seat that names no engine runs a Claude model on its lead's execution host.
          const hosted = target.engine ? target.engine !== "orchestra" : (yield* engineOf(parent)) !== undefined
          const model = yield* resolveModel(catalog, policy, context, target, input.model, existing, hosted)
          const revalidateTarget = Effect.fnUntraced(function* (child: SessionSchema.Info | undefined) {
            const current = yield* requireTarget(agents, input.subagent_type)
            const selected = yield* resolveModel(catalog, policy, context, current, input.model, child, hosted)
            if (!sameModel(selected, model))
              return yield* new ToolFailure({ message: `Task target model changed after authorization: ${target.id}` })
          })
          if (existing) {
            const failure = requireChild(existing, placement, context, target.id, model)
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
          yield* requireParent(store, location, context, decodeCalled, called)
          yield* policy.assertChild(context.sessionID, model)
          yield* revalidateTarget(existing)
          const child = yield* sessions.create({
            id: childID,
            parentID: context.sessionID,
            agent: target.id,
            model,
            location: Location.Ref.make({ directory: placement.directory, workspaceID: placement.workspaceID }),
          })
          const failure = requireChild(child, placement, context, target.id, model)
          if (failure) return yield* failure
          // A governance that binds rules starts from the inherited ones (see `TaskGovernance.Admission`).
          const permissions = (
            admission.permissions ??
            inheritedPermissions(yield* store.permissions(context.sessionID), primaryTools(yield* config.entries()))
          ).map((rule) => ({ action: rule.action, resource: rule.resource, effect: rule.effect }))
          // Compared first so an exact retry records no second permission change.
          if (!isDeepStrictEqual(permissions, yield* store.permissions(child.id)))
            yield* sessions.setPermission({
              sessionID: child.id,
              permission: permissions.map((rule) => ({ permission: rule.action, pattern: rule.resource, action: rule.effect })),
            })
          const moved = placement.directory === location.directory ? {} : { directory: placement.directory }
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
            const promptID = taskPromptID(context, child.id)
            // Exact retries retain the delivery admitted by an earlier Task version.
            const recordedInput = yield* SessionInput.find(database.db, promptID)
            const admitted = yield* sessions.prompt({
              id: promptID,
              sessionID: child.id,
              prompt: admission.prompt ?? { text: input.prompt },
              delivery: recordedInput?.delivery ?? "queue",
              resume: false,
            })
            const previous =
              admitted.promotedSeq === undefined
                ? undefined
                : completedReply(yield* sessions.messages({ sessionID: child.id, order: "asc" }), promptID)
            yield* policy.assert(child.id, model)
            yield* revalidateTarget(child)
            const handoff = (text: string) => ({
              sessionID: child.id,
              agent: target.id,
              model: child.model,
              text,
              title: child.title,
              sessionId: child.id,
              parentSessionId: context.sessionID,
              agentId: target.id,
              ...moved,
            })
            if (admission.background) {
              // Advisory: the admitted prompt is durable, so a lost wake leaves it for the next drain.
              yield* execution.wake(child.id)
              return handoff("Task started in the background")
            }
            const detached = yield* Effect.uninterruptibleMask((restore) => Effect.gen(function* () {
              if (previous !== undefined) return false
              // This snapshot gates post-crash eligibility only; the coordinator decides cancellation ownership.
              const active = (yield* execution.active).has(child.id)
              // The drain may have settled between the `previous` snapshot and this check; its reply is then final.
              if (!active && admitted.promotedSeq !== undefined && !input.task_id) {
                if (completedReply(yield* sessions.messages({ sessionID: child.id, order: "asc" }), promptID) !== undefined)
                  return false
                return yield* new ToolFailure({
                  message: `Task ${child.id} has unfinished promoted work; resume explicitly with task_id`,
                })
              }
              // The drain outlives a move to the background; cancelling the Task before that still stops it.
              // Starting immediately joins the drain that is active now: a deferred start could find it settled and
              // force a second provider turn for an exact retry.
              const drain = yield* Effect.forkDetach(execution.resume(child.id, { interruptOnCancel: true }), {
                startImmediately: true,
              })
              return yield* restore(
                Effect.raceFirst(
                  Fiber.join(drain).pipe(Effect.as(false)),
                  background.requested(context.sessionID).pipe(Effect.as(true)),
                ),
              ).pipe(Effect.onInterrupt(() => Fiber.interrupt(drain)))
            }))
            if (detached) return handoff("Task moved to the background")
            const reply =
              previous ?? completedReply(yield* sessions.messages({ sessionID: child.id, order: "asc" }), promptID)
            if (reply === undefined)
              return yield* new ToolFailure({ message: `Task ${child.id} finished without a completed assistant reply` })
            if (reply.agent !== target.id)
              return yield* new ToolFailure({ message: `Task ${child.id} reply agent differs from the recorded child` })
            const settled = yield* governance.settle({ child, reply, admission, context })
            return {
              sessionID: child.id,
              agent: target.id,
              model: child.model,
              text: settled.text,
              title: child.title,
              sessionId: child.id,
              parentSessionId: context.sessionID,
              agentId: target.id,
              ...moved,
              ...(settled.structured === undefined ? {} : { structured: settled.structured }),
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

// One capture node per service: two nodes of the same name conflict when global nodes are hoisted.
export const globalSessions = captureGlobal(SessionV2.Service)

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
    globalSessions,
    SessionStore.node,
    captureGlobal(SessionExecution.Service),
    EventV2.node,
    SessionSubagentModels.node,
    TaskGovernance.node,
    Config.node,
    TaskBackground.node,
    Project.node,
    FSUtil.node,
    ProjectCopy.node,
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
  hosted: boolean,
) {
  if (explicit !== undefined && (explicit.indexOf("/") <= 0 || explicit.endsWith("/")))
    return yield* new ToolFailure({ message: `Invalid task model identity: ${explicit}` })
  const parsed = explicit === undefined ? undefined : ModelV2.parse(explicit)
  const named = parsed ? { providerID: parsed.providerID, id: parsed.modelID } : target.model
  const listed = yield* catalog.model.available()
  // An execution host holds its own sign-in, so a hosted child's Anthropic models need no API connection.
  const anthropic = hosted ? yield* catalog.provider.get(ProviderV2.ID.anthropic) : undefined
  const signedIn = anthropic && !anthropic.disabled
    ? (yield* catalog.model.all()).filter(
        (model) =>
          model.providerID === ProviderV2.ID.anthropic &&
          model.enabled &&
          !listed.some((item) => item.providerID === model.providerID && item.id === model.id),
      )
    : []
  const available = [...listed, ...signedIn].filter(SessionRunnerModel.supported)
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

const samePlacement = (session: SessionSchema.Info, location: Location.Info) =>
  session.location.directory === location.directory && session.location.workspaceID === location.workspaceID

const requireParent = Effect.fn("TaskTool.requireParent")(function* (
  store: SessionStore.Interface,
  location: Location.Interface,
  context: Tool.Context,
  decodeCalled: (value: unknown) => Option.Option<{ readonly [key: string]: unknown }>,
  input: { readonly [key: string]: unknown },
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
  const called = call && call.state.status !== "pending" ? decodeCalled(call.state.input) : Option.none()
  if (Option.isNone(called))
    return yield* new ToolFailure({ message: "Task invocation has no valid recorded called input" })
  const childID = taskChildID(context)
  if (!isDeepStrictEqual(
    { ...called.value, task_id: called.value.task_id ?? childID },
    { ...input, task_id: input.task_id ?? childID },
  )) return yield* new ToolFailure({ message: "Task executor input conflicts with its recorded called input" })
  yield* requireDepth(store, parent)
  return parent
})

/**
 * A new worktree goes under this root's `.worktrees`, so it stays inside the trusted folder and the parent may commit
 * there; the copy is registered like one made in the app.
 */
const createWorktree = Effect.fn("TaskTool.createWorktree")(function* (
  copies: ProjectCopy.Interface,
  fs: FSUtil.Interface,
  store: SessionStore.Interface,
  location: Location.Interface,
  input: typeof Input.Type,
  childID: SessionSchema.ID,
) {
  if (input.directory !== undefined || input.task_id !== undefined)
    return yield* new ToolFailure({ message: "Task worktree starts a new child only; resume a child with its directory" })
  // An exact retry finds the child it already started and keeps that worktree.
  const retried = yield* store.get(childID)
  if (retried) return retried.location.directory
  if (location.vcs?.type !== "git") return yield* new ToolFailure({ message: "Task worktree needs a git repository" })
  const parent = path.join(location.project.directory, ".worktrees")
  // An ignore-everything file keeps the copies out of this checkout's own status, whatever the project ignores.
  yield* fs.writeWithDirs(path.join(parent, ".gitignore"), "*\n").pipe(Effect.orDie)
  const copy = yield* copies
    .create({
      strategy: ProjectCopy.StrategyID.make("git_worktree"),
      directory: AbsolutePath.make(parent),
      name: ProjectCopy.nameFromReply(input.description),
      projectID: location.project.id,
      sourceDirectory: AbsolutePath.make(location.project.directory),
    })
    .pipe(Effect.mapError((error) => new ToolFailure({ message: `Task worktree not created: ${error._tag}` })))
  return copy.directory
})

/**
 * Where the child works: this Location, or another worktree of the same git repository named by its root. The worktree
 * keeps this Location's workspace, and a resumed child must have been created there.
 */
const requirePlacement = Effect.fn("TaskTool.requirePlacement")(function* (
  projects: Project.Interface,
  fs: FSUtil.Interface,
  location: Location.Interface,
  directory: string | undefined,
) {
  if (directory === undefined || directory === location.directory) return location
  if (!path.isAbsolute(directory)) return yield* new ToolFailure({ message: `Task directory is not absolute: ${directory}` })
  // git reports real paths, so a worktree reached through a symlink (macOS /tmp) compares by its real path.
  const absolute = AbsolutePath.make(
    yield* fs.realPath(directory).pipe(Effect.catch(() => Effect.succeed(directory))),
  )
  const resolved = yield* projects.resolve(absolute)
  if (location.vcs?.type !== "git" || resolved.vcs?.store !== location.vcs.store)
    return yield* new ToolFailure({ message: `Task directory is not a worktree of this repository: ${directory}` })
  if (resolved.directory !== absolute)
    return yield* new ToolFailure({ message: `Task directory is not a worktree root: ${directory}` })
  return {
    directory: absolute,
    workspaceID: location.workspaceID,
    project: { id: location.project.id, directory: resolved.directory },
    vcs: resolved.vcs,
  } satisfies Location.Interface
})

const requireTarget = Effect.fn("TaskTool.requireTarget")(function* (agents: AgentV2.Interface, id: string) {
  const target = yield* agents.get(AgentV2.ID.make(id))
  if (!target || target.hidden || target.mode === "primary" || target.id === AgentV2.defaultID)
    return yield* new ToolFailure({ message: `Task target is not a visible subagent: ${id}` })
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
  location: Location.Info,
  context: Tool.Context,
  agent: AgentV2.ID,
  model: ModelV2.Ref,
) {
  if (child.parentID !== context.sessionID || child.agent !== agent || !samePlacement(child, location))
    return new ToolFailure({
      message: `Task child parent, agent, or placement mismatch: ${child.id} runs in ${child.location.directory}; resume it with that directory`,
    })
  if (!sameModel(child.model, model))
    return new ToolFailure({ message: `Task cannot change the recorded child model: ${child.id}` })
}

export { inheritedPermissions, primaryTools }

/** The child a Task call creates when neither `task_id` nor its governance names one; stable across exact retries. */
export function taskChildID(context: Tool.Context) {
  return SessionSchema.ID.make(`ses_${identity("task-child", context)}`)
}

/** The durable prompt a Task call admits into its child; a retry of the same call reuses it. */
export function taskPromptID(context: Tool.Context, childID: SessionSchema.ID) {
  return SessionMessage.ID.make(`msg_${identity("task-prompt", context, childID)}`)
}

/** The child's completed reply to `promptID`, or undefined while it is unfinished, failed or calling tools. */
export function completedReply(messages: ReadonlyArray<SessionMessage.Message>, promptID: SessionMessage.ID) {
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
