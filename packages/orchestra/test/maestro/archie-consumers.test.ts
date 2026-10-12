import { describe, expect, test } from "bun:test"
import { SessionV1 } from "@orchestra/core/v1/session"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { BackendResult } from "@/maestro/backend-result"
import { Seats } from "@/maestro/seats"
import { roster } from "@/maestro/roster"
import { UpstreamResult } from "@/maestro/upstream-result"
import { MessageID, PartID, SessionID } from "@/session/schema"

const proposal = {
  outcome: "done",
  artifacts: [{ kind: "plan", path: "proposal.md" }],
  blockers: [],
  risks: [],
  nextActions: [],
} satisfies UpstreamResult.Card

describe("Archie native result consumers", () => {
  test("registered upstream seat attributes only its actual assistant", () => {
    const seat = requireArchie()
    const message = assistant("archie")
    expect(BackendResult.assemble(message, [], seat)).toMatchObject({
      schema: UpstreamResult.SCHEMA,
      card: { parsed: true, messageID: message.info.id },
      outcome: "done",
      artifacts: proposal.artifacts,
      author: { memberId: "archie", executionSessionID: message.info.sessionID, messageID: message.info.id },
      terminal: { reason: "ended" },
    })
  })

  test("old active ID and other agents cannot acquire Archie authorship from identical proposal text", () => {
    const seat = requireArchie()
    ;["walt", "general", "maestro"].forEach((agent) => {
      const result = BackendResult.assemble(assistant(agent), [], seat)
      expect(result.card.parsed).toBe(false)
      expect(result.author).toBeUndefined()
      expect(result.artifacts).toEqual([])
      expect(result.terminal.reason).toBe("blocked")
    })
  })

  test("host failure without a returned assistant never stamps native authorship", () => {
    const result = BackendResult.hostEnded({ reason: "failed", detail: "No returned assistant" }, requireArchie())
    expect(result).toMatchObject({
      schema: UpstreamResult.SCHEMA,
      card: { parsed: false },
      artifacts: [],
      terminal: { reason: "failed" },
    })
    expect(result.author).toBeUndefined()
  })
})

function requireArchie() {
  const seat = Seats.find("archie")
  if (!seat) throw new Error("DEPENDENCY_MISSING: registered native archie seat")
  expect(seat.profileKey).toBe("upstream")
  expect(seat.workResult).toBe(UpstreamResult.SCHEMA)
  expect(roster.find((member) => member.memberId === seat.id)?.nativeProfile).toBe("upstream")
  return seat
}

function assistant(agent: string): SessionV1.WithParts {
  const id = MessageID.ascending()
  const sessionID = SessionID.create()
  return {
    info: {
      id, sessionID, role: "assistant", parentID: MessageID.ascending(), agent, mode: agent,
      modelID: ModelV2.ID.make("test-model"), providerID: ProviderV2.ID.make("test"),
      path: { cwd: "/tmp", root: "/tmp" }, cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: 0, completed: 1 }, finish: "stop",
    },
    parts: [{ id: PartID.ascending(), messageID: id, sessionID, type: "text",
      text: `\`\`\`upstream-result\n${JSON.stringify(proposal)}\n\`\`\`` }],
  }
}
