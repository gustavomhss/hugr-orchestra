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
import { MessageID, PartID, type SessionID } from "@/session/schema"
import type { TaskPromptOps } from "@/tool/task"
import { ClaudeHost } from "./host/session"

export interface Interface extends Pick<ClaudeHost.Interface, "steer" | "interrupt" | "setModel" | "fork" | "release" | "reconcileRevert"> {
  /**
   * Run one turn when the user's agent is on Claude Code: everything the user sent since the last delivery. False when
   * the agent runs on Orchestra's loop. The turn always ends with an assistant reply to `user` (with `error` when it
   * failed), so the loop's own exit check ends the run on its next pass.
   */
  readonly admitted: (user: SessionV1.WithParts) => Effect.Effect<void>
  readonly reconcileRevert: (session: Session.Info, agent?: string) => Effect.Effect<void>
  readonly turn: (input: { sessionID: SessionID; user: SessionV1.User; promptOps?: () => Effect.Effect<TaskPromptOps> }) => Effect.Effect<boolean>
  /**
   * Run one Relay work package of a workflow-bound Session on Claude Code: hand its instructions over as a synthetic
   * user message (one per `step.key`, so a resumed loop reuses it) and run the turn. Returns the turn's reply to that
   * message, which the loop settles exactly as it settles a provider turn.
   */
  readonly workflowTurn: (input: { sessionID: SessionID; user: SessionV1.User; step: { key: string; text: string } }) =>
    Effect.Effect<SessionV1.WithParts | undefined>
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
        yield* host.release(input.sessionID)
        if (session.metadata?.claudeCode) yield* continuity.release(input.sessionID)
        return false
      }
      // Claude Code compacts its own context, so Orchestra's continuity makes no maintenance model call on this session.
      yield* continuity.pause(input.sessionID)
      return yield* host.turn(input)
    })

    const workflowTurn: Interface["workflowTurn"] = Effect.fn("ClaudeCode.workflowTurn")(function* (input) {
      const history = yield* sessions.messages({ sessionID: input.sessionID }).pipe(Effect.orDie)
      const found = history.find((message) => message.info.role === "user" &&
        message.parts.some((part) => ClaudeHost.workflowStep(part) === input.step.key))?.info
      const step = found?.role === "user" ? found : yield* sessions.updateMessage({ id: MessageID.ascending(),
        sessionID: input.sessionID, role: "user", agent: input.user.agent, model: input.user.model, time: { created: Date.now() } })
      if (!found) yield* sessions.updatePart({ id: PartID.ascending(), sessionID: input.sessionID, messageID: step.id,
        type: "text", text: input.step.text, synthetic: true, metadata: { source: { type: ClaudeHost.WORKFLOW_STEP, key: input.step.key } } })
      const reply = sessions.messages({ sessionID: input.sessionID }).pipe(Effect.orDie, Effect.map((messages) =>
        messages.findLast((message) => message.info.role === "assistant" && message.info.parentID === step.id)))
      yield* turn({ sessionID: input.sessionID, user: step })
      const first = yield* reply
      if (first?.info.role === "assistant" && first.info.time.completed !== undefined) return first
      // The first package arrives with the Task's brief. Claude Code may answer the two inputs as two turns; the turn
      // that ended answered the brief, and this second call waits for the one answering the step (or fails it).
      yield* turn({ sessionID: input.sessionID, user: step })
      return yield* reply
    })

    const admitted: Interface["admitted"] = (user) => Effect.gen(function* () {
      if (user.info.role !== "user") return
      const agent = yield* agents.get(user.info.agent)
      if (agent?.engine !== "claude-code") return
      const model = user.info.model.providerID === "anthropic" ? user.info.model.modelID : undefined
      const steered = yield* host.steer({ sessionID: user.info.sessionID, user, model })
      if (!steered) yield* host.setModel({ sessionID: user.info.sessionID, model })
    })
    const reconcileRevert: Interface["reconcileRevert"] = (session) => Effect.gen(function* () {
      if (session.revert && session.metadata?.claudeCode) yield* host.reconcileRevert(session)
    })
    return Service.of({ turn, workflowTurn, admitted, steer: host.steer, interrupt: host.interrupt, setModel: host.setModel,
      fork: host.fork, release: host.release, reconcileRevert })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [Agent.node, Session.node, SessionContinuity.node, ClaudeHost.node],
})
