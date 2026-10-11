import { describe, expect, test } from "bun:test"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { ProviderV2 } from "@orchestra/core/provider"
import { ModelV2 } from "@orchestra/core/model"
import { BackendResult } from "../../src/maestro/backend-result"
import { OUTCOME_KEY, outcome } from "../../src/plugin/hugr-composer/outcome"
import { MessageID, PartID, SessionID } from "../../src/session/schema"

// F4 cl.25: owned-tool outcomes reach WorkResult.toolOutcomes from the metadata the HuGR bridge wrote on the tool
// part. A tool outcome is not a task outcome: it never changes terminal, outcome, verification or acceptance.

const sessionID = SessionID.make("ses_tool_outcomes")
const card = {
  outcome: "done",
  changes: [{ path: "app/main.py", change: "created" as const }],
  checks: [],
  blockers: [],
  risks: [],
  nextActions: [],
}
const failedScaffold = outcome("hugr-scaffold", { ok: false, producerCode: "scaffold-failed" })

function assistant(parts: (id: MessageID) => SessionV1.Part[]): SessionV1.WithParts {
  const id = MessageID.ascending()
  return {
    info: {
      id,
      role: "assistant",
      parentID: MessageID.make("msg_packet"),
      sessionID,
      mode: "backend",
      agent: "backend",
      cost: 0,
      path: { cwd: "/repo", root: "/repo" },
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      modelID: ModelV2.ID.make("test-model"),
      providerID: ProviderV2.ID.make("test"),
      time: { created: Date.now() },
      finish: "stop",
    },
    parts: parts(id),
  }
}

function toolCall(callID: string, tool: string, metadata: Record<string, unknown>, status: "completed" | "error" | "running" = "completed") {
  return assistant((messageID) => [
    {
      id: PartID.ascending(),
      messageID,
      sessionID,
      type: "tool",
      callID,
      tool,
      state:
        status === "completed"
          ? { status, input: {}, output: "", title: "", metadata, time: { start: 1, end: 2 } }
          : status === "error"
            ? { status, input: {}, error: "failed", metadata, time: { start: 1, end: 2 } }
            : { status, input: {}, title: "", metadata, time: { start: 1 } },
    },
  ])
}

const final = assistant((messageID) => [
  { id: PartID.ascending(), messageID, sessionID, type: "text", text: "Done.\n\n```backend-result\n" + JSON.stringify(card) + "\n```" },
])

describe("BackendResult toolOutcomes", () => {
  test("reports each settled owned-tool call, completed or errored, keyed by callID in order", () => {
    const session = [
      toolCall("call_compose", "hugr-compose", { [OUTCOME_KEY]: outcome("hugr-compose", { ok: true, dryRun: true }) }),
      toolCall("call_scaffold", "hugr-scaffold", { [OUTCOME_KEY]: failedScaffold }, "error"),
    ]
    expect(BackendResult.assemble(final, session).toolOutcomes).toEqual([
      { callID: "call_compose", schema: "hugr-composer-outcome-v1", tool: "hugr-compose", ok: true, effects: "none" },
      { callID: "call_scaffold", ...failedScaffold },
    ])
  })

  test("a failed tool never changes terminal, outcome, verification or acceptance", () => {
    const failing = [toolCall("call_scaffold", "hugr-scaffold", { [OUTCOME_KEY]: failedScaffold }, "error")]
    const withTool = BackendResult.assemble(final, failing)
    const without = BackendResult.assemble(final, [])
    expect(without.toolOutcomes).toBeUndefined()
    expect({ ...withTool, toolOutcomes: undefined }).toEqual({ ...without, toolOutcomes: undefined })
    expect(withTool.terminal).toEqual({ reason: "ended" })
    expect(withTool.outcome).toBe("done")
    expect(withTool.changes).toEqual(card.changes)
    expect(withTool.acceptance).toEqual({ state: "pending" })
  })

  test("ignores forged, drifted, mismatched and unsettled metadata instead of repairing it", () => {
    const valid = outcome("hugr-compose", { ok: true })
    const session = [
      toolCall("call_other_tool", "bash", { [OUTCOME_KEY]: valid }),
      toolCall("call_wrong_name", "hugr-scaffold", { [OUTCOME_KEY]: valid }),
      toolCall("call_status", "hugr-compose", { [OUTCOME_KEY]: { ...valid, status: "generated" } }),
      toolCall("call_excess", "hugr-compose", { [OUTCOME_KEY]: { ...valid, claim: "verified" } }),
      toolCall("call_code", "hugr-scaffold", {
        [OUTCOME_KEY]: { ...failedScaffold, error: { code: "PRODUCER_FAILED", producerCode: "free text" } },
      }),
      toolCall("call_mixed", "hugr-compose", { [OUTCOME_KEY]: { ...valid, status: "failed" } }),
      toolCall("call_running", "hugr-compose", { [OUTCOME_KEY]: valid }, "running"),
      toolCall("call_absent", "hugr-compose", {}),
    ]
    expect(BackendResult.assemble(final, session).toolOutcomes).toBeUndefined()
  })

  test("reports canonical hugr-owned-tool-v1 outcomes with their observed inventory and drops illegal ones", () => {
    const generated = {
      schema: "hugr-owned-tool-v1",
      tool: "hugr-scaffold",
      status: "generated",
      effects: "observed",
      observed_changes: [{ path: "/repo/app/main.py", change: "created" }],
      mode: "full",
    } as const
    const partial = {
      schema: "hugr-owned-tool-v1",
      tool: "hugr-compose",
      status: "failed",
      effects: "partial",
      observed_changes: [{ path: "/repo/app/compositions/x.py", change: "created" }],
      error: { code: "PRODUCER_FAILED", producer_code: "write-failed" },
    } as const
    const session = [
      toolCall("call_generated", "hugr-scaffold", { [OUTCOME_KEY]: generated }),
      toolCall("call_partial", "hugr-compose", { [OUTCOME_KEY]: partial }, "error"),
      toolCall("call_none_with_changes", "hugr-scaffold", { [OUTCOME_KEY]: { ...generated, effects: "none" } }),
      toolCall("call_empty", "hugr-scaffold", { [OUTCOME_KEY]: { ...generated, observed_changes: [] } }),
      toolCall("call_blocked_code", "hugr-compose", { [OUTCOME_KEY]: { ...partial, status: "blocked", effects: "none", observed_changes: [] } }),
      toolCall("call_excess", "hugr-scaffold", { [OUTCOME_KEY]: { ...generated, artifacts: [] } }),
    ]
    expect(BackendResult.assemble(final, session).toolOutcomes).toEqual([
      { callID: "call_generated", ...generated },
      { callID: "call_partial", ...partial },
    ])
  })

  test("the final message is counted once when the stored history already holds it", () => {
    const last = toolCall("call_scaffold", "hugr-scaffold", { [OUTCOME_KEY]: failedScaffold }, "error")
    expect(BackendResult.assemble(last, [last]).toolOutcomes).toEqual([{ callID: "call_scaffold", ...failedScaffold }])
  })

  test("a host-ended result still reports the Session's owned-tool outcomes", () => {
    const session = [toolCall("call_scaffold", "hugr-scaffold", { [OUTCOME_KEY]: failedScaffold }, "error")]
    const ended = BackendResult.hostEnded({ session, reason: "interrupted", detail: "Task cancelled" })
    expect(ended.toolOutcomes).toEqual([{ callID: "call_scaffold", ...failedScaffold }])
    expect(ended.terminal).toEqual({ reason: "interrupted", hostDetail: "Task cancelled" })
  })
})
