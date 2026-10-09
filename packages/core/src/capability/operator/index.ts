export * as CapabilityOperator from "./index"

import { Capability } from "@orchestra/schema/capability"
import { Context, Effect } from "effect"
import { createHash, randomBytes } from "node:crypto"
import type { CapabilityOperatorContract } from "./contract"
import { CapabilityOperatorScope } from "./scope"

const issued = Symbol("CapabilityOperator.issued")
type Frame = CapabilityOperatorContract.Binding & { readonly [issued]: true }
type Entry = {
  readonly scope: CapabilityOperatorContract.GrantScope
  readonly scopeHash: string
  readonly origin: CapabilityOperatorContract.Origin
  readonly expires: number
  readonly digest?: string
  revoked: boolean
}
const Current = Context.Reference<Frame | undefined>("@orchestra/core/CapabilityOperator", {
  defaultValue: () => undefined,
})

export const make: CapabilityOperatorContract.Factory = (options) => {
  const captured = CapabilityOperatorScope.capture(options, CapabilityOperatorScope.options, true)
  return Effect.gen(function* () {
    if (!captured.ok) return yield* failure("target_denied")
    const input = captured.value
    const authorities = new WeakMap<CapabilityOperatorContract.Authority, Entry>()
    const frames = new WeakSet<Frame>()
    const bindings = new WeakSet<CapabilityOperatorContract.Binding>()
    const tokens = new Map<string, CapabilityOperatorContract.Authority>()
    const lifetime = { closed: false }

    function mint(entry: Entry) {
      // The frozen contract hides its brand. This is the only bridge from private minted objects.
      const authority = Object.freeze({ [issued]: true }) as unknown as CapabilityOperatorContract.Authority
      authorities.set(authority, entry)
      return authority
    }

    function active(authority: CapabilityOperatorContract.Authority, now: number) {
      const entry = authorities.get(authority)
      return !lifetime.closed && validTime(now) && entry && !entry.revoked && now < entry.expires ? entry : undefined
    }

    const configured = mint({ scope: input.scope, scopeHash: CapabilityOperatorScope.hash(input.scope),
      origin: "configured-auth", expires: Infinity, revoked: false })
    if (!validTime(input.now())) return yield* failure("target_denied")
    yield* Effect.addFinalizer(() => Effect.sync(() => {
      lifetime.closed = true
      tokens.clear()
    }))

    const issue: CapabilityOperatorContract.Interface["issue"] = (supplied) => {
      const captured = CapabilityOperatorScope.capture(supplied, (value) => {
        const options = CapabilityOperatorScope.record(value, ["origin", "scope", "ttlMillis"])
        if (options.origin !== "desktop" && options.origin !== "cli" && options.origin !== "sdk")
          throw new Error("Invalid operator data")
        return { origin: options.origin, scope: options.scope === undefined ? input.scope : CapabilityOperatorScope.grant(options.scope),
          ttlMillis: options.ttlMillis === undefined ? input.ttlMillis : CapabilityOperatorScope.positive(options.ttlMillis) } as const
      })
      return Effect.suspend(() => {
        if (!captured.ok || !CapabilityOperatorScope.subset(captured.value.scope, input.scope))
          return Effect.fail(failure("target_denied"))
        const now = input.now()
        if (lifetime.closed || !validTime(now)) return Effect.fail(failure("authentication_required"))
        const expires = now + captured.value.ttlMillis
        if (!Number.isFinite(expires) || expires > Number.MAX_SAFE_INTEGER || expires <= now)
          return Effect.fail(failure("target_denied"))
        tokens.forEach((authority, digest) => {
          if (!active(authority, now)) tokens.delete(digest)
        })
        if (tokens.size >= input.maxCapabilities) return Effect.fail(failure("quota_exceeded"))
        const bearer = randomBytes(32).toString("base64url")
        const digest = tokenHash(bearer)
        const authority = mint({ scope: captured.value.scope, scopeHash: CapabilityOperatorScope.hash(captured.value.scope),
          origin: captured.value.origin, expires, digest, revoked: false })
        tokens.set(digest, authority)
        return Effect.succeed(Object.freeze({ bearer, authority }))
      })
    }

    const authenticate: CapabilityOperatorContract.Interface["authenticate"] = (bearer) => Effect.suspend(() => {
      if (typeof bearer !== "string" || !/^[A-Za-z0-9_-]{43}(?![\s\S])/.test(bearer))
        return Effect.fail(failure("authentication_required"))
      const authority = tokens.get(tokenHash(bearer))
      if (!authority || !active(authority, input.now())) return Effect.fail(failure("authentication_required"))
      return Effect.succeed(authority)
    })

    const revoke: CapabilityOperatorContract.Interface["revoke"] = (authority) => Effect.suspend(() => {
      const entry = authorities.get(authority)
      if (lifetime.closed || !entry) return Effect.fail(failure("authentication_required"))
      entry.revoked = true
      if (entry.digest !== undefined) tokens.delete(entry.digest)
      return Effect.void
    })

    const withRequest = <A, E, R>(authority: CapabilityOperatorContract.Authority,
      supplied: Readonly<{ requestID: string; idempotencyKey?: string }>, effect: Effect.Effect<A, E, R>) => {
      const captured = CapabilityOperatorScope.capture(supplied, CapabilityOperatorScope.request)
      return Effect.suspend<A, E | Capability.Failure, R>(() => {
        if (!captured.ok) return Effect.fail(failure("invocation_binding_mismatch"))
        const entry = active(authority, input.now())
        if (!entry) return Effect.fail(failure("authentication_required"))
        const frame: Frame = Object.freeze({ [issued]: true as const, authority, principal: input.principal,
          origin: entry.origin, scopeHash: entry.scopeHash, ...captured.value })
        frames.add(frame)
        return Effect.provideService(effect, Current, frame)
      })
    }

    const require: CapabilityOperatorContract.Interface["require"] = (target) => {
      const captured = CapabilityOperatorScope.capture(target, CapabilityOperatorScope.target)
      return Effect.gen(function* () {
        const frame = yield* Current
        if (frame === undefined) return yield* failure("invocation_binding_missing")
        if (!frames.has(frame) || frame[issued] !== true) return yield* failure("invocation_binding_mismatch")
        const entry = active(frame.authority, input.now())
        if (!entry) return yield* failure("authentication_required")
        if (!captured.ok || !CapabilityOperatorScope.allows(entry.scope, captured.value))
          return yield* failure("target_denied")
        bindings.add(frame)
        return frame
      })
    }

    const validate: CapabilityOperatorContract.Interface["validate"] = (binding, target) => {
      const captured = CapabilityOperatorScope.capture(target, CapabilityOperatorScope.target)
      return Effect.gen(function* () {
        const frame = yield* Current
        if (frame === undefined) return yield* failure("invocation_binding_missing")
        if (frame !== binding || !frames.has(frame) || !bindings.has(binding) || frame[issued] !== true)
          return yield* failure("invocation_binding_mismatch")
        const entry = active(frame.authority, input.now())
        if (!entry) return yield* failure("authentication_required")
        if (!captured.ok || !CapabilityOperatorScope.allows(entry.scope, captured.value))
          return yield* failure("target_denied")
      })
    }

    return Object.freeze({ configured, issue, authenticate, revoke, withRequest, require, validate })
  })
}

function validTime(now: number) {
  return typeof now === "number" && Number.isFinite(now) && now >= 0 && now <= Number.MAX_SAFE_INTEGER
}

function tokenHash(bearer: string) {
  return createHash("sha256").update(bearer).digest("hex")
}

function failure(code: Capability.ErrorCode) {
  return new Capability.Failure({ code, message: code === "target_denied" ? "Capability action is not authorized" :
    code === "quota_exceeded" ? "Capability quota is exhausted" :
    code === "invocation_binding_missing" ? "Capability invocation binding is missing" :
    code === "invocation_binding_mismatch" ? "Capability invocation binding does not match" : "Capability authentication is required" })
}
