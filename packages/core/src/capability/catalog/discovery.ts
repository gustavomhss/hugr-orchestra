export * as CapabilityDiscovery from "./discovery"

import { and, eq } from "drizzle-orm"
import { Effect, Exit, Option, Schema, Semaphore } from "effect"
import { Capability } from "@orchestra/schema/capability"
import type { Credential } from "../../credential"
import type { Database } from "../../database/database"
import { Location } from "../../location"
import { PermissionV2 } from "../../permission"
import { ToolRegistry } from "../../tool/registry"
import type { Tool } from "../../tool/tool"
import { CapabilityConnections } from "../connection/index"
import { CapabilityInvocation } from "../invocation"
import { CapabilityPolicy } from "../policy"
import { CapabilityBindingTable, CapabilityConnectionTable, CapabilityTargetTable } from "../sql"
import { CapabilityCursors } from "./cursors"
import { CapabilityDescriptors } from "./descriptors"
import { CapabilityVendorSchema } from "./schema"

export const disclosureAction = "service_discover"
export type VendorTool = Readonly<{
  name: string
  summary: string
  inputSchema: Schema.Json
  outputSchema?: Schema.Json
}>
export type VendorList = Readonly<{
  tools: readonly VendorTool[]
  catalogGeneration: number
  coverage: "complete" | "partial"
  /** Complete transport envelope byte count, measured before parsing. Not a per-schema quota. */
  byteLength: number
}>
/** Host-only selection from real Connection resolution. Credential must never enter model output.
 * Transport owns endpoint approval, bounded network acquisition, authentication and generation tracking.
 */
export type Selection = Readonly<CapabilityConnections.Resolution & {
  owner: Capability.Owner
  credential: Credential.Value
}>
export type CatalogSource = Readonly<{
  listTools: (selection: Selection) => Effect.Effect<VendorList, Capability.Failure>
}>
export type FindInput = Readonly<{
  query: string
  provider: string
  connectionID?: Capability.ConnectionID
  targetID?: Capability.TargetID
  cursor?: string
  limit?: number
}>
export type Operation = Readonly<{
  name: string
  summary: string
  readiness: "ready" | "unsupported"
  coverage: CapabilityVendorSchema.Coverage | Readonly<{ input: "unsupported"; output: "unsupported" }>
  ref?: Capability.DescriptorRef
}>
export type Page = Readonly<{
  operations: readonly Operation[]
  coverage: "complete" | "partial"
  catalogGeneration: number
  cursor?: string
}>
export type Description = Readonly<{
  ref: Capability.DescriptorRef
  name: string
  summary: string
  readiness: "ready"
  coverage: CapabilityVendorSchema.Coverage
  inputSchema: Schema.Json
  outputSchema?: Schema.Json
}>
export type Options = Readonly<{
  source: CatalogSource
  maxEntries?: number
  ttlMillis?: number
  maxTools?: number
  maxCatalogBytes?: number
  maxLimit?: number
  now?: () => number
  descriptors?: CapabilityDescriptors.Store
}>

const Find = Schema.Struct({
  query: Schema.String,
  provider: Schema.NonEmptyString,
  connectionID: Schema.optionalKey(Capability.ConnectionID),
  targetID: Schema.optionalKey(Capability.TargetID),
  cursor: Schema.optionalKey(Schema.NonEmptyString),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
})
type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]
type Envelope = Readonly<{
  tools: readonly Readonly<{ name: string; summary: string; source: VendorTool }>[]
  catalogGeneration: number
  coverage: "complete" | "partial"
}>
type DisclosureDecision = Readonly<{ tool: Envelope["tools"][number]; approved: boolean }>
type Visibility = readonly Readonly<{
  tool: Envelope["tools"][number]
  allowed: boolean
  effect: "allow" | "ask" | "deny"
  configured: "allow" | "ask" | "deny"
}>[]

export function make(options: Options) {
  return Effect.gen(function* () {
    const location = yield* Location.Service
    const connections = yield* CapabilityConnections.make
    const policy = yield* CapabilityPolicy.make
    const registry = yield* ToolRegistry.Service
    const permissions = yield* PermissionV2.Service
    const maxEntries = options.maxEntries ?? 512
    const ttlMillis = options.ttlMillis ?? 60000
    const maxTools = options.maxTools ?? 256
    const maxCatalogBytes = options.maxCatalogBytes ?? 4194304
    const maxLimit = options.maxLimit ?? 32
    const now = options.now ?? Date.now
    const source = options.source
    if ([maxEntries, maxTools, maxCatalogBytes, maxLimit].some((value) => !Number.isSafeInteger(value) || value <= 0) ||
      !Number.isFinite(ttlMillis) || ttlMillis <= 0) return yield* Effect.die(new RangeError("Invalid discovery bounds"))
    const descriptors = options.descriptors ?? (yield* CapabilityDescriptors.make({ maxEntries, ttlMillis, now }))
    const cursors = yield* CapabilityCursors.make({ maxEntries, ttlMillis, now })
    const locators = new Map<Capability.DescriptorID, Readonly<{
      provider: string; name: string; owner: Capability.Owner; ref: Capability.DescriptorRef; expiresAt: number
    }>>()
    const validators = new Map<string, { value: CapabilityVendorSchema.Validator | Capability.Failure; expiresAt: number }>()
    const compilation = Semaphore.makeUnsafe(1)
    const placement = { projectID: location.project.id,
      location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }) }

    const identity = (provider: string, materialization: ToolRegistry.Materialization) => {
      const canonicalName = `platform_${provider}`
      const captured = materialization.registrationIdentity(canonicalName)
      if (!captured || registry.currentRegistrationIdentity(canonicalName) !== captured) return failure("stale_descriptor")
      return { canonicalName, canonicalIdentity: captured }
    }
    const acquire = Effect.fn("CapabilityDiscovery.acquire")(function* (
      context: Tool.Context, input: Omit<FindInput, "query" | "cursor" | "limit">, materialization: ToolRegistry.Materialization,
    ) {
      // Missing frame and persisted-root failures precede selection, registry probing and acquisition.
      const binding = yield* CapabilityInvocation.require(context, placement)
      yield* policy.assert(context, { action: disclosureAction, resources: resources(input) })
      const canonical = identity(input.provider, materialization)
      if (canonical instanceof Capability.Failure) return yield* canonical
      const resolution = yield* connections.resolve(context, { ...input, action: disclosureAction })
      const credential = yield* connections.loadCredential(context, resolution, disclosureAction)
      const listed = yield* source.listTools(Object.freeze(structuredClone({ ...resolution, owner: binding.owner, credential }))).pipe(
        Effect.mapError(() => failure("acquisition_failed")),
      )
      const catalog = boundedEnvelope(listed, maxTools, maxCatalogBytes)
      if (catalog instanceof Capability.Failure) return yield* catalog
      // No cache can assert a current remote generation. Re-list each disclosure; cache only validators.
      yield* connections.loadCredential(context, resolution, disclosureAction)
      const current = identity(input.provider, materialization)
      if (current instanceof Capability.Failure) return yield* current
      return { binding, canonical, resolution, catalog }
    })
    const visibility = Effect.fnUntraced(function* (
      context: Tool.Context, binding: CapabilityInvocation.Binding, decisions: readonly DisclosureDecision[],
      selection: { provider: string; connectionID: Capability.ConnectionID; targetID: Capability.TargetID },
    ) {
      return yield* Effect.forEach(decisions, (decision) => Effect.gen(function* () {
        const selected = [...resources(selection), operationResource(selection.provider, decision.tool.name)]
        const captured = selected.map((resource) => PermissionV2.evaluate(disclosureAction, resource,
          binding.nativeDenyFloor.filter((rule) => rule.effect === "deny")).effect === "deny" ? "deny"
          : PermissionV2.evaluate(disclosureAction, resource, binding.effectiveRules).effect)
        const current = yield* permissions.evaluate({ sessionID: context.sessionID, agent: context.agent,
          action: disclosureAction, resources: selected }).pipe(
          Effect.catchTag("Session.NotFoundError", () => Effect.fail(failure("invocation_binding_mismatch"))),
        )
        const effect = captured.includes("deny") || current === "deny" ? "deny" as const
          : current === "ask" || captured.includes("ask") ? "ask" as const : "allow" as const
        return { tool: decision.tool, allowed: decision.approved && effect !== "deny", effect, configured: current }
      }))
    })
    const visibleCatalog = Effect.fnUntraced(function* (
      context: Tool.Context, binding: CapabilityInvocation.Binding, envelope: Envelope,
      resolution: CapabilityConnections.Resolution,
    ) {
      const selection = { provider: resolution.connection.provider, connectionID: resolution.connection.id, targetID: resolution.target.id }
      const permit = yield* policy.authorize(context, { action: disclosureAction, resources: [disclosureAction, ...resources(selection)] })
      // Finish every approval before consulting any individual schema. A declined ask is a per-call
      // decision, not a configured deny, and must never be resurrected by read-only reassessment.
      const decisions = yield* Effect.forEach(envelope.tools, (tool) => policy.assert(context, {
        action: disclosureAction, resources: [...resources(selection), operationResource(selection.provider, tool.name)],
      }).pipe(Effect.as(true), Effect.catchTag("Capability.Failure", (error) =>
        error.code === "target_denied" ? Effect.succeed(false) : Effect.fail(error)),
        Effect.map((approved) => ({ tool, approved })),
      ))
      return yield* policy.commit(permit, (tx) => Effect.gen(function* () {
        yield* checkSelection(tx, context, binding.owner, resolution)
        const current = yield* visibility(context, binding, decisions, selection)
        // Actor/private-root gate holds reassessment and schema copying in one stable transition.
        // Revocation while another operation waited for approval cannot become a schema oracle.
        const tools = current.filter((item) => item.allowed).map((item): VendorTool | Capability.Failure => {
          const inputSchema = CapabilityVendorSchema.snapshot(item.tool.source.inputSchema)
          const outputSchema = item.tool.source.outputSchema === undefined ? undefined : CapabilityVendorSchema.snapshot(item.tool.source.outputSchema)
          if (inputSchema instanceof Capability.Failure || outputSchema instanceof Capability.Failure) return failure("unsupported_schema")
          return Object.freeze({ name: item.tool.name, summary: item.tool.summary, inputSchema,
            ...(outputSchema === undefined ? {} : { outputSchema }) })
        })
        const error = tools.find((tool) => tool instanceof Capability.Failure)
        if (error instanceof Capability.Failure) return yield* error
        const visible = tools.filter((tool): tool is VendorTool => !(tool instanceof Capability.Failure))
        return { permit, decisions, tools: visible, visibilityHash: visibilityHash(binding, current), catalogHash: CapabilityVendorSchema.hash({
          generation: envelope.catalogGeneration, coverage: envelope.coverage,
          tools: visible.map((tool) => ({ name: tool.name, summary: tool.summary, inputSchema: tool.inputSchema,
            ...(tool.outputSchema === undefined ? {} : { outputSchema: tool.outputSchema }) })),
        }) }
      })).pipe(Effect.catchTag("SqlError", () => Effect.fail(failure("connection_unavailable"))))
    })
    const compile = Effect.fnUntraced(function* (tool: VendorTool) {
      const time = now()
      if (!Number.isFinite(time) || !Number.isFinite(time + ttlMillis)) return yield* failure("stale_descriptor")
      Array.from(validators).forEach(([key, value]) => { if (value.expiresAt <= time) validators.delete(key) })
      const key = CapabilityVendorSchema.hash({ input: tool.inputSchema, output: tool.outputSchema ?? null,
        outputPresent: tool.outputSchema !== undefined })
      const cached = validators.get(key)
      if (cached) return cached.value
      if (validators.size >= maxEntries) return yield* failure("quota_exceeded")
      const value = yield* CapabilityVendorSchema.compile(tool.inputSchema, tool.outputSchema).pipe(
        Effect.catchTag("Capability.Failure", (error) => Effect.succeed(error)),
      )
      validators.set(key, { value, expiresAt: time + ttlMillis })
      return value
    }, compilation.withPermit)

    const find = Effect.fn("CapabilityDiscovery.find")(function* (
      context: Tool.Context, input: FindInput, materialization: ToolRegistry.Materialization,
    ): Effect.fn.Return<Page, Capability.Failure> {
      const supplied = { ...context }
      const binding = yield* CapabilityInvocation.require(supplied, placement)
      // Validate the durable root before inspecting caller-controlled selectors.
      yield* policy.assert(supplied, { action: disclosureAction, resources: [disclosureAction] })
      const parsed = Schema.decodeUnknownOption(Schema.toType(Find))(input)
      if (Option.isNone(parsed)) return yield* failure("unsupported_operation")
      const provider = normalizeProvider(parsed.value.provider)
      if (!provider) return yield* failure("unsupported_operation")
      const value = { ...parsed.value, provider, limit: parsed.value.limit ?? maxLimit }
      if (value.query.length > 1024 || value.limit > maxLimit || (value.cursor?.length ?? 0) > 128)
        return yield* failure("unsupported_operation")
      const preflight: CapabilityCursors.PreflightScope = {
        owner: binding.owner, query: value.query, provider: value.provider, limit: value.limit,
        requestedConnectionID: value.connectionID, requestedTargetID: value.targetID,
      }
      if (value.cursor !== undefined) yield* cursors.preflight(value.cursor, preflight)
      const acquired = yield* acquire(supplied, value, materialization)
      const selection = { provider: value.provider, connectionID: acquired.resolution.connection.id,
        targetID: acquired.resolution.target.id }
      const visible = yield* visibleCatalog(supplied, binding, acquired.catalog, acquired.resolution)
      const scope: CapabilityCursors.Scope = {
        ...preflight, ...selection,
        connectionGeneration: acquired.resolution.connection.generation, targetGeneration: acquired.resolution.target.generation,
        catalogGeneration: acquired.catalog.catalogGeneration, catalogHash: visible.catalogHash, visibilityHash: visible.visibilityHash,
        canonicalIdentity: acquired.canonical.canonicalIdentity,
      }
      const offset = value.cursor === undefined ? 0 : yield* cursors.read(value.cursor, scope)
      const matches = visible.tools.filter((tool) => `${tool.name}\n${tool.summary}`.toLowerCase().includes(value.query.toLowerCase()))
      const page = yield* Effect.forEach(matches.slice(offset, offset + value.limit), (tool) => Effect.gen(function* () {
        const validator = yield* compile(tool)
        return { tool, validator }
      }))
      const plan = page.flatMap((item) => item.validator instanceof Capability.Failure ? [] : [{
        owner: binding.owner, ...acquired.canonical,
        connectionID: scope.connectionID, targetID: scope.targetID,
        connectionGeneration: scope.connectionGeneration, targetGeneration: scope.targetGeneration,
        catalogGeneration: scope.catalogGeneration, schemaHash: item.validator.schemaHash,
        inputSchema: item.validator.inputSchema, outputSchema: item.validator.outputSchema, operationID: item.tool.name,
      }])
      const pending: { records: readonly CapabilityDescriptors.DescriptorRecord[]; cursor?: string; cancelled: boolean } = {
        records: [], cancelled: false,
      }
      return yield* Effect.uninterruptibleMask((restore) => Effect.gen(function* () {
        // Reserve actual cursor capacity before descriptor issuance. Pending token remains host-only.
        const cursor = offset + page.length < matches.length ? yield* cursors.issue(scope, offset + page.length) : undefined
        pending.cursor = cursor
        return yield* restore(Effect.gen(function* () {
          const operations = yield* policy.commit(visible.permit, (tx) => Effect.gen(function* () {
            yield* checkSelection(tx, supplied, binding.owner, acquired.resolution)
            const current = yield* visibility(supplied, binding, visible.decisions, selection)
            if (visibilityHash(binding, current) !== scope.visibilityHash) return yield* failure("stale_descriptor")
            const canonical = identity(value.provider, materialization)
            if (canonical instanceof Capability.Failure) return yield* canonical
            const time = now()
            Array.from(locators).forEach(([id, value]) => { if (value.expiresAt <= time) locators.delete(id) })
            if (locators.size + plan.length > maxEntries)
              return yield* failure("quota_exceeded")
            // Mask only admission and capture: injected asynchronous stores must deliver their committed
            // tuple before interruption can start rollback. Shared store owns actual batch capacity.
            yield* descriptors.issueBatch(plan).pipe(Effect.tap((records) => Effect.sync(() => {
              pending.records = records
            })), Effect.uninterruptible)
            const currentIdentity = identity(value.provider, materialization)
            if (currentIdentity instanceof Capability.Failure) return yield* currentIdentity
            if (pending.records.length !== plan.length || new Set(pending.records.map((record) => record.operationID)).size !== plan.length ||
              pending.records.some((record) => !CapabilityCursors.sameOwner(record.owner, binding.owner) ||
                record.canonicalIdentity !== acquired.canonical.canonicalIdentity || record.canonicalName !== acquired.canonical.canonicalName ||
                record.connectionGeneration !== scope.connectionGeneration || record.targetGeneration !== scope.targetGeneration ||
                record.ref.connectionID !== scope.connectionID || record.ref.targetID !== scope.targetID ||
                record.ref.catalogGeneration !== scope.catalogGeneration ||
                !plan.some((input) => input.operationID === record.operationID && input.schemaHash === record.ref.schemaHash)))
              return yield* failure("stale_descriptor")
            const operations = page.map((item): Operation | Capability.Failure => {
              if (item.validator instanceof Capability.Failure) return {
                name: item.tool.name, summary: item.tool.summary, readiness: "unsupported",
                coverage: { input: "unsupported", output: "unsupported" },
              }
              const record = pending.records.find((record) => record.operationID === item.tool.name)
              if (!record) return failure("stale_descriptor")
              return { name: record.operationID, summary: item.tool.summary, readiness: "ready",
                coverage: item.validator.coverage, ref: record.ref }
            })
            const error = operations.find((operation) => operation instanceof Capability.Failure)
            if (error instanceof Capability.Failure) return yield* error
            return operations.filter((operation): operation is Operation => !(operation instanceof Capability.Failure))
          })).pipe(Effect.catchTag("SqlError", () => Effect.fail(failure("connection_unavailable"))))
          if (cursor !== undefined) yield* cursors.preflight(cursor, preflight)
          // SQLite COMMIT and injected Store calls may yield. Check current token outside that boundary,
          // then publish locators and return in one synchronous transition. This is not a liveness lease.
          return yield* Effect.suspend(() => {
            const currentIdentity = identity(value.provider, materialization)
            if (currentIdentity instanceof Capability.Failure) return Effect.fail(currentIdentity)
            const time = now()
            // A synchronous host callback can request interruption and run rollback reentrantly.
            // Never republish locators after that cleanup, even if this callback resumes afterward.
            if (pending.cancelled) return Effect.interrupt
            if (!Number.isFinite(time) || pending.records.some((record) => record.expiresAt <= time))
              return Effect.fail(failure("stale_descriptor"))
            Array.from(locators).forEach(([id, value]) => { if (value.expiresAt <= time) locators.delete(id) })
            if (locators.size + pending.records.length > maxEntries) return Effect.fail(failure("quota_exceeded"))
            pending.records.forEach((record) => locators.set(record.ref.id, Object.freeze({
              provider: value.provider, name: record.operationID, owner: record.owner, ref: record.ref, expiresAt: record.expiresAt,
            })))
            return Effect.succeed({ operations, coverage: acquired.catalog.coverage, catalogGeneration: acquired.catalog.catalogGeneration,
              ...(cursor === undefined ? {} : { cursor }) })
          })
        }))
      })).pipe(Effect.onExit((exit) => Exit.isFailure(exit) ? Effect.gen(function* () {
        // This observer encloses the mask itself, including interruption delivered at restoration.
        pending.cancelled = true
        if (pending.cursor !== undefined) yield* cursors.remove(pending.cursor)
        yield* Effect.forEach(pending.records, (record) => descriptors.remove(record.ref), { discard: true })
        pending.records.forEach((record) => locators.delete(record.ref.id))
      }) : Effect.void))
    })

    const describe = Effect.fn("CapabilityDiscovery.describe")(function* (
      context: Tool.Context, ref: Capability.DescriptorRef, materialization: ToolRegistry.Materialization,
    ): Effect.fn.Return<Description, Capability.Failure> {
      const supplied = { ...context }
      const binding = yield* CapabilityInvocation.require(supplied, placement)
      yield* policy.assert(supplied, { action: disclosureAction, resources: [disclosureAction] })
      const parsed = Schema.decodeUnknownOption(Capability.DescriptorRef)(ref)
      if (Option.isNone(parsed)) return yield* failure("stale_descriptor")
      const value = { ...parsed.value }
      const locator = locators.get(value.id)
      const time = now()
      if (!locator || !Number.isFinite(time) || locator.expiresAt <= time ||
        !CapabilityCursors.sameOwner(locator.owner, binding.owner) || !sameRef(locator.ref, value))
        return yield* failure("stale_descriptor")
      yield* policy.assert(supplied, { action: disclosureAction, resources: [disclosureAction, value.connectionID, value.targetID] })
      yield* policy.assert(supplied, { action: disclosureAction, resources: [operationResource(locator.provider, locator.name)] })
      const acquired = yield* acquire(supplied, { provider: locator.provider, connectionID: value.connectionID,
        targetID: value.targetID }, materialization)
      const visible = yield* visibleCatalog(supplied, binding,
        { ...acquired.catalog, tools: acquired.catalog.tools.filter((tool) => tool.name === locator.name) }, acquired.resolution)
      const tool = visible.tools.find((tool) => tool.name === locator.name)
      if (!tool) return yield* failure("stale_descriptor")
      const validator = yield* compile(tool)
      if (validator instanceof Capability.Failure) return yield* validator
      const permit = yield* policy.authorize(supplied, { action: disclosureAction,
        resources: [...resources({ provider: locator.provider, connectionID: value.connectionID, targetID: value.targetID }),
          operationResource(locator.provider, locator.name)],
      })
      const description = yield* policy.commit(permit, (tx) => Effect.gen(function* () {
        yield* checkSelection(tx, supplied, binding.owner, acquired.resolution)
        const canonical = identity(locator.provider, materialization)
        if (canonical instanceof Capability.Failure) return yield* canonical
        const record = yield* descriptors.read(value, {
          owner: binding.owner, connectionGeneration: acquired.resolution.connection.generation,
          targetGeneration: acquired.resolution.target.generation, canonicalIdentity: acquired.canonical.canonicalIdentity,
          catalogGeneration: acquired.catalog.catalogGeneration, schemaHash: validator.schemaHash,
        })
        const currentIdentity = identity(locator.provider, materialization)
        if (currentIdentity instanceof Capability.Failure) return yield* currentIdentity
        return { ref: record.ref, name: record.operationID, summary: tool.summary, readiness: "ready" as const,
          coverage: validator.coverage, inputSchema: record.inputSchema,
          ...(record.outputSchema === undefined ? {} : { outputSchema: record.outputSchema }) }
      })).pipe(Effect.catchTag("SqlError", () => Effect.fail(failure("connection_unavailable"))))
      return yield* Effect.suspend(() => {
        const currentIdentity = identity(locator.provider, materialization)
        if (currentIdentity instanceof Capability.Failure) return Effect.fail(currentIdentity)
        const time = now()
        return !Number.isFinite(time) || locator.expiresAt <= time ? Effect.fail(failure("stale_descriptor")) : Effect.succeed(description)
      })
    })
    return { find, describe }
  })
}

export type Interface = Effect.Success<ReturnType<typeof make>>

function normalizeProvider(value: string) {
  const normalized = value.trim().toLowerCase().replaceAll("-", "_")
  return /^[a-z][a-z0-9_]{0,63}$/.test(normalized) ? normalized : undefined
}

function resources(input: { provider: string; connectionID?: Capability.ConnectionID; targetID?: Capability.TargetID }) {
  return [input.provider, ...(input.connectionID ? [input.connectionID] : []), ...(input.targetID ? [input.targetID] : [])]
}

function operationResource(provider: string, name: string) {
  return `${provider}:${name}`
}

function boundedEnvelope(list: VendorList, maxTools: number, maxBytes: number): Envelope | Capability.Failure {
  if (!list || !Array.isArray(list.tools) || list.tools.length > maxTools ||
    !Number.isSafeInteger(list.catalogGeneration) || list.catalogGeneration < 0 ||
    (list.coverage !== "complete" && list.coverage !== "partial")) return failure("acquisition_failed")
  if (!Number.isSafeInteger(list.byteLength) || list.byteLength < 0) return failure("acquisition_failed")
  if (list.byteLength > maxBytes) return failure("quota_exceeded")
  const names = new Set<string>()
  const tools = list.tools.map((tool): Envelope["tools"][number] | Capability.Failure => {
    if (!tool || typeof tool.name !== "string" || !tool.name.trim() || tool.name.length > 256 || names.has(tool.name) ||
      typeof tool.summary !== "string" || tool.summary.length > 2048) return failure("acquisition_failed")
    names.add(tool.name)
    return Object.freeze({ name: tool.name, summary: tool.summary, source: tool })
  })
  const error = tools.find((tool) => tool instanceof Capability.Failure)
  if (error instanceof Capability.Failure) return error
  return { tools: tools.filter((tool): tool is Envelope["tools"][number] => !(tool instanceof Capability.Failure)),
    catalogGeneration: list.catalogGeneration, coverage: list.coverage }
}

function sameRef(left: Capability.DescriptorRef, right: Capability.DescriptorRef) {
  return left.id === right.id && left.schemaHash === right.schemaHash && left.catalogGeneration === right.catalogGeneration &&
    left.connectionID === right.connectionID && left.targetID === right.targetID
}

function visibilityHash(binding: CapabilityInvocation.Binding, visible: Visibility) {
  const rules = (rules: PermissionV2.Ruleset) => rules.map((rule) => ({ action: rule.action, resource: rule.resource, effect: rule.effect }))
  return CapabilityVendorSchema.hash({ captured: rules(binding.effectiveRules), nativeFloor: rules(binding.nativeDenyFloor),
    configured: visible.map((item) => ({ name: item.tool.name, effect: item.configured })),
    visible: visible.filter((item) => item.allowed).map((item) => ({ name: item.tool.name, effect: item.effect })) })
}

// Recheck authoritative selection in the disclosure commit, closing retarget/binding races after transport.
function checkSelection(tx: Transaction, context: Tool.Context, owner: Capability.Owner, resolution: CapabilityConnections.Resolution) {
  return Effect.gen(function* () {
    const connection = yield* tx.select().from(CapabilityConnectionTable)
      .where(eq(CapabilityConnectionTable.id, resolution.connection.id)).get()
    const target = yield* tx.select().from(CapabilityTargetTable).where(eq(CapabilityTargetTable.id, resolution.target.id)).get()
    const binding = yield* tx.select().from(CapabilityBindingTable).where(and(
      eq(CapabilityBindingTable.target_id, resolution.target.id), eq(CapabilityBindingTable.session_id, context.sessionID),
      eq(CapabilityBindingTable.agent_id, context.agent),
    )).get()
    if (!connection || !target || connection.state !== "active" || connection.generation !== resolution.connection.generation ||
      connection.project_id !== owner.projectID || connection.directory !== owner.location.directory ||
      (connection.workspace_id ?? undefined) !== owner.location.workspaceID || connection.provider !== resolution.connection.provider ||
      target.generation !== resolution.target.generation || target.connection_id !== connection.id ||
      connection.credential_id !== resolution.credentialID || connection.endpoint !== resolution.endpoint ||
      CapabilityVendorSchema.hash(target.resource) !== CapabilityVendorSchema.hash(resolution.resource) ||
      target.environment !== resolution.target.environment || !binding ||
      (!binding.actions.includes(disclosureAction) && !binding.actions.includes("*"))) return yield* failure("stale_descriptor")
  }).pipe(Effect.mapError((error) => error instanceof Capability.Failure ? error : failure("connection_unavailable")))
}

function failure(code: Capability.ErrorCode) {
  return new Capability.Failure({ code, message: "Capability discovery unavailable" })
}
