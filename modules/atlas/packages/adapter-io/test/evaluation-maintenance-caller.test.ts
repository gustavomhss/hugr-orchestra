import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MaintenanceCallerDescriptor, MaintenanceCallerPorts } from "../src/evaluation-maintenance-caller.js"
import type { MaintenanceHostEnvelope } from "../src/evaluation-maintenance-host.js"
const host = vi.hoisted(() => vi.fn())
vi.mock("../src/evaluation-maintenance-host.js", () => ({ prepareMaintenanceHost: host }))
import { prepareMaintenanceCaller } from "../src/evaluation-maintenance-caller.js"
// Only caller boundary guards are tested here. No claim to exercise native semantics.
function fixture() {
  const keys = Array.from({ length: 15 }, (_, i) => `synthetic-${i}`)
  const entries = keys.map(key => ({ key, dependencies: [] }))
  const p = { baseline: { candidate_id: "baseline", candidate: { entries } }, manifest: "manifest",
    context: { generation: "old" }, store: {}, observe: vi.fn(), readCapturedBytes: vi.fn(),
    listMembers: vi.fn(), semanticEvidence: vi.fn() } as unknown as MaintenanceCallerPorts
  const e = { targetRoot: "/synthetic/new", targetGeneration: "new" } as MaintenanceHostEnvelope
  const d: MaintenanceCallerDescriptor = { schema: "evaluation-maintenance-caller/v1", baselineCandidate: "baseline",
    baselineManifest: "manifest", baselineGeneration: "old", targetRoot: e.targetRoot, targetGeneration: e.targetGeneration as MaintenanceCallerDescriptor["targetGeneration"],
    recipes: keys.map(key => ({ key, recipeInputKey: "file:recipe", recipeVersion: "v1", declaredInputs: ["file:recipe"], required: [] })),
    produced: [{ key: keys[0]!, capturedVersions: [{ key: "file:recipe", version: "v1" }], dependencies: [], output: { body: "synthetic output" } }] }
  return { p, e, d }
}
const input = () => ({ captured: new Map([["file:recipe", { kind: "present" as const, version: "v1" }]]), bytes: new Map(), lists: new Map(), dependencies: new Map() })
beforeEach(() => { host.mockReset() })
describe("maintenance caller only", () => {
  it("forwards ports and complete registry, returns HOLD unchanged", () => {
    const { p, e, d } = fixture(), hold = { kind: "hold", reason: "synthetic" }
    host.mockReturnValue(hold)
    expect(prepareMaintenanceCaller(e, d, p)).toBe(hold)
    const [actualEnvelope, request] = host.mock.calls[0]!
    expect(actualEnvelope).toBe(e)
    for (const k of ["store", "baseline", "manifest", "context", "observe", "readCapturedBytes", "listMembers", "semanticEvidence"] as const) expect(request[k]).toBe(p[k])
    expect(request.recipes.size).toBe(15)
    expect(request.targetRepoRoot).toBe(d.targetRoot)
    expect(request.targetGeneration).toBe(d.targetGeneration)
    expect(host).toHaveBeenCalledTimes(1)
  })
  it.each(["baselineCandidate", "baselineManifest", "baselineGeneration", "targetRoot", "targetGeneration"] as const)("rejects %s before host", field => {
    const { p, e, d } = fixture()
    expect(() => prepareMaintenanceCaller(e, { ...d, [field]: "different" }, p)).toThrow("maintenance-caller-descriptor-binding")
    expect(host).not.toHaveBeenCalled()
  })
  it.each(["missing", "duplicate", "extra"])("rejects %s registry before host", mode => {
    const { p, e, d } = fixture(), recipes = [...d.recipes]
    if (mode === "missing") recipes.pop()
    else if (mode === "duplicate") recipes[14] = recipes[0]!
    else recipes.push({ ...recipes[0]!, key: "extra" })
    expect(() => prepareMaintenanceCaller(e, { ...d, recipes }, p)).toThrow("maintenance-caller-registry")
    expect(host).not.toHaveBeenCalled()
  })
  it("rejects changed edge before host", () => {
    const { p, e, d } = fixture(), recipes = [...d.recipes]
    recipes[0] = { ...recipes[0]!, required: ["synthetic-1"] }
    expect(() => prepareMaintenanceCaller(e, { ...d, recipes }, p)).toThrow("maintenance-caller-topology")
    expect(host).not.toHaveBeenCalled()
  })
  it.each(["duplicate", "unknown"])("rejects %s production key", mode => {
    const { p, e, d } = fixture()
    const produced = mode === "duplicate" ? [...d.produced, d.produced[0]!] : [{ ...d.produced[0]!, key: "unknown" }]
    expect(() => prepareMaintenanceCaller(e, { ...d, produced }, p)).toThrow("maintenance-caller-produced-coverage")
    expect(host).not.toHaveBeenCalled()
  })
  it("delivers frozen output only if callback is requested", () => {
    const { p, e, d } = fixture()
    host.mockImplementation((_, req) => req.recipes.get("synthetic-0").run(input()))
    const result = prepareMaintenanceCaller(e, d, p)
    expect(result).toEqual({ body: "synthetic output" })
    expect(Object.hasOwn(result, "gaps")).toBe(false)
    expect(Object.hasOwn(result, "evidence")).toBe(false)
  })
  it("copies present gaps and evidence without aliasing production arrays", () => {
    const { p, e, d } = fixture()
    const gaps = ["synthetic gap"], evidence = ["synthetic evidence"]
    const produced = [{ ...d.produced[0]!, output: { body: "synthetic output", gaps, evidence } }]
    host.mockImplementation((_, req) => req.recipes.get("synthetic-0").run(input()))
    prepareMaintenanceCaller(e, { ...d, produced }, p)
    const result = host.mock.results[0]!.value
    expect(result.gaps).toEqual(gaps)
    expect(result.evidence).toEqual(evidence)
    expect(result.gaps).not.toBe(gaps)
    expect(result.evidence).not.toBe(evidence)
    result.gaps.push("changed")
    result.evidence.push("changed")
    expect(gaps).toEqual(["synthetic gap"])
    expect(evidence).toEqual(["synthetic evidence"])
  })
  it("refuses absent production when callback requested", () => {
    const { p, e, d } = fixture()
    host.mockImplementation((_, req) => req.recipes.get("synthetic-1").run(input()))
    expect(() => prepareMaintenanceCaller(e, d, p)).toThrow("maintenance-caller-missing-production")
  })
  it("rejects capture version drift", () => {
    const { p, e, d } = fixture(), snapshot = input()
    snapshot.captured.set("file:recipe", { kind: "present", version: "v2" })
    host.mockImplementation((_, req) => req.recipes.get("synthetic-0").run(snapshot))
    expect(() => prepareMaintenanceCaller(e, d, p)).toThrow("maintenance-caller-production-input-binding")
  })
  it("rejects dependency result drift with same key", () => {
    const { p, e, d } = fixture(), snapshot = input()
    snapshot.dependencies.set("synthetic-1", "actual")
    const produced = [{ ...d.produced[0]!, dependencies: [{ key: "synthetic-1", result: "different" }] }]
    host.mockImplementation((_, req) => req.recipes.get("synthetic-0").run(snapshot))
    expect(() => prepareMaintenanceCaller(e, { ...d, produced }, p)).toThrow("maintenance-caller-production-dependency-binding")
  })
})

// Additional boundary negatives; host remains mocked, not native integration.
describe("maintenance caller set boundaries", () => {
  it("rejects unknown schema before host", () => {
    const { p, e, d } = fixture()
    expect(() => prepareMaintenanceCaller(e, { ...d, schema: "unknown" } as unknown as MaintenanceCallerDescriptor, p)).toThrow("maintenance-caller-descriptor-binding")
    expect(host).not.toHaveBeenCalled()
  })
  it.each(["short", "duplicate"])("rejects %s baseline registry", mode => {
    const { p, e, d } = fixture(), entries = [...p.baseline.candidate.entries]
    if (mode === "short") entries.pop()
    else entries[14] = entries[0]!
    const changed = { ...p, baseline: { ...p.baseline, candidate: { ...p.baseline.candidate, entries } } }
    expect(() => prepareMaintenanceCaller(e, d, changed)).toThrow("maintenance-caller-registry")
    expect(host).not.toHaveBeenCalled()
  })
  it.each(["missing", "duplicate"])("rejects %s dependency edge", mode => {
    const { p, e, d } = fixture(), entries = [...p.baseline.candidate.entries], recipes = [...d.recipes]
    entries[0] = { ...entries[0]!, dependencies: [{ key: "synthetic-1", result: "baseline-result" as MaintenanceCallerPorts["manifest"] }] }
    recipes[0] = { ...recipes[0]!, required: mode === "missing" ? [] : ["synthetic-1", "synthetic-1"] }
    const changed = { ...p, baseline: { ...p.baseline, candidate: { ...p.baseline.candidate, entries } } }
    expect(() => prepareMaintenanceCaller(e, { ...d, recipes }, changed)).toThrow("maintenance-caller-topology")
    expect(host).not.toHaveBeenCalled()
  })
  it.each(["missing", "extra", "duplicate"])("rejects %s capture binding", mode => {
    const { p, e, d } = fixture(), record = d.produced[0]!
    const capturedVersions = mode === "missing" ? [] : [...record.capturedVersions,
      mode === "extra" ? { key: "file:unknown", version: "v1" } : record.capturedVersions[0]!]
    host.mockImplementation((_, req) => req.recipes.get("synthetic-0").run(input()))
    expect(() => prepareMaintenanceCaller(e, { ...d, produced: [{ ...record, capturedVersions }] }, p)).toThrow("maintenance-caller-production-input-binding")
  })
  it.each(["missing", "extra", "duplicate"])("rejects %s produced dependency binding", mode => {
    const { p, e, d } = fixture(), snapshot = input(), record = d.produced[0]!
    snapshot.dependencies.set("synthetic-1", "actual")
    const dependency = { key: "synthetic-1", result: "actual" }
    const dependencies = mode === "missing" ? [] : [dependency, mode === "extra" ? { key: "unknown", result: "actual" } : dependency]
    host.mockImplementation((_, req) => req.recipes.get("synthetic-0").run(snapshot))
    expect(() => prepareMaintenanceCaller(e, { ...d, produced: [{ ...record, dependencies }] }, p)).toThrow("maintenance-caller-production-dependency-binding")
  })
  it("allows empty production when host requests no callbacks", () => {
    const { p, e, d } = fixture(), envelope = { result: { kind: "hold" }, accounting: { recipeCalls: [] }, releaseReference: "synthetic" }
    host.mockReturnValue(envelope)
    expect(prepareMaintenanceCaller(e, { ...d, produced: [] }, p)).toBe(envelope)
    expect(host).toHaveBeenCalledTimes(1)
  })
  it("preserves blocked validity and authority basis without interpreting them", () => {
    const { p, e, d } = fixture(), output = { body: "blocked body", validity: "blocked" as const, authorityBasis: "synthetic-only", gaps: ["blocked"] }
    host.mockImplementation((_, req) => req.recipes.get("synthetic-0").run(input()))
    expect(prepareMaintenanceCaller(e, { ...d, produced: [{ ...d.produced[0]!, output }] }, p)).toEqual(output)
  })
  it("supplies two requested productions with exact dependency bindings", () => {
    const { p, e, d } = fixture(), first = d.produced[0]!, next = input()
    next.dependencies.set("synthetic-0", "first-result")
    const second = { ...first, key: "synthetic-1", dependencies: [{ key: "synthetic-0", result: "first-result" }], output: { body: "second output" } }
    host.mockImplementation((_, req) => [req.recipes.get("synthetic-0").run(input()), req.recipes.get("synthetic-1").run(next)])
    expect(prepareMaintenanceCaller(e, { ...d, produced: [first, second] }, p)).toEqual([first.output, second.output])
  })
})
