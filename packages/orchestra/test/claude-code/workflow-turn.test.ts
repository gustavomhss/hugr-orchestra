import { expect } from "bun:test"
import { Effect } from "effect"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { ClaudeCode } from "@/claude-code/engine"
import { ClaudeHost } from "@/claude-code/host/session"
import { MessageID, PartID } from "@/session/schema"
import { ClaudeEngineFixture } from "./engine-fixture"

// A Relay workflow worker on Claude Code runs each work package as one Claude Code turn. Claude Code's system prompt is
// fixed per query, so the package's instructions arrive as a marked synthetic user message, and the turn's reply to
// that message is what the prompt loop settles through RelayWorkflowSession. Only the SDK frames are scripted.

const step = (wp: string, instructions: string) => ({ key: `arm-fixture/${wp}/0/-1`,
  text: `Relay work package \`${wp}\`.\n\n${instructions}` })

ClaudeEngineFixture.it.instance("each work package is one turn whose reply answers its own step message", () =>
  Effect.gen(function* () {
    ClaudeEngineFixture.reset()
    const { sessions, chat } = yield* ClaudeEngineFixture.setup()
    const engine = yield* ClaudeCode.Service
    // Claude Code answers the Task's brief and the first package as two turns, then the second package.
    ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.replies("brief read", "wp1 done", "wp2 done"))
    // The Task's brief, as Task admits it in the worker Session before the loop runs the first package.
    const brief = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: chat.id, role: "user", agent: "claude",
      model: { providerID: ProviderV2.ID.make("anthropic"), modelID: ModelV2.ID.make("claude-haiku-4-5-20251001") },
      time: { created: Date.now() } })
    yield* sessions.updatePart({ id: PartID.ascending(), sessionID: chat.id, messageID: brief.id, type: "text", text: "Implement packet" })

    const first = yield* engine.workflowTurn({ sessionID: chat.id, user: brief, step: step("wp1", "Write src/money.ts.") })
    const second = yield* engine.workflowTurn({ sessionID: chat.id, user: brief, step: step("wp2", "Run the package checks.") })

    expect(ClaudeEngineFixture.state.inputs).toEqual(["Implement packet", step("wp1", "Write src/money.ts.").text,
      step("wp2", "Run the package checks.").text])
    expect(ClaudeEngineFixture.state.queries).toHaveLength(1)
    expect(ClaudeEngineFixture.state.apiCalls).toBe(0)
    const messages = yield* sessions.messages({ sessionID: chat.id })
    const steps = messages.filter((message) => message.parts.some((part) => ClaudeHost.workflowStep(part) !== undefined))
    expect(steps.map((message) => message.parts.map((part) => ClaudeHost.workflowStep(part))))
      .toEqual([["arm-fixture/wp1/0/-1"], ["arm-fixture/wp2/0/-1"]])
    expect(steps.every((message) => message.info.role === "user" &&
      message.parts.every((part) => part.type === "text" && part.synthetic === true))).toBe(true)
    // The reply returned for settlement is the completed answer to its own step, not the brief's answer.
    for (const [reply, index, text] of [[first, 0, "wp1 done"], [second, 1, "wp2 done"]] as const) {
      expect(reply?.info.role === "assistant" && reply.info.parentID).toBe(steps[index].info.id)
      expect(reply?.info.role === "assistant" && reply.info.time.completed !== undefined && reply.info.finish).toBe("stop")
      expect(reply?.parts.findLast((part) => part.type === "text")).toMatchObject({ text })
    }

    // A resumed loop at the same position reuses its step message and its settled reply; nothing is sent again.
    const again = yield* engine.workflowTurn({ sessionID: chat.id, user: brief, step: step("wp2", "Run the package checks.") })
    expect(again?.info.id).toBe(second?.info.id)
    expect(ClaudeEngineFixture.state.inputs).toHaveLength(3)
  }), 60_000)
