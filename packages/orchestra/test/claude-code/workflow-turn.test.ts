import { expect } from "bun:test"
import { Effect } from "effect"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { ClaudeCode } from "@/claude-code/engine"
import { ClaudeHost } from "@/claude-code/host/session"
import { MessageID, PartID } from "@/session/schema"
import { ClaudeEngineFixture } from "./engine-fixture"

// A Relay workflow worker on Claude Code runs each work package as one Claude Code turn. Claude Code's system prompt is
// fixed per query, so the package's instructions arrive as marked synthetic text, and the turn's reply to the message
// carrying it is what the prompt loop settles through RelayWorkflowSession. Only the SDK frames are scripted.

const step = (wp: string, instructions: string) => ({ key: `arm-fixture/${wp}/0/-1`,
  text: `Relay work package \`${wp}\`.\n\n${instructions}` })
const wp1 = step("wp1", "Write src/money.ts.")
const wp2 = step("wp2", "Run the package checks.")

ClaudeEngineFixture.it.instance("each work package is one turn whose reply answers the message carrying it", () =>
  Effect.gen(function* () {
    ClaudeEngineFixture.reset()
    const { sessions, chat } = yield* ClaudeEngineFixture.setup()
    const engine = yield* ClaudeCode.Service
    // Each scripted reply answers one input. Two inputs for the first package would let the brief's answer pass for it.
    ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.replies("wp1 done", "wp2 done"))
    // The Task's brief, as Task admits it in the worker Session before the loop runs the first package.
    const brief = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: chat.id, role: "user", agent: "claude",
      model: { providerID: ProviderV2.ID.make("anthropic"), modelID: ModelV2.ID.make("claude-haiku-4-5-20251001") },
      time: { created: Date.now() } })
    yield* sessions.updatePart({ id: PartID.ascending(), sessionID: chat.id, messageID: brief.id, type: "text", text: "Implement packet" })

    const first = yield* engine.workflowTurn({ sessionID: chat.id, user: brief, step: wp1 })
    const second = yield* engine.workflowTurn({ sessionID: chat.id, user: brief, step: wp2 })

    expect(ClaudeEngineFixture.state.inputs).toEqual([`Implement packet\n\n${wp1.text}`, wp2.text])
    expect(ClaudeEngineFixture.state.queries).toHaveLength(1)
    expect(ClaudeEngineFixture.state.apiCalls).toBe(0)
    const messages = yield* sessions.messages({ sessionID: chat.id })
    const carriers = [wp1, wp2].map((item) => messages.find((message) =>
      message.parts.some((part) => ClaudeHost.workflowStep(part) === item.key)))
    // The first package rides in the brief itself; the second is its own synthetic user message.
    expect(carriers.map((message) => message?.info.id)).toEqual([brief.id, expect.any(String)])
    expect(carriers[1]?.info.role).toBe("user")
    expect(carriers[1]?.parts.every((part) => part.type === "text" && part.synthetic === true)).toBe(true)
    for (const [reply, carrier, text] of [[first, carriers[0], "wp1 done"], [second, carriers[1], "wp2 done"]] as const) {
      expect(reply?.info.role === "assistant" ? reply.info.parentID : undefined).toBe(carrier?.info.id)
      expect(reply?.info.role === "assistant" && reply.info.time.completed !== undefined && reply.info.finish).toBe("stop")
      expect(reply?.parts.findLast((part) => part.type === "text")).toMatchObject({ text })
    }

    // A resumed loop at the same position reuses its step message and its settled reply; nothing is sent again.
    const again = yield* engine.workflowTurn({ sessionID: chat.id, user: brief, step: wp2 })
    expect(again?.info.id).toBe(second?.info.id)
    expect(ClaudeEngineFixture.state.inputs).toHaveLength(2)
  }), 60_000)
