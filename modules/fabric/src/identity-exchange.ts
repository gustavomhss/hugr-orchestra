export * as FabricIdentityExchange from "./identity-exchange"

import { createHash } from "node:crypto"
import { Deferred, Effect, Exit, Option, Schema } from "effect"
import type { INetworkModule, NetworkRequestOptions, NetworkResponse } from "@azure/msal-node"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { SqlError } from "effect/unstable/sql/SqlError"
import { eq } from "drizzle-orm"
import { FabricIdentityAttempt } from "@orchestra/schema/fabric-identity-attempt"
import { FabricIdentityAttemptAccess } from "./identity-attempt-access"
import { FabricIdentityDiscovery } from "./identity-discovery"
import { FabricIdentityEnvelope } from "./identity-envelope"
import { FabricIdentityExchangeMaterial } from "./identity-exchange-material"
import { FabricIdentityMsal } from "./identity-msal"
import { FabricIdentitySecretTable } from "./identity-secret/sql"
import { FabricIdentityTokenHttp } from "./identity-token-http"
import { FabricIdentityTokens } from "./identity-token"
import type { FabricIdentityExchangeContract } from "./identity-exchange-contract"
import type { FabricIdentityMsalContract } from "./identity-msal-contract"

type Entry = Readonly<{
  selection: FabricIdentityAttempt.Selection
  binding: string
  secret: string
  candidate: FabricIdentityMsalContract.Candidate
}>
type Request = Readonly<{
  url: string
  options?: NetworkRequestOptions
  resolve: (response: NetworkResponse<unknown>) => void
  reject: (error: FabricIdentityTokens.Failure) => void
}>
const Exchange = Schema.Struct({ ...FabricIdentityAttempt.Selection.fields, ticket: Schema.Unknown })
const Consumption = Schema.Struct({ ...FabricIdentityAttempt.Selection.fields, completion: Schema.Unknown })

/** Private Scope-owned host. The JS library's mailbox never carries a frame, services or execution authority. */
export const make: FabricIdentityExchangeContract.Factory = (options) => {
  const config = {
    ...options,
    network: options.network ? { ...options.network } : undefined,
    certificate: options.certificate ? { ...options.certificate } : undefined,
  }
  const maximum = options.maxEntries ?? 16
  return Effect.gen(function* () {
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 64)
      return yield* FabricIdentityAttemptAccess.failure("invalid-input")
    const access = yield* FabricIdentityAttemptAccess.make(config)
    const reader = yield* FabricIdentityExchangeMaterial.make(config)
    const discovery = yield* FabricIdentityDiscovery.make(config)
    // Validate native configuration before a ticket may be consumed, even though the worker dispatches as an Effect.
    yield* FabricIdentityTokenHttp.make(config)
    const entries = new Map<FabricIdentityExchangeContract.Completion, Entry>()
    const stops = new Set<() => void>()
    const state = { closed: false, pending: 0 }
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        state.closed = true
        stops.forEach((stop) => stop())
        stops.clear()
        entries.clear()
      }),
    )

    function check(
      admitted: FabricIdentityAttemptAccess.Admission,
      selection: FabricIdentityAttempt.Selection,
      expected?: Readonly<{ binding: string; secret: string }>,
    ) {
      return Effect.gen(function* () {
        if (state.closed || (yield* access.inTransaction))
          return yield* FabricIdentityAttemptAccess.failure("unavailable")
        const row = yield* access.selected(access.database.db, admitted, selection.attempt)
        if (row.state !== "exchanging" || row.revision !== 3)
          return yield* FabricIdentityAttemptAccess.failure("conflict")
        const at = yield* access.instant()
        if (at < row.time_created) return yield* FabricIdentityAttemptAccess.failure("unavailable")
        if (at >= row.expires_at) return yield* FabricIdentityAttemptAccess.failure("expired")
        const secret = yield* access.database.db
          .select()
          .from(FabricIdentitySecretTable)
          .where(eq(FabricIdentitySecretTable.id, row.id))
          .get()
        if (!secret || secret.revision !== 2 || secret.bytes !== Buffer.byteLength(secret.sealed))
          return yield* FabricIdentityAttemptAccess.failure("unavailable")
        const snapshot = {
          binding: FabricIdentityEnvelope.binding(row),
          secret: createHash("sha256").update(secret.sealed).digest("hex"),
        }
        if (expected && (expected.binding !== snapshot.binding || expected.secret !== snapshot.secret))
          return yield* FabricIdentityAttemptAccess.failure("conflict")
        yield* access.guard(access.database.db, admitted)
        return snapshot
      })
    }

    const exchange: FabricIdentityExchangeContract.Interface["exchange"] = (supplied) => {
      const decoded = Schema.decodeUnknownOption(Exchange)(supplied, { onExcessProperty: "error" })
      const value = Option.isSome(decoded)
        ? { context: { ...decoded.value.context }, attempt: { ...decoded.value.attempt }, ticket: decoded.value.ticket }
        : undefined
      return storeErrors(
        Effect.scoped(
          Effect.gen(function* () {
            if (state.closed) return yield* FabricIdentityAttemptAccess.failure("unavailable")
            if (!value || typeof value.ticket !== "object" || value.ticket === null)
              return yield* FabricIdentityAttemptAccess.failure("invalid-input")
            const selection = { context: value.context, attempt: value.attempt }
            const admitted = yield* access.admit(selection.context, "fabric.identity.exchange", {
              kind: "fabric.identity-attempt",
              id: selection.attempt.id,
            })
            const snapshot = yield* check(admitted, selection)
            if (entries.size + state.pending >= maximum) return yield* FabricIdentityAttemptAccess.failure("limit")
            state.pending++
            yield* Effect.addFinalizer(() =>
              Effect.sync(() => {
                state.pending--
              }),
            )
            const material = yield* reader.read(selection)
            const verifier = yield* discovery.load()
            const slot = yield* Deferred.make<Request>()
            const abort = new AbortController()
            const mailbox = {
              offered: false,
              closed: false,
              request: undefined as Request | undefined,
              failure: undefined as FabricIdentityExchangeContract.Error | undefined,
            }
            const stop = () => {
              mailbox.closed = true
              abort.abort()
              mailbox.request?.reject(unavailable())
            }
            stops.add(stop)
            yield* Effect.addFinalizer(() =>
              Effect.sync(() => {
                stop()
                stops.delete(stop)
              }),
            )
            const network: INetworkModule = {
              sendGetRequestAsync: async () => {
                throw unavailable()
              },
              sendPostRequestAsync: <T>(url: string, request?: NetworkRequestOptions): Promise<NetworkResponse<T>> =>
                new Promise((resolve, reject) => {
                  if (
                    mailbox.closed ||
                    mailbox.offered ||
                    typeof request?.body !== "string" ||
                    Buffer.byteLength(request.body) > 32768
                  ) {
                    reject(unavailable())
                    return
                  }
                  mailbox.offered = true
                  // MSAL's generic JSON type is untrusted; IMX01 validates before returning any candidate.
                  const message: Request = {
                    url,
                    options: {
                      body: request.body,
                      correlationId: request.correlationId,
                      headers: request.headers ? { ...request.headers } : undefined,
                    },
                    resolve: (response) => resolve({ ...response, body: response.body as T }),
                    reject,
                  }
                  mailbox.request = message
                  Deferred.doneUnsafe(slot, Effect.succeed(message))
                }),
            }
            const transport = {
              ...network,
              bind: (signal: AbortSignal) => {
                if (signal.aborted) stop()
                signal.addEventListener("abort", stop, { once: true })
                return network
              },
            }
            const client = yield* FabricIdentityMsal.make({ ...config, verifier, transport })
            yield* check(admitted, selection, snapshot)
            const consumed = yield* config.callbacks.consume({
              ...selection,
              ticket: value.ticket as Parameters<typeof config.callbacks.consume>[0]["ticket"],
            })
            const admission = storeErrors(check(admitted, selection, snapshot)).pipe(Effect.asVoid)
            yield* Effect.forkScoped(
              Effect.gen(function* () {
                const message = yield* Deferred.await(slot)
                const exit = yield* Effect.exit(
                  FabricIdentityTokenHttp.dispatch(message.url, message.options, {
                    network: config.network,
                    timeoutMs: config.timeoutMs ?? 10000,
                    signal: abort.signal,
                    admit: admission,
                  }),
                )
                if (Exit.isSuccess(exit)) {
                  message.resolve(exit.value)
                  return
                }
                const reason = exit.cause.reasons[0]
                if (reason?._tag === "Fail") mailbox.failure = reason.error
                message.reject(unavailable())
              }).pipe(
                Effect.onExit(() =>
                  Effect.sync(() => {
                    if (mailbox.closed) mailbox.request?.reject(unavailable())
                  }),
                ),
              ),
            )
            const candidate = yield* client
              .exchange({ code: consumed.code, material })
              .pipe(Effect.catch((error) => Effect.fail(mailbox.failure ?? error)))
            yield* check(admitted, selection, snapshot)
            const completion = Object.freeze({}) as FabricIdentityExchangeContract.Completion
            entries.set(completion, { selection, ...snapshot, candidate })
            return completion
          }),
        ),
      )
    }

    const consume: FabricIdentityExchangeContract.Interface["consume"] = (supplied) => {
      const decoded = Schema.decodeUnknownOption(Consumption)(supplied, { onExcessProperty: "error" })
      const value = Option.isSome(decoded)
        ? {
            context: { ...decoded.value.context },
            attempt: { ...decoded.value.attempt },
            completion: decoded.value.completion,
          }
        : undefined
      return storeErrors(
        Effect.gen(function* () {
          if (state.closed) return yield* FabricIdentityAttemptAccess.failure("unavailable")
          if (!value || typeof value.completion !== "object" || value.completion === null)
            return yield* FabricIdentityAttemptAccess.failure("invalid-input")
          const admitted = yield* access.admit(value.context, "fabric.identity.exchange", {
            kind: "fabric.identity-attempt",
            id: value.attempt.id,
          })
          const completion = value.completion as FabricIdentityExchangeContract.Completion
          const entry = entries.get(completion)
          if (
            !entry ||
            entry.selection.context.id !== value.context.id ||
            entry.selection.context.generation !== value.context.generation ||
            entry.selection.attempt.id !== value.attempt.id ||
            entry.selection.attempt.revision !== value.attempt.revision
          )
            return yield* FabricIdentityAttemptAccess.failure("denied")
          yield* check(admitted, value, entry)
          if (state.closed || entries.get(completion) !== entry)
            return yield* FabricIdentityAttemptAccess.failure("denied")
          entries.delete(completion)
          return entry.candidate
        }),
      )
    }
    return Object.freeze({ exchange, consume }) satisfies FabricIdentityExchangeContract.Interface
  })
}

function storeErrors<A, R>(
  effect: Effect.Effect<A, FabricIdentityExchangeContract.Error | SqlError | EffectDrizzleQueryError, R>,
) {
  return Effect.mapError(effect, (error) =>
    error instanceof SqlError || error instanceof EffectDrizzleQueryError
      ? FabricIdentityAttemptAccess.failure("unavailable")
      : error,
  )
}

function unavailable() {
  return new FabricIdentityTokens.Failure({ code: "unavailable", message: "Fabric contextual exchange is unavailable" })
}
