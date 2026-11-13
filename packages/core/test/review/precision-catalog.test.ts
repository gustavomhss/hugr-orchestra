import { expect, test } from "bun:test"
import { Schema } from "effect"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewLedger } from "../../src/review/ledger"
import { ReviewPrecisionCatalog } from "../../src/review/precision-catalog"

const pack = {
  id: "alpha",
  tool: "alpha",
  version: "1",
  licence: "pinned",
  backend: "pinned",
  pin: { source: "fixture", integrity: { "linux-x64": "sha256-fixture" } },
  languages: "any",
  detection: { manifests: [], extensions: [], absent: [] },
  lane: "no-build",
  tiers: ["quick"],
  output: { format: "sarif" },
  cost: "low",
  network: { kind: "none" },
  scratchWrites: false,
  template: "alpha",
  lenses: ["security"],
  status: "probation",
} satisfies ReviewCatalog.Catalog["packs"][number]

const rule = {
  pack: "alpha",
  rule: "native-rule",
  class: "security.secret",
  lens: "security",
  severity: { "*": "P1" },
  triage: "explicit triage",
  status: "probation",
} satisfies ReviewCatalog.Catalog["rules"][number]

const wildcard = { ...rule, rule: "*", triage: "wildcard triage" }

function catalog(
  packs: readonly ReviewCatalog.Catalog["packs"][number][],
  rules: readonly ReviewCatalog.Catalog["rules"][number][],
  ledger: ReviewCatalog.Catalog["route"]["ledger"] = ReviewCatalog.current.route.ledger,
): ReviewCatalog.Catalog {
  return { ...ReviewCatalog.current, packs: [...packs], rules: [...rules], route: { ...ReviewCatalog.current.route, ledger } }
}

function read(
  fingerprint: string,
  generation: string,
  outcome: ReviewLedger.Read["outcome"] = "confirmed",
  over: Partial<ReviewLedger.Read> = {},
): ReviewLedger.Read {
  return { pack: "alpha", rule: "native-rule", generation, fingerprint, outcome, ...over }
}

function sequence(items: readonly ReviewLedger.Read[], project = "alpha", start = 1): ReviewLedger.Batch[] {
  return items.map((item, index) => ({ id: `${project}-${start + index}`, project, order: start + index, reads: [item] }))
}

function many(
  count: number,
  prefix: string,
  generation: string,
  outcome: ReviewLedger.Read["outcome"] = "confirmed",
  over: Partial<ReviewLedger.Read> = {},
) {
  return Array.from({ length: count }, (_, index) => read(`${prefix}${index}`, generation, outcome, over))
}

function opened(generation: string, over: Partial<ReviewLedger.Read> = {}) {
  return [...many(3, "c", generation, "confirmed", over), ...many(17, "r", generation, "refuted", over)]
}

function run(
  batches: readonly ReviewLedger.Batch[],
  rules: readonly ReviewCatalog.Catalog["rules"][number][] = [rule],
  packs: readonly ReviewCatalog.Catalog["packs"][number][] = [pack],
  project = "alpha",
  ledger?: ReviewCatalog.Catalog["route"]["ledger"],
) {
  return ReviewPrecisionCatalog.effective({ project, catalog: catalog(packs, rules, ledger), batches })
}

function statusOf(result: ReviewCatalog.Catalog, id = "native-rule", packId = "alpha") {
  return result.rules.find((entry) => entry.pack === packId && entry.rule === id)?.status
}

function failed(body: () => void) {
  try {
    body()
    return "did-not-fail"
  } catch (error) {
    if (error instanceof Error) return error.name
    throw error
  }
}

test("ledger boundaries: 20 confirms activate, 3/20 demotes, and the completed post-demote window drops", () => {
  expect(ReviewCatalog.current.route.ledger).toEqual({
    activate: { read: 20, confirmed: 0.5 },
    demote: { window: 20, confirmedBelow: 0.2 },
    drop: { window: 20, highCostWindow: 10 },
  })
  const generation = ReviewLedger.generation(pack, rule)
  expect(statusOf(run([]))).toBe("probation")
  expect(statusOf(run(sequence(many(19, "c", generation))))).toBe("probation")
  expect(statusOf(run(sequence(many(20, "c", generation))))).toBe("active")
  expect(statusOf(run(sequence(opened(generation))))).toBe("demoted")
  const held = run(sequence([...opened(generation), ...Array.from({ length: 19 }, () => read("c0", generation))]))
  expect(statusOf(held)).toBe("demoted")
  expect(held.packs[0]?.status).toBe("probation")
  const dropped = run(sequence([...opened(generation), ...Array.from({ length: 20 }, () => read("c0", generation))]))
  expect(statusOf(dropped)).toBe("dropped")
  expect(dropped.packs[0]?.status).toBe("dropped")
  const high = { ...pack, id: "high", cost: "high" as const }
  const highRule = { ...rule, pack: "high" }
  const highGeneration = ReviewLedger.generation(high, highRule)
  const highRead = { pack: "high", rule: "native-rule" } as const
  expect(statusOf(run(sequence([...opened(highGeneration, highRead), ...Array.from({ length: 9 }, () => read("c0", highGeneration, "confirmed", highRead))]), [highRule], [high]), "native-rule", "high")).toBe("demoted")
  expect(statusOf(run(sequence([...opened(highGeneration, highRead), ...Array.from({ length: 10 }, () => read("c0", highGeneration, "confirmed", highRead))]), [highRule], [high]), "native-rule", "high")).toBe("dropped")
})

test("a repository pack and its rules stay active, and an empty rule list is not dropped", () => {
  const gates = { ...pack, id: "gates", tool: "repo-tool", backend: "repo" as const, cost: "high" as const, status: "probation" as const }
  const gateRule = { ...rule, pack: "gates", status: "probation" as const }
  const generation = ReviewLedger.generation(gates, gateRule)
  const demoted = run(sequence(opened(generation, { pack: "gates" })), [gateRule], [gates])
  expect(statusOf(demoted, "native-rule", "gates")).toBe("active")
  expect(demoted.packs[0]?.status).toBe("active")
  expect(statusOf(run([], [gateRule], [gates]), "native-rule", "gates")).toBe("active")
  expect(statusOf(run([], [{ ...gateRule, rule: "*" }], [gates]), "*", "gates")).toBe("active")
  const bare = { ...pack, id: "bare" }
  const closed = run(sequence([...opened(generation), ...Array.from({ length: 20 }, () => read("c0", generation))]), [rule], [pack, bare])
  expect(closed.packs.find((entry) => entry.id === "bare")).toBe(bare)
  expect(closed.packs.find((entry) => entry.id === "bare")?.status).not.toBe("dropped")
})

test("the first local read does not inherit another project's prior", () => {
  const generation = ReviewLedger.generation(pack, rule)
  const prior = sequence(many(20, "g", generation), "beta")
  expect(statusOf(run(prior, [rule], [pack], "alpha"))).toBe("active")
  const local = [...prior, ...sequence([read("local", generation, "refuted")], "alpha", 21)]
  expect(statusOf(run(local, [rule], [pack], "alpha"))).toBe("probation")
  expect(statusOf(run(local, [rule], [pack], "beta"))).toBe("active")
})

test("a wildcard synthesizes seen native ids, explicit wins, and the wildcard stays probation", () => {
  const generation = ReviewLedger.generation(pack, rule)
  const other = ReviewLedger.generation(pack, { ...wildcard, rule: "other-native" })
  const zed = ReviewLedger.generation(pack, { ...wildcard, rule: "z-native" })
  expect(generation).not.toBe(ReviewLedger.generation(pack, { ...wildcard, rule: "native-rule" }))
  const batches = [
    ...sequence(many(20, "e", generation)),
    ...sequence(many(20, "o", other, "confirmed", { rule: "other-native" }), "alpha", 21),
    ...sequence(many(20, "z", zed, "confirmed", { rule: "z-native" }), "alpha", 41),
    ...sequence([read("gone", other, "confirmed", { pack: "removed", rule: "removed-native" })], "alpha", 61),
  ]
  const result = run(batches, [rule, wildcard])
  expect(result.rules.filter((entry) => entry.rule === "native-rule")).toEqual([
    expect.objectContaining({ triage: "explicit triage", class: "security.secret", status: "active" }),
  ])
  expect(result.rules.map((entry) => entry.rule)).toEqual(["native-rule", "*", "other-native", "z-native"])
  const synthesized = result.rules.filter((entry) => entry.rule === "other-native" || entry.rule === "z-native")
  expect(synthesized.map((entry) => entry.status)).toEqual(["active", "active"])
  expect(synthesized.every((entry) => entry.triage === "wildcard triage")).toBe(true)
  for (const entry of synthesized) {
    expect(Schema.decodeUnknownSync(ReviewCatalog.Rule.fields.rule)(entry.rule)).toBe(entry.rule)
    expect(Schema.decodeUnknownSync(ReviewCatalog.Rule)(entry)).toEqual(entry)
  }
  expect(statusOf(result, "*")).toBe("probation")
  expect(result.rules.some((entry) => entry.pack === "removed" || entry.rule === "removed-native")).toBe(false)
  expect(result.packs[0]?.status).not.toBe("dropped")
  const wrong = run(sequence(many(20, "w", ReviewLedger.generation(pack, { ...wildcard, rule: "native-rule" }))), [rule, wildcard])
  expect(statusOf(wrong)).toBe("probation")
  const stale = ReviewLedger.generation(pack, { ...wildcard, rule: "stale-native" })
  const unseen = run(sequence(many(20, "s", "f".repeat(64), "confirmed", { rule: "stale-native" })), [wildcard])
  expect(statusOf(unseen, "stale-native")).toBe("probation")
  expect(stale).not.toBe("f".repeat(64))
  expect(statusOf(unseen, "*")).toBe("probation")
})

test("a dropped seen native does not drop the wildcard that still covers unseen rules", () => {
  const native = "seen-native"
  const mapping = { ...wildcard, rule: native }
  const generation = ReviewLedger.generation(pack, mapping)
  const batches = sequence([
    ...opened(generation, { rule: native }),
    ...Array.from({ length: 20 }, () => read("c0", generation, "confirmed", { rule: native })),
  ].flat())
  const result = run(batches, [wildcard])
  expect(statusOf(result, native)).toBe("dropped")
  expect(statusOf(result, "*")).toBe("probation")
  expect(result.packs[0]?.status).not.toBe("dropped")
  expect(Schema.decodeUnknownSync(ReviewCatalog.Catalog)(result).rules.map((entry) => entry.rule)).toEqual(["*", native])
})

test("removed-pack history is not mapped in, and malformed history for it still fails", () => {
  const generation = ReviewLedger.generation(pack, rule)
  const foreign = sequence(many(20, "f", generation, "confirmed", { pack: "removed", rule: "foreign-rule" }))
  const result = run(foreign)
  expect(result.packs.map((entry) => entry.id)).toEqual(["alpha"])
  expect(result.rules.map((entry) => entry.rule)).toEqual(["native-rule"])
  expect(statusOf(result)).toBe("probation")
  const malformed = [{ id: "bad", project: "alpha", order: 0, reads: [read("f", "gen", "confirmed", { pack: "removed" })] }]
  expect(failed(() => run(malformed, [], [{ ...pack, id: "bare" }]))).toBe("precision-invalid")
  expect(failed(() => run(malformed))).toBe("precision-invalid")
})

test("unrelated catalog edits keep the generation, and a moved tuple does not adopt an old one", () => {
  const generation = ReviewLedger.generation(pack, rule)
  const batches = sequence(many(20, "c", generation))
  const edited = { ...pack, status: "dropped" as const, licence: "never" as const, lenses: ["tests"], cost: "high" as const, lane: "build" as const }
  const editedRule = { ...rule, status: "dropped" as const }
  expect(ReviewLedger.generation(edited, editedRule)).toBe(generation)
  const result = run(batches, [editedRule], [edited])
  expect(statusOf(result)).toBe("active")
  expect(result.packs[0]?.status).not.toBe("dropped")
  const again = ReviewPrecisionCatalog.effective({ project: "alpha", catalog: result, batches })
  expect(statusOf(again)).toBe("active")
  expect(editedRule.status).toBe("dropped")
  expect(pack.status).toBe("probation")
  const moved = run(batches, [rule], [{ ...pack, version: "9" }])
  expect(statusOf(moved)).toBe("probation")
  const source = catalog([pack], [rule])
  const before = JSON.stringify(source)
  const batchBefore = JSON.stringify(batches)
  const kept = ReviewPrecisionCatalog.effective({ project: "alpha", catalog: source, batches })
  expect(JSON.stringify(source)).toBe(before)
  expect(JSON.stringify(batches)).toBe(batchBefore)
  expect(kept.route).toBe(source.route)
  expect(kept.overlays).toBe(source.overlays)
})

test("a raw native rule id keeps its case and still derives from the ledger", () => {
  const native = { ...rule, rule: "F401" }
  const generation = ReviewLedger.generation(pack, native)
  expect(generation).not.toBe(ReviewLedger.generation(pack, { ...wildcard, rule: "F401" }))
  const aws = "AWSKey"
  const squawk = "ban_drop_column"
  const awsGeneration = ReviewLedger.generation(pack, { ...wildcard, rule: aws })
  const squawkGeneration = ReviewLedger.generation(pack, { ...wildcard, rule: squawk })
  const batches = [
    ...sequence(many(20, "f", generation, "confirmed", { rule: "F401" })),
    ...sequence(many(20, "a", awsGeneration, "confirmed", { rule: aws }), "alpha", 21),
    ...sequence([read("s0", squawkGeneration, "confirmed", { rule: squawk })], "alpha", 41),
  ]
  const result = run(batches, [native, wildcard])
  expect(statusOf(result, "F401")).toBe("active")
  expect(statusOf(result, aws)).toBe("active")
  expect(statusOf(result, squawk)).toBe("probation")
  expect(statusOf(result, "*")).toBe("probation")
  expect(Schema.decodeUnknownSync(ReviewCatalog.Catalog)(result).rules.map((entry) => entry.rule)).toEqual([
    "F401",
    "*",
    aws,
    squawk,
  ])
  expect(Schema.decodeUnknownSync(ReviewCatalog.Rule.fields.rule)("F401")).toBe("F401")
  expect(() => Schema.decodeUnknownSync(ReviewCatalog.Rule)({ ...rule, rule: "" })).toThrow()
  expect(() => Schema.decodeUnknownSync(ReviewCatalog.Rule)({ ...rule, rule: "N".repeat(241) })).toThrow()
  expect(Schema.decodeUnknownSync(ReviewCatalog.Rule)({ ...rule, rule: "N".repeat(240) }).rule).toBe("N".repeat(240))
  expect(() => run(sequence([read("big", "gen", "confirmed", { rule: "N".repeat(241) })]), [wildcard])).toThrow()
  expect(failed(() => run(sequence([read("empty", "gen", "confirmed", { rule: "" })]), [wildcard]))).toBe("precision-invalid")
  expect(() => Schema.decodeUnknownSync(ReviewCatalog.Rule)({ ...rule, pack: "Alpha" })).toThrow()
  expect(() => Schema.decodeUnknownSync(ReviewCatalog.Rule)({ ...rule, class: "Security.secret" })).toThrow()
  expect(() => Schema.decodeUnknownSync(ReviewCatalog.Rule)({ ...rule, lens: "Security" })).toThrow()
  expect(() => Schema.decodeUnknownSync(ReviewCatalog.Pack)({ ...pack, id: "Alpha" })).toThrow()
  const lens = ReviewCatalog.current.lenses[0]
  if (!lens) throw new Error("missing lens")
  expect(() => Schema.decodeUnknownSync(ReviewCatalog.Lens)({ ...lens, node: "Lucy-Node" })).toThrow()
})

test("catalog thresholds are the ones on the input, not a baked-in window", () => {
  const generation = ReviewLedger.generation(pack, rule)
  const ledger = { ...ReviewCatalog.current.route.ledger, activate: { read: 1, confirmed: 0.5 } }
  expect(statusOf(run(sequence([read("one", generation)]), [rule], [pack], "alpha", ledger))).toBe("active")
  expect(statusOf(run(sequence([read("one", generation)])))).toBe("probation")
})
