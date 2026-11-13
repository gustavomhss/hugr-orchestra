import { expect, test } from "bun:test"
import { Effect } from "effect"
import { ReviewCatalog } from "@orchestra/core/review/catalog"
import { ReviewFanoutV2 } from "../src/v2/workflow/review-fanout"
import { brief, harness, run } from "./fixture/lucy-fanout"

const node = "lucy-lens-security-release"
const six = ["correctness-logic", "correctness-edges", "correctness-reliability", "tests", "security", "correctness-concurrency"]

for (const row of [
  { profile: "code", tier: "quick", allowed: false },
  { profile: "code", tier: "standard", allowed: false },
  { profile: "code", tier: "deep", allowed: false },
  { profile: "release", tier: "standard", allowed: false },
  { profile: "release", tier: "deep", allowed: true },
]) test(`release leaf scope: ${row.profile}/${row.tier}`, () => run((directory) => Effect.gen(function* () {
  const h = yield* harness(directory, `release_scope_${row.profile}_${row.tier}`)
  const input = h.input(row.tier)
  // The fixture keeps its six available lens nodes; Quick explicitly exercises a routed security parent.
  const catalog: ReviewCatalog.Catalog = { ...input.catalog, route: { ...input.catalog.route,
    profiles: input.catalog.route.profiles.map((profile) => profile.id === "code" ? { ...profile,
      lenses: { ...profile.lenses, quick: ["security"], deep: six },
    } : profile),
  } }
  const result = yield* ReviewFanoutV2.run({ ...input, catalog,
    request: { ...input.request, profile: row.profile },
  }, h.port)
  expect(result.status).toBe("ran")
  const key = row.tier === "quick" ? "lead" : "lens:security:all"
  const scope = yield* h.scope(key)
  expect(scope).toBeDefined()
  expect(Array.isArray(scope?.skills?.allow)).toBe(true)
  if (!scope?.skills?.allow) throw new Error("host scope allow list missing")
  expect(scope.skills.allow.includes(node)).toBe(row.allowed)
  if (!row.allowed) {
    const text = brief(h.briefs, row.tier === "quick" ? "lead:finish" : "lens:security:all:hunt")
    expect(text).not.toContain(`\`${node}\``)
    expect(text).not.toContain(`Body of ${node}.`)
  }
  const release = yield* h.scope("lens:security-release:all")
  if (row.allowed) {
    expect(release?.skills?.entry).toBe(node)
    expect(brief(h.briefs, "lens:security-release:all:hunt")).toContain(`Body of ${node}.`)
  } else expect(release).toBeUndefined()
})))
