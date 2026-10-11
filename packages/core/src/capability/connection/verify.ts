export * as CapabilityConnectionVerification from "./verify"

import { Capability } from "@orchestra/schema/capability"
import { CapabilitySetup } from "@orchestra/schema/capability-setup"
import { Cause, Context, Effect, Option, Schema } from "effect"
import { createHash } from "node:crypto"
import { types } from "node:util"
import { Failure, request, validateOptions, type Options } from "../channel/http"
import { CapabilityOperatorScope } from "../operator/scope"
import type { CapabilityConnectionSetupContract } from "./setup-contract"
import type { CapabilityVerifierContract } from "./verifiers/contract"
import { CapabilityVerifiers } from "./verifiers/index"

export type { Options } from "../channel/http"

const failure = (code: Capability.ErrorCode) => new Capability.Failure({ code,
  message: "Capability connection verification is unavailable" })

/** Identity only. The setup facade checks its own operator before calling this verifier. */
export const make = (options: Options = {}) => {
  const transport = capture(options, ["fixtureOrigin", "timeoutMs", "maxResponseBytes"], (value) => {
    const decoded = Schema.decodeUnknownOption(Schema.Struct({ fixtureOrigin: Schema.optionalKey(Schema.NonEmptyString),
      timeoutMs: Schema.optionalKey(Schema.Number), maxResponseBytes: Schema.optionalKey(Schema.Number),
    }))(value)
    if (Option.isNone(decoded) || !validateOptions(decoded.value)) throw new Error("Invalid verification options")
    return Object.freeze(decoded.value)
  })
  return Effect.gen(function* () {
    if (!transport.ok) return yield* failure("unsupported_schema")
    const verify: CapabilityConnectionSetupContract.Verifier["verify"] = (input) => {
      // Capture at call time, before scheduling any effects; only this flat data shape is accepted.
      const captured = capture(input, ["provider", "key", "label"], (value) => {
        const decoded = Schema.decodeUnknownOption(CapabilitySetup.Input)(value)
        if (Option.isNone(decoded)) throw new Error("Invalid verification input")
        return Object.freeze(decoded.value)
      })
      return Effect.gen(function* () {
        if (!captured.ok) return yield* failure("unsupported_schema")
        return yield* prove(CapabilityVerifiers.descriptor(captured.value.provider), captured.value.key, transport.value)
      })
    }
    return Object.freeze({ verify }) satisfies CapabilityConnectionSetupContract.Verifier
  })
}

/**
 * Descriptor dispatch. Exported so a test descriptor can prove the shared rules without joining the registry.
 * Expects already-captured input: a trusted descriptor and a plain key string; options are re-validated here.
 */
export function prove(descriptor: CapabilityVerifierContract.Descriptor, key: string, options: Options) {
  return Effect.gen(function* () {
    // Whitespace or control characters could split headers; refused here so no caller of this hook can skip it.
    if (!validateOptions(options) || /[\s\u0000-\u001f\u007f]/.test(key)) return yield* failure("unsupported_schema")
    // Before any network call. A fresh anchored, non-global copy matches the WHOLE key without shared lastIndex state.
    if (descriptor.keyPattern && !new RegExp(`^(?:${descriptor.keyPattern.source})(?![\\s\\S])`,
      descriptor.keyPattern.flags.replace(/[gmy]/g, "")).test(key)) return yield* failure("unsupported_operation")
    // Origin, auth scheme and headers are descriptor-fixed; only the trusted fixture may swap the origin.
    const call: CapabilityVerifierContract.Call = (route) => request(descriptor.origin, descriptor.authorization(key),
      { method: route.method, path: route.path, body: route.body, headers: descriptor.headers }, options).pipe(
      // Map the whole Cause without dropping other failures, defects, interrupts or annotations.
      Effect.catchCause((cause) => Effect.failCause(transportCause(cause))),
    )
    const identified = yield* descriptor.identify(call)
    // Credential-only identify proves validity alone and returns the literal "key"; anything else fails `accepts`.
    const subjectID = descriptor.verification === "verified" ? identified
      : identified === "key" ? CapabilityVerifiers.fingerprint(key) : ""
    if (!CapabilityVerifiers.accepts(descriptor, subjectID, key)) return yield* failure("connection_unavailable")
    // This fingerprint binds identity and exact key, not vendor action entitlement.
    return Object.freeze({ provider: descriptor.provider, endpoint: descriptor.endpoint, subjectID,
      integrationID: descriptor.integrationID,
      scopeHash: createHash("sha256").update(JSON.stringify([descriptor.provider, descriptor.endpoint, subjectID,
        createHash("sha256").update(key).digest("hex")])).digest("hex"),
    }) satisfies CapabilityConnectionSetupContract.Proof
  })
}

/** Pure projection: mixed errors retain identity; repeated reasons and annotations survive normalization. */
export function transportCause(cause: Cause.Cause<Capability.Failure | Failure>) {
  return Cause.fromReasons<Capability.Failure>(cause.reasons.map((reason) => reason._tag === "Fail"
    ? Cause.makeFailReason(reason.error instanceof Failure ? failure(
      reason.error.reason === "http" && (reason.error.status === 401 || reason.error.status === 403)
        ? "authentication_required" : "connection_unavailable",
    ) : reason.error).annotate(Context.makeUnsafe(new Map(reason.annotations))) : reason))
}

/** Reject proxies before reflection, and nested objects before the shared descriptor copier visits them. */
function capture<A>(input: unknown, allowed: readonly string[], parse: (value: unknown) => A) {
  if (!input || typeof input !== "object" || types.isProxy(input)) return { ok: false } as const
  const keys = Reflect.ownKeys(input)
  if (keys.length > allowed.length || keys.some((key) => {
    if (typeof key !== "string" || !allowed.includes(key)) return true
    const descriptor = Object.getOwnPropertyDescriptor(input, key)
    return !descriptor || !("value" in descriptor) || !descriptor.enumerable ||
      (descriptor.value !== null && ["object", "function", "symbol", "bigint"].includes(typeof descriptor.value))
  })) return { ok: false } as const
  return CapabilityOperatorScope.capture(input, parse)
}
