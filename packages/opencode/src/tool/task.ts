import { Tool } from "./tool"
import DESCRIPTION from "./task.txt"
import { ToolJsonSchema } from "./json-schema"
import { SessionV1 } from "@opencode-ai/core/v1/session"
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
import { Database } from "@opencode-ai/core/database/database"
import { EventV2Bridge } from "@/event-v2-bridge"
import { reserveDispatch } from "@/maestro/dispatch"
import { authorizationTaskIntentHash } from "@/maestro/authorization"
import { canonicalMemberId, nativeProfiles, roster } from "@/maestro/roster"
import { Permission } from "@/permission"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Git } from "@/git"
import { KeyedMutex } from "@opencode-ai/core/effect/keyed-mutex"
import { readAuthorization } from "@/maestro/authorization"
import { readValidation } from "@/maestro/validation-record"
import { readContext } from "@/maestro/context-record"
import { ArsenalCompletion } from "@/maestro/arsenal-completion"
import { BackendResult } from "@/maestro/backend-result"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { AppProcess } from "@opencode-ai/core/process"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { InstanceState } from "@/effect/instance-state"

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
  "Background mode: background=true launches the subagent asynchronously and returns immediately.",
  "Foreground is the default; use it when you need the result before continuing.",
  "Use background only for independent work that can run while you continue elsewhere.",
  "You will be notified automatically when it finishes.",
].join(" ")
const BACKGROUND_STARTED = [
  "The task is working in the background. You will be notified automatically when it finishes.",
  "DO NOT sleep, poll for progress, ask the task for status, or duplicate this task's work — avoid working with the same files or topics it is using.",
  "Work on non-overlapping tasks, or briefly tell the user what you launched and end your response.",
].join("\n")
const BACKGROUND_UPDATED = [
  "Additional context sent to the running background task.",
  "The task is still working in the background. You will be notified automatically when it finishes.",
  "DO NOT sleep, poll for progress, ask the task for status, or duplicate this task's work — avoid working with the same files or topics it is using.",
  "Work on non-overlapping tasks, or briefly tell the user what you sent and end your response.",
].join("\n")

const BaseParameterFields = {
  description: Schema.String.annotate({ description: "A short (3-5 words) description of the task" }),
  prompt: Schema.String.annotate({ description: "The task for the agent to perform" }),
  subagent_type: Schema.String.annotate({ description: "The type of specialized agent to use for this task" }),
  task_id: Schema.optional(Schema.String).annotate({
    description:
      "This should only be set if you mean to resume a previous task (you can pass a prior task_id and the task will continue the same subagent session as before instead of creating a fresh one)",
  }),
  command: Schema.optional(Schema.String).annotate({ description: "The command that triggered this task" }),
  model: Schema.optional(Schema.String).annotate({
    description:
      "Run the subagent on a specific model as 'providerID/modelID' (e.g. 'openrouter/deepseek/deepseek-chat', 'groq/llama-3.3-70b-versatile'). Overrides the subagent's configured model and the parent session model. The provider part also selects credentials: OAuth subscriptions (Claude Max, ChatGPT) and API keys resolve per providerID at run time — use a custom provider alias in opencode.json to pin a second key for the same backend.",
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
}

const BaseParameters = Schema.Struct(BaseParameterFields)

export const Parameters = Schema.Struct({
  ...BaseParameterFields,
  background: Schema.optional(Schema.Boolean).annotate({
    description:
      "Run the agent in the background. You will be notified when it completes. DO NOT sleep, poll, or proactively check on its progress",
  }),
})

function renderOutput(input: {
  sessionID: SessionID
  state: "running" | "completed" | "error"
  summary?: string
  text: string
}) {
  const tag = input.state === "error" ? "task_error" : "task_result"
  return [
    `<task id="${input.sessionID}" state="${input.state}">`,
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
        const nativePermission = Permission.fromConfig(nativeProfiles[nativeSeat.nativeProfile])
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
          new Error("Background subagents require OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true"),
        )
      }

      const parent = yield* sessions.get(ctx.sessionID)
      const next = yield* agent.get(params.subagent_type)
      if (!next) {
        return yield* Effect.fail(new Error(`Unknown agent type: ${params.subagent_type} is not a valid agent type`))
      }
      const nextID = next.id ?? params.subagent_type
      const childPermissions = GovernedTaskReservation.childPermissions({
        parent,
        next,
        primaryTools: cfg.experimental?.primary_tools,
      })
      let reservedChildPermissions:
        | readonly {
            readonly permission: string
            readonly pattern: string
            readonly action: "allow" | "deny" | "ask"
          }[]
        | undefined
      if (params.authorizationID) {
        if (caller?.id !== "maestro" || caller.native !== true) {
          return yield* Effect.fail(new Error("Authorized Task requires Maestro"))
        }
        const reservation = yield* reserveDispatch({
          sessionID: ctx.sessionID,
          authorizationID: params.authorizationID,
          permission: childPermissions,
        })
        if (reservation.routedMemberID !== nextID) {
          return yield* Effect.fail(new Error("Authorized Task denied: routed-seat-mismatch"))
        }
        if (
          reservation.taskIntentHash !==
          authorizationTaskIntentHash({
            subagentType: params.subagent_type,
            prompt: params.prompt,
            model: params.model,
          })
        ) {
          return yield* Effect.fail(new Error("Authorized Task denied: task-intent-mismatch"))
        }
        governedChildID = SessionID.make(reservation.childSessionID)
        reservedChildPermissions = reservation.permission
        replayReserved = true
        requireCompletedReplay = true
      }
      const resumed = params.task_id
        ? yield* sessions.get(SessionID.make(params.task_id)).pipe(Effect.catchCause(() => Effect.succeed(undefined)))
        : undefined
      if (resumed && (resumed.parentID !== ctx.sessionID || canonicalMemberId(resumed.agent) !== nextID)) {
        return yield* Effect.fail(new Error("Task resume denied: task is not direct child for selected agent"))
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
            return yield* Effect.fail(
              new Error(
                `Invalid model "${params.model}". Use the 'providerID/modelID' format, e.g. 'openrouter/deepseek/deepseek-chat'.`,
              ),
            )
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
              `Subagent depth limit reached (${cfg.subagent_depth ?? 1}). Increase "subagent_depth" to allow nested subagents.`,
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
          taskID: params.task_id,
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
            `Subagent depth limit reached (${cfg.subagent_depth ?? 1}). Increase "subagent_depth" to allow nested subagents.`,
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
          return yield* Effect.fail(
            new Error(
              `Invalid model "${params.model}". Use the 'providerID/modelID' format, e.g. 'openrouter/deepseek/deepseek-chat'.`,
            ),
          )
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

      const placement = yield* InstanceState.context
      const completionReceipt = yield* completion.beforeDispatch({
        sessionID: ctx.sessionID, taskID: nextSession.id, callID: ctx.callID ?? "",
        directory: placement.directory, projectID: placement.project.id, planID: params.governed?.planRevisionID,
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
      const workEvidence: { value?: BackendResult.WorkResult } = {}

      yield* ctx.metadata({
        title: params.description,
        metadata,
      })

      // F4 cl.6: when the host ends the Task before or instead of the child's final message, stream the work result
      // it can stand behind: the card already assembled, else the child's last assistant message, else no card.
      const hostResult = Effect.fn("TaskTool.hostResult")(function* (
        reason: "failed" | "interrupted" | "running",
        detail: string,
      ) {
        if (nextID !== "backend") return
        workEvidence.value = workEvidence.value
          ? { ...workEvidence.value, terminal: { reason, hostDetail: detail } }
          : BackendResult.hostEnded({
              message: (yield* MessageV2.stream(nextSession.id)).findLast(
                (message) => message.info.role === "assistant",
              ),
              reason,
              detail,
            })
        yield* ctx.metadata({ metadata: { ...metadata, workResult: workEvidence.value } })
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
        if (nextID === "backend" && completed?.info.role === "assistant") {
          workEvidence.value = BackendResult.assemble(completed)
          yield* ctx.metadata({ metadata: { ...metadata, workResult: workEvidence.value } })
        }
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
          yield* hostResult("interrupted", failure)
          return yield* Effect.fail(new Error(failure))
        }
        if (!completed) yield* hostResult("interrupted", "No completed child message to replay")
        const output = completed?.parts.findLast((part) => part.type === "text")?.text ?? ""
        const verified = yield* completion.verifiedCompletion(completionReceipt, nextSession.id)
        return {
          title: params.description,
          metadata: {
            ...metadata,
            ...(verified ? { completion: verified } : {}),
            ...(workEvidence.value ? { workResult: workEvidence.value } : {}),
          },
          output: renderOutput({ sessionID: nextSession.id, state: "completed", text: output }),
        }
      }

      const ops = ctx.extra?.promptOps as TaskPromptOps
      if (!ops) return yield* Effect.fail(new Error("TaskTool requires promptOps in ctx.extra"))

      const runTask = Effect.fn("TaskTool.runTask")(function* () {
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
        const parts = yield* ops.resolvePromptParts(params.prompt)
        const authorizationID = params.authorizationID
        const own = authorizationID
          ? yield* Effect.gen(function* () {
              const authorization = yield* readAuthorization(authorizationID)
              const validation = authorization ? yield* readValidation(authorization.validationRecordID) : undefined
              const context = validation?.contextRecordID ? yield* readContext(validation.contextRecordID) : undefined
              return context?.mode === "GROUNDED"
                ? context.skills.map((skill) => ({
                    type: "text" as const,
                    synthetic: true,
                    text: `<skill_content name="${skill.name}">\n${skill.content}\n</skill_content>`,
                  }))
                : []
            }).pipe(Effect.provideService(Database.Service, database))
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
        const result = yield* ops.prompt(
          {
            messageID: MessageID.ascending(),
            sessionID: nextSession.id,
            model: {
              modelID: model.modelID,
              providerID: model.providerID,
            },
            variant: next.model || explicitModel ? undefined : variant,
            agent: nextID,
            parts: [...parts, ...own],
          },
          beforeModel ? { beforeModel } : undefined,
        )
        // F4 cl.6: stream the work result before any failure below so the errored tool part keeps it.
        if (nextID === "backend") {
          workEvidence.value = BackendResult.assemble(result)
          yield* ctx.metadata({ metadata: { ...metadata, workResult: workEvidence.value } })
        }
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
          yield* ctx.metadata({
            metadata: {
              ...metadata,
              completion: verified,
              ...(workEvidence.value ? { workResult: workEvidence.value } : {}),
            },
          })
        }
        return result.parts.findLast((item) => item.type === "text")?.text ?? ""
      })

      const inject = Effect.fn("TaskTool.injectBackgroundResult")(function* (
        state: "completed" | "error",
        text: string,
      ) {
        const currentParent = yield* sessions.get(ctx.sessionID)
        // F4 cl.6/35: the Task part already completed with terminal `running`, so the completion notice carries the final
        // work result, read from the child's durable last assistant message (a resumed job may have run several turns).
        const last =
          nextID === "backend"
            ? (yield* MessageV2.stream(nextSession.id).pipe(Effect.provideService(Database.Service, database))).findLast(
                (message) => message.info.role === "assistant",
              )
            : undefined
        const workResult =
          nextID !== "backend"
            ? undefined
            : state === "error"
              ? BackendResult.hostEnded({ message: last, reason: "failed", detail: text })
              : last
                ? BackendResult.assemble(last)
                : BackendResult.hostEnded({ reason: "interrupted", detail: "No completed child message" })
        yield* ops
          .prompt({
            sessionID: ctx.sessionID,
            agent: currentParent.agent ?? ctx.agentID ?? ctx.agent,
            variant,
            parts: [
              {
                type: "text",
                synthetic: true,
                ...(workResult ? { metadata: { workResult } } : {}),
                text: renderOutput({
                  sessionID: nextSession.id,
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
        yield* hostResult("running", "Background task updated")
        return {
          title: params.description,
          metadata: {
            ...metadata,
            background: true,
            jobId: nextSession.id,
            ...(workEvidence.value ? { workResult: workEvidence.value } : {}),
          },
          output: renderOutput({
            sessionID: nextSession.id,
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
        yield* hostResult("running", "Background task started")
        return {
          title: params.description,
          metadata: {
            ...metadata,
            background: true,
            jobId: info.id,
            ...(workEvidence.value ? { workResult: workEvidence.value } : {}),
          },
          output: renderOutput({
            sessionID: nextSession.id,
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
              yield* hostResult("failed", failure)
              return yield* Effect.fail(new Error(failure))
            }
            if (result?.status === "cancelled") {
              yield* hostResult("interrupted", "Task cancelled")
              return yield* Effect.fail(new Error("Task cancelled"))
            }
            return {
              title: params.description,
              metadata: {
                ...metadata,
                ...(completionEvidence.value ? { completion: completionEvidence.value } : {}),
                ...(workEvidence.value ? { workResult: workEvidence.value } : {}),
              },
              output: renderOutput({ sessionID: nextSession.id, state: "completed", text: result?.output ?? "" }),
            }
          }),
        (_, exit) =>
          Effect.gen(function* () {
            if (!Exit.hasInterrupts(exit)) return
            yield* hostResult("interrupted", "Task cancelled").pipe(Effect.catchCause(() => Effect.void))
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
