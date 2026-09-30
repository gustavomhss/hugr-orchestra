import { expect, test } from "bun:test"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { MessageID, SessionID } from "@/session/schema"
import { request, snapshot } from "./fork"

const sessionID = SessionID.make("ses_snapshot")
function messages(roles: ("user" | "assistant")[]): SessionV1.WithParts[] {
  return roles.map((role, index) => ({
    info: role === "user" ? {
      role, id: MessageID.make(`msg_${index}`), sessionID, time: { created: index }, agent: "build",
      model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
    } : {
      role, id: MessageID.make(`msg_${index}`), sessionID, parentID: MessageID.make("msg_0"),
      time: { created: index }, agent: "build", mode: "build", modelID: ModelV2.ID.make("test"),
      providerID: ProviderV2.ID.make("test"), path: { cwd: "/test", root: "/test" }, cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    },
    parts: [],
  }))
}
test("tail retains eight messages at a user boundary", () => {
  const history = messages(Array.from({ length: 10 }, (_, index) => index % 2 ? "assistant" : "user"))
  const result = snapshot(sessionID, history, "prior fact")
  expect(result?.head).toEqual(history.slice(0, 2))
  expect(result?.tail).toEqual(history.slice(2))
  expect(result?.tailStart).toBe(MessageID.make("msg_2"))
  expect(result?.boundary).toBe(MessageID.make("msg_9"))
  expect(result?.previous).toBe("prior fact")
})
test("tail expands back to user through long tool exchange", () => {
  const history = messages(["user", "assistant", "user", ...Array<"assistant">(11).fill("assistant")])
  expect(snapshot(sessionID, history)?.tail).toEqual(history.slice(2))
  expect(snapshot(sessionID, history)?.head).toEqual(history.slice(0, 2))
})
test("snapshot declines history without compressible head", () => {
  expect(snapshot(sessionID, [])).toBeUndefined()
  expect(snapshot(sessionID, messages(["user", ...Array<"assistant">(12).fill("assistant")]))).toBeUndefined()
  expect(snapshot(sessionID, messages(["user", "assistant"]))).toBeUndefined()
  expect(snapshot(sessionID, messages(Array<"assistant">(10).fill("assistant")))).toBeUndefined()
})
test("request exposes no tools and includes prior context as data", () => {
  const result = request([], "prior-unique-evidence")
  expect(result.tools).toEqual({})
  expect(result.toolChoice).toBe("none")
  expect(JSON.parse(result.messages[0].content)).toEqual({ previous: "prior-unique-evidence", history: [] })
})
test("assistant errors retain message without raw provider metadata", () => {
  const history = messages(["user", "assistant"])
  const assistant = history[1].info
  if (assistant.role !== "assistant") throw new Error("fixture must contain assistant")
  assistant.error = { name: "APIError", data: {
    message: "assistant-error-unique", isRetryable: false,
    responseBody: "raw-response-must-not-leak", metadata: { private: "raw-error-metadata-must-not-leak" },
  } }
  const payload = JSON.parse(request(history).messages[0].content)
  expect(payload.history[1].error).toEqual({ name: "APIError", message: "assistant-error-unique" })
  expect(JSON.stringify(payload)).not.toContain("must-not-leak")
})
