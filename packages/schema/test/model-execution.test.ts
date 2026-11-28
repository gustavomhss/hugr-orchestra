import { expect, test } from "bun:test"
import { Schema } from "effect"
import { Model } from "../src/model"
import { Provider } from "../src/provider"
import { Session } from "../src/session"

// API RED stays inside each body; no absent import can erase the HTTP control/behavioral files.
const future = (await Bun.file(new URL("../src/model-execution.ts", import.meta.url)).exists())
  ? await import("../src/model-execution")
  : undefined
const wire = () => {
  if (!future) throw new Error("API RED E6 wire: shared ModelExecution schemas are absent")
  return future.ModelExecution
}
const ref = Model.Ref.make({
  providerID: Provider.ID.make("openai"),
  id: Model.ID.make("wire-model"),
  variant: Model.VariantID.make("high"),
})

test("API E6 wire: Reason is the closed eleven-value model decision set", () => {
  const decode = Schema.decodeUnknownSync(wire().Reason)
  for (const reason of [
    "model-missing",
    "model-disabled",
    "connection-unavailable",
    "model-denied",
    "unsupported-api",
    "invalid-options",
    "variant-unavailable",
    "host-unregistered",
    "host-unavailable",
    "host-model-unsupported",
    "host-options-unsupported",
  ] as const)
    expect(decode(reason)).toBe(reason)
  for (const reason of ["agent-missing", "storage-unavailable", "invalid-session-chain", "unknown"])
    expect(() => decode(reason)).toThrow()
})

test("API E6 wire: Decision discriminates ready from required non-ready reasons", () => {
  const decode = Schema.decodeUnknownSync(wire().Decision, { onExcessProperty: "error" })
  expect(decode({ status: "ready" })).toEqual({ status: "ready" })
  for (const status of ["unsupported", "unavailable"] as const) {
    expect(decode({ status, reason: "model-missing" })).toEqual({ status, reason: "model-missing" })
    expect(() => decode({ status })).toThrow()
  }
  for (const value of [
    { status: "ready", reason: "model-missing" },
    { status: "ready", reason: null },
    { status: "unknown" },
    { status: "unavailable", reason: "agent-missing" },
  ])
    expect(() => decode(value)).toThrow()
})

test("API E6 wire: Input accepts Session or draft context and omits undefined optional properties", () => {
  const contract = wire().Input
  const decode = Schema.decodeUnknownSync(contract)
  expect(decode({ context: { type: "session", sessionID: "ses_wire", agentID: "host-seat" }, model: ref })).toEqual({
    context: { type: "session", sessionID: Session.ID.make("ses_wire"), agentID: "host-seat" },
    model: ref,
  })
  expect(
    Schema.encodeSync(contract)({
      context: { type: "draft", agentID: undefined, parentID: undefined },
      model: undefined,
    }),
  ).toEqual({ context: { type: "draft" } })
  expect(decode({ context: { type: "draft", parentID: "ses_parent" } })).toEqual({
    context: { type: "draft", parentID: Session.ID.make("ses_parent") },
  })
  for (const context of [
    { type: "session" },
    { type: "draft", agentID: 0 },
    { type: "draft", parentID: false },
    { type: "invalid" },
  ])
    expect(() => decode({ context })).toThrow()
})

test("API E6 wire: Entry requires real Model.Info; Selection can preserve a missing Ref without fabricating Info", () => {
  const model = Model.Info.empty(Provider.ID.make(ref.providerID), Model.ID.make(ref.id))
  const entry = { model: Schema.encodeSync(Model.Info)(model), engine: "orchestra", status: "ready" as const }
  const selection = {
    ref: { ...ref, id: Model.ID.make("missing") },
    engine: "claude-code",
    status: "unavailable" as const,
    reason: "model-missing" as const,
  }
  const decoded = Schema.decodeUnknownSync(wire().Response)({ models: [entry], selection })
  expect(decoded.models[0].model).toEqual(model)
  expect(decoded.selection).toEqual(selection)
  expect(Schema.encodeSync(wire().Response)(decoded)).toEqual({ models: [entry], selection })
  expect(() => Schema.decodeUnknownSync(wire().Entry)({ ...selection, model: undefined })).toThrow()
  expect(Schema.decodeUnknownSync(wire().Selection)(selection)).not.toHaveProperty("model")
  expect(Schema.encodeSync(wire().Response)({ models: [], selection: undefined })).toEqual({ models: [] })
})

test("API E6 wire: shared public schemas have distinct stable identifiers and plain record values", () => {
  const schemas = [wire().Reason, wire().Decision, wire().Input, wire().Response, wire().Entry, wire().Selection]
  const identifiers = schemas.map((schema) => schema.ast.annotations?.identifier)
  expect(identifiers).toEqual([
    "ModelExecution.Reason",
    "ModelExecution.Decision",
    "ModelExecution.Input",
    "ModelExecution.Response",
    "ModelExecution.Entry",
    "ModelExecution.Selection",
  ])
  expect(new Set(identifiers).size).toBe(schemas.length)
  expect(Object.getPrototypeOf(Schema.decodeUnknownSync(wire().Input)({ context: { type: "draft" } }))).toBe(
    Object.prototype,
  )
  expect(Schema.decodeUnknownSync(Session.ID)("ses_wire")).toBe(Session.ID.make("ses_wire"))
})
