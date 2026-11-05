import { Result, Schema } from "effect"
import type { SchemaIssue } from "effect"
import type { FabricCapability } from "@orchestra/schema/fabric-capability"
import { FabricWorkspace } from "@orchestra/schema/fabric-workspace"
import type { Catalog, Compilation, Component, Diagnostic } from "./contracts"
import { admit } from "./parse"
import { graph } from "./graph"
import { layout } from "./layout"

export function compile(input: unknown, catalog: Catalog, availability?: Readonly<Record<string, FabricCapability.Availability>>): Compilation {
  const admitted = admit(input)
  if (!admitted.ok) return admitted
  const versions = checkVersions(admitted.value)
  if (versions.length) return { ok: false, diagnostics: versions }
  const decoded = Schema.decodeUnknownResult(FabricWorkspace.Document, { errors: "all", onExcessProperty: "error" })(admitted.value)
  if (Result.isFailure(decoded)) return { ok: false, diagnostics: issues(decoded.failure.issue, "") }

  // Decoding validates the wire shape, but optional-key decoders may materialize
  // undefined fields. Keep the admitted JSON, not decoder-produced replacements.
  const document = admitted.value as FabricWorkspace.Document
  const nodes = components(document, catalog)
  if (nodes.diagnostics.length) return { ok: false, diagnostics: nodes.diagnostics }
  const dependencies = graph(document, nodes.components)
  const effective = layout(document)
  const diagnostics = [...dependencies.diagnostics, ...effective.diagnostics]
  if (diagnostics.length) return { ok: false, diagnostics }
  const normalized = { ...document, layout: { ...document.layout, overrides: effective.overrides } }
  // Defaults can repeat IDs and expand the wire document beyond admission limits.
  const readmitted = admit(normalized)
  if (!readmitted.ok) return readmitted
  return {
    ok: true,
    document: normalized,
    order: dependencies.order,
    normalizations: effective.normalizations,
    availability: Object.fromEntries(document.tools.map((tool) => [tool.id,
      availability && Object.hasOwn(availability, tool.id) ? availability[tool.id] : "unverified",
    ])),
  }
}

function checkVersions(value: Schema.Json): Diagnostic[] {
  if (!record(value)) return []
  return [
    { path: "/version", value: value.version },
    { path: "/layout/revision", value: record(value.layout) ? value.layout.revision : undefined },
  ].filter((entry) => typeof entry.value === "number" && Number.isSafeInteger(entry.value) && entry.value > 0 && entry.value !== 1)
    .map((entry) => ({ path: entry.path, code: "incompatible-version", messageKey: "fabric.declaration.version" }))
}

function record(value: Schema.Json | undefined): value is { readonly [key: string]: Schema.Json } {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function components(document: FabricWorkspace.Document, catalog: Catalog) {
  const diagnostics: Diagnostic[] = []
  const resolved = new Map<string, Component>()
  const aliases = new Set<string>()
  document.context.resourceAliases.forEach((alias, index) => {
    if (aliases.has(alias)) diagnostics.push(invalid(`/context/resourceAliases/${index}`, "identity"))
    aliases.add(alias)
  })
  document.tools.forEach((tool, index) => {
    const path = `/tools/${index}`
    if (resolved.has(tool.id)) diagnostics.push(invalid(`${path}/id`, "identity"))
    const component = catalog.components.find((entry) => entry.id === tool.component.id && entry.revision === tool.component.revision)
    if (!component) {
      diagnostics.push(invalid(`${path}/component`, "component"))
      return
    }
    resolved.set(tool.id, component)
    if (!component.slots.includes(tool.slot)) diagnostics.push(invalid(`${path}/slot`, "slot"))
    diagnostics.push(...validate(component.props, tool.props, `${path}/props`))
    if (!tool.source) return
    if (tool.source.resourceAlias !== undefined && !aliases.has(tool.source.resourceAlias)) {
      diagnostics.push(invalid(`${path}/source/resourceAlias`, "alias"))
    }
    const capability = catalog.capabilities.find((entry) => entry.ref.id === tool.source?.capability.id && entry.ref.revision === tool.source.capability.revision)
    if (!capability) {
      diagnostics.push(invalid(`${path}/source/capability`, "capability"))
      return
    }
    if (capability.effect !== "metadata-read" && capability.effect !== "data-read") {
      diagnostics.push(invalid(`${path}/source/capability`, "effect"))
    }
    if (component.sourceResult === undefined || component.sourceResult !== capability.result) {
      diagnostics.push(invalid(`${path}/source/capability`, "source"))
    }
    diagnostics.push(...validate(capability.args, tool.source.args ?? {}, `${path}/source/args`))
  })
  return { diagnostics, components: resolved }
}

function validate(schema: Schema.Decoder<unknown>, value: unknown, path: string): Diagnostic[] {
  const decoded = Schema.decodeUnknownResult(schema, { errors: "all", onExcessProperty: "error" })(value)
  return Result.isFailure(decoded) ? issues(decoded.failure.issue, path) : []
}

// Walk only structure: no formatter, annotations, actual values or error prose
// can leak into diagnostics, including union and refinement failures.
function issues(issue: SchemaIssue.Issue, path: string): Diagnostic[] {
  switch (issue._tag) {
    case "Pointer":
      return issues(issue.issue, path + issue.path.map((key) => "/" + String(key).replaceAll("~", "~0").replaceAll("/", "~1")).join(""))
    case "Encoding":
    case "Filter":
      return issues(issue.issue, path)
    case "Composite":
    case "AnyOf":
      return issue.issues.length ? issue.issues.flatMap((child) => issues(child, path)) : [invalid(path, "schema")]
    default:
      return [invalid(path, "schema")]
  }
}

function invalid(path: string, reason: string): Diagnostic {
  return { path, code: "invalid-input", messageKey: `fabric.declaration.${reason}` }
}
