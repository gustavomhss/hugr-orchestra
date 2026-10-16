import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { EventV2 } from "@orchestra/core/event"
import { RelayWorkflowSession } from "@orchestra/core/relay-workflow-session"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { RelayArm } from "@orchestra/schema/relay-arm"
import { SessionMessage } from "@orchestra/schema/session-message"
import { ClaudeHost } from "@/claude-code/host/session"
import { EventV2Bridge } from "@/event-v2-bridge"
import { MessageID } from "@/session/schema"
import { ClaudeEngineFixture } from "./engine-fixture"

// A Relay workflow worker on Claude Code: Claude Code runs each work package as one turn of its own loop. The package's
// instructions reach it as input, and the reply is settled through the same RelayWorkflowSession boundary as a
// provider turn on Orchestra's loop. Only the SDK frames and the Relay arm's evaluation are scripted.

const brief = "Relay work package"

ClaudeEngineFixture.it.instance("a workflow-bound Session on Claude Code runs each work package as a turn and settles its reply", () =>
  Effect.gen(function* () {
    ClaudeEngineFixture.reset()
    const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
    ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.replies("brief read", "wp1 done", "wp2 done"))
    const definition = Schema.decodeUnknownSync(RelayArm.WorkflowDefinition)({
      publication: { projectID: chat.projectID, documentID: "packet", activeVersionID: "version-1",
        immutableVersionBodyChecksum: "1".repeat(64), livePublicationChecksum: "2".repeat(64) },
      materialization: { schemaIdentifier: "RelaySprint.Sprint", digest: "3".repeat(64), byteLength: 128 },
      resolvedSkills: [], parameters: {}, writePaths: ["src/money.ts"],
    })
    const binding = Schema.decodeUnknownSync(RelayArm.WorkflowBinding)({ definition,
      planRevisionID: "evt_maestro_plan_revision_fixture", executionSessionID: chat.id, authoritySessionID: chat.id,
      logicalTaskID: "task-fixture" })
    const token = "arm-fixture"
    const events = yield* EventV2Bridge.Service
    yield* events.publish(MaestroEvent.Task.WorkflowBound, { executionSessionID: chat.id, token, binding,
      authorityMessageID: SessionMessage.ID.make(MessageID.ascending()), authorityCallID: "call_dispatch" },
      { id: EventV2.ID.make("evt_maestro_workflow_bound_fixture") })

    const views = [
      { position: "wp1", attempt: 0, ledgerSeq: -1, state: "active", index: 0, wp: "wp1", instructions: "Write src/money.ts." },
      { position: "wp2", attempt: 0, ledgerSeq: 0, state: "active", index: 1, wp: "wp2", instructions: "Run the package checks." },
      { position: "wp2", attempt: 0, ledgerSeq: 1, state: "complete", index: 1, wp: "wp2", instructions: "" },
    ] as const
    const settlements: RelayArm.WorkflowSettlement[] = []
    const host: RelayWorkflowSession.Host = {
      current: () => Effect.succeed({ token, binding, view: views[settlements.length] }),
      settle: (_current, settlement) => Effect.sync(() => {
        settlements.push(settlement)
        return { outcome: settlements.length === 2 ? "complete" as const : "advance" as const, failing: [],
          ledgerSeq: settlements.length - 1 }
      }),
    }

    yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("Implement packet") })
      .pipe(Effect.provideService(RelayWorkflowSession.NativeHost, host))

    const step = (wp: string, instructions: string) =>
      `${brief} \`${wp}\`. Do this step now; Orchestra checks it when your turn ends.\n\n${instructions}`
    expect(ClaudeEngineFixture.state.inputs).toEqual(["Implement packet", step("wp1", "Write src/money.ts."),
      step("wp2", "Run the package checks.")])
    // One query: the worker's packages are turns of one Claude Code session, never Orchestra's API transport.
    expect(ClaudeEngineFixture.state.queries).toHaveLength(1)
    expect(ClaudeEngineFixture.state.apiCalls).toBe(0)

    const messages = yield* sessions.messages({ sessionID: chat.id })
    const steps = messages.filter((message) => message.info.role === "user" &&
      message.parts.some((part) => ClaudeHost.workflowStep(part) !== undefined))
    expect(steps.map((message) => message.parts.map((part) => ClaudeHost.workflowStep(part)))).toEqual([
      [`${token}/wp1/0/-1`], [`${token}/wp2/0/0`]])
    expect(steps.every((message) => message.parts.every((part) => part.type === "text" && part.synthetic === true))).toBe(true)
    // Each settlement names the reply to its own step, at the position the view handed out.
    const replies = settlements.map((settlement) =>
      messages.find((message) => String(message.info.id) === String(settlement.assistantMessageID)))
    expect(replies.map((message) => message?.info.role === "assistant" ? message.info.parentID : undefined))
      .toEqual(steps.map((message) => message.info.id))
    expect(replies.map((message) => message?.parts.findLast((part) => part.type === "text")))
      .toEqual([expect.objectContaining({ text: "wp1 done" }), expect.objectContaining({ text: "wp2 done" })])
    expect(settlements.map((settlement) => settlement.expected)).toEqual([
      { position: "wp1", attempt: 0, ledgerSeq: -1 }, { position: "wp2", attempt: 0, ledgerSeq: 0 }])
  }), 60_000)
