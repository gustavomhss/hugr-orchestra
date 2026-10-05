import { expect, test } from "bun:test"
import { shouldStart, tokenCount, isSafe } from "./trigger"
import { MessageID, SessionID } from "@/session/schema"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import type { SessionV1 } from "@opencode-ai/core/v1/session"

test("starts at the continuity threshold", () => {
  expect(shouldStart({ tokens: 50_000, active: false })).toBe(true)
  expect(shouldStart({ tokens: 49_999, active: false })).toBe(false)
})

const tokens: SessionV1.Assistant["tokens"] = {
  input: 20_000, output: 5_000, reasoning: 5_000, cache: { read: 15_000, write: 5_000 },
}
test("missing total counts disjoint token components including cache", () => {
  expect(tokenCount(tokens)).toBe(50_000)
  expect(tokenCount({ ...tokens, cache: { read: 0, write: 0 } })).toBe(30_000)
})
test("valid total takes precedence; invalid total falls back", () => {
  expect(tokenCount({ ...tokens, total: 49_999 })).toBe(49_999)
  expect(tokenCount({ ...tokens, total: 0 })).toBe(0)
  for (const total of [NaN, Infinity, -Infinity, -1]) expect(tokenCount({ ...tokens, total })).toBe(50_000)
})
test("invalid components cannot manufacture usage", () => {
  expect(tokenCount({ input: NaN, output: -1, reasoning: Infinity, cache: { read: -Infinity, write: -100 } })).toBe(0)
})
test("only successful completed non-summary turns are safe", () => {
  const safe: SessionV1.Assistant = {
    id: MessageID.make("msg_safe"), sessionID: SessionID.make("ses_safe"), parentID: MessageID.make("msg_user"),
    role: "assistant", mode: "build", agent: "build", path: { cwd: "", root: "" }, cost: 0,
    modelID: ModelV2.ID.make("test-model"), providerID: ProviderV2.ID.make("test"),
    tokens, finish: "stop", time: { created: 0, completed: 0 },
  }
  expect(isSafe(safe)).toBe(true)
  expect(isSafe({ ...safe, finish: "tool-calls", structured: { answer: "valid" } })).toBe(true)
  expect(isSafe({ ...safe, time: { created: 0 } })).toBe(false)
  expect(isSafe({ ...safe, finish: undefined })).toBe(false)
  expect(isSafe({ ...safe, summary: true })).toBe(false)
  expect(isSafe({ ...safe, error: { name: "UnknownError", data: { message: "failure" } } })).toBe(false)
  for (const finish of ["tool-calls", "unknown", "content-filter", "length", "error"]) expect(isSafe({ ...safe, finish })).toBe(false)
})

test("does not duplicate active maintenance", () => {
  expect(shouldStart({ tokens: 100_000, active: true })).toBe(false)
})
