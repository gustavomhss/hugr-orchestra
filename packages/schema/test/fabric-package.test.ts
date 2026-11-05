import { expect, test } from "bun:test"
import { Schema } from "effect"

const packet = () => ({
  format: "fabric-studio.workspace-package", version: 1,
  workspace: {
    format: "fabric-studio.workspace", version: 1, title: "Conhecer workspace",
    context: { resourceAliases: ["carga"] }, layout: { recipe: "explore", revision: 1, overrides: {} },
    tools: [{ id: "runs", component: { id: "fabric.runs", revision: "1" }, slot: "main", props: {} }], bindings: [],
  },
  requiredVersions: { workspaceVersion: 1, components: [{ id: "fabric.runs", revision: "1" }], capabilities: [] },
  exclusions: { credentials: true, authority: true, activations: true, results: true,
    approvals: true, "remote-data": true, environment: true },
} as const)

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false

test("PKW01 package wire roundtrips the canonical workspace without a new authority or identity", async () => {
  const { FabricWorkspace } = await import("../src/fabric-workspace")
  expect(FabricWorkspace.Package).toBeDefined()
  const root = await import("@orchestra/schema")
  const { FabricCapability } = await import("../src/fabric-capability")
  const { FabricResource } = await import("../src/fabric-resource")
  expect(root.FabricWorkspace.Package).toBe(FabricWorkspace.Package)
  expect(FabricWorkspace.Package.fields.workspace).toBe(FabricWorkspace.Document)
  expect(FabricWorkspace.Package.fields.requiredVersions.fields.components.value).toBe(FabricWorkspace.Component)
  expect(FabricWorkspace.Package.fields.requiredVersions.fields.capabilities.value).toBe(FabricCapability.Ref)
  expect(FabricWorkspace.ResourceHint.fields.resourceType).toBe(FabricResource.Ref.fields.resourceType)
  const value = { ...packet(), origin: { templateID: "T02", templateRevision: "1" },
    resourceHints: [{ alias: "carga", resourceType: "Notebook", tenantID: "tenant", workspaceID: "workspace", resourceID: "item" }] }
  expect(Schema.encodeSync(FabricWorkspace.Package)(Schema.decodeUnknownSync(FabricWorkspace.Package)(value))).toEqual(value)
  const readonly: {
    package: Equal<typeof FabricWorkspace.Package.Type, Readonly<typeof FabricWorkspace.Package.Type>>;
    versions: Equal<typeof FabricWorkspace.Package.Type.requiredVersions, Readonly<typeof FabricWorkspace.Package.Type.requiredVersions>>;
    components: typeof FabricWorkspace.Package.Type.requiredVersions.components extends unknown[] ? false : true;
    capabilities: typeof FabricWorkspace.Package.Type.requiredVersions.capabilities extends unknown[] ? false : true;
    component: Equal<typeof FabricWorkspace.Package.Type.requiredVersions.components[number], Readonly<typeof FabricWorkspace.Package.Type.requiredVersions.components[number]>>;
    capability: Equal<typeof FabricWorkspace.Package.Type.requiredVersions.capabilities[number], Readonly<typeof FabricWorkspace.Package.Type.requiredVersions.capabilities[number]>>;
    exclusions: Equal<typeof FabricWorkspace.Package.Type.exclusions, Readonly<typeof FabricWorkspace.Package.Type.exclusions>>;
    origin: Equal<NonNullable<typeof FabricWorkspace.Package.Type.origin>, Readonly<NonNullable<typeof FabricWorkspace.Package.Type.origin>>>;
    hints: NonNullable<typeof FabricWorkspace.Package.Type.resourceHints> extends unknown[] ? false : true;
    hint: Equal<NonNullable<typeof FabricWorkspace.Package.Type.resourceHints>[number], Readonly<NonNullable<typeof FabricWorkspace.Package.Type.resourceHints>[number]>>;
  } = { package: true, versions: true, components: true, capabilities: true, component: true, capability: true,
    exclusions: true, origin: true, hints: true, hint: true }
  expect(Object.values(readonly).every(Boolean)).toBe(true)
})

test("PKW02 package wire rejects forbidden and unknown fields and requires all exclusion markers", async () => {
  const { FabricWorkspace } = await import("../src/fabric-workspace")
  expect(FabricWorkspace.Package).toBeDefined()
  const value = packet()
  ;[
    { ...value, authority: "forbidden" }, { ...value, connectionID: "foreign" }, { ...value, assets: [] },
    { ...value, results: [] }, { ...value, environment: {} },
    { ...value, workspace: { ...value.workspace, token: "forbidden" } },
    { ...value, origin: { templateID: "T02", templateRevision: "1", owner: "foreign" } },
    { ...value, requiredVersions: { ...value.requiredVersions, grant: true } },
    { ...value, requiredVersions: { ...value.requiredVersions, components: [{ id: "x", revision: "1", url: "https://invalid.example" }] } },
    { ...value, requiredVersions: { ...value.requiredVersions, capabilities: [{ id: "x", revision: "1", token: "forbidden" }] } },
    { ...value, resourceHints: [{ alias: "carga", resourceType: "Notebook", contextID: "foreign" }] },
    { ...value, resourceHints: [{ alias: "carga", resourceType: "Notebook", path: "/private/data" }] },
    { ...value, exclusions: { ...value.exclusions, extra: true } },
  ].forEach((input) => expect(() => Schema.decodeUnknownSync(FabricWorkspace.Package)(input)).toThrow())
  ;(["components", "capabilities"] as const).forEach((field) => {
    ;[{}, { id: "x" }, { revision: "1" }, { id: "", revision: "1" }, { id: "x", revision: "" },
      { id: "x", revision: 1 }, { id: 1, revision: "1" },
    ].forEach((ref) => expect(() => Schema.decodeUnknownSync(FabricWorkspace.Package)({ ...value,
      requiredVersions: { ...value.requiredVersions, [field]: [ref] },
    })).toThrow())
  })
  const omit = (record: object, field: string) => Object.fromEntries(Object.entries(record).filter(([key]) => key !== field))
  Object.keys(value).forEach((field) => expect(() => Schema.decodeUnknownSync(FabricWorkspace.Package)(omit(value, field))).toThrow())
  Object.keys(value.requiredVersions).forEach((field) => expect(() => Schema.decodeUnknownSync(FabricWorkspace.Package)({ ...value,
    requiredVersions: omit(value.requiredVersions, field),
  })).toThrow())
  ;[
    { ...value, origin: { templateID: "T02" } }, { ...value, origin: { templateRevision: "1" } },
    { ...value, resourceHints: [{ alias: "carga" }] }, { ...value, resourceHints: [{ resourceType: "Notebook" }] },
  ].forEach((input) => expect(() => Schema.decodeUnknownSync(FabricWorkspace.Package)(input)).toThrow())
  Object.keys(value.exclusions).forEach((key) => {
    expect(() => Schema.decodeUnknownSync(FabricWorkspace.Package)({ ...value,
      exclusions: Object.fromEntries(Object.entries(value.exclusions).filter(([name]) => name !== key)),
    })).toThrow()
    expect(() => Schema.decodeUnknownSync(FabricWorkspace.Package)({ ...value, exclusions: { ...value.exclusions, [key]: false } })).toThrow()
  })
})

test("PKW03 package wire has finite hint and revision cardinalities without catalog semantics", async () => {
  const { FabricWorkspace } = await import("../src/fabric-workspace")
  expect(FabricWorkspace.Package).toBeDefined()
  const value = packet()
  const hints = Array.from({ length: 64 }, (_, index) => ({ alias: `alias-${index}`, resourceType: "Notebook" }))
  expect(Schema.decodeUnknownSync(FabricWorkspace.Package)({ ...value, resourceHints: hints }).resourceHints).toHaveLength(64)
  expect(() => Schema.decodeUnknownSync(FabricWorkspace.Package)({ ...value, resourceHints: [...hints, { alias: "overflow", resourceType: "Notebook" }] })).toThrow()
  ;(["components", "capabilities"] as const).forEach((field) => {
    const refs = Array.from({ length: 24 }, (_, index) => ({ id: `entry-${index}`, revision: "1" }))
    expect(Schema.decodeUnknownSync(FabricWorkspace.Package)({ ...value, requiredVersions: { ...value.requiredVersions, [field]: refs } }).requiredVersions[field]).toHaveLength(24)
    expect(() => Schema.decodeUnknownSync(FabricWorkspace.Package)({ ...value, requiredVersions: { ...value.requiredVersions, [field]: [...refs, { id: "overflow", revision: "1" }] } })).toThrow()
  })
})

test("PKW04 package wire omits optional undefined and keeps versions and hints typed", async () => {
  const { FabricWorkspace } = await import("../src/fabric-workspace")
  expect(FabricWorkspace.Package).toBeDefined()
  const value = packet()
  const decoded = Schema.decodeUnknownSync(FabricWorkspace.Package)(value)
  expect(Schema.encodeSync(FabricWorkspace.Package)({ ...decoded, origin: undefined, resourceHints: undefined })).toEqual(value)
  const hinted = Schema.decodeUnknownSync(FabricWorkspace.Package)({ ...value, resourceHints: [{ alias: "carga", resourceType: "Notebook" }] })
  const hint = hinted.resourceHints?.[0]
  expect(hint).toBeDefined()
  if (!hint) return
  expect(Schema.encodeSync(FabricWorkspace.Package)({ ...hinted, resourceHints: [{ ...hint,
    tenantID: undefined, workspaceID: undefined, resourceID: undefined }] }).resourceHints).toEqual([{ alias: "carga", resourceType: "Notebook" }])
  ;[
    { ...value, format: "other" }, { ...value, version: 2 },
    { ...value, requiredVersions: { ...value.requiredVersions, workspaceVersion: 2 } },
    { ...value, origin: { templateID: "", templateRevision: "1" } },
    { ...value, origin: { templateID: "T02", templateRevision: 1 } },
    { ...value, origin: { templateID: 1, templateRevision: "1" } },
    { ...value, origin: { templateID: "T02", templateRevision: "" } },
    { ...value, resourceHints: [{ alias: "", resourceType: "Notebook" }] },
    { ...value, resourceHints: [{ alias: "carga", resourceType: "" }] },
    { ...value, resourceHints: [{ alias: "carga", resourceType: "Notebook", resourceID: 1 }] },
    { ...value, resourceHints: [{ alias: "carga", resourceType: "Notebook", tenantID: 1 }] },
    { ...value, resourceHints: [{ alias: "carga", resourceType: "Notebook", workspaceID: 1 }] },
    { ...value, resourceHints: [{ alias: 1, resourceType: "Notebook" }] },
    { ...value, resourceHints: [{ alias: "carga", resourceType: 1 }] },
    { ...value, resourceHints: [{ alias: "carga", resourceType: "Notebook", unexpected: true }] },
    { ...value, origin: { templateID: "T02", templateRevision: "1", unexpected: true } },
    { ...value, resourceHints: [{ alias: "carga", resourceType: "Notebook", tenantID: "" }] },
    { ...value, resourceHints: [{ alias: "carga", resourceType: "Notebook", workspaceID: "" }] },
    { ...value, resourceHints: [{ alias: "carga", resourceType: "Notebook", resourceID: "" }] },
  ].forEach((input) => expect(() => Schema.decodeUnknownSync(FabricWorkspace.Package)(input)).toThrow())
  expect(Schema.decodeUnknownSync(FabricWorkspace.Package)({ ...value,
    workspace: { ...value.workspace, layout: { ...value.workspace.layout, revision: 2 } },
  }).workspace.layout.revision).toBe(2)
})
