import { describe, expect } from "bun:test"
import path from "node:path"
import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityDiscovery } from "@orchestra/core/capability/catalog/discovery"
import { CapabilityDescriptors } from "@orchestra/core/capability/catalog/descriptors"
import { CapabilityVendorSchema } from "@orchestra/core/capability/catalog/schema"
import { CapabilityConnections } from "@orchestra/core/capability/connection/index"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { Credential } from "@orchestra/core/credential"
import { Database } from "@orchestra/core/database/database"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionMessage } from "@orchestra/core/session/message"
import { Tool } from "@orchestra/core/tool/tool"
import { Capability } from "@orchestra/schema/capability"
import { Model } from "@orchestra/schema/model"
import { Provider } from "@orchestra/schema/provider"
import { sql } from "drizzle-orm"
import { Cause, Deferred, Effect, Exit, Fiber, Ref, Schema, Scope, Tracer } from "effect"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { it, allow, request, leaf, tools, fixture, expectCode, ref, cursor, publicationFixture, readScope } from "./fixture/capability-discovery"

describe("CapabilityDiscovery host metadata backbone", () => {
  it.live("forged refs and cross-owner descriptors/cursors fail with zero credential and source acquisition", () => Effect.gen(function* () {
    const f = yield* fixture()
    const reads = { credentials: 0 }
    const tracer = Tracer.make({ span: (options) => {
      if (options.name === "Credential.get") reads.credentials++
      return new Tracer.NativeSpan(options)
    } })
    const first = yield* f.find().pipe(Effect.withTracer(tracer))
    expect(reads.credentials).toBeGreaterThan(0)
    expect(yield* Ref.get(f.calls)).toHaveLength(1)
    reads.credentials = 0
    const issued = ref(first)
    const forged = [
      { ...issued, id: Capability.DescriptorID.create() }, { ...issued, schemaHash: "b".repeat(64) },
      { ...issued, catalogGeneration: issued.catalogGeneration + 1 },
      { ...issued, connectionID: Capability.ConnectionID.create() }, { ...issued, targetID: Capability.TargetID.create() },
      { ...issued, schemaHash: "invalid" }, { ...issued, unexpected: true },
    ]
    yield* Effect.forEach(forged, (value) => expectCode(f.describe(value).pipe(Effect.withTracer(tracer)), "stale_descriptor"))
    const next = { ...request, cursor: cursor(first) }
    yield* Effect.forEach([
      { ...next, cursor: next.cursor + "x" }, { ...next, query: "changed" }, { ...next, provider: "other" },
      { ...next, limit: 2 }, { ...next, connectionID: f.connection.id }, { ...next, targetID: f.target.id },
    ], (value) => expectCode(f.find(value).pipe(Effect.withTracer(tracer)), "stale_descriptor"))
    const other = yield* CapabilityPolicyFixture.fixture()
    yield* CapabilityPolicyFixture.setRules(allow)
    const owner = { ...other.binding, effectiveRules: allow }
    yield* expectCode(CapabilityInvocation.withContext(owner,
      f.discovery.find(other.context, next, f.materialization)).pipe(Effect.withTracer(tracer)), "stale_descriptor")
    yield* expectCode(CapabilityInvocation.withContext(owner,
      f.discovery.describe(other.context, issued, f.materialization)).pipe(Effect.withTracer(tracer)), "stale_descriptor")
    const actor = AgentV2.ID.make("cross_actor")
    yield* CapabilityPolicyFixture.setRules(allow, actor)
    const context = { ...f.context, agent: actor, assistantMessageID: SessionMessage.ID.create() }
    yield* f.events.publish(SessionEvent.Step.Started, { ...context, timestamp: CapabilityPolicyFixture.timestamp,
      model: { id: Model.ID.make("model"), providerID: Provider.ID.make("provider") } })
    yield* f.events.publish(SessionEvent.Tool.Input.Started, { sessionID: context.sessionID,
      assistantMessageID: context.assistantMessageID, callID: context.toolCallID, name: "service_call", timestamp: CapabilityPolicyFixture.timestamp })
    const host = { ...f.binding, owner: { ...f.binding.owner, agentID: actor },
      invocation: { ...f.binding.invocation, agentID: actor, assistantMessageID: context.assistantMessageID } }
    yield* expectCode(CapabilityInvocation.withContext(host,
      f.discovery.find(context, next, f.materialization)).pipe(Effect.withTracer(tracer)), "stale_descriptor")
    yield* expectCode(CapabilityInvocation.withContext(host,
      f.discovery.describe(context, issued, f.materialization)).pipe(Effect.withTracer(tracer)), "stale_descriptor")
    f.clock.time += 100
    yield* expectCode(f.find(next).pipe(Effect.withTracer(tracer)), "stale_descriptor")
    yield* expectCode(f.describe(issued).pipe(Effect.withTracer(tracer)), "stale_descriptor")
    expect(reads.credentials).toBe(0)
    expect(yield* Ref.get(f.calls)).toHaveLength(1)
  }))

  it.live("ordered visibility and captured/current policy bind cursors before old offsets can skip or return false complete", () => Effect.gen(function* () {
    const f = yield* fixture()
    yield* Ref.set(f.list, { tools: tools.slice(0, 2), catalogGeneration: 1, coverage: "complete" })
    const first = yield* f.find()
    const next = { ...request, cursor: cursor(first) }
    const denyA = [...allow, { action: CapabilityDiscovery.disclosureAction, resource: "example:list_projects", effect: "deny" as const }]
    yield* CapabilityPolicyFixture.setRules(denyA)
    yield* expectCode(f.find(next), "stale_descriptor")
    const restart = yield* f.find()
    expect(restart.operations.map((operation) => operation.name)).toEqual(["get_project"])
    expect(restart.cursor).toBeUndefined()
    expect(restart.coverage).toBe("complete")
    yield* CapabilityPolicyFixture.setRules(allow)
    yield* expectCode(CapabilityInvocation.withContext({ ...f.binding, effectiveRules: denyA },
      f.discovery.find(f.context, next, f.materialization)), "stale_descriptor")
    yield* expectCode(CapabilityInvocation.withContext({ ...f.binding, nativeDenyFloor: denyA },
      f.discovery.find(f.context, next, f.materialization)), "stale_descriptor")
    yield* CapabilityPolicyFixture.setRules([...allow,
      { action: CapabilityDiscovery.disclosureAction, resource: "example:get_project", effect: "ask" },
    ])
    const observation = yield* CapabilityPolicyFixture.observeAsked(f.context)
    const pending = yield* f.find(next).pipe(Effect.result, Effect.forkChild)
    const asked = yield* Deferred.await(observation.first)
    expect(asked.resources).toContain("example:get_project")
    yield* f.permissions.reply({ requestID: asked.id, reply: "once" })
    const result = yield* Fiber.join(pending)
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.failure).toBeInstanceOf(Capability.Failure)
      if (!(result.failure instanceof Capability.Failure)) return yield* Effect.die(result.failure)
      expect(result.failure.code).toBe("stale_descriptor")
    }
  }).pipe(Effect.timeout("15 seconds")))

  it.live("denied malformed/deep/oversize schemas cannot fail permitted pages or alter visible catalog hashes", () => Effect.gen(function* () {
    const f = yield* fixture()
    yield* CapabilityPolicyFixture.setRules([...allow,
      { action: CapabilityDiscovery.disclosureAction, resource: "example:hidden", effect: "deny" },
    ])
    const hidden = { name: "hidden", summary: "Hidden schema", inputSchema: 17 }
    yield* Ref.set(f.list, { tools: [hidden, ...tools.slice(1)], catalogGeneration: 1, coverage: "complete" })
    const first = yield* f.find()
    expect(first.operations.map((operation) => operation.name)).toEqual(["get_project"])
    yield* Effect.forEach([
      { description: "x".repeat(CapabilityVendorSchema.bounds.maxBytes + 1) },
      { enum: Array.from({ length: 5000 }, (_, n) => n) },
      Array.from({ length: 70 }).reduce<Schema.Json>((child) => ({ allOf: [child] }), true),
    ], (inputSchema) => Effect.gen(function* () {
      yield* Ref.set(f.list, { tools: [{ ...hidden, inputSchema }, ...tools.slice(1)], catalogGeneration: 1, coverage: "complete" })
      const next = yield* f.find({ ...request, cursor: cursor(first) })
      expect(next.operations.map((operation) => operation.name)).toEqual(["create_project"])
      expect(next.operations[0]?.readiness).toBe("ready")
    }))
    yield* CapabilityPolicyFixture.setRules(allow)
    yield* expectCode(f.find({ ...request, query: "hidden" }), "unsupported_schema")
    yield* Ref.set(f.list, { tools: [hidden], catalogGeneration: 1, coverage: "complete" })
    expect((yield* f.find()).operations[0]?.readiness).toBe("unsupported")
    const bounded = yield* CapabilityDiscovery.make({ source: f.source, maxCatalogBytes: 200 })
    yield* Ref.set(f.list, { tools: [{ ...hidden, inputSchema: { description: "x".repeat(1000) } }], catalogGeneration: 1, coverage: "complete" })
    yield* expectCode(f.run(bounded.find(f.context, request, f.materialization)), "quota_exceeded")
  }))

  it.live("page local capacity check precedes issuance and preserves remaining descriptor capacity", () => Effect.gen(function* () {
    const f = yield* fixture({ maxEntries: 2 })
    const sameSchema = tools.map((tool) => ({ name: tool.name, summary: tool.summary, inputSchema: true }))
    yield* Ref.set(f.list, { tools: sameSchema, catalogGeneration: 1, coverage: "complete" })
    const first = yield* f.find()
    yield* expectCode(f.find({ ...request, limit: 2 }), "quota_exceeded")
    const second = yield* f.find({ ...request, cursor: cursor(first) })
    expect(second.operations[0]?.name).toBe("get_project")
    expect((yield* f.describe(ref(first))).name).toBe("list_projects")
    expect((yield* f.describe(ref(second))).name).toBe("get_project")
  }))

  it.live("asynchronous descriptor read replacement cannot return stale schema metadata", () => Effect.gen(function* () {
    const f = yield* fixture()
    const scope = yield* Scope.Scope
    const store = yield* CapabilityDescriptors.make({ maxEntries: 4, ttlMillis: 100, now: () => f.clock.time })
    const injected: CapabilityDescriptors.Store = { ...store, read: (ref, owner) => store.read(ref, owner).pipe(
      Effect.tap(() => f.registry.register({ platform_example: leaf() }).pipe(
        Effect.orDie, Effect.provideService(Scope.Scope, scope), Effect.andThen(Effect.yieldNow))),
    ) }
    const discovery = yield* CapabilityDiscovery.make({ source: f.source, descriptors: injected, now: () => f.clock.time, ttlMillis: 100 })
    const first = yield* f.run(discovery.find(f.context, request, f.materialization))
    yield* expectCode(f.run(discovery.describe(f.context, ref(first), f.materialization)), "stale_descriptor")
    const fresh = yield* f.registry.materialize(allow)
    expect(fresh.definition("platform_example")).toEqual(f.materialization.definition("platform_example"))
    expect(fresh.registrationIdentity("platform_example")).not.toBe(f.materialization.registrationIdentity("platform_example"))
  }))

  it.live("shared-store batch quota publishes no phantom refs and preserves unrelated capacity", () => Effect.gen(function* () {
    const f = yield* publicationFixture({ maxEntries: 8, storeEntries: 2 })
    yield* Ref.set(f.list, { tools: tools.map((tool) => ({ name: tool.name, summary: tool.summary, inputSchema: true })),
      catalogGeneration: 1, coverage: "complete" })
    const unrelated = yield* f.real.issue(f.input)
    yield* expectCode(f.find(), "quota_exceeded")
    expect(yield* Ref.get(f.batches)).toBe(1)
    expect(yield* Ref.get(f.issued)).toEqual([])
    expect(yield* Ref.get(f.removed)).toEqual([])
    expect(yield* f.real.read(unrelated.ref, readScope(unrelated))).toBe(unrelated)
    const next = yield* f.find({ ...request, query: "get_project" })
    expect(next.operations[0]?.name).toBe("get_project")
    expect((yield* Ref.get(f.issued)).map((record) => record.ref)).toEqual([ref(next)])
    expect(yield* f.real.read(unrelated.ref, readScope(unrelated))).toBe(unrelated)
  }))

  it.live("cursor quota rejects before Store admission and retains previously published refs", () => Effect.gen(function* () {
    const f = yield* publicationFixture({ maxEntries: 2 })
    yield* Ref.set(f.list, { tools: tools.map((tool) => ({ name: tool.name, summary: tool.summary, inputSchema: true })),
      catalogGeneration: 1, coverage: "complete" })
    const first = yield* f.find(request)
    const second = yield* f.find(request)
    yield* expectCode(f.find(request), "quota_exceeded")
    expect(yield* Ref.get(f.batches)).toBe(2)
    const records = yield* Ref.get(f.issued)
    expect(records.map((record) => record.ref)).toEqual([ref(first), ref(second)])
    yield* Effect.forEach(records, (record) => f.real.read(record.ref, readScope(record)).pipe(Effect.map((saved) => {
      expect(saved).toBe(record)
    })))
    expect(yield* Ref.get(f.removed)).toEqual([])
  }))

  it.live("asynchronous batch registration replacement removes every unreturned ref and permits fresh retry", () => Effect.gen(function* () {
    const f = yield* publicationFixture({ maxEntries: 3, storeEntries: 3 })
    const scope = yield* Scope.Scope
    const unrelated = yield* f.real.issue(f.input)
    yield* Ref.set(f.afterBatch, Effect.yieldNow.pipe(Effect.andThen(f.registry.register({ platform_example: leaf() })),
      Effect.orDie, Effect.provideService(Scope.Scope, scope)))
    yield* expectCode(f.find(), "stale_descriptor")
    const issued = yield* Ref.get(f.issued)
    expect(issued).toHaveLength(2)
    expect(yield* Ref.get(f.removed)).toEqual(issued.map((record) => record.ref))
    yield* Effect.forEach(issued, (record) => expectCode(f.real.read(record.ref, readScope(record)), "stale_descriptor"))
    expect(yield* f.real.read(unrelated.ref, readScope(unrelated))).toBe(unrelated)
    yield* Ref.set(f.afterBatch, Effect.void)
    const fresh = yield* f.registry.materialize(allow)
    const retry = yield* f.find({ ...request, limit: 2 }, fresh)
    expect(retry.operations.map((operation) => operation.name)).toEqual(["list_projects", "get_project"])
    const returned = (yield* Ref.get(f.issued)).slice(2)
    expect(returned.map((record) => record.ref)).toEqual(retry.operations.flatMap((operation) => operation.ref ? [operation.ref] : []))
    yield* Effect.forEach(returned, (record) => f.real.read(record.ref, readScope(record)).pipe(Effect.map((saved) => {
      expect(saved).toBe(record)
    })))
  }))

  it.live("interruption after batch admission waits for tuple capture then reclaims refs and cursor", () => Effect.gen(function* () {
    const f = yield* publicationFixture({ maxEntries: 2, storeEntries: 2 })
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    yield* Ref.set(f.afterBatch, Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release))))
    const pending = yield* f.find().pipe(Effect.forkChild)
    yield* Deferred.await(entered)
    const issued = yield* Ref.get(f.issued)
    expect(issued).toHaveLength(2)
    pending.interruptUnsafe()
    yield* Deferred.succeed(release, undefined)
    const exit = yield* Fiber.await(pending)
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") expect(Cause.hasInterrupts(exit.cause)).toBe(true)
    expect(yield* Ref.get(f.removed)).toEqual(issued.map((record) => record.ref))
    yield* Effect.forEach(issued, (record) => expectCode(f.real.read(record.ref, readScope(record)), "stale_descriptor"))
    yield* Ref.set(f.afterBatch, Effect.void)
    expect((yield* f.find()).operations).toHaveLength(2)
  }).pipe(Effect.timeout("15 seconds")))

  it.live("SQLite COMMIT failure reclaims admitted metadata and keeps retry capacity", () => Effect.gen(function* () {
    const f = yield* publicationFixture({ maxEntries: 2, storeEntries: 2 })
    yield* f.database.db.run(sql`CREATE TABLE discovery_commit_probe (
      session_id TEXT REFERENCES session(id) DEFERRABLE INITIALLY DEFERRED
    )`).pipe(Effect.orDie)
    yield* Ref.set(f.afterBatch, f.database.db.run(sql`INSERT INTO discovery_commit_probe VALUES ('missing-session')`).pipe(Effect.orDie))
    yield* expectCode(f.find(), "connection_unavailable")
    const issued = yield* Ref.get(f.issued)
    expect(issued).toHaveLength(2)
    expect(yield* Ref.get(f.removed)).toEqual(issued.map((record) => record.ref))
    yield* Effect.forEach(issued, (record) => expectCode(f.real.read(record.ref, readScope(record)), "stale_descriptor"))
    // Real Drizzle transaction rolls back SQLite's failed deferred-constraint COMMIT.
    expect(yield* f.database.db.all(sql`SELECT COUNT(*) AS n FROM discovery_commit_probe`).pipe(Effect.orDie)).toEqual([{ n: 0 }])
    yield* Ref.set(f.afterBatch, Effect.void)
    expect((yield* f.find()).operations).toHaveLength(2)
  }))

  it.live("registration replacement at actual SQLite COMMIT return is checked outside transaction", () => Effect.gen(function* () {
    const f = yield* publicationFixture({ maxEntries: 2, storeEntries: 2 })
    const scope = yield* Scope.Scope
    const state = { armed: false, replaced: false }
    yield* Ref.set(f.afterBatch, Effect.sync(() => { state.armed = true }))
    // Trace-only adapter around the real transaction; queries and COMMIT/rollback remain unchanged.
    const transaction: typeof f.database.db.transaction = (use, options) =>
      f.database.db.transaction(use, options).pipe(Effect.withSpan("publication.transaction"))
    const db = new Proxy(f.database.db, { get: (target, key) =>
      key === "transaction" ? transaction : Reflect.get(target, key, target) })
    const discovery = yield* CapabilityDiscovery.make({ source: f.source, descriptors: f.store,
      maxEntries: 2, now: () => f.clock.time, ttlMillis: 100 }).pipe(
      Effect.provideService(Database.Service, { ...f.database, db }),
    )
    const tracer = Tracer.make({ span: (options) => new class extends Tracer.NativeSpan {
      override end(time: bigint, exit: Exit.Exit<unknown, unknown>) {
        super.end(time, exit)
        if (this.name !== "publication.transaction" || !state.armed || !Exit.isSuccess(exit)) return
        state.armed = false
        // Runs the real synchronous registration path exactly when the real COMMIT span ends.
        Effect.runSync(f.registry.register({ platform_example: leaf() }).pipe(Effect.provideService(Scope.Scope, scope)))
        state.replaced = true
      }
    }(options) })
    yield* expectCode(f.run(discovery.find(f.context, { ...request, limit: 2 }, f.materialization)).pipe(
      Effect.withTracer(tracer)), "stale_descriptor")
    expect(state.replaced).toBe(true)
    const issued = yield* Ref.get(f.issued)
    expect(issued).toHaveLength(2)
    expect(yield* Ref.get(f.removed)).toEqual(issued.map((record) => record.ref))
    yield* Effect.forEach(issued, (record) => expectCode(f.real.read(record.ref, readScope(record)), "stale_descriptor"))
    yield* Ref.set(f.afterBatch, Effect.void)
    const fresh = yield* f.registry.materialize(allow)
    expect((yield* f.run(discovery.find(f.context, { ...request, limit: 2 }, fresh))).operations).toHaveLength(2)
  }))

  it.live("descriptor TTL expiring during asynchronous batch delivery prevents publication and reclaims refs", () => Effect.gen(function* () {
    const f = yield* publicationFixture({ maxEntries: 2, storeEntries: 2 })
    // Complete two-operation page has no cursor, so this exercises descriptor expiry itself.
    yield* Ref.set(f.list, { tools: tools.slice(0, 2), catalogGeneration: 1, coverage: "complete" })
    yield* Ref.set(f.afterBatch, Effect.yieldNow.pipe(Effect.andThen(Effect.sync(() => { f.clock.time += 100 }))))
    yield* expectCode(f.find(), "stale_descriptor")
    const issued = yield* Ref.get(f.issued)
    expect(issued).toHaveLength(2)
    expect(yield* Ref.get(f.removed)).toEqual(issued.map((record) => record.ref))
    yield* Ref.set(f.afterBatch, Effect.void)
    const retry = yield* f.find()
    expect(retry.operations).toHaveLength(2)
    expect(retry.cursor).toBeUndefined()
  }))

  it.live("describe validates persisted root before parsing or probing existing and guessed refs", () => Effect.gen(function* () {
    const f = yield* fixture()
    const reads = { credentials: 0 }
    const tracer = Tracer.make({ span: (options) => {
      if (options.name === "Credential.get") reads.credentials++
      return new Tracer.NativeSpan(options)
    } })
    const first = yield* f.find().pipe(Effect.withTracer(tracer))
    expect(reads.credentials).toBeGreaterThan(0)
    reads.credentials = 0
    const refs = [ref(first), { ...ref(first), id: Capability.DescriptorID.create() }, { ...ref(first), schemaHash: "malformed" }]
    yield* Effect.forEach([{ message: false }, { part: false }], (options) => Effect.gen(function* () {
      const missing = yield* CapabilityPolicyFixture.fixture(options)
      yield* CapabilityPolicyFixture.setRules(allow)
      yield* Effect.forEach(refs, (value) => expectCode(CapabilityInvocation.withContext({ ...missing.binding, effectiveRules: allow },
        f.discovery.describe(missing.context, value, f.materialization)).pipe(Effect.withTracer(tracer)), "invocation_binding_mismatch"))
    }))
    yield* f.events.publish(SessionEvent.Tool.Called, { sessionID: f.context.sessionID,
      assistantMessageID: f.context.assistantMessageID, callID: f.context.toolCallID, tool: "service_call",
      input: {}, provider: { executed: false }, timestamp: CapabilityPolicyFixture.timestamp })
    yield* f.events.publish(SessionEvent.Tool.Success, { sessionID: f.context.sessionID,
      assistantMessageID: f.context.assistantMessageID, callID: f.context.toolCallID,
      structured: {}, content: [], provider: { executed: false }, timestamp: CapabilityPolicyFixture.timestamp })
    yield* Effect.forEach(refs, (value) => expectCode(f.describe(value).pipe(Effect.withTracer(tracer)), "invocation_binding_mismatch"))
    expect(reads.credentials).toBe(0)
    expect(yield* Ref.get(f.calls)).toHaveLength(1)
    expect(yield* f.permissions.list()).toEqual([])
  }))

  it.live("declined operation ask stays absent while allowed pages and cursor continuation succeed", () => Effect.gen(function* () {
    const f = yield* fixture()
    yield* CapabilityPolicyFixture.setRules([...allow,
      { action: CapabilityDiscovery.disclosureAction, resource: "example:get_project", effect: "ask" },
    ])
    const observation = yield* CapabilityPolicyFixture.observeAsked(f.context)
    const first = yield* f.find().pipe(Effect.result, Effect.forkChild)
    const asked = yield* Deferred.await(observation.first)
    expect(asked.resources).toContain("example:get_project")
    yield* f.permissions.reply({ requestID: asked.id, reply: "reject" })
    const result = yield* Fiber.join(first)
    expect(result._tag).toBe("Success")
    if (result._tag !== "Success") return yield* result.failure
    expect(result.success.operations.map((operation) => operation.name)).toEqual(["list_projects"])
    const nextObservation = yield* CapabilityPolicyFixture.observeAsked(f.context)
    const next = yield* f.find({ ...request, cursor: cursor(result.success) }).pipe(Effect.result, Effect.forkChild)
    const nextAsked = yield* Deferred.await(nextObservation.first)
    yield* f.permissions.reply({ requestID: nextAsked.id, reply: "reject" })
    const continued = yield* Fiber.join(next)
    expect(continued._tag).toBe("Success")
    if (continued._tag !== "Success") return yield* continued.failure
    expect(continued.success.operations.map((operation) => operation.name)).toEqual(["create_project"])
    expect(continued.success.cursor).toBeUndefined()
    expect(continued.success.coverage).toBe("complete")
    expect(yield* Ref.get(observation.count)).toBe(2)
    expect(yield* f.permissions.list()).toEqual([])
  }).pipe(Effect.timeout("15 seconds")))

  it.live("revocation during later approval excludes malformed schema before gated schema consultation", () => Effect.gen(function* () {
    const f = yield* fixture()
    const consulted = { schemaReads: 0 }
    const first: CapabilityDiscovery.VendorTool = { name: "list_projects", summary: "Previously allowed",
      inputSchema: { enum: Array.from({ length: 5000 }, (_, n) => n) } }
    const malformed = first.inputSchema
    Object.defineProperty(first, "inputSchema", { enumerable: true, get: () => {
      consulted.schemaReads++
      return malformed
    } })
    yield* Ref.set(f.list, { tools: [first, tools[1]], catalogGeneration: 1, coverage: "complete" })
    yield* CapabilityPolicyFixture.setRules([...allow,
      { action: CapabilityDiscovery.disclosureAction, resource: "example:get_project", effect: "ask" },
    ])
    const observation = yield* CapabilityPolicyFixture.observeAsked(f.context)
    const pending = yield* f.find().pipe(Effect.result, Effect.forkChild)
    const asked = yield* Deferred.await(observation.first)
    expect(asked.resources).toContain("example:get_project")
    // Approved transport necessarily serialized its complete envelope; individual schema copying has not begun.
    expect(consulted.schemaReads).toBe(1)
    yield* CapabilityPolicyFixture.setRules([...allow,
      { action: CapabilityDiscovery.disclosureAction, resource: "example:list_projects", effect: "deny" },
      { action: CapabilityDiscovery.disclosureAction, resource: "example:get_project", effect: "ask" },
    ])
    yield* f.permissions.reply({ requestID: asked.id, reply: "once" })
    const result = yield* Fiber.join(pending)
    expect(result._tag).toBe("Success")
    if (result._tag !== "Success") return yield* result.failure
    expect(result.success.operations.map((operation) => operation.name)).toEqual(["get_project"])
    expect(result.success.operations[0]?.readiness).toBe("ready")
    expect(consulted.schemaReads).toBe(1)
    expect(yield* Ref.get(observation.count)).toBe(1)
    expect(yield* f.permissions.list()).toEqual([])
  }).pipe(Effect.timeout("15 seconds")))

  it.live("pending interruption at outer publication restoration removes returned-tuple refs, locators and cursor", () => Effect.forEach([2, 3], (count) => Effect.gen(function* () {
    const f = yield* publicationFixture({ maxEntries: 2, storeEntries: 2 })
    yield* Ref.set(f.list, { tools: tools.slice(0, count), catalogGeneration: 1, coverage: "complete" })
    const state: { fiber?: Fiber.Fiber<CapabilityDiscovery.Page, CapabilityConnections.Error>; injected: boolean } = { injected: false }
    // Inject interruption at final synchronous publication, after the real batch tuple has arrived.
    yield* Ref.set(f.afterBatch, Effect.sync(() => {
      Object.defineProperty(f.clock, "time", { configurable: true, get: () => {
        if (!state.injected) {
          state.injected = true
          state.fiber?.interruptUnsafe()
        }
        return 1000
      } })
    }))
    const pending = yield* f.find().pipe(Effect.forkChild)
    state.fiber = pending
    const exit = yield* Fiber.await(pending)
    expect(state.injected).toBe(true)
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") expect(Cause.hasInterrupts(exit.cause)).toBe(true)
    const issued = yield* Ref.get(f.issued)
    expect(issued).toHaveLength(2)
    expect(yield* Ref.get(f.removed)).toEqual(issued.map((record) => record.ref))
    yield* Effect.forEach(issued, (record) => expectCode(f.real.read(record.ref, readScope(record)), "stale_descriptor"))
    const calls = (yield* Ref.get(f.calls)).length
    yield* Effect.forEach(issued, (record) => expectCode(f.run(f.discovery.describe(f.context, record.ref, f.materialization)), "stale_descriptor"))
    expect(yield* Ref.get(f.calls)).toHaveLength(calls)
    yield* Ref.set(f.afterBatch, Effect.void)
    expect((yield* f.find()).operations).toHaveLength(2)
  })).pipe(Effect.timeout("15 seconds")))
})
