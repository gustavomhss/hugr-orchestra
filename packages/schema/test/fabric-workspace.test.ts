import { expect, test } from "bun:test"
import { Schema } from "effect"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type ReadonlyRecord<T> = Equal<T, Readonly<T>>

const document = () => ({
  format: "fabric-studio.workspace", version: 1, title: "Investigar carga",
  context: { resourceAliases: ["carga"] },
  layout: { recipe: "investigate", revision: 1, overrides: {} },
  tools: [{ id: "runs", component: { id: "fabric.run-list", revision: "1" }, slot: "main", props: {},
    source: { capability: { id: "fabric.execution.list", revision: "1" }, resourceAlias: "carga" } }],
  bindings: [],
} as const)

test("DEC01 workspace wire roundtrips closed data and preserves canonical references", async () => {
  const { FabricWorkspace } = await import("../src/fabric-workspace")
  const { FabricCapability } = await import("../src/fabric-capability")
  const root = await import("@orchestra/schema")
  expect(root.FabricWorkspace).toBe(FabricWorkspace)
  expect(FabricWorkspace.Source.fields.capability).toBe(FabricCapability.Ref)
  expect(Schema.encodeSync(FabricWorkspace.Document)(Schema.decodeUnknownSync(FabricWorkspace.Document)(document())))
    .toEqual(document())
  expect(Schema.decodeUnknownSync(FabricWorkspace.Ref)({ id: FabricWorkspace.ID.create(), revision: 1 }).revision).toBe(1)
  const id = FabricWorkspace.ID.create()
  expect(id).toMatch(/^fwsp_[0-9A-Za-z]{26}$/)
  expect(FabricWorkspace.ID.create()).not.toBe(id)
  ;[id + "\n", id + "x", id.slice(0, -1), id.replace("fwsp_", "fwsp"), "fwsp_" + "a".repeat(25) + "_", "fctx_" + "a".repeat(26)]
    .forEach((invalid) => expect(() => Schema.decodeUnknownSync(FabricWorkspace.ID)(invalid)).toThrow())
  ;[0, -1, 1.5, "1", Infinity, NaN, Number.MAX_SAFE_INTEGER + 1].forEach((revision) =>
    expect(() => Schema.decodeUnknownSync(FabricWorkspace.Ref)({ id, revision })).toThrow(),
  )
  expect(Schema.decodeUnknownSync(FabricWorkspace.Ref)({ id, revision: Number.MAX_SAFE_INTEGER }).revision).toBe(Number.MAX_SAFE_INTEGER)
  expect(() => Schema.decodeUnknownSync(FabricWorkspace.Ref)({ id, revision: 1, owner: "foreign" })).toThrow()
})

test("DEC02 workspace wire rejects unknown authority/code fields and incompatible literal formats", async () => {
  const { FabricWorkspace } = await import("../src/fabric-workspace")
  const value = document()
  ;[
    { ...value, token: "forbidden" }, { ...value, script: "run()" }, { ...value, version: 2 }, { ...value, format: "other" },
    { ...value, context: { ...value.context, contextID: "foreign" } },
    { ...value, layout: { ...value.layout, css: "position:absolute" } },
    { ...value, tools: [{ ...value.tools[0], source: { ...value.tools[0].source, url: "https://invalid.example" } }] },
    { ...value, tools: [{ ...value.tools[0], component: { id: "fabric.run-list", revision: 1 } }] },
    { ...value, bindings: [{ from: { tool: "runs", port: "selection" }, to: { tool: "runs", port: "run" }, projection: "eval" }] },
    { ...value, tools: [{ ...value.tools[0], grant: "forbidden" }] },
    { ...value, tools: [{ ...value.tools[0], component: { ...value.tools[0].component, import: "module" } }] },
    { ...value, tools: [{ ...value.tools[0], source: { ...value.tools[0].source, capability: { ...value.tools[0].source.capability, token: "forbidden" } } }] },
    { ...value, bindings: [{ from: { tool: "runs", port: "selected", action: "run" }, to: { tool: "logs", port: "execution" } }] },
    { ...value, tools: [{ ...value.tools[0], props: [] }] },
    { ...value, tools: [{ ...value.tools[0], source: { ...value.tools[0].source, args: [] } }] },
    { ...value, tools: [{ ...value.tools[0], component: { id: "fabric.run-list", revision: "" } }] },
    { ...value, tools: [{ ...value.tools[0], props: { bad: () => 1 } }] },
    { ...value, tools: [{ ...value.tools[0], source: { ...value.tools[0].source, args: { bad: undefined } } }] },
    { ...value, bindings: [{ from: { tool: "a", port: "x" }, to: { tool: "b", port: "x" }, action: "run" }] },
    { ...value, bindings: [{ from: { tool: "a", port: "x" }, to: { tool: "b", port: "x", token: "forbidden" } }] },
  ].forEach((input) => expect(() => Schema.decodeUnknownSync(FabricWorkspace.Document)(input)).toThrow())
  Object.keys(value).forEach((field) => expect(() => Schema.decodeUnknownSync(FabricWorkspace.Document)(
    Object.fromEntries(Object.entries(value).filter(([name]) => name !== field)),
  )).toThrow())
  Object.keys(value.tools[0]).filter((key) => key !== "source").forEach((field) =>
    expect(() => Schema.decodeUnknownSync(FabricWorkspace.Document)({ ...value, tools: [
      Object.fromEntries(Object.entries(value.tools[0]).filter(([name]) => name !== field)),
    ] })).toThrow(),
  )
  const binding = { from: { tool: "runs", port: "selected" }, to: { tool: "logs", port: "execution" } }
  const omit = (record: object, field: string) => Object.fromEntries(Object.entries(record).filter(([key]) => key !== field))
  ;[
    ...Object.keys(value.context).map((field) => ({ ...value, context: omit(value.context, field) })),
    ...Object.keys(value.layout).map((field) => ({ ...value, layout: omit(value.layout, field) })),
    ...Object.keys(value.tools[0].component).map((field) => ({ ...value, tools: [{ ...value.tools[0], component: omit(value.tools[0].component, field) }] })),
    { ...value, tools: [{ ...value.tools[0], source: { resourceAlias: "carga" } }] },
    ...Object.keys(binding).map((field) => ({ ...value, bindings: [omit(binding, field)] })),
    ...Object.keys(binding.from).flatMap((field) => [
      { ...value, bindings: [{ ...binding, from: omit(binding.from, field) }] },
      { ...value, bindings: [{ ...binding, to: omit(binding.to, field) }] },
    ]),
  ].forEach((input) => expect(() => Schema.decodeUnknownSync(FabricWorkspace.Document)(input)).toThrow())
  ;[Number.MAX_SAFE_INTEGER + 1, Infinity, NaN].forEach((main) =>
    expect(() => Schema.decodeUnknownSync(FabricWorkspace.Document)({ ...value, layout: { ...value.layout, overrides: { sizes: { main } } } })).toThrow(),
  )
  expect(Schema.decodeUnknownSync(FabricWorkspace.Document)({ ...value, layout: { ...value.layout,
    overrides: { sizes: { main: Number.MAX_SAFE_INTEGER } } } }).layout.overrides.sizes?.main).toBe(Number.MAX_SAFE_INTEGER)
  ;[{ css: "free" }, { sizes: { main: 0 } }, { sizes: { main: 1.5 } }, { sizes: { main: "3" } },
    { sizes: { unknown: 1 } }, { collapsed: ["unknown"] }, { collapsed: true }, { locked: "true" },
    { order: { unknown: [] } }, { activeTab: { unknown: "runs" } }, { toolPins: [1] }, { resourcePins: { runs: 1 } },
  ].forEach((overrides) => expect(() => Schema.decodeUnknownSync(FabricWorkspace.Document)({ ...value, layout: { ...value.layout, overrides } })).toThrow())
  const populated = { ...value, tools: [{ ...value.tools[0], props: { arbitrary: { values: [1, true, null] } },
    source: { ...value.tools[0].source, args: { nested: { x: [false, "text"] } } } }],
    layout: { ...value.layout, overrides: { order: { main: ["runs"] }, activeTab: { main: "runs" }, sizes: { main: 3 },
      collapsed: ["support"], toolPins: ["runs"], resourcePins: { runs: "carga" }, locked: true } },
  } as const
  expect(Schema.encodeSync(FabricWorkspace.Document)(Schema.decodeUnknownSync(FabricWorkspace.Document)(populated))).toEqual(populated)
})

test("DEC03 workspace wire keeps finite cardinality and safe numeric layout revisions", async () => {
  const { FabricWorkspace } = await import("../src/fabric-workspace")
  const value = document()
  expect(Schema.decodeUnknownSync(FabricWorkspace.Document)({ ...value, tools: Array.from({ length: 24 }, (_, n) => ({ ...value.tools[0], id: `tool-${n}` })) }).tools).toHaveLength(24)
  expect(() => Schema.decodeUnknownSync(FabricWorkspace.Document)({ ...value, tools: Array(25).fill(value.tools[0]) })).toThrow()
  ;[0, -1, 1.5, "1", Infinity, Number.MAX_SAFE_INTEGER + 1].forEach((revision) =>
    expect(() => Schema.decodeUnknownSync(FabricWorkspace.Document)({ ...value, layout: { ...value.layout, revision } })).toThrow(),
  )
  expect(() => Schema.decodeUnknownSync(FabricWorkspace.Document)({ ...value, tools: [] })).toThrow()
  const binding = { from: { tool: "runs", port: "selected" }, to: { tool: "logs", port: "execution" } }
  expect(Schema.decodeUnknownSync(FabricWorkspace.Document)({ ...value, bindings: Array(64).fill(binding) }).bindings).toHaveLength(64)
  expect(() => Schema.decodeUnknownSync(FabricWorkspace.Document)({ ...value, bindings: Array(65).fill(binding) })).toThrow()
  expect(Schema.decodeUnknownSync(FabricWorkspace.Document)({ ...value, layout: { ...value.layout, revision: 2 } }).layout.revision).toBe(2)
})

test("DEC04 workspace optionals omit undefined and recipes/slots/projections are closed", async () => {
  const { FabricWorkspace } = await import("../src/fabric-workspace")
  expect(new Set(FabricWorkspace.Recipe.literals)).toEqual(new Set(["explore", "investigate", "develop", "change", "compare"]))
  expect(new Set(FabricWorkspace.Slot.literals)).toEqual(new Set(["main", "support", "inspect"]))
  const decoded = Schema.decodeUnknownSync(FabricWorkspace.Document)(document())
  const encoded = Schema.encodeSync(FabricWorkspace.Document)({ ...decoded, tools: [{ ...decoded.tools[0], source: undefined }] })
  expect(encoded.tools[0]).not.toHaveProperty("source")
  const source = Schema.decodeUnknownSync(FabricWorkspace.Source)({ capability: document().tools[0].source.capability })
  expect(Schema.encodeSync(FabricWorkspace.Source)({ ...source, resourceAlias: undefined, args: undefined }))
    .toEqual({ capability: document().tools[0].source.capability })
  const binding = Schema.decodeUnknownSync(FabricWorkspace.Binding)({ from: { tool: "a", port: "x" }, to: { tool: "b", port: "x" } })
  expect(Schema.encodeSync(FabricWorkspace.Binding)({ ...binding, projection: undefined })).not.toHaveProperty("projection")
  expect(Schema.encodeSync(FabricWorkspace.Overrides)({ order: undefined, activeTab: undefined, sizes: undefined,
    collapsed: undefined, toolPins: undefined, resourcePins: undefined, locked: undefined })).toEqual({})
  const readonly: {
    document: ReadonlyRecord<typeof FabricWorkspace.Document.Type>;
    tool: ReadonlyRecord<typeof FabricWorkspace.Tool.Type>;
    source: ReadonlyRecord<typeof FabricWorkspace.Source.Type>;
    layout: ReadonlyRecord<typeof FabricWorkspace.Layout.Type>;
    binding: ReadonlyRecord<typeof FabricWorkspace.Binding.Type>;
    ref: ReadonlyRecord<typeof FabricWorkspace.Ref.Type>;
    component: ReadonlyRecord<typeof FabricWorkspace.Component.Type>;
    overrides: ReadonlyRecord<typeof FabricWorkspace.Overrides.Type>;
    from: ReadonlyRecord<typeof FabricWorkspace.Binding.Type.from>;
    to: ReadonlyRecord<typeof FabricWorkspace.Binding.Type.to>;
    bindings: ReadonlyRecord<typeof FabricWorkspace.Document.Type.bindings>;
    tools: typeof FabricWorkspace.Document.Type.tools extends unknown[] ? false : true;
    partialControl: Equal<ReadonlyRecord<{ readonly id: string; mutable: string }>, false>;
  } = { document: true, tool: true, source: true, layout: true, binding: true, ref: true, tools: true,
    component: true, overrides: true, from: true, to: true, bindings: true, partialControl: true }
  expect(Object.values(readonly).every(Boolean)).toBe(true)
  expect(() => Schema.decodeUnknownSync(FabricWorkspace.Document)({ ...document(), layout: { recipe: "random", revision: 1, overrides: {} } })).toThrow()
})
