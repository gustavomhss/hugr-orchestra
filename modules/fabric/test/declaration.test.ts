import { expect, test } from "bun:test"
import { Schema } from "effect"
import { catalog, document } from "./fixture/declaration"
import { failure, ledger } from "./fixture/assert"

test("CMP01 one compiler resolves trusted revisions and rejects incompatible props, sources and slots", async () => {
  const { compile } = await import("../src/declaration")
  const value = document()
  expect(compile(value, catalog).ok).toBe(true)
  expect(compile({ ...value, tools: [{ ...value.tools[0], props: { title: "x".repeat(1024) } }, ...value.tools.slice(1)] }, catalog).ok).toBe(true)
  failure(compile({ ...value, tools: [{ ...value.tools[0], props: { title: "x".repeat(262144) } }, ...value.tools.slice(1)] }, catalog))
  const nestedCatalog = { ...catalog, components: catalog.components.map((component) => component.id === "fabric.runs"
    ? { ...component, props: Schema.Struct({ nested: Schema.Json }).annotate({ parseOptions: { onExcessProperty: "error" } }) } : component) }
  const nested = (depth: number) => Array.from({ length: depth }).reduce<unknown>((value) => [value], 0)
  expect(compile({ ...value, tools: [{ ...value.tools[0], props: { nested: nested(12) } }, ...value.tools.slice(1)] }, nestedCatalog).ok).toBe(true)
  failure(compile({ ...value, tools: [{ ...value.tools[0], props: { nested: nested(13) } }, ...value.tools.slice(1)] }, nestedCatalog))
  failure(compile({ ...value, tools: [{ ...value.tools[0], source: { capability: { id: "fabric.not-found", revision: "1" } } }, ...value.tools.slice(1)] }, catalog))
  const invalid = [
    { ...value, tools: [{ ...value.tools[0], props: { token: "DO_NOT_ECHO" } }, ...value.tools.slice(1)] },
    { ...value, tools: [{ ...value.tools[0], slot: "inspect" }, ...value.tools.slice(1)] },
    { ...value, tools: [{ ...value.tools[0], component: { id: "fabric.unknown", revision: "1" } }, ...value.tools.slice(1)] },
    { ...value, tools: [{ ...value.tools[0], component: { id: "fabric.runs", revision: "99" } }, ...value.tools.slice(1)] },
    { ...value, tools: [{ ...value.tools[0], source: { capability: { id: "fabric.query", revision: "1" } } }, ...value.tools.slice(1)] },
    { ...value, tools: [{ ...value.tools[0], source: { capability: { id: "fabric.write", revision: "1" } } }, ...value.tools.slice(1)] },
    { ...value, tools: [{ ...value.tools[0], source: { ...value.tools[0].source, args: { url: "https://invalid.example" } } }, ...value.tools.slice(1)] },
  ]
  invalid.forEach((input) => {
    const result = compile(input, catalog)
    expect(result.ok).toBe(false)
    failure(result)
    expect(result).not.toHaveProperty("document")
    if (!result.ok) expect(result.diagnostics.some((d) => d.path.startsWith("/tools/0"))).toBe(true)
    expect(JSON.stringify(result)).not.toContain("DO_NOT_ECHO")
  })
  const valueType = { ...value, tools: [{ ...value.tools[0], props: { title: 1 } }, ...value.tools.slice(1)] }
  failure(compile(valueType, catalog))
  failure(compile({ ...value, tools: [{ ...value.tools[0], source: { ...value.tools[0].source, args: { limit: "1" } } }, ...value.tools.slice(1)] }, catalog))
  const populated = compile({ ...value, tools: [{ ...value.tools[0], props: { title: "<script>inert</script>" },
    source: { ...value.tools[0].source, args: { limit: 1 } } }, ...value.tools.slice(1)] }, catalog)
  expect(populated.ok).toBe(true)
  if (populated.ok) {
    expect(populated.document.tools[0].props).toEqual({ title: "<script>inert</script>" })
    expect(populated.document.tools[0].source?.args).toEqual({ limit: 1 })
  }
  ;["not-found", "fabric.execution.list"].forEach((id) => failure(compile({ ...value, tools: [
    { ...value.tools[0], source: { capability: { id, revision: "99" } } }, ...value.tools.slice(1),
  ] }, catalog)))
  ;(["consumed-execution", "definition-write", "data-write", "access-change", "destructive"] as const).forEach((effect) => {
    const forbidden = { ...catalog, capabilities: catalog.capabilities.map((capability) => capability.ref.id === "fabric.execution.list"
      ? { ...capability, effect } : capability) }
    failure(compile(value, forbidden))
  })
  const data = { ...catalog, capabilities: catalog.capabilities.map((capability) => capability.ref.id === "fabric.execution.list"
    ? { ...capability, effect: "data-read" as const } : capability) }
  expect(compile(value, data).ok).toBe(true)
  const mismatched = { ...catalog, capabilities: catalog.capabilities.map((capability) => capability.ref.id === "fabric.execution.list"
    ? { ...capability, result: "rows@1" } : capability) }
  failure(compile(value, mismatched))
  const calls: string[] = []
  const accessor = Object.defineProperty({}, "format", { enumerable: true, get: () => { calls.push("get"); return value.format } })
  const cycle: { value?: unknown } = {}
  cycle.value = cycle
  const nestedGetter = Object.defineProperty({}, "title", { enumerable: true, get: () => { calls.push("nested-get"); return "text" } })
  const arrayGetter = Object.defineProperty([value.tools[0]], "0", { enumerable: true, get: () => { calls.push("array-get"); return value.tools[0] } })
  ;[accessor, { ...value, toJSON: () => { calls.push("json"); return value } }, cycle,
    Array.from({ length: 10000 }).reduce<unknown>((input) => [input], 0),
    { ...value, tools: [{ ...value.tools[0], props: nestedGetter }] }, { ...value, tools: arrayGetter },
    { ...value, tools: [{ ...value.tools[0], props: { nested: { toJSON: () => { calls.push("nested-json"); return {} } } } }] },
  ].forEach((input) => failure(compile(input, catalog)))
  expect(calls).toEqual([])
  ;[
    { ...value, format: "other" }, { ...value, authority: "DO_NOT_ECHO" },
    { ...value, layout: { ...value.layout, overrides: { locked: "yes" } } },
    { ...value, tools: Array.from({ length: 25 }, (_, index) => ({ ...value.tools[0], id: `tool-${index}` })), bindings: [] },
  ].forEach((input) => failure(compile(input, catalog)))
  const componentTwo = { ...catalog.components[0], revision: "2", sourceResult: "runs-v2@1",
    props: Schema.Struct({ detail: Schema.String }).annotate({ parseOptions: { onExcessProperty: "error" } }) }
  const capabilityTwo = { ...catalog.capabilities[0], ref: { id: "fabric.execution.list", revision: "2" }, result: "runs-v2@1",
    args: Schema.Struct({ mode: Schema.Literal("detail") }).annotate({ parseOptions: { onExcessProperty: "error" } }) }
  const multiple = { components: [componentTwo, ...catalog.components], capabilities: [capabilityTwo, ...catalog.capabilities] }
  expect(compile(value, multiple).ok).toBe(true)
  expect(compile({ ...value, tools: [{ ...value.tools[0], component: { id: "fabric.runs", revision: "2" },
    props: { detail: "specific" }, source: { capability: capabilityTwo.ref, args: { mode: "detail" } } }, ...value.tools.slice(1)] }, multiple).ok).toBe(true)
  ;[
    { props: {}, source: { capability: capabilityTwo.ref, args: { mode: "detail" } } },
    { props: { detail: "specific" }, source: { capability: capabilityTwo.ref, args: {} } },
    { props: { detail: "specific" }, source: { capability: capabilityTwo.ref } },
  ].forEach((fields) => failure(compile({ ...value, tools: [{ ...value.tools[0], component: { id: "fabric.runs", revision: "2" },
    ...fields }, ...value.tools.slice(1)] }, multiple)))
})

test("CMP02 bindings are explicit, typed, exclusive and acyclic with the single known projection", async () => {
  const { compile } = await import("../src/declaration")
  const value = document()
  const valid = compile(value, catalog)
  expect(valid.ok).toBe(true)
  if (valid.ok) expect(valid.order).toEqual(["runs", "logs", "details"])
  ;[
    [...value.bindings, value.bindings[0]],
    [{ from: { tool: "runs", port: "selected" }, to: { tool: "details", port: "resource" } }],
    [{ from: { tool: "unknown", port: "selected" }, to: { tool: "logs", port: "execution" } }],
    [{ from: { tool: "runs", port: "nope" }, to: { tool: "logs", port: "execution" } }],
    [{ from: { tool: "runs", port: "selected" }, to: { tool: "logs", port: "execution" }, projection: "executionResource" }],
    [{ from: { tool: "runs", port: "selected" }, to: { tool: "missing", port: "execution" } }],
    [{ from: { tool: "runs", port: "selected" }, to: { tool: "logs", port: "missing" } }],
  ].forEach((bindings) => failure(compile({ ...value, bindings }, catalog)))
  const extra = { ...value.tools[0], id: "runs-two", slot: "support" }
  failure(compile({ ...value, tools: [...value.tools, extra], bindings: [value.bindings[0],
    { from: { tool: "runs-two", port: "selected" }, to: { tool: "logs", port: "execution" } },
  ] }, catalog))
  const reversed = compile({ ...value, tools: [value.tools[1], value.tools[2], value.tools[0]] }, catalog)
  expect(reversed.ok).toBe(true)
  if (reversed.ok) expect(reversed.order).toEqual(["runs", "logs", "details"])
  const empty = compile({ ...value, bindings: [] }, catalog)
  expect(empty.ok).toBe(true)
  if (empty.ok) {
    expect(empty.document.bindings).toEqual([])
    expect(empty.order).toEqual(["runs", "logs", "details"])
  }
  const graph = {
    ...catalog,
    components: catalog.components.map((component) => component.id === "fabric.runs"
      ? { ...component, inputs: { previous: component.outputs.selected } } : component.id === "fabric.logs"
        ? { ...component, outputs: { selected: catalog.components[0].outputs.selected } } : component),
  }
  failure(compile({ ...value, bindings: [...value.bindings,
    { from: { tool: "logs", port: "selected" }, to: { tool: "runs", port: "previous" } },
  ] }, graph))
  failure(compile({ ...value, bindings: [{ from: { tool: "runs", port: "selected" }, to: { tool: "runs", port: "previous" } }] }, graph))
  const incompatible = { ...catalog, components: catalog.components.map((component) => component.id === "fabric.logs"
    ? { ...component, inputs: { execution: { type: "ExecutionRef" as const, revision: "2", nullable: false } } } : component) }
  failure(compile(value, incompatible))
  ;[
    { type: "ExecutionRef" as const, revision: "1", nullable: false },
    { type: "ExecutionRef" as const, revision: "2", nullable: true },
    { type: "ResourceSet" as const, revision: "1", nullable: true },
  ].forEach((execution) => failure(compile(value, {
    ...catalog, components: catalog.components.map((component) => component.id === "fabric.logs"
      ? { ...component, inputs: { execution } } : component),
  })))
  const setOutput = { ...catalog, components: catalog.components.map((component) => component.id === "fabric.runs"
    ? { ...component, outputs: { selected: { type: "ResourceSet" as const, revision: "1", nullable: true } } } : component) }
  failure(compile({ ...value, bindings: [value.bindings[1]] }, setOutput))
  failure(compile({ ...value, bindings: [{ from: { tool: "runs", port: "selected" }, to: { tool: "details", port: "resource" } }] }, setOutput))
  ;(["ResourceSet", "ResultHandle", "FilterSet", "ResourceRef"] as const).forEach((type) => {
    const matching = { ...catalog, components: catalog.components.map((component) => component.id === "fabric.runs"
      ? { ...component, outputs: { selected: { type, revision: "1", nullable: true } } } : component.id === "fabric.logs"
        ? { ...component, inputs: { execution: { type, revision: "1", nullable: true } } } : component) }
    expect(compile({ ...value, bindings: [value.bindings[0]] }, matching).ok).toBe(true)
    failure(compile({ ...value, bindings: [value.bindings[1]] }, matching))
  })
  failure(compile({ ...value, bindings: [{ from: { tool: "logs", port: "execution" }, to: { tool: "runs", port: "selected" } }] }, catalog))
  const directions = { ...catalog, components: catalog.components.map((component) => ({ ...component,
    inputs: { input: { type: "ExecutionRef" as const, revision: "1", nullable: true } },
    outputs: { output: { type: "ExecutionRef" as const, revision: "1", nullable: true } },
  })) }
  ;[
    { from: { tool: "runs", port: "input" }, to: { tool: "logs", port: "input" } },
    { from: { tool: "runs", port: "output" }, to: { tool: "logs", port: "output" } },
  ].forEach((binding) => failure(compile({ ...value, bindings: [binding] }, directions)))
  expect(compile({ ...value, bindings: [{ from: { tool: "runs", port: "output" }, to: { tool: "logs", port: "input" } }] }, directions).ok).toBe(true)
  const nonnullable = { ...catalog, components: catalog.components.map((component) => component.id === "fabric.runs"
    ? { ...component, outputs: { selected: { type: "ExecutionRef" as const, revision: "1", nullable: false } } } : component) }
  expect(compile(value, nonnullable).ok).toBe(true)
  const disconnected = compile({ ...value, tools: [{ ...value.tools[2], id: "lonely" }, value.tools[1], value.tools[2], value.tools[0]] }, catalog)
  expect(disconnected.ok).toBe(true)
  if (disconnected.ok) expect(disconnected.order).toEqual(["lonely", "runs", "logs", "details"])
  const newlyReady = compile({ ...value, tools: [{ ...value.tools[1], id: "a", slot: "main" },
    { ...value.tools[0], id: "b", slot: "support" }, { ...value.tools[2], id: "c" }],
    bindings: [{ from: { tool: "b", port: "selected" }, to: { tool: "a", port: "execution" } }],
  }, catalog)
  expect(newlyReady.ok).toBe(true)
  if (newlyReady.ok) expect(newlyReady.order).toEqual(["b", "a", "c"])
  ;[{ revision: "2", nullable: true }, { revision: "1", nullable: false }].forEach((port) => failure(compile(value, {
    ...catalog, components: catalog.components.map((component) => component.id === "fabric.details"
      ? { ...component, inputs: { resource: { type: "ResourceRef" as const, ...port } } } : component),
  })))
})

test("CMP03 layout normalization is deterministic, inspectable and preserves IDs and declared data", async () => {
  const { compile } = await import("../src/declaration")
  const value = document()
  const before = structuredClone(value)
  ;(["explore", "investigate", "develop", "change", "compare"] as const).forEach((recipe) => {
    const result = compile({ ...value, layout: { ...value.layout, recipe } }, catalog)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.layout.recipe).toBe(recipe)
    expect(result.document.tools).toEqual(value.tools)
    const again = compile(result.document, catalog)
    expect(again.ok).toBe(true)
    if (again.ok) {
      expect(again.document).toEqual(result.document)
      expect(again.normalizations).toEqual([])
    }
  })
  ;["support", "inspect"].forEach((slot) => {
    const tool = slot === "inspect" ? value.tools[2] : { ...value.tools[0], slot }
    const result = compile({ ...value, tools: [tool], bindings: [] }, catalog)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.order).toEqual([tool.id])
    expect(result.document.layout.overrides.order).toEqual({ main: [], support: slot === "support" ? [tool.id] : [], inspect: slot === "inspect" ? [tool.id] : [] })
    expect(result.document.layout.overrides.activeTab).toEqual({ [slot]: tool.id })
  })
  const result = compile(value, catalog)
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(compile(value, catalog)).toEqual(result)
  expect(result.document.tools.map((tool) => tool.id)).toEqual(["runs", "logs", "details"])
  expect(result.document.layout.overrides.order).toEqual({ main: ["runs"], support: ["logs"], inspect: ["details"] })
  expect(result.document.layout.overrides.activeTab).toEqual({ main: "runs", support: "logs", inspect: "details" })
  expect(result.document.layout.overrides.sizes).toEqual({ main: 3, support: 2, inspect: 1 })
  expect(result.normalizations.length).toBeGreaterThan(0)
  ledger(value.layout.overrides, result.document.layout.overrides, result.normalizations)
  expect(result.normalizations.every((change) => change.path.startsWith("/layout/overrides"))).toBe(true)
  expect(result.normalizations).toContainEqual({ path: "/layout/overrides/order", after: { main: ["runs"], support: ["logs"], inspect: ["details"] }, messageKey: "fabric.declaration.default" })
  expect(value).toEqual(before)
  expect({ ...result.document, layout: value.layout }).toEqual(value)
  const solo = compile({ ...value, tools: [value.tools[0]], bindings: [] }, catalog)
  expect(solo.ok).toBe(true)
  if (solo.ok) {
    expect(solo.document.tools).toEqual([value.tools[0]])
    expect(solo.document.layout.overrides.order).toEqual({ main: ["runs"], support: [], inspect: [] })
    expect(solo.document.layout.overrides.activeTab).toEqual({ main: "runs" })
    const again = compile(solo.document, catalog)
    expect(again.ok).toBe(true)
    if (again.ok) expect(again.normalizations).toEqual([])
  }
  const normalized = compile(result.document, catalog)
  expect(normalized.ok).toBe(true)
  if (normalized.ok) {
    expect(normalized.document).toEqual(result.document)
    expect(normalized.normalizations).toEqual([])
  }
  ;[
    { order: { main: ["logs"] } }, { toolPins: ["unknown"] }, { toolPins: ["runs", "runs"] },
    { resourcePins: { runs: "unknown-alias" } }, { activeTab: { support: "runs" } },
    { order: { main: ["runs", "runs"] } }, { order: { main: ["missing"] } },
    { activeTab: { main: "missing" } }, { resourcePins: { missing: "carga" } },
  ].forEach((overrides) => failure(compile({ ...value, layout: { ...value.layout, overrides } }, catalog)))
  const overridden = compile({ ...value, tools: [...value.tools, { ...value.tools[0], id: "second", slot: "main" }],
    layout: { ...value.layout, overrides: { order: { main: ["second"] }, activeTab: { main: "runs" },
      toolPins: ["runs"], resourcePins: { runs: "carga" }, sizes: { main: 7 }, collapsed: ["inspect"], locked: true } },
  }, catalog)
  expect(overridden.ok).toBe(true)
  if (overridden.ok) {
    ledger({ order: { main: ["second"] }, activeTab: { main: "runs" }, toolPins: ["runs"], resourcePins: { runs: "carga" },
      sizes: { main: 7 }, collapsed: ["inspect"], locked: true }, overridden.document.layout.overrides, overridden.normalizations)
    expect(overridden.document.layout.overrides.order?.main).toEqual(["second", "runs"])
    expect(overridden.document.layout.overrides.activeTab?.main).toBe("runs")
    expect(overridden.document.layout.overrides.resourcePins).toEqual({ runs: "carga" })
    expect(overridden.document.layout.overrides.toolPins).toEqual(["runs"])
    expect(overridden.document.layout.overrides.locked).toBe(true)
    expect(overridden.document.layout.overrides.sizes).toEqual({ main: 7, support: 2, inspect: 1 })
    expect(overridden.document.layout.overrides.collapsed).toEqual(["inspect"])
    expect(overridden.normalizations).toContainEqual({ path: "/layout/overrides/order", before: { main: ["second"] },
      after: { main: ["second", "runs"], support: ["logs"], inspect: ["details"] }, messageKey: "fabric.declaration.default" })
  }
  const multipleMain = [...value.tools, { ...value.tools[0], id: "second", slot: "main" }, { ...value.tools[0], id: "third", slot: "main" }]
  const defaultTabs = compile({ ...value, tools: multipleMain }, catalog)
  expect(defaultTabs.ok).toBe(true)
  if (defaultTabs.ok) {
    expect(defaultTabs.document.layout.overrides.order?.main).toEqual(["runs", "second", "third"])
    expect(defaultTabs.document.layout.overrides.activeTab?.main).toBe("runs")
  }
  const partialTabs = compile({ ...value, tools: multipleMain, layout: { ...value.layout, overrides: { order: { main: ["third"] } } } }, catalog)
  expect(partialTabs.ok).toBe(true)
  if (partialTabs.ok) {
    expect(partialTabs.document.layout.overrides.order?.main).toEqual(["third", "runs", "second"])
    expect(partialTabs.document.layout.overrides.activeTab?.main).toBe("third")
  }
  const weighted = compile({ ...value, layout: { ...value.layout, overrides: { sizes: { main: 6, support: 4, inspect: 2 } } } }, catalog)
  expect(weighted.ok).toBe(true)
  if (weighted.ok) {
    expect(weighted.document.layout.overrides.sizes).toEqual({ main: 6, support: 4, inspect: 2 })
    const again = compile(weighted.document, catalog)
    expect(again.ok).toBe(true)
    if (again.ok) expect(again.document.layout.overrides.sizes).toEqual({ main: 6, support: 4, inspect: 2 })
  }
})

test("CMP04 validity is independent of readiness and future versions, aliases and duplicate identities fail closed", async () => {
  const { compile } = await import("../src/declaration")
  const value = document()
  const allowed = compile(value, catalog, { runs: "denied" })
  expect(allowed.ok).toBe(true)
  if (allowed.ok) expect(allowed.availability).toEqual({ runs: "denied", logs: "unverified", details: "unverified" })
  const plain = compile(value, catalog)
  if (allowed.ok && plain.ok) expect({ ...allowed, availability: plain.availability }).toEqual(plain)
  failure(compile({ ...value, tools: [{ ...value.tools[0], props: { token: "DO_NOT_ECHO" } }, ...value.tools.slice(1)] }, catalog, { runs: "denied" }))
  ;[
    { ...value, context: { resourceAliases: ["carga", "carga"] } },
    { ...value, tools: [value.tools[0], { ...value.tools[1], id: "runs" }, value.tools[2]] },
    { ...value, tools: [value.tools[0], { ...value.tools[1], id: "runs" }, value.tools[2]], bindings: [] },
    { ...value, tools: [{ ...value.tools[0], source: { ...value.tools[0].source, resourceAlias: "unknown" } }, ...value.tools.slice(1)] },
    { ...value, layout: { ...value.layout, revision: 2 } },
  ].forEach((input) => failure(compile(input, catalog)))
  const future = compile({ ...value, version: 2 }, catalog)
  const futureLayout = compile({ ...value, layout: { ...value.layout, revision: 2 } }, catalog)
  failure(futureLayout)
  if (!futureLayout.ok) expect(futureLayout.diagnostics.some((d) => d.code === "incompatible-version")).toBe(true)
  expect(future.ok).toBe(false)
  if (!future.ok) expect(future.diagnostics.some((d) => d.code === "incompatible-version")).toBe(true)
  expect(value.layout.overrides).toEqual({})
})
