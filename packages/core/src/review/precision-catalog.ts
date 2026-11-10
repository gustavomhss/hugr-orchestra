export * as ReviewPrecisionCatalog from "./precision-catalog"

import { Schema } from "effect"
import { ReviewCatalog } from "./catalog"
import { ReviewLedger } from "./ledger"

// Host execution snapshot. Generation is the original pack/rule tuple; derived status is not configuration.

export function effective(input: {
  readonly project: string
  readonly catalog: ReviewCatalog.Catalog
  readonly batches: ReadonlyArray<ReviewLedger.Batch>
}): ReviewCatalog.Catalog {
  admit(input)
  const rules = [...stated(input), ...synthesized(input)]
  return { ...input.catalog, packs: input.catalog.packs.map((pack) => withStatus(pack, packStatus(pack, rules))), rules }
}

function admit(input: Parameters<typeof effective>[0]) {
  ReviewLedger.status(input.batches, {
    project: input.project,
    pack: "precision-admission",
    rule: "precision-admission",
    generation: "precision-admission",
    repository: false,
    cost: "low",
    thresholds: input.catalog.route.ledger,
  })
}

function stated(input: Parameters<typeof effective>[0]) {
  return input.catalog.rules.map((rule) => {
    const pack = input.catalog.packs.find((entry) => entry.id === rule.pack)
    if (!pack) return rule
    if (rule.rule === "*" && pack.backend !== "repo") return withStatus(rule, "probation")
    return withStatus(rule, ReviewLedger.status(input.batches, query(input, pack, rule)))
  })
}

function synthesized(input: Parameters<typeof effective>[0]) {
  const explicit = new Set(input.catalog.rules.flatMap((rule) => (rule.rule === "*" ? [] : [`${rule.pack}/${rule.rule}`])))
  const seen = seenNatives(input.batches)
  return input.catalog.rules.flatMap((wildcard, index, all) => {
    if (wildcard.rule !== "*") return []
    if (all.findIndex((other) => other.pack === wildcard.pack && other.rule === "*") !== index) return []
    const pack = input.catalog.packs.find((entry) => entry.id === wildcard.pack)
    if (!pack) return []
    return [...(seen.get(pack.id) ?? [])]
      .filter((id) => id !== "*" && !explicit.has(`${pack.id}/${id}`))
      .sort(compare)
      .map((id) => nativeRule(input, pack, wildcard, id))
  })
}

function nativeRule(
  input: Parameters<typeof effective>[0],
  pack: ReviewCatalog.Catalog["packs"][number],
  wildcard: ReviewCatalog.Catalog["rules"][number],
  id: string,
) {
  const mapping = {
    pack: wildcard.pack,
    rule: id,
    class: wildcard.class,
    lens: wildcard.lens,
    severity: wildcard.severity,
    triage: wildcard.triage,
    status: wildcard.status,
    ...(wildcard.cwe === undefined ? {} : { cwe: wildcard.cwe }),
  }
  return Schema.decodeUnknownSync(ReviewCatalog.Rule)({
    ...mapping,
    status: ReviewLedger.status(input.batches, query(input, pack, mapping)),
  })
}

function query(
  input: Parameters<typeof effective>[0],
  pack: ReviewCatalog.Catalog["packs"][number],
  rule: ReviewCatalog.Catalog["rules"][number],
): ReviewLedger.Query {
  return {
    project: input.project,
    pack: pack.id,
    rule: rule.rule,
    generation: ReviewLedger.generation(pack, rule),
    repository: pack.backend === "repo",
    cost: pack.cost,
    thresholds: input.catalog.route.ledger,
  }
}

function seenNatives(batches: ReadonlyArray<ReviewLedger.Batch>) {
  return batches.reduce((seen, batch) => {
    for (const read of batch.reads) {
      const rules = seen.get(read.pack) ?? new Set<string>()
      rules.add(read.rule)
      seen.set(read.pack, rules)
    }
    return seen
  }, new Map<string, Set<string>>())
}

function packStatus(pack: ReviewCatalog.Catalog["packs"][number], rules: ReadonlyArray<ReviewCatalog.Catalog["rules"][number]>) {
  if (pack.backend === "repo") return "active" as const
  const own = rules.filter((rule) => rule.pack === pack.id)
  const covered = own.some((rule) => rule.rule === "*" && rule.status !== "dropped")
  if (own.length > 0 && !covered && own.every((rule) => rule.status === "dropped")) return "dropped" as const
  if (pack.status === "dropped") return "probation" as const
  return pack.status
}

function withStatus<T extends { readonly status: ReviewCatalog.Catalog["rules"][number]["status"] }>(item: T, status: T["status"]) {
  if (item.status === status) return item
  return { ...item, status }
}

function compare(left: string, right: string) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
