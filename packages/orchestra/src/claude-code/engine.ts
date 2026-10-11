export * as ClaudeCode from "./engine"

// Claude mode's single entry point. An agent with `engine: "claude-code"` runs on Claude Code as the host
// (claude-code/host/session.ts, meta-harness PLAN.md §4): one long-lived Claude Agent SDK session per Orchestra session,
// with Claude Code's own loop, prompt preset, tools, login and compaction. Orchestra plugs in through its plugin, its
// `orchestra` MCP server and in-process hooks, and mirrors the session into its own. Orchestra's normal mode imports
// nothing from this directory but this file (test/claude-code/mode-boundary.test.ts). Design: specs/claude-code-engine.md.
import { Context, Effect, Layer } from "effect"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { Agent } from "@/agent/agent"
import { SessionContinuity } from "@/continuity/service"
import { Session } from "@/session/session"
import type { SessionID } from "@/session/schema"
import type { TaskPromptOps } from "@/tool/task"
import { ClaudeHost } from "./host/session"

export interface Interface {
  /**
   * Run one turn when the user's agent is on Claude Code: everything the user sent since the last delivery. False when
   * the agent runs on Orchestra's loop. The turn always ends with an assistant reply to `user` (with `error` when it
   * failed), so the loop's own exit check ends the run on its next pass.
   */
  readonly turn: (input: { sessionID: SessionID; user: SessionV1.User; promptOps?: () => Effect.Effect<TaskPromptOps> }) => Effect.Effect<boolean>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/ClaudeCode") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const sessions = yield* Session.Service
    const continuity = yield* SessionContinuity.Service
    const host = yield* ClaudeHost.Service

    const turn: Interface["turn"] = Effect.fn("ClaudeCode.turn")(function* (input) {
      const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)
      const agent = yield* agents.get(input.user.agent).pipe(Effect.orElseSucceed(() => undefined))
      if (agent?.engine !== "claude-code") {
        if (session.metadata?.claudeCode) yield* continuity.release(input.sessionID)
        return false
      }
      // Claude Code compacts its own context, so Orchestra's continuity makes no maintenance model call on this session.
      yield* continuity.pause(input.sessionID)
      return yield* host.turn(input)
    })

    return Service.of({ turn })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [Agent.node, Session.node, SessionContinuity.node, ClaudeHost.node],
})
