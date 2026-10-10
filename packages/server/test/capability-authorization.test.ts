import { describe, expect } from "bun:test"
import type { CapabilityOperatorContract } from "@orchestra/core/capability/operator/contract"
import { ForbiddenError, InvalidRequestError, UnauthorizedError } from "@orchestra/protocol/errors"
import { CapabilityAuthorization } from "@orchestra/protocol/middleware/capability-authorization"
import { Capability } from "@orchestra/schema/capability"
import { Project } from "@orchestra/schema/project"
import { AbsolutePath } from "@orchestra/schema/schema"
import { WorkspaceID } from "@orchestra/schema/workspace-id"
import { Cause, Context, Deferred, Effect, Exit, Fiber, Option, Schema } from "effect"
import { it } from "../../core/test/lib/effect"
import { CapabilityAuthorizationFixture } from "./capability-authorization-fixture"

const basic = `Basic ${Buffer.from("operator-basic:secret:with-colon").toString("base64")}`
const claims = {
  principal: "caller-principal", origin: "configured-auth", authority: {},
  agentID: "agent_attacker", sessionID: "ses_attacker", assistantMessageID: "msg_attacker", callID: "call_attacker",
  scope: { placements: "instance", actions: ["*"] }, requestID: "caller-request", idempotencyKey: "body-key",
}

function denied(response: Response, status: 401 | 403, secrets: readonly string[] = []) {
  return Effect.gen(function* () {
    expect(response.status).toBe(status)
    const text = yield* Effect.promise(() => response.text())
    expect(text).toBe(JSON.stringify(status === 401
      ? { _tag: "UnauthorizedError", message: "Authentication required" }
      : { _tag: "ForbiddenError", message: "Request denied" }))
    secrets.forEach((secret) => expect(text).not.toContain(secret))
  })
}

describe("capability authorization HTTP boundary", () => {
  it.live("declares 401/403 without client middleware requirements", () => Effect.sync(() => {
    expect(CapabilityAuthorization.requiredForClient).toBe(false)
    expect(Array.from(CapabilityAuthorization.error).map((schema) => schema.ast.annotations?.httpApiStatus)).toEqual([401, 403])
  }))

  it.live("disabled or empty Basic config leaves health public but requires header Bearer on guarded route", () =>
    Effect.gen(function* () {
      yield* Effect.forEach([Option.none<string>(), Option.some("")], (password) => Effect.gen(function* () {
        const fixture = yield* CapabilityAuthorizationFixture.make({ password })
        expect((yield* fixture.health).status).toBe(200)
        yield* denied(yield* fixture.request({ payload: claims }), 401)
        const issued = yield* fixture.operator.issue({ origin: "sdk" })
        yield* denied(yield* fixture.request({ query: `?auth_token=${issued.bearer}&ticket=pty-ticket`, payload: claims }), 401, [issued.bearer])
        yield* denied(yield* fixture.request({ headers: { cookie: `authorization=Bearer ${issued.bearer}` }, payload: claims }), 401)
        yield* denied(yield* fixture.request({ headers: { authorization: basic }, payload: claims }), 401, [basic])
        expect(fixture.domain.entered).toBe(0)
        expect((yield* fixture.request({ headers: { authorization: `Bearer ${issued.bearer}` } })).status).toBe(200)
        expect(fixture.domain.effects).toBe(1)
      }))
    }))

  it.live("required Basic is checked independently; query tokens, PTY tickets and Bearer cannot bypass it", () =>
    Effect.gen(function* () {
      const fixture = yield* CapabilityAuthorizationFixture.make({ password: Option.some("secret:with-colon") })
      const issued = yield* fixture.operator.issue({ origin: "desktop" })
      const invalid = [undefined, "Basic !!!", `Basic ${Buffer.from("operator-basic:wrong").toString("base64")}`,
        `Basic ${Buffer.from("wrong-user:secret:with-colon").toString("base64")}`,
        `Basic ${Buffer.from("operator-basic").toString("base64")}`, basic + ", extra", basic.replace("Basic ", "Basic  "),
        `Bearer ${issued.bearer}`]
      yield* Effect.forEach(invalid, (authorization) => Effect.gen(function* () {
        yield* denied(yield* fixture.request({
          headers: authorization === undefined ? {} : { authorization },
          query: `?auth_token=${encodeURIComponent(basic.slice(6))}&ticket=pty-ticket&connect_ticket=pty-ticket`, payload: claims,
        }), 401, [issued.bearer, "secret:with-colon"])
      }))
      expect(fixture.domain.entered).toBe(0)
      const response = yield* fixture.request({ headers: { authorization: basic } })
      expect(response.status).toBe(200)
      expect(yield* CapabilityAuthorizationFixture.binding(response)).toMatchObject({ principal: "host-operator", origin: "configured-auth" })
      expect(fixture.domain.effects).toBe(1)
      expect((yield* fixture.health).status).toBe(200)
    }))

  it.live("Bearer grammar is exact and invalid credentials never fall back to configured authority", () =>
    Effect.gen(function* () {
      const fixture = yield* CapabilityAuthorizationFixture.make()
      const issued = yield* fixture.operator.issue({ origin: "cli" })
      yield* Effect.forEach(["", "Bearer " + "A".repeat(43), "Bearer " + issued.bearer.slice(1),
        "Bearer " + issued.bearer + "=", "bearer " + issued.bearer, "Bearer  " + issued.bearer,
        "Bearer " + issued.bearer + ", extra", basic], (authorization) => Effect.gen(function* () {
        yield* denied(yield* fixture.request({ headers: { authorization }, payload: claims }), 401, [issued.bearer])
      }))
      expect(fixture.domain.entered).toBe(0)
      expect((yield* fixture.request({ headers: { authorization: `Bearer ${issued.bearer}` } })).status).toBe(200)
    }))

  it.live("host principal, issued origin and fresh UUID override all caller identity claims at equal clock time", () =>
    Effect.gen(function* () {
      const fixture = yield* CapabilityAuthorizationFixture.make({ now: () => 1000 })
      const issued = yield* fixture.operator.issue({ origin: "sdk" })
      const guessed = Context.Reference<unknown>("@orchestra/core/CapabilityOperator", { defaultValue: () => undefined })
      const responses = yield* Effect.forEach([1, 2], () => fixture.request({
        headers: { authorization: `Bearer ${issued.bearer}`, "x-request-id": "caller-request", "x-principal": "caller-principal",
          "x-agent-id": "agent_attacker", "x-idempotency-key": "fake-key" },
        payload: claims, context: Context.make(guessed, claims),
      }))
      const bindings = yield* Effect.forEach(responses, CapabilityAuthorizationFixture.binding)
      bindings.forEach((binding) => {
        expect(binding).toMatchObject({ principal: "host-operator", origin: "sdk" })
        expect(binding.requestID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
        expect(binding.scopeHash).toMatch(/^[0-9a-f]{64}$/)
        expect(binding.idempotencyKey).toBeUndefined()
        expect(Object.keys(binding).sort()).toEqual(["origin", "principal", "requestID", "scopeHash"])
        expect(JSON.stringify(binding)).not.toContain(issued.bearer)
      })
      expect(bindings[0].requestID).not.toBe(bindings[1].requestID)
      const outside = yield* fixture.operator.require(CapabilityAuthorizationFixture.target).pipe(Effect.flip)
      expect(outside.code).toBe("invocation_binding_missing")
    }))

  it.live("actual action, project, location, workspace and resources deny before domain reads or effects", () =>
    Effect.gen(function* () {
      const fixture = yield* CapabilityAuthorizationFixture.make()
      const issued = yield* fixture.operator.issue({ origin: "sdk" })
      const target = CapabilityAuthorizationFixture.target
      const invalid: CapabilityOperatorContract.Target[] = [
        { ...target, action: "connection.write" },
        { ...target, placement: { ...target.placement, projectID: Project.ID.make("other-project") } },
        { ...target, placement: { ...target.placement, location: { directory: AbsolutePath.make("/other-location") } } },
        { ...target, placement: { ...target.placement, location: { ...target.placement.location, workspaceID: WorkspaceID.make("wrk_other") } } },
        { ...target, resource: { ...target.resource, id: "other-resource" } },
        { ...target, resource: { ...target.resource, kind: "other-kind" } },
        { action: target.action, placement: target.placement },
      ]
      yield* Effect.forEach(invalid, (target) => Effect.gen(function* () {
        fixture.domain.target = target
        yield* denied(yield* fixture.request({ headers: { authorization: `Bearer ${issued.bearer}` }, payload: claims }), 403)
        expect(fixture.domain.reads).toBe(0)
        expect(fixture.domain.effects).toBe(0)
      }))
      fixture.domain.target = target
      expect((yield* fixture.request({ headers: { authorization: `Bearer ${issued.bearer}` } })).status).toBe(200)
      expect(fixture.domain.reads).toBe(1)
      expect(fixture.domain.effects).toBe(1)
    }))

  it.live("Basic uses host configured scope, while narrower Bearer grants remain narrow", () => Effect.gen(function* () {
    const hostScope: CapabilityOperatorContract.GrantScope = { placements: "instance", actions: ["*"] }
    const basicFixture = yield* CapabilityAuthorizationFixture.make({ password: Option.some("secret:with-colon"), scope: hostScope })
    basicFixture.domain.target = { ...CapabilityAuthorizationFixture.target, action: "connection.write" }
    expect((yield* basicFixture.request({ headers: { authorization: basic } })).status).toBe(200)
    const bearerFixture = yield* CapabilityAuthorizationFixture.make({ scope: hostScope })
    const issued = yield* bearerFixture.operator.issue({ origin: "sdk", scope: CapabilityAuthorizationFixture.scope })
    bearerFixture.domain.target = basicFixture.domain.target
    yield* denied(yield* bearerFixture.request({ headers: { authorization: `Bearer ${issued.bearer}` } }), 403)
    expect(bearerFixture.domain.effects).toBe(0)
  }))

  it.live("Idempotency-Key keeps exact allowed syntax; malformed keys fail redacted before handler", () =>
    Effect.gen(function* () {
      const fixture = yield* CapabilityAuthorizationFixture.make()
      const issued = yield* fixture.operator.issue({ origin: "cli" })
      yield* Effect.forEach(["", "contains space", "secret.key", "é", "x".repeat(129), "first, second"], (key) => Effect.gen(function* () {
        yield* denied(yield* fixture.request({ headers: { authorization: `Bearer ${issued.bearer}`, "idempotency-key": key } }), 403, [issued.bearer])
      }))
      expect(fixture.domain.entered).toBe(0)
      yield* Effect.forEach(["K", "Case_Sensitive-09", "x".repeat(128)], (key) => Effect.gen(function* () {
        const response = yield* fixture.request({ headers: { authorization: `Bearer ${issued.bearer}`, "idempotency-key": key }, payload: claims })
        expect(response.status).toBe(200)
        expect((yield* CapabilityAuthorizationFixture.binding(response)).idempotencyKey).toBe(key)
      }))
    }))

  it.live("revoked, expired and scope-closed tokens fail before handler; configured authority also dies with Scope", () =>
    Effect.gen(function* () {
      const clock = { now: 1000 }
      const fixture = yield* CapabilityAuthorizationFixture.make({ now: () => clock.now })
      const revoked = yield* fixture.operator.issue({ origin: "sdk" })
      yield* fixture.operator.revoke(revoked.authority)
      yield* denied(yield* fixture.request({ headers: { authorization: `Bearer ${revoked.bearer}` } }), 401, [revoked.bearer])
      const expired = yield* fixture.operator.issue({ origin: "sdk", ttlMillis: 3_600_000 })
      clock.now += 3_600_000 - 1
      expect((yield* fixture.request({ headers: { authorization: `Bearer ${expired.bearer}` } })).status).toBe(200)
      clock.now += 1
      yield* denied(yield* fixture.request({ headers: { authorization: `Bearer ${expired.bearer}` } }), 401, [expired.bearer])
      const closed = yield* fixture.operator.issue({ origin: "sdk" })
      yield* fixture.closeAuthority
      yield* denied(yield* fixture.request({ headers: { authorization: `Bearer ${closed.bearer}` } }), 401)
      expect(fixture.domain.entered).toBe(1)
      expect((yield* fixture.health).status).toBe(200)
      const configured = yield* CapabilityAuthorizationFixture.make({ password: Option.some("secret:with-colon") })
      yield* configured.closeAuthority
      yield* denied(yield* configured.request({ headers: { authorization: basic } }), 401)
      expect(configured.domain.entered).toBe(0)
    }))

  it.live("revocation, expiry and Scope closure after suspension fence the next domain effect", () => Effect.gen(function* () {
    yield* Effect.forEach(["revoke", "expire", "close"] as const, (mode) => Effect.gen(function* () {
      const clock = { now: 1000 }
      const ready = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const fixture = yield* CapabilityAuthorizationFixture.make({ now: () => clock.now, onBinding: () =>
        Deferred.succeed(ready, undefined).pipe(Effect.andThen(Deferred.await(release))) })
      yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
      const issued = yield* fixture.operator.issue({ origin: "sdk" })
      const pending = yield* fixture.request({ headers: { authorization: `Bearer ${issued.bearer}` } }).pipe(Effect.forkChild)
      yield* Deferred.await(ready)
      if (mode === "revoke") yield* fixture.operator.revoke(issued.authority)
      if (mode === "expire") clock.now += 3_600_000
      if (mode === "close") yield* fixture.closeAuthority
      yield* Deferred.succeed(release, undefined)
      yield* denied(yield* Fiber.join(pending), 401)
      expect(fixture.domain.reads).toBe(0)
      expect(fixture.domain.effects).toBe(0)
    }))
  }))

  it.live("concurrent HTTP requests isolate private frames and reject cross-request bindings", () => Effect.gen(function* () {
    const ready = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const captured: CapabilityOperatorContract.Binding[] = []
    const fixture = yield* CapabilityAuthorizationFixture.make({ onBinding: (binding, operator) => Effect.gen(function* () {
      const arrival = captured.push(binding)
      if (arrival === 1) {
        yield* Deferred.succeed(ready, undefined)
        yield* Deferred.await(release)
      }
      if (arrival === 2) {
        const mismatch = yield* operator.validate(captured[0], CapabilityAuthorizationFixture.target).pipe(Effect.exit)
        expect(Exit.isFailure(mismatch)).toBe(true)
        if (Exit.isSuccess(mismatch)) return yield* Effect.die("Cross-request binding was accepted")
        const reason = mismatch.cause.reasons[0]
        expect(reason._tag === "Fail" && reason.error.code).toBe("invocation_binding_mismatch")
        yield* Deferred.succeed(release, undefined)
      }
      expect(yield* operator.require(CapabilityAuthorizationFixture.target)).toBe(binding)
    }) })
    yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
    const first = yield* fixture.operator.issue({ origin: "cli" })
    const second = yield* fixture.operator.issue({ origin: "desktop" })
    const pending = yield* fixture.request({ headers: { authorization: `Bearer ${first.bearer}`, "idempotency-key": "shared-idem" } }).pipe(Effect.forkChild)
    yield* Deferred.await(ready)
    const right = yield* fixture.request({ headers: { authorization: `Bearer ${second.bearer}`, "idempotency-key": "shared-idem" } })
    const left = yield* Fiber.join(pending)
    expect(left.status).toBe(200)
    expect(right.status).toBe(200)
    expect(yield* CapabilityAuthorizationFixture.binding(left)).toMatchObject({ origin: "cli", idempotencyKey: "shared-idem" })
    expect(yield* CapabilityAuthorizationFixture.binding(right)).toMatchObject({ origin: "desktop", idempotencyKey: "shared-idem" })
    expect(captured[0].authority).toBe(first.authority)
    expect(captured[1].authority).toBe(second.authority)
    expect(captured[0].requestID).not.toBe(captured[1].requestID)
    const outside = yield* fixture.operator.require(CapabilityAuthorizationFixture.target).pipe(Effect.flip)
    expect(outside.code).toBe("invocation_binding_missing")
  }))

  it.live("native endpoint errors are mapped selectively; mixed defects, interrupts and annotations survive middleware", () =>
    Effect.gen(function* () {
      const defect = new Error("lifecycle-defect")
      const native = new InvalidRequestError({ message: "Domain input rejected" })
      const failure = new Capability.Failure({ code: "authentication_required", message: "private-token-detail", detail: { secret: "private-secret" } })
      const later = new Capability.Failure({ code: "target_denied", message: "private-target-detail", detail: { secret: "private-target-secret" } })
      const mixed = Cause.fromReasons<Capability.Failure | InvalidRequestError>([
        ...Cause.fail(failure).reasons.map((reason) => reason.annotate(Context.makeUnsafe(new Map([["auth", "failure-annotation"]])))),
        ...Cause.fail(native).reasons.map((reason) => reason.annotate(Context.makeUnsafe(new Map([["native", "domain-annotation"]])))),
        ...Cause.fail(later).reasons.map((reason) => reason.annotate(Context.makeUnsafe(new Map([["target", "target-annotation"]])))),
        ...Cause.die(defect).reasons.map((reason) => reason.annotate(Context.makeUnsafe(new Map([["defect", "defect-annotation"]])))),
        ...Cause.interrupt(919).reasons.map((reason) => reason.annotate(Context.makeUnsafe(new Map([["interrupt", "interrupt-annotation"]])))),
      ])
      const fixture = yield* CapabilityAuthorizationFixture.make({ onBinding: () => Effect.failCause(mixed) })
      const issued = yield* fixture.operator.issue({ origin: "sdk" })
      yield* denied(yield* fixture.request({ headers: { authorization: `Bearer ${issued.bearer}` } }), 401,
        [issued.bearer, "private-token-detail", "private-secret", "private-target-detail", "private-target-secret"])
      expect(fixture.causes).toHaveLength(1)
      const reasons = fixture.causes[0].reasons
      expect(reasons.map((reason) => reason._tag)).toEqual(["Fail", "Fail", "Fail", "Die", "Interrupt"])
      expect(reasons.map((reason) => Object.fromEntries(reason.annotations))).toEqual([
        { auth: "failure-annotation" }, { native: "domain-annotation" }, { target: "target-annotation" },
        { defect: "defect-annotation" }, { interrupt: "interrupt-annotation" },
      ])
      const authenticationError = reasons[0]._tag === "Fail" && reasons[0].error
      const targetError = reasons[2]._tag === "Fail" && reasons[2].error
      expect(authenticationError).toBeInstanceOf(UnauthorizedError)
      expect(Schema.encodeUnknownSync(UnauthorizedError)(authenticationError)).toEqual({ _tag: "UnauthorizedError", message: "Authentication required" })
      expect(UnauthorizedError.ast.annotations?.httpApiStatus).toBe(401)
      expect(targetError).toBeInstanceOf(ForbiddenError)
      expect(Schema.encodeUnknownSync(ForbiddenError)(targetError)).toEqual({ _tag: "ForbiddenError", message: "Request denied" })
      expect(ForbiddenError.ast.annotations?.httpApiStatus).toBe(403)
      expect(reasons[1]._tag === "Fail" && reasons[1].error).toBe(native)
      expect(reasons[3]._tag === "Die" && reasons[3].defect).toBe(defect)
      expect(reasons[4]._tag === "Interrupt" && reasons[4].fiberId).toBe(919)
      expect(fixture.domain.effects).toBe(0)
      const authFailure = yield* CapabilityAuthorizationFixture.make({ onBinding: () => Effect.fail(
        new Capability.Failure({ code: "authentication_revoked", message: "private-revocation" }),
      ) })
      const auth = yield* authFailure.operator.issue({ origin: "sdk" })
      yield* denied(yield* authFailure.request({ headers: { authorization: `Bearer ${auth.bearer}` } }), 401)
      expect(authFailure.causes[0].reasons[0]._tag === "Fail" && authFailure.causes[0].reasons[0].error).toBeInstanceOf(UnauthorizedError)
      const nativeFixture = yield* CapabilityAuthorizationFixture.make({ onBinding: () => Effect.fail(native) })
      const nativeAuth = yield* nativeFixture.operator.issue({ origin: "sdk" })
      expect((yield* nativeFixture.request({ headers: { authorization: `Bearer ${nativeAuth.bearer}` } })).status).toBe(400)
    }))

  it.live("pure defects and interrupts remain lifecycle failures rather than authentication errors", () => Effect.gen(function* () {
    const defect = new Error("pure-defect")
    yield* Effect.forEach([Cause.die(defect), Cause.interrupt(818)], (cause) => Effect.gen(function* () {
      const fixture = yield* CapabilityAuthorizationFixture.make({ onBinding: () => Effect.failCause(cause) })
      const issued = yield* fixture.operator.issue({ origin: "sdk" })
      const response = yield* fixture.request({ headers: { authorization: `Bearer ${issued.bearer}` } })
      expect(response.status).not.toBe(401)
      expect(response.status).not.toBe(403)
      expect(fixture.causes[0].reasons).toEqual(cause.reasons)
      expect(fixture.domain.effects).toBe(0)
    }))
  }))
})
