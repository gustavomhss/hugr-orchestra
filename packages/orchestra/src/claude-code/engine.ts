export * as ClaudeCode from "./engine"

// Claude mode's single entry point. An agent with `engine: "claude-code"` runs its turns in Claude Code (Claude Agent
// SDK, signed in through Claude Code's own login) instead of Orchestra's loop. Claude Code keeps the loop, the model,
// its own tools and its own compaction; Orchestra contributes the agent prompt and instructions, read/edit/write, and
// every approval. Maestro opts in with its whole Orchestra toolset in-process (task included), under its own prompt
// (tools.ts). Each turn is mirrored into the Orchestra session (mirror.ts), so the UI, revert and the archive work as
// for any session. Orchestra's normal mode imports nothing from this directory but this file
// (test/claude-code/mode-boundary.test.ts). Design: specs/claude-code-engine.md.
import { Cause, Context, Effect, Layer, Option, Schema } from "effect"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Shell } from "@orchestra/core/shell"
import { FSUtil } from "@orchestra/core/fs-util"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { ModelV2 } from "@orchestra/core/model"
import { ModelsDev } from "@orchestra/core/models-dev"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { InstanceState } from "@/effect/instance-state"
import { Permission } from "@/permission"
import { Session } from "@/session/session"
import { PromptGuard } from "@/session/prompt-guard"
import { Instruction } from "@/session/instruction"
import { SystemPrompt } from "@/session/system"
import { MessageID, type SessionID } from "@/session/schema"
import { Snapshot } from "@/snapshot"
import { ToolRegistry } from "@/tool/registry"
import { approve } from "@/tool/shell/scan"
import type { Tool } from "@/tool/tool"
import type { TaskPromptOps } from "@/tool/task"
import { Provider } from "@/provider/provider"
import { SessionContinuity } from "@/continuity/service"
import { RequestSource } from "@/continuity/request-source"
import { marker } from "@/continuity/alias"
import { tokenCount, hardLimit } from "@/continuity/trigger"
import { estimate } from "@/continuity/masking"
import { ToolJsonSchema } from "@/tool/json-schema"
import { ClaudeCodeStore } from "./store"
import { ClaudeCodeTranscript } from "./transcript"
import { ClaudeCodeNative } from "./native"
import { ClaudeCodeSDK } from "./sdk"
import { create } from "./mirror"
import { ClaudeCodeTools, server, SERVER } from "./tools"
import { canUseTool, preToolUse } from "./permissions"

export interface Interface {
  /**
   * Run one turn when the user's agent is on Claude Code: everything the user sent since the last reply. False when the
   * agent runs on Orchestra's loop. The turn always ends with an assistant reply to `user` (with `error` when it
   * failed), so the loop's own exit check ends the run on its next pass. `promptOps` are the loop's own Task callbacks:
   * with them Maestro's `task` starts teammates exactly as on Orchestra's loop.
   */
  readonly turn: (input: { sessionID: SessionID; user: SessionV1.User; promptOps?: () => Effect.Effect<TaskPromptOps> }) => Effect.Effect<boolean>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/ClaudeCode") {}

const Metadata = Schema.Struct({ sessionId: Schema.optional(Schema.String), cost: Schema.optional(Schema.Number),
  model: Schema.optional(Schema.String), contextWindow: Schema.optional(Schema.Number), maxOutputTokens: Schema.optional(Schema.Number),
  selectedModel: Schema.optional(Schema.String), version: Schema.optional(Schema.String), continuityPaused: Schema.optional(Schema.NullOr(Schema.String)),
  nativeArchiveFailed: Schema.optional(Schema.Boolean), delivered: Schema.optional(Schema.Array(MessageID)),
  apiKeySource: Schema.optional(Schema.String) })

/**
 * Continuity in Claude mode is Claude Code's own auto-compaction; Orchestra runs no maintenance model call here and
 * leaves the session's Orchestra continuity paused. TODO(meta-harness PLAN.md §4.6, Phase 2): carry Orchestra's working
 * memory across a compaction with SDK `hooks` callbacks — `SessionStart` with source "compact" returns it as
 * `additionalContext`, and `PostCompact` archives Claude Code's summary for `context_recall`. Until then nothing re-enters
 * after a compaction except Claude Code's own summary.
 */
export const NATIVE_COMPACTION = "Claude mode: Claude Code's native compaction"

// Maestro's prompt rides on Claude Code's preset (sdk.ts preset), so it says up front that it governs.
const PRECEDENCE = "The instructions below are Maestro's. Where they differ from the Claude Code guidance above, follow them."

// Where the preset or Maestro's prompt describes other tools or Orchestra's loop, this engine differs.
const ENGINE_NOTE = [
  "You run on Claude Code. Orchestra's tools carry the `mcp__orchestra__` prefix (`task` is",
  "`mcp__orchestra__task`); Bash, Grep, Glob and the web tools are Claude Code's, under the same permissions. Claude Code's",
  "guidance on Task or Agent subagents, TodoWrite, Skill and AskUserQuestion names tools you do not have: delegate with",
  "`mcp__orchestra__task`, track work with `mcp__orchestra__todowrite`, load skills with `mcp__orchestra__skill` and ask",
  "the owner with `mcp__orchestra__question`. A message the owner writes while you work reaches you when your current turn",
  "ends, not at your next step.",
].join(" ")

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const sessions = yield* Session.Service
    const snapshot = yield* Snapshot.Service
    const permission = yield* Permission.Service
    const registry = yield* ToolRegistry.Service
    const instruction = yield* Instruction.Service
    const system = yield* SystemPrompt.Service
    const config = yield* Config.Service
    const sdk = yield* ClaudeCodeSDK.Service
    const continuity = yield* SessionContinuity.Service
    const provider = yield* Provider.Service
    const catalog = yield* ModelsDev.Service
    const fs = yield* FSUtil.Service
    const spawner = yield* ChildProcessSpawner

    const turn: Interface["turn"] = Effect.fn("ClaudeCode.turn")(function* (input) {
      const { sessionID } = input
      const session = yield* sessions.get(sessionID).pipe(Effect.orDie)
      const agent = yield* agents.get(input.user.agent).pipe(Effect.orElseSucceed(() => undefined))
      if (agent?.engine !== "claude-code") {
        if (session.metadata?.claudeCode) yield* continuity.release(sessionID)
        return false
      }
      const instance = yield* InstanceState.context
      const history = yield* sessions.messages({ sessionID }).pipe(Effect.orDie)
      const decoded = Schema.decodeUnknownOption(Metadata)(session.metadata?.claudeCode ?? {})
      const state = Option.isSome(decoded) ? decoded.value : {}
      const cfg = yield* config.get()
      const selected = input.user.model.providerID === "anthropic" ? input.user.model.modelID : undefined
      const shape = selected ? yield* provider.getModel(input.user.model.providerID, selected).pipe(Effect.catch(() =>
        catalog.get().pipe(Effect.map((models) => models.anthropic ? Provider.fromModelsDevProvider(models.anthropic).models[selected] : undefined)))) : undefined
      let admissionModel = shape && Number.isFinite(shape.limit.context) && shape.limit.context > 0 &&
        Number.isFinite(shape.limit.output) && shape.limit.output > 0 && hardLimit(shape) > 0 ? shape : undefined
      let nativeVersion = state.version
      let actualModel = state.model ?? selected
      let sdkModel: string | undefined
      let limits: { contextWindow?: number; maxOutputTokens?: number } = {}
      const metadata = (value: Record<string, unknown>) => Effect.gen(function* () {
        const latest = (yield* sessions.get(sessionID).pipe(Effect.orDie)).metadata ?? {}
        yield* sessions.setMetadata({ sessionID, metadata: { ...latest,
          claudeCode: { ...(ClaudeCodeTranscript.record(latest.claudeCode) ? latest.claudeCode : {}), ...value } } })
      })
      // Records the model's limits for the pre-spawn admission check. Continuity stays Claude Code's (NATIVE_COMPACTION).
      const configure = (model: string | undefined, window: number | undefined, output: number | undefined) => Effect.gen(function* () {
        if (model && window !== undefined && output !== undefined && Number.isFinite(window) && Number.isFinite(output))
          yield* metadata({ model, selectedModel: selected, contextWindow: window, maxOutputTokens: output })
        if (shape && model && window && output && Number.isFinite(window) && Number.isFinite(output) && output < window)
          admissionModel = { ...shape, id: ModelV2.ID.make(model), api: { ...shape.api, id: model }, limit: { ...shape.limit, context: window, output } }
        yield* continuity.pause(sessionID)
        yield* metadata({ ...(nativeVersion ? { version: nativeVersion } : {}), continuityPaused: NATIVE_COMPACTION })
      })
      const context = yield* Effect.context<never>()
      const abort = new AbortController()
      const callbacks = new Set<Promise<unknown>>()
      const run = <A>(effect: Effect.Effect<A, unknown>) => {
        const promise = Effect.runPromiseWith(context)(effect, { signal: abort.signal })
        callbacks.add(promise)
        promise.then(() => callbacks.delete(promise), () => callbacks.delete(promise))
        return promise
      }

      // Legacy SDK turns had no cursor. Creation order is not delivery order: a queued user can precede a late reply.
      const answered = state.delivered === undefined && state.sessionId ? Math.max(-1, ...history.flatMap((message) => {
        if (message.info.role !== "assistant" || message.info.time.completed === undefined || message.info.error) return []
        const parent = message.info.parentID
        return [history.findIndex((user) => user.info.role === "user" && user.info.id === parent)]
      })) : -1
      const delivered = new Set(state.delivered ?? history.slice(0, answered + 1).flatMap((message) => message.info.role === "user" ? [message.info.id] : []))
      // A background teammate's result arrives as a synthetic task return: it is the delegating agent's input too.
      const users = history.filter((message) => (RequestSource.actual(message) ||
        message.parts.some((part) => marker(part)?.type === "task-return")) && !delivered.has(message.info.id))
      const userIDs = users.map((message) => message.info.id)
      let prompt = ClaudeCodeTranscript.hostPrompt(users)
      const ruleset = Permission.merge(agent.permission, session.permission ?? [])
      // The agent's toolset as Orchestra's loop resolves it: same registry, permissions and per-message switches.
      const available = (yield* registry.tools({ providerID: input.user.model.providerID, modelID: input.user.model.modelID,
        agent, permission: session.permission })).filter((def) => input.user.tools?.[def.id] !== false)
      const defs = ClaudeCodeTools.served(agent, available)
      const builtins = ClaudeCodeTools.builtins(agent, available)
      const promptOps = input.promptOps ? yield* input.promptOps() : undefined
      const bypassAgentCheck = history.findLast((message) => message.info.role === "user")?.parts.some((part) => part.type === "agent") ?? false
      const canRecall = defs.some((def) => def.id === "context_recall") && Permission.evaluate("context_recall", sessionID, ruleset).action !== "deny"
      let persistenceFailed = false
      const handoff = (ids: readonly MessageID[]) => Effect.gen(function* () {
        ids.forEach((id) => delivered.add(id))
        yield* metadata({ delivered: [...delivered] })
      })
      const native = ClaudeCodeStore.create({ sessionID, fs, sessions, continuity, run, userID: userIDs.at(-1), userIDs, canRecall,
        // Claude Code resumes its own transcript; Orchestra's continuity view is never swapped in (NATIVE_COMPACTION).
        rewrite: () => false,
        diagnostic: (reason) => metadata({ transcriptView: reason }),
        onFailure: () => Effect.sync(() => { persistenceFailed = true }), onDelivery: handoff })
      const view = create({ sessionID, user: input.user, agent, path: { cwd: instance.directory, root: instance.worktree },
        sessions, snapshot, record: native.record })
      if (state.nativeArchiveFailed) {
        yield* continuity.pause(sessionID)
        yield* view.fail({ aborted: false, message: "Claude Code native transcript persistence failed; SDK resume is blocked until its archive is repaired." })
        return true
      }
      if (!prompt) {
        yield* view.fail({ aborted: false, message: "Claude Code receives text only; this message has no text." })
        return true
      }
      if (!state.sessionId) yield* sessions.setTitle({ sessionID, title: prompt.split("\n")[0].slice(0, 80) })

      const toolContext = (part: { messageID: MessageID; callID: string } | undefined, abort: AbortSignal): Tool.Context => {
        const messageID = part?.messageID ?? view.current()?.id ?? MessageID.ascending()
        const callID = part?.callID
        return {
          sessionID, messageID, callID, agent: agent.name, agentID: agent.id, abort, messages: history,
          extra: { claudeCode: true, canRecall, promptOps, bypassAgentCheck },
          metadata: (value) => Effect.gen(function* () {
            const current = callID ? view.tool(callID) : undefined
            if (!current || current.state.status !== "running") return
            yield* view.complete({ ...current, state: { ...current.state, title: value.title ?? current.state.title,
              metadata: { ...current.state.metadata, ...value.metadata } } })
          }),
          ask: (request) => permission.ask({ ...request, sessionID, ...(callID ? { tool: { messageID, callID } } : {}), ruleset })
            .pipe(Effect.orDie),
        }
      }

      const shell = Shell.acceptable(cfg.shell)
      const toolRun = run
      const claim = (tool: string) => Effect.gen(function* () {
        // Claude Code may call the tool before the mirror has seen its tool_use block: wait for it.
        for (let round = 0; round < 1500; round++) {
          const part = view.claim(tool)
          if (part) return part
          yield* Effect.sleep("20 millis")
        }
        return yield* Effect.die(new Error(`no ${tool} call to run`))
      })
      const gate = { run: toolRun, context: (toolUseID: string) => toolContext(view.tool(toolUseID), abort.signal),
        shell: (ctx: Tool.Context, command: string) => approve(ctx, { command, cwd: instance.directory, shell }).pipe(
          Effect.provideService(FSUtil.Service, fs), Effect.provideService(ChildProcessSpawner, spawner), Effect.asVoid) }
      const instructions = yield* instruction.system().pipe(Effect.orElseSucceed(() => [] as string[]))
      // Every agent appends to Claude Code's preset, which a turn on the login must keep (sdk.ts preset). Maestro's text
      // claims precedence over the preset and carries what Orchestra's loop sends beside it (environment, instructions,
      // skills).
      const conductor = ClaudeCodeTools.conductor(agent)
      const append = (conductor
        ? [PRECEDENCE, agent.prompt, ENGINE_NOTE, ...(shape ? yield* system.environment(shape) : []), ...instructions, yield* system.skills(agent)]
        : [agent.prompt, ...instructions]).filter(Boolean).join("\n\n") || undefined
      const prepare = Effect.gen(function* () {
      const stored = yield* native.read
      const key = stored.keys.find((item) => !item.key.subpath && item.key.sessionId === state.sessionId)?.key
      if (state.sessionId && !key)
        return yield* Effect.fail(new Error("Claude Code native archive unavailable; legacy SDK resume is blocked until a complete native archive is imported."))
      yield* configure(state.selectedModel === selected ? state.model : undefined, state.contextWindow, state.maxOutputTokens)
      stored.delivered.forEach((id) => delivered.add(MessageID.make(id)))
      const remaining = users.filter((message) => !delivered.has(message.info.id))
      userIDs.splice(0, userIDs.length, ...remaining.map((message) => message.info.id))
      prompt = ClaudeCodeTranscript.hostPrompt(remaining)
      if (!prompt) return yield* Effect.fail(new Error("Claude Code has no undelivered prompt to admit; previously handed inputs were not resent."))
       const materialized = key ? yield* native.prepare(key) : undefined
       const reason = materialized?.reason ?? "first-turn"
       const nativeFallback = materialized?.kind === "fallback"
       const system = materialized && ClaudeCodeNative.overhead(materialized.entries)
       // Unknown CLI overhead prevents an exact budget, but known payload alone can already exceed the limit.
        const tokens = estimate(materialized?.entries ?? []) + estimate(prompt) + estimate({ system, append,
         tools: defs.map((def) => ({ name: def.id, description: def.description, schema: ToolJsonSchema.fromTool(def) })) })
       const last = history.findLast((message) => message.info.role === "assistant")?.info
       yield* metadata({ nativeAdmission: { ready: !!admissionModel && tokens < hardLimit(admissionModel), reason, tokens,
         bounded: !!system && !!admissionModel, priorActual: last?.role === "assistant" ? tokenCount(last.tokens) : 0,
         limit: admissionModel && hardLimit(admissionModel), nativeFallback } })
       if (admissionModel && tokens >= hardLimit(admissionModel))
         return yield* Effect.fail(new Error("Claude Code native admission blocked before spawn: authoritative native payload exceeds hard limit"))
       return materialized
      })

      const options = {
        cwd: instance.directory,
        model: selected,
        resume: state.sessionId,
        systemPrompt: ClaudeCodeSDK.preset(append),
        ...(builtins ? { tools: builtins } : {}),
        disallowedTools: ["Read", "Edit", "Write", "NotebookEdit", "Task"],
        toolAliases: { Read: `mcp__${SERVER}__read`, Edit: `mcp__${SERVER}__edit`, Write: `mcp__${SERVER}__write` },
        mcpServers: { [SERVER]: server({ defs, run: toolRun, claim, complete: view.complete,
          messages: () => sessions.messages({ sessionID }).pipe(Effect.orDie),
          context: (part) => toolContext(part, abort.signal) }) },
        // Orchestra is the only policy: no Claude Code settings (their allow rules would approve calls Orchestra never
        // sees), and every call goes through Orchestra before Claude Code's own permission logic.
        settingSources: [],
        hooks: { PreToolUse: preToolUse(gate) },
        canUseTool: canUseTool(gate),
        includePartialMessages: true,
        abortController: abort,
        // No `settings` override: Claude Code's own auto-compaction keeps the session's continuity (NATIVE_COMPACTION).
        sessionStore: native.store,
      }

      const outcome = yield* Effect.gen(function* () {
           // Same seam as LLM.stream: the caller's pre-model guard runs once before any SDK process (compaction included).
           yield* PromptGuard.check(sessionID)
           const materialized = yield* prepare
           // New SDK sessions must never fall into the legacy assistant-based delivery inference.
           if (!state.sessionId && state.delivered === undefined) yield* metadata({ delivered: [] })
           const env = yield* ClaudeCodeSDK.Environment
           const lifetime = ClaudeCodeSDK.processLifetime({ ...options, env,
             sessionStore: { ...options.sessionStore, load: async (key) => {
               if (materialized && key.sessionId === materialized.key.sessionId && key.projectKey === materialized.key.projectKey && !key.subpath)
                 return structuredClone(materialized.entries)
               return native.store.load(key)
             } },
           })
            const join = Effect.promise(lifetime.join).pipe(Effect.ensuring(Effect.promise(async () => {
              while (callbacks.size) await Promise.allSettled([...callbacks])
            })))
           // query() can throw after spawning; register ownership before construction.
           yield* Effect.addFinalizer(() => Effect.sync(() => abort.abort()).pipe(Effect.andThen(join)))
           const query = yield* Effect.acquireRelease(Effect.sync(() => sdk.query({ prompt, options: lifetime.options })), (query) => Effect.gen(function* () {
             abort.abort()
             yield* Effect.sync(() => query.close?.())
             yield* Effect.tryPromise({ try: () => query.return(undefined), catch: (error) => error }).pipe(Effect.orDie)
           }).pipe(Effect.ensuring(join)))
          while (true) {
            const next = yield* Effect.tryPromise({ try: () => query.next(), catch: (error) => error })
            if (next.done) break
            const message = next.value
            if (message.type === "system" && message.subtype === "mirror_error") {
              persistenceFailed = true
              return yield* Effect.fail(new Error("Claude Code native transcript persistence failed; SDK resume is blocked until its archive is repaired."))
            }
            // Sign-in status comes only from the documented init frame; Orchestra never reads Claude Code's credentials.
            if (message.type === "system" && message.subtype === "init" &&
              (message.session_id !== state.sessionId || message.apiKeySource !== state.apiKeySource))
              yield* metadata({ sessionId: message.session_id, apiKeySource: message.apiKeySource })
            if (message.type === "system" && message.subtype === "init") sdkModel = message.model
             if (message.type === "assistant" && !message.parent_tool_use_id && message.message.model) actualModel = message.message.model
            if (ClaudeCodeSDK.signedOut(message)) throw new Error(ClaudeCodeSDK.SIGNED_OUT)
            if (message.type === "assistant" && message.error === "billing_error") {
              const detail = "billing_error: " + message.message.content.flatMap((block) => block.type === "text" ? [block.text] : []).join(" ")
              throw new Error(ClaudeCodeSDK.billingRejection(detail) ?? detail)
            }
            if (message.type === "assistant" && message.supersedes?.length) {
              yield* native.retract(message.supersedes)
              yield* view.retract(message.supersedes)
              yield* continuity.invalidate(sessionID)
            }
            if (message.type === "system" && message.subtype === "model_refusal_fallback" && message.retracted_message_uuids?.length) {
              yield* native.retract(message.retracted_message_uuids)
              yield* view.retract(message.retracted_message_uuids)
              yield* continuity.invalidate(sessionID)
            }
            yield* view.on(message)
            if (message.type === "result") {
              if (message.subtype !== "success" || message.is_error) {
                const detail = "errors" in message && message.errors?.length ? message.errors.join("; ") : "result" in message ? message.result : message.subtype
                throw new Error(ClaudeCodeSDK.billingRejection(detail) ?? "Claude Code query failed (native overflow is not retried): " + detail)
              }
              const usage = message.modelUsage?.[actualModel ?? ""] ?? message.modelUsage?.[sdkModel ?? ""] ??
                message.modelUsage?.[selected ?? ""] ?? Object.values(message.modelUsage ?? {}).find((usage) =>
                  usage.canonicalModel !== undefined && [actualModel, sdkModel, selected].includes(usage.canonicalModel))
              limits = usage ?? {}
              yield* configure(actualModel, usage?.contextWindow, usage?.maxOutputTokens)
            }
          }
          const stored = yield* native.read
          nativeVersion = ClaudeCodeTranscript.version(stored.keys.filter((item) => !item.key.subpath).flatMap((item) => item.entries))
          yield* configure(actualModel, limits.contextWindow, limits.maxOutputTokens)
          const { cost } = yield* view.finish(state.cost ?? 0)
          yield* metadata({ cost })
      }).pipe(Effect.scoped,
        Effect.as(true),
        Effect.onInterrupt(() => Effect.gen(function* () {
          abort.abort()
          yield* continuity.cancel(sessionID)
          if (persistenceFailed) yield* metadata({ nativeArchiveFailed: true, continuityPaused: "Native transcript persistence failed" })
          yield* view.fail({ aborted: true, message: "The owner stopped the turn." })
        })),
        Effect.catchCause((cause) => Cause.hasInterruptsOnly(cause) ? Effect.interrupt
          : Effect.gen(function* () {
            yield* continuity.pause(sessionID)
            if (persistenceFailed) yield* metadata({ nativeArchiveFailed: true, continuityPaused: "Native transcript persistence failed" })
            const error = Cause.squash(cause)
            const message = persistenceFailed ? "Claude Code native transcript persistence failed; SDK resume is blocked until its archive is repaired." : error instanceof Error ? error.message : String(error)
            yield* view.fail({ aborted: false, message })
            return false
          })),
      )
      if (!outcome) yield* continuity.cancel(sessionID)
      return true
    })

    return Service.of({ turn })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [Agent.node, Session.node, Snapshot.node, Permission.node, ToolRegistry.node, Instruction.node, SystemPrompt.node, Config.node,
    FSUtil.node, CrossSpawnSpawner.node, ClaudeCodeSDK.node, SessionContinuity.node, Provider.node, ModelsDev.node],
})
