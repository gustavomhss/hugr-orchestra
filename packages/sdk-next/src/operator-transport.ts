import type { CapabilityOperatorContract } from "@orchestra/core/capability/operator/contract"
import { Effect, Exit, Semaphore } from "effect"

/** Owning host transport: bearer renewal never delegates authority to request bodies or foreign headers. */
export const makeOperatorTransport = Effect.fn("Orchestra.makeOperatorTransport")(function* (
  handler: (request: Request) => Promise<Response>, operator: CapabilityOperatorContract.Interface,
) {
  const first = yield* operator.issue({ origin: "sdk" })
  const current = { credential: first }
  const renewal = Semaphore.makeUnsafe(1)
  const fetch = Object.assign((input: RequestInfo | URL, init?: RequestInit) => Effect.runPromise(Effect.gen(function* () {
    const request = new Request(input, init)
    // Preserve explicit per-request credentials. Only our captured default is eligible for host renewal.
    if (request.headers.get("authorization") !== `Bearer ${first.bearer}`) return yield* Effect.promise(() => handler(request))
    const credential = yield* renewal.withPermit(Effect.gen(function* () {
      const authenticated = yield* operator.authenticate(current.credential.bearer).pipe(Effect.exit)
      if (Exit.isSuccess(authenticated)) return current.credential
      if (!authenticated.cause.reasons.length || !authenticated.cause.reasons.every((reason) => reason._tag === "Fail" &&
        reason.error._tag === "Capability.Failure" && reason.error.code === "authentication_required"))
        return yield* Effect.failCause(authenticated.cause)
      current.credential = yield* operator.issue({ origin: "sdk" })
      return current.credential
    }))
    request.headers.set("authorization", `Bearer ${credential.bearer}`)
    return yield* Effect.promise(() => handler(request))
  })), { preconnect: () => undefined }) satisfies typeof globalThis.fetch
  return { fetch, headers: Object.freeze({ Authorization: `Bearer ${first.bearer}` }) }
})
