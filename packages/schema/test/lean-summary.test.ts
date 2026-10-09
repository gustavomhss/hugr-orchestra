import { describe, expect, test } from "bun:test"
import { LeanMetrics } from "../src/lean-metrics"
import { LeanSummary } from "../src/lean-summary"

function decision(callID = "call", patch: Partial<LeanMetrics.Decision> = {}): LeanMetrics.Decision {
  return {
    version: 1, scope: "standard-registry",
    owner: { projectID: "repo", location: "/repo", sessionID: "session", callID },
    model: { provider: "provider", id: "model" }, engine: "hugr-lean@0.2.0:4e46ae0534937bdf",
    producer: "native-shell", eligible: true, status: "applied", reason: "reduced",
    bytes: { before: 100, after: 20, saved: 80 },
    tokens: { kind: "estimated", counter: "chars-per-token-4", before: 25, after: 5, saved: 20 },
    durationMs: 1, ...patch,
  }
}

function summary(records: readonly unknown[], patch: Partial<LeanSummary.Input> = {}) {
  return LeanSummary.summarize({ projectID: "repo", coverage: "loaded-history", records, ...patch })
}

describe("persisted Lean project summary", () => {
  test("typechecks the actual Schema package", () => {
    const result = Bun.spawnSync(["bun", "typecheck"], { cwd: `${import.meta.dir}/..` })
    if (result.exitCode !== 0) throw new Error(`${result.stdout.toString()}${result.stderr.toString()}`)
    expect(result.exitCode).toBe(0)
  })

  test("uses the real decoder and counts identical replay/fork history once", () => {
    const record = decision()
    expect(LeanMetrics.decode(record)).toEqual(record)
    const replay = JSON.parse(JSON.stringify(record))
    const fork = { ...record, owner: { callID: "call", sessionID: "session", location: "/repo", projectID: "repo" } }
    const records = [record, replay, fork, decision("second")]
    const before = JSON.stringify(records)
    const result = summary(records)
    expect(result).toEqual({
      coverage: "loaded-history", observedCalls: 2, eligibleCalls: 2, appliedCalls: 2,
      bytesSaved: 160, estimatedTokensSaved: 40, estimatedTokenCalls: 2,
      reasons: { reduced: 2 }, filterProfiles: {}, orchestraProfiles: {},
      models: { '["provider","model"]': { calls: 2, bytesSaved: 160, estimatedTokensSaved: 40, estimatedTokenCalls: 2 } },
      latency: { samples: 2, p50: 1, p95: 1, p99: 1 },
    })
    expect(JSON.stringify(records)).toBe(before)
    expect(summary([...records, replay, fork])).toEqual(result)
  })

  test("excludes entire conflicting identity regardless of order or later duplicates", () => {
    const first = decision()
    const conflict = decision("call", { bytes: { before: 100, after: 10, saved: 90 } })
    for (const records of [[first, conflict, first], [conflict, first, conflict]]) {
      expect(summary([...records, decision("good")]).observedCalls).toBe(1)
      expect(summary([...records, decision("good")]).bytesSaved).toBe(80)
    }
    for (const patch of [
      { reason: "other" }, { durationMs: 2 }, { orchestraProfile: "other" },
      { tokens: { kind: "unavailable" } },
    ] satisfies Partial<LeanMetrics.Decision>[]) {
      expect(summary([first, decision("call", patch)]).observedCalls).toBe(0)
    }
    expect(summary([decision("call", { orchestraProfile: "A" }), decision("call", { orchestraProfile: "B" })],
      { orchestraProfile: "A" }).observedCalls).toBe(0)
  })

  test("project-only includes its Sessions/worktrees, excludes foreign repository with same Session", () => {
    const owner = decision().owner
    const records = [decision(),
      decision("call", { owner: { ...owner, location: "/repo-worktree" } }),
      decision("call", { owner: { ...owner, sessionID: "other-session" } }),
      decision("call", { owner: { ...owner, projectID: "foreign" } }),
    ]
    expect(summary(records).observedCalls).toBe(3)
    expect(summary(records).bytesSaved).toBe(240)
    expect(summary(records, { sessionID: "session" }).observedCalls).toBe(2)
    expect(summary(records, { location: "/repo" }).observedCalls).toBe(2)
    expect(summary(records, { location: "/wrong" }).observedCalls).toBe(0)
    expect(summary(records, { sessionID: "absent" }).observedCalls).toBe(0)
    expect(summary(records, { sessionID: "session", location: "/repo" }).observedCalls).toBe(1)
  })

  test("narrows explicit profile and keeps missing profile absent", () => {
    const records = [decision("A", { orchestraProfile: "A", filterProfile: "cargo" }),
      decision("B", { orchestraProfile: "B" }), decision("missing")]
    expect(summary(records, { orchestraProfile: "A" }).observedCalls).toBe(1)
    expect(summary(records, { orchestraProfile: "missing" }).observedCalls).toBe(0)
    expect(Object.keys(summary(records).orchestraProfiles)).toEqual(["A", "B"])
    expect(Object.keys(summary(records).filterProfiles)).toEqual(["cargo"])
  })

  test("keeps estimated-zero versus unavailable evidence in every dimension", () => {
    const zero = { kind: "estimated", counter: "chars-per-token-4", before: 1, after: 1, saved: 0 } as const
    const records = [decision("A", { orchestraProfile: "A", filterProfile: "A", tokens: { kind: "unavailable" } }),
      decision("B", { orchestraProfile: "B", filterProfile: "B", tokens: zero })]
    const result = summary(records)
    const swapped = summary([decision("A", { orchestraProfile: "A", filterProfile: "A", tokens: zero }),
      decision("B", { orchestraProfile: "B", filterProfile: "B", tokens: { kind: "unavailable" } })])
    expect(result.estimatedTokensSaved).toBe(0)
    expect(result.estimatedTokenCalls).toBe(1)
    expect(swapped.estimatedTokenCalls).toBe(1)
    expect(result.models).toEqual(swapped.models)
    for (const groups of [result.orchestraProfiles, result.filterProfiles]) {
      expect(groups.A).toEqual({ calls: 1, bytesSaved: 80, estimatedTokensSaved: 0, estimatedTokenCalls: 0 })
      expect(groups.B).toEqual({ calls: 1, bytesSaved: 80, estimatedTokensSaved: 0, estimatedTokenCalls: 1 })
    }
    expect(swapped.orchestraProfiles.A?.estimatedTokenCalls).toBe(1)
    expect(swapped.filterProfiles.B?.estimatedTokenCalls).toBe(0)
  })

  test("counts all observed reasons, eligibility and both applied statuses", () => {
    const records = [decision(), decision("normalized", { status: "normalized", reason: "normalized" }),
      decision("skipped", { eligible: false, status: "passthrough", reason: "disabled",
        bytes: { before: 100, after: 100, saved: 0 }, tokens: { kind: "unavailable" } })]
    const result = summary(records)
    expect([result.observedCalls, result.eligibleCalls, result.appliedCalls]).toEqual([3, 2, 2])
    expect(result.reasons).toEqual({ reduced: 1, normalized: 1, disabled: 1 })
    expect(result.estimatedTokenCalls).toBe(2)
  })

  test("adds exact bytes and signed estimates, not UTF-8-based token recalculation", () => {
    // Twenty emoji: 80 UTF-8 bytes, 40 UTF-16 units, estimate 10. ASCII: 79 bytes/units, estimate 20.
    const record = decision("negative", { bytes: { before: 80, after: 79, saved: 1 },
      tokens: { kind: "estimated", counter: "chars-per-token-4", before: 10, after: 20, saved: -10 } })
    const result = summary([record])
    expect(result.bytesSaved).toBe(1)
    expect(result.estimatedTokensSaved).toBe(-10)
    expect(result.models['["provider","model"]']?.estimatedTokensSaved).toBe(-10)
  })

  test("rejects malformed values through production decode", () => {
    const record = decision()
    const invalid = [null, undefined, {}, { ...record, version: 2 },
      { ...record, owner: { ...record.owner, projectID: undefined } },
      { ...record, bytes: { before: 100, after: 20, saved: 81 } },
      { ...record, tokens: { kind: "estimated", counter: "fake", before: 25, after: 5, saved: 20 } },
      ...[NaN, Infinity, -1].map((durationMs) => ({ ...record, durationMs }))]
    for (const value of invalid) expect(LeanMetrics.decode(value)).toBeUndefined()
    expect(summary([record, ...invalid])).toEqual(summary([record]))
  })

  test("empty latency is null; coverage is caller evidence", () => {
    expect(summary([])).toEqual({ coverage: "loaded-history", observedCalls: 0, eligibleCalls: 0,
      appliedCalls: 0, bytesSaved: 0, estimatedTokensSaved: 0, estimatedTokenCalls: 0,
      reasons: {}, filterProfiles: {}, orchestraProfiles: {}, models: {},
      latency: { samples: 0, p50: null, p95: null, p99: null } })
    expect(summary([], { coverage: "complete-history" }).coverage).toBe("complete-history")
    expect(summary([decision()]).coverage).toBe("loaded-history")
  })

  test("nearest-rank percentiles use sorted finite samples and hand goldens", () => {
    const records = Array.from({ length: 20 }, (_, i) => decision(String(i), { durationMs: 20 - i }))
    expect(summary(records).latency).toEqual({ samples: 20, p50: 10, p95: 19, p99: 20 })
    expect(summary([decision("a", { durationMs: 9 }), decision("b", { durationMs: 0 }),
      decision("c", { durationMs: 1.5 })]).latency).toEqual({ samples: 3, p50: 1.5, p95: 9, p99: 9 })
    expect(summary([decision("only", { durationMs: 0 })]).latency).toEqual({ samples: 1, p50: 0, p95: 0, p99: 0 })
  })

  test("string-key groups serialize safely and model tuples cannot collide", () => {
    const result = summary([decision("special", { reason: "__proto__", filterProfile: "__proto__",
      orchestraProfile: "__proto__", model: { provider: "a/b", id: "c" } }),
      decision("other", { reason: "constructor", model: { provider: "a", id: "b/c" } })])
    const roundtrip = JSON.parse(JSON.stringify(result))
    expect(roundtrip.reasons).toEqual({ ["__proto__"]: 1, constructor: 1 })
    expect(roundtrip.filterProfiles["__proto__"].calls).toBe(1)
    expect(roundtrip.orchestraProfiles["__proto__"].estimatedTokenCalls).toBe(1)
    expect(Object.keys(roundtrip.models)).toEqual(['["a/b","c"]', '["a","b/c"]'])
    expect(Object.getPrototypeOf(result.reasons)).toBe(Object.prototype)
    expect(Object.hasOwn(result.reasons, "__proto__")).toBe(true)
  })

  test("never silently rounds or clamps unrepresentable aggregate savings", () => {
    const huge = decision("huge", { bytes: { before: Number.MAX_SAFE_INTEGER, after: 0, saved: Number.MAX_SAFE_INTEGER },
      tokens: { kind: "unavailable" } })
    expect(summary([huge]).bytesSaved).toBe(Number.MAX_SAFE_INTEGER)
    expect(() => summary([huge, decision("one")])).toThrow("Lean summary exceeds safe integer range")
  })
})
