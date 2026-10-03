// Adapted source capability register: TechLead a68e7af92c7ed5aaf8b6574b7ad2f705fb38eeb5.
// Copyright 2026 HuGR Labs. Apache-2.0 (http://www.apache.org/licenses/LICENSE-2.0).
// Changed: static bounded descriptors, strict schemas, explicit effects and lazy selected handlers.
import { arraySchema, booleanSchema, contractSchema, countSchema, failure, objectSchema, stringSchema, stringsSchema, surfaceSchema, text } from "./contract"
import type { ArsenalContext, Descriptor, Effect, JsonSchema, Tool, ToolTextResult } from "./contract"
import { moduleDispatchProperties, partitionSchema, planSchema, requirePlan, waveDispatchProperties } from "./plan"
import type { Plan } from "./plan"
import { validateArgs } from "./validate"
import { unresolvedScopes } from "./tools/conflict-semantics"
import type { WpWrites } from "./tools/conflict-semantics"
import { acquisitionDescriptors } from "./engine/descriptors"
import { governanceToolDescriptors } from "./governance/descriptors"
import { captureContext } from "./context"

const exactSites = { ...stringsSchema, description: "Exact POSIX paths or inclusive :Lstart-end ranges. Unescaped * or ? yields PATTERN_SCOPE_UNRESOLVED/HOLD until expanded via repo-mapper. Escape literal *, ? and backslash with a backslash; brackets are literal filename characters." }
const paths = { id: stringSchema, writes: exactSites, reads: exactSites, appendOnly: exactSites }
const planInput = objectSchema({ plan: planSchema }, ["plan"])
const positiveCount = { ...countSchema, minimum: 1, maximum: 4096 }

// Schemas live here so catalog/describe never imports acquisition engines. Tool modules use descriptor().
const definitions: [string, string, JsonSchema, Effect[]][] = [
  ["anchor-gen", "Generate exact shared-surface anchor for a dependent work package from a frozen Contract.", objectSchema({ contract: contractSchema, wp: stringSchema, only: arraySchema(stringSchema, 1) }, ["contract", "wp"]), []],
  ["conflict-map", "Separate range-aware write conflicts from write→read dependencies; supplied layers may sequence conflicts.", objectSchema({ wps: arraySchema(objectSchema(paths, ["id"]), 1), layers: arraySchema(arraySchema(stringSchema, 1)) }, ["wps"]), []],
  ["context-packer", "Compose bounded structured dispatch brief with baseline, exact targets, rules, checks and return shape.", objectSchema({ wpId: stringSchema, baselineSha: stringSchema, targets: arraySchema(objectSchema({ path: stringSchema, loc: countSchema }, ["path"]), 1), rules: stringsSchema, gates: arraySchema(stringSchema, 1), returnShape: stringSchema, patternSnippet: stringSchema, maxChars: { ...positiveCount, maximum: 262144 } }, ["wpId", "baselineSha", "targets", "rules", "gates", "returnShape"]), []],
  ["contract-freezer", "Canonicalize unique declared surfaces and stamp deterministic drift identifier.", objectSchema({ id: stringSchema, surfaces: arraySchema(surfaceSchema, 1) }, ["id", "surfaces"]), []],
  ["enrich-plan", "Attach accountable dispatch metadata without changing frozen Plan structure or drift hash.", objectSchema({ plan: planSchema, dispatch: objectSchema({ wave: objectSchema(waveDispatchProperties), perModule: { type: "object", additionalProperties: objectSchema(moduleDispatchProperties), maxProperties: 4096 } }) }, ["plan", "dispatch"]), []],
  ["plan-check", "Validate acceptance ownership, dangling/orphan work, atomicity and write partition; does not run tests.", objectSchema({ items: arraySchema(objectSchema({ id: stringSchema, test: stringSchema, judged: booleanSchema }, ["id", "test"]), 1), wps: arraySchema(objectSchema({ ...paths, covers: arraySchema(stringSchema, 1) }, ["id", "covers"]), 1), maxItemsPerWp: positiveCount }, ["items", "wps"]), []],
  ["plan-compiler", "Assemble symbol conservation, helper relocation, imports, cycles and drift hash from supplied edges; no acquisition.", partitionSchema, []],
  ["plan-to-barrel", "Generate re-export source proposal and report declared frozen-surface parity; does not write or merge.", planInput, []],
  ["plan-to-briefs", "Project Plan into bounded per-slice dispatch packets using declared imports and output mode.", objectSchema({ plan: planSchema, gates: arraySchema(stringSchema, 1), returnShape: stringSchema, externalImports: { type: "object", additionalProperties: stringSchema }, maxChars: { ...positiveCount, maximum: 262144 } }, ["plan", "gates", "returnShape"]), []],
  ["plan-to-dag", "Compute provider-first dependency layers with actual cycle diagnostics; scheduling advice only.", planInput, []],
  ["plan-to-gates", "Propose declarative scope, contract and completion checks for host binding; never executes or certifies checks.", objectSchema({ plan: planSchema, scopeDir: stringSchema, workdir: stringSchema, worktreeRoot: stringSchema, typecheckCmd: stringSchema, testCmd: stringSchema }, ["plan", "scopeDir", "workdir"]), []],
  ["plan-to-policy", "Propose scoped write resources from Plan; host permissions remain sole authority.", objectSchema({ plan: planSchema, scopeDir: stringSchema, barrelFile: stringSchema }, ["plan", "scopeDir", "barrelFile"]), []],
  ["seam-checker", "Compare supplied signatures/kinds with frozen Contract; no AST acquisition or execution receipt.", objectSchema({ contract: contractSchema, impl: arraySchema(surfaceSchema), parity: booleanSchema }, ["contract", "impl"]), []],
  ["sliceability", "Measure connected-component collapse under hub lifting; graph-based decomposition advice.", objectSchema({ symbols: arraySchema(stringSchema, 1), edges: arraySchema({ type: "array", items: [stringSchema, stringSchema], minItems: 2, maxItems: 2, additionalItems: false }), k: positiveCount, maxHubs: { ...countSchema, maximum: 4096 } }, ["symbols", "edges", "k"]), []],
  ["stub-gen", "Return TypeScript scaffold text for declared Contract; never silently writes files.", objectSchema({ contract: contractSchema }, ["contract"]), []],
]
const entries = new Map([
  ...definitions.map(([name, description, inputSchema, effects]) => ({ name, description, inputSchema, effects })),
  ...Object.values(acquisitionDescriptors),
  ...Object.values(governanceToolDescriptors),
].map((descriptor) => [descriptor.name, { descriptor, modulePath: `./tools/${descriptor.name}.ts` }]))

export function descriptor(name: string): Descriptor {
  const found = entries.get(name)?.descriptor
  if (!found) throw new Error(`unknown tool: ${name}`)
  return structuredClone({ name: found.name, description: found.description, inputSchema: found.inputSchema, effects: found.effects })
}
export async function list(): Promise<Descriptor[]> {
  return [...entries.keys()].sort().map(descriptor)
}
export async function describe(name: string): Promise<Descriptor> {
  return descriptor(name)
}
export async function execute(name: string, args: unknown, context?: ArsenalContext): Promise<ToolTextResult> {
  const entry = entries.get(name)
  if (!entry) return failure("unknown_tool", `unknown tool: ${name}`)
  const declared = descriptor(name)
  const validation = validateArgs(declared.inputSchema, args)
  if (!validation.ok) return failure("invalid_arguments", `invalid arguments for ${name}: ${validation.errors.join("; ")}`)
  const input: unknown = structuredClone(args)
  if (name === "wave-scheduler" && input && typeof input === "object" && "wps" in input) {
    const scopes = unresolvedScopes(input.wps as WpWrites[])
    if (scopes.length) return text({ status: "HOLD", code: "PATTERN_SCOPE_UNRESOLVED", unresolvedScopes: scopes, dispatchNow: [], mergeNow: null, done: false }, {
      next: "expand pattern scopes into complete repo-mapper literal references before scheduling",
      invariant: "unresolved scope coverage cannot authorize dispatch or integration, including singleton waves",
    })
  }
  if (JSON.stringify(input).length > 1048576) return failure("input_limit", "arguments exceed 1048576 characters; narrow requested input")
  if (declared.effects.length && (!context || !context.directory || !context.stateDirectory || !context.projectID || typeof context.authorize !== "function")) return failure("missing_context", `non-pure tool ${name} requires ArsenalContext`)
  const captured = captureContext(declared.effects, context)
  if (input && typeof input === "object" && "plan" in input) {
    const issue = requirePlan(input.plan as Plan)
    if (issue) return failure("invalid_plan", issue)
  }
  // Modules request exact path/command permission at their root-bound I/O boundary, before every side effect.
  const load = async (): Promise<Tool> => {
    const module = await import(entry.modulePath)
    return module.default as Tool
  }
  return load().then(async (tool) => {
    if (tool.name !== name || typeof tool.handler !== "function" || !Array.isArray(tool.effects) || JSON.stringify(tool.effects) !== JSON.stringify(declared.effects) || JSON.stringify(tool.inputSchema) !== JSON.stringify(declared.inputSchema)) return failure("registry_mismatch", `handler/schema/effects mismatch for ${name}`)
    // The registered schema is canonical. Handler modules obtain it through descriptor(name).
    const result = await tool.handler(input, captured)
    if (!Array.isArray(result.content) || result.content.some((item) => item.type !== "text" || typeof item.text !== "string")) return failure("invalid_result", `non-text result for ${name}`)
    if (result.content.reduce((sum, item) => sum + item.text.length, 0) > 1048576) return failure("output_limit", "tool output exceeds 1048576 characters; narrow requested input")
    return result
  }).catch((error: unknown) => failure("execution_failed", error instanceof Error ? error.message : String(error)))
}
