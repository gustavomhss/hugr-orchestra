import { expect, test } from "bun:test"
import { Option, Schema } from "effect"
import { Board } from "../src/board"
import { BoardExecution } from "../src/board-execution"
import { SessionMessage } from "../src/session-message"
import { SessionEvent } from "../src/session-event"

test("Board re-exports the canonical execution contracts without recreating schema identities", () => {
  expect(Board.Writer).toBe(BoardExecution.Writer)
  expect(Board.Receipt).toBe(BoardExecution.Receipt)
  expect(Board.ExecutionReport).toBe(BoardExecution.ExecutionReport)
})

test("creation inputs omit undefined optionals and do not accept trusted authorship", () => {
  const create = Schema.decodeUnknownSync(Board.CreateIssueInput)({ title: "Proposal", writer: { kind: "owner" } })
  expect(Schema.encodeSync(Board.CreateIssueInput)({ ...create, body: undefined })).toEqual({ title: "Proposal" })
  const tool = Schema.decodeUnknownSync(Board.IssueInput)({ project: "TEST", title: "Proposal", reason: "Found work.", writer: { seat: "maestro" } })
  expect(Object.hasOwn(tool, "writer")).toBe(false)
  expect(Option.isNone(Schema.decodeUnknownOption(Board.CreateIssueInput)({ title: "   " }))).toBe(true)
})

test("execution contracts preserve unknown versus measured zero", () => {
  const zero = { tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }, modelUsd: null, ciUsd: null, ciMs: null, ciRuns: 0, providerMs: 0, toolUses: 0, partial: true }
  expect(Schema.decodeUnknownSync(Board.Metrics)(zero)).toEqual(zero)
  expect(Schema.encodeSync(Board.Metrics)({ ...zero, ciRateBasis: undefined })).toEqual(zero)
  expect(Schema.is(Board.Metrics)({ ...zero, tokens: { ...zero.tokens, input: -1 } })).toBe(false)
  expect(Schema.is(Board.Metrics)({ ...zero, toolUses: Number.NaN })).toBe(false)
})

test("receipt audit attribution and model partialness are additive and omit undefined fields", () => {
  const receipt = { closedAt: 1, stage: "cut" as const, leadTimeMs: 1, attempts: 0, metrics: { tokens: null, modelUsd: null, ciUsd: null, ciMs: null, ciRuns: 0, providerMs: null, toolUses: null, partial: true } }
  expect(Schema.decodeUnknownSync(Board.Receipt)(receipt)).toEqual(receipt)
  expect(Schema.encodeSync(Board.Receipt)({ ...receipt, activityID: undefined, undoneBy: undefined })).toEqual(receipt)
  expect(Schema.decodeUnknownSync(Board.Receipt)({ ...receipt, activityID: "bac_close", undoneBy: "bac_undo" })).toMatchObject({ activityID: "bac_close", undoneBy: "bac_undo" })
  const model = { model: { id: "model", providerID: "provider" }, tokens: null, usd: null, billing: "unavailable" as const }
  const decoded = Schema.decodeUnknownSync(Board.ExecutionModel)(model)
  expect(Schema.encodeSync(Board.ExecutionModel)({ ...decoded, partial: undefined })).toEqual(model)
})

test("usage and cost provenance remain optional for old turns and omit undefined on new contracts", () => {
  const fields = { ...SessionMessage.Assistant.fields }
  expect(Schema.encodeSync(Schema.Struct({ usageKnown: fields.usageKnown, costSource: fields.costSource }))({ usageKnown: undefined, costSource: undefined })).toEqual({})
  const settled = Schema.decodeUnknownSync(SessionEvent.Step.Ended.data)({ sessionID: "ses_schema", assistantMessageID: "msg_schema", timestamp: 1, finish: "stop", cost: 1, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, usageKnown: false, costSource: "catalog" })
  expect(settled).toMatchObject({ usageKnown: false, costSource: "catalog" })
  expect(Schema.is(SessionMessage.CostSource)("catalog")).toBe(true)
  expect(Schema.is(SessionMessage.CostSource)("metered")).toBe(false)
})
