import { expect, test } from "bun:test"
import { Schema } from "effect"
import type { Diagnostic } from "../src/contracts"
import { compile } from "../src/declaration"
import { admit, parse } from "../src/parse"
import { catalog, document } from "./fixture/declaration"
import { failure } from "./fixture/assert"

const exclusions = { credentials: true, authority: true, activations: true, results: true,
  approvals: true, "remote-data": true, environment: true } as const
const versions = {
  workspaceVersion: 1,
  components: [{ id: "fabric.details", revision: "1" }, { id: "fabric.logs", revision: "1" }, { id: "fabric.runs", revision: "1" }],
  capabilities: [{ id: "fabric.execution.list", revision: "1" }, { id: "fabric.execution.logs", revision: "1" }],
} as const
const input = () => ({ workspace: document(), origin: { templateID: "T08", templateRevision: "1" },
  resourceHints: [{ alias: "carga", resourceType: "Notebook", tenantID: "tenant", workspaceID: "workspace", resourceID: "item" }] })
const packet = () => ({ format: "fabric-studio.workspace-package", version: 1, ...input(), requiredVersions: versions, exclusions })

function rejected(result: Readonly<{ ok: true }> | Readonly<{ ok: false; diagnostics: readonly Diagnostic[] }>) {
  expect(result.ok).toBe(false)
  if (!result.ok) failure(result)
}

test("PKG01 package codec preserves selected data and derives exact versions and exclusions without effects", async () => {
  const { encode, decode } = await import("../src/package")
  const basis = document()
  const value = { ...input(), workspace: { bindings: basis.bindings, tools: [{ ...basis.tools[0], props: { title: "Selected component title" },
    source: { ...basis.tools[0].source, args: { limit: 7 } } }, ...basis.tools.slice(1)], layout: basis.layout,
    context: basis.context, title: basis.title, version: basis.version, format: basis.format } }
  const original = structuredClone(value)
  const encoded = encode(value, catalog)
  expect(encoded.ok).toBe(true)
  if (!encoded.ok) return
  expect(encoded.package.format).toBe("fabric-studio.workspace-package")
  expect(encoded.package.version).toBe(1)
  expect(encoded.package.requiredVersions).toEqual(versions)
  expect(encoded.package.exclusions).toEqual(exclusions)
  expect(encoded.package.origin).toEqual(value.origin)
  expect(encoded.package.resourceHints).toEqual(value.resourceHints)
  expect(encoded.package.workspace.tools[0]?.props.title).toBe("Selected component title")
  expect(encoded.package.workspace.tools[0]?.source?.args).toEqual({ limit: 7 })
  const expected = compile(value.workspace, catalog)
  expect(expected.ok).toBe(true)
  if (expected.ok) {
    expect(encoded.package.workspace).toEqual(expected.document)
    expect(encoded.normalizations).toEqual(expected.normalizations.map((change) => ({ ...change, path: "/workspace" + change.path })))
    const orderedText = JSON.stringify({ format: "fabric-studio.workspace-package", version: 1, workspace: expected.document,
      origin: { templateID: "T08", templateRevision: "1" }, requiredVersions: versions,
      resourceHints: [{ alias: "carga", resourceType: "Notebook", tenantID: "tenant", workspaceID: "workspace", resourceID: "item" }], exclusions })
    expect(encoded.text).toBe(orderedText)
    const imported = decode(JSON.stringify({ ...packet(), workspace: value.workspace }), catalog)
    expect(imported.ok).toBe(true)
    if (imported.ok) expect(imported.text).toBe(orderedText)
  }
  expect(encoded.normalizations.length).toBeGreaterThan(0)
  expect(encoded.text).toBe(JSON.stringify(encoded.package))
  const decoded = decode(encoded.text, catalog)
  expect(decoded.ok).toBe(true)
  if (decoded.ok) {
    expect(decoded.package).toEqual(encoded.package)
    expect(decoded.text).toBe(encoded.text)
    expect(decoded.normalizations).toEqual([])
  }
  expect(value).toEqual(original)
  const bare = encode({ workspace: document() }, catalog)
  expect(bare.ok).toBe(true)
  if (bare.ok) {
    expect(bare.package).not.toHaveProperty("origin")
    expect(bare.package).not.toHaveProperty("resourceHints")
  }
  const unnormalized = decode(JSON.stringify({ ...packet(), workspace: value.workspace }, null, 2), catalog)
  expect(unnormalized.ok).toBe(true)
  if (unnormalized.ok && expected.ok) {
    expect(unnormalized.package.workspace).toEqual(expected.document)
    expect(unnormalized.normalizations).toEqual(expected.normalizations.map((change) => ({ ...change, path: "/workspace" + change.path })))
    expect(unnormalized.text).toBe(JSON.stringify(unnormalized.package))
    const again = decode(unnormalized.text, catalog)
    expect(again.ok).toBe(true)
    if (again.ok) expect(again.normalizations).toEqual([])
  }
  const synthetic = { ...input(), workspace: { ...document(), title: "token credential DO_NOT_ECHO — informação escolhida" },
    resourceHints: [{ alias: "carga", resourceType: "Notebook", resourceID: "token:synthetic-not-a-real-secret" }] }
  const preserved = encode(synthetic, catalog)
  expect(preserved.ok).toBe(true)
  if (preserved.ok) {
    const again = decode(preserved.text, catalog)
    expect(again.ok).toBe(true)
    if (again.ok) {
      expect(again.package.workspace.title).toBe(synthetic.workspace.title)
      expect(again.package.resourceHints).toEqual(synthetic.resourceHints)
    }
  }
  const alternate = { ...catalog, components: [...catalog.components, ...["10", "2", "Z", "a"].map((revision) => ({ ...catalog.components[0], revision }))],
    capabilities: [...catalog.capabilities, ...["10", "2", "Z", "a"].map((revision) => ({ ...catalog.capabilities[0], ref: { id: "fabric.execution.list", revision } }))] }
  const subset = { ...document(), bindings: [], tools: ["a", "2", "Z", "1", "10", "2"].map((revision, index) => ({
    ...document().tools[0], id: `runs-${index}`, component: { id: "fabric.runs", revision },
    source: { capability: { id: "fabric.execution.list", revision } },
  })) }
  expect(compile(subset, alternate).ok).toBe(true)
  const used = { workspaceVersion: 1 as const, components: ["1", "10", "2", "Z", "a"].map((revision) => ({ id: "fabric.runs", revision })),
    capabilities: ["1", "10", "2", "Z", "a"].map((revision) => ({ id: "fabric.execution.list", revision })) }
  const subsetResult = encode({ workspace: subset }, alternate)
  expect(subsetResult.ok).toBe(true)
  if (subsetResult.ok) expect(subsetResult.package.requiredVersions).toEqual(used)
  const imported = decode(JSON.stringify({ format: "fabric-studio.workspace-package", version: 1,
    workspace: subset, requiredVersions: { ...used, components: [...used.components].reverse(), capabilities: [...used.capabilities].reverse() }, exclusions }), alternate)
  expect(imported.ok).toBe(true)
  if (imported.ok) expect(imported.package.requiredVersions).toEqual(used)
  const caseCatalog = { components: ["a", "Z"].map((suffix) => ({ ...catalog.components[0], id: `fabric.${suffix}` })),
    capabilities: ["a", "Z"].map((suffix) => ({ ...catalog.capabilities[0], ref: { id: `fabric.${suffix}`, revision: "1" } })) }
  const caseWorkspace = { ...document(), bindings: [], tools: ["a", "Z"].map((suffix) => ({
    ...document().tools[0], id: suffix, component: { id: `fabric.${suffix}`, revision: "1" },
    source: { capability: { id: `fabric.${suffix}`, revision: "1" } },
  })) }
  const caseVersions = { workspaceVersion: 1 as const, components: [{ id: "fabric.Z", revision: "1" }, { id: "fabric.a", revision: "1" }],
    capabilities: [{ id: "fabric.Z", revision: "1" }, { id: "fabric.a", revision: "1" }] }
  ;[encode({ workspace: caseWorkspace }, caseCatalog), decode(JSON.stringify({ format: "fabric-studio.workspace-package", version: 1,
    workspace: caseWorkspace, requiredVersions: { ...caseVersions, components: [...caseVersions.components].reverse(),
      capabilities: [...caseVersions.capabilities].reverse() }, exclusions }), caseCatalog)].forEach((result) => {
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.package.requiredVersions).toEqual(caseVersions)
  })
  ;[
    { ...used, components: used.components.slice(1) },
    { ...used, components: [...used.components, { id: "fabric.logs", revision: "1" }] },
    { ...used, capabilities: [...used.capabilities, { id: "fabric.query", revision: "1" }] },
    { ...used, capabilities: [used.capabilities[0], used.capabilities[1]] },
  ].forEach((requiredVersions) => rejected(decode(JSON.stringify({ format: "fabric-studio.workspace-package", version: 1,
    workspace: subset, requiredVersions, exclusions }), alternate)))
  const shuffled = { exclusions: Object.fromEntries(Object.entries(exclusions).reverse()),
    resourceHints: value.resourceHints.map((hint) => ({ resourceID: hint.resourceID, workspaceID: hint.workspaceID,
      tenantID: hint.tenantID, resourceType: hint.resourceType, alias: hint.alias })),
    requiredVersions: { capabilities: [...versions.capabilities].reverse().map((ref) => ({ revision: ref.revision, id: ref.id })),
      components: [...versions.components].reverse(), workspaceVersion: 1 },
    origin: { templateRevision: value.origin.templateRevision, templateID: value.origin.templateID },
    workspace: value.workspace, version: 1, format: "fabric-studio.workspace-package" }
  const ordered = decode(JSON.stringify(shuffled), catalog)
  expect(ordered.ok).toBe(true)
  if (ordered.ok) expect(ordered.text).toBe(encoded.text)
  const data = { text: "chosen 🙂", number: 0.25, boolean: false, empty: null, list: [1, "text", false, null], object: { z: 0, a: "value" } }
  const dataCatalog = { components: catalog.components.map((component) => ({ ...component, props: Schema.Record(Schema.String, Schema.Json) })),
    capabilities: catalog.capabilities.map((capability) => ({ ...capability, args: Schema.Record(Schema.String, Schema.Json) })) }
  const selected = { ...document(), tools: [{ ...document().tools[0], props: data,
    source: { ...document().tools[0].source, args: data } }, ...document().tools.slice(1)] }
  const selectedBefore = structuredClone(selected)
  const compiledData = compile(selected, dataCatalog)
  expect(compiledData.ok).toBe(true)
  ;[encode({ workspace: selected }, dataCatalog), decode(JSON.stringify({ format: "fabric-studio.workspace-package", version: 1,
    workspace: selected, requiredVersions: versions, exclusions }), dataCatalog)].forEach((result) => {
    expect(result.ok).toBe(true)
    if (result.ok && compiledData.ok) {
      expect(result.package.workspace).toEqual(compiledData.document)
      expect(result.package.workspace.tools[0]?.props).toEqual(data)
      expect(result.package.workspace.tools[0]?.source?.args).toEqual(data)
      expect(result.text).toBe(JSON.stringify({ format: "fabric-studio.workspace-package", version: 1,
        workspace: compiledData.document, requiredVersions: versions, exclusions }))
    }
  })
  expect(selected).toEqual(selectedBefore)
  const hintedWorkspace = { ...document(), context: { resourceAliases: ["carga", "z", "a"] } }
  const hintOrder = [{ alias: "z", resourceType: "Notebook", resourceID: "last" }, { alias: "a", resourceType: "Notebook", resourceID: "first" }]
  const compiledHints = compile(hintedWorkspace, catalog)
  expect(compiledHints.ok).toBe(true)
  ;[encode({ workspace: hintedWorkspace, resourceHints: hintOrder }, catalog),
    decode(JSON.stringify({ format: "fabric-studio.workspace-package", version: 1, workspace: hintedWorkspace,
      requiredVersions: versions, resourceHints: hintOrder, exclusions }), catalog)].forEach((result) => {
    expect(result.ok).toBe(true)
    if (result.ok && compiledHints.ok) {
      expect(result.package.resourceHints).toEqual(hintOrder)
      expect(result.text).toBe(JSON.stringify({ format: "fabric-studio.workspace-package", version: 1, workspace: compiledHints.document,
        requiredVersions: versions, resourceHints: hintOrder, exclusions }))
    }
  })
})

test("PKG02 imported manifests and hints must match the workspace exactly rather than import authority", async () => {
  const { encode, decode } = await import("../src/package")
  const value = packet()
  expect(decode(JSON.stringify(value), catalog).ok).toBe(true)
  ;[
    { ...value, authority: "DO_NOT_ECHO" }, { ...value, assets: [] }, { ...value, availability: { runs: "ready" } },
    { ...value, exclusions: { ...exclusions, credentials: false } },
    { ...value, requiredVersions: { ...versions, components: versions.components.slice(1) } },
    { ...value, requiredVersions: { ...versions, capabilities: versions.capabilities.slice(1) } },
    { ...value, requiredVersions: { ...versions, components: [...versions.components, versions.components[0]] } },
    { ...value, requiredVersions: { ...versions, capabilities: [...versions.capabilities, versions.capabilities[0]] } },
    { ...value, requiredVersions: { ...versions, capabilities: [...versions.capabilities, { id: "fabric.write", revision: "1" }] } },
    { ...value, requiredVersions: { ...versions, components: [{ id: "fabric.details", revision: "99" }, ...versions.components.slice(1)] } },
    { ...value, resourceHints: [{ alias: "unknown", resourceType: "Notebook" }] },
    { ...value, resourceHints: [value.resourceHints[0], value.resourceHints[0]] },
    { ...value, resourceHints: [{ ...value.resourceHints[0], connectionID: "foreign" }] },
  ].forEach((candidate) => rejected(decode(JSON.stringify(candidate), catalog)))
  ;[
    { ...input(), authority: "DO_NOT_ECHO" }, { ...input(), requiredVersions: versions },
    { ...input(), exclusions }, { ...input(), availability: { runs: "ready" } },
  ].forEach((candidate) => rejected(encode(candidate, catalog)))
  ;[
    { ...input(), resourceHints: [{ alias: "unknown", resourceType: "Notebook" }] },
    { ...input(), resourceHints: [value.resourceHints[0], value.resourceHints[0]] },
    { ...input(), resourceHints: [{ ...value.resourceHints[0], connectionID: "foreign" }] },
  ].forEach((candidate) => rejected(encode(candidate, catalog)))
  const duplicatedTools = { ...document(), tools: [document().tools[0], { ...document().tools[1], id: "runs" }, document().tools[2]], bindings: [] }
  rejected(encode({ workspace: duplicatedTools }, catalog))
  ;[
    duplicatedTools,
    { ...document(), tools: [{ ...document().tools[0], props: { unexpected: "DO_NOT_ECHO" } }, ...document().tools.slice(1)] },
    { ...document(), tools: [{ ...document().tools[0], props: { title: 1 } }, ...document().tools.slice(1)] },
    { ...document(), bindings: [{ from: { tool: "missing", port: "selected" }, to: { tool: "logs", port: "execution" } }] },
    { ...document(), tools: [{ ...document().tools[0], slot: "inspect" }, ...document().tools.slice(1)] },
  ].forEach((workspace) => {
    const compiled = compile(workspace, catalog)
    expect(compiled.ok).toBe(false)
    ;[encode({ workspace }, catalog), decode(JSON.stringify({ ...value, workspace }), catalog)].forEach((result) => {
      rejected(result)
      if (!result.ok && !compiled.ok) expect(result.diagnostics).toEqual(compiled.diagnostics.map((diagnostic) => ({
        ...diagnostic, path: "/workspace" + diagnostic.path,
      })))
    })
  })
  ;[
    encode({ ...input(), unknown: true }, catalog), decode(JSON.stringify({ ...value, unknown: true }), catalog),
    encode({ ...input(), origin: { templateID: 1, templateRevision: "1" } }, catalog),
    decode(JSON.stringify({ ...value, resourceHints: [{ alias: 1, resourceType: "Notebook" }] }), catalog),
    decode(JSON.stringify({ ...value, requiredVersions: { ...versions, workspaceVersion: "1" } }), catalog),
  ]
    .forEach((result) => {
      rejected(result)
      if (!result.ok) expect(result.diagnostics.some((diagnostic) => diagnostic.code === "invalid-input")).toBe(true)
    })
})

test("PKG03 envelope limits allow 512 KiB but never raise the inner workspace byte or depth budget", async () => {
  const { encode, decode } = await import("../src/package")
  const value = input()
  const encoded = encode(value, catalog)
  expect(encoded.ok).toBe(true)
  if (!encoded.ok) return
  const bytes = new TextEncoder().encode(encoded.text).length
  const boundary = { ...value, workspace: { ...value.workspace, title: "ação 🙂 \"\\" } }
  const measured = encode(boundary, catalog)
  expect(measured.ok).toBe(true)
  if (measured.ok) {
    const ceiling = new TextEncoder().encode(measured.text).length
    expect(new TextEncoder().encode(JSON.stringify(boundary)).length).toBeLessThan(ceiling - 1)
    expect(encode(boundary, catalog, { maxBytes: ceiling }).ok).toBe(true)
    const failed = encode(boundary, catalog, { maxBytes: ceiling - 1 })
    rejected(failed)
    if (!failed.ok) expect(failed.diagnostics.some((diagnostic) => diagnostic.code === "limit")).toBe(true)
    const raw = JSON.stringify({ ...packet(), workspace: boundary.workspace })
    expect(new TextEncoder().encode(raw).length).toBeLessThan(ceiling - 1)
    const normalizedOverflow = decode(raw, catalog, { maxBytes: ceiling - 1 })
    rejected(normalizedOverflow)
    if (!normalizedOverflow.ok) expect(normalizedOverflow.diagnostics.some((diagnostic) => diagnostic.code === "limit")).toBe(true)
  }
  expect(decode(encoded.text, catalog, { maxBytes: bytes }).ok).toBe(true)
  rejected(decode(encoded.text, catalog, { maxBytes: bytes - 1 }))
  rejected(decode(" ".repeat(524289 - bytes) + encoded.text, catalog, { maxBytes: 1048576 }))
  expect(decode(encoded.text, catalog, { maxBytes: 1048576, maxDepth: 1000 }).ok).toBe(true)
  expect(encode(value, catalog, { maxBytes: 1048576, maxDepth: 1000 }).ok).toBe(true)
  expect(encode(value, catalog, { maxDepth: 6 }).ok).toBe(true)
  expect(decode(encoded.text, catalog, { maxDepth: 6 }).ok).toBe(true)
  rejected(encode(value, catalog, { maxDepth: 2 }))
  rejected(decode(encoded.text, catalog, { maxDepth: 2 }))
  ;[0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1].forEach((limit) => {
    rejected(encode(value, catalog, { maxBytes: limit }))
    rejected(encode(value, catalog, { maxDepth: limit }))
    rejected(decode(encoded.text, catalog, { maxBytes: limit }))
    rejected(decode(encoded.text, catalog, { maxDepth: limit }))
  })
  const big = encode({ ...value, resourceHints: [{ ...value.resourceHints[0], resourceID: "x".repeat(280000) }] }, catalog)
  expect(big.ok).toBe(true)
  if (big.ok) {
    expect(new TextEncoder().encode(big.text).length).toBeGreaterThan(262144)
    expect(decode(big.text, catalog).ok).toBe(true)
  }
  const basis = encode({ ...value, resourceHints: [{ ...value.resourceHints[0], resourceID: "x" }] }, catalog)
  expect(basis.ok).toBe(true)
  if (basis.ok) {
    const length = 524288 - new TextEncoder().encode(basis.text).length + 1
    const exactInput = { ...value, resourceHints: [{ ...value.resourceHints[0], resourceID: "x".repeat(length) }] }
    const exact = encode(exactInput, catalog)
    expect(exact.ok).toBe(true)
    if (exact.ok) {
      expect(new TextEncoder().encode(exact.text).length).toBe(524288)
      expect(decode(exact.text, catalog).ok).toBe(true)
      rejected(decode(exact.text + " ", catalog, { maxBytes: 1048576 }))
    }
    rejected(encode({ ...exactInput, resourceHints: [{ ...exactInput.resourceHints[0], resourceID: "x".repeat(length + 1) }] }, catalog))
  }
  const inner = encode({ workspace: { ...document(), title: "x".repeat(270000) } }, catalog, { maxBytes: 1048576 })
  rejected(inner)
  if (!inner.ok) expect(inner.diagnostics.some((diagnostic) => diagnostic.code === "limit" && diagnostic.path.startsWith("/workspace"))).toBe(true)
  // An already effective workspace isolates the inner input ceiling from defaults.
  const normalized = compile({ ...document(), title: "x" }, catalog)
  expect(normalized.ok).toBe(true)
  if (normalized.ok) {
    const empty = { ...normalized.document, title: "" }
    const length = 262144 - new TextEncoder().encode(JSON.stringify(empty)).length
    const exact = { ...empty, title: "x".repeat(length) }
    ;[undefined, { maxBytes: 1048576 }].forEach((limits) => {
      expect(encode({ workspace: exact }, catalog, limits).ok).toBe(true)
      expect(decode(JSON.stringify({ ...packet(), workspace: exact }), catalog, limits).ok).toBe(true)
      const overflow = { ...exact, title: exact.title + "x" }
      rejected(encode({ workspace: overflow }, catalog, limits))
      rejected(decode(JSON.stringify({ ...packet(), workspace: overflow }), catalog, limits))
    })
  }
  const nestedCatalog = { ...catalog, components: catalog.components.map((component) => component.id === "fabric.runs"
    ? { ...component, props: Schema.Struct({ payload: Schema.Json }).annotate({ parseOptions: { onExcessProperty: "error" } }) } : component) }
  const nested = (depth: number) => ({ workspace: { ...document(), bindings: [], tools: [{ ...document().tools[0],
    props: { payload: Array.from({ length: depth }).reduce<unknown>((value) => [value], 0) } }] } })
  const deepest = encode(nested(12), nestedCatalog)
  expect(deepest.ok).toBe(true)
  if (deepest.ok) {
    const decoded = decode(deepest.text, nestedCatalog)
    expect(decoded.ok).toBe(true)
    if (decoded.ok) expect(decoded.package.workspace).toEqual(deepest.package.workspace)
    expect(decode(deepest.text, nestedCatalog, { maxDepth: 1000 }).ok).toBe(true)
    expect(decode(deepest.text, nestedCatalog, { maxDepth: 17 }).ok).toBe(true)
    rejected(decode(deepest.text, nestedCatalog, { maxDepth: 16 }))
  }
  ;[undefined, { maxDepth: 1000 }].forEach((limits) => {
    expect(encode(nested(12), nestedCatalog, limits).ok).toBe(true)
    rejected(encode(nested(13), nestedCatalog, limits))
    rejected(decode(JSON.stringify({ ...packet(), ...nested(13), requiredVersions: { workspaceVersion: 1,
      components: [{ id: "fabric.runs", revision: "1" }], capabilities: [{ id: "fabric.execution.list", revision: "1" }] } }), nestedCatalog, limits))
  })
  expect(admit("x".repeat(262142), { maxBytes: 524288 }).ok).toBe(true)
  rejected(admit("x".repeat(262143), { maxBytes: 524288 }))
  expect(parse('"' + "x".repeat(262142) + '"', "json", { maxBytes: 524288 }).ok).toBe(true)
  rejected(parse('"' + "x".repeat(262143) + '"', "json", { maxBytes: 524288 }))
  expect(admit(Array.from({ length: 16 }).reduce<unknown>((value) => [value], 0), { maxDepth: 17 }).ok).toBe(true)
  rejected(admit(Array.from({ length: 17 }).reduce<unknown>((value) => [value], 0), { maxDepth: 17 }))
  expect(parse("[".repeat(16) + "0" + "]".repeat(16), "json", { maxDepth: 17 }).ok).toBe(true)
  rejected(parse("[".repeat(17) + "0" + "]".repeat(17), "json", { maxDepth: 17 }))
})

test("PKG04 hostile data and future versions fail before a portable result is returned", async () => {
  const { encode, decode } = await import("../src/package")
  const calls: string[] = []
  const getter = Object.defineProperty({}, "workspace", { enumerable: true, get: () => { calls.push("root"); return document() } })
  const origin = Object.defineProperty({}, "templateID", { enumerable: true, get: () => { calls.push("nested"); return "T08" } })
  ;[getter, { ...input(), origin }, { ...input(), toJSON: () => { calls.push("json"); return packet() } }]
    .forEach((value) => rejected(encode(value, catalog)))
  expect(calls).toEqual([])
  const payloadCatalog = { ...catalog, components: catalog.components.map((component) => component.id === "fabric.runs"
    ? { ...component, props: Schema.Struct({ payload: Schema.Json }).annotate({ parseOptions: { onExcessProperty: "error" } }) } : component) }
  const hostile = (payload: unknown) => ({ workspace: { ...document(), tools: [{ ...document().tools[0], props: { payload } }, ...document().tools.slice(1)] } })
  const cycle: Record<string, unknown> = {}
  cycle.self = cycle
  ;[
    Object.defineProperty({}, "nested", { enumerable: true, get: () => { calls.push("payload"); return "data" } }),
    { toJSON: () => { calls.push("payload-json"); return "data" } },
    new Date(0), () => "data", Infinity, NaN, 1n, cycle,
  ].forEach((payload) => rejected(encode(hostile(payload), payloadCatalog)))
  expect(calls).toEqual([])
  const text = JSON.stringify(packet())
  rejected(decode(text.replace('"version":1', '"version":1,"version":1'), catalog))
  rejected(decode("{/* not JSON */" + text.slice(1), catalog))
  rejected(decode(text.slice(0, -1) + ",}", catalog))
  rejected(decode(text + " " + text, catalog))
  const nestedText = JSON.stringify({ ...packet(), ...hostile({ nested: 1 }) })
  expect(decode(nestedText, payloadCatalog).ok).toBe(true)
  rejected(decode(nestedText.replace('"nested":1', '"nested":1,"ne\\u0073ted":2'), payloadCatalog))
  rejected(decode(nestedText.replace('"nested":1', '"nested":1e400'), payloadCatalog))
  ;[
    { candidate: { ...packet(), version: 2 }, path: "/version" },
    { candidate: { ...packet(), workspace: { ...document(), version: 2 } }, path: "/workspace/version" },
    { candidate: { ...packet(), workspace: { ...document(), layout: { ...document().layout, revision: 2 } } }, path: "/workspace/layout/revision" },
  ].forEach((entry) => {
    const result = decode(JSON.stringify(entry.candidate), catalog)
    rejected(result)
    if (!result.ok) expect(result.diagnostics.some((diagnostic) => diagnostic.code === "incompatible-version" && diagnostic.path === entry.path)).toBe(true)
  })
  ;[
    { workspace: { ...document(), version: 2 }, path: "/workspace/version" },
    { workspace: { ...document(), layout: { ...document().layout, revision: 2 } }, path: "/workspace/layout/revision" },
  ].forEach((entry) => {
    const result = encode({ workspace: entry.workspace }, catalog)
    rejected(result)
    if (!result.ok) expect(result.diagnostics.some((diagnostic) => diagnostic.code === "incompatible-version" && diagnostic.path === entry.path)).toBe(true)
  })
})
