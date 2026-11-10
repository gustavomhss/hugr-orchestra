import { Result, Schema } from "effect"
import { FabricWorkspace } from "@orchestra/schema/fabric-workspace"
import type { Catalog, Limits, PackageResult } from "./contracts"
import { compile } from "./declaration"
import { BoundedJson } from "./json"

// Validate envelope metadata without intercepting the compiler's workspace/version diagnostics.
const EncodeInput = Schema.Struct({
  workspace: Schema.Unknown,
  origin: FabricWorkspace.Package.fields.origin,
  resourceHints: FabricWorkspace.Package.fields.resourceHints,
}).annotate({ parseOptions: { onExcessProperty: "error" } })
const DecodeInput = Schema.Struct({ ...FabricWorkspace.Package.fields, workspace: Schema.Unknown })
  .annotate({ parseOptions: { onExcessProperty: "error" } })

export function encode(input: unknown, catalog: Catalog, limits?: Partial<Limits>): PackageResult {
  const admitted = BoundedJson.admit(input, "package", limits)
  if (!admitted.ok) return admitted
  const decoded = Schema.decodeUnknownResult(EncodeInput, { onExcessProperty: "error" })(admitted.value)
  if (Result.isFailure(decoded)) return problem("")
  // Optional-key decoders can materialize undefined; retain the admitted JSON instead.
  return build(admitted.value as typeof EncodeInput.Type, catalog, limits)
}

export function decode(text: string, catalog: Catalog, limits?: Partial<Limits>): PackageResult {
  const admitted = BoundedJson.parse(text, "json", "package", limits)
  if (!admitted.ok) return admitted
  const value = admitted.value
  if (value !== null && typeof value === "object" && !Array.isArray(value) && "version" in value
    && typeof value.version === "number" && Number.isSafeInteger(value.version) && value.version > 0 && value.version !== 1) {
    return problem("/version", "incompatible-version")
  }
  const decoded = Schema.decodeUnknownResult(DecodeInput, { onExcessProperty: "error" })(value)
  if (Result.isFailure(decoded)) return problem("")
  const input = value as typeof DecodeInput.Type
  return build(input, catalog, limits, input.requiredVersions)
}

function build(input: typeof EncodeInput.Type, catalog: Catalog, limits?: Partial<Limits>, imported?: FabricWorkspace.RequiredVersions): PackageResult {
  // The sole compiler retains its own 256 KiB/16 ceiling, independently of the envelope profile.
  const compiled = compile(input.workspace, catalog)
  if (!compiled.ok) return {
    ok: false,
    diagnostics: compiled.diagnostics.map((diagnostic) => ({ ...diagnostic, path: "/workspace" + diagnostic.path })),
  }
  const requiredVersions: FabricWorkspace.RequiredVersions = {
    workspaceVersion: 1,
    components: references(compiled.document.tools.map((tool) => tool.component)),
    capabilities: references(compiled.document.tools.flatMap((tool) => tool.source ? [tool.source.capability] : [])),
  }
  if (imported && !exact(imported.components, requiredVersions.components)) return problem("/requiredVersions/components")
  if (imported && !exact(imported.capabilities, requiredVersions.capabilities)) return problem("/requiredVersions/capabilities")

  const aliases = new Set(compiled.document.context.resourceAliases)
  const hinted = new Set<string>()
  const invalidHint = input.resourceHints?.findIndex((hint) => {
    if (!aliases.has(hint.alias) || hinted.has(hint.alias)) return true
    hinted.add(hint.alias)
    return false
  })
  if (invalidHint !== undefined && invalidHint !== -1) return problem(`/resourceHints/${invalidHint}/alias`)

  const portable: FabricWorkspace.Package = {
    format: "fabric-studio.workspace-package",
    version: 1,
    workspace: compiled.document,
    ...(input.origin === undefined ? {} : { origin: {
      templateID: input.origin.templateID,
      templateRevision: input.origin.templateRevision,
    } }),
    requiredVersions,
    ...(input.resourceHints === undefined ? {} : { resourceHints: input.resourceHints.map((hint) => ({
      alias: hint.alias,
      resourceType: hint.resourceType,
      ...(hint.tenantID === undefined ? {} : { tenantID: hint.tenantID }),
      ...(hint.workspaceID === undefined ? {} : { workspaceID: hint.workspaceID }),
      ...(hint.resourceID === undefined ? {} : { resourceID: hint.resourceID }),
    })) }),
    // Categories absent from the package, not a claim that arbitrary user strings are secret-free.
    exclusions: {
      credentials: true,
      authority: true,
      activations: true,
      results: true,
      approvals: true,
      "remote-data": true,
      environment: true,
    },
  }
  const admitted = BoundedJson.admit(portable, "package", limits)
  if (!admitted.ok) return admitted
  const decoded = Schema.decodeUnknownResult(FabricWorkspace.Package, { onExcessProperty: "error" })(admitted.value)
  if (Result.isFailure(decoded)) return problem("")
  const packet = admitted.value as FabricWorkspace.Package
  return {
    ok: true,
    package: packet,
    text: JSON.stringify(packet),
    normalizations: compiled.normalizations.map((change) => ({ ...change, path: "/workspace" + change.path })),
  }
}

function compare(left: FabricWorkspace.Component, right: FabricWorkspace.Component) {
  if (left.id !== right.id) return left.id < right.id ? -1 : 1
  return left.revision === right.revision ? 0 : left.revision < right.revision ? -1 : 1
}

function references(refs: readonly FabricWorkspace.Component[]) {
  return refs.map((ref) => ({ id: ref.id, revision: ref.revision })).sort(compare)
    .filter((ref, index, sorted) => index === 0 || compare(ref, sorted[index - 1]) !== 0)
}

function exact(actual: readonly FabricWorkspace.Component[], expected: readonly FabricWorkspace.Component[]) {
  // Do not deduplicate imported lists: a duplicate must fail even when every ref is supported.
  return actual.length === expected.length && [...actual].sort(compare).every((ref, index) => compare(ref, expected[index]) === 0)
}

function problem(path: string, code: "invalid-input" | "incompatible-version" = "invalid-input"): PackageResult {
  return { ok: false, diagnostics: [{ path, code, messageKey: `fabric.package.${code}` }] }
}
