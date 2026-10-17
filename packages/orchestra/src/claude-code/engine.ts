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
import { ClaudeHostAdmission } from "./host/admission"

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
   * Run one Relay work package of a workflow-bound Session on Claude Code: hand its instructions over as synthetic text
   * (one per `step.key`, so a resumed loop reuses it) and run the turn. Returns the turn's reply to the message carrying
   * that text, which the loop settles through `settled`.
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
        message.parts.some((part) => ClaudeHostAdmission.workflowStep(part) === input.step.key))?.info
      const answered = history.some((message) => message.info.role === "assistant" && message.info.parentID === input.user.id)
      const brief = history.find((message) => message.info.role === "user")?.info.id === input.user.id
      // The first package goes in the Task's unanswered brief, as one input: Claude Code may answer two inputs as two
      // turns, and the brief's answer would then pass for the package's. Any other message (an owner's steer) keeps its
      // own answer; the package gets a message of its own.
      const step = found?.role === "user" ? found : answered || !brief ? yield* sessions.updateMessage({ id: MessageID.ascending(),
        sessionID: input.sessionID, role: "user", agent: input.user.agent, model: input.user.model, time: { created: Date.now() } })
        : input.user
      if (!found) yield* sessions.updatePart({ id: PartID.ascending(), sessionID: input.sessionID, messageID: step.id,
        type: "text", text: input.step.text, synthetic: true, metadata: { source: { type: ClaudeHostAdmission.WORKFLOW_STEP, key: input.step.key } } })
      yield* turn({ sessionID: input.sessionID, user: step })
      return (yield* sessions.messages({ sessionID: input.sessionID }).pipe(Effect.orDie))
        .findLast((message) => message.info.role === "assistant" && message.info.parentID === step.id)
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

/**
 * Whether a Claude Code turn ended in a state the Relay host may grade. Unlike a provider step, one turn holds many tool
 * calls the model already saw and acted on: a red test run before the fix, a missed Edit, a gate deny it worked around.
 * Those stay in the turn as `error` parts and do not fail it; whether the package is done is the Relay checks' call
 * in `host.settle`. Only an errored or unfinished turn, or a tool call left without a result, is unsettled.
 */
export function settled(reply: SessionV1.WithParts) {
  if (reply.info.role !== "assistant" || reply.info.error || !reply.info.finish) return false
  if (["unknown", "error", "content-filter"].includes(reply.info.finish)) return false
  return reply.parts.every((part) => part.type !== "tool" || part.state.status === "completed" || part.state.status === "error")
}

export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [Agent.node, Session.node, SessionContinuity.node, ClaudeHost.node],
})
