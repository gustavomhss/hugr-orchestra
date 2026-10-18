import { describe, expect, test } from "bun:test"
import type { Agent, AssistantMessage, Config, Message, Part, ToolPart, UserMessage } from "@orchestra/sdk/v2/client"
import { normalizeSessionMessages } from "@/utils/session-message"
import type { SessionMessageAssistantTool } from "@opencode-ai/client/promise"
import { maestroCapability, ownSource, readGovernance, sessionWorking } from "./orchestra-governance-data"

const sessionID = "ses_governance"

function user(id: string, created: number): UserMessage {
  return { id, sessionID, role: "user", time: { created }, agent: "maestro", model: { providerID: "p", modelID: "m" } }
}

function assistant(id: string, created: number, input: { agent?: string; parentID?: string } = {}): AssistantMessage {
  return {
    id,
    sessionID,
    role: "assistant",
    time: { created },
    parentID: input.parentID ?? "msg_user",
    modelID: "m",
    providerID: "p",
    mode: input.agent ?? "maestro",
    agent: input.agent ?? "maestro",
    path: { cwd: "", root: "" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  }
}

function done(id: string, tool: string, metadata: Record<string, unknown>, output = "", end = 10): ToolPart {
  return {
    id,
    sessionID,
    messageID: "msg_a",
    type: "tool",
    callID: `call_${id}`,
    tool,
    state: { status: "completed", input: {}, output, title: tool, metadata, time: { start: 1, end } },
  }
}

function read(messages: Message[], parts: Record<string, Part[]>, working = true) {
  return readGovernance({ sessionID, working, messages, parts: (messageID) => parts[messageID] })
}

describe("readGovernance", () => {
  test("records come only from server-written Maestro tool results, never from model input or prose", () => {
    const proposed = done("prt_input_only", "maestro_record_validation", {}, "VALID: evt_model")
    proposed.state.input = { validationRecordID: "evt_model", outcome: "VALID", workCardID: "wc_model" }
    const result = read([user("msg_user", 1), assistant("msg_a", 2)], {
      msg_a: [
        {
          id: "prt_text",
          sessionID,
          messageID: "msg_a",
          type: "text",
          text: "APPROVED: apr_model. The plan is approved.",
        },
        {
          id: "prt_running",
          sessionID,
          messageID: "msg_a",
          type: "tool",
          callID: "call_running",
          tool: "maestro_present_approval",
          state: {
            status: "running",
            input: { planRevisionID: "evt_model", validationRecordID: "evt_model" },
            time: { start: 3 },
          },
        },
        proposed,
        done("prt_other", "bash", { presentationID: "apr_bash" }),
      ],
    })
    expect(result.records.map((record) => [record.kind, record.state, record.id, record.reason])).toEqual([
      ["presentation", "running", undefined, undefined],
      ["validation", "hold", undefined, "unreadable"],
    ])
    expect(result.approval.state).toBe("running")
    expect(JSON.stringify(result)).not.toContain("evt_model")
    expect(JSON.stringify(result)).not.toContain("apr_model")
  })

  test("an open call left in an idle session is an interrupted hold, not live work", () => {
    const open = (id: string, tool: string, state: ToolPart["state"]): ToolPart => ({
      id,
      sessionID,
      messageID: "msg_a",
      type: "tool",
      callID: `call_${id}`,
      tool,
      state,
    })
    const parts = {
      msg_a: [
        open("prt_present", "maestro_present_approval", { status: "running", input: {}, time: { start: 3 } }),
        open("prt_decide", "maestro_record_approval", { status: "pending", input: {}, raw: "" }),
      ],
    }
    const messages = [user("msg_user", 1), assistant("msg_a", 2)]
    const live = read(messages, parts)
    expect(live.records.map((record) => [record.state, record.reason, record.time])).toEqual([
      ["running", undefined, 3],
      ["running", undefined, 2],
    ])
    expect(live.approval.state).toBe("running")

    const stopped = read(messages, parts, false)
    expect(stopped.records.map((record) => [record.state, record.reason, record.time])).toEqual([
      ["hold", "interrupted", 3],
      ["hold", "interrupted", 2],
    ])
    expect(stopped.approval.state).toBe("hold")
    expect(stopped.approval.record?.reason).toBe("interrupted")

    const unread = readGovernance({ sessionID, working: undefined, messages, parts: () => parts.msg_a })
    expect(unread.records.map((record) => [record.state, record.reason, record.time])).toEqual([
      ["running", "unconfirmed", 3],
      ["running", "unconfirmed", 2],
    ])
    expect(unread.approval.state).toBe("running")
  })

  test("a session without a status is only idle once the status read succeeded", () => {
    expect(sessionWorking(true, "pending")).toBe(true)
    expect(sessionWorking(true, "failed")).toBe(true)
    expect(sessionWorking(false, "ready")).toBe(false)
    expect(sessionWorking(false, "pending")).toBeUndefined()
    expect(sessionWorking(false, "failed")).toBeUndefined()
  })

  test("reads each Maestro record with its identity, outcome and turn", () => {
    const result = read([user("msg_user", 1), assistant("msg_a", 2)], {
      msg_a: [
        done("prt_1", "maestro_record_admission", { messageID: "msg_user", outcome: "READY_TO_DRAFT" }),
        done("prt_2", "maestro_catalog_context", { catalogVersion: "cat-7", snapshot: "snap-3" }),
        done("prt_3", "maestro_record_plan_revision", { planRevisionID: "evt_plan" }),
        done("prt_4", "maestro_record_context", { contextRecordID: "evt_ctx", contextHash: "abc", mode: "GROUNDED" }),
        done("prt_5", "maestro_record_validation", { validationRecordID: "evt_val", outcome: "INVALID" }),
        done(
          "prt_7",
          "maestro_request_review",
          { childSessionID: "ses_lucy", reviewReceiptID: "evt_lucy" },
          "APPROVE: evt_lucy",
        ),
        done("prt_8", "maestro_grant_authorization", { authorizationID: "evt_auth" }),
      ],
    })
    expect(
      result.records.map((record) => [
        record.kind,
        record.state,
        record.id,
        record.outcome,
        record.extra,
        record.turnID,
      ]),
    ).toEqual([
      ["admission", "recorded", "msg_user", "READY_TO_DRAFT", undefined, "msg_user"],
      ["catalog", "recorded", "cat-7", undefined, "snap-3", "msg_user"],
      ["plan", "recorded", "evt_plan", undefined, undefined, "msg_user"],
      ["context", "recorded", "evt_ctx", "GROUNDED", "abc", "msg_user"],
      ["validation", "recorded", "evt_val", "INVALID", undefined, "msg_user"],
      ["lucy", "recorded", "evt_lucy", "APPROVE", "ses_lucy", "msg_user"],
      ["authorization", "recorded", "evt_auth", undefined, undefined, "msg_user"],
    ])
    expect(result.catalog?.id).toBe("cat-7")
    expect(result.context?.id).toBe("evt_ctx")
    expect(result.evidence.map((record) => record.id)).toEqual(["evt_lucy", "evt_val"])
    expect(result.approval.state).toBe("none")
  })

  test("refusals, HOLD outcomes and malformed results hold with the server reason", () => {
    const result = read([user("msg_user", 1), assistant("msg_a", 2)], {
      msg_a: [
        {
          id: "prt_ctx",
          sessionID,
          messageID: "msg_a",
          type: "tool",
          callID: "call_ctx",
          tool: "maestro_record_context",
          state: { status: "error", input: {}, error: "context-dirty: src/a.ts", time: { start: 1, end: 4 } },
        },
        done("prt_val", "maestro_record_validation", { validationRecordID: "evt_val", outcome: "HOLD" }),
        done("prt_bad", "maestro_record_validation", { validationRecordID: "evt_bad", outcome: "MAYBE" }),
        done(
          "prt_lucy",
          "maestro_request_review",
          { childSessionID: "ses_lucy", reviewReceiptID: "" },
          "LUCY_NO_RECEIPT: ses_lucy",
        ),
      ],
    })
    expect(result.records.map((record) => [record.kind, record.state, record.detail, record.reason])).toEqual([
      ["context", "hold", "context-dirty: src/a.ts", undefined],
      ["validation", "hold", undefined, undefined],
      ["validation", "hold", undefined, "unreadable"],
      ["lucy", "hold", "LUCY_NO_RECEIPT: ses_lucy", undefined],
    ])
  })

  test("only the newest presentation can await a reply; older ones are superseded", () => {
    const result = read([user("msg_user", 1), assistant("msg_a", 2)], {
      msg_a: [
        done("prt_1", "maestro_present_approval", { presentationID: "apr_old" }),
        done(
          "prt_2",
          "maestro_record_approval",
          { status: "APPROVED", approvalMessageID: "msg_reply" },
          "APPROVED: evt_plan",
        ),
        done("prt_3", "maestro_present_approval", { presentationID: "apr_new" }),
      ],
    })
    expect(result.records.map((record) => [record.id, record.state, record.reason])).toEqual([
      ["apr_old", "hold", "superseded"],
      ["msg_reply", "recorded", undefined],
      ["apr_new", "recorded", undefined],
    ])
    expect(result.approval.state).toBe("awaiting")
    expect(result.approval.record?.id).toBe("apr_new")
    expect(result.trail.map((record) => record.id)).toEqual(["apr_new", "msg_reply", "apr_old"])
  })

  test("decisions follow the server status; a missing reply binding authorizes nothing", () => {
    const decide = (metadata: Record<string, unknown>, output: string) =>
      read([user("msg_user", 1), assistant("msg_a", 2)], {
        msg_a: [
          done("prt_1", "maestro_present_approval", { presentationID: "apr_1" }),
          done("prt_2", "maestro_record_approval", metadata, output),
        ],
      }).approval
    expect(decide({ status: "APPROVED", approvalMessageID: "msg_reply" }, "APPROVED: evt_plan").state).toBe("approved")
    expect(decide({ status: "DECLINED", approvalMessageID: "msg_reply" }, "DECLINED: evt_plan").state).toBe("declined")
    expect(decide({ status: "PENDING", approvalMessageID: "" }, "PENDING: question").record?.detail).toBe("question")
    const hold = decide({ status: "HOLD", approvalMessageID: "" }, "HOLD: reply-not-immediate")
    expect([hold.state, hold.record?.detail]).toEqual(["hold", "reply-not-immediate"])
    const unbound = decide({ status: "APPROVED", approvalMessageID: "" }, "APPROVED: evt_plan")
    expect([unbound.state, unbound.record?.reason]).toEqual(["hold", "unreadable"])
  })

  test("results recorded outside this session's Maestro agent hold as foreign", () => {
    const result = read([user("msg_user", 1), assistant("msg_a", 2, { agent: "build" }), assistant("msg_b", 3)], {
      msg_a: [done("prt_1", "maestro_present_approval", { presentationID: "apr_build" })],
      msg_b: [
        { ...done("prt_2", "maestro_grant_authorization", { authorizationID: "evt_auth" }), sessionID: "ses_other" },
      ],
    })
    expect(result.records.map((record) => [record.id, record.state, record.reason])).toEqual([
      [undefined, "hold", "foreign"],
      [undefined, "hold", "foreign"],
    ])
    expect(result.approval.state).toBe("hold")
  })

  test("direct review receipts come from Lucy; Maestro exposes the delegated receipt instead", () => {
    const receipt = done("prt_review", "maestro_record_review", { reviewReceiptID: "evt_review", verdict: "FIX_FIRST" })
    expect(read([assistant("msg_a", 1, { agent: "lucy" })], { msg_a: [receipt] }).evidence[0]).toMatchObject({
      state: "recorded",
      id: "evt_review",
      outcome: "FIX_FIRST",
    })
    expect(read([assistant("msg_a", 1)], { msg_a: [receipt] }).evidence[0]).toMatchObject({
      state: "hold",
      reason: "foreign",
    })
  })

  test("Lucy verdict must match the entire server result and receipt, never a prefix or truncated output", () => {
    const check = (output: string, truncated = false) =>
      read([assistant("msg_a", 1)], {
        msg_a: [
          done(
            "prt_review",
            "maestro_request_review",
            { reviewReceiptID: "evt_receipt", childSessionID: "ses_lucy", truncated },
            output,
          ),
        ],
      }).evidence[0]
    expect(check("APPROVE: evt_receipt")).toMatchObject({ state: "recorded", outcome: "APPROVE" })
    expect(check("APPROVE: evt_other")).toMatchObject({ state: "hold", reason: "unreadable" })
    expect(check("APPROVE: evt_receipt\nREJECT")).toMatchObject({ state: "hold", reason: "unreadable" })
    expect(check("APPROVE: evt_receipt", true)).toMatchObject({ state: "hold", reason: "unreadable" })
  })

  test("synthetic assistants and foreign message parts cannot confirm governance", () => {
    const synthetic = { ...assistant("msg_a", 1), synthetic: true }
    const presentation = done("prt_1", "maestro_present_approval", { presentationID: "apr_synthetic" })
    expect(read([synthetic], { msg_a: [presentation] }).approval.record).toMatchObject({
      state: "hold",
      reason: "synthetic",
    })
    expect(
      read([assistant("msg_a", 1)], { msg_a: [{ ...presentation, messageID: "msg_other" }] }).approval.record,
    ).toMatchObject({ state: "hold", reason: "foreign" })
  })

  test("source navigation requires a loaded user turn from this session", () => {
    const part = done("prt_1", "maestro_present_approval", { presentationID: "apr_1" })
    const message = assistant("msg_a", 2)
    expect(read([message], { msg_a: [part] }).approval.record?.turnID).toBeUndefined()
    expect(
      read([{ ...user("msg_user", 1), sessionID: "ses_other" }, message], { msg_a: [part] }).approval.record?.turnID,
    ).toBeUndefined()
    expect(read([user("msg_user", 1), message], { msg_a: [part] }).approval.record?.turnID).toBe("msg_user")
  })

  test("retains bounded catalog and presentation output without treating their prose as decisions", () => {
    const result = read([assistant("msg_a", 2)], {
      msg_a: [
        done(
          "prt_catalog",
          "maestro_catalog_context",
          { catalogVersion: "cat-7", snapshot: "snap-3" },
          '{"units":[{"unit":"own:auth"}]}',
        ),
        done(
          "prt_presentation",
          "maestro_present_approval",
          { presentationID: "apr_1" },
          "APPROVED: model claim\n".repeat(2_000),
        ),
      ],
    })
    expect(result.catalog?.output).toBe('{"units":[{"unit":"own:auth"}]}')
    expect(result.approval.state).toBe("awaiting")
    expect(result.approval.record?.output?.length).toBe(16_384)
    expect(result.approval.record?.partial).toBe(true)
  })

  test("reads current server structured results before the legacy normalized metadata; missing end stays unknown", () => {
    const source = [
      { id: "msg_user", type: "user" as const, time: { created: 1 }, text: "Review this plan" },
      {
        id: "msg_a",
        type: "assistant" as const,
        agent: "maestro",
        model: { id: "m", providerID: "p" },
        time: { created: 2 },
        content: [
          {
            type: "tool" as const,
            id: "call_validation",
            name: "maestro_record_validation",
            time: { created: 3 },
            state: {
              status: "completed" as const,
              input: { validationRecordID: "evt_input", outcome: "INVALID" },
              metadata: { validationRecordID: "evt_legacy", outcome: "INVALID" },
              structured: { validationRecordID: "evt_current", outcome: "VALID" },
              content: [{ type: "text", text: "VALID: evt_current" }] satisfies [{ type: "text"; text: string }],
            },
          },
        ],
      },
    ]
    const normalized = normalizeSessionMessages(sessionID, source)
    const result = readGovernance({
      sessionID,
      working: false,
      source,
      messages: normalized.messages,
      parts: (id) => normalized.parts.get(id),
    })
    expect(result.evidence[0]).toMatchObject({
      id: "evt_current",
      outcome: "VALID",
      state: "recorded",
      time: undefined,
      turnID: "msg_user",
    })
    expect(JSON.stringify(result)).not.toContain("evt_input")
    expect(JSON.stringify(result)).not.toContain("evt_legacy")
  })

  test("invalid timestamps remain unknown instead of crashing the view or inventing zero", () => {
    for (const end of [NaN, Infinity, 9e15]) {
      const result = read([assistant("msg_a", 2)], {
        msg_a: [done("prt_1", "maestro_present_approval", { presentationID: "apr_1" }, "", end)],
      })
      expect(result.approval.record?.time).toBeUndefined()
    }
  })

  test("current server content order wins over lexically sorted opaque call IDs", () => {
    const tools: SessionMessageAssistantTool[] = [
      {
        type: "tool",
        id: "call_z",
        name: "maestro_present_approval",
        time: { created: 2, completed: 3 },
        state: {
          status: "completed",
          input: {},
          metadata: { presentationID: "apr_1" },
          content: [{ type: "text", text: "Presentation" }],
        },
      },
      {
        type: "tool",
        id: "call_a",
        name: "maestro_record_approval",
        time: { created: 4, completed: 5 },
        state: {
          status: "completed",
          input: {},
          metadata: { status: "APPROVED", approvalMessageID: "msg_reply" },
          content: [{ type: "text", text: "APPROVED: exact plan revision evt_plan" }],
        },
      },
    ]
    const source = [
      { id: "msg_user", type: "user" as const, time: { created: 1 }, text: "Review this plan" },
      {
        id: "msg_a",
        type: "assistant" as const,
        agent: "maestro",
        model: { id: "m", providerID: "p" },
        time: { created: 2 },
        content: tools,
      },
    ]
    const normalized = normalizeSessionMessages(sessionID, source)
    const result = readGovernance({
      sessionID,
      working: false,
      source,
      messages: normalized.messages,
      parts: (id) => normalized.parts.get(id)?.toReversed(),
    })
    expect(result.approval.state).toBe("approved")
    expect(result.trail.map((record) => record.id)).toEqual(["msg_reply", "apr_1"])
  })
})

describe("maestroCapability", () => {
  const agent = (name: string, native?: boolean): Agent => ({
    name,
    mode: "primary",
    native,
    permission: [],
    options: {},
  })
  test("requires the native Maestro agent and waits for the agent list", () => {
    expect(maestroCapability([agent("build"), agent("maestro", true)], "ready")).toBe("available")
    expect(maestroCapability([agent("maestro")], "pending")).toBe("available")
    expect(maestroCapability([agent("maestro", false)], "ready")).toBe("unavailable")
    expect(maestroCapability([agent("build")], "ready")).toBe("unavailable")
    expect(maestroCapability([], "ready")).toBe("unavailable")
    expect(maestroCapability([], "pending")).toBe("checking")
  })

  test("reports a failed agent read as unknown instead of checking forever", () => {
    expect(maestroCapability([], "failed")).toBe("unknown")
    expect(maestroCapability([agent("build")], "failed")).toBe("unavailable")
  })
})

describe("ownSource", () => {
  test("separates unknown, missing and configured Own sources", () => {
    const config: Config = { maestro: { atlas: { projectID: "atlas-project", directory: "/atlas" } } }
    expect(ownSource(config, "v2", "ready").state).toBe("unknown")
    expect(ownSource({}, "v1", "ready").state).toBe("unknown")
    expect(ownSource({ model: "anthropic/claude" }, "v1", "ready").state).toBe("missing")
    expect(ownSource(config, "v1", "ready")).toEqual({
      state: "configured",
      projectID: "atlas-project",
      directory: "/atlas",
    })
  })

  test("follows the project config read, not unrelated bootstrap reads", () => {
    const config: Config = { maestro: { atlas: { projectID: "atlas-project", directory: "/atlas" } } }
    expect(ownSource(config, undefined, "ready").state).toBe("checking")
    expect(ownSource(config, "v1", "pending").state).toBe("checking")
    expect(ownSource(config, "v1", "failed").state).toBe("failed")
  })
})
