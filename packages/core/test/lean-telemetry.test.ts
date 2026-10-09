import { expect, test } from "bun:test"
import { LeanTelemetry } from "../src/tool/lean-telemetry"
import { Token } from "../src/util/token"

const input: LeanTelemetry.Input = {
  owner: { projectID: "native-project", location: "/repo/worktree", sessionID: "session", callID: "call" },
  model: { provider: "actual-provider", id: "private-model-id" }, orchestraProfile: "seat", filterProfile: "go-test",
  producer: "native-shell", eligible: true, status: "applied", reason: "smaller",
  before: "😀😀", after: "1234567", durationMs: 0.5,
}

test("whole text uses exact UTF-8 bytes and existing UTF-16 token estimate, including negative savings", () => {
  const result = LeanTelemetry.measure(input)
  expect(result?.bytes).toEqual({ before: 8, after: 7, saved: 1 })
  expect(result?.tokens).toEqual({ kind: "estimated", counter: "chars-per-token-4", before: 1, after: 2, saved: -1 })
  expect(LeanTelemetry.measure({ ...input, before: "😀", after: "a" })?.bytes).toEqual({ before: 4, after: 1, saved: 3 })
  expect(result?.model).toEqual(input.model)
  expect(result?.owner).toEqual(input.owner)
  expect(result?.orchestraProfile).toBe("seat")
  expect(result?.filterProfile).toBe("go-test")
  expect(Object.keys(result ?? {}).sort()).toEqual([
    "version", "scope", "owner", "model", "engine", "producer", "eligible", "status", "reason",
    "filterProfile", "orchestraProfile", "bytes", "tokens", "durationMs",
  ].sort())
  if (!result) throw new Error("Valid measurement rejected")
  for (const value of [result, result.owner, result.model, result.bytes, result.tokens]) expect(Object.isFrozen(value)).toBe(true)
  expect(result.owner).not.toBe(input.owner)
})

test("passthrough requires identical text, including same-size changes; zero is observed", () => {
  const value = { ...input, status: "passthrough" as const, eligible: false, producer: "unverified" as const, before: "", after: "" }
  expect(LeanTelemetry.measure(value)?.bytes).toEqual({ before: 0, after: 0, saved: 0 })
  expect(LeanTelemetry.measure(value)?.tokens).toEqual({ kind: "estimated", counter: "chars-per-token-4", before: 0, after: 0, saved: 0 })
  expect(LeanTelemetry.measure({ ...value, before: "x", after: "y" })).toBeUndefined()
  expect(LeanTelemetry.measure({ ...input, status: "normalized" })?.status).toBe("normalized")
})

test("contradictory passthrough eligibility fails open through actual measurement", () => {
  for (const text of ["", "unchanged 😀"]) {
    const value: LeanTelemetry.Input = { ...input, producer: "unverified", status: "passthrough", before: text, after: text }
    expect(LeanTelemetry.measure(value)).toBeUndefined()
    expect(LeanTelemetry.measure({ ...value, eligible: false })?.eligible).toBe(false)
    expect(LeanTelemetry.measure({ ...value, producer: "native-shell" })?.eligible).toBe(true)
  }
})

test("malformed text, ownership, duration and ineligible reductions fail open", () => {
  for (const patch of [
    { before: "\ud800" }, { after: "\udfff" }, { before: "\ud800", after: "\udfff" }, { before: null }, { after: {} },
    { eligible: false }, { producer: "unverified" }, { before: "a", after: "bb" }, { after: input.before },
    { durationMs: Infinity }, { durationMs: NaN }, { durationMs: -1 },
    { owner: { ...input.owner, projectID: "" } }, { owner: { ...input.owner, sessionID: "x".repeat(257) } },
    { model: { ...input.model, id: "x".repeat(257) } }, { reason: "x".repeat(257) },
  ]) expect(LeanTelemetry.measure({ ...input, ...patch } as LeanTelemetry.Input)).toBeUndefined()
  const throwing = Object.defineProperty({ ...input }, "before", { get() { throw new Error("getter") } })
  expect(LeanTelemetry.measure(throwing)).toBeUndefined()
  const revoked = Proxy.revocable(input, {})
  revoked.revoke()
  expect(LeanTelemetry.measure(revoked.proxy)).toBeUndefined()
})

test("actual estimator dependency failure and invalid counts fail open; dependency restored", () => {
  const descriptor = Object.getOwnPropertyDescriptor(Math, "round")!
  try {
    Object.defineProperty(Math, "round", { configurable: true, get() { throw new Error("counter accessor") } })
    expect(LeanTelemetry.measure(input)).toBeUndefined()
    for (const count of [NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      Object.defineProperty(Math, "round", { configurable: true, value: () => count })
      expect(LeanTelemetry.measure(input)).toBeUndefined()
    }
  } finally {
    Object.defineProperty(Math, "round", descriptor)
  }
  expect(Token.estimate("😀")).toBe(1)
})
