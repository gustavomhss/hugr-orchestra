import { describe, expect, test } from "bun:test"
import { Effect, Fiber, Scheduler, Schema } from "effect"
import { Agent } from "@orchestra/schema/agent"
import { Capability } from "@orchestra/schema/capability"
import { Project } from "@orchestra/schema/project"
import { AbsolutePath } from "@orchestra/schema/schema"
import { SessionID } from "@orchestra/schema/session-id"
import { WorkspaceID } from "@orchestra/schema/workspace-id"
import { CapabilityDescriptors } from "../src/capability/catalog/descriptors"

function fixture(maxEntries = 8, ttlMillis = 50) {
  const clock = { value: 1000, reads: 0 }
  const input = {
    owner: {
      projectID: Project.ID.make("project"),
      location: { directory: AbsolutePath.make("/workspace") },
      sessionID: SessionID.create(),
      agentID: Agent.ID.make("backend"),
    },
    connectionGeneration: 2,
    targetGeneration: 3,
    canonicalName: "logical.echo",
    canonicalIdentity: { privateToken: "do-not-serialize" },
    inputSchema: { type: "object", rawRootData: { required: ["text"] } },
    outputSchema: { type: "string" },
    operationID: "echo",
    schemaHash: "a".repeat(64),
    catalogGeneration: 4,
    connectionID: Capability.ConnectionID.create(),
    targetID: Capability.TargetID.create(),
  } satisfies CapabilityDescriptors.IssueInput
  const scope: CapabilityDescriptors.ReadScope = {
    owner: input.owner,
    connectionGeneration: input.connectionGeneration,
    targetGeneration: input.targetGeneration,
    canonicalIdentity: input.canonicalIdentity,
    catalogGeneration: input.catalogGeneration,
    schemaHash: input.schemaHash,
  }
  return {
    clock,
    input,
    scope,
    store: Effect.runSync(
      CapabilityDescriptors.make({
        maxEntries,
        ttlMillis,
        now: () => {
          clock.reads++
          return clock.value
        },
      }),
    ),
  }
}

function denied(effect: Effect.Effect<unknown, Capability.Failure>, code: Capability.ErrorCode) {
  const result = Effect.runSync(Effect.result(effect))
  expect(result._tag).toBe("Failure")
  if (result._tag !== "Failure") return
  const error = result.failure
  expect(error).toBeInstanceOf(Capability.Failure)
  expect(error.code).toBe(code)
  expect(error.message).toBe("Descriptor unavailable")
  expect(error.detail).toBeUndefined()
  expect(JSON.stringify(error)).not.toContain("logical.echo")
}

function frozen(value: Schema.Json) {
  if (value === null || typeof value !== "object") return
  expect(Object.isFrozen(value)).toBe(true)
  Object.values(value).forEach(frozen)
}

describe("capability descriptor metadata", () => {
  test("batch admission is atomic against actual shared capacity and exact-ref removal frees only its record", () => {
    const f = fixture(2)
    const live = Effect.runSync(f.store.issue(f.input))
    denied(f.store.issueBatch([f.input, f.input]), "quota_exceeded")
    expect(Effect.runSync(f.store.read(live.ref, f.scope))).toBe(live)
    const admitted = Effect.runSync(f.store.issueBatch([f.input]))
    expect(admitted).toHaveLength(1)
    Effect.runSync(f.store.remove({ ...live.ref, schemaHash: "b".repeat(64) }))
    expect(Effect.runSync(f.store.read(live.ref, f.scope))).toBe(live)
    Effect.runSync(f.store.remove(live.ref))
    denied(f.store.read(live.ref, f.scope), "stale_descriptor")
    expect(Effect.runSync(f.store.read(admitted[0].ref, f.scope))).toBe(admitted[0])
    expect(Effect.runSync(f.store.issueBatch([f.input]))).toHaveLength(1)
  })

  test("accepts decoded host Owners after importing the strict schema root", async () => {
    const { Capability } = await import("@orchestra/schema")
    const f = fixture()
    const owner = Capability.Owner.make({
      ...f.input.owner,
      location: { ...f.input.owner.location, workspaceID: undefined },
    })
    expect(Object.hasOwn(owner.location, "workspaceID")).toBe(true)
    expect(owner.location.workspaceID).toBeUndefined()
    const old = Effect.runSync(f.store.issue({ ...f.input, owner }))
    expect(Effect.runSync(f.store.read(old.ref, { ...f.scope, owner }))).toBe(old)
    const newOwner = Capability.Owner.make({ ...owner, sessionID: SessionID.create() })
    const next = Effect.runSync(f.store.reissue(old.ref, { ...f.scope, owner }, newOwner))
    expect(Effect.runSync(f.store.read(next.ref, { ...f.scope, owner: newOwner }))).toBe(next)
    expect(next.ref.id).not.toBe(old.ref.id)
  })

  test.each(["clear", "invalidateConnection"] as const)(
    "reissue cannot resurrect after %s at a forced yield",
    (action) => {
      const f = fixture()
      const old = Effect.runSync(f.store.issue(f.input))
      const newOwner = { ...f.input.owner, sessionID: SessionID.create() }
      const tasks: Array<() => void> = []
      const state = { armed: false, yielded: false }
      const before = f.clock.reads
      const scheduler: Scheduler.Scheduler = {
        executionMode: "async",
        shouldYield: () => {
          if (!state.armed || state.yielded || f.clock.reads === before) return false
          state.yielded = true
          return true
        },
        makeDispatcher: () => ({
          scheduleTask: (task) => {
            tasks.push(task)
          },
          flush: () => {
            tasks.splice(0).forEach((task) => task())
          },
        }),
      }
      // Positive control: explicit yieldNow really pauses this runtime until dispatched.
      const control = Effect.runFork(Effect.yieldNow, { scheduler })
      expect(control.pollUnsafe()).toBeUndefined()
      expect(tasks.length).toBe(1)
      tasks.splice(0).forEach((task) => task())
      Effect.runSync(Fiber.join(control))
      state.armed = true
      // Pause at the first Effect boundary after old-scope validation touches the clock.
      const fiber = Effect.runFork(f.store.reissue(old.ref, f.scope, newOwner), { scheduler })
      expect(state.yielded).toBe(true)
      expect(fiber.pollUnsafe()).toBeUndefined()
      expect(tasks.length).toBe(1)
      Effect.runSync(action === "clear" ? f.store.clear() : f.store.invalidateConnection(old.ref.connectionID))
      denied(f.store.read(old.ref, f.scope), "stale_descriptor")
      tasks.splice(0).forEach((task) => task())
      const next = Effect.runSync(Fiber.join(fiber))
      denied(f.store.read(next.ref, { ...f.scope, owner: newOwner }), "stale_descriptor")
    },
  )

  test("invalid clock and expiry overflow leave live records intact before cleanup or quota", () => {
    const f = fixture(1)
    const old = Effect.runSync(f.store.issue(f.input))
    ;[Infinity, -Infinity, NaN].forEach((value) => {
      f.clock.value = value
      denied(f.store.issue(f.input), "stale_descriptor")
      f.clock.value = 1000
      const current = Effect.runSync(Effect.result(f.store.read(old.ref, f.scope)))
      expect(current._tag).toBe("Success")
      if (current._tag === "Success") expect(current.success).toBe(old)
    })
    const overflow = fixture(1, Number.MAX_VALUE)
    const live = Effect.runSync(overflow.store.issue(overflow.input))
    overflow.clock.value = Number.MAX_VALUE
    denied(overflow.store.issue(overflow.input), "stale_descriptor")
    overflow.clock.value = 1000
    const current = Effect.runSync(Effect.result(overflow.store.read(live.ref, overflow.scope)))
    expect(current._tag).toBe("Success")
    if (current._tag === "Success") expect(current.success).toBe(live)
  })

  test("issues valid refs lazily, permits current cross-turn scope, never serializes identity", () => {
    const f = fixture()
    const pending = f.store.issue(f.input)
    f.clock.value = 1005
    const record = Effect.runSync(pending)
    expect(Schema.decodeUnknownSync(Capability.DescriptorRef)(record.ref)).toEqual(record.ref)
    expect(record.issuedAt).toBe(1005)
    expect(record.expiresAt).toBe(1055)
    f.clock.value = 1040
    expect(Effect.runSync(f.store.read({ ...record.ref }, { ...f.scope, owner: { ...f.scope.owner } }))).toBe(record)
    expect(record.canonicalIdentity).toBe(f.input.canonicalIdentity)
    expect(JSON.stringify(record)).not.toContain("canonicalIdentity")
    expect(JSON.stringify(record)).not.toContain("do-not-serialize")
    expect(Effect.runSync(pending).ref.id).not.toBe(record.ref.id)
    denied(fixture().store.read(record.ref, f.scope), "stale_descriptor")
  })

  test("snapshots and deep-freezes schema/root data, refs and owners without freezing token", () => {
    const f = fixture()
    const schema = { type: "object", rawRootData: { required: ["text"] } }
    const output = { enum: ["ok"] }
    const record = Effect.runSync(f.store.issue({ ...f.input, inputSchema: schema, outputSchema: output }))
    schema.rawRootData.required.push("secret")
    output.enum.push("changed")
    f.input.owner.location.directory = AbsolutePath.make("/moved")
    expect(record.inputSchema).toEqual({ type: "object", rawRootData: { required: ["text"] } })
    expect(record.outputSchema).toEqual({ enum: ["ok"] })
    expect(record.owner.location.directory).toBe(AbsolutePath.make("/workspace"))
    expect(Object.isFrozen(record)).toBe(true)
    expect(Object.isFrozen(record.ref)).toBe(true)
    expect(Object.isFrozen(record.owner.location)).toBe(true)
    expect(Object.isFrozen(record.canonicalIdentity)).toBe(false)
    expect(() => Reflect.set(record.ref, "schemaHash", "b".repeat(64))).not.toThrow()
    expect(record.ref.schemaHash).toBe(f.input.schemaHash)
    frozen(record.inputSchema)
    if (record.outputSchema !== undefined) frozen(record.outputSchema)
  })

  test("denies other project, Location, workspace, Session and stable actor", () => {
    const f = fixture()
    const record = Effect.runSync(f.store.issue(f.input))
    const owners = [
      { ...f.scope.owner, projectID: Project.ID.make("other") },
      { ...f.scope.owner, location: { directory: AbsolutePath.make("/elsewhere") } },
      { ...f.scope.owner, location: { ...f.scope.owner.location, workspaceID: WorkspaceID.create() } },
      { ...f.scope.owner, sessionID: SessionID.create() },
      { ...f.scope.owner, agentID: Agent.ID.make("frontend") },
    ]
    owners.forEach((owner) => denied(f.store.read(record.ref, { ...f.scope, owner }), "target_denied"))
    expect(Effect.runSync(f.store.read(record.ref, f.scope))).toBe(record)
  })

  test("rejects changed ref fields, generations, fingerprints and canonical tokens", () => {
    const f = fixture()
    const record = Effect.runSync(f.store.issue(f.input))
    const refs = [
      { ...record.ref, id: Capability.DescriptorID.create() },
      { ...record.ref, schemaHash: "b".repeat(64) },
      { ...record.ref, catalogGeneration: 5 },
      { ...record.ref, connectionID: Capability.ConnectionID.create() },
      { ...record.ref, targetID: Capability.TargetID.create() },
      { ...record.ref, secret: "unexpected" },
    ]
    refs.forEach((ref) => {
      denied(f.store.read(ref, f.scope), "stale_descriptor")
      denied(f.store.reissue(ref, f.scope, f.input.owner), "stale_descriptor")
    })
    const scopes = [
      { ...f.scope, connectionGeneration: 3 },
      { ...f.scope, targetGeneration: 4 },
      { ...f.scope, catalogGeneration: 5 },
      { ...f.scope, schemaHash: "b".repeat(64) },
      { ...f.scope, canonicalIdentity: { privateToken: "do-not-serialize" } },
    ]
    scopes.forEach((scope) => {
      denied(f.store.read(record.ref, scope), "stale_descriptor")
      denied(f.store.reissue(record.ref, scope, f.input.owner), "stale_descriptor")
    })
    f.clock.value = record.expiresAt
    denied(f.store.read(record.ref, f.scope), "stale_descriptor")
    denied(f.store.reissue(record.ref, f.scope, f.input.owner), "stale_descriptor")
  })

  test("trusted caller reissues only with current old scope within same project and Location", () => {
    const f = fixture()
    const old = Effect.runSync(f.store.issue(f.input))
    const newOwner = { ...f.input.owner, sessionID: SessionID.create(), agentID: Agent.ID.make("frontend") }
    denied(f.store.read(old.ref, { ...f.scope, owner: newOwner }), "target_denied")
    denied(f.store.reissue(old.ref, { ...f.scope, owner: newOwner }, newOwner), "target_denied")
    denied(f.store.reissue(old.ref, f.scope, { ...newOwner, projectID: Project.ID.make("other") }), "target_denied")
    denied(
      f.store.reissue(old.ref, f.scope, { ...newOwner, location: { directory: AbsolutePath.make("/other") } }),
      "target_denied",
    )
    denied(
      f.store.reissue(old.ref, f.scope, {
        ...newOwner,
        location: { ...newOwner.location, workspaceID: WorkspaceID.create() },
      }),
      "target_denied",
    )
    f.clock.value += 10
    const next = Effect.runSync(f.store.reissue(old.ref, f.scope, newOwner))
    expect(next.ref.id).not.toBe(old.ref.id)
    expect({ ...next.ref, id: old.ref.id }).toEqual(old.ref)
    expect(next.canonicalIdentity).toBe(old.canonicalIdentity)
    expect(next.inputSchema).toEqual(old.inputSchema)
    expect(next.outputSchema).toEqual(old.outputSchema)
    expect(next.operationID).toBe(old.operationID)
    expect(next.expiresAt).toBe(1060)
    expect(Effect.runSync(f.store.read(next.ref, { ...f.scope, owner: newOwner }))).toBe(next)
    denied(f.store.read(next.ref, f.scope), "target_denied")
    expect(Effect.runSync(f.store.read(old.ref, f.scope))).toBe(old)
  })

  test("live quota preserves active entries; only expired entries reclaim capacity", () => {
    const f = fixture(1)
    const old = Effect.runSync(f.store.issue(f.input))
    denied(f.store.issue(f.input), "quota_exceeded")
    denied(f.store.reissue(old.ref, f.scope, f.input.owner), "quota_exceeded")
    expect(Effect.runSync(f.store.read(old.ref, f.scope))).toBe(old)
    f.clock.value = old.expiresAt
    const next = Effect.runSync(f.store.issue(f.input))
    denied(f.store.read(old.ref, f.scope), "stale_descriptor")
    expect(Effect.runSync(f.store.read(next.ref, f.scope))).toBe(next)
  })

  test("connection invalidation and clear are lazy and store-local", () => {
    const f = fixture()
    const old = Effect.runSync(f.store.issue(f.input))
    const other = Effect.runSync(f.store.issue({ ...f.input, connectionID: Capability.ConnectionID.create() }))
    const invalidate = f.store.invalidateConnection(old.ref.connectionID)
    expect(Effect.runSync(f.store.read(old.ref, f.scope))).toBe(old)
    Effect.runSync(invalidate)
    denied(f.store.read(old.ref, f.scope), "stale_descriptor")
    expect(Effect.runSync(f.store.read(other.ref, f.scope))).toBe(other)
    Effect.runSync(f.store.clear())
    denied(f.store.read(other.ref, f.scope), "stale_descriptor")
    expect(Effect.runSync(f.store.issue(f.input)).ref.id).not.toBe(old.ref.id)
  })

  test("requires positive configured bounds and rejects invalid wire fields", () => {
    ;[0, -1, 1.5, NaN, Infinity].forEach((maxEntries) =>
      expect(() =>
        Effect.runSync(CapabilityDescriptors.make({ maxEntries, ttlMillis: 50, now: () => 1000 })),
      ).toThrow(),
    )
    ;[0, -1, NaN, Infinity].forEach((ttlMillis) =>
      expect(() => Effect.runSync(CapabilityDescriptors.make({ maxEntries: 1, ttlMillis, now: () => 1000 }))).toThrow(),
    )
    const f = fixture()
    denied(f.store.issue({ ...f.input, schemaHash: "bad" }), "stale_descriptor")
    denied(f.store.issue({ ...f.input, connectionGeneration: -1 }), "stale_descriptor")
    denied(f.store.issue({ ...f.input, targetGeneration: 0.5 }), "stale_descriptor")
    const invalid = { type: "object" }
    Reflect.set(invalid, "execute", () => "not metadata")
    denied(f.store.issue({ ...f.input, inputSchema: invalid }), "unsupported_schema")
    denied(f.store.issue({ ...f.input, outputSchema: invalid }), "unsupported_schema")
    Reflect.deleteProperty(invalid, "execute")
    Reflect.set(invalid, "number", Infinity)
    denied(f.store.issue({ ...f.input, inputSchema: invalid }), "unsupported_schema")
  })
})
