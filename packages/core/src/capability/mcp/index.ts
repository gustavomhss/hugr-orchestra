export * as CapabilityMcp from "./index"

import { Capability } from "@orchestra/schema/capability"
import { Credential } from "@orchestra/schema/credential"
import { Effect, Exit, Option, Schema, Scope, Semaphore } from "effect"
import type { CapabilityDiscovery } from "../catalog/discovery"
import { CapabilityVendorSchema } from "../catalog/schema"
import { close, request } from "./http"
import type { Budget, Connection } from "./http"
import { callResult, expected, failure, initialize, object, page } from "./protocol"
import type { CallResult } from "./protocol"

export type { CallResult } from "./protocol"
export type Session = Readonly<{
  listTools: Effect.Effect<CapabilityDiscovery.VendorList, Capability.Failure>
  callTool: (name: string, input: Schema.Json) => Effect.Effect<CallResult, Capability.Failure>
}>
export type Options = Readonly<{
  /** Trusted host test hook. Only an exact localhost HTTP origin is accepted. */
  fixtureOrigin?: string
  maxCatalogBytes?: number
  maxTools?: number
  maxPages?: number
  maxResultBytes?: number
  requestBytes?: number
  timeoutMs?: number
  maxConcurrentSessions?: number
  maxGenerations?: number
  maxMessages?: number
}>
export type Interface = Readonly<{
  listTools: (selection: CapabilityDiscovery.Selection) => Effect.Effect<CapabilityDiscovery.VendorList, Capability.Failure>
  open: (selection: CapabilityDiscovery.Selection) => Effect.Effect<Session, Capability.Failure, Scope.Scope>
}>

// Data transcribed from capability-assets/src/providers.ts at baseline 2a971d2a.
// Core has no dependency on Assets. Paths/queries come only from the approved host Selection.
const hosts: Readonly<Record<string, string>> = {
  cloudflare: "mcp.cloudflare.com", supabase: "mcp.supabase.com", vercel: "mcp.vercel.com", neon: "mcp.neon.tech",
  railway: "mcp.railway.com", sentry: "mcp.sentry.dev", grafana: "mcp.grafana.com", globalping: "mcp.globalping.dev",
  linear: "mcp.linear.app", stripe: "mcp.stripe.com", netlify: "netlify-mcp.netlify.app",
  prisma_postgres: "mcp.prisma.io", "prisma-postgres": "mcp.prisma.io",
}
const Selection = Schema.Struct({
  connection: Capability.ConnectionRef, target: Capability.TargetRef, owner: Capability.Owner,
  endpoint: Schema.NonEmptyString, credentialID: Credential.ID, credential: Credential.Value,
})

/** Host-only factory: policy, schema validation and durable call intent belong to the caller. */
export function make(options: Options = {}): Interface {
  const fixture = options.fixtureOrigin
  const limits = {
    maxCatalogBytes: options.maxCatalogBytes ?? 4 * 1024 * 1024, maxTools: options.maxTools ?? 256,
    maxPages: options.maxPages ?? 16, maxResultBytes: options.maxResultBytes ?? 4 * 1024 * 1024,
    requestBytes: options.requestBytes ?? 256 * 1024, timeoutMs: options.timeoutMs ?? 30000,
    maxConcurrentSessions: options.maxConcurrentSessions ?? 4, maxGenerations: options.maxGenerations ?? 512,
    maxMessages: options.maxMessages ?? 64,
  }
  if (Object.values(limits).some((value) => !Number.isSafeInteger(value) || value <= 0) || limits.timeoutMs > 2147483647 ||
    !fixtureOrigin(fixture))
    throw new RangeError("Invalid MCP transport options")
  const permits = Semaphore.makeUnsafe(limits.maxConcurrentSessions)
  const generations = new Map<string, { hash: string; generation: number }>()
  const sequence = { generation: 0 }
  const generation = (key: string, raw: Schema.Json[]) => {
    const hash = CapabilityVendorSchema.hash(raw.sort((left, right) => {
      // page() validated every tool name before generation calculation.
      if (!object(left) || !object(right)) throw failure("acquisition_failed", "tool entry")
      return String(left.name) < String(right.name) ? -1 : String(left.name) > String(right.name) ? 1 : 0
    }))
    const previous = generations.get(key)
    if (previous?.hash === hash) return previous.generation
    // Never evict an identity and accidentally reuse its old generation.
    if ((!previous && generations.size >= limits.maxGenerations) || sequence.generation === Number.MAX_SAFE_INTEGER)
      throw failure("quota_exceeded", "generation capacity")
    sequence.generation++
    generations.set(key, { hash, generation: sequence.generation })
    return sequence.generation
  }
  const connect = Effect.fnUntraced(function* (selection: CapabilityDiscovery.Selection) {
    const started = Date.now()
    const selected = yield* Effect.try({ try: () => requireSelection(selection, fixture), catch: expected })
    yield* Effect.uninterruptibleMask((restore) => Effect.gen(function* () {
      yield* restore(permits.take(1).pipe(Effect.timeoutOrElse({ duration: limits.timeoutMs,
        orElse: () => Effect.fail(failure("acquisition_failed", "timeout")) })))
      yield* Effect.addFinalizer(() => permits.release(1))
    }))
    const connection: Connection = { endpoint: selected.endpoint, authorization: selected.authorization, closed: false, dead: false,
      lifetime: new AbortController(), ...(selected.credential.type === "oauth" ? { expiresAt: selected.credential.expires } : {}) }
    yield* Effect.acquireRelease(Effect.succeed(connection), (connection) => close(connection, limits, limits.timeoutMs))
    const initial: Budget = { bytes: 0, limit: limits.maxCatalogBytes, messages: 0 }
    const counter = { id: 0, firstList: true }
    const serial = Semaphore.makeUnsafe(1)
    const rpc = (method: string, params: Schema.Json, budget: Budget) => Effect.suspend(() => {
      if (counter.id === Number.MAX_SAFE_INTEGER) return Effect.fail(failure("quota_exceeded", "request IDs"))
      counter.id++
      return request(connection, { jsonrpc: "2.0", id: counter.id, method, params }, counter.id, budget, limits)
    })
    const bounded = <A>(effect: Effect.Effect<A, Capability.Failure>, start: number, mutating = false) =>
      effect.pipe(Effect.timeoutOrElse({ duration: Math.max(1, limits.timeoutMs - (Date.now() - start)),
        orElse: () => Effect.fail(failure(mutating ? "outcome_unknown" : "acquisition_failed", "timeout")) }),
        Effect.onExit((exit) => Exit.isFailure(exit) ? Effect.sync(() => { connection.dead = true }) : Effect.void))
    yield* bounded(Effect.gen(function* () {
      const result = yield* rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {},
        clientInfo: { name: "orchestra-capability", version: "1" } }, initial)
      connection.version = yield* Effect.try({ try: () => initialize(result), catch: expected })
      yield* request(connection, { jsonrpc: "2.0", method: "notifications/initialized" }, undefined, initial, limits)
    }), started)
    const listTools = Effect.suspend(() => {
      const start = counter.firstList ? started : Date.now()
      counter.firstList = false
      return bounded(serial.withPermit(Effect.gen(function* () {
        yield* Effect.try({ try: () => credential(selected.credential), catch: expected })
        const budget: Budget = { ...initial }
        const tools: CapabilityDiscovery.VendorTool[] = []
        const raw: Schema.Json[] = []
        const names = new Set<string>()
        const cursors = new Set<string>()
        const position: { cursor?: string; pages: number } = { pages: 0 }
        while (true) {
          if (++position.pages > limits.maxPages) return yield* failure("quota_exceeded", "pages")
          const result = yield* rpc("tools/list", position.cursor === undefined ? {} : { cursor: position.cursor }, budget)
          const listed = yield* Effect.try({ try: () => page(result), catch: expected })
          if (tools.length + listed.tools.length > limits.maxTools) return yield* failure("quota_exceeded", "tools")
          for (const tool of listed.tools) {
            if (names.has(tool.name)) return yield* failure("acquisition_failed", "duplicate tool")
            names.add(tool.name)
            tools.push(tool)
          }
          raw.push(...listed.raw)
          if (listed.nextCursor === undefined) break
          if (cursors.has(listed.nextCursor)) return yield* failure("acquisition_failed", "cursor cycle")
          cursors.add(listed.nextCursor)
          position.cursor = listed.nextCursor
        }
        const catalogGeneration = yield* Effect.try({ try: () => generation(selected.key, raw), catch: expected })
        return { tools, catalogGeneration, coverage: "complete" as const, byteLength: budget.bytes }
      })), start)
    })
    const callTool = Effect.fn("CapabilityMcp.callTool")(function* (name: string, input: Schema.Json) {
      const start = Date.now()
      return yield* bounded(serial.withPermit(Effect.gen(function* () {
        yield* Effect.try({ try: () => credential(selected.credential), catch: expected })
        if (typeof name !== "string" || !name.trim() || name.length > 256 || !object(input))
          return yield* failure("unsupported_operation", "call arguments")
        const result = yield* rpc("tools/call", { name, arguments: input }, { bytes: 0, limit: limits.maxResultBytes, messages: 0 })
        return yield* Effect.try({ try: () => callResult(result), catch: expected })
      })), start, true)
    })
    return { listTools, callTool } satisfies Session
  })
  const open = Effect.fn("CapabilityMcp.open")(function* (selection: CapabilityDiscovery.Selection) {
    const scope = yield* Effect.acquireRelease(Scope.make(), (scope, exit) => Scope.close(scope, exit))
    // Failed acquisition releases its partial session and permit immediately, even in a long-lived caller scope.
    return yield* connect(selection).pipe(Effect.provideService(Scope.Scope, scope),
      Effect.onExit((exit) => Exit.isFailure(exit) ? Scope.close(scope, exit) : Effect.void))
  })
  return { open, listTools: (selection) => Effect.scoped(Effect.gen(function* () {
    const session = yield* open(selection)
    return yield* session.listTools
  })) }
}

function fixtureOrigin(value: string | undefined) {
  if (value === undefined) return true
  if (!URL.canParse(value)) return false
  const url = new URL(value)
  return url.origin === value && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
}

function requireSelection(selection: CapabilityDiscovery.Selection, fixture: string | undefined) {
  const decoded = Schema.decodeUnknownOption(Selection)(selection)
  if (Option.isNone(decoded)) throw failure("target_denied", "selection")
  const value = decoded.value
  const host = Object.hasOwn(hosts, value.connection.provider) ? hosts[value.connection.provider] : undefined
  if (!host) throw failure("unsupported_operation", "provider")
  if (value.target.connectionID !== value.connection.id || !/^[\x21-\x7e]+(?![\s\S])/.test(value.endpoint) ||
    value.endpoint.includes("#") || !value.endpoint.startsWith("https://") || !URL.canParse(value.endpoint))
    throw failure("target_denied", "endpoint")
  const endpoint = new URL(value.endpoint)
  const authority = value.endpoint.slice(8).split(/[/?]/)[0]
  if (endpoint.protocol !== "https:" || endpoint.host !== host || endpoint.username || endpoint.password || endpoint.hash ||
    !authority || authority.includes("@") || value.endpoint.includes("\\")) throw failure("target_denied", "endpoint")
  const captured = { ...value.credential }
  const authorization = credential(captured)
  const key = CapabilityVendorSchema.hash({ connection: value.connection, target: value.target, endpoint: endpoint.href, owner: value.owner })
  if (fixture) {
    const origin = new URL(fixture)
    endpoint.protocol = origin.protocol
    endpoint.host = origin.host
  }
  return { endpoint: endpoint.href, authorization, credential: captured, key }
}

function credential(value: Credential.Value) {
  if (value.type === "oauth" && (!Number.isSafeInteger(value.expires) || value.expires <= Date.now()))
    throw failure("authentication_required", "credential expiry")
  const token = value.type === "key" ? value.key : value.access
  if (!token || token !== token.trim() || !/^[\x21-\x7e]+(?![\s\S])/.test(token) || token.length > 16384)
    throw failure("authentication_required", "credential header")
  return `Bearer ${token}`
}
