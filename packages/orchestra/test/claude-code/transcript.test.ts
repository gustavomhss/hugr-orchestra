import { expect, test } from "bun:test"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { ClaudeCodeTranscript } from "@/claude-code/transcript"
import { MessageID, PartID, SessionID } from "@/session/schema"

// The text the host hands Claude Code for the owner's undelivered messages (host/session.ts turn and steer).

const sessionID = SessionID.descending()
const model = { providerID: ProviderV2.ID.make("anthropic"), modelID: ModelV2.ID.make("claude-haiku-4-5-20251001") }

function user(texts: { text: string; ignored?: boolean }[], reminders?: string[]): SessionV1.WithParts {
  const id = MessageID.ascending()
  return {
    info: { id, sessionID, role: "user", agent: "maestro", model, time: { created: 0 }, ...(reminders ? { promptContext: { reminders } } : {}) },
    parts: texts.map((item) => ({ id: PartID.ascending(), sessionID, messageID: id, type: "text" as const, text: item.text,
      ...(item.ignored ? { ignored: true } : {}) })),
  }
}

test("batched messages keep their order, each with its own hook reminders, and the whole is trimmed", () => {
  const prompt = ClaudeCodeTranscript.hostPrompt([user([{ text: "  first\r\n " }], ["first note", "next note"]), user([{ text: " second " }], ["second note"])])
  expect(prompt).toBe("first\r\n \n\nHook reminder:\nfirst note\n\nHook reminder:\nnext note\n\n second \n\nHook reminder:\nsecond note")
})

test("ignored text parts and assistant messages never reach Claude Code; a message with no text gives an empty prompt", () => {
  const reply: SessionV1.WithParts = { info: { id: MessageID.ascending(), sessionID, role: "assistant", agent: "maestro", mode: "maestro",
    parentID: MessageID.ascending(), ...model, path: { cwd: "/repo", root: "/repo" }, cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: 1 } }, parts: [] }
  expect(ClaudeCodeTranscript.hostPrompt([user([{ text: "kept" }, { text: "dropped", ignored: true }]), reply])).toBe("kept")
  expect(ClaudeCodeTranscript.hostPrompt([user([])])).toBe("")
})

test("record accepts plain objects only", () => {
  expect([{}, { a: 1 }, null, [], "x", 1].map(ClaudeCodeTranscript.record)).toEqual([true, true, false, false, false, false])
})
