import { describe, expect, test } from "bun:test"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewLedger } from "../../src/review/ledger"

const thresholds = ReviewCatalog.current.route.ledger

const pack = {
  id: "gitleaks",
  tool: "gitleaks",
  version: "8.18.4",
  pin: { source: "backend-toolkit/packs/gitleaks", integrity: { "darwin-arm64": "sha256-a", "linux-x64": "sha256-b" } },
  licence: "pinned",
  backend: "pinned",
  languages: "any",
  detection: { manifests: [], extensions: [], absent: [] },
  lane: "no-build",
  tiers: ["quick"],
  output: { format: "sarif" },
  cost: "low",
  network: { kind: "none" },
  scratchWrites: false,
  template: "gitleaks-dir-sarif",
  lenses: ["security"],
  status: "probation",
} satisfies ReviewCatalog.Catalog["packs"][number]

const rule = {
  pack: "gitleaks",
  rule: "*",
  class: "security.secret",
  lens: "security",
  severity: { "*": "P1" },
  triage: "A live credential.",
  status: "probation",
  cwe: "CWE-798",
} satisfies ReviewCatalog.Catalog["rules"][number]

function read(
  fingerprint: string,
  outcome: ReviewLedger.Read["outcome"] = "confirmed",
  over: Partial<ReviewLedger.Read> = {},
): ReviewLedger.Read {
  return { pack: "gitleaks", rule: "secret", generation: "gen-1", fingerprint, outcome, ...over }
}

function sequence(items: readonly ReviewLedger.Read[], project = "alpha", start = 1): ReviewLedger.Batch[] {
  return items.map((item, index) => ({
    id: `${project}-${start + index}`,
    project,
    order: start + index,
    reads: [item],
  }))
}

function ask(batches: readonly ReviewLedger.Batch[], over: Partial<ReviewLedger.Query> = {}) {
  return ReviewLedger.status(batches, {
    project: "alpha",
    pack: "gitleaks",
    rule: "secret",
    generation: "gen-1",
    repository: false,
    cost: "low",
    thresholds,
    ...over,
  })
}

function failure(run: () => void) {
  try {
    run()
  } catch (error) {
    if (error instanceof Error) return error.name
    throw error
  }
  return "did-not-fail"
}

function many(count: number, prefix: string, outcome: ReviewLedger.Read["outcome"] = "confirmed") {
  return Array.from({ length: count }, (_, index) => read(`${prefix}${index}`, outcome))
}

function opened(extra: readonly ReviewLedger.Read[] = []) {
  return [...many(3, "c"), ...many(17, "r", "refuted"), ...extra]
}

function edited(
  packOver: Partial<ReviewCatalog.Catalog["packs"][number]> = {},
  ruleOver: Partial<ReviewCatalog.Catalog["rules"][number]> = {},
) {
  return ReviewLedger.generation({ ...pack, ...packOver }, { ...rule, ...ruleOver })
}

describe("ReviewLedger.generation", () => {
  test("binds the rule tuple and ignores status and unrelated edits", () => {
    const base = ReviewLedger.generation(pack, rule)
    expect(base).toMatch(/^[0-9a-f]{64}$/)
    expect(edited({ status: "dropped" }, { status: "active" })).toBe(base)
    expect(edited({
      licence: "never",
      cost: "high",
      lenses: ["tests"],
      languages: ["py", "go"],
      lane: "build",
      detection: { manifests: ["package.json"], extensions: [".ts"], absent: ["BUILD.bazel"] },
      tiers: ["deep", "quick"],
    })).toBe(base)
    expect(edited(
      { pin: { source: "backend-toolkit/packs/gitleaks", integrity: { "linux-x64": "sha256-b", "darwin-arm64": "sha256-a" } } },
      { severity: { high: "P0", "*": "P1" } },
    )).toBe(edited({}, { severity: { "*": "P1", high: "P0" } }))
    expect(edited({ version: "9" })).not.toBe(base)
    expect(edited({ tool: "other" })).not.toBe(base)
    expect(edited({ backend: "path" })).not.toBe(base)
    expect(edited({ template: "other" })).not.toBe(base)
    expect(edited({ output: { format: "json", parser: "repo-gate" } })).not.toBe(base)
    expect(edited({ network: { kind: "offline-db", database: "db" } })).not.toBe(base)
    expect(edited({ scratchWrites: true })).not.toBe(base)
    const { pin, ...unpinned } = pack
    expect(pin.source).toBe("backend-toolkit/packs/gitleaks")
    expect(ReviewLedger.generation(unpinned, rule)).not.toBe(base)
    expect(edited({}, { triage: "other" })).not.toBe(base)
    expect(edited({}, { class: "other" })).not.toBe(base)
    expect(edited({}, { cwe: "CWE-79" })).not.toBe(base)
    expect(edited({}, { rule: "other" })).not.toBe(base)
    const { cwe, ...without } = rule
    expect(cwe).toBe("CWE-798")
    expect(ReviewLedger.generation(pack, without)).not.toBe(base)
  })
})

describe("ReviewLedger.status", () => {
  test("uses the catalog ledger thresholds", () => {
    expect(thresholds).toEqual({
      activate: { read: 20, confirmed: 0.5 },
      demote: { window: 20, confirmedBelow: 0.2 },
      drop: { window: 20, highCostWindow: 10 },
    })
  })

  test("19 reads stay on probation; 9/20 does not activate and 10/20 does", () => {
    expect(ask(sequence(many(19, "c")))).toBe("probation")
    expect(ask(sequence([...many(9, "c"), ...many(11, "r", "refuted")]))).toBe("probation")
    expect(ask(sequence([...many(10, "c"), ...many(10, "r", "refuted")]))).toBe("active")
    expect(ask(sequence([...many(10, "c"), ...many(10, "u", "not-pursued")]))).toBe("active")
  })

  test("3/20 demotes and exactly 4/20 does not", () => {
    expect(ask(sequence(opened()))).toBe("demoted")
    expect(ask(sequence([...many(4, "c"), ...many(16, "r", "refuted")]))).toBe("probation")
  })

  test("zero of twenty is below a tiny positive share", () => {
    expect(ask(sequence(many(20, "r", "refuted")), {
      thresholds: { ...thresholds, demote: { window: 20, confirmedBelow: 1e-10 } },
    })).toBe("demoted")
  })

  test("trailing 4/20 after activation stays active; trailing 3/20 demotes without dropping", () => {
    expect(ask(sequence([...many(20, "c"), ...many(16, "r", "refuted")]))).toBe("active")
    expect(ask(sequence([...many(20, "c"), ...many(17, "r", "refuted")]))).toBe("demoted")
  })

  test("activation wins when the same step also meets demotion", () => {
    expect(ask(sequence([...many(4, "c"), ...many(16, "r", "refuted")]), {
      thresholds: { activate: { read: 20, confirmed: 0.1 }, demote: { window: 20, confirmedBelow: 0.5 }, drop: thresholds.drop },
    })).toBe("active")
  })

  test("an earlier demotion cannot be overridden by a later activation threshold", () => {
    const reads = [...many(20, "c"), ...many(20, "r", "refuted")]
    const overlap = { activate: { read: 40, confirmed: 0.5 }, demote: { window: 20, confirmedBelow: 0.5 }, drop: thresholds.drop }
    expect(ask(sequence(reads.slice(0, 30)), { thresholds: overlap })).toBe("probation")
    expect(ask(sequence(reads.slice(0, 31)), { thresholds: overlap })).toBe("demoted")
    expect(ask(sequence(reads), { thresholds: overlap })).toBe("demoted")
  })

  test("a demoted generation does not reactivate", () => {
    expect(ask(sequence([...opened(), ...many(20, "n")]))).toBe("demoted")
  })

  test("ordinary 19/20 and high-cost 9/10 post-demotion windows stay; the completed window drops", () => {
    const repeat = (count: number) => Array.from({ length: count }, () => read("c0"))
    expect(ask(sequence([...opened(), ...repeat(19)]))).toBe("demoted")
    expect(ask(sequence([...opened(), ...repeat(20)]))).toBe("dropped")
    expect(ask(sequence([...opened(), ...repeat(19)]), { cost: "medium" })).toBe("demoted")
    expect(ask(sequence([...opened(), ...repeat(20)]), { cost: "medium" })).toBe("dropped")
    expect(ask(sequence([...opened(), ...repeat(9)]), { cost: "high" })).toBe("demoted")
    expect(ask(sequence([...opened(), ...repeat(10)]), { cost: "high" })).toBe("dropped")
  })

  test("a new fingerprint holds demotion; a later window of old fingerprints drops", () => {
    const repeat = (count: number) => Array.from({ length: count }, () => read("c0"))
    expect(ask(sequence([...opened(), ...repeat(19), read("fresh")]))).toBe("demoted")
    expect(ask(sequence([...opened(), ...repeat(19), read("fresh"), ...repeat(20)]))).toBe("dropped")
    expect(ask(sequence([...opened(), ...many(20, "u", "not-pursued")]))).toBe("dropped")
  })

  test("entering demotion does not drop in that step", () => {
    const tight = { ...thresholds, drop: { window: 1, highCostWindow: 1 } }
    expect(ask(sequence(opened()), { thresholds: tight })).toBe("demoted")
    expect(ask(sequence([...opened(), read("c0")]), { thresholds: tight })).toBe("dropped")
  })

  test("dropped stays dropped until another generation starts probation", () => {
    const dropped = sequence([...opened(), ...Array.from({ length: 20 }, () => read("c0"))])
    const revived = [
      ...dropped,
      ...sequence([
        ...many(10, "n").map((item) => ({ ...item, generation: "gen-2" })),
        ...many(10, "x", "refuted").map((item) => ({ ...item, generation: "gen-2" })),
      ], "alpha", dropped.length + 1),
    ]
    expect(ask(revived)).toBe("dropped")
    expect(ask([...revived, ...sequence(many(20, "z"), "alpha", revived.length + 1)])).toBe("dropped")
    expect(ask(revived, { generation: "gen-2" })).toBe("active")
    expect(ask(revived, { generation: "gen-3" })).toBe("probation")
  })

  test("the first local read starts probation instead of inheriting the global prior", () => {
    const prior = sequence(many(20, "c"), "beta")
    expect(ask(prior, { project: "alpha" })).toBe("active")
    expect(ask(prior, { project: "beta" })).toBe("active")
    const local = [...prior, ...sequence([read("local", "refuted")], "alpha", 21)]
    expect(ask(local, { project: "alpha" })).toBe("probation")
    expect(ask(local, { project: "beta" })).toBe("active")
    expect(ask(sequence(opened(), "beta"), { project: "alpha" })).toBe("demoted")
    expect(ask([...sequence(opened(), "beta"), ...sequence([read("local")], "alpha", 21)], { project: "alpha" })).toBe("probation")
  })

  test("global uniqueness is project and fingerprint; a same-project repeat is not new", () => {
    const prior = sequence(opened(), "beta")
    expect(ask([...prior, ...sequence(Array.from({ length: 20 }, () => read("c0")), "gamma", 21)], { project: "alpha" })).toBe("demoted")
    expect(ask([...prior, ...sequence(Array.from({ length: 20 }, () => read("c0")), "beta", 21)], { project: "alpha" })).toBe("dropped")
  })

  test("the same rule id in another pack is a different rule", () => {
    const here = sequence([...many(10, "c"), ...many(10, "r", "refuted")])
    const there = sequence(opened().map((item) => ({ ...item, pack: "other" })), "alpha", 21)
    expect(ask([...here, ...there])).toBe("active")
    expect(ask([...here, ...there], { pack: "other" })).toBe("demoted")
  })

  test("a repository pack is active only after admission", () => {
    expect(ask(sequence(opened()), { repository: true })).toBe("active")
    expect(ask([], { repository: true })).toBe("active")
    expect(failure(() => ask([{ id: "a", project: "alpha", order: 0, reads: [] }], { repository: true }))).toBe("precision-invalid")
    expect(failure(() => ask([
      { id: "a", project: "alpha", order: 1, reads: [] },
      { id: "b", project: "alpha", order: 1, reads: [] },
    ], { repository: true }))).toBe("precision-conflict")
  })

  test("exact retries dedupe, including reversed reads, and conflicts fail", () => {
    const items = many(19, "c")
    const once = { id: "a", project: "alpha", order: 1, reads: items }
    expect(ask([once])).toBe("probation")
    expect(ask([once, { ...once, reads: [...items].reverse() }])).toBe("probation")
    expect(ask([once, { ...once, reads: [...items, items[0]] }])).toBe("probation")
    expect(ask([{ ...once, reads: [...items, items[0]] }])).toBe("probation")
    expect(failure(() => ask([{ ...once, reads: [read("c0"), read("c0", "refuted")] }]))).toBe("precision-conflict")
    expect(failure(() => ask([once, { ...once, order: 2 }]))).toBe("precision-conflict")
    expect(failure(() => ask([once, { ...once, project: "beta" }]))).toBe("precision-conflict")
    expect(failure(() => ask([once, { ...once, reads: [read("other")] }]))).toBe("precision-conflict")
    expect(failure(() => ask([
      { id: "a", project: "alpha", order: 1, reads: [read("f")] },
      { id: "b", project: "alpha", order: 1, reads: [read("g")] },
    ]))).toBe("precision-conflict")
  })

  test("retrieval order does not change replay", () => {
    const ordered = sequence([...many(10, "c"), ...many(10, "r", "refuted")])
    const shuffled = [...ordered].reverse().map((batch) => ({ ...batch, reads: [...batch.reads].reverse() }))
    expect(ask(shuffled)).toBe(ask(ordered))
    expect(ask(shuffled)).toBe("active")
    expect(ask([...sequence(opened())].reverse())).toBe("demoted")
  })

  test("an empty read list is valid and a missing binding is not", () => {
    expect(ask([])).toBe("probation")
    expect(ask([{ id: "a", project: "alpha", order: 1, reads: [] }])).toBe("probation")
    expect(failure(() => ask([{ id: "a", project: "alpha", order: 1, reads: [read("f", "confirmed", { generation: "" })] }]))).toBe("precision-invalid")
    expect(failure(() => ask([{ id: "a", project: "alpha", order: 1, reads: [{ ...read("f"), outcome: "guessed" as "confirmed" }] }]))).toBe("precision-invalid")
    expect(failure(() => ask([{ id: "", project: "alpha", order: 1, reads: [] }]))).toBe("precision-invalid")
    expect(failure(() => ask([{ id: "a", project: "", order: 1, reads: [] }]))).toBe("precision-invalid")
    expect(failure(() => ask([{ id: "a", project: "alpha", order: 1, reads: [read("f", "confirmed", { fingerprint: "" })] }]))).toBe("precision-invalid")
    expect(failure(() => ask([{ id: "a", project: "alpha", order: 1, reads: [read("f", "confirmed", { pack: "" })] }]))).toBe("precision-invalid")
    expect(failure(() => ask([{ id: "a", project: "alpha", order: 1, reads: [read("f", "confirmed", { rule: "" })] }]))).toBe("precision-invalid")
  })

  test("unsafe orders and invalid thresholds fail", () => {
    for (const order of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(failure(() => ask([{ id: "a", project: "alpha", order, reads: [] }]))).toBe("precision-invalid")
    }
    expect(failure(() => ask([], { thresholds: { ...thresholds, activate: { read: 0, confirmed: 0.5 } } }))).toBe("precision-invalid")
    expect(failure(() => ask([], { thresholds: { ...thresholds, activate: { read: 1.5, confirmed: 0.5 } } }))).toBe("precision-invalid")
    expect(failure(() => ask([], { thresholds: { ...thresholds, demote: { window: 20, confirmedBelow: 1.1 } } }))).toBe("precision-invalid")
    expect(failure(() => ask([], { thresholds: { ...thresholds, demote: { window: 20, confirmedBelow: Number.NaN } } }))).toBe("precision-invalid")
    expect(failure(() => ask([], { thresholds: { ...thresholds, drop: { window: 1.5, highCostWindow: 10 } } }))).toBe("precision-invalid")
    expect(failure(() => ask([], { thresholds: { ...thresholds, drop: { window: 20, highCostWindow: Number.MAX_SAFE_INTEGER + 1 } } }))).toBe("precision-invalid")
    expect(ask(sequence(many(20, "r", "refuted")), {
      thresholds: { ...thresholds, demote: { window: 20, confirmedBelow: 0 } },
    })).toBe("probation")
    expect(ask(sequence(many(20, "c")), {
      thresholds: { ...thresholds, activate: { read: 20, confirmed: 1 } },
    })).toBe("active")
  })
})
