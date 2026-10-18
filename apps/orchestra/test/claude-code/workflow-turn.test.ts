import { expect } from "bun:test"
import { Cause, Effect } from "effect"
import { PermissionV1 } from "@orchestra/core/v1/permission"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { ClaudeCode } from "@/claude-code/engine"
import { ClaudeCodeTools } from "@/claude-code/tools"
import { ClaudeHostAdmission } from "@/claude-code/host/admission"
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
      message.parts.some((part) => ClaudeHostAdmission.workflowStep(part) === item.key)))
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

// One Claude Code turn holds every tool call of a package. A red test run before the fix is an `error` part the model
// already acted on, so it must not fail the turn; an errored turn or a call left without a result must.
ClaudeEngineFixture.it.instance("a turn settles on how it ended, not on tool errors the model worked through", () =>
  Effect.gen(function* () {
    ClaudeEngineFixture.reset()
    const { sessions, chat } = yield* ClaudeEngineFixture.setup()
    const engine = yield* ClaudeCode.Service
    ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.replies("wp1 done"))
    const brief = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: chat.id, role: "user", agent: "claude",
      model: { providerID: ProviderV2.ID.make("anthropic"), modelID: ModelV2.ID.make("claude-haiku-4-5-20251001") },
      time: { created: Date.now() } })
    yield* sessions.updatePart({ id: PartID.ascending(), sessionID: chat.id, messageID: brief.id, type: "text", text: "Implement packet" })
    const reply = yield* engine.workflowTurn({ sessionID: chat.id, user: brief, step: wp1 })
    if (reply?.info.role !== "assistant") throw new Error("expected the package's reply")
    expect(ClaudeCode.settled(reply)).toBe(true)

    const bash = (status: "completed" | "error" | "running", error = "1 fail") => ({
      id: PartID.ascending(), sessionID: chat.id, messageID: reply.info.id, type: "tool" as const, tool: "Bash", callID: status,
      state: status === "completed"
        ? { status, input: { command: "bun test" }, output: "1 pass", title: "bun test", metadata: {}, time: { start: 1, end: 2 } }
        : status === "error"
          ? { status, input: { command: "bun test" }, error, time: { start: 1, end: 2 } }
          : { status, input: { command: "bun test" }, time: { start: 1 } },
    })
    const info = reply.info
    const turn = (parts: ReturnType<typeof bash>[], change: Partial<SessionV1.Assistant> = {}) =>
      ({ info: { ...info, ...change }, parts: [...parts, ...reply.parts] })
    expect(ClaudeCode.settled(turn([bash("error"), bash("completed")]))).toBe(true)
    expect(ClaudeCode.settled(turn([bash("error"), bash("running")]))).toBe(false)
    // The owner's rejection or dismissal is the owner saying stop, not a step the model worked through.
    const rejected = ClaudeCodeTools.failure(Cause.fail(new PermissionV1.RejectedError()))
    expect(ClaudeCode.settled(turn([bash("error", rejected), bash("completed")]))).toBe(false)
    expect(ClaudeCode.settled(turn([bash("error", "The owner dismissed this question.")]))).toBe(false)
    // A rejection with feedback is a correction the model acts on in the same turn, as in normal mode.
    const corrected = ClaudeCodeTools.failure(Cause.fail(new PermissionV1.CorrectedError({ feedback: "use integer math" })))
    expect(ClaudeCode.settled(turn([bash("error", corrected), bash("completed")]))).toBe(true)
    expect(ClaudeCode.settled(turn([], { finish: "content-filter" }))).toBe(false)
    expect(ClaudeCode.settled(turn([], { finish: "error" }))).toBe(false)
    expect(ClaudeCode.settled(turn([], { finish: undefined }))).toBe(false)
    expect(ClaudeCode.settled(turn([], { error: { name: "UnknownError", data: { message: "boom" } } }))).toBe(false)
  }), 60_000)
