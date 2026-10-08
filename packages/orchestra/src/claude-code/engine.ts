export * as ClaudeCode from "./engine"

// Claude Code as an engine: an agent with `engine: "claude-code"` runs its turns in Claude Code (Claude Agent SDK, the
// machine's Claude Code login) instead of Orchestra's loop. Claude Code keeps the loop, the model and its own tools;
// Orchestra contributes the agent prompt and instructions, read/edit/write, and every approval. Each turn is mirrored
// into the Orchestra session (mirror.ts), so the UI, revert and the archive work as for any session.
// Design: specs/claude-code-engine.md.
import { Cause, Context, Effect, Layer } from "effect"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Shell } from "@orchestra/core/shell"
import { FSUtil } from "@orchestra/core/fs-util"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { InstanceState } from "@/effect/instance-state"
import { Permission } from "@/permission"
import { Session } from "@/session/session"
import { Instruction } from "@/session/instruction"
import { MessageID, type SessionID } from "@/session/schema"
import { Snapshot } from "@/snapshot"
import { ToolRegistry } from "@/tool/registry"
import * as ShellScan from "@/tool/shell/scan"
import type * as Tool from "@/tool/tool"
import { ClaudeCodeSDK } from "./sdk"
import { create as mirror } from "./mirror"
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

export class Service extends Context.Service<Service, Interface>()("@orchestra/ClaudeCode") {}

type Metadata = { sessionId?: string; cost?: number }

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
    const fs = yield* FSUtil.Service
    const spawner = yield* ChildProcessSpawner

    const turn: Interface["turn"] = Effect.fn("ClaudeCode.turn")(function* (input) {
      const { sessionID } = input
      const session = yield* sessions.get(sessionID).pipe(Effect.orDie)
      const agent = yield* agents.get(input.user.agent).pipe(Effect.orElseSucceed(() => undefined))
      if (agent?.engine !== "claude-code") return false
      const instance = yield* InstanceState.context
      const history = yield* sessions.messages({ sessionID }).pipe(Effect.orDie)
      const state = (session.metadata?.claudeCode ?? {}) as Metadata

      // Everything the user sent since the last reply, in order: prompts queued while a turn ran are one prompt here.
      const after = history.findLastIndex((message) => message.info.role === "assistant")
      const prompt = history.slice(after + 1).filter((message) => message.info.role === "user")
        .flatMap((message) => message.parts.flatMap((part) => part.type === "text" && !part.ignored ? [part.text] : []))
        .join("\n\n").trim()
      const ruleset = Permission.merge(agent.permission, session.permission ?? [])
      const view = mirror({ sessionID, user: input.user, agent, path: { cwd: instance.directory, root: instance.worktree },
        sessions, snapshot })
      if (!prompt) {
        yield* view.fail({ aborted: false, message: "Claude Code receives text only; this message has no text." })
        return true
      }
      if (!state.sessionId) yield* sessions.setTitle({ sessionID, title: prompt.split("\n")[0].slice(0, 80) })
      const context = yield* Effect.context<never>()
      const run = <A>(effect: Effect.Effect<A, unknown, any>) => Effect.runPromiseWith(context)(effect as Effect.Effect<A, unknown, never>)

      const toolContext = (part: { messageID: MessageID; callID: string } | undefined, abort: AbortSignal): Tool.Context => {
        const messageID = part?.messageID ?? view.current()?.id ?? MessageID.ascending()
        const callID = part?.callID
        return {
          sessionID, messageID, callID, agent: agent.name, agentID: agent.id, abort, messages: history, extra: {},
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

      const cfg = yield* config.get()
      const shell = Shell.acceptable(cfg.shell)
      const abort = new AbortController()
      const defs = (yield* registry.all()).filter((def) => ["read", "edit", "write"].includes(def.id))
      const claim = (tool: string) => Effect.gen(function* () {
        // Claude Code may call the tool before the mirror has seen its tool_use block: wait for it.
        for (let round = 0; round < 1500; round++) {
          const part = view.claim(tool)
          if (part) return part
          yield* Effect.sleep("20 millis")
        }
        return yield* Effect.die(new Error(`no ${tool} call to run`))
      })
      const gate = { run, context: (toolUseID: string) => toolContext(view.tool(toolUseID), abort.signal),
        shell: (ctx: Tool.Context, command: string) => ShellScan.approve(ctx, { command, cwd: instance.directory, shell }).pipe(
          Effect.provideService(FSUtil.Service, fs), Effect.provideService(ChildProcessSpawner, spawner)) }
      const instructions = yield* instruction.system().pipe(Effect.orElseSucceed(() => [] as string[]))
      const model = input.user.model.providerID === "anthropic" ? input.user.model.modelID : undefined

      const options = {
        cwd: instance.directory,
        model,
        resume: state.sessionId,
        systemPrompt: { type: "preset" as const, preset: "claude_code" as const,
          append: [agent.prompt, ...instructions].filter(Boolean).join("\n\n") || undefined },
        disallowedTools: ["Read", "Edit", "Write", "NotebookEdit", "Task"],
        toolAliases: { Read: `mcp__${SERVER}__read`, Edit: `mcp__${SERVER}__edit`, Write: `mcp__${SERVER}__write` },
        mcpServers: { [SERVER]: server({ defs, run, claim, complete: view.complete,
          context: (part) => toolContext(part, abort.signal) }) },
        // Orchestra is the only policy: no Claude Code settings (their allow rules would approve calls Orchestra never
        // sees), and every call goes through Orchestra before Claude Code's own permission logic.
        settingSources: [],
        hooks: { PreToolUse: preToolUse(gate) },
        canUseTool: canUseTool(gate),
        includePartialMessages: true,
        abortController: abort,
      }

      const outcome = yield* Effect.tryPromise({
        try: async () => {
          for await (const message of sdk.query({ prompt, options })) {
            if (message.type === "system" && message.subtype === "init" && message.session_id !== state.sessionId)
              await run(sessions.setMetadata({ sessionID, metadata: { ...session.metadata,
                claudeCode: { ...state, sessionId: message.session_id } } }))
            await run(view.on(message))
            if (message.type === "result" && message.subtype !== "success")
              throw new Error("errors" in message && message.errors?.length ? message.errors.join("; ") : message.subtype)
          }
        },
        catch: (error) => error,
      }).pipe(
        Effect.as(true),
        Effect.onInterrupt(() => Effect.gen(function* () {
          abort.abort()
          yield* view.fail({ aborted: true, message: "The user stopped the turn." })
        })),
        Effect.catch((error) => view.fail({ aborted: false, message: error instanceof Error ? error.message : String(error) })
          .pipe(Effect.as(false))),
        Effect.catchCause((cause) => Cause.hasInterruptsOnly(cause) ? Effect.failCause(cause)
          : view.fail({ aborted: false, message: Cause.pretty(cause) }).pipe(Effect.as(false))),
      )
      if (outcome) {
        const { cost } = yield* view.finish(state.cost ?? 0)
        const latest = (yield* sessions.get(sessionID).pipe(Effect.orDie)).metadata ?? {}
        yield* sessions.setMetadata({ sessionID, metadata: { ...latest,
          claudeCode: { ...(latest.claudeCode as Metadata | undefined), cost } } })
      }
      return true
    })

    return Service.of({ turn })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [Agent.node, Session.node, Snapshot.node, Permission.node, ToolRegistry.node, Instruction.node, Config.node,
    FSUtil.node, CrossSpawnSpawner.node, ClaudeCodeSDK.node],
})
