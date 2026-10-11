import { expect, test } from "bun:test"
import { LeanMetrics } from "../src/lean-metrics"

const decision: LeanMetrics.Decision = {
  version: 1, scope: "standard-registry", engine: "hugr-lean@0.2.0:4e46ae0534937bdf",
  owner: { projectID: "native-project", location: "/repo/worktree", sessionID: "session", callID: "call" },
  model: { provider: "actual-provider", id: "private-model-id" }, orchestraProfile: "seat", filterProfile: "go-test",
  producer: "native-shell", eligible: true, status: "applied", reason: "smaller",
  bytes: { before: 8, after: 7, saved: 1 },
  tokens: { kind: "estimated", counter: "chars-per-token-4", before: 1, after: 2, saved: -1 }, durationMs: 0.25,
}

test("decode detaches and freezes every record; signed estimates and distinct dimensions survive", () => {
  const value = { ...decision, owner: { ...decision.owner } }
  const result = LeanMetrics.decode(value)
  expect(result).toEqual(decision)
  if (!result) throw new Error("Valid decision rejected")
  for (const key of ["owner", "model", "bytes", "tokens"] as const) {
    expect(result[key]).not.toBe(value[key])
    expect(Object.isFrozen(result[key])).toBe(true)
  }
  expect(Object.isFrozen(result)).toBe(true)
  value.owner.projectID = "changed"
  expect(result.owner.projectID).toBe("native-project")
  expect(LeanMetrics.decode({ ...decision, owner: { ...decision.owner, projectID: "foreign" } })?.owner.projectID).toBe("foreign")
})

test("zero passthrough and unavailable tokens remain honest", () => {
  const value: LeanMetrics.Decision = { ...decision, producer: "unverified", eligible: false, status: "passthrough",
    bytes: { before: 0, after: 0, saved: 0 }, tokens: { kind: "unavailable" } }
  expect(LeanMetrics.decode(value)).toEqual(value)
  const { orchestraProfile, filterProfile, ...absent } = value
  expect(Object.keys(LeanMetrics.decode(absent) ?? {})).not.toContain("orchestraProfile")
  expect(LeanMetrics.decode({ ...decision, status: "normalized" })?.status).toBe("normalized")
})

test("contradictory passthrough eligibility requires native-shell for every token kind", () => {
  for (const tokens of [
    { kind: "unavailable" as const },
    { kind: "estimated" as const, counter: "chars-per-token-4" as const, before: 1, after: 1, saved: 0 },
  ]) {
    const value: LeanMetrics.Decision = { ...decision, producer: "unverified", status: "passthrough",
      bytes: { before: 4, after: 4, saved: 0 }, tokens }
    expect(LeanMetrics.decode(value)).toBeUndefined()
    expect(LeanMetrics.decode({ ...value, eligible: false })?.eligible).toBe(false)
    expect(LeanMetrics.decode({ ...value, producer: "native-shell" })?.eligible).toBe(true)
  }
})

test("inclusive owner/string and safe integer limits accept valid boundary records", () => {
  const value = { ...decision, owner: { projectID: "p".repeat(256), location: "l".repeat(4096), sessionID: "s".repeat(256), callID: "c".repeat(256) },
    model: { provider: "p".repeat(256), id: "m".repeat(256) }, reason: "r".repeat(256), filterProfile: "f".repeat(256), orchestraProfile: "o".repeat(256),
    bytes: { before: Number.MAX_SAFE_INTEGER, after: 0, saved: Number.MAX_SAFE_INTEGER },
    tokens: { kind: "estimated" as const, counter: "chars-per-token-4" as const, before: 0, after: Number.MAX_SAFE_INTEGER, saved: -Number.MAX_SAFE_INTEGER } }
  expect(LeanMetrics.decode(value)).toEqual(value)
})

test("counterfeit contracts, unsafe numbers and raw payload fields are rejected", () => {
  for (const patch of [
    { version: 2 }, { scope: "all-tools" }, { engine: "hugr-lean@latest" }, { producer: "sdk" },
    { status: "reduced" }, { eligible: false }, { producer: "unverified" }, { eligible: 1 },
    { durationMs: NaN }, { durationMs: Infinity }, { durationMs: -1 }, { reason: "" },
    { reason: "x".repeat(257) }, { orchestraProfile: "" }, { filterProfile: "x".repeat(257) },
    { bytes: { before: 8, after: 7, saved: 2 } }, { bytes: { before: 7, after: 8, saved: -1 } },
    { bytes: { before: 8, after: 8, saved: 0 } }, { status: "passthrough" },
    { bytes: { before: Number.MAX_SAFE_INTEGER + 1, after: 7, saved: 1 } },
    { bytes: { before: -1, after: 7, saved: -8 } }, { bytes: { before: 8.5, after: 7, saved: 1.5 } },
    { tokens: { kind: "exact", before: 1, after: 2, saved: -1 } },
    { tokens: { kind: "estimated", counter: "provider-tokenizer", before: 1, after: 2, saved: -1 } },
    { tokens: { ...decision.tokens, saved: 0 } }, { tokens: { ...decision.tokens, after: Infinity } },
    { tokens: { kind: "unavailable", before: 0 } },
    { output: "raw" }, { command: "raw" }, { auth: "secret" }, { transcript: "raw" },
    { owner: { ...decision.owner, projectID: "" } }, { owner: { ...decision.owner, location: "x".repeat(4097) } },
    { owner: { ...decision.owner, callID: "x".repeat(257) } },
    { model: { ...decision.model, provider: "" } }, { model: { ...decision.model, id: "\ud800" } },
    { model: { ...decision.model, output: "raw" } }, { bytes: { ...decision.bytes, raw: "raw" } },
  ]) expect(LeanMetrics.decode({ ...decision, ...patch })).toBeUndefined()
  for (const value of [null, undefined, [], 1, "decision", Object.create(decision)])
    expect(LeanMetrics.decode(value)).toBeUndefined()
  expect(LeanMetrics.decode({ ...decision, [Symbol("raw")]: "secret" })).toBeUndefined()
})

test("whitelisted accessors read once; throwing and revoked proxies fail open", () => {
  const reads = new Map<PropertyKey, number>()
  const value = new Proxy(decision, { get(target, key, receiver) {
    reads.set(key, (reads.get(key) ?? 0) + 1)
    if (reads.get(key)! > 1) throw new Error("Repeated read")
    return Reflect.get(target, key, receiver)
  } })
  expect(LeanMetrics.decode(value)).toEqual(decision)
  expect([...reads.values()].every((count) => count === 1)).toBe(true)
  const throwing = Object.defineProperty({ ...decision }, "owner", { get() { throw new Error("getter") } })
  expect(LeanMetrics.decode(throwing)).toBeUndefined()
  const revoked = Proxy.revocable({}, {})
  revoked.revoke()
  expect(LeanMetrics.decode(revoked.proxy)).toBeUndefined()
  expect(LeanMetrics.decode({ ...decision, model: revoked.proxy })).toBeUndefined()
  expect(LeanMetrics.decode(Object.defineProperty({ ...decision }, "raw", { value: "hidden" }))).toBeUndefined()
})
