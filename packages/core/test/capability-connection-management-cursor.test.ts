import { describe, expect } from "bun:test"
import { Capability } from "@orchestra/schema/capability"
import { AbsolutePath } from "@orchestra/schema/schema"
import { Effect } from "effect"
import { CapabilityConnectionManagement } from "../src/capability/connection/management"
import { CapabilityConnectionManagementCursor } from "../src/capability/connection/management-cursor"
import { CapabilityConnectionManagementFixture } from "./fixture/capability-connection-management"
import { testEffect } from "./lib/effect"

const it = testEffect(CapabilityConnectionManagementFixture.layer)

describe("CapabilityConnectionManagement opaque target continuation", () => {
  it.live("real scoped cursor follows known tail with changed limit; malformed/tampered/scope/parent/factory cursors fail before scan", () => Effect.gen(function* () {
    const f = yield* CapabilityConnectionManagementFixture.fixture()
    const additional = yield* Effect.forEach(Array.from({ length: 3 }), () => f.target(f.parent))
    const ordered = [f.child, ...additional].sort((left, right) => left.id < right.id ? -1 : 1)
    const token = yield* f.operators.issue({ origin: "sdk", scope: { placements: "instance", actions: ["connection.targets"],
      resources: [{ kind: "connection", id: f.parent.id }, { kind: "target", id: ordered[3].id }] } })
    const first = yield* f.run(f.management.targets(f.parent.id, { limit: 2 }), "page", token.authority)
    if (!first.after) return yield* Effect.die("Missing encrypted continuation")
    expect(first.items).toEqual([])
    ordered.slice(0, 2).forEach((ref) => {
      expect(JSON.stringify(first)).not.toContain(ref.id)
      expect(Buffer.from(first.after ?? "", "base64url").toString("utf8")).not.toContain(ref.id)
    })
    const control = CapabilityConnectionManagementFixture.targetScans()
    const tail = yield* f.run(f.management.targets(f.parent.id, { after: first.after, limit: 32 }), "tail", token.authority)
      .pipe(Effect.withTracer(control.tracer))
    expect(tail).toEqual({ items: [{ target: ordered[3] }], coverage: "live" })
    expect(control.scans).toHaveLength(1)
    expect(control.scans[0].rows).toBe(2)
    const bytes = Buffer.from(first.after, "base64url")
    bytes[bytes.length - 1] ^= 1
    const invalid = [ordered[1].id, "", "c".repeat(31), "c".repeat(2049), "x".repeat(32), first.after + "=", bytes.toString("base64url"),
      Buffer.from(JSON.stringify({ lastscanID: ordered[1].id })).toString("base64url")]
    yield* Effect.forEach(invalid, (after) => Effect.gen(function* () {
      const observed = CapabilityConnectionManagementFixture.targetScans()
      CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.targets(f.parent.id, { after }), "bad", token.authority)
        .pipe(Effect.withTracer(observed.tracer), Effect.exit), "connection_unavailable")
      expect(observed.scans).toEqual([])
    }))
    const narrowed = yield* f.operators.issue({ origin: "sdk", scope: { placements: [CapabilityConnectionManagementFixture.placement],
      actions: ["connection.targets"], resources: [{ kind: "connection", id: f.parent.id }, { kind: "target", id: ordered[3].id }] } })
    const recreated = yield* CapabilityConnectionManagement.make({ store: f.store, operators: f.operators })
    yield* Effect.forEach([
      f.run(f.management.targets(f.parent.id, { after: first.after }), "scope", narrowed.authority),
      f.run(recreated.targets(f.parent.id, { after: first.after }), "factory", token.authority),
    ], (effect) => Effect.gen(function* () {
      const observed = CapabilityConnectionManagementFixture.targetScans()
      CapabilityConnectionManagementFixture.expectCode(yield* effect.pipe(Effect.withTracer(observed.tracer), Effect.exit), "connection_unavailable")
      expect(observed.scans).toEqual([])
    }))
  }))

  it.live("changed-parent cursor rejection uses same real authority and identical scopeHash permitting both parents", () => Effect.gen(function* () {
    const f = yield* CapabilityConnectionManagementFixture.fixture()
    yield* f.target(f.parent)
    const parent = yield* f.connection()
    const child = yield* f.target(parent)
    const token = yield* f.operators.issue({ origin: "sdk", scope: { placements: "instance", actions: ["connection.targets"],
      resources: [{ kind: "connection", id: f.parent.id }, { kind: "connection", id: parent.id }, { kind: "target", id: child.id }] } })
    const target = (id: Capability.ConnectionID) => ({ action: "connection.targets", placement: CapabilityConnectionManagementFixture.placement,
      resource: { kind: "connection", id } })
    const left = yield* f.run(f.operators.require(target(f.parent.id)), "left", token.authority)
    const right = yield* f.run(f.operators.require(target(parent.id)), "right", token.authority)
    expect(left.authority).toBe(right.authority)
    expect(left.scopeHash).toBe(right.scopeHash)
    const page = yield* f.run(f.management.targets(f.parent.id, { limit: 1 }), "left", token.authority)
    if (!page.after) return yield* Effect.die("Missing parent-A continuation")
    const control = CapabilityConnectionManagementFixture.targetScans()
    expect((yield* f.run(f.management.targets(parent.id, {}), "control", token.authority).pipe(Effect.withTracer(control.tracer))).items)
      .toEqual([{ target: child }])
    expect(control.scans).toHaveLength(1)
    const observed = CapabilityConnectionManagementFixture.targetScans()
    CapabilityConnectionManagementFixture.expectCode(yield* f.run(f.management.targets(parent.id, { after: page.after }), "cross-parent", token.authority)
      .pipe(Effect.withTracer(observed.tracer), Effect.exit), "connection_unavailable")
    expect(observed.scans).toEqual([])
  }))

  it.live("AES-GCM binds principal/scope/parent/placement/action/key and expires exactly at five minutes", () => Effect.gen(function* () {
    const f = yield* CapabilityConnectionManagementFixture.fixture()
    const target = { action: "connection.targets", placement: CapabilityConnectionManagementFixture.placement,
      resource: { kind: "connection" as const, id: f.parent.id } }
    const binding = yield* f.run(f.operators.require(target))
    const clock = { now: 100 }
    const cursor = CapabilityConnectionManagementCursor.make(() => clock.now)
    const after = yield* cursor.seal(f.child.id, binding, target)
    const other = yield* cursor.seal(f.child.id, binding, target)
    expect(after).not.toBe(other)
    expect(yield* cursor.open(after, binding, target)).toBe(f.child.id)
    yield* Effect.forEach([
      cursor.open(after, { ...binding, principal: "other-operator" }, target),
      cursor.open(after, { ...binding, scopeHash: "0".repeat(64) }, target),
      cursor.open(after, binding, { ...target, resource: { kind: "connection", id: Capability.ConnectionID.create() } }),
      cursor.open(after, binding, { ...target, placement: CapabilityConnectionManagementFixture.foreign }),
      cursor.open(after, binding, { ...target, action: "connection.get" }),
      CapabilityConnectionManagementCursor.make(() => clock.now).open(after, binding, target),
    ], (effect) => effect.pipe(Effect.exit,
      Effect.tap((exit) => Effect.sync(() => CapabilityConnectionManagementFixture.expectCode(exit, "connection_unavailable")))))
    clock.now = 300099
    expect(yield* cursor.open(after, binding, target)).toBe(f.child.id)
    clock.now = 300100
    CapabilityConnectionManagementFixture.expectCode(yield* cursor.open(after, binding, target).pipe(Effect.exit), "connection_unavailable")
    yield* Effect.forEach([NaN, -1, Infinity, Number.MAX_SAFE_INTEGER], (time) => Effect.gen(function* () {
      clock.now = time
      CapabilityConnectionManagementFixture.expectCode(yield* cursor.open(after, binding, target).pipe(Effect.exit), "connection_unavailable")
      CapabilityConnectionManagementFixture.expectCode(yield* cursor.seal(f.child.id, binding, target).pipe(Effect.exit), "connection_unavailable")
    }))
    clock.now = 100
    CapabilityConnectionManagementFixture.expectCode(yield* cursor.seal(f.child.id, binding, { ...target,
      placement: { ...target.placement, location: { directory: AbsolutePath.make("/" + "x".repeat(2048)) } } }).pipe(Effect.exit), "connection_unavailable")
  }))
})
