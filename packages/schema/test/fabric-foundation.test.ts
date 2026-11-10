import { describe, expect, test } from "bun:test"
import { Schema, SchemaAST } from "effect"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false

// Walk the actual AST, including encoding links and suspended nodes, not source spellings or decoded types alone.
function anyNodes(value: unknown, seen = new Set<object>()): SchemaAST.AST[] {
  if (typeof value !== "object" || value === null || seen.has(value)) return []
  seen.add(value)
  if (SchemaAST.isAST(value) && SchemaAST.isAny(value)) return [value]
  return [
    ...(SchemaAST.isAST(value) && SchemaAST.isSuspend(value) ? anyNodes(value.thunk(), seen) : []),
    ...Object.values(value).flatMap((child) => anyNodes(child, seen)),
  ]
}

describe("Fabric foundation", () => {
  test("FND01 identity refs preserve exact IDs, positive safe generations and canonical exports", async () => {
    const { FabricContext } = await import("../src/fabric-context")
    const { FabricResource } = await import("../src/fabric-resource")
    const { FabricCapability } = await import("../src/fabric-capability")
    const root = await import("../src/index")
    expect(root.FabricContext).toBe(FabricContext)
    expect(root.FabricResource).toBe(FabricResource)
    expect(root.FabricCapability).toBe(FabricCapability)
    const context = { id: FabricContext.ID.create(), generation: 1 }
    const connection = FabricResource.ConnectionID.create()
    expect(context.id).toMatch(/^fctx_[0-9A-Za-z]{26}$/)
    expect(connection).toMatch(/^fconn_[0-9A-Za-z]{26}$/)
    expect(FabricContext.ID.create()).not.toBe(context.id)
    expect(FabricResource.ConnectionID.create()).not.toBe(connection)
    expect(Schema.decodeUnknownSync(FabricContext.Ref)(context)).toEqual(context)
    expect(FabricContext.Ref.fields.id).toBe(FabricContext.ID)
    expect(FabricResource.Ref.fields.connectionID).toBe(FabricResource.ConnectionID)
    ;[
      context.id.replace("fctx_", "fctx"), context.id + "\n", context.id + "x",
      context.id.slice(0, -1), connection, "", "fctx_" + "-".repeat(26), "fctx_" + "a".repeat(25) + "_",
    ].forEach((id) => expect(() => Schema.decodeUnknownSync(FabricContext.Ref)({ ...context, id })).toThrow())
    ;[connection.replace("fconn_", "fconn"), connection + "\n", context.id, "", connection + "x",
      connection.slice(0, -1), "fconn_" + "-".repeat(26), "fconn_" + "a".repeat(25) + "_"].forEach((id) =>
      expect(() => Schema.decodeUnknownSync(FabricResource.ConnectionID)(id)).toThrow(),
    )
    expect(String(Schema.decodeUnknownSync(FabricContext.ID)("fctx_" + "a0Z".repeat(8) + "x1"))).toBe("fctx_" + "a0Z".repeat(8) + "x1")
    expect(String(Schema.decodeUnknownSync(FabricResource.ConnectionID)("fconn_" + "a0Z".repeat(8) + "x1"))).toBe("fconn_" + "a0Z".repeat(8) + "x1")
    ;[0, -1, 1.5, "1", Number.MAX_SAFE_INTEGER + 1, NaN, Infinity].forEach((generation) =>
      expect(() => Schema.decodeUnknownSync(FabricContext.Ref)({ ...context, generation })).toThrow(),
    )
    expect(Schema.decodeUnknownSync(FabricContext.Ref)({ ...context, generation: Number.MAX_SAFE_INTEGER }).generation)
      .toBe(Number.MAX_SAFE_INTEGER)
    Object.keys(context).forEach((key) => expect(() => Schema.decodeUnknownSync(FabricContext.Ref)(
      Object.fromEntries(Object.entries(context).filter(([name]) => name !== key)),
    )).toThrow())
    expect(() => Schema.decodeUnknownSync(FabricContext.Ref)({ ...context, authority: "operator" })).toThrow()
    expect(() => Schema.encodeUnknownSync(FabricContext.Ref)({ ...context, authority: "operator" })).toThrow()
    expect(Schema.decodeUnknownSync(FabricCapability.Ref)({ id: "fabric.example.read", revision: "1" }))
      .toEqual({ id: "fabric.example.read", revision: "1" })
    ;[{ id: "", revision: "1" }, { id: "fabric.example.read", revision: "" },
      { id: "fabric.example.read", revision: 1 }, { id: "fabric.example.read", revision: "1", endpoint: "https://invalid.example" },
      { id: 1, revision: "1" }, { id: "fabric.example.read" }, { revision: "1" },
    ].forEach((value) => expect(() => Schema.decodeUnknownSync(FabricCapability.Ref)(value)).toThrow())
    expect(() => Schema.encodeUnknownSync(FabricCapability.Ref)({ id: "fabric.example.read", revision: "1", token: "forbidden" })).toThrow()
  })

  test("FND02 scoped resources roundtrip without synthetic roots, coercion or authority fields", async () => {
    const { FabricContext } = await import("../src/fabric-context")
    const { FabricResource } = await import("../src/fabric-resource")
    const connection = {
      connectionID: FabricResource.ConnectionID.create(), connectionGeneration: 1, tenantID: "tenant-a",
    }
    const workspace = { ...connection, workspaceID: "workspace-a" }
    const resource = { ...workspace, resourceType: "Notebook", resourceID: "item-a" }
    expect(() => Schema.encodeUnknownSync(FabricResource.Ref)({ ...resource, token: "forbidden" })).toThrow()
    expect(Schema.encodeSync(FabricResource.Ref)(Schema.decodeUnknownSync(FabricResource.Ref)(resource)))
      .toEqual(resource)
    ;([
      { kind: "connection", ...connection }, { kind: "workspace", ...workspace }, { kind: "resource", resource },
    ] as const).forEach((scope) => {
      expect(Schema.encodeSync(FabricResource.Scope)(Schema.decodeUnknownSync(FabricResource.Scope)(scope))).toEqual(scope)
      expect(() => Schema.decodeUnknownSync(FabricResource.Scope)({ ...scope, token: "forbidden" })).toThrow()
      expect(() => Schema.encodeUnknownSync(FabricResource.Scope)({ ...scope, token: "forbidden" })).toThrow()
      Object.keys(scope).forEach((key) => expect(() => Schema.decodeUnknownSync(FabricResource.Scope)(
        Object.fromEntries(Object.entries(scope).filter(([name]) => name !== key)),
      )).toThrow())
    })
    ;([{ kind: "connection", ...connection }, { kind: "workspace", ...workspace }] as const).forEach((scope) => {
      ;[1, Number.MAX_SAFE_INTEGER].forEach((connectionGeneration) =>
        expect(Schema.decodeUnknownSync(FabricResource.Scope)({ ...scope, connectionGeneration })).toEqual({ ...scope, connectionGeneration }),
      )
      ;[0, -1, 0.5, "1", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].forEach((connectionGeneration) =>
        expect(() => Schema.decodeUnknownSync(FabricResource.Scope)({ ...scope, connectionGeneration })).toThrow(),
      )
      Object.entries(scope).filter(([, value]) => typeof value === "string").forEach(([field]) => {
        ;["", 1, null].forEach((value) =>
          expect(() => Schema.decodeUnknownSync(FabricResource.Scope)({ ...scope, [field]: value })).toThrow(),
        )
      })
    })
    Object.keys(resource).forEach((key) => expect(() => Schema.decodeUnknownSync(FabricResource.Ref)(
      Object.fromEntries(Object.entries(resource).filter(([name]) => name !== key)),
    )).toThrow())
    ;[
      { ...resource, connectionID: FabricContext.ID.create() },
      ...[0, -1, 1.5, "1", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]
        .map((connectionGeneration) => ({ ...resource, connectionGeneration })),
      ...["tenantID", "workspaceID", "resourceType", "resourceID"].map((field) => ({ ...resource, [field]: "" })),
      ...["tenantID", "workspaceID", "resourceType", "resourceID"].map((field) => ({ ...resource, [field]: 1 })),
      { ...resource, authority: "operator" },
    ].forEach((value) => expect(() => Schema.decodeUnknownSync(FabricResource.Ref)(value)).toThrow())
    ;[
      { kind: "tenant", ...connection }, { kind: "connection", ...workspace },
      { kind: "workspace", ...connection }, { kind: "resource", ...resource },
      { kind: "resource", resource: { ...resource, token: "forbidden" } },
      { kind: "workspace", ...workspace, connectionGeneration: 0 },
      { kind: "connection", ...connection, tenantID: "" }, null, {},
    ].forEach((value) => expect(() => Schema.decodeUnknownSync(FabricResource.Scope)(value)).toThrow())
    expect(Schema.decodeUnknownSync(FabricResource.Ref)({ ...resource, connectionGeneration: Number.MAX_SAFE_INTEGER })
      .connectionGeneration).toBe(Number.MAX_SAFE_INTEGER)
    expect(Schema.decodeUnknownSync(FabricResource.Ref)({ ...resource, tenantID: "tenant-b" }).tenantID).toBe("tenant-b")
  })

  test("FND03 observations retain scope and evidence mode; problems and optional fields are exact", async () => {
    const { FabricContext } = await import("../src/fabric-context")
    const { FabricResource } = await import("../src/fabric-resource")
    const { FabricObservation } = await import("../src/fabric-observation")
    const meta = {
      context: { id: FabricContext.ID.create(), generation: 1 },
      scope: { kind: "connection", connectionID: FabricResource.ConnectionID.create(), connectionGeneration: 1, tenantID: "tenant-a" },
      capability: { id: "fabric.example.list", revision: "1" },
      identityFingerprint: "identity-a", permissionEpoch: 0, observedAt: 0, complete: false, mode: "fixture",
    } satisfies typeof FabricObservation.Meta.Encoded
    ;(["real", "fixture", "demo", "documentation"] as const).forEach((mode) => {
      const value = { ...meta, mode }
      expect(Schema.encodeSync(FabricObservation.Meta)(Schema.decodeUnknownSync(FabricObservation.Meta)(value))).toEqual(value)
    })
    expect(Schema.decodeUnknownSync(FabricObservation.Meta)({ ...meta, complete: true }).complete).toBe(true)
    expect(Schema.encodeSync(FabricObservation.Meta)({ ...Schema.decodeUnknownSync(FabricObservation.Meta)(meta), providerRevision: undefined }))
      .not.toHaveProperty("providerRevision")
    expect(Schema.decodeUnknownSync(FabricObservation.Meta)({ ...meta, providerRevision: "etag-1" }).providerRevision).toBe("etag-1")
    expect(Schema.encodeSync(FabricObservation.Meta)(Schema.decodeUnknownSync(FabricObservation.Meta)({ ...meta, providerRevision: "etag-1" })))
      .toEqual({ ...meta, providerRevision: "etag-1" })
    ;["permissionEpoch", "observedAt"].forEach((field) => {
      ;[0, 1, Number.MAX_SAFE_INTEGER].forEach((value) =>
        expect(Schema.decodeUnknownSync(FabricObservation.Meta)({ ...meta, [field]: value })).toEqual({ ...meta, [field]: value }),
      )
      ;[-1, 0.5, "1", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].forEach((value) =>
        expect(() => Schema.decodeUnknownSync(FabricObservation.Meta)({ ...meta, [field]: value })).toThrow(),
      )
    })
    Object.keys(meta).forEach((key) => expect(() => Schema.decodeUnknownSync(FabricObservation.Meta)(
      Object.fromEntries(Object.entries(meta).filter(([name]) => name !== key)),
    )).toThrow())
    ;[
      { ...meta, mode: "verified" }, { ...meta, complete: "false" }, { ...meta, identityFingerprint: "" },
      { ...meta, permissionEpoch: -1 }, { ...meta, permissionEpoch: Number.MAX_SAFE_INTEGER + 1 },
      { ...meta, observedAt: NaN }, { ...meta, observedAt: Infinity }, { ...meta, observedAt: -1 },
      { ...meta, observedAt: 0.5 }, { ...meta, observedAt: Number.MAX_SAFE_INTEGER + 1 },
      { ...meta, resource: {} }, { ...meta, context: { ...meta.context, principal: "other" } },
      { ...meta, capability: { ...meta.capability, revision: 1 } }, { ...meta, providerRevision: "" },
      { ...meta, identityFingerprint: 1 }, { ...meta, providerRevision: 1 },
      { ...meta, capability: { ...meta.capability, token: "forbidden" } },
      { ...meta, scope: { ...meta.scope, token: "forbidden" } },
      { ...meta, scope: { kind: "resource", resource: {
        connectionID: meta.scope.connectionID, connectionGeneration: 1, tenantID: "tenant-a",
        workspaceID: "workspace-a", resourceType: "Notebook", resourceID: "item-a", token: "forbidden",
      } } },
    ].forEach((value) => {
      expect(() => Schema.decodeUnknownSync(FabricObservation.Meta)(value)).toThrow()
      expect(() => Schema.encodeUnknownSync(FabricObservation.Meta)(value)).toThrow()
    })
    const problem = { code: "unknown", retry: "reconcile", messageKey: "fabric.problem.unknown" } satisfies typeof FabricObservation.Problem.Encoded
    expect(Schema.encodeSync(FabricObservation.Problem)(Schema.decodeUnknownSync(FabricObservation.Problem)(problem))).toEqual(problem)
    expect(Schema.encodeSync(FabricObservation.Problem)({ ...Schema.decodeUnknownSync(FabricObservation.Problem)(problem), retryAfterMillis: undefined }))
      .not.toHaveProperty("retryAfterMillis")
    expect(Schema.decodeUnknownSync(FabricObservation.Problem)({ ...problem, retryAfterMillis: 0 }).retryAfterMillis).toBe(0)
    ;[0, 1, Number.MAX_SAFE_INTEGER].forEach((retryAfterMillis) => {
      const value = { ...problem, retryAfterMillis }
      expect(Schema.encodeSync(FabricObservation.Problem)(Schema.decodeUnknownSync(FabricObservation.Problem)(value))).toEqual(value)
    })
    Object.keys(problem).forEach((key) => expect(() => Schema.decodeUnknownSync(FabricObservation.Problem)(
      Object.fromEntries(Object.entries(problem).filter(([name]) => name !== key)),
    )).toThrow())
    ;[
      { ...problem, code: "success" }, { ...problem, retry: "automatic" }, { ...problem, messageKey: "" },
      { ...problem, token: "forbidden" }, { ...problem, retryAfterMillis: -1 },
      { ...problem, retryAfterMillis: 1.5 }, { ...problem, retryAfterMillis: "100" },
      { ...problem, retryAfterMillis: Infinity }, { ...problem, retryAfterMillis: Number.MAX_SAFE_INTEGER + 1 },
      { ...problem, retryAfterMillis: NaN }, { ...problem, messageKey: 1 },
    ].forEach((value) => {
      expect(() => Schema.decodeUnknownSync(FabricObservation.Problem)(value)).toThrow()
      expect(() => Schema.encodeUnknownSync(FabricObservation.Problem)(value)).toThrow()
    })
  })

  test("FND04 closed states and public schema identities stay browser-safe and canonical", async () => {
    const { FabricContext } = await import("../src/fabric-context")
    const { FabricResource } = await import("../src/fabric-resource")
    const { FabricCapability } = await import("../src/fabric-capability")
    const { FabricObservation } = await import("../src/fabric-observation")
    const root = await import("@orchestra/schema")
    const direct = await import("@orchestra/schema/fabric-observation")
    const context = await import("@orchestra/schema/fabric-context")
    const resource = await import("@orchestra/schema/fabric-resource")
    const capability = await import("@orchestra/schema/fabric-capability")
    expect(root.FabricObservation).toBe(FabricObservation)
    expect(direct.FabricObservation.Meta).toBe(FabricObservation.Meta)
    expect(context.FabricContext.Ref).toBe(FabricContext.Ref)
    expect(resource.FabricResource.Ref).toBe(FabricResource.Ref)
    expect(capability.FabricCapability.Ref).toBe(FabricCapability.Ref)
    expect(FabricResource.Scope.members).toContain(FabricResource.ResourceScope)
    expect(FabricResource.Scope.members).toContain(FabricResource.ConnectionScope)
    expect(FabricResource.Scope.members).toContain(FabricResource.WorkspaceScope)
    expect(FabricResource.ResourceScope.fields.resource).toBe(FabricResource.Ref)
    expect(FabricResource.ConnectionScope.fields.connectionID).toBe(FabricResource.ConnectionID)
    expect(FabricResource.WorkspaceScope.fields.connectionID).toBe(FabricResource.ConnectionID)
    expect(FabricObservation.Meta.fields.mode).toBe(FabricObservation.EvidenceMode)
    expect(new Set(FabricCapability.Availability.literals)).toEqual(new Set([
      "disabled", "not-installed", "authentication-required", "denied", "unsupported", "unverified", "ready", "degraded",
    ]))
    expect(new Set(FabricObservation.EvidenceKind.literals)).toEqual(new Set(["provider", "extracted", "inferred", "user", "unknown"]))
    expect(new Set(FabricObservation.EvidenceMode.literals)).toEqual(new Set(["real", "fixture", "demo", "documentation"]))
    expect(new Set(FabricObservation.Problem.fields.code.literals)).toEqual(new Set([
      "invalid-input", "conflict", "denied", "authentication-required", "unsupported", "unverified", "limit",
      "throttled", "offline", "expired", "unknown", "incompatible-version", "unavailable",
    ]))
    expect(new Set(FabricObservation.Problem.fields.retry.literals)).toEqual(new Set(["never", "read-after", "deliberate-action", "reconcile"]))
    ;(["disabled", "not-installed", "authentication-required", "denied", "unsupported", "unverified", "ready", "degraded"] as const)
      .forEach((value) => expect(Schema.decodeUnknownSync(FabricCapability.Availability)(value)).toBe(value))
    ;(["provider", "extracted", "inferred", "user", "unknown"] as const)
      .forEach((value) => expect(Schema.decodeUnknownSync(FabricObservation.EvidenceKind)(value)).toBe(value))
    ;(["invalid-input", "conflict", "denied", "authentication-required", "unsupported", "unverified", "limit", "throttled", "offline", "expired", "unknown", "incompatible-version", "unavailable"] as const)
      .forEach((code) => expect(Schema.decodeUnknownSync(FabricObservation.Problem)({ code, retry: "never", messageKey: "fabric.problem" }).code).toBe(code))
    ;(["never", "read-after", "deliberate-action", "reconcile"] as const)
      .forEach((retry) => expect(Schema.decodeUnknownSync(FabricObservation.Problem)({ code: "unknown", retry, messageKey: "fabric.problem" }).retry).toBe(retry))
    ;["installed", "success", "", null, 1].forEach((value) => {
      expect(() => Schema.decodeUnknownSync(FabricCapability.Availability)(value)).toThrow()
      expect(() => Schema.decodeUnknownSync(FabricObservation.EvidenceKind)(value)).toThrow()
    })
    const schemas = [
      FabricContext.ID, FabricContext.Ref, FabricResource.ConnectionID, FabricResource.Ref, FabricResource.Scope,
      FabricResource.ConnectionScope, FabricResource.WorkspaceScope, FabricResource.ResourceScope,
      FabricCapability.Ref, FabricCapability.Availability, FabricObservation.Meta, FabricObservation.Problem,
      FabricObservation.EvidenceKind, FabricObservation.EvidenceMode,
    ]
    const identifiers = schemas.map((schema) => SchemaAST.resolveIdentifier(schema.ast))
    expect(identifiers.every((id) => typeof id === "string" && /^Fabric[A-Za-z]+\.[A-Za-z]+$/.test(id))).toBe(true)
    // Stable public spelling is part of the frozen namespace/member mapping, not enum ordering.
    expect(identifiers).toEqual([
      "FabricContext.ID", "FabricContext.Ref", "FabricResource.ConnectionID", "FabricResource.Ref", "FabricResource.Scope",
      "FabricResource.ConnectionScope", "FabricResource.WorkspaceScope", "FabricResource.ResourceScope",
      "FabricCapability.Ref", "FabricCapability.Availability", "FabricObservation.Meta", "FabricObservation.Problem",
      "FabricObservation.EvidenceKind", "FabricObservation.EvidenceMode",
    ])
    expect(new Set(identifiers).size).toBe(schemas.length)
    ;[
      [FabricContext, context.FabricContext, root.FabricContext],
      [FabricResource, resource.FabricResource, root.FabricResource],
      [FabricCapability, capability.FabricCapability, root.FabricCapability],
      [FabricObservation, direct.FabricObservation, root.FabricObservation],
    ].forEach(([source, subpath, barrel]) => {
      expect(subpath).toBe(source)
      expect(barrel).toBe(source)
    })
    // Deliberately unsafe positive controls prove both ordinary and encoded-side Any are visible.
    expect(anyNodes(Schema.Struct({ value: Schema.Any }).ast)).toHaveLength(1)
    expect(anyNodes(Schema.Any.pipe(Schema.decodeTo(Schema.String)).ast)).toHaveLength(1)
    expect(anyNodes(Schema.String.ast)).toHaveLength(0)
    schemas.forEach((schema) => expect(anyNodes(schema.ast)).toHaveLength(0))
    expect(FabricObservation.Meta.fields.context).toBe(FabricContext.Ref)
    expect(FabricObservation.Meta.fields.scope).toBe(FabricResource.Scope)
    expect(FabricObservation.Meta.fields.capability).toBe(FabricCapability.Ref)
    // The compiler checks exact readonly shapes (including every nested leaf), so Any or mutable fields cannot satisfy this contract.
    type Context = Readonly<{ id: typeof FabricContext.ID.Type; generation: number }>
    type Resource = Readonly<{
      connectionID: typeof FabricResource.ConnectionID.Type; connectionGeneration: number; tenantID: string;
      workspaceID: string; resourceType: string; resourceID: string;
    }>
    type Scope = Readonly<{ kind: "connection"; connectionID: typeof FabricResource.ConnectionID.Type; connectionGeneration: number; tenantID: string }>
      | Readonly<{ kind: "workspace"; connectionID: typeof FabricResource.ConnectionID.Type; connectionGeneration: number; tenantID: string; workspaceID: string }>
      | Readonly<{ kind: "resource"; resource: Resource }>
    type Capability = Readonly<{ id: string; revision: string }>
    const types: {
      context: Equal<typeof FabricContext.Ref.Type, Context>;
      resource: Equal<typeof FabricResource.Ref.Type, Resource>;
      scope: Equal<typeof FabricResource.Scope.Type, Scope>;
      capability: Equal<typeof FabricCapability.Ref.Type, Capability>;
      metadata: Equal<typeof FabricObservation.Meta.Type, Readonly<{
        context: Context; scope: Scope; capability: Capability; identityFingerprint: string;
        permissionEpoch: number; observedAt: number; complete: boolean;
        mode: "real" | "fixture" | "demo" | "documentation"; providerRevision?: string | undefined;
      }>>;
      problem: Equal<typeof FabricObservation.Problem.Type, Readonly<{
        code: "invalid-input" | "conflict" | "denied" | "authentication-required" | "unsupported" | "unverified" | "limit"
          | "throttled" | "offline" | "expired" | "unknown" | "incompatible-version" | "unavailable";
        retry: "never" | "read-after" | "deliberate-action" | "reconcile"; messageKey: string; retryAfterMillis?: number | undefined;
      }>>;
      distinct: Equal<typeof FabricContext.ID.Type, typeof FabricResource.ConnectionID.Type> extends false ? true : false;
      contextToConnection: typeof FabricContext.ID.Type extends typeof FabricResource.ConnectionID.Type ? false : true;
      connectionToContext: typeof FabricResource.ConnectionID.Type extends typeof FabricContext.ID.Type ? false : true;
      contextID: 0 extends (1 & typeof FabricContext.ID.Type) ? false : true;
      connectionID: 0 extends (1 & typeof FabricResource.ConnectionID.Type) ? false : true;
    } = { context: true, resource: true, scope: true, capability: true, metadata: true, problem: true, distinct: true,
      contextID: true, connectionID: true, contextToConnection: true, connectionToContext: true }
    expect(Object.values(types).every(Boolean)).toBe(true)
    // This checks the actual import graph without requiring a browser or importing a host service.
    const result = await Bun.build({
      entrypoints: ["fabric-context", "fabric-resource", "fabric-capability", "fabric-observation", "index"]
        .map((file) => `${import.meta.dir}/../src/${file}.ts`), target: "browser",
    })
    expect(result.success).toBe(true)
    expect(result.outputs.length).toBeGreaterThan(0)
    expect(result.logs.filter((log) => log.level === "error")).toEqual([])
  })
})
