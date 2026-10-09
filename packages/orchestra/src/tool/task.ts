import { Tool } from "./tool"
import DESCRIPTION from "./task.txt"
import { ToolJsonSchema } from "./json-schema"
import { SessionV1 } from "@orchestra/core/v1/session"
import { BackgroundJob } from "@/background/job"
import { Session } from "@/session/session"
import { SessionID, MessageID } from "../session/schema"
import { MessageV2 } from "../session/message-v2"
import { Agent } from "../agent/agent"
import { Provider } from "@/provider/provider"
import { GovernedTaskReservation } from "../maestro/governed-task-reservation"
import type { SessionPrompt } from "../session/prompt"
import { Config } from "@/config/config"
import { Effect, Exit, FileSystem, Schema, Scope } from "effect"
import { EffectBridge } from "@/effect/bridge"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Database } from "@orchestra/core/database/database"
import { EventV2Bridge } from "@/event-v2-bridge"
import { reserveDispatch } from "@/maestro/dispatch"
import { authorizedTaskMismatch, readAuthorization } from "@/maestro/authorization"
import { canonicalMemberId, nativeProfiles, roster } from "@/maestro/roster"
import { Permission } from "@/permission"
import { PermissionV1 } from "@orchestra/core/v1/permission"
import { Git } from "@/git"
import { KeyedMutex } from "@orchestra/core/effect/keyed-mutex"
import { GroundedSkills } from "@/maestro/grounded-skills"
import { ArsenalCompletion } from "@/maestro/arsenal-completion"
import { AtlasResume } from "@/maestro/atlas-resume"
import { SeatWork } from "@/maestro/backend-work"
import { LogicalTask } from "@/maestro/logical-task"
import { WriteRoots } from "@/maestro/write-roots"
import { FSUtil } from "@orchestra/core/fs-util"
import { AppProcess } from "@orchestra/core/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { InstanceState } from "@/effect/instance-state"
import { TaskReport } from "./task-report"
import { Seats } from "@/maestro/seats"
import { WorkflowBinding } from "@/maestro/workflow-binding"

export interface TaskPromptOps {
  cancel(sessionID: SessionID): Effect.Effect<void>
  resolvePromptParts(template: string): Effect.Effect<SessionPrompt.PromptInput["parts"]>
  prompt(
    input: SessionPrompt.PromptInput,
    options?: { beforeModel: Effect.Effect<void, unknown> },
  ): Effect.Effect<SessionV1.WithParts>
}

const id = "task"
const dispatchLock = KeyedMutex.makeUnsafe<string>()
const BACKGROUND_DESCRIPTION = [
  "`background: true` starts the teammate and returns at once; its result arrives later as a new message.",
  "Use it only for independent work whose result you do not need before you continue. Without it, the call waits for the result.",
].join(" ")
const BACKGROUND_STARTED = [
  "The teammate is working in the background. Its result arrives as a new message when it finishes.",
  "Do not wait, poll or ask it for status, and leave its files and topics to it.",
  "Continue with other work, or tell the owner what you started and end your turn.",
].join("\n")
const BACKGROUND_UPDATED = [
  "The added context was sent to the teammate, which is still working in the background. Its result arrives as a new message when it finishes.",
  "Do not wait, poll or ask it for status, and leave its files and topics to it.",
  "Continue with other work, or tell the owner what you sent and end your turn.",
].join("\n")

const BaseParameterFields = {
  description: Schema.String.annotate({ description: "A 3-5 word label the owner sees for this task" }),
  prompt: Schema.String.annotate({ description: "The teammate's whole brief" }),
  subagent_type: Schema.String.annotate({
    description: "The teammate to start, from the list in this tool's description",
  }),
  task_id: Schema.optional(Schema.String).annotate({
    description:
      "Set only to continue an earlier task: the exact task_id that call returned. The teammate resumes with its earlier context. An unknown id fails.",
  }),
  command: Schema.optional(Schema.String).annotate({ description: "The command that triggered this task" }),
  model: Schema.optional(Schema.String).annotate({
    description:
      "The model to run the teammate on, as 'providerID/modelID'. Without it, the teammate runs on its configured model, or else on yours.",
  }),
  governed: Schema.optional(
    Schema.Struct({
      sessionID: Schema.String,
      projectID: Schema.String,
      memberID: Schema.String,
      approvalMessageID: Schema.String,
      planRevisionID: Schema.String,
      revisionHash: Schema.String,
      validationRecordID: Schema.String,
      validationHash: Schema.String,
      contextHash: Schema.String,
      policyHash: Schema.String,
      taskHash: Schema.String,
    }),
  ).annotate({
    description: "Exact approval binding required only for an explicit governed Task.",
  }),
  authorizationID: Schema.optional(Schema.String).annotate({
    description: "AuthorizationGranted ID for current team dispatch.",
  }),
  writePaths: WriteRoots.Param,
  workflow: Schema.optional(WorkflowBinding.Selection),
  memoryUnit: AtlasResume.Param,
}

const BaseParameters = Schema.Struct(BaseParameterFields)

export const Parameters = Schema.Struct({
  ...BaseParameterFields,
  background: Schema.optional(Schema.Boolean).annotate({
    description:
      "Return at once while the teammate works; its result arrives as a new message when it finishes, so do not wait for it or poll it.",
  }),
})

function renderOutput(input: {
  id: string
  state: "running" | "completed" | "error"
  summary?: string
  text: string
}) {
  const tag = input.state === "error" ? "task_error" : "task_result"
  return [
    `<task id="${input.id}" state="${input.state}">`,
    ...(input.summary ? [`<summary>${input.summary}</summary>`] : []),
    `<${tag}>`,
    input.text,
    `</${tag}>`,
    "</task>",
  ].join("\n")
}

export const TaskTool = Tool.define(
  id,
  Effect.gen(function* () {
    const agent = yield* Agent.Service
    const background = yield* BackgroundJob.Service
    const config = yield* Config.Service
    const sessions = yield* Session.Service
    const scope = yield* Scope.Scope
    const flags = yield* RuntimeFlags.Service
    const database = yield* Database.Service
    const events = yield* EventV2Bridge.Service
    const git = yield* Git.Service
    const fs = yield* FileSystem.FileSystem
    const completion = yield* ArsenalCompletion.make.pipe(
      Effect.provide(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node]))),
    )

    const run = Effect.fn("TaskTool.execute")(function* (
      params: Schema.Schema.Type<typeof Parameters>,
      ctx: Tool.Context,
    ) {
      const cfg = yield* config.get()
      // The caller resolves by stable id only (F1.10): a display label never identifies an agent, and an unresolved
      // caller fails closed (F1.13) rather than skipping the native-seat deny below.
      const caller = yield* agent.get(ctx.agentID ?? ctx.agent)
      if (!caller) return yield* Effect.fail(new Error(`Unknown Task caller: ${ctx.agentID ?? ctx.agent}`))
      const nativeSeat = caller?.native
        ? roster.find((member) => member.memberId === caller.id && member.nativeProfile)
        : undefined
      if (nativeSeat?.nativeProfile) {
        const nativePermission = Permission.fromConfig(nativeProfiles[nativeSeat.memberId])
        if (Permission.evaluate(id, params.subagent_type, nativePermission).action === "deny") {
          return yield* new PermissionV1.DeniedError({ ruleset: nativePermission })
        }
      }
      const runInBackground = params.background === true
      let governedChildID: SessionID | undefined
      let governedPresentationID: string | undefined
      let governedCallID: string | undefined
      let replayReserved = false
      let requireCompletedReplay = false
      if (runInBackground && !flags.experimentalBackgroundSubagents) {
        return yield* Effect.fail(
          new Error(
            "Background tasks are not enabled in this session. Leave out `background` to run the task and wait for its result.",
          ),
        )
      }

      const parent = yield* sessions.get(ctx.sessionID)
      if (yield* WorkflowBinding.read(ctx.sessionID))
        return yield* Effect.fail(new Error("Tool safety HOLD: WORKFLOW_NESTED_TASK_REFUSED"))
      const next = yield* agent.get(params.subagent_type)
      if (!next) {
        return yield* Effect.fail(new Error(`Unknown agent type: ${params.subagent_type} is not a valid agent type`))
      }
      // Delegation only goes down: a scoped subagent must not be able to start a primary (host) agent.
      if (next.mode === "primary") {
        return yield* Effect.fail(new Error(`${params.subagent_type} is a primary agent and cannot be started as a subagent`))
      }
      const nextID = next.id ?? params.subagent_type
      if (params.workflow) {
        if (!params.governed && !params.authorizationID)
          return yield* Effect.fail(new Error("Tool safety HOLD: WORKFLOW_APPROVAL_BINDING_MISSING"))
        yield* WorkflowBinding.beforeTask({ sessionID: ctx.sessionID, assistantMessageID: ctx.messageID,
          callID: ctx.callID ?? "", directory: parent.directory, projectID: parent.projectID,
          writePaths: params.writePaths ?? [], subagentType: params.subagent_type, prompt: params.prompt,
          model: params.model, workflow: params.workflow,
        }).pipe(Effect.orDie)
      }
      const seat = next.native === true ? Seats.find(nextID) : undefined
      const childPermissions = yield* WriteRoots.bind(
        nextID,
        params.writePaths,
        GovernedTaskReservation.childPermissions({ parent, next, primaryTools: cfg.experimental?.primary_tools }),
      )
      let reservedChildPermissions: readonly WriteRoots.Rule[] | undefined
      if (params.authorizationID) {
        if (caller?.id !== "maestro" || caller.native !== true) {
          return yield* Effect.fail(new Error("Authorized Task requires Maestro"))
        }
        // The reservation is write-once and snapshots the child's permissions, so check the approved seat and
        // intent before reserving; a wrong subagent_type would otherwise pin its snapshot and spend the approval.
        const mismatch = authorizedTaskMismatch(yield* readAuthorization(params.authorizationID), {
          sessionID: ctx.sessionID,
          memberID: nextID,
          subagentType: params.subagent_type,
          prompt: params.prompt,
          model: params.model,
        })
        if (mismatch) return yield* Effect.fail(new Error(mismatch))
        const reservation = yield* reserveDispatch({
          sessionID: ctx.sessionID,
          authorizationID: params.authorizationID,
          permission: childPermissions,
        })
        governedChildID = SessionID.make(reservation.childSessionID)
        reservedChildPermissions = reservation.permission
        replayReserved = true
        requireCompletedReplay = true
      }
      const strictTask = seat?.strictResume === true || params.governed !== undefined || params.authorizationID !== undefined || params.workflow !== undefined
      const resumed = yield* LogicalTask.resolveResume({ taskID: params.task_id, strict: strictTask,
        parentSessionID: ctx.sessionID, projectID: parent.projectID, memberID: nextID })
      if (params.task_id && !resumed) {
        return yield* Effect.fail(
          new Error(
            `No task ${params.task_id} in this session. Omit task_id to start a new task, or pass an id returned by an earlier task call.`,
          ),
        )
      }
      if (params.governed) {
        const message = yield* MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID }).pipe(
          Effect.provideService(Database.Service, database),
          Effect.orDie,
        )
        if (message.info.role !== "assistant") return yield* Effect.fail(new Error("Not an assistant message"))
        if (params.model) {
          const parsed = Provider.parseModel(params.model)
          if (!parsed.providerID || !parsed.modelID) {
            return yield* Effect.fail(new Error(`Invalid model "${params.model}". Use the form 'providerID/modelID'.`))
          }
        }
        let ancestor = parent
        let ancestorDepth = 0
        while (ancestor.parentID) {
          ancestorDepth++
          ancestor = yield* sessions.get(ancestor.parentID)
        }
        if (ancestorDepth >= (cfg.subagent_depth ?? 1)) {
          return yield* Effect.fail(
            new Error(
              "You cannot start teammates of your own, so no teammate was started. Do this work yourself, or say in your report what still needs a teammate.",
            ),
          )
        }
        const selectedModel = params.model
          ? Provider.parseModel(params.model)
          : (next.model ?? { modelID: message.info.modelID, providerID: message.info.providerID })
        const modelRules = (parent.permission ?? []).filter(
          (rule) => rule.permission === id && rule.pattern.includes("/"),
        )
        if (!params.authorizationID && !ctx.extra?.bypassAgentCheck) {
          yield* ctx.ask({
            permission: id,
            patterns:
              modelRules.length > 0
                ? [params.subagent_type, `${selectedModel.providerID}/${selectedModel.modelID}`]
                : [params.subagent_type],
            always: ["*"],
            metadata: {
              description: params.description,
              subagent_type: params.subagent_type,
              ...(modelRules.length > 0 ? { model: `${selectedModel.providerID}/${selectedModel.modelID}` } : {}),
            },
          })
        }
        if (!ctx.extra?.promptOps) return yield* Effect.fail(new Error("TaskTool requires promptOps in ctx.extra"))
      }
      if (params.governed) {
        const reservation = yield* GovernedTaskReservation.reserve({
          governed: params.governed,
          subagentType: params.subagent_type,
          prompt: params.prompt,
          model: params.model,
          taskID: resumed?.id,
          sessionID: ctx.sessionID,
          agent: ctx.agent,
          agentID: ctx.agentID,
          callID: ctx.callID,
          parent,
          nextID,
          permission: childPermissions,
          agentService: agent,
          database,
          events,
          sessions,
        })
        governedChildID = reservation.childSessionID
        governedPresentationID = reservation.presentationID
        governedCallID = reservation.callID
        reservedChildPermissions = reservation.permission
        replayReserved = reservation.replayReserved
      }
      let current = parent
      let depth = 0
      while (current.parentID) {
        depth++
        current = yield* sessions.get(current.parentID)
      }
      if (depth >= (cfg.subagent_depth ?? 1)) {
        return yield* Effect.fail(
          new Error(
            "You cannot start teammates of your own, so no teammate was started. Do this work yourself, or say in your report what still needs a teammate.",
          ),
        )
      }

      const msg = yield* MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID }).pipe(
        Effect.provideService(Database.Service, database),
        Effect.orDie,
      )
      if (msg.info.role !== "assistant") return yield* Effect.fail(new Error("Not an assistant message"))
      const variant = msg.info.variant

      let explicitModel = false
      let model = next.model ?? {
        modelID: msg.info.modelID,
        providerID: msg.info.providerID,
      }
      if (params.model) {
        const parsed = Provider.parseModel(params.model)
        if (!parsed.providerID || !parsed.modelID) {
          return yield* Effect.fail(new Error(`Invalid model "${params.model}". Use the form 'providerID/modelID'.`))
        }
        explicitModel = true
        model = { modelID: parsed.modelID, providerID: parsed.providerID }
      }
      const modelPattern = `${model.providerID}/${model.modelID}`

      // Model-scoped task rules (written by the subagent-model picker panel)
      // look like { permission: "task", pattern: "openrouter/*", action }.
      // Only when the session carries them do we add the resolved model to
      // the ask patterns — otherwise behavior is exactly as before (no
      // extra prompt, no extra surface for the model to satisfy).
      const modelRules = (parent.permission ?? []).filter(
        (rule) => rule.permission === id && rule.pattern.includes("/"),
      )

      if (!params.authorizationID && !ctx.extra?.bypassAgentCheck && !params.governed) {
        yield* ctx.ask({
          permission: id,
          patterns: modelRules.length > 0 ? [params.subagent_type, modelPattern] : [params.subagent_type],
          always: ["*"],
          metadata: {
            description: params.description,
            subagent_type: params.subagent_type,
            ...(modelRules.length > 0 ? { model: modelPattern } : {}),
          },
        })
      }

      const reserved = governedChildID
        ? yield* sessions.get(governedChildID).pipe(Effect.catchCause(() => Effect.succeed(undefined)))
        : undefined
      if (reserved && (reserved.parentID !== ctx.sessionID || canonicalMemberId(reserved.agent) !== nextID)) {
        return yield* Effect.fail(new Error("Governed Task denied: reservation-child-mismatch"))
      }
      if (params.authorizationID && !reserved) {
        yield* reserveDispatch({
          sessionID: ctx.sessionID,
          authorizationID: params.authorizationID,
          permission: childPermissions,
          requireCurrent: true,
        })
      }
      const session = governedChildID ? reserved : resumed
      if (!governedChildID) yield* WriteRoots.rebind(sessions, resumed, childPermissions)
      const permissionSnapshot = reservedChildPermissions
      if (
        reserved &&
        (!permissionSnapshot ||
          reserved.permission?.length !== permissionSnapshot.length ||
          reserved.permission?.some(
            (rule, index) =>
              rule.permission !== permissionSnapshot[index]?.permission ||
              rule.pattern !== permissionSnapshot[index]?.pattern ||
              rule.action !== permissionSnapshot[index]?.action,
          ))
      ) {
        return yield* Effect.fail(new Error("Governed Task denied: reservation-child-permission-mismatch"))
      }
      const nextSession =
        session ??
        (yield* sessions
          .create({
            id: governedChildID,
            parentID: ctx.sessionID,
            title: params.description + ` (@${next.name} subagent)`,
            agent: nextID,
            permission: governedChildID ? permissionSnapshot : childPermissions,
          })
          .pipe(
            Effect.catchCause(() => {
              if (!governedChildID) return Effect.die("Task child creation failed")
              return sessions
                .get(governedChildID)
                .pipe(Effect.catchCause(() => Effect.fail(new Error("Governed Task denied: reservation-child-hold"))))
            }),
          ))
      if (
        governedChildID &&
        (nextSession.parentID !== ctx.sessionID || canonicalMemberId(nextSession.agent) !== nextID)
      ) {
        return yield* Effect.fail(new Error("Governed Task denied: reservation-child-mismatch"))
      }
      if (
        governedChildID &&
        (!permissionSnapshot ||
          nextSession.permission?.length !== permissionSnapshot.length ||
          nextSession.permission?.some(
            (rule, index) =>
              rule.permission !== permissionSnapshot[index]?.permission ||
              rule.pattern !== permissionSnapshot[index]?.pattern ||
              rule.action !== permissionSnapshot[index]?.action,
          ))
      ) {
        return yield* Effect.fail(new Error("Governed Task denied: reservation-child-permission-mismatch"))
      }

      const logical = strictTask
        ? yield* LogicalTask.ensure({ executionSessionID: nextSession.id, authoritySessionID: ctx.sessionID,
            projectID: parent.projectID, memberID: nextID, ...LogicalTask.origin(governedChildID, !!params.governed) })
        : undefined
      const shownID = logical?.taskId ?? nextSession.id
      const placement = yield* InstanceState.context
      const completionReceipt = yield* completion.beforeDispatch({
        sessionID: ctx.sessionID, taskID: nextSession.id, callID: ctx.callID ?? "",
        directory: placement.directory, projectID: placement.project.id,
        planID: params.workflow?.planRevisionID ?? params.governed?.planRevisionID,
        ...(params.workflow && logical ? { workflow: { selection: params.workflow,
          assistantMessageID: ctx.messageID, logicalTaskID: logical.taskId,
          writePaths: params.writePaths ?? [], subagentType: params.subagent_type, prompt: params.prompt, model: params.model,
        } } : {}),
      })

      if (params.governed) {
        const governed = params.governed
        if (!governedPresentationID || !governedChildID || !governedCallID)
          return yield* Effect.fail(new Error("Governed Task denied: reservation-hold"))
        yield* GovernedTaskReservation.consume({
          governed,
          presentationID: governedPresentationID,
          childSessionID: governedChildID,
          callID: governedCallID,
          database,
          events,
        })
      }

      const metadata = {
        parentSessionId: ctx.sessionID,
        sessionId: nextSession.id,
        model,
        ...(runInBackground ? { background: true } : {}),
      }
      const completionEvidence: { value?: { verified: true; planID: string; taskID: string; checks: number } } = {}
      const work = SeatWork.track({
        enabled: seat?.workResult !== undefined,
        seat,
        sessionID: nextSession.id,
        taskId: logical?.taskId,
        writeRoots: yield* WriteRoots.effective(governedChildID ? nextSession.permission : childPermissions),
        publish: (workResult) => ctx.metadata({ metadata: { ...metadata, workResult } }),
      })

      yield* ctx.metadata({
        title: params.description,
        metadata,
      })

      if (governedChildID && reserved) {
        if (!replayReserved) return yield* Effect.fail(new Error("Governed Task denied: reserved-child-incomplete"))
        const history = yield* MessageV2.stream(governedChildID)
        const strictReplay = requireCompletedReplay || completionReceipt !== undefined
        const completed = strictReplay
          ? history[0]
          : history.findLast(
              (message) =>
                message.info.role === "assistant" && message.info.finish !== undefined && !message.info.error,
            )
        const job = strictReplay ? yield* background.get(governedChildID) : undefined
        if (completed?.info.role === "assistant") yield* work.record(completed)
        if (
          strictReplay &&
          (!completed ||
            completed.info.role !== "assistant" ||
            !completed.info.finish ||
            ["tool-calls", "unknown"].includes(completed.info.finish) ||
            completed.info.error ||
            completed.info.parentID !== history.find((message) => message.info.role === "user")?.info.id ||
            completed.parts.some(
              (part) => part.type === "tool" && (part.state.status !== "completed" || !part.metadata?.providerExecuted),
            ) ||
            (job && job.status !== "completed"))
        ) {
          const failure = completionReceipt
            ? "Tool safety HOLD: completion-worker-not-finished"
            : "Governed Task denied: reserved-child-incomplete"
          yield* work.hostEnded("interrupted", failure)
          return yield* Effect.fail(new Error(failure))
        }
        if (!completed) yield* work.hostEnded("interrupted", "No completed child message to replay")
        const output = completed?.parts.findLast((part) => part.type === "text")?.text ?? ""
        const verified = yield* completion.verifiedCompletion(completionReceipt, nextSession.id)
        return {
          title: params.description,
          metadata: work.attach({ ...metadata, ...(verified ? { completion: verified } : {}) }),
          output: renderOutput({ id: shownID, state: "completed", text: output }),
        }
      }

      const ops = ctx.extra?.promptOps as TaskPromptOps
      if (!ops) return yield* Effect.fail(new Error("TaskTool requires promptOps in ctx.extra"))
      const resume = yield* AtlasResume.admit({ agent: next, sessionID: nextSession.id, unit: params.memoryUnit, ctx })

      const runTask = Effect.fn("TaskTool.runTask")(function* () {
        yield* completion.revalidateWorkflow(completionReceipt)
        // Session-start hooks run after reservation and can change the repository.
        if (params.authorizationID) {
          yield* reserveDispatch({
            sessionID: ctx.sessionID,
            authorizationID: params.authorizationID,
            permission: childPermissions,
            requireCurrent: true,
          }).pipe(
            Effect.provideService(Database.Service, database),
            Effect.provideService(EventV2Bridge.Service, events),
            Effect.provideService(Git.Service, git),
            Effect.provideService(Config.Service, config),
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Session.Service, sessions),
          )
        }
        // A brief names other agents as plain text. As an @mention, an agent part would tell the child to
        // delegate to that agent and skip its own task permission prompt.
        const parts = (yield* ops.resolvePromptParts(params.prompt)).filter((part) => part.type !== "agent")
        const own = params.authorizationID
          ? yield* GroundedSkills.parts(params.authorizationID).pipe(Effect.provideService(Database.Service, database))
          : []
        const beforeModel = params.authorizationID
          ? reserveDispatch({
              sessionID: ctx.sessionID,
              authorizationID: params.authorizationID,
              permission: childPermissions,
              requireCurrent: true,
            }).pipe(
              Effect.provideService(Database.Service, database),
              Effect.provideService(EventV2Bridge.Service, events),
              Effect.provideService(Git.Service, git),
              Effect.provideService(Config.Service, config),
              Effect.provideService(FileSystem.FileSystem, fs),
              Effect.provideService(Session.Service, sessions),
              Effect.asVoid,
            )
          : undefined
        const promptID = MessageID.ascending()
        const result = yield* completion.withWorkflow(completionReceipt, ops.prompt(
          {
            messageID: promptID,
            sessionID: nextSession.id,
            model: {
              modelID: model.modelID,
              providerID: model.providerID,
            },
            variant: next.model || explicitModel ? undefined : variant,
            agent: nextID,
            parts: [...parts, ...own, ...resume],
          },
          { beforeModel: Effect.all([beforeModel ?? Effect.void, completion.revalidateWorkflow(completionReceipt)], { discard: true }) },
        ))
        // F4 cl.6: stream the work result before any failure below so the errored tool part keeps it.
        yield* work.record(result).pipe(Effect.provideService(Database.Service, database))
        if (result.info.role === "assistant" && result.info.error) {
          const message =
            "message" in result.info.error.data && typeof result.info.error.data.message === "string"
              ? result.info.error.data.message
              : result.info.error.name
          return yield* Effect.fail(new Error(`Subagent failed (task_id: ${nextSession.id}): ${message}`))
        }
        const failed = result.parts.findLast((item) => item.type === "tool" && item.state.status === "error")
        if (failed?.type === "tool" && failed.state.status === "error") {
          return yield* Effect.fail(new Error(`Subagent failed (task_id: ${nextSession.id}): ${failed.state.error}`))
        }
        if (completionReceipt && (result.info.role !== "assistant" || !result.info.finish ||
          ["tool-calls", "unknown"].includes(result.info.finish) ||
          result.parts.some((part) => part.type === "tool" && part.state.status !== "completed")))
          return yield* Effect.fail(new Error("Tool safety HOLD: completion-worker-not-finished"))
        const verified = yield* completion.verifiedCompletion(completionReceipt, nextSession.id)
        if (verified) {
          completionEvidence.value = verified
          yield* ctx.metadata({ metadata: work.attach({ ...metadata, completion: verified }) })
        }
        type Part = (typeof result.parts)[number]
        const reported = (item: Part): item is Extract<Part, { type: "text" }> =>
          item.type === "text" && item.text.trim() !== ""
        // An empty final turn still owes the caller a report: summarize this run from the child's session.
        const history = result.parts.some(reported)
          ? []
          : yield* sessions.messages({ sessionID: nextSession.id }).pipe(Effect.orElseSucceed(() => [result]))
        return result.parts.findLast(reported)?.text ??
          TaskReport.fallback(history.filter((message) => message.info.id > promptID))
      })

      const inject = Effect.fn("TaskTool.injectBackgroundResult")(function* (
        state: "completed" | "error",
        text: string,
      ) {
        const currentParent = yield* sessions.get(ctx.sessionID)
        const workResult = yield* work.notice(state, text).pipe(Effect.provideService(Database.Service, database))
        yield* ops
          .prompt({
            sessionID: ctx.sessionID,
            agent: currentParent.agent ?? ctx.agentID ?? ctx.agent,
            variant,
            parts: [
              {
                type: "text",
                synthetic: true,
                metadata: {
                  source: { type: "task-return", task_id: nextSession.id, state },
                  ...(workResult ? { workResult } : {}),
                },
                text: renderOutput({
                  id: shownID,
                  state,
                  summary:
                    state === "completed"
                      ? `Background task completed: ${params.description}`
                      : `Background task failed: ${params.description}`,
                  text,
                }),
              },
            ],
          })
          .pipe(Effect.ignore, Effect.forkIn(scope, { startImmediately: true }))
      })

      const notify = Effect.fn("TaskTool.notifyBackgroundResult")(function* (jobID: string) {
        yield* background.wait({ id: jobID }).pipe(
          Effect.flatMap((result) => {
            if (result.info?.status === "completed") return inject("completed", result.info.output ?? "")
            if (result.info?.status === "error") return inject("error", result.info.error ?? "")
            return Effect.void
          }),
          Effect.forkIn(scope, { startImmediately: true }),
        )
      })

      if (yield* background.extend({ id: nextSession.id, run: runTask() })) {
        yield* work.hostEnded("running", "Background task updated")
        return {
          title: params.description,
          metadata: work.attach({ ...metadata, background: true, jobId: nextSession.id }),
          output: renderOutput({
            id: shownID,
            state: "running",
            summary: "Background task updated",
            text: BACKGROUND_UPDATED,
          }),
        }
      }

      const info = yield* background.start({
        id: nextSession.id,
        type: id,
        title: params.description,
        metadata,
        onPromote: Effect.all([
          ctx.metadata({
            title: params.description,
            metadata: { ...metadata, background: true, jobId: nextSession.id },
          }),
          notify(nextSession.id),
        ]),
        run: runTask().pipe(Effect.onInterrupt(() => ops.cancel(nextSession.id))),
      })

      // The child is still running: the work result says so and carries no worker fields yet.
      const backgroundResult = Effect.fn("TaskTool.backgroundResult")(function* () {
        yield* work.hostEnded("running", "Background task started")
        return {
          title: params.description,
          metadata: work.attach({ ...metadata, background: true, jobId: info.id }),
          output: renderOutput({
            id: shownID,
            state: "running",
            summary: "Background task started",
            text: BACKGROUND_STARTED,
          }),
        }
      })

      if (runInBackground) {
        yield* notify(info.id)
        return yield* backgroundResult()
      }

      const runCancel = yield* EffectBridge.make()
      const cancel = ops.cancel(nextSession.id)

      function onAbort() {
        runCancel.fork(cancel)
      }

      return yield* Effect.acquireUseRelease(
        Effect.sync(() => {
          ctx.abort.addEventListener("abort", onAbort)
        }),
        () =>
          Effect.gen(function* () {
            const result = yield* Effect.raceFirst(
              background.wait({ id: nextSession.id }).pipe(Effect.map((waited) => waited.info)),
              background.waitForPromotion(nextSession.id),
            )
            if (result?.metadata?.background === true) return yield* backgroundResult()
            if (result?.status === "error") {
              const failure = result.error ?? "Task failed"
              yield* work.hostEnded("failed", failure)
              return yield* Effect.fail(new Error(failure))
            }
            if (result?.status === "cancelled") {
              yield* work.hostEnded("interrupted", "Task cancelled")
              return yield* Effect.fail(new Error("Task cancelled"))
            }
            return {
              title: params.description,
              metadata: work.attach({
                ...metadata,
                ...(completionEvidence.value ? { completion: completionEvidence.value } : {}),
              }),
              output: renderOutput({ id: shownID, state: "completed", text: result?.output ?? "" }),
            }
          }),
        (_, exit) =>
          Effect.gen(function* () {
            if (!Exit.hasInterrupts(exit)) return
            yield* work.hostEnded("interrupted", "Task cancelled").pipe(Effect.catchCause(() => Effect.void))
            yield* Effect.all([cancel, background.cancel(nextSession.id)], { discard: true })
          }).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                ctx.abort.removeEventListener("abort", onAbort)
              }),
            ),
          ),
      )
    })

    return {
      description: flags.experimentalBackgroundSubagents
        ? [DESCRIPTION, BACKGROUND_DESCRIPTION].join("\n\n")
        : DESCRIPTION,
      parameters: Parameters,
      jsonSchema: flags.experimentalBackgroundSubagents ? undefined : ToolJsonSchema.fromSchema(BaseParameters),
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        (params.authorizationID
          ? dispatchLock.withLock(params.authorizationID)(run(params, ctx))
          : run(params, ctx)
        ).pipe(
          Effect.provideService(Database.Service, database),
          Effect.provideService(EventV2Bridge.Service, events),
          Effect.provideService(Git.Service, git),
          Effect.provideService(Config.Service, config),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Session.Service, sessions),
          Effect.orDie,
        ),
    }
  }),
)
