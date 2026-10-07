import type { Provider } from "@/provider/provider"
import { expect, test } from "bun:test"
import { DEFAULT_TRIGGER, HARD_LIMIT, hardLimit, settings, shouldStart, tokenCount, isSafe } from "./trigger"
import { MessageID, SessionID } from "@/session/schema"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import type { SessionV1 } from "@opencode-ai/core/v1/session"

test("starts at the configured fraction of the context window", () => {
  expect(shouldStart({ tokens: 70_000, active: false, context: 100_000, trigger: 0.7 })).toBe(true)
  expect(shouldStart({ tokens: 69_999, active: false, context: 100_000, trigger: 0.7 })).toBe(false)
  expect(shouldStart({ tokens: 700_000, active: false, context: 1_000_000, trigger: 0.7 })).toBe(true)
  expect(shouldStart({ tokens: 500_000, active: false, context: 1_000_000, trigger: 0.7 })).toBe(false)
  expect(shouldStart({ tokens: 25_000, active: false, context: 100_000, trigger: 0.25 })).toBe(true)
})

test("unknown context windows never start maintenance", () => {
  for (const context of [0, -1, NaN, Infinity]) expect(shouldStart({ tokens: 1e9, active: false, context, trigger: 0.7 })).toBe(false)
})

test("settings default to enabled at 0.4 and reject invalid triggers", () => {
  expect(settings({})).toEqual({ enabled: true, trigger: DEFAULT_TRIGGER })
  expect(DEFAULT_TRIGGER).toBe(0.4)
  expect(settings({ continuity: { enabled: false } })).toEqual({ enabled: false, trigger: 0.4 })
  expect(settings({ continuity: { trigger: 0.3 } })).toEqual({ enabled: true, trigger: 0.3 })
  for (const trigger of [0, 0.7, 1, 1.5, -0.2, NaN, Infinity]) expect(settings({ continuity: { trigger } }).trigger).toBe(0.4)
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
test("only successful completed non-summary steps are safe", () => {
  const safe: SessionV1.Assistant = {
    id: MessageID.make("msg_safe"), sessionID: SessionID.make("ses_safe"), parentID: MessageID.make("msg_user"),
    role: "assistant", mode: "build", agent: "build", path: { cwd: "", root: "" }, cost: 0,
    modelID: ModelV2.ID.make("test-model"), providerID: ProviderV2.ID.make("test"),
    tokens, finish: "stop", time: { created: 0, completed: 0 },
  }
  expect(isSafe(safe)).toBe(true)
  expect(isSafe({ ...safe, finish: "tool-calls", structured: { answer: "valid" } })).toBe(true)
  // A finished tool-call step is safe too: a long turn is maintained between its steps.
  expect(isSafe({ ...safe, finish: "tool-calls" })).toBe(true)
  expect(isSafe({ ...safe, time: { created: 0 } })).toBe(false)
  expect(isSafe({ ...safe, finish: undefined })).toBe(false)
  expect(isSafe({ ...safe, summary: true })).toBe(false)
  expect(isSafe({ ...safe, error: { name: "UnknownError", data: { message: "failure" } } })).toBe(false)
  for (const finish of ["unknown", "content-filter", "length", "error"]) expect(isSafe({ ...safe, finish })).toBe(false)
})

test("does not duplicate active maintenance", () => {
  expect(shouldStart({ tokens: 100_000, active: true, context: 100_000, trigger: 0.7 })).toBe(false)
})

test("the hard limit is 70% of the window, or the input limit when the output reservation leaves less", () => {
  const model = (context: number, output: number, input?: number) => ({ limit: { context, output, input } }) as Provider.Model
  expect(HARD_LIMIT).toBe(0.7)
  expect(hardLimit(model(200_000, 8_000))).toBe(140_000)
  expect(hardLimit(model(60_000, 64_000))).toBe(28_000)
  expect(hardLimit(model(200_000, 8_000, 90_000))).toBe(90_000)
  expect(hardLimit(model(0, 0))).toBe(0)
})

test("a trigger at or past the hard limit falls back to the default", () => {
  expect(settings({ continuity: { trigger: 0.7 } }).trigger).toBe(DEFAULT_TRIGGER)
  expect(settings({ continuity: { trigger: 0.69 } }).trigger).toBe(0.69)
})
