import { expect, test } from "bun:test"
import { buildPlan, EXTERNAL, LEAD, planHash, requirePlan } from "../src/plan"
import type { PartitionInput, Plan } from "../src/plan"

const input: PartitionInput = {
  baselineSha: "base", target: "source.ts",
  symbols: [{ name: "A", kind: "function", exported: true }, { name: "B", kind: "function", exported: true }],
  assignment: { A: "a", B: "b" }, soundEdges: [],
}
const resign = (plan: Plan) => ({ ...plan, hash: planHash(plan) })

test("helper relocation conservatively preserves declared dependency imports and graph", () => {
  const supplied: PartitionInput = {
    ...input,
    symbols: [...input.symbols, { name: "T", kind: "type", exported: true }, { name: "h", kind: "function", exported: false }],
    assignment: { ...input.assignment, T: "types", h: "a" },
    soundEdges: [{ symbol: "h", neededBy: "b" }, { symbol: "T", neededBy: "a" }],
  }
  const plan = buildPlan(supplied)
  expect(plan.ok).toBe(true)
  expect(plan.modules.find((module) => module.id === "b")).toMatchObject({ helpers: ["h"], imports: [{ from: "a", names: ["A"] }, { from: "types", names: ["T"] }] })
  expect(plan.edges).toContainEqual({ from: "types", to: "b", via: ["T"] })
  expect(requirePlan(plan)).toBeUndefined()
  const dropped = structuredClone(plan)
  const destination = dropped.modules.find((module) => module.id === "b")
  if (!destination) throw new Error("helper destination missing")
  destination.imports = []
  dropped.edges = dropped.edges.filter((edge) => edge.to !== "b")
  expect(requirePlan(resign(dropped))).toContain("drops declared dependency")
  const shared = buildPlan({ ...supplied, ownerUsedHelpers: ["h"] })
  expect(shared.ok).toBe(false)
  expect(shared.issues.join(";")).toContain("shared helper dependency scope unresolved")
  expect(requirePlan(resign({ ...shared, ok: true, issues: [] }))).toContain("shared helper dependency scope unresolved")
  const chained = buildPlan({ ...supplied,
    symbols: [...supplied.symbols, { name: "C", kind: "type", exported: true }, { name: "g", kind: "function", exported: false }],
    assignment: { ...supplied.assignment, C: "c", g: "c" },
    soundEdges: [{ symbol: "h", neededBy: "b" }, { symbol: "g", neededBy: "a" }, { symbol: "T", neededBy: "c" }],
  })
  expect(chained.ok).toBe(false)
  expect(chained.issues.join(";")).toContain("dependency is not exported")
  expect(chained.modules.find((module) => module.id === "b")?.imports).toContainEqual({ from: "types", names: ["T"] })
  expect(requirePlan(resign({ ...chained, ok: true, issues: [] }))).toContain("dependency is not exported")
})

test("origin-local exports are conservatively preserved and private shared combinations stay unresolved", () => {
  const moved = buildPlan({ ...input, symbols: [...input.symbols, { name: "h", kind: "function", exported: false }],
    assignment: { ...input.assignment, h: "a" }, soundEdges: [{ symbol: "h", neededBy: "b" }] })
  expect(moved.ok).toBe(true)
  expect(moved.modules.find((module) => module.id === "b")?.imports).toEqual([{ from: "a", names: ["A"] }])
  expect(requirePlan(moved)).toBeUndefined()
  const unresolved = buildPlan({ ...input,
    symbols: [...input.symbols, { name: "C", kind: "function", exported: true }, { name: "g", kind: "function", exported: false }, { name: "h", kind: "function", exported: false }],
    assignment: { ...input.assignment, C: "c", g: "c", h: "a" },
    soundEdges: [{ symbol: "g", neededBy: "a" }, { symbol: "h", neededBy: "b" }], ownerUsedHelpers: ["h"],
  })
  expect(unresolved.ok).toBe(false)
  expect(requirePlan(resign({ ...unresolved, ok: true, issues: [] }))).toContain("shared helper dependency scope unresolved")
  const coorigin: PartitionInput = { ...input,
    symbols: [...input.symbols, { name: "C", kind: "function", exported: true }, { name: "g", kind: "function", exported: false }, { name: "h", kind: "function", exported: false }],
    assignment: { ...input.assignment, C: "c", g: "a", h: "a" },
    soundEdges: [{ symbol: "g", neededBy: "c" }, { symbol: "h", neededBy: "b" }],
  }
  const separated = buildPlan(coorigin)
  expect(separated.ok).toBe(false)
  expect(requirePlan(resign({ ...separated, ok: true, issues: [] }))).toContain("dependency is not exported")
  const colocated = buildPlan({ ...coorigin, soundEdges: [{ symbol: "g", neededBy: "b" }, { symbol: "h", neededBy: "b" }] })
  expect(colocated.ok).toBe(true)
  expect(requirePlan(colocated)).toBeUndefined()
})

test("balanced imports/edges cannot invent missing, private or colliding bindings", () => {
  const plan = buildPlan(input)
  expect(requirePlan(plan)).toBeUndefined()
  const missing = structuredClone(plan)
  missing.modules[0].imports.push({ from: "b", names: ["Missing"] })
  missing.edges.push({ from: "b", to: "a", via: ["Missing"] })
  expect(requirePlan(resign(missing))).toContain("absent or non-exported")
  const privatePlan = buildPlan({ ...input, symbols: [...input.symbols, { name: "h", kind: "function", exported: false }], assignment: { ...input.assignment, h: "b" } })
  privatePlan.modules[0].imports.push({ from: "b", names: ["h"] })
  privatePlan.edges.push({ from: "b", to: "a", via: ["h"] })
  expect(requirePlan(resign(privatePlan))).toContain("absent or non-exported")
  const collision = structuredClone(plan)
  collision.modules[0].imports.push({ from: EXTERNAL, names: ["A"] })
  collision.edges.push({ from: EXTERNAL, to: "a", via: ["A"] })
  expect(requirePlan(resign(collision))).toContain("binding collision")
})

test("relocations conserve unique disjoint symbols with valid origin and destination", () => {
  const plan = buildPlan(input)
  const duplicate = resign({ ...plan,
    relocations: [0, 1].map(() => ({ symbol: "h", from: "a", to: LEAD, reason: "supplied" })),
    conservation: { ...plan.conservation, totalSymbols: 4 },
  })
  expect(requirePlan(duplicate)).toContain("duplicate relocation symbol")
  const unknown = resign({ ...duplicate, relocations: [{ ...duplicate.relocations[0], from: "missing" }], conservation: { ...plan.conservation, totalSymbols: 3 } })
  expect(requirePlan(unknown)).toContain("invalid ownership endpoints")
  const exported = resign({ ...plan, relocations: [{ symbol: "A", from: "a", to: LEAD, reason: "supplied" }], conservation: { ...plan.conservation, totalSymbols: 3 } })
  expect(requirePlan(exported)).toContain("frozen exports")
})

test("ordinary shared-output module ID cannot collide with lead-owned helper projection", () => {
  const collision = buildPlan({ ...input, assignment: { A: "_shared", B: "b" } })
  expect(collision.ok).toBe(false)
  expect(collision.issues).toContain("assignment uses a reserved module id")
  expect(requirePlan(collision)).toContain("reserved module id")
  expect(buildPlan({ ...input, assignment: { A: "_SHARED", B: "b" } }).ok).toBe(false)
})
