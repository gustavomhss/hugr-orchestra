import { expect, test } from "bun:test"
import { transpileModule } from "typescript"
import { Arsenal } from "../src/index"
import { surfaceHash } from "../src/contract"
import type { Contract, Surface } from "../src/contract"
import { buildPlan, EXTERNAL, LEAD, planHash } from "../src/plan"
import type { PartitionInput, Plan } from "../src/plan"
import { conflictVerdict, sitesConflict } from "../src/tools/conflict-semantics"

async function run(name: string, args: unknown) {
  const result = await Arsenal.execute(name, args)
  expect(result.isError).not.toBe(true)
  expect(result.content[1]?.text).toContain("NEXT →")
  expect(result.content[1]?.text).toContain("INVARIANT →")
  return JSON.parse(result.content[0].text)
}
const partition: PartitionInput = {
  baselineSha: "628f72404b", target: "src/old.ts",
  symbols: [{ name: "User", kind: "interface", exported: true }, { name: "create", kind: "function", exported: true }, { name: "helper", kind: "function", exported: false }],
  assignment: { User: "types", create: "service", helper: "types" },
  soundEdges: [{ symbol: "User", neededBy: "service" }, { symbol: "helper", neededBy: "service" }, { symbol: "UUID", neededBy: "service" }],
}

test("contract pipeline freezes canonical surfaces, anchors exact subset, detects kind/signature drift", async () => {
  const surfaces: Surface[] = [{ name: "create", kind: "function", signature: "create(name: string): string" }, { name: "User", kind: "type", signature: "type User = string" }]
  const contract = await run("contract-freezer", { id: "user", surfaces }) as Contract
  expect(contract.surfaces.map((s) => s.name)).toEqual(["create", "User"])
  expect(surfaceHash([...surfaces].reverse())).toBe(contract.hash)
  const anchor = await run("anchor-gen", { contract, wp: "dependent", only: ["create"] })
  expect(anchor.surfaces).toEqual([surfaces[0]])
  expect(anchor.markdown).toContain("create(name: string): string")
  expect((await Arsenal.execute("anchor-gen", { contract, wp: "dependent", only: ["unknown"] })).isError).toBe(true)
  expect((await Arsenal.execute("contract-freezer", { id: "bad", surfaces: [surfaces[0], surfaces[0]] })).isError).toBe(true)
  const seam = await run("seam-checker", { contract, impl: [...surfaces] })
  expect(seam.ok).toBe(true)
  expect((await run("seam-checker", { contract, impl: [{ ...surfaces[0], kind: "const" }, surfaces[1]] })).ok).toBe(false)
  expect((await run("seam-checker", { contract, impl: [surfaces[0]] })).missing).toEqual(["User"])
  const extra = { name: "Extra", signature: "type Extra = number", kind: "type" }
  expect((await run("seam-checker", { contract, impl: [...surfaces, extra] })).ok).toBe(true)
  expect((await run("seam-checker", { contract, impl: [...surfaces, extra], parity: true })).ok).toBe(false)
  expect((await run("seam-checker", { contract, impl: [...surfaces, surfaces[0]] })).ok).toBe(false)
  expect((await run("seam-checker", { contract: { ...contract, hash: "00000000" }, impl: surfaces })).hashOk).toBe(false)
  expect((await Arsenal.execute("stub-gen", { contract: { ...contract, hash: "00000000" } })).isError).toBe(true)
  const scaffold = await run("stub-gen", { contract })
  expect(scaffold.count).toBe(2)
  expect(scaffold.stubs).toContain('throw new Error("stub: create")')
  expect(scaffold.stubs).toContain("export type User = string;")
})

test("stub-gen covers every declared surface kind", async () => {
  const surfaces: Surface[] = [{ name: "f", kind: "function", signature: "f(): void" }, { name: "T", kind: "type", signature: "type T = string" }, { name: "I", kind: "interface", signature: "interface I { x: T }" }, { name: "C", kind: "class", signature: "class C {}" }, { name: "N", kind: "const", signature: "const N = 1" }]
  const output = await run("stub-gen", { contract: { id: "all", surfaces, hash: surfaceHash(surfaces) } })
  expect(output.count).toBe(5)
  expect(output.stubs).toContain("export interface I { x: T }")
  expect(output.stubs).toContain("export class C {}")
  expect(output.stubs).toContain("export const N = 1;")
  expect(transpileModule(output.stubs, { reportDiagnostics: true }).diagnostics).toEqual([])
})

test("conflicts use inclusive ranges, whole files, lexical aliases and unanimous append-only", async () => {
  expect(sitesConflict("src/x.ts", "./src/x.ts:L10-20")).toBe(true)
  expect(sitesConflict("x.ts:L1-10", "x.ts:L10-20")).toBe(true)
  expect(sitesConflict("x.ts:L1-9", "x.ts:L10-20")).toBe(false)
  expect(() => sitesConflict("x.ts:L20-10", "x.ts")).toThrow("malformed line range")
  const wps = [{ id: "a", writes: ["x.ts"], appendOnly: ["x.ts"] }, { id: "b", writes: ["x.ts:L10-20"], reads: ["x.ts:L1-4"] }]
  expect(conflictVerdict(wps).verdict).toBe("CONFLICT")
  const conflict = await run("conflict-map", { wps })
  expect(conflict.parallelSafe).toBe(false)
  expect(conflict.dependencies).toEqual([{ from: "a", to: "b", via: ["x.ts"] }])
  expect((await run("conflict-map", { wps, layers: [["a"], ["b"]] })).pairs[0].verdict).toBe("SEQUENCED_BY_DAG")
  expect((await run("conflict-map", { wps, layers: [["a", "b"]] })).parallelSafe).toBe(false)
  expect((await Arsenal.execute("conflict-map", { wps, layers: [["a"], ["a"]] })).isError).toBe(true)
  expect((await Arsenal.execute("conflict-map", { wps: [wps[0], wps[0]] })).isError).toBe(true)
  const union = await run("conflict-map", { wps: [wps[0], { ...wps[1], appendOnly: ["x.ts"] }] })
  expect(union.pairs[0].verdict).toBe("UNION_RESOLVABLE")
  expect((await run("conflict-map", { wps: [{ id: "a", writes: ["a.ts"] }, { id: "b", writes: ["b.ts"] }] })).parallelSafe).toBe(true)
})

test("plan-check measures acceptance ownership and scope without claiming tests passed", async () => {
  const items = [{ id: "A1", test: "can create user" }, { id: "A2", test: "docs reviewed", judged: true }]
  const wps = [{ id: "a", covers: ["A1"], writes: ["a.ts"] }, { id: "b", covers: ["A2"], writes: ["b.ts"] }]
  const result = await run("plan-check", { items, wps })
  expect(result.ok).toBe(true)
  expect(result.judgedItems).toEqual(["A2"])
  expect(result.ownership).toEqual({ A1: ["a"], A2: ["b"] })
  const bad = await run("plan-check", { items, wps: [{ id: "a", covers: ["A1"], writes: ["x.ts"] }, { id: "b", covers: ["missing"], writes: ["x.ts"] }] })
  expect(bad.ok).toBe(false)
  expect(bad.unowned).toEqual(["A2"])
  expect(bad.orphanWps).toEqual(["b"])
  expect(bad.danglingRefs).toEqual([{ wp: "b", missing: ["missing"] }])
  expect(bad.writeConflicts).toEqual([{ a: "a", b: "b", on: ["x.ts"] }])
  expect((await run("plan-check", { items, wps: [wps[0], { ...wps[1], covers: ["A1", "A2"] }] })).multiplyOwned).toEqual(["A1"])
  expect((await run("plan-check", { items, wps: [{ id: "a", covers: ["A1", "A2"] }], maxItemsPerWp: 1 })).atomicityFlags.length).toBe(1)
  expect((await run("plan-check", { items: [items[0], items[0]], wps: [wps[0], wps[0]] })).ok).toBe(false)
})

test("Plan compiler conserves symbols, relocates helpers, resolves external imports and catches partition faults", async () => {
  const plan = await run("plan-compiler", partition) as Plan
  expect(plan.ok).toBe(true)
  expect(plan.frozenSurface).toEqual(["User", "create"])
  expect(plan.modules.find((m) => m.id === "service")?.helpers).toEqual(["helper"])
  expect(plan.modules.find((m) => m.id === "types")?.helpers).toEqual([])
  expect(plan.modules.find((m) => m.id === "service")?.imports).toEqual([{ from: EXTERNAL, names: ["UUID"] }, { from: "types", names: ["User"] }])
  expect(plan.relocations[0]).toMatchObject({ symbol: "helper", from: "types", to: "service" })
  expect(plan.conservation).toEqual({ totalSymbols: 3, totalExports: 2, perModule: { service: 2, types: 1 } })
  expect(buildPlan({ ...partition, assignment: { User: "types" } }).ok).toBe(false)
  expect(buildPlan({ ...partition, assignment: { ...partition.assignment, typo: "types" } }).issues).toContain("assignment names unknown symbol: typo")
  expect(buildPlan({ ...partition, symbols: [...partition.symbols, partition.symbols[0]] }).issues).toContain("duplicate symbol names")
  expect(buildPlan({ ...partition, soundEdges: [{ symbol: "helper", neededBy: "unknown" }] }).ok).toBe(false)
  expect(buildPlan({ ...partition, soundEdges: [{ symbol: "create", neededBy: "service" }] }).ok).toBe(false)
  const shared = buildPlan({ ...partition, ownerUsedHelpers: ["helper"] })
  expect(shared.relocations[0].to).toBe(LEAD)
  expect(shared.modules.every((m) => m.imports.some((i) => i.from === LEAD && i.names.includes("helper")))).toBe(true)
  expect((await Arsenal.execute("plan-to-dag", { plan: shared })).isError).not.toBe(true)
  const pinned = buildPlan({ ...partition, pinned: ["helper"] })
  expect(pinned.relocations[0].to).toBe(LEAD)
  expect(buildPlan({ ...partition, symbols: [], assignment: {}, soundEdges: [] }).ok).toBe(false)
})

test("DAG computes provider-first layers and cycle witness; runtime/type cycles distinguished", async () => {
  const plan = buildPlan(partition)
  expect((await run("plan-to-dag", { plan })).layers).toEqual([["types"], ["service"]])
  const cyclicInput: PartitionInput = { baselineSha: "base", target: "cycle.ts", symbols: [{ name: "A", kind: "function", exported: true }, { name: "B", kind: "function", exported: true }], assignment: { A: "a", B: "b" }, soundEdges: [{ symbol: "A", neededBy: "b" }, { symbol: "B", neededBy: "a" }] }
  const valueCycle = buildPlan(cyclicInput)
  expect(valueCycle.ok).toBe(false)
  expect(valueCycle.cycles[0].dangerous).toBe(true)
  const output = await run("plan-to-dag", { plan: valueCycle })
  expect(output.cyclic).toBe(true)
  expect(output.cycle.sort()).toEqual(["a", "b"])
  const typeCycle = buildPlan({ ...cyclicInput, symbols: cyclicInput.symbols.map((s) => ({ ...s, kind: "type" })) })
  expect(typeCycle.ok).toBe(true)
  expect(typeCycle.cycles[0].dangerous).toBe(false)
  expect((await run("plan-to-dag", { plan: typeCycle })).cyclic).toBe(true)
})

test("enrichment leaves drift hash unchanged; explicit provider metadata and bounded budget/file return", async () => {
  const plan = buildPlan(partition)
  const enriched = await run("enrich-plan", { plan, dispatch: { wave: { waveId: "w", goNoGo: "HYBRID" }, perModule: { service: { provider: "local", model: "my-model", ctxBudget: { in: 50, total: 100 }, outputMode: "file", outputPath: "out/service.md", ownerFiles: ["src/service.ts"], dod: ["bun typecheck"] } } } }) as Plan
  expect(enriched.hash).toBe(plan.hash)
  expect(planHash(enriched)).toBe(plan.hash)
  expect(plan.modules[0].model).toBeUndefined()
  expect(enriched.modules.find((m) => m.id === "service")?.provider).toBe("local")
  expect((await Arsenal.execute("enrich-plan", { plan, dispatch: { perModule: { typo: { model: "metadata" } } } })).isError).toBe(true)
  expect((await Arsenal.execute("enrich-plan", { plan, dispatch: { perModule: { service: { ctxBudget: { in: 101, total: 100 } } } } })).isError).toBe(true)
  expect((await Arsenal.execute("enrich-plan", { plan, dispatch: { perModule: { service: { outputMode: "file" } } } })).isError).toBe(true)
})

test("brief and barrel projections preserve imports, helper relocation and file-XOR-inline return", async () => {
  const plan = buildPlan(partition)
  expect((await Arsenal.execute("plan-to-briefs", { plan, gates: ["bun typecheck"], returnShape: "SEAL" })).isError).toBe(true)
  const result = await run("plan-to-briefs", { plan, gates: ["bun typecheck"], returnShape: "SEAL", externalImports: { UUID: "uuid" } })
  expect(result.briefs.length).toBe(2)
  const service = result.briefs.find((brief: { moduleId: string }) => brief.moduleId === "service")
  expect(service.packet).toContain('import { User } from "./types.js";')
  expect(service.packet).toContain('import { UUID } from "uuid";')
  expect(service.packet).toContain("helper (from types)")
  expect(service.packet).toContain("SEAL")
  const enriched = { ...plan, modules: plan.modules.map((m) => m.id === "service" ? { ...m, outputMode: "file" as const, outputPath: "out.md", dod: ["bun test"], returnShape: "HIDDEN" } : m) }
  const fileBrief = (await run("plan-to-briefs", { plan: enriched, gates: ["fallback"], returnShape: "SEAL", externalImports: { UUID: "uuid" } })).briefs.find((brief: { moduleId: string }) => brief.moduleId === "service")
  expect(fileBrief.packet).toContain("Return → write output to out.md")
  expect(fileBrief.packet).not.toContain("HIDDEN")
  expect(fileBrief.packet).not.toContain("fallback")
  expect((await Arsenal.execute("plan-to-briefs", { plan, gates: ["bun test"], returnShape: "SEAL", externalImports: { UUID: "uuid" }, maxChars: 10 })).isError).toBe(true)
  const barrel = await run("plan-to-barrel", { plan })
  expect(barrel.reExportsSurface).toBe(true)
  expect(barrel.barrel).toContain('export * from "./service.js";')
  expect(barrel.barrel).toContain('export * from "./types.js";')
  expect(transpileModule(barrel.barrel, { reportDiagnostics: true }).diagnostics).toEqual([])
})

test("check/policy advice stays declarative; cannot mint enforcement or authority", async () => {
  const plan = buildPlan(partition)
  plan.modules[0].ownerFiles = ["src/service.ts", "src/helper.ts"]
  plan.modules[0].dod = ["bun test {file}"]
  const checks = await run("plan-to-gates", { plan, scopeDir: "src", workdir: "/project", worktreeRoot: "/worktrees", typecheckCmd: "fallback" })
  expect(checks.authority).toBe("proposal")
  const service = checks.proposals.find((proposal: { moduleId: string }) => proposal.moduleId === "service")
  expect(service.workdir).toBe("/worktrees/service")
  expect(service.checks[0]).toMatchObject({ kind: "scope", paths: ["src/service.ts", "src/helper.ts"], includeUntracked: true })
  expect(service.checks[1]).toMatchObject({ kind: "contract", exports: ["create"], acquisition: "compiler-required" })
  expect(service.checks[2]).toMatchObject({ kind: "command", command: "bun test {file}", bindings: { file: "src/service.ts" } })
  expect(checks.arms).toBeUndefined()
  expect(JSON.stringify(checks)).not.toContain("grep")
  expect(JSON.stringify(checks)).not.toContain("RELAY-ARM")
  const undeclared = await run("plan-to-gates", { plan: buildPlan(partition), scopeDir: "src", workdir: "/project" })
  expect(undeclared.proposals.every((proposal: { completionChecksDeclared: boolean }) => !proposal.completionChecksDeclared)).toBe(true)
  const scopes = await run("plan-to-policy", { plan, scopeDir: "src", barrelFile: "src/index.ts" })
  expect(scopes.authority).toBe("proposal")
  const policy = scopes.policies.find((policy: { moduleId: string }) => policy.moduleId === "service")
  expect(policy.proposedScopes.write).toEqual(["src/helper.ts", "src/service.ts"])
  expect(policy.proposedScopes.excludeWrite).toEqual(["src/index.ts", "src/types.ts"])
  expect(policy.proposedScopes.remoteMutation).toBe("not-requested")
  expect(policy.policy).toBeUndefined()
})

test("packer composes structured bounded packets; sliceability sees both star cliff and dense blob", async () => {
  const input = { wpId: "A", baselineSha: "base", targets: [{ path: "src/a.ts", loc: 10 }], rules: ["preserve exports"], gates: ["bun typecheck"], returnShape: "SEAL", patternSnippet: "export const a = 1" }
  const packet = (await run("context-packer", input)).packet
  expect(packet).toContain("| src/a.ts | 10 |")
  expect(packet.indexOf("Step 0")).toBeLessThan(packet.indexOf("Target"))
  expect(packet.indexOf("Pattern")).toBeLessThan(packet.indexOf("Hard rules"))
  expect(packet).toContain("host authorization required")
  expect((await Arsenal.execute("context-packer", { ...input, maxChars: 10 })).isError).toBe(true)
  const symbols = ["hub", "a", "b", "c", "d"]
  const cliff = await run("sliceability", { symbols, edges: symbols.slice(1).map((s) => ["hub", s]), k: 4 })
  expect(cliff.verdict).toBe("SLICEABLE")
  expect(cliff.hubs).toEqual(["hub"])
  expect(cliff.score).toBe(1)
  expect(cliff.curve[1].largestCompRatio).toBe(0.25)
  const edges = symbols.flatMap((a) => symbols.filter((b) => b !== a).map((b) => [a, b]))
  const blob = await run("sliceability", { symbols, edges, k: 2 })
  expect(blob.verdict).toBe("BLOB")
  expect(blob.score).toBeNull()
  const ignored = await run("sliceability", { symbols: ["a", "b"], edges: [["a", "unknown"], ["a", "a"]], k: 2 })
  expect(ignored.ignoredEdges).toHaveLength(2)
})
