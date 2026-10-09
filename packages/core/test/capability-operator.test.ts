import { describe, expect } from "bun:test"
import { CapabilityOperator } from "@orchestra/core/capability/operator/index"
import type { CapabilityOperatorContract } from "@orchestra/core/capability/operator/contract"
import { CapabilityOperatorScope } from "@orchestra/core/capability/operator/scope"
import { Capability } from "@orchestra/schema/capability"
import { Project } from "@orchestra/schema/project"
import { AbsolutePath } from "@orchestra/schema/schema"
import { WorkspaceID } from "@orchestra/schema/workspace-id"
import { Cause, Context, Deferred, Effect, Exit, Fiber, Ref, Schema, Scope } from "effect"
import { it } from "./lib/effect"

const placement = { projectID: Project.ID.make("operator-project"), location: { directory: AbsolutePath.make("/operator") } }
const resource = { kind: "connection", id: "connection-one" }
const target = { action: "connection.read", placement, resource }
const root: CapabilityOperatorContract.GrantScope = { placements: [placement], actions: [target.action], resources: [resource] }
const options = () => ({ principal: "host-operator", scope: root })

function denied<A, R>(effect: Effect.Effect<A, Capability.Failure, R>, code: Capability.ErrorCode) {
  return Effect.gen(function* () {
    const exit = yield* Effect.exit(effect)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isSuccess(exit)) return yield* Effect.die("Expected capability denial")
    expect(exit.cause.reasons).toHaveLength(1)
    const reason = exit.cause.reasons[0]
    expect(reason?._tag).toBe("Fail")
    if (reason?._tag !== "Fail") return yield* Effect.die("Expected typed capability failure")
    expect(reason.error).toBeInstanceOf(Capability.Failure)
    expect(reason.error.code).toBe(code)
    const wire = Schema.encodeSync(Capability.Failure)(reason.error)
    expect(Object.keys(wire).sort()).toEqual(["_tag", "code", "message"])
    expect(JSON.stringify(wire).length).toBeLessThan(256)
    return reason.error
  })
}

describe("operator authority", () => {
  it.effect("issues real 32-byte bearers, preserves exact ownership and runs allowed effects", () => Effect.gen(function* () {
    const facade = yield* CapabilityOperator.make(options())
    const effects = yield* Ref.make(0)
    yield* Effect.forEach(["desktop", "cli", "sdk"] as const, (origin) => Effect.gen(function* () {
      const issued = yield* facade.issue({ origin })
      expect(issued.bearer).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(Buffer.from(issued.bearer, "base64url")).toHaveLength(32)
      expect(yield* facade.authenticate(issued.bearer)).toBe(issued.authority)
      expect(Object.isFrozen(issued.authority)).toBe(true)
      const binding = yield* facade.withRequest(issued.authority,
        { requestID: "f9c41b1c-b7bf-40f9-a0a8-1ec224b9a6ba", idempotencyKey: "idem-key_1" },
        Effect.gen(function* () {
          const binding = yield* facade.require(target)
          yield* facade.validate(binding, target)
          yield* Ref.update(effects, (value) => value + 1)
          expect(Object.isFrozen(binding)).toBe(true)
          return binding
        }))
      expect(binding).toMatchObject({ authority: issued.authority, principal: "host-operator", origin,
        requestID: "f9c41b1c-b7bf-40f9-a0a8-1ec224b9a6ba", idempotencyKey: "idem-key_1" })
      expect(binding.scopeHash).toMatch(/^[0-9a-f]{64}$/)
      expect(JSON.stringify(binding)).not.toContain(issued.bearer)
    }))
    expect(yield* Ref.get(effects)).toBe(3)
  }))

  it.effect("rejects guessed frames, JSON claims, forged clones and cross-facade authorities", () => Effect.gen(function* () {
    const facade = yield* CapabilityOperator.make(options())
    const other = yield* CapabilityOperator.make(options())
    const issued = yield* facade.issue({ origin: "sdk" })
    yield* denied(facade.require(target), "invocation_binding_missing")
    const guessed = Context.Reference<unknown>("@orchestra/core/CapabilityOperator", { defaultValue: () => undefined })
    yield* denied(facade.require(target).pipe(Effect.provideService(guessed, { principal: "host-operator", origin: "sdk" })),
      "invocation_binding_mismatch")
    yield* denied(other.authenticate(issued.bearer), "authentication_required")
    yield* denied(other.withRequest(issued.authority, { requestID: "same" }, other.require(target)), "authentication_required")
    yield* denied(other.revoke(issued.authority), "authentication_required")
    const clone = { ...issued.authority }
    const serialized = { ...issued.authority }
    Reflect.ownKeys(serialized).forEach((key) => Reflect.deleteProperty(serialized, key))
    yield* Effect.forEach([clone, serialized, { ...facade.configured }], (authority) =>
      denied(facade.withRequest(authority, { requestID: "same" }, facade.require(target)), "authentication_required"))
    const binding = yield* facade.withRequest(issued.authority, { requestID: "same" }, facade.require(target))
    yield* denied(facade.validate(binding, target), "invocation_binding_missing")
    yield* denied(facade.require(target).pipe(Effect.provideService(guessed, { ...binding })), "invocation_binding_mismatch")
    yield* facade.withRequest(issued.authority, { requestID: "same" }, Effect.gen(function* () {
      const current = yield* facade.require(target)
      yield* denied(facade.validate(binding, target), "invocation_binding_mismatch")
      yield* denied(facade.validate({ ...current }, target), "invocation_binding_mismatch")
      yield* denied(other.require(target), "invocation_binding_mismatch")
      yield* facade.validate(current, target)
    }))
  }))

  it.effect("request identity is pointer-based, nested contexts restore and concurrent fibers isolate", () => Effect.gen(function* () {
    const facade = yield* CapabilityOperator.make(options())
    const issued = yield* facade.issue({ origin: "cli" })
    const ready = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const first = yield* facade.withRequest(issued.authority, { requestID: "first" }, Effect.gen(function* () {
      const binding = yield* facade.require(target)
      yield* Deferred.succeed(ready, undefined)
      yield* Deferred.await(release)
      expect(yield* facade.require(target)).toBe(binding)
      yield* facade.validate(binding, target)
      return binding
    })).pipe(Effect.forkChild)
    yield* Deferred.await(ready)
    const second = yield* facade.withRequest(issued.authority, { requestID: "second" }, Effect.gen(function* () {
      const binding = yield* facade.require(target)
      yield* facade.withRequest(issued.authority, { requestID: "second" }, Effect.gen(function* () {
        yield* facade.require(target)
        yield* denied(facade.validate(binding, target), "invocation_binding_mismatch")
      }))
      expect(yield* facade.require(target)).toBe(binding)
      yield* Deferred.succeed(release, undefined)
      return binding
    }))
    expect((yield* Fiber.join(first)).requestID).toBe("first")
    expect(second.requestID).toBe("second")
    yield* denied(facade.require(target), "invocation_binding_missing")
  }))

  it.effect("Scope closure invalidates issued and configured authorities plus captured contexts", () => Effect.gen(function* () {
    const scope = yield* Scope.make()
    yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void))
    const facade = yield* CapabilityOperator.make(options()).pipe(Scope.provide(scope))
    const issued = yield* facade.issue({ origin: "desktop" })
    yield* facade.withRequest(issued.authority, { requestID: "scope" }, Effect.gen(function* () {
      const binding = yield* facade.require(target)
      yield* Scope.close(scope, Exit.void)
      yield* denied(facade.require(target), "authentication_required")
      yield* denied(facade.validate(binding, target), "authentication_required")
    }))
    yield* denied(facade.authenticate(issued.bearer), "authentication_required")
    yield* denied(facade.withRequest(facade.configured, { requestID: "closed" }, facade.require(target)), "authentication_required")
    yield* denied(facade.issue({ origin: "sdk" }), "authentication_required")
    yield* denied(facade.revoke(issued.authority), "authentication_required")
  }))

  it.effect("expiry is checked again after suspension and expired entries release capacity", () => Effect.gen(function* () {
    const clock = { now: 1000 }
    const facade = yield* CapabilityOperator.make({ ...options(), now: () => clock.now, ttlMillis: 10, maxCapabilities: 1 })
    const issued = yield* facade.issue({ origin: "sdk" })
    yield* denied(facade.issue({ origin: "sdk" }), "quota_exceeded")
    const ready = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const pending = yield* facade.withRequest(issued.authority, { requestID: "wait" }, Effect.gen(function* () {
      const binding = yield* facade.require(target)
      yield* Deferred.succeed(ready, undefined)
      yield* Deferred.await(release)
      yield* denied(facade.require(target), "authentication_required")
      yield* denied(facade.validate(binding, target), "authentication_required")
    })).pipe(Effect.forkChild)
    yield* Deferred.await(ready)
    clock.now = 1009
    expect(yield* facade.authenticate(issued.bearer)).toBe(issued.authority)
    clock.now = 1010
    yield* Deferred.succeed(release, undefined)
    yield* Fiber.join(pending)
    yield* denied(facade.authenticate(issued.bearer), "authentication_required")
    const fresh = yield* facade.issue({ origin: "sdk" })
    expect(yield* facade.authenticate(fresh.bearer)).toBe(fresh.authority)
    yield* facade.withRequest(facade.configured, { requestID: "configured" }, facade.require(target))
  }))

  it.effect("revocation after a wait invalidates bindings and releases quota without timers", () => Effect.gen(function* () {
    const facade = yield* CapabilityOperator.make({ ...options(), maxCapabilities: 1 })
    const issued = yield* facade.issue({ origin: "cli" })
    const ready = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const pending = yield* facade.withRequest(issued.authority, { requestID: "revoke" }, Effect.gen(function* () {
      const binding = yield* facade.require(target)
      yield* Deferred.succeed(ready, undefined)
      yield* Deferred.await(release)
      yield* denied(facade.validate(binding, target), "authentication_required")
      yield* denied(facade.require(target), "authentication_required")
    })).pipe(Effect.forkChild)
    yield* Deferred.await(ready)
    yield* facade.revoke(issued.authority)
    yield* Deferred.succeed(release, undefined)
    yield* Fiber.join(pending)
    const failure = yield* denied(facade.authenticate(issued.bearer), "authentication_required")
    expect(JSON.stringify(failure)).not.toContain(issued.bearer)
    yield* facade.revoke(issued.authority)
    yield* facade.issue({ origin: "cli" })
    yield* facade.withRequest(facade.configured, { requestID: "configured" }, facade.require(target))
    yield* denied(facade.issue({ origin: "cli" }), "quota_exceeded")
  }))

  it.effect("configured authority belongs to host facade and cannot be issued through data", () => Effect.gen(function* () {
    const facade = yield* CapabilityOperator.make(options())
    const input = { origin: "sdk" as const }
    Reflect.set(input, "origin", "configured-auth")
    yield* denied(facade.issue(input), "target_denied")
    const binding = yield* facade.withRequest(facade.configured, { requestID: "basic-host" }, facade.require(target))
    expect(binding.origin).toBe("configured-auth")
    const other = yield* CapabilityOperator.make(options())
    yield* denied(other.withRequest(facade.configured, { requestID: "basic-host" }, other.require(target)), "authentication_required")
    yield* denied(facade.authenticate(JSON.stringify(facade.configured)), "authentication_required")
  }))

  it.effect("bearer parser rejects malformed, unknown and noncanonical-looking credentials with redacted failures", () => Effect.gen(function* () {
    const facade = yield* CapabilityOperator.make(options())
    const issued = yield* facade.issue({ origin: "sdk" })
    yield* Effect.forEach(["", "private-secret", "A".repeat(43), issued.bearer + "\n", issued.bearer + "=",
      "Bearer " + issued.bearer, "é".repeat(43), "A".repeat(42)], (token) => Effect.gen(function* () {
      const failure = yield* denied(facade.authenticate(token), "authentication_required")
      expect(JSON.stringify(failure)).not.toContain(issued.bearer)
      expect(JSON.stringify(failure)).not.toContain("private-secret")
    }))
    const primitive = { bearer: issued.bearer }
    Reflect.set(primitive, "bearer", null)
    yield* denied(facade.authenticate(primitive.bearer), "authentication_required")
  }))
})

describe("operator grant and request parsing", () => {
  it.effect("exact action, project, directory, workspace and resource checks fence real side effects", () => Effect.gen(function* () {
    const facade = yield* CapabilityOperator.make(options())
    const writes = yield* Ref.make(0)
    const invalid = [
      { ...target, action: "connection.write" }, { ...target, action: "Connection.read" },
      { ...target, action: "connection.read\n" }, { ...target, action: "*" },
      { ...target, placement: { ...placement, projectID: Project.ID.make("other") } },
      { ...target, placement: { ...placement, location: { directory: AbsolutePath.make("/operator/child") } } },
      { ...target, placement: { ...placement, location: { ...placement.location, workspaceID: WorkspaceID.make("wrk_other") } } },
      { action: target.action, placement }, { ...target, resource: { ...resource, id: "connection-two" } },
      { ...target, resource: { ...resource, kind: "target" } }, { ...target, resource: { ...resource, id: "*" } },
    ]
    yield* facade.withRequest(facade.configured, { requestID: "scope-check" }, Effect.gen(function* () {
      yield* Effect.forEach(invalid, (target) => denied(facade.require(target).pipe(
        Effect.andThen(Ref.update(writes, (value) => value + 1))), "target_denied"))
      const binding = yield* facade.require(target)
      yield* Effect.forEach(invalid, (target) => denied(facade.validate(binding, target), "target_denied"))
      yield* Ref.update(writes, (value) => value + 1)
    }))
    expect(yield* Ref.get(writes)).toBe(1)
    const explicit = { ...placement, location: { ...placement.location, workspaceID: WorkspaceID.make("wrk_bound") } }
    const scoped = yield* CapabilityOperator.make({ ...options(), scope: { ...root, placements: [explicit] } })
    yield* scoped.withRequest(scoped.configured, { requestID: "explicit" }, Effect.gen(function* () {
      yield* scoped.require({ ...target, placement: explicit })
      yield* denied(scoped.require(target), "target_denied")
      yield* denied(scoped.require({ ...target, placement: { ...explicit,
        location: { ...explicit.location, workspaceID: WorkspaceID.make("wrk_other") } } }), "target_denied")
    }))
  }))

  it.effect("delegation is restrict-only across every scope dimension", () => Effect.gen(function* () {
    const facade = yield* CapabilityOperator.make(options())
    const children: CapabilityOperatorContract.GrantScope[] = [
      { ...root, placements: "instance" }, { ...root, actions: ["*"] }, { ...root, actions: ["connection.write"] },
      { placements: root.placements, actions: root.actions },
      { ...root, placements: [{ ...placement, projectID: Project.ID.make("other") }] },
      { ...root, placements: [{ ...placement, location: { ...placement.location, workspaceID: WorkspaceID.make("wrk_other") } }] },
      { ...root, resources: [{ ...resource, id: "other" }] }, { ...root, resources: [{ ...resource, kind: "other" }] },
    ]
    yield* Effect.forEach(children, (scope) => denied(facade.issue({ origin: "sdk", scope }), "target_denied"))
    const narrowed = yield* facade.issue({ origin: "sdk", scope: { placements: [], actions: [], resources: [] } })
    yield* denied(facade.withRequest(narrowed.authority, { requestID: "empty" }, facade.require(target)), "target_denied")
    const unrestricted = yield* CapabilityOperator.make({ ...options(), scope: { placements: "instance", actions: ["*"] } })
    const child = yield* unrestricted.issue({ origin: "sdk", scope: root })
    yield* unrestricted.withRequest(child.authority, { requestID: "narrow" }, unrestricted.require(target))
    yield* denied(unrestricted.withRequest(child.authority, { requestID: "narrow" },
      unrestricted.require({ ...target, action: "connection.write" })), "target_denied")
    yield* unrestricted.withRequest(unrestricted.configured, { requestID: "all" },
      unrestricted.require({ action: "connection.write", placement }))
    const noResources = yield* CapabilityOperator.make({ ...options(), scope: { ...root, resources: [] } })
    yield* denied(noResources.withRequest(noResources.configured, { requestID: "none" }, noResources.require(target)), "target_denied")
    const noPlacements = yield* CapabilityOperator.make({ ...options(), scope: { ...root, placements: [] } })
    yield* denied(noPlacements.withRequest(noPlacements.configured, { requestID: "none" }, noPlacements.require(target)), "target_denied")
    const noActions = yield* CapabilityOperator.make({ ...options(), scope: { ...root, actions: [] } })
    yield* denied(noActions.withRequest(noActions.configured, { requestID: "none" }, noActions.require(target)), "target_denied")
  }))

  it.effect("scope hashes ignore array order and principal while duplicate grants are rejected", () => Effect.gen(function* () {
    const secondPlacement = { ...placement, projectID: Project.ID.make("other") }
    const secondResource = { ...resource, id: "second" }
    const scope = { placements: [placement, secondPlacement], actions: ["connection.read", "connection.write"], resources: [resource, secondResource] }
    const first = yield* CapabilityOperator.make({ principal: "first", scope })
    const second = yield* CapabilityOperator.make({ principal: "second", scope: {
      placements: [...scope.placements].reverse(), actions: [...scope.actions].reverse(), resources: [...scope.resources].reverse() } })
    const left = yield* first.withRequest(first.configured, { requestID: "hash" }, first.require(target))
    const right = yield* second.withRequest(second.configured, { requestID: "hash" }, second.require(target))
    expect(left.scopeHash).toBe(right.scopeHash)
    expect(left.principal).not.toBe(right.principal)
    yield* Effect.forEach([{ ...root, placements: [placement, placement] }, { ...root, actions: [target.action, target.action] },
      { ...root, resources: [resource, resource] }, { ...root, actions: ["*", target.action] }], (scope) =>
      denied(CapabilityOperator.make({ ...options(), scope }), "target_denied"))
  }))

  it.effect("snapshots options, child grants, requests and targets before first yield", () => Effect.gen(function* () {
    const mutable = { principal: "original", scope: { placements: [{ ...placement, location: { ...placement.location } }],
      actions: [target.action], resources: [resource] } }
    const pending = CapabilityOperator.make(mutable)
    mutable.principal = "changed"
    mutable.scope.actions[0] = "connection.write"
    mutable.scope.resources.length = 0
    mutable.scope.placements[0].location.directory = AbsolutePath.make("/changed")
    const facade = yield* pending
    const child = { origin: "sdk" as const, scope: { placements: [placement], actions: [target.action], resources: [resource] } }
    const issuance = facade.issue(child)
    child.scope.actions.length = 0
    const issued = yield* issuance
    const request = { requestID: "original", idempotencyKey: "original-key" }
    const supplied = { ...target, resource: { ...resource } }
    const read = facade.require(supplied)
    supplied.resource.id = "changed"
    const invocation = facade.withRequest(issued.authority, request, read)
    request.requestID = "changed"
    request.idempotencyKey = "changed-key"
    const binding = yield* invocation
    expect(binding).toMatchObject({ principal: "original", requestID: "original", idempotencyKey: "original-key" })
    yield* facade.withRequest(issued.authority, { requestID: "validate-snapshot" }, Effect.gen(function* () {
      const binding = yield* facade.require(target)
      const supplied = { ...target, resource: { ...resource } }
      const validation = facade.validate(binding, supplied)
      supplied.resource.id = "changed"
      yield* validation
      expect(Reflect.set(binding, "principal", "changed")).toBe(false)
      expect(Object.isFrozen(binding.authority)).toBe(true)
    }))
  }))

  it.effect("request claims cannot inject authority, scope, actor, origin or public resource IDs", () => Effect.gen(function* () {
    const facade = yield* CapabilityOperator.make(options())
    yield* Effect.forEach(["principal", "origin", "scope", "scopeHash", "authority", "actor", "rules", "connectionID"], (key) => {
      const input = { requestID: "public-request" }
      Reflect.set(input, key, key === "scope" ? root : "public-value")
      return denied(facade.withRequest(facade.configured, input, Effect.die("Injected claim entered body")), "invocation_binding_mismatch")
    })
    yield* Effect.forEach(["", "contains space", "\n", "é", "x".repeat(129)], (requestID) =>
      denied(facade.withRequest(facade.configured, { requestID }, facade.require(target)), "invocation_binding_mismatch"))
    yield* Effect.forEach(["", "contains space", "x.y", "x\n", "x".repeat(129)], (idempotencyKey) =>
      denied(facade.withRequest(facade.configured, { requestID: "valid", idempotencyKey }, facade.require(target)), "invocation_binding_mismatch"))
    yield* facade.withRequest(facade.configured, { requestID: "!".repeat(128), idempotencyKey: "x".repeat(128) }, facade.require(target))
    const supplied = { ...target }
    Reflect.set(supplied, "placement", undefined)
    yield* denied(facade.withRequest(facade.configured, { requestID: "missing-placement" }, facade.require(supplied)), "target_denied")
  }))

  it.effect("parser rejects UTF-8, array, grammar, depth, node and byte budget violations", () => Effect.gen(function* () {
    yield* CapabilityOperator.make({ ...options(), principal: "é".repeat(128) })
    const invalid: CapabilityOperatorContract.Options[] = [
      { ...options(), principal: "" }, { ...options(), principal: "é".repeat(129) },
      { ...options(), scope: { ...root, placements: Array.from({ length: 65 }, (_, index) => ({ ...placement, projectID: Project.ID.make(String(index)) })) } },
      { ...options(), scope: { ...root, resources: Array.from({ length: 65 }, (_, index) => ({ ...resource, id: String(index) })) } },
      { ...options(), scope: { ...root, actions: Array.from({ length: 33 }, (_, index) => "action" + index) } },
      { ...options(), scope: { ...root, actions: ["Uppercase"] } }, { ...options(), scope: { ...root, actions: ["x".repeat(65)] } },
      { ...options(), scope: { ...root, actions: ["read\n"] } },
      { ...options(), scope: { ...root, resources: [{ kind: "resource", id: "é".repeat(32768) }] } },
    ]
    const deep = options()
    Reflect.set(deep, "unknown", Array.from({ length: 65 }).reduce<unknown>((nested) => ({ nested }), "leaf"))
    const wide = options()
    Reflect.set(wide, "unknown", Array.from({ length: 2048 }, () => 0))
    const primitive = options()
    Reflect.set(primitive, "scope", "instance")
    const sparse = { ...options(), scope: { ...root } }
    Reflect.set(sparse.scope, "unused", undefined)
    yield* Effect.forEach([...invalid, deep, wide, primitive, sparse], (input) => denied(CapabilityOperator.make(input), "target_denied"))
    const facade = yield* CapabilityOperator.make(options())
    const primitiveIssue = { origin: "sdk" as const }
    Reflect.set(primitiveIssue, "scope", null)
    yield* denied(facade.issue(primitiveIssue), "target_denied")
    const sparseActions = new Array<string>(1)
    yield* denied(CapabilityOperator.make({ ...options(), scope: { ...root, actions: sparseActions } }), "target_denied")
  }))

  it.effect("descriptor copier has nonvacuous depth, node and serialized-byte bounds", () => Effect.sync(() => {
    const identity = (value: unknown) => value
    const nested = (depth: number) => Array.from({ length: depth }).reduce<unknown>((nested) => ({ nested }), "leaf")
    expect(CapabilityOperatorScope.capture(nested(64), identity).ok).toBe(true)
    expect(CapabilityOperatorScope.capture(nested(65), identity).ok).toBe(false)
    expect(CapabilityOperatorScope.capture(Array.from({ length: 2047 }, () => 0), identity).ok).toBe(true)
    expect(CapabilityOperatorScope.capture(Array.from({ length: 2048 }, () => 0), identity).ok).toBe(false)
    expect(CapabilityOperatorScope.capture(Array.from({ length: 32 }, () => Array.from({ length: 62 }, () => 0)), identity).ok).toBe(true)
    expect(CapabilityOperatorScope.capture(Array.from({ length: 32 }, () => Array.from({ length: 63 }, () => 0)), identity).ok).toBe(false)
    expect(CapabilityOperatorScope.capture("x".repeat(65534), identity).ok).toBe(true)
    expect(CapabilityOperatorScope.capture("x".repeat(65535), identity).ok).toBe(false)
    expect(CapabilityOperatorScope.capture(["x".repeat(32764), "x".repeat(32764)], identity).ok).toBe(true)
    expect(CapabilityOperatorScope.capture(["x".repeat(32765), "x".repeat(32765)], identity).ok).toBe(false)
  }))

  it.effect("grant array and action grammar boundaries permit actual requests", () => Effect.gen(function* () {
    const placements = Array.from({ length: 64 }, (_, index) => ({ ...placement, projectID: Project.ID.make(String(index)) }))
    const resources = Array.from({ length: 64 }, (_, index) => ({ ...resource, id: String(index) }))
    const actions = ["x".repeat(64), ...Array.from({ length: 31 }, (_, index) => "action" + index)]
    const facade = yield* CapabilityOperator.make({ ...options(), scope: { placements, resources, actions } })
    const effects = yield* Ref.make(0)
    yield* facade.withRequest(facade.configured, { requestID: "limits" }, Effect.gen(function* () {
      yield* facade.require({ action: actions[0], placement: placements[0], resource: resources[0] })
      yield* Ref.update(effects, (value) => value + 1)
    }))
    expect(yield* Ref.get(effects)).toBe(1)
  }))

  it.effect("data descriptor parser never calls getters or custom serializers", () => Effect.gen(function* () {
    const calls = { count: 0 }
    const getter = options()
    Object.defineProperty(getter, "principal", { enumerable: true, get: () => { calls.count += 1; return "getter" } })
    const serializer = { ...options(), toJSON: () => { calls.count += 1; return options() } }
    yield* denied(CapabilityOperator.make(getter), "target_denied")
    yield* denied(CapabilityOperator.make(serializer), "target_denied")
    const facade = yield* CapabilityOperator.make(options())
    const child = { origin: "sdk" as const }
    Object.defineProperty(child, "scope", { enumerable: true, get: () => { calls.count += 1; return root } })
    yield* denied(facade.issue(child), "target_denied")
    const request = { requestID: "request" }
    Object.defineProperty(request, "requestID", { enumerable: true, get: () => { calls.count += 1; return "getter" } })
    yield* denied(facade.withRequest(facade.configured, request, facade.require(target)), "invocation_binding_mismatch")
    const supplied = { ...target }
    Object.defineProperty(supplied, "resource", { enumerable: true, get: () => { calls.count += 1; return resource } })
    yield* denied(facade.withRequest(facade.configured, { requestID: "getter-target" }, facade.require(supplied)), "target_denied")
    expect(calls.count).toBe(0)
  }))

  it.effect("positive finite options, safe expiry sums and invalid clocks fail closed", () => Effect.gen(function* () {
    yield* Effect.forEach([0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1], (value) => Effect.gen(function* () {
      yield* denied(CapabilityOperator.make({ ...options(), ttlMillis: value }), "target_denied")
      yield* denied(CapabilityOperator.make({ ...options(), maxCapabilities: value }), "target_denied")
    }))
    yield* denied(CapabilityOperator.make({ ...options(), maxCapabilities: 1.5 }), "target_denied")
    yield* denied(CapabilityOperator.make({ ...options(), now: () => NaN }), "target_denied")
    const clock = { now: Number.MAX_SAFE_INTEGER - 1 }
    const facade = yield* CapabilityOperator.make({ ...options(), now: () => clock.now })
    yield* denied(facade.issue({ origin: "sdk", ttlMillis: 2 }), "target_denied")
    const issued = yield* facade.issue({ origin: "sdk", ttlMillis: 1 })
    clock.now = NaN
    yield* denied(facade.authenticate(issued.bearer), "authentication_required")
    yield* denied(facade.withRequest(facade.configured, { requestID: "bad-clock" }, facade.require(target)), "authentication_required")
    clock.now = 1000
    yield* Effect.forEach([0, -1, NaN, Infinity], (ttlMillis) => denied(facade.issue({ origin: "sdk", ttlMillis }), "target_denied"))
  }))

  it.effect("defaults use one-hour TTL and 128 bearer slots while configured access uses no slot", () => Effect.gen(function* () {
    const clock = { now: 0 }
    const facade = yield* CapabilityOperator.make({ ...options(), now: () => clock.now })
    const tokens = yield* Effect.forEach(Array.from({ length: 128 }), () => facade.issue({ origin: "sdk" }))
    yield* denied(facade.issue({ origin: "sdk" }), "quota_exceeded")
    yield* facade.withRequest(facade.configured, { requestID: "configured-full" }, facade.require(target))
    clock.now = 3599999
    expect(yield* facade.authenticate(tokens[0].bearer)).toBe(tokens[0].authority)
    clock.now = 3600000
    yield* denied(facade.authenticate(tokens[0].bearer), "authentication_required")
    yield* facade.issue({ origin: "sdk" })
  }))

  it.effect("withRequest preserves service requirements, typed failures, mixed defects and interruption", () => Effect.gen(function* () {
    const facade = yield* CapabilityOperator.make(options())
    const Required = Context.Service<string>("operator-test/Required")
    expect(yield* facade.withRequest(facade.configured, { requestID: "service" }, Required).pipe(
      Effect.provideService(Required, "required-value"))).toBe("required-value")
    const typed = new Capability.Failure({ code: "unsupported_operation", message: "source failure" })
    const defect = new Error("source defect")
    yield* Effect.forEach([Cause.fail(typed), Cause.combine(Cause.fail(typed), Cause.die(defect)),
      Cause.combine(Cause.fail(typed), Cause.interrupt(123))], (cause) => Effect.gen(function* () {
      const exit = yield* Effect.exit(facade.withRequest(facade.configured, { requestID: "cause" }, Effect.failCause(cause)))
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(exit.cause.reasons).toEqual(cause.reasons)
    }))
    const ready = yield* Deferred.make<void>()
    const fiber = yield* facade.withRequest(facade.configured, { requestID: "interrupt" }, Effect.gen(function* () {
      yield* Deferred.succeed(ready, undefined)
      yield* Effect.never
    })).pipe(Effect.forkChild)
    yield* Deferred.await(ready)
    yield* Fiber.interrupt(fiber)
    expect(Exit.hasInterrupts(yield* Fiber.await(fiber))).toBe(true)
    const throwingClock = yield* CapabilityOperator.make({ ...options(), now: () => 1 })
    const hostDefect = new Error("host clock defect")
    const clock = { fail: false }
    const brokenClock = yield* CapabilityOperator.make({ ...options(), now: () => {
      if (clock.fail) throw hostDefect
      return 1
    } })
    clock.fail = true
    const failed = yield* Effect.exit(brokenClock.withRequest(brokenClock.configured, { requestID: "clock" }, Effect.void))
    expect(Exit.isFailure(failed)).toBe(true)
    if (Exit.isFailure(failed)) expect(failed.cause.reasons).toEqual(Cause.die(hostDefect).reasons)
    yield* throwingClock.withRequest(throwingClock.configured, { requestID: "clock-control" }, throwingClock.require(target))
  }))
})
