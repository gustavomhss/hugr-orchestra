export * as ClaudeCode from "./engine"

// Claude Code as an engine: an agent with `engine: "claude-code"` runs its turns in Claude Code (Claude Agent SDK, the
// machine's Claude Code login) instead of Orchestra's loop. Claude Code keeps the loop, the model and its own tools;
// Orchestra contributes the agent prompt and instructions, read/edit/write, and every approval. Each turn is mirrored
// into the Orchestra session (mirror.ts), so the UI, revert and the archive work as for any session.
// Design: specs/claude-code-engine.md.
import { Cause, Context, Effect, Layer, Option, Schema } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Shell } from "@opencode-ai/core/shell"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { ModelV2 } from "@opencode-ai/core/model"
import { ModelsDev } from "@opencode-ai/core/models-dev"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { InstanceState } from "@/effect/instance-state"
import { Permission } from "@/permission"
import { Session } from "@/session/session"
import { Instruction } from "@/session/instruction"
import { MessageID, type SessionID } from "@/session/schema"
import { Snapshot } from "@/snapshot"
import { ToolRegistry } from "@/tool/registry"
import { approve } from "@/tool/shell/scan"
import type { Tool } from "@/tool/tool"
import { Provider } from "@/provider/provider"
import { SessionContinuity } from "@/continuity/service"
import { RequestSource } from "@/continuity/request-source"
import { settings, tokenCount, hardLimit } from "@/continuity/trigger"
import { estimate } from "@/continuity/masking"
import { ToolJsonSchema } from "@/tool/json-schema"
import { ClaudeCodeStore } from "./store"
import { ClaudeCodeLLM } from "./llm"
import { ClaudeCodeTranscript } from "./transcript"
import { ClaudeCodeNative } from "./native"
import { ClaudeCodeSDK } from "./sdk"
import { create } from "./mirror"
import { server, SERVER } from "./tools"
import { canUseTool, preToolUse } from "./permissions"

export interface Interface {
  /**
   * Run one turn when the user's agent is on Claude Code: everything the user sent since the last reply. False when the
   * agent runs on Orchestra's loop. The turn always ends with an assistant reply to `user` (with `error` when it
   * failed), so the loop's own exit check ends the run on its next pass.
   */
  readonly turn: (input: { sessionID: SessionID; user: SessionV1.User }) => Effect.Effect<boolean>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ClaudeCode") {}

const Metadata = Schema.Struct({ sessionId: Schema.optional(Schema.String), cost: Schema.optional(Schema.Number),
  model: Schema.optional(Schema.String), contextWindow: Schema.optional(Schema.Number), maxOutputTokens: Schema.optional(Schema.Number),
  selectedModel: Schema.optional(Schema.String), version: Schema.optional(Schema.String), continuityPaused: Schema.optional(Schema.NullOr(Schema.String)),
  nativeArchiveFailed: Schema.optional(Schema.Boolean), delivered: Schema.optional(Schema.Array(MessageID)) })

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const sessions = yield* Session.Service
    const snapshot = yield* Snapshot.Service
    const permission = yield* Permission.Service
    const registry = yield* ToolRegistry.Service
    const instruction = yield* Instruction.Service
    const config = yield* Config.Service
    const sdk = yield* ClaudeCodeSDK.Service
    const continuity = yield* SessionContinuity.Service
    const provider = yield* Provider.Service
    const catalog = yield* ModelsDev.Service
    const fs = yield* FSUtil.Service
    const spawner = yield* ChildProcessSpawner
    const backend = ClaudeCodeLLM.create(sdk)

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
       let effective: Provider.Model | undefined
       let admissionModel: Provider.Model | undefined
      let nativeVersion = state.version
      let actualModel = state.model ?? selected
      let sdkModel: string | undefined
      let limits: { contextWindow?: number; maxOutputTokens?: number } = {}
      let overheadKnown = false
      const metadata = (value: Record<string, unknown>) => Effect.gen(function* () {
        const latest = (yield* sessions.get(sessionID).pipe(Effect.orDie)).metadata ?? {}
        yield* sessions.setMetadata({ sessionID, metadata: { ...latest,
          claudeCode: { ...(ClaudeCodeTranscript.record(latest.claudeCode) ? latest.claudeCode : {}), ...value } } })
      })
      const configure = (model: string | undefined, window: number | undefined, output: number | undefined) => Effect.gen(function* () {
        const reason = !settings(cfg).enabled ? "disabled" : !ClaudeCodeTranscript.SUPPORTED.includes(nativeVersion ?? "")
          ? `Claude Code ${nativeVersion ?? "unknown"} not yet supported` : !shape || !model || !Number.isFinite(window) ||
            !Number.isFinite(output) || !window || window <= 0 || !output || output <= 0 || output >= window
            ? "SDK model/window metadata unavailable" : !overheadKnown ? "SDK system/tool snapshot unavailable; native compaction enabled" : undefined
         if (model && window !== undefined && output !== undefined && Number.isFinite(window) && Number.isFinite(output))
           yield* metadata({ model, selectedModel: selected, contextWindow: window, maxOutputTokens: output })
         admissionModel = shape && model && window && output && Number.isFinite(window) && Number.isFinite(output) && output < window
           ? { ...shape, id: ModelV2.ID.make(model), api: { ...shape.api, id: model }, limit: { context: window, output } } : undefined
        if (reason) {
          effective = undefined
          yield* continuity.pause(sessionID)
          yield* metadata({ ...(nativeVersion ? { version: nativeVersion } : {}), continuityPaused: reason })
          return
        }
        if (!shape || !model || window === undefined || output === undefined) return
        const resolved = { ...shape, id: ModelV2.ID.make(model), api: { ...shape.api, id: model }, limit: { context: window, output } }
        effective = resolved
        yield* continuity.configure({ sessionID, model: resolved, llm: backend })
        yield* metadata({ model, selectedModel: selected, contextWindow: window, maxOutputTokens: output, version: nativeVersion, continuityPaused: null })
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
       const users = history.filter((message) => RequestSource.actual(message) && !delivered.has(message.info.id))
      const userIDs = users.map((message) => message.info.id)
      let prompt = users
        .flatMap((message) => message.parts.flatMap((part) => part.type === "text" && !part.ignored ? [part.text] : []))
        .join("\n\n").trim()
      const ruleset = Permission.merge(agent.permission, session.permission ?? [])
      const defs = (yield* registry.tools({ providerID: input.user.model.providerID, modelID: input.user.model.modelID,
        agent, permission: session.permission })).filter((def) => ["read", "edit", "write", "context_recall", "context_compact"].includes(def.id))
      const canRecall = defs.some((def) => def.id === "context_recall") && Permission.evaluate("context_recall", sessionID, ruleset).action !== "deny"
      let persistenceFailed = false
      const handoff = (ids: readonly MessageID[]) => Effect.gen(function* () {
        ids.forEach((id) => delivered.add(id))
        yield* metadata({ delivered: [...delivered] })
      })
      const native = ClaudeCodeStore.create({ sessionID, fs, sessions, continuity, run, userID: userIDs.at(-1), userIDs, canRecall,
        rewrite: () => effective !== undefined,
        diagnostic: (reason) => metadata({ transcriptView: reason }),
        onFailure: () => Effect.sync(() => { persistenceFailed = true }), onDelivery: handoff })
      const view = create({ sessionID, user: input.user, agent, path: { cwd: instance.directory, root: instance.worktree },
        sessions, snapshot, record: native.record,
        onStep: (message) => effective ? continuity.start({ sessionID, message, canRecall }) : Effect.void })
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
          extra: { claudeCode: true, canRecall },
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
          Effect.provideService(FSUtil.Service, fs), Effect.provideService(ChildProcessSpawner, spawner)) }
      const instructions = yield* instruction.system().pipe(Effect.orElseSucceed(() => [] as string[]))
      const prepare = Effect.gen(function* () {
      const stored = yield* native.read
      overheadKnown = !!ClaudeCodeNative.overhead(ClaudeCodeNative.fold(stored.keys.filter((item) => !item.key.subpath).flatMap((item) => item.entries)))
      yield* configure(state.selectedModel === selected ? state.model : undefined, state.contextWindow, state.maxOutputTokens)
      stored.delivered.forEach((id) => delivered.add(MessageID.make(id)))
      const remaining = users.filter((message) => !delivered.has(message.info.id))
      userIDs.splice(0, userIDs.length, ...remaining.map((message) => message.info.id))
      prompt = remaining.flatMap((message) => message.parts.flatMap((part) => part.type === "text" && !part.ignored ? [part.text] : [])).join("\n\n").trim()
      if (!prompt) return yield* Effect.fail(new Error("Claude Code has no undelivered prompt to admit; previously handed inputs were not resent."))
      if (effective && state.sessionId) {
        const last = history.findLast((message) => message.info.role === "assistant")?.info
        const result = yield* continuity.compact({ sessionID, canRecall,
          force: last?.role === "assistant" && tokenCount(last.tokens) >= hardLimit(effective) }).pipe(
            Effect.onInterrupt(() => Effect.gen(function* () {
              abort.abort()
              yield* continuity.cancel(sessionID)
              yield* view.fail({ aborted: true, message: "The user stopped the turn." })
            })))
        if (result === "over") {
          yield* view.fail({ aborted: false, message: "Claude Code continuity remains over the hard limit; next query was not started." })
          return yield* Effect.fail(new Error("Claude Code continuity remains over the hard limit; next query was not started."))
        }
      }
      const key = stored.keys.find((item) => !item.key.subpath && item.key.sessionId === state.sessionId)?.key
      if (state.sessionId && !key && stored.keys.length) return yield* Effect.fail(new Error("Claude Code native session key is unavailable"))
       const materialized = key ? yield* native.prepare(key, { admit: true, model: effective }) : undefined
      if (effective && state.sessionId) {
         if (materialized?.kind === "fallback") {
          effective = undefined
          yield* continuity.pause(sessionID)
          yield* metadata({ continuityPaused: `Native replay ${materialized.reason}; native compaction enabled` })
           const fallback = key ? yield* native.prepare(key) : undefined
           const tokens = (fallback?.tokens ?? 0) + estimate(prompt) + estimate({ system: fallback && ClaudeCodeNative.overhead(fallback.entries),
             tools: defs.map((def) => ({ name: def.id, description: def.description, schema: ToolJsonSchema.fromTool(def) })) })
           yield* metadata({ nativeAdmission: { ready: !!admissionModel && tokens < hardLimit(admissionModel), reason: materialized.reason, tokens,
             limit: admissionModel && hardLimit(admissionModel), nativeFallback: true } })
           if (admissionModel && tokens >= hardLimit(admissionModel))
             return yield* Effect.fail(new Error("Claude Code native admission blocked before spawn: authoritative native payload exceeds hard limit"))
           return fallback
        }
        const last = history.findLast((message) => message.info.role === "assistant")?.info
        const actual = last?.role === "assistant" ? tokenCount(last.tokens) : 0
        const system = materialized ? ClaudeCodeNative.overhead(materialized.entries) : undefined
        const overhead = estimate({ system, tools: defs.map((def) => ({ name: def.id,
          description: def.description, schema: ToolJsonSchema.fromTool(def) })) })
        const tokens = (materialized?.tokens ?? Infinity) + estimate(prompt) + overhead
        yield* metadata({ nativeAdmission: { ready: materialized?.ready === true, reason: materialized?.reason ?? "missing-native-view", tokens,
          bounded: !!system, priorActual: actual, limit: hardLimit(effective) } })
        if (!system) {
          overheadKnown = false
          effective = undefined
          yield* continuity.pause(sessionID)
          yield* metadata({ continuityPaused: "SDK system/tool snapshot unavailable; native compaction enabled" })
          return key ? yield* native.prepare(key) : undefined
        }
        if (!materialized?.ready || tokens >= hardLimit(effective))
          return yield* Effect.fail(new Error(`Claude Code native admission blocked before spawn: ${materialized?.reason ?? "missing-native-view"}; exact native view is over or cannot be bounded under the hard limit.`))
       }
       if (!effective && admissionModel && (materialized?.tokens ?? 0) + estimate(prompt) >= hardLimit(admissionModel))
         return yield* Effect.fail(new Error("Claude Code native admission blocked before spawn: authoritative native payload exceeds hard limit"))
       return materialized
      })

      const options = {
        cwd: instance.directory,
        model: selected,
        resume: state.sessionId,
        systemPrompt: { type: "preset" as const, preset: "claude_code" as const,
          append: [agent.prompt, ...instructions].filter(Boolean).join("\n\n") || undefined, snapshot: true },
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
        settings: { autoCompactEnabled: !effective },
        sessionStore: {
          ...native.store,
          append: async (key: Parameters<typeof native.store.append>[0], entries: Parameters<typeof native.store.append>[1]) => {
            await native.store.append(key, entries)
            if (key.subpath) return
            const version = ClaudeCodeTranscript.version(entries)
            if (version) nativeVersion = version
            if (nativeVersion && !ClaudeCodeTranscript.SUPPORTED.includes(nativeVersion)) {
              await run(continuity.pause(sessionID))
              effective = undefined
              await run(metadata({ version: nativeVersion, continuityPaused: `Claude Code ${nativeVersion} not yet supported` }))
            }
          },
        },
      }

      const outcome = yield* Effect.gen(function* () {
          const materialized = yield* prepare
          options.settings.autoCompactEnabled = !effective
          const query = yield* Effect.acquireRelease(Effect.sync(() => sdk.query({ prompt, options: { ...options,
            sessionStore: { ...options.sessionStore, load: async (key) => {
              if (materialized && key.sessionId === materialized.key.sessionId && key.projectKey === materialized.key.projectKey && !key.subpath)
                return structuredClone(materialized.entries)
              return native.store.load(key)
            } },
          } })), (query) => Effect.gen(function* () {
            abort.abort()
            query.close?.()
            yield* Effect.tryPromise({ try: () => query.return(undefined), catch: (error) => error }).pipe(Effect.ensuring(Effect.promise(async () => {
              while (callbacks.size) await Promise.allSettled([...callbacks])
            })), Effect.orDie)
          }))
          while (true) {
            const next = yield* Effect.tryPromise({ try: () => query.next(), catch: (error) => error })
            if (next.done) break
            const message = next.value
            if (message.type === "system" && message.subtype === "mirror_error") {
              effective = undefined
              persistenceFailed = true
              return yield* Effect.fail(new Error("Claude Code native transcript persistence failed; SDK resume is blocked until its archive is repaired."))
            }
            if (message.type === "system" && message.subtype === "init" && message.session_id !== state.sessionId)
              yield* metadata({ sessionId: message.session_id })
            if (message.type === "system" && message.subtype === "init") sdkModel = message.model
            if (message.type === "assistant" && !message.parent_tool_use_id && message.message.model) actualModel = message.message.model
            if (message.type === "assistant" && !message.parent_tool_use_id) yield* handoff(userIDs)
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
              if (message.subtype !== "success" || message.is_error)
                throw new Error("Claude Code query failed (native overflow is not retried): " +
                  ("errors" in message && message.errors?.length ? message.errors.join("; ") : "result" in message ? message.result : message.subtype))
              const usage = message.modelUsage?.[actualModel ?? ""] ?? message.modelUsage?.[sdkModel ?? ""] ??
                message.modelUsage?.[selected ?? ""] ?? Object.values(message.modelUsage ?? {}).find((usage) =>
                  usage.canonicalModel !== undefined && [actualModel, sdkModel, selected].includes(usage.canonicalModel))
              limits = usage ?? {}
              yield* configure(actualModel, usage?.contextWindow, usage?.maxOutputTokens)
            }
          }
          const stored = yield* native.read
          overheadKnown = !!ClaudeCodeNative.overhead(ClaudeCodeNative.fold(stored.keys.filter((item) => !item.key.subpath).flatMap((item) => item.entries)))
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
          yield* view.fail({ aborted: true, message: "The user stopped the turn." })
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
  deps: [Agent.node, Session.node, Snapshot.node, Permission.node, ToolRegistry.node, Instruction.node, Config.node,
    FSUtil.node, CrossSpawnSpawner.node, ClaudeCodeSDK.node, SessionContinuity.node, Provider.node, ModelsDev.node],
})
