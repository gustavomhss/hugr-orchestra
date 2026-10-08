export * as CapabilityDiscovery from "./discovery"

import { and, eq } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import { Capability } from "@orchestra/schema/capability"
import type { Credential } from "../../credential"
import type { Database } from "../../database/database"
import { Location } from "../../location"
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

export function make(options: Options) {
  return Effect.gen(function* () {
    const location = yield* Location.Service
    const connections = yield* CapabilityConnections.make
    const policy = yield* CapabilityPolicy.make
    const registry = yield* ToolRegistry.Service
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
    const locators = new Map<Capability.DescriptorID, { provider: string; name: string; expiresAt: number }>()
    const validators = new Map<string, { value: CapabilityVendorSchema.Validator | Capability.Failure; expiresAt: number }>()
    const placement = { projectID: location.project.id,
      location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }) }

    const identity = Effect.fnUntraced(function* (
      binding: CapabilityInvocation.Binding, provider: string, materialization: ToolRegistry.Materialization,
    ) {
      const canonicalName = `platform_${provider}`
      const captured = materialization.registrationIdentity(canonicalName)
      const current = yield* registry.materialize(binding.effectiveRules)
      if (!captured || current.registrationIdentity(canonicalName) !== captured) return yield* failure("stale_descriptor")
      return { canonicalName, canonicalIdentity: captured }
    })
    const acquire = Effect.fn("CapabilityDiscovery.acquire")(function* (
      context: Tool.Context, input: Omit<FindInput, "query" | "cursor" | "limit">, materialization: ToolRegistry.Materialization,
    ) {
      // Missing frame and persisted-root failures precede selection, registry probing and acquisition.
      const binding = yield* CapabilityInvocation.require(context, placement)
      yield* policy.assert(context, { action: disclosureAction, resources: resources(input) })
      const canonical = yield* identity(binding, input.provider, materialization)
      const resolution = yield* connections.resolve(context, { ...input, action: disclosureAction }).pipe(
        Effect.catchTag("Session.NotFoundError", () => Effect.fail(failure("invocation_binding_mismatch"))),
      )
      const credential = yield* connections.loadCredential(context, resolution, disclosureAction)
      const listed = yield* source.listTools(Object.freeze(structuredClone({ ...resolution, owner: binding.owner, credential }))).pipe(
        Effect.mapError(() => failure("acquisition_failed")),
      )
      const catalog = boundedList(listed, maxTools, maxCatalogBytes)
      if (catalog instanceof Capability.Failure) return yield* catalog
      // No cache can assert a current remote generation. Re-list each disclosure; cache only validators.
      yield* connections.loadCredential(context, resolution, disclosureAction)
      yield* identity(binding, input.provider, materialization)
      return { binding, canonical, resolution, catalog, catalogHash: CapabilityVendorSchema.hash({
        generation: catalog.catalogGeneration, coverage: catalog.coverage, tools: catalog.tools.map((tool) => ({
          name: tool.name, summary: tool.summary, inputSchema: tool.inputSchema,
          ...(tool.outputSchema === undefined ? {} : { outputSchema: tool.outputSchema }),
        })),
      }) }
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
    })

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
      const acquired = yield* acquire(supplied, value, materialization)
      const scope: CapabilityCursors.Scope = {
        owner: binding.owner, query: value.query, provider: value.provider, limit: value.limit,
        connectionID: acquired.resolution.connection.id, targetID: acquired.resolution.target.id,
        connectionGeneration: acquired.resolution.connection.generation, targetGeneration: acquired.resolution.target.generation,
        catalogGeneration: acquired.catalog.catalogGeneration, catalogHash: acquired.catalogHash,
        canonicalIdentity: acquired.canonical.canonicalIdentity,
      }
      const offset = value.cursor === undefined ? 0 : yield* cursors.read(value.cursor, scope)
      const matches = acquired.catalog.tools.filter((tool) => `${tool.name}\n${tool.summary}`.toLowerCase().includes(value.query.toLowerCase()))
      const permitted = (yield* Effect.forEach(matches, (tool) => policy.authorize(supplied, {
        action: disclosureAction, resources: [...resources(scope), operationResource(value.provider, tool.name)],
      }).pipe(Effect.map((permit) => ({ tool, permit })), Effect.catchTag("Capability.Failure", (error) =>
        error.code === "target_denied" ? Effect.succeed(undefined) : Effect.fail(error),
      )))).filter((item) => item !== undefined)
      const page = yield* Effect.forEach(permitted.slice(offset, offset + value.limit), (item) => Effect.gen(function* () {
        const validator = yield* compile(item.tool)
        return { ...item, validator }
      }))
      const permit = yield* policy.authorize(supplied, { action: disclosureAction,
        resources: [...resources(scope), ...page.map((item) => operationResource(value.provider, item.tool.name))] })
      const operations = yield* policy.commit(permit, (tx) => Effect.gen(function* () {
        yield* checkSelection(tx, supplied, acquired.resolution)
        yield* identity(binding, value.provider, materialization)
        return yield* Effect.forEach(page, (item) => Effect.gen(function* () {
          // Final permit covers every disclosed operation; commit reassesses under actor/SQL gate.
          if (item.validator instanceof Capability.Failure) return {
            name: item.tool.name, summary: item.tool.summary, readiness: "unsupported" as const,
            coverage: { input: "unsupported" as const, output: "unsupported" as const },
          }
          const time = now()
          Array.from(locators).forEach(([id, value]) => { if (value.expiresAt <= time) locators.delete(id) })
          if (locators.size >= maxEntries) return yield* failure("quota_exceeded")
          const record = yield* descriptors.issue({
            owner: binding.owner, ...acquired.canonical,
            connectionID: scope.connectionID, targetID: scope.targetID,
            connectionGeneration: scope.connectionGeneration, targetGeneration: scope.targetGeneration,
            catalogGeneration: scope.catalogGeneration, schemaHash: item.validator.schemaHash,
            inputSchema: item.validator.inputSchema, outputSchema: item.validator.outputSchema, operationID: item.tool.name,
          })
          locators.set(record.ref.id, { provider: value.provider, name: item.tool.name, expiresAt: record.expiresAt })
          return { name: item.tool.name, summary: item.tool.summary, readiness: "ready" as const,
            coverage: item.validator.coverage, ref: record.ref }
        }))
      })).pipe(Effect.catchTag("SqlError", () => Effect.fail(failure("connection_unavailable"))))
      const cursor = offset + page.length < permitted.length ? yield* cursors.issue(scope, offset + page.length) : undefined
      return { operations, coverage: acquired.catalog.coverage, catalogGeneration: acquired.catalog.catalogGeneration,
        ...(cursor === undefined ? {} : { cursor }) }
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
      yield* policy.assert(supplied, { action: disclosureAction, resources: [value.connectionID, value.targetID] })
      const locator = locators.get(value.id)
      if (!locator || locator.expiresAt <= now()) return yield* failure("stale_descriptor")
      yield* policy.assert(supplied, { action: disclosureAction, resources: [operationResource(locator.provider, locator.name)] })
      const acquired = yield* acquire(supplied, { provider: locator.provider, connectionID: value.connectionID,
        targetID: value.targetID }, materialization)
      const tool = acquired.catalog.tools.find((tool) => tool.name === locator.name)
      if (!tool) return yield* failure("stale_descriptor")
      const validator = yield* compile(tool)
      if (validator instanceof Capability.Failure) return yield* validator
      const permit = yield* policy.authorize(supplied, { action: disclosureAction,
        resources: [...resources({ provider: locator.provider, connectionID: value.connectionID, targetID: value.targetID }),
          operationResource(locator.provider, locator.name)],
      })
      return yield* policy.commit(permit, (tx) => Effect.gen(function* () {
        yield* checkSelection(tx, supplied, acquired.resolution)
        yield* identity(binding, locator.provider, materialization)
        const record = yield* descriptors.read(value, {
          owner: binding.owner, connectionGeneration: acquired.resolution.connection.generation,
          targetGeneration: acquired.resolution.target.generation, canonicalIdentity: acquired.canonical.canonicalIdentity,
          catalogGeneration: acquired.catalog.catalogGeneration, schemaHash: validator.schemaHash,
        })
        return { ref: record.ref, name: record.operationID, summary: tool.summary, readiness: "ready" as const,
          coverage: validator.coverage, inputSchema: record.inputSchema,
          ...(record.outputSchema === undefined ? {} : { outputSchema: record.outputSchema }) }
      })).pipe(Effect.catchTag("SqlError", () => Effect.fail(failure("connection_unavailable"))))
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

function boundedList(list: VendorList, maxTools: number, maxBytes: number): VendorList | Capability.Failure {
  if (!list || !Array.isArray(list.tools) || list.tools.length > maxTools ||
    !Number.isSafeInteger(list.catalogGeneration) || list.catalogGeneration < 0 ||
    (list.coverage !== "complete" && list.coverage !== "partial")) return failure("acquisition_failed")
  const names = new Set<string>()
  const budget = { bytes: 0 }
  const tools = list.tools.map((tool): VendorTool | Capability.Failure => {
    if (!tool || typeof tool.name !== "string" || !tool.name.trim() || tool.name.length > 256 || names.has(tool.name) ||
      typeof tool.summary !== "string" || tool.summary.length > 2048) return failure("acquisition_failed")
    names.add(tool.name)
    const inputSchema = CapabilityVendorSchema.snapshot(tool.inputSchema)
    const outputSchema = tool.outputSchema === undefined ? undefined : CapabilityVendorSchema.snapshot(tool.outputSchema)
    if (inputSchema instanceof Capability.Failure || outputSchema instanceof Capability.Failure) return failure("unsupported_schema")
    const value = { name: tool.name, summary: tool.summary, inputSchema,
      ...(outputSchema === undefined ? {} : { outputSchema }) }
    budget.bytes += Buffer.byteLength(JSON.stringify(value))
    return budget.bytes > maxBytes ? failure("quota_exceeded") : Object.freeze(value)
  })
  const error = tools.find((tool) => tool instanceof Capability.Failure)
  if (error instanceof Capability.Failure) return error
  return { tools: tools.filter((tool): tool is VendorTool => !(tool instanceof Capability.Failure)),
    catalogGeneration: list.catalogGeneration, coverage: list.coverage }
}

// Recheck authoritative selection in the disclosure commit, closing retarget/binding races after transport.
function checkSelection(tx: Transaction, context: Tool.Context, resolution: CapabilityConnections.Resolution) {
  return Effect.gen(function* () {
    const connection = yield* tx.select().from(CapabilityConnectionTable)
      .where(eq(CapabilityConnectionTable.id, resolution.connection.id)).get()
    const target = yield* tx.select().from(CapabilityTargetTable).where(eq(CapabilityTargetTable.id, resolution.target.id)).get()
    const binding = yield* tx.select().from(CapabilityBindingTable).where(and(
      eq(CapabilityBindingTable.target_id, resolution.target.id), eq(CapabilityBindingTable.session_id, context.sessionID),
      eq(CapabilityBindingTable.agent_id, context.agent),
    )).get()
    if (!connection || !target || connection.state !== "active" || connection.generation !== resolution.connection.generation ||
      target.generation !== resolution.target.generation || target.connection_id !== connection.id ||
      connection.credential_id !== resolution.credentialID || connection.endpoint !== resolution.endpoint ||
      target.environment !== resolution.target.environment || !binding ||
      (!binding.actions.includes(disclosureAction) && !binding.actions.includes("*"))) return yield* failure("stale_descriptor")
  }).pipe(Effect.mapError((error) => error instanceof Capability.Failure ? error : failure("connection_unavailable")))
}

function failure(code: Capability.ErrorCode) {
  return new Capability.Failure({ code, message: "Capability discovery unavailable" })
}
