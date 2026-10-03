// Adapted from TechLead a68e7af92c7ed5aaf8b6574b7ad2f705fb38eeb5.
// Copyright 2026 HuGR Labs. Apache-2.0 (http://www.apache.org/licenses/LICENSE-2.0).
// Changed: strict schemas, honest supplied-edge evidence, relocated ownership, provider metadata.
import { arraySchema, booleanSchema, countSchema, objectSchema, stringSchema, stringsSchema } from "./contract"
import type { ConflictMapOutput } from "./tools/conflict-map"

export type SymbolKind = "const" | "type" | "interface" | "class" | "enum" | "function"
export interface SymbolInfo { name: string; kind: SymbolKind; exported: boolean }
export interface SoundEdge { symbol: string; neededBy: string }
export interface PartitionInput {
  symbols: SymbolInfo[]
  assignment: Record<string, string>
  soundEdges: SoundEdge[]
  ownerUsedHelpers?: string[]
  pinned?: string[]
  baselineSha: string
  target: string
}
export const EXTERNAL = "__external__"
export const LEAD = "__lead__"
export interface Relocation { symbol: string; from: string; to: string; reason: string }
export interface ModuleImports { from: string; names: string[] }
export interface ModuleDispatch {
  provider?: string
  model?: string
  ctxBudget?: { in: number; total: number }
  sweetSpot?: boolean
  ownerFiles?: string[]
  returnShape?: string
  dod?: string[]
  outputMode?: "file" | "inline"
  outputPath?: string
}
export interface ModulePlan extends ModuleDispatch { id: string; exports: string[]; helpers: string[]; imports: ModuleImports[] }
export interface PlanEdge { from: string; to: string; via: string[] }
export interface WaveDispatch {
  waveId?: string
  goNoGo?: "PARALLEL" | "SEQUENTIAL" | "HYBRID"
  conflictMap?: ConflictMapOutput
  contractAnchor?: string
}
export interface Plan extends WaveDispatch {
  baselineSha: string
  target: string
  modules: ModulePlan[]
  frozenSurface: string[]
  edges: PlanEdge[]
  relocations: Relocation[]
  conservation: { totalSymbols: number; totalExports: number; perModule: Record<string, number> }
  cycles: { modules: string[]; dangerous: boolean; via: string[] }[]
  ok: boolean
  issues: string[]
  hash: string
}
const identifier = { type: "string", pattern: "^[A-Za-z_$][A-Za-z0-9_$]*$", maxLength: 256 } as const
export const moduleIDSchema = { type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_-]*$", maxLength: 128 } as const
export const moduleDispatchProperties = {
  provider: stringSchema, model: stringSchema,
  ctxBudget: objectSchema({ in: countSchema, total: { ...countSchema, minimum: 1 } }, ["in", "total"]),
  sweetSpot: booleanSchema, ownerFiles: stringsSchema, returnShape: stringSchema, dod: stringsSchema,
  outputMode: { type: "string", enum: ["file", "inline"] } as const,
  outputPath: stringSchema,
}
export const conflictMapSchema = objectSchema({
  pairs: arraySchema(objectSchema({ a: stringSchema, b: stringSchema, verdict: { type: "string", enum: ["CONFLICT_FREE", "UNION_RESOLVABLE", "MUTATION_CONFLICT", "SEQUENCED_BY_DAG"] }, reason: stringSchema }, ["a", "b", "verdict", "reason"])),
  dependencies: arraySchema(objectSchema({ from: stringSchema, to: stringSchema, via: stringsSchema }, ["from", "to", "via"])),
  parallelSafe: booleanSchema,
  layerCoverage: objectSchema({ layeredIds: countSchema, totalIds: countSchema }, ["layeredIds", "totalIds"]),
}, ["pairs", "dependencies", "parallelSafe"])
export const waveDispatchProperties = {
  waveId: stringSchema, goNoGo: { type: "string", enum: ["PARALLEL", "SEQUENTIAL", "HYBRID"] } as const,
  conflictMap: conflictMapSchema, contractAnchor: stringSchema,
}
export const partitionSchema = objectSchema({
  symbols: arraySchema(objectSchema({ name: identifier, kind: { type: "string", enum: ["const", "type", "interface", "class", "enum", "function"] }, exported: booleanSchema }, ["name", "kind", "exported"]), 1),
  assignment: { type: "object", additionalProperties: moduleIDSchema, minProperties: 1, maxProperties: 4096 },
  soundEdges: arraySchema(objectSchema({ symbol: identifier, neededBy: moduleIDSchema }, ["symbol", "neededBy"])),
  ownerUsedHelpers: stringsSchema, pinned: stringsSchema, baselineSha: stringSchema, target: stringSchema,
}, ["symbols", "assignment", "soundEdges", "baselineSha", "target"])
export const planSchema = objectSchema({
  baselineSha: stringSchema, target: stringSchema,
  modules: arraySchema(objectSchema({ id: moduleIDSchema, exports: arraySchema(identifier), helpers: arraySchema(identifier), imports: arraySchema(objectSchema({ from: moduleIDSchema, names: arraySchema(identifier, 1) }, ["from", "names"])), ...moduleDispatchProperties }, ["id", "exports", "helpers", "imports"]), 1),
  frozenSurface: arraySchema(identifier),
  edges: arraySchema(objectSchema({ from: moduleIDSchema, to: moduleIDSchema, via: arraySchema(identifier, 1) }, ["from", "to", "via"])),
  relocations: arraySchema(objectSchema({ symbol: identifier, from: moduleIDSchema, to: moduleIDSchema, reason: stringSchema }, ["symbol", "from", "to", "reason"])),
  conservation: objectSchema({ totalSymbols: countSchema, totalExports: countSchema, perModule: { type: "object", additionalProperties: countSchema } }, ["totalSymbols", "totalExports", "perModule"]),
  cycles: arraySchema(objectSchema({ modules: stringsSchema, dangerous: booleanSchema, via: stringsSchema }, ["modules", "dangerous", "via"])),
  ok: booleanSchema, issues: stringsSchema, hash: { type: "string", pattern: "^[a-f0-9]{8}$" }, ...waveDispatchProperties,
}, ["baselineSha", "target", "modules", "frozenSurface", "edges", "relocations", "conservation", "cycles", "ok", "issues", "hash"])

export function planHash(plan: Omit<Plan, "hash">): string {
  const canon = [
    `surface:${[...plan.frozenSurface].sort().join(",")}`,
    `modules:${plan.modules.map((m) => `${m.id}|e=${[...m.exports].sort().join(".")}|h=${[...m.helpers].sort().join(".")}`).sort().join(";")}`,
    `edges:${plan.edges.map((e) => `${e.from}->${e.to}:${[...e.via].sort().join(".")}`).sort().join(";")}`,
    `relocations:${plan.relocations.map((r) => `${r.symbol}:${r.from}->${r.to}`).sort().join(";")}`,
  ].join("\n")
  let hash = 0x811c9dc5
  for (let i = 0; i < canon.length; i++) hash = Math.imul(hash ^ canon.charCodeAt(i), 0x01000193) >>> 0
  return hash.toString(16).padStart(8, "0")
}

// Tarjan SCC preserves the source's value-cycle distinction; type-only cycles remain explicit.
function findCycles(ids: string[], edges: PlanEdge[]): string[][] {
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const active = new Set<string>()
  const stack: string[] = []
  const result: string[][] = []
  const visit = (id: string): void => {
    index.set(id, index.size)
    low.set(id, index.get(id)!)
    stack.push(id)
    active.add(id)
    edges.filter((e) => e.to === id && ids.includes(e.from)).forEach((e) => {
      if (!index.has(e.from)) { visit(e.from); low.set(id, Math.min(low.get(id)!, low.get(e.from)!)); return }
      if (active.has(e.from)) low.set(id, Math.min(low.get(id)!, index.get(e.from)!))
    })
    if (low.get(id) !== index.get(id)) return
    const component: string[] = []
    while (stack.length) {
      const next = stack.pop()!
      active.delete(next)
      component.push(next)
      if (next === id) break
    }
    if (component.length > 1 || edges.some((e) => e.from === id && e.to === id)) result.push(component.sort())
  }
  ids.forEach((id) => { if (!index.has(id)) visit(id) })
  return result.sort((a, b) => a.join(",").localeCompare(b.join(",")))
}

export function buildPlan(input: PartitionInput): Plan {
  const issues: string[] = []
  const symbols = new Map(input.symbols.map((s) => [s.name, s]))
  if (!input.symbols.length) issues.push("empty symbol acquisition")
  if (symbols.size !== input.symbols.length) issues.push("duplicate symbol names")
  input.symbols.forEach((s) => { if (!Object.hasOwn(input.assignment, s.name)) issues.push(`unassigned symbol: ${s.name} (partition must be exhaustive)`) })
  Object.keys(input.assignment).forEach((name) => { if (!symbols.has(name)) issues.push(`assignment names unknown symbol: ${name}`) })
  const ids = [...new Set(input.symbols.filter((s) => Object.hasOwn(input.assignment, s.name)).map((s) => input.assignment[s.name]))].sort()
  if (ids.some((id) => id === EXTERNAL || id === LEAD)) issues.push("assignment uses a reserved module id")
  const modules: ModulePlan[] = ids.map((id) => ({ id, exports: input.symbols.filter((s) => input.assignment[s.name] === id && s.exported).map((s) => s.name).sort(), helpers: input.symbols.filter((s) => input.assignment[s.name] === id && !s.exported).map((s) => s.name).sort(), imports: [] }))
  const relocations: Relocation[] = []
  const edgeMap = new Map<string, PlanEdge>()
  const addImport = (to: string, from: string, name: string): void => {
    const module = modules.find((m) => m.id === to)
    if (!module) { issues.push(`edge needed by unknown module: ${to}`); return }
    const imported = module.imports.find((i) => i.from === from)
    if (imported) { if (!imported.names.includes(name)) imported.names.push(name) }
    if (!imported) module.imports.push({ from, names: [name] })
    const key = `${from}->${to}`
    if (!edgeMap.has(key)) edgeMap.set(key, { from, to, via: [] })
    if (!edgeMap.get(key)!.via.includes(name)) edgeMap.get(key)!.via.push(name)
  }
  const referenced = [...new Set(input.soundEdges.map((e) => e.symbol))].sort()
  referenced.forEach((name) => {
    const info = symbols.get(name)
    const owner = info ? input.assignment[name] : EXTERNAL
    if (!owner) { issues.push(`edge symbol ${name} is in the file but unassigned — cannot resolve owner`); return }
    const consumers = [...new Set(input.soundEdges.filter((e) => e.symbol === name).map((e) => e.neededBy))].sort()
    if (consumers.includes(owner)) issues.push(`self-edge: ${name} marked needed by its own owner ${owner}`)
    const needers = consumers.filter((id) => id !== owner && ids.includes(id))
    consumers.filter((id) => !ids.includes(id)).forEach((id) => issues.push(`edge needed by unknown module: ${id}`))
    if (!needers.length) return
    if (owner === EXTERNAL || info?.exported) { needers.forEach((to) => addImport(to, owner, name)); return }
    const shared = needers.length > 1 || input.ownerUsedHelpers?.includes(name) || input.pinned?.includes(name)
    const to = shared ? LEAD : needers[0]
    relocations.push({ symbol: name, from: owner, to, reason: shared ? "non-exported helper used across modules — lift to shared lead-owned module" : "non-exported helper, single consumer — move it (no surface change)" })
    const module = modules.find((m) => m.id === owner)
    if (module) module.helpers = module.helpers.filter((helper) => helper !== name)
    if (to !== LEAD) modules.find((m) => m.id === to)!.helpers.push(name)
    if (shared) {
      needers.forEach((id) => addImport(id, LEAD, name))
      if (input.ownerUsedHelpers?.includes(name) || input.pinned?.includes(name)) addImport(owner, LEAD, name)
    }
  })
  ;[...(input.ownerUsedHelpers ?? []), ...(input.pinned ?? [])].filter((name) => !symbols.has(name)).forEach((name) => issues.push(`unknown helper constraint: ${name}`))
  modules.forEach((m) => { m.helpers.sort(); m.imports.forEach((i) => i.names.sort()); m.imports.sort((a, b) => a.from.localeCompare(b.from)) })
  const edges = [...edgeMap.values()].map((e) => ({ ...e, via: e.via.sort() })).sort((a, b) => `${a.from}->${a.to}`.localeCompare(`${b.from}->${b.to}`))
  const cycles = findCycles(ids, edges).map((component) => {
    const via = [...new Set(edges.filter((e) => component.includes(e.from) && component.includes(e.to)).flatMap((e) => e.via))].sort()
    return { modules: component, via, dangerous: via.some((name) => ["const", "class", "enum", "function"].includes(symbols.get(name)?.kind ?? "type")) }
  })
  cycles.filter((c) => c.dangerous).forEach((c) => issues.push(`runtime-dangerous value cycle across [${c.modules.join(", ")}] via [${c.via.join(", ")}]`))
  const plan = {
    baselineSha: input.baselineSha, target: input.target, modules,
    frozenSurface: input.symbols.filter((s) => s.exported && Object.hasOwn(input.assignment, s.name)).map((s) => s.name).sort(),
    edges, relocations,
    conservation: { totalSymbols: input.symbols.length, totalExports: input.symbols.filter((s) => s.exported).length, perModule: Object.fromEntries(modules.map((m) => [m.id, m.exports.length + m.helpers.length])) },
    cycles, ok: !issues.length, issues,
  }
  return { ...plan, hash: planHash(plan) }
}

export function requirePlan(plan: Plan): string | undefined {
  if (planHash(plan) !== plan.hash) return "plan hash does not match frozen structure"
  if (new Set(plan.modules.map((m) => m.id)).size !== plan.modules.length) return "duplicate module ids"
  if (plan.ok !== (plan.issues.length === 0)) return "plan verdict contradicts issues"
  if (plan.modules.some((m) => m.ctxBudget && m.ctxBudget.in > m.ctxBudget.total)) return "input context budget exceeds total"
  if (plan.modules.some((m) => m.outputMode === "file" && !m.outputPath)) return "file output mode requires outputPath"
  const ids = new Set(plan.modules.map((m) => m.id))
  if (plan.edges.some((e) => !ids.has(e.to) || !ids.has(e.from) && e.from !== EXTERNAL && e.from !== LEAD)) return "plan edge names unknown module"
  const symbols = plan.modules.flatMap((m) => [...m.exports, ...m.helpers])
  if (new Set(symbols).size !== symbols.length) return "symbol owned by multiple modules"
  if (plan.ok) {
    const exported = plan.modules.flatMap((m) => m.exports).sort()
    if (JSON.stringify(exported) !== JSON.stringify([...plan.frozenSurface].sort())) return "module exports contradict frozen surface"
    if (exported.length !== plan.conservation.totalExports || symbols.length + plan.relocations.filter((r) => r.to === LEAD).length !== plan.conservation.totalSymbols) return "symbol conservation mismatch"
    if (Object.keys(plan.conservation.perModule).length !== plan.modules.length || plan.modules.some((m) => plan.conservation.perModule[m.id] !== m.exports.length + m.helpers.length)) return "per-module conservation mismatch"
    const imports = plan.modules.flatMap((m) => m.imports.flatMap((i) => i.names.map((name) => `${i.from}|${m.id}|${name}`))).sort()
    const edges = plan.edges.flatMap((e) => e.via.map((name) => `${e.from}|${e.to}|${name}`)).sort()
    if (new Set(edges).size !== edges.length || JSON.stringify(imports) !== JSON.stringify(edges)) return "imports contradict declared edges"
  }
  if (plan.cycles.some((cycle) => cycle.dangerous) && plan.ok) return "dangerous cycle contradicts Plan verdict"
  const cycles = findCycles([...ids], plan.edges).map((cycle) => cycle.join(",")).sort()
  if (JSON.stringify(cycles) !== JSON.stringify(plan.cycles.map((cycle) => [...cycle.modules].sort().join(",")).sort())) return "cycle declarations contradict dependency graph"
}
