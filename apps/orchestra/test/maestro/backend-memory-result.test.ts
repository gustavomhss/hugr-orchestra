import { describe, expect, test } from "bun:test"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { ProviderV2 } from "@orchestra/core/provider"
import { ModelV2 } from "@orchestra/core/model"
import { AtlasMemory } from "../../src/maestro/atlas-memory"
import { BackendResult } from "../../src/maestro/backend-result"
import { MessageID, PartID, SessionID } from "../../src/session/schema"

// F4 cl.30: WorkResult.memory reports each Atlas Memory call from the receipt its tool part carries. A refused or
// unavailable write is reported as such and never changes terminal, outcome or the delta.

const sessionID = SessionID.make("ses_memory_result")
const binding = {
  projectID: "prj_memory",
  root: "/repo",
  memoryOwner: "backend" as const,
  sessionID,
  assistantMessageID: "msg_worker",
}
const ref = { contentHash: "a".repeat(64), eventId: "evt_atlas_record_1" }
const card = {
  outcome: "done",
  changes: [{ path: "internal/reservation/repo.go", change: "modified" as const }],
  checks: [],
  blockers: [],
  risks: [],
  nextActions: [],
}

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

function memoryCall(callID: string, receipt: unknown) {
  return assistant((messageID) => [
    {
      id: PartID.ascending(),
      messageID,
      sessionID,
      type: "tool",
      callID,
      tool: "atlas_memory",
      state: {
        status: "completed",
        input: {},
        output: "",
        title: "",
        metadata: { [AtlasMemory.RECEIPT_KEY]: receipt },
        time: { start: 1, end: 2 },
      },
    },
  ])
}

const final = assistant((messageID) => [
  {
    id: PartID.ascending(),
    messageID,
    sessionID,
    type: "text",
    text: "Done.\n\n```backend-result\n" + JSON.stringify(card) + "\n```",
  },
])

function receipt(
  callID: string,
  op: AtlasMemory.Receipt["op"],
  outcome: AtlasMemory.Receipt["outcome"],
  extra: Partial<AtlasMemory.Receipt> = {},
): AtlasMemory.Receipt {
  return { schema: "atlas-memory-receipt-v1", op, outcome, binding: { ...binding, callID }, ...extra }
}

describe("BackendResult memory", () => {
  test("maps recall and emit receipts into memory reads and writes", () => {
    const session = [
      memoryCall("call_recall", receipt("call_recall", "recall", "read", { refs: [ref] })),
      memoryCall("call_emit", receipt("call_emit", "emit", "admitted", { ref })),
      memoryCall("call_emit_unavailable", receipt("call_emit_unavailable", "emit", "unavailable")),
      memoryCall("call_other", { schema: "something-else", op: "emit", outcome: "admitted" }),
      final,
    ]
    expect(BackendResult.assemble(final, session).memory).toEqual({
      reads: [{ outcome: "read", callID: "call_recall", refs: [ref] }],
      writes: [
        { outcome: "admitted", callID: "call_emit", receiptRef: ref },
        { outcome: "unavailable", callID: "call_emit_unavailable" },
      ],
    })
  })

  test("a refused write leaves terminal, outcome and delta unchanged", () => {
    const refusal = { ok: false as const, refusal: "scanner-blocked" as const, reason: "the secret scanner blocked it" }
    const without = BackendResult.assemble(final, [final])
    const refused = BackendResult.assemble(final, [
      memoryCall("call_emit", receipt("call_emit", "emit", "refused", { refusal })),
      final,
    ])
    expect(refused.memory).toEqual({ reads: [], writes: [{ outcome: "refused", callID: "call_emit" }] })
    expect(without.memory).toEqual({ reads: [], writes: [] })
    expect({ ...refused, memory: without.memory }).toEqual(without)
    expect(refused.terminal).toEqual({ reason: "ended" })
    expect(refused.outcome).toBe("done")
    expect(refused.changes).toEqual(card.changes)
  })

  test("the final message is counted once when the stored history already holds it", () => {
    const last = memoryCall("call_emit", receipt("call_emit", "emit", "admitted", { ref }))
    expect(BackendResult.assemble(last, [last]).memory.writes).toEqual([
      { outcome: "admitted", callID: "call_emit", receiptRef: ref },
    ])
  })

  test("a host-ended result still reports the Session's memory outcomes", () => {
    const session = [memoryCall("call_emit", receipt("call_emit", "emit", "uncertain"))]
    const ended = BackendResult.hostEnded({ session, reason: "interrupted", detail: "Task cancelled" })
    expect(ended.memory).toEqual({ reads: [], writes: [{ outcome: "uncertain", callID: "call_emit" }] })
    expect(ended.terminal).toEqual({ reason: "interrupted", hostDetail: "Task cancelled" })
  })
})
