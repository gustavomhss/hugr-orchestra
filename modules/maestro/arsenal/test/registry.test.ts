import { expect, test } from "bun:test"
import { Arsenal } from "../src/index"
import { buildPlan, planHash } from "../src/plan"
import { validateArgs } from "../src/validate"
import { conflictVerdict, normalizeSite, patternScope, sitesConflict, unresolvedScopes } from "../src/tools/conflict-semantics"
import { rethrow } from "./rejection"

// Frozen live source registry at a68e7af92c7ed5aaf8b6574b7ad2f705fb38eeb5, not historical README count.
const sourceNames = ["anchor-gen", "brief-usage-check", "conflict-map", "context-packer", "contract-freezer", "decompose", "enrich-plan", "governance", "move-in", "plan-check", "plan-compiler", "plan-to-barrel", "plan-to-briefs", "plan-to-dag", "plan-to-gates", "plan-to-policy", "profile", "relay-arm", "repo-hygiene-check", "repo-mapper", "seam-checker", "sliceability", "stub-gen", "symbol-flow-check", "wave-ledger", "wave-scheduler"]

test("catalog matches frozen live source register and survives descriptor mutation", async () => {
  const tools = await Arsenal.list()
  expect(tools.map((tool) => tool.name)).toEqual(sourceNames)
  expect(new Set(tools.map((tool) => tool.name)).size).toBe(sourceNames.length)
  for (const tool of tools) {
    expect(tool.description.length).toBeGreaterThan(10)
    expect(tool.inputSchema.type).toBe("object")
    expect(tool.inputSchema.additionalProperties === false || tool.inputSchema.oneOf?.every((schema) => schema.additionalProperties === false)).toBe(true)
    expect(Object.keys(tool.inputSchema.properties ?? {}).length).toBeGreaterThan(0)
    expect(await Arsenal.describe(tool.name)).toEqual(tool)
    tool.effects.push("write")
    tool.inputSchema.properties = {}
    expect(await Arsenal.describe(tool.name)).not.toEqual(tool)
  }
  expect(await rethrow(Arsenal.describe("wp-sizer"))).toThrow("unknown tool")
})

test("selected handlers run without loading absent acquisition/state modules", async () => {
  const result = await Arsenal.execute("contract-freezer", { id: "contract", surfaces: [{ name: "User", kind: "type", signature: "type User = string" }] })
  expect(result.isError).not.toBe(true)
  expect(JSON.parse(result.content[0].text).surfaces[0].name).toBe("User")
  expect((await Arsenal.execute("unknown", {})).isError).toBe(true)
  for (const tool of await Arsenal.list()) {
    if (!tool.effects.length) continue
    const invalid = await Arsenal.execute(tool.name, {})
    expect(invalid.isError).toBe(true)
    expect(JSON.parse(invalid.content[0].text).error).toBe(validateArgs(tool.inputSchema, {}).ok ? "missing_context" : "invalid_arguments")
  }
})

test("nonpure operations reject exact missing context before loading handler", async () => {
  const cases = [
    ["repo-mapper", { root: "/project" }],
    ["move-in", { root: "/project" }],
    ["profile", {}],
    ["repo-hygiene-check", { root: "/project" }],
    ["decompose", { targetPath: "/project/file.ts", k: 2 }],
    ["brief-usage-check", { declared: ["x"], available: { exports: ["x"], helpers: [], importNames: [] } }],
    ["symbol-flow-check", { wps: [{ id: "w", files: [{ path: "a.ts", source: "" }] }] }],
    ["relay-arm", { action: "arm", contract: { sessionID: "session", label: "w", chain: [{ id: "verify", checks: [{ id: "compile", hostCheck: "compile" }] }] } }],
    ["wave-ledger", { action: "read", wave: "w" }],
  ] as const
  for (const [name, args] of cases) {
    const result = await Arsenal.execute(name, args)
    expect(result.isError).toBe(true)
    expect(JSON.parse(result.content[0].text).error).toBe("missing_context")
  }
})

test("schemas reject unknown fields, NaN, numeric bounds and malformed tuples", async () => {
  const schema = (await Arsenal.describe("sliceability")).inputSchema
  const valid = { symbols: ["x", "y"], edges: [["x", "y"]], k: 2 }
  expect(validateArgs(schema, valid).ok).toBe(true)
  for (const invalid of [
    { ...valid, extra: true }, { ...valid, k: 0 }, { ...valid, k: -1 }, { ...valid, k: 1.5 },
    { ...valid, k: NaN }, { ...valid, k: Infinity }, { ...valid, k: 4097 },
    { ...valid, maxHubs: -1 }, { ...valid, edges: [["x"]] }, { ...valid, edges: [["x", "y", "z"]] },
    { ...valid, edges: [["x", 2]] }, { ...valid, symbols: [] },
  ]) {
    expect(validateArgs(schema, invalid).ok).toBe(false)
    expect((await Arsenal.execute("sliceability", invalid)).isError).toBe(true)
  }
  expect(validateArgs(undefined, {}).ok).toBe(false)
  expect(validateArgs({}, {}).ok).toBe(false)
  expect(validateArgs({ type: "object", mystery: true }, {}).ok).toBe(false)
  expect(validateArgs({ type: "object" }, null).ok).toBe(false)
})

test("missing acceptance, unspecified acquisition and state record input never succeed empty", async () => {
  for (const [name, args] of [
    ["plan-check", {}], ["plan-check", { items: [], wps: [] }],
    ["brief-usage-check", { declared: [] }],
    ["brief-usage-check", { declared: [], available: {} }],
    ["brief-usage-check", { declared: [], available: { exports: [], helpers: [], importNames: [] }, source: "const x = 1" }],
    ["wave-ledger", { root: "/project", action: "record", wave: "w" }],
    ["profile", { root: "/project", action: "set" }],
    ["relay-arm", { label: "w", workdir: "/project", chain: [{ id: "g", checklist: [{ id: "empty" }] }] }],
  ] as const) expect((await Arsenal.execute(name, args)).isError).toBe(true)
  const scheduler = (await Arsenal.describe("wave-scheduler")).inputSchema
  expect(validateArgs(scheduler, { wps: [], events: [] }).ok).toBe(true)
  expect(validateArgs(scheduler, {}).ok).toBe(false)
})

test("Plan/Contract schemas validate nested data before handler; drift and contradictory imports rejected", async () => {
  expect((await Arsenal.execute("plan-to-dag", { plan: {} })).isError).toBe(true)
  expect((await Arsenal.execute("anchor-gen", { contract: {}, wp: "a" })).isError).toBe(true)
  const plan = buildPlan({ baselineSha: "base", target: "source.ts", symbols: [{ name: "one", kind: "function", exported: true }, { name: "two", kind: "function", exported: true }], assignment: { one: "one", two: "two" }, soundEdges: [{ symbol: "one", neededBy: "two" }] })
  expect((await Arsenal.execute("plan-to-dag", { plan })).isError).not.toBe(true)
  const changed = structuredClone(plan)
  changed.modules[1].imports = []
  expect(planHash(changed)).toBe(plan.hash)
  const rejected = await Arsenal.execute("plan-to-dag", { plan: changed })
  expect(rejected.isError).toBe(true)
  expect(rejected.content[0].text).toContain("imports contradict")
  changed.hash = "00000000"
  expect((await Arsenal.execute("plan-to-dag", { plan: changed })).content[0].text).toContain("plan hash")
  const polluted = { ...plan, modules: plan.modules.map((module) => ({ ...module, execute: "grant" })) }
  expect((await Arsenal.execute("plan-to-policy", { plan: polluted, scopeDir: "src", barrelFile: "src/index.ts" })).isError).toBe(true)
})

test("public unknown arguments reject unsupported JSON at exact field before enum/const serialization", async () => {
  const input = { id: "f", surfaces: [{ name: "User", signature: "type User = string", kind: "type" }] }
  const schema = (await Arsenal.describe("contract-freezer")).inputSchema
  expect(validateArgs(schema, input)).toEqual({ ok: true })
  expect((await Arsenal.execute("contract-freezer", input)).isError).not.toBe(true)
  const cycle: { back?: unknown } = {}
  cycle.back = cycle
  const invalid = [1n, Symbol("kind"), undefined, () => "type", NaN, Infinity, cycle, new Date(), new Map(), new Set(), new String("type")]
  for (const kind of invalid) {
    const args = { ...input, surfaces: [{ ...input.surfaces[0], kind }] }
    const checked = validateArgs(schema, args)
    expect(checked.ok).toBe(false)
    if (!checked.ok) expect(checked.errors.join("; ")).toContain("args.surfaces[0].kind")
    const result = await Arsenal.execute("contract-freezer", args)
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain("invalid_arguments")
    expect(result.content[0].text).toContain("args.surfaces[0].kind")
    expect(result.content[0].text).not.toContain("execution_failed")
  }
  for (const value of [1n, Symbol("root"), undefined, () => {}, cycle]) {
    const result = await Arsenal.execute("contract-freezer", value)
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain("invalid_arguments")
    expect(result.content[0].text).toContain("args")
  }
  expect(validateArgs({ const: null }, 1n).ok).toBe(false)
  expect(validateArgs({ type: "array", uniqueItems: true, items: { enum: [null] } }, [1n]).ok).toBe(false)
  const action = await Arsenal.execute("profile", { root: "/project", action: 1n })
  expect(action.content[0].text).toContain("invalid_arguments")
  expect(action.content[0].text).toContain("args.action")
  const unknown = await Arsenal.execute("contract-freezer", { ...input, extra: { value: 1n } })
  expect(unknown.content[0].text).toContain("args.extra.value")
})

test("JSON inspection rejects accessors, hooks, proxies, sparse arrays and symbols without invoking user code", async () => {
  const input = { id: "f", surfaces: [{ name: "User", signature: "type User = string", kind: "type" }] }
  const calls = { getter: 0, hook: 0, proxy: 0 }
  const accessor = Object.defineProperty({ ...input }, "extra", { enumerable: true, get() { calls.getter++; throw new Error("getter executed") } })
  const hooked = { ...input, toJSON() { calls.hook++; throw new Error("hook executed") } }
  const proxy = new Proxy(input, { getPrototypeOf() { calls.proxy++; throw new Error("proxy inspected") } })
  const revoked = Proxy.revocable(input, {})
  revoked.revoke()
  const sparse = { ...input, surfaces: new Array(1) }
  const symbolic = { ...input, [Symbol("meta")]: "hidden" }
  const extraIndex = Object.assign([...input.surfaces], { "4294967295": "omitted" })
  const cases = [[accessor, "args.extra"], [hooked, "args.toJSON"], [proxy, "args"], [revoked.proxy, "args"], [sparse, "args.surfaces[0]"], [symbolic, "args[Symbol(meta)]"], [{ ...input, surfaces: extraIndex }, "args.surfaces[4294967295]"]] as const
  for (const [args, path] of cases) {
    const result = await Arsenal.execute("contract-freezer", args)
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain("invalid_arguments")
    expect(result.content[0].text).toContain(path)
  }
  expect(calls).toEqual({ getter: 0, hook: 0, proxy: 0 })
  const shared = { value: 1 }
  expect(validateArgs({ type: "object", additionalProperties: { type: "object", properties: { value: { type: "number" } }, required: ["value"], additionalProperties: false } }, { a: shared, b: shared })).toEqual({ ok: true })
  expect(validateArgs({ type: "array", items: { type: "number" }, uniqueItems: true }, [1, 1]).ok).toBe(false)
  expect(validateArgs({ type: "object", required: 1 }, {}).ok).toBe(false)
  expect(validateArgs({ type: "string", enum: 1 }, "type").ok).toBe(false)
  expect(validateArgs({ type: "string", pattern: "[" }, "type").ok).toBe(false)
  expect(validateArgs({ type: "number", minimum: Object.create(null) }, 1).ok).toBe(false)
})

test("unexpanded exact-site patterns HOLD without claiming glob intersections or layer safety", async () => {
  const wps = [{ id: "a", writes: ["src/**"] }, { id: "b", writes: ["src/x.ts"] }]
  expect(unresolvedScopes(wps)).toEqual([{ wp: "a", field: "writes", site: "src/**" }])
  const report = conflictVerdict(wps)
  expect(report.verdict).toBe("CONFLICT")
  expect(report.hold?.code).toBe("PATTERN_SCOPE_UNRESOLVED")
  expect(sitesConflict("src/**", "other/y.ts")).toBe(true)
  for (const args of [
    { wps },
    { wps, layers: [["a"], ["b"]] },
    { wps: wps.map((wp) => ({ ...wp, appendOnly: ["src/**"] })) },
    { wps: [wps[0]] },
    { wps: [{ id: "a", reads: ["src/?.ts"] }] },
    { wps: [{ id: "a", appendOnly: ["src/**"] }] },
  ]) {
    const result = await Arsenal.execute("conflict-map", args)
    expect(result.isError).not.toBe(true)
    const output = JSON.parse(result.content[0].text)
    expect(output.status).toBe("HOLD")
    expect(output.code).toBe("PATTERN_SCOPE_UNRESOLVED")
    expect(output.parallelSafe).toBe(false)
    expect(output.dependencies).toEqual([])
    expect(result.content[1].text).toContain("repo-mapper")
  }
  const floor = await Arsenal.execute("plan-check", { items: [{ id: "A", test: "acceptance" }], wps: [{ ...wps[0], covers: ["A"] }] })
  expect(JSON.parse(floor.content[0].text).ok).toBe(false)
  expect(floor.content[0].text).toContain("PATTERN_SCOPE_UNRESOLVED")
  const scheduler = await Arsenal.execute("wave-scheduler", { wps: [wps[0]], events: [] })
  const held = JSON.parse(scheduler.content[0].text)
  expect(held.status).toBe("HOLD")
  expect(held.code).toBe("PATTERN_SCOPE_UNRESOLVED")
  expect(held.dispatchNow).toEqual([])
  expect(held.mergeNow).toBeNull()
  expect(held.done).toBe(false)
})

test("exact-site controls preserve brackets, escaped marker filenames, ranges and literal dependencies", async () => {
  expect(patternScope("src/[cache].ts")).toBe(false)
  expect(patternScope(String.raw`src/a\*.ts`)).toBe(false)
  expect(patternScope(String.raw`src/a\?.ts`)).toBe(false)
  expect(patternScope(String.raw`src/a\\*.ts`)).toBe(true)
  expect(patternScope(String.raw`src/a\\\*.ts`)).toBe(false)
  expect(normalizeSite(String.raw`src/a\*.ts:L1-10`)).toEqual({ path: "src/a*.ts", range: { start: 1, end: 10 } })
  expect(sitesConflict(String.raw`src/a\*.ts`, "src/a.ts")).toBe(false)
  expect(sitesConflict(String.raw`src/a\*.ts:L1-10`, String.raw`src/a\*.ts:L10-20`)).toBe(true)
  const safe = await Arsenal.execute("conflict-map", { wps: [{ id: "a", writes: ["src/[cache].ts", String.raw`src/a\*.ts`] }, { id: "b", writes: ["src/x.ts"], reads: ["src/[cache].ts"] }] })
  const output = JSON.parse(safe.content[0].text)
  expect(output.parallelSafe).toBe(true)
  expect(output.status).toBeUndefined()
  expect(output.dependencies).toEqual([{ from: "a", to: "b", via: ["src/[cache].ts"] }])
  expect(output.pairs[0].verdict).toBe("CONFLICT_FREE")
  const conflict = await Arsenal.execute("conflict-map", { wps: [{ id: "a", writes: ["src/x.ts"] }, { id: "b", writes: ["src/x.ts:L2"] }] })
  expect(JSON.parse(conflict.content[0].text).parallelSafe).toBe(false)
  const union = await Arsenal.execute("conflict-map", { wps: [{ id: "a", writes: [String.raw`src/a\*.ts`], appendOnly: [String.raw`src/a\*.ts`] }, { id: "b", writes: [String.raw`src/a\*.ts:L2`], appendOnly: [String.raw`src/a\*.ts`] }] })
  expect(JSON.parse(union.content[0].text).pairs[0].verdict).toBe("UNION_RESOLVABLE")
  expect((await Arsenal.describe("conflict-map")).inputSchema.properties?.wps.items).toBeDefined()
})
