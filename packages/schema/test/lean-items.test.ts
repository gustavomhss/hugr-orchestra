import { expect, test } from "bun:test"
import { LeanCoverage } from "../src/lean-coverage"
import { LeanEngine } from "../src/lean-engine"
import { LeanMetrics } from "../src/lean-metrics"

const decision = {
  version: 1, scope: "standard-registry", engine: LeanEngine.current,
  owner: { projectID: "project", location: "/repo/profile", sessionID: "session", callID: "call" },
  model: { provider: "provider", id: "model" }, producer: "native-shell", eligible: true,
  status: "passthrough", reason: "item_disabled", bytes: { before: 8, after: 8, saved: 0 },
  tokens: { kind: "estimated", counter: "chars-per-token-4", before: 1, after: 1, saved: 0 }, durationMs: 0,
} as const

test("every inventory item survives strict detached disabled metadata without a filter profile", () => {
  for (const itemID of LeanCoverage.ids) {
    const result = LeanMetrics.decode({ ...decision, itemID })
    expect(result).toEqual({ ...decision, itemID })
    expect(Object.isFrozen(result)).toBe(true)
    expect(result?.filterProfile).toBeUndefined()
  }
})

test("only accepted engine literals decode; historical records need no itemID", () => {
  for (const engine of LeanEngine.accepted) {
    expect(String(LeanMetrics.decode({ ...decision, engine })?.engine)).toBe(engine)
  }
  expect(LeanMetrics.decode({ ...decision, engine: LeanEngine.legacy })?.itemID).toBeUndefined()
  for (const engine of ["hugr-lean@latest", "hugr-lean@99.0.0:0123456789abcdef", `${LeanEngine.current}0`, null]) {
    expect(LeanMetrics.decode({ ...decision, engine })).toBeUndefined()
  }
})

test("itemID whitelist rejects payloads and unknown IDs; getters read once", () => {
  for (const itemID of ["", "Cargo", "cargo-test", "go test -v .", "unknown", null, {}, 1]) {
    expect(LeanMetrics.decode({ ...decision, itemID })).toBeUndefined()
  }
  const reads = { count: 0 }
  const input = { ...decision, get itemID() {
    if (++reads.count !== 1) throw new Error("itemID read twice")
    return "cargo"
  } }
  expect(LeanMetrics.decode(input)?.itemID).toBe("cargo")
  expect(reads.count).toBe(1)
  expect(LeanMetrics.decode({ ...decision, itemID: "cargo", command: "cargo test" })).toBeUndefined()
  expect(LeanMetrics.decode({ ...decision, itemID: "cargo", output: "secret" })).toBeUndefined()
})

test("item attribution cannot excuse contradictory producer eligibility or passthrough savings", () => {
  expect(LeanMetrics.decode({ ...decision, itemID: "cargo", producer: "unverified" })).toBeUndefined()
  expect(LeanMetrics.decode({ ...decision, itemID: "cargo", producer: "unverified", eligible: false })?.itemID).toBe("cargo")
  expect(LeanMetrics.decode({ ...decision, itemID: "cargo", bytes: { before: 8, after: 7, saved: 1 } })).toBeUndefined()
})

test("known filter profile and item must agree before reading numeric counters", () => {
  expect(LeanMetrics.decode({ ...decision, itemID: "pytest", filterProfile: "pytest" })?.itemID).toBe("pytest")
  const reads = { count: 0 }
  const input = { ...decision, itemID: "cargo", filterProfile: "pytest", bytes: { get before() {
    reads.count++
    throw new Error("invalid identity must not reach counters")
  }, after: 8, saved: 0 } }
  expect(LeanMetrics.decode(input)).toBeUndefined()
  expect(reads.count).toBe(0)
  expect(LeanMetrics.decode({ ...decision, itemID: "cargo", filterProfile: "pytest" })).toBeUndefined()
  // Historical decisions and unknown historical filter labels remain readable.
  expect(LeanMetrics.decode({ ...decision, filterProfile: "pytest" })?.filterProfile).toBe("pytest")
  expect(LeanMetrics.decode({ ...decision, itemID: "go", filterProfile: "go-test" })?.itemID).toBe("go")
})
