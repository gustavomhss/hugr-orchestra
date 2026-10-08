import { describe, expect, test } from "bun:test"
import { Effect, Fiber, Scheduler, Schema } from "effect"
import { Agent } from "@orchestra/schema/agent"
import { Capability } from "@orchestra/schema/capability"
import { Project } from "@orchestra/schema/project"
import { AbsolutePath } from "@orchestra/schema/schema"
import { SessionID } from "@orchestra/schema/session-id"
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

describe("capability descriptor metadata", () => {
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

  test("rejects changed generations and expired descriptors", () => {
    const f = fixture()
    const record = Effect.runSync(f.store.issue(f.input))
    ;[
      { ...f.scope, connectionGeneration: 3 },
      { ...f.scope, targetGeneration: 4 },
      { ...f.scope, catalogGeneration: 5 },
    ].forEach((scope) => denied(f.store.read(record.ref, scope), "stale_descriptor"))
    expect(Effect.runSync(f.store.read(record.ref, f.scope))).toBe(record)
    f.clock.value = record.expiresAt
    denied(f.store.read(record.ref, f.scope), "stale_descriptor")
    denied(f.store.reissue(record.ref, f.scope, f.input.owner), "stale_descriptor")
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
})
