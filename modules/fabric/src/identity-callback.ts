export * as FabricIdentityCallbacks from "./identity-callback"

import { Capability } from "@orchestra/schema/capability"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { FabricIdentityAttempt } from "@orchestra/schema/fabric-identity-attempt"
import { Effect, Option, Schema } from "effect"
import { and, eq } from "drizzle-orm"
import { createHash } from "node:crypto"
import { FabricIdentityAttemptAccess } from "./identity-attempt-access"
import { FabricIdentityPreparation } from "./identity-preparation"
import { FabricIdentityProfile } from "./identity-profile"
import { FabricIdentityMaterial } from "./identity-material"
import { FabricIdentityAttemptTable } from "./identity-attempt/sql"
import { FabricIdentitySecretTable } from "./identity-secret/sql"
import type { FabricIdentityCallbacksContract } from "./identity-callback-contract"

type Entry = Readonly<{
  context: FabricContext.Ref
  attempt: FabricIdentityAttempt.Ref
  state: string
  createdAt: number
  expiresAt: number
  received?: FabricIdentityProfile.Callback
}>
type Delivery = Readonly<{
  context: FabricContext.Ref
  attempt: FabricIdentityAttempt.Ref
  code: string
  principal: string
  storageID: string
  profileHash: string
  createdAt: number
  expiresAt: number
}>
const Consumption = Schema.Struct({ ...FabricIdentityAttempt.Selection.fields, ticket: Schema.Unknown })

/** One host/profile/process Scope. Public receive is deliberately unable to obtain a database, cipher or operator. */
export const make: FabricIdentityCallbacksContract.Factory = (options) => {
  const maximum = options.maxEntries ?? 64
  const profile = options.profile
  const now = options.now ?? Date.now
  return Effect.gen(function* () {
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 256)
      return yield* FabricIdentityAttemptAccess.failure("invalid-input")
    const access = yield* FabricIdentityAttemptAccess.make(options)
    const preparation = yield* FabricIdentityPreparation.make(options)
    const entries = new Map<string, Entry>()
    const tickets = new Map<object, Delivery>()
    const state = { closed: false }
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        state.closed = true
        entries.clear()
        tickets.clear()
      }),
    )

    function prune(at: number) {
      entries.forEach((entry, key) => {
        if (at >= entry.expiresAt) entries.delete(key)
      })
      tickets.forEach((entry, key) => {
        if (at >= entry.expiresAt) tickets.delete(key)
      })
    }

    const register: FabricIdentityCallbacksContract.Interface["register"] = (supplied) => {
      const input = capture(supplied)
      return FabricIdentityAttemptAccess.storageErrors(
        Effect.gen(function* () {
          if (state.closed) return yield* FabricIdentityAttemptAccess.failure("unavailable")
          if (Option.isNone(input)) return yield* FabricIdentityAttemptAccess.failure("invalid-input")
          const value = input.value
          const admitted = yield* access.admit(value.context, "fabric.identity.callback.register", {
            kind: "fabric.identity-attempt",
            id: value.attempt.id,
          })
          prune(yield* access.instant())
          const previous = [...entries.values()].find((entry) => entry.attempt.id === value.attempt.id)
          if (!previous && entries.size + tickets.size >= maximum)
            return yield* FabricIdentityAttemptAccess.failure("limit")
          const ready = yield* preparation.prepare(value)
          const row = yield* access.selected(access.database.db, admitted, ready.attempt)
          const at = yield* access.instant()
          if (at < row.time_created) return yield* FabricIdentityAttemptAccess.failure("unavailable")
          if (at >= row.expires_at) return yield* FabricIdentityAttemptAccess.failure("expired")
          if (row.state !== "pending" || row.revision !== 2)
            return yield* FabricIdentityAttemptAccess.failure("conflict")
          const opaque = new URL(ready.authorizationURL).searchParams.get("state")
          if (!Schema.is(FabricIdentityMaterial.Material.fields.state)(opaque))
            return yield* FabricIdentityAttemptAccess.failure("unavailable")
          const key = hash(opaque)
          const existing = entries.get(key)
          if (
            existing &&
            (existing.attempt.id !== row.id ||
              existing.context.id !== value.context.id ||
              existing.context.generation !== value.context.generation ||
              existing.expiresAt !== row.expires_at)
          )
            return yield* FabricIdentityAttemptAccess.failure("denied")
          if (state.closed) return yield* FabricIdentityAttemptAccess.failure("unavailable")
          if (!existing && entries.size + tickets.size >= maximum)
            return yield* FabricIdentityAttemptAccess.failure("limit")
          if (!existing)
            entries.set(key, {
              context: value.context,
              attempt: { ...ready.attempt },
              state: opaque,
              createdAt: row.time_created,
              expiresAt: row.expires_at,
            })
          return ready
        }),
      )
    }

    const receive: FabricIdentityCallbacksContract.Interface["receive"] = (input) => {
      if (state.closed || typeof input !== "string" || Buffer.byteLength(input) > 16384 || !URL.canParse(input)) return
      const at = readClock(now)
      if (at === undefined) return
      prune(at)
      const opaque = new URL(input).searchParams.get("state")
      if (!opaque) return
      const key = hash(opaque)
      const entry = entries.get(key)
      if (!entry || entry.received || at < entry.createdAt || at >= entry.expiresAt) return
      const parsed = FabricIdentityProfile.callback(profile, { url: input, expectedState: entry.state })
      if (!parsed.ok) return
      entries.set(key, { ...entry, received: parsed.value })
    }

    const claim: FabricIdentityCallbacksContract.Interface["claim"] = (supplied) => {
      const input = capture(supplied)
      return FabricIdentityAttemptAccess.storageErrors(
        Effect.gen(function* () {
          if (state.closed) return yield* FabricIdentityAttemptAccess.failure("unavailable")
          if (Option.isNone(input)) return yield* FabricIdentityAttemptAccess.failure("invalid-input")
          const value = input.value
          const admitted = yield* access.admit(value.context, "fabric.identity.callback.claim", {
            kind: "fabric.identity-attempt",
            id: value.attempt.id,
          })
          const found = [...entries.entries()].find(([, entry]) => entry.attempt.id === value.attempt.id)
          const entry = found?.[1]
          const received = entry?.received
          yield* access.guard(access.database.db, admitted)
          const published = yield* access.database.db.transaction(
            (tx) =>
              Effect.gen(function* () {
                const row = yield* access.selected(tx, admitted, value.attempt)
                const at = yield* access.instant()
                if (at < row.time_created) return yield* FabricIdentityAttemptAccess.failure("unavailable")
                if (at >= row.expires_at) return yield* FabricIdentityAttemptAccess.failure("expired")
                if (row.state !== "pending" || row.revision !== 2)
                  return yield* FabricIdentityAttemptAccess.failure("conflict")
                if (!entry || !received) return yield* FabricIdentityAttemptAccess.failure("unavailable")
                if (
                  entry.context.id !== value.context.id ||
                  entry.context.generation !== value.context.generation ||
                  entry.attempt.revision !== row.revision ||
                  entry.createdAt !== row.time_created ||
                  entry.expiresAt !== row.expires_at
                )
                  return yield* FabricIdentityAttemptAccess.failure("denied")
                const next = received.outcome === "code" ? ("exchanging" as const) : ("denied" as const)
                const updated = yield* tx
                  .update(FabricIdentityAttemptTable)
                  .set({ state: next, revision: 3 })
                  .where(
                    and(
                      eq(FabricIdentityAttemptTable.id, row.id),
                      eq(FabricIdentityAttemptTable.state, "pending"),
                      eq(FabricIdentityAttemptTable.revision, 2),
                    ),
                  )
                  .returning({ id: FabricIdentityAttemptTable.id, revision: FabricIdentityAttemptTable.revision })
                  .get()
                if (!updated) return yield* FabricIdentityAttemptAccess.failure("conflict")
                if (next === "denied")
                  yield* tx.delete(FabricIdentitySecretTable).where(eq(FabricIdentitySecretTable.id, row.id)).run()
                yield* access.guard(tx, admitted)
                return updated
              }),
            { behavior: "immediate" },
          )
          yield* access.guard(access.database.db, admitted)
          if (!found || !entry || !received || state.closed || entries.get(found[0]) !== entry)
            return yield* unknownOutcome()
          const at = yield* access.instant()
          if (at < entry.createdAt) return yield* FabricIdentityAttemptAccess.failure("unavailable")
          if (at >= entry.expiresAt) return yield* FabricIdentityAttemptAccess.failure("expired")
          const ref = Object.freeze({ ...published })
          entries.delete(found[0])
          if (received.outcome === "denied") return { attempt: ref, outcome: "denied" as const }
          // The opaque identity is local to this Scope. Its presence never substitutes for access.admit/guard below.
          const ticket = Object.freeze({}) as FabricIdentityCallbacksContract.Ticket
          tickets.set(ticket, {
            context: { ...value.context },
            attempt: ref,
            code: received.code,
            principal: admitted.binding.principal,
            storageID: access.storageID,
            profileHash: access.profileHash,
            createdAt: entry.createdAt,
            expiresAt: entry.expiresAt,
          })
          return { attempt: ref, outcome: "claimed" as const, ticket }
        }),
      )
    }

    const consume: FabricIdentityCallbacksContract.Interface["consume"] = (supplied) => {
      const input = Schema.decodeUnknownOption(Consumption)(supplied, { onExcessProperty: "error" })
      const selection = Option.isSome(input)
        ? capture({ context: input.value.context, attempt: input.value.attempt })
        : Option.none()
      const ticket = Option.isSome(input) ? input.value.ticket : undefined
      return FabricIdentityAttemptAccess.storageErrors(
        Effect.gen(function* () {
          if (state.closed) return yield* FabricIdentityAttemptAccess.failure("unavailable")
          if (Option.isNone(input) || Option.isNone(selection))
            return yield* FabricIdentityAttemptAccess.failure("invalid-input")
          if (typeof ticket !== "object" || ticket === null) return yield* FabricIdentityAttemptAccess.failure("denied")
          const value = selection.value
          const admitted = yield* access.admit(value.context, "fabric.identity.exchange", {
            kind: "fabric.identity-attempt",
            id: value.attempt.id,
          })
          const row = yield* access.selected(access.database.db, admitted, value.attempt)
          if (row.state !== "exchanging" || row.revision !== 3)
            return yield* FabricIdentityAttemptAccess.failure("conflict")
          const entry = tickets.get(ticket)
          if (
            !entry ||
            entry.context.id !== value.context.id ||
            entry.context.generation !== value.context.generation ||
            entry.attempt.id !== row.id ||
            entry.attempt.revision !== row.revision ||
            entry.principal !== admitted.binding.principal ||
            entry.storageID !== access.storageID ||
            entry.profileHash !== access.profileHash ||
            entry.expiresAt !== row.expires_at
          )
            return yield* FabricIdentityAttemptAccess.failure("denied")
          const at = yield* access.instant()
          if (at < entry.createdAt) return yield* FabricIdentityAttemptAccess.failure("unavailable")
          if (at >= entry.expiresAt) return yield* FabricIdentityAttemptAccess.failure("expired")
          yield* access.guard(access.database.db, admitted)
          const latest = yield* access.selected(access.database.db, admitted, value.attempt)
          if (latest.state !== "exchanging") return yield* FabricIdentityAttemptAccess.failure("conflict")
          if (state.closed || tickets.get(ticket) !== entry) return yield* FabricIdentityAttemptAccess.failure("denied")
          tickets.delete(ticket)
          return { code: entry.code }
        }),
      )
    }

    return Object.freeze({ register, receive, claim, consume }) satisfies FabricIdentityCallbacksContract.Interface
  })
}

function capture(supplied: unknown) {
  const decoded = Schema.decodeUnknownOption(FabricIdentityAttempt.Selection)(supplied)
  if (
    Option.isNone(decoded) ||
    !Number.isSafeInteger(decoded.value.context.generation) ||
    !Number.isSafeInteger(decoded.value.attempt.revision)
  )
    return Option.none()
  return Option.some({ context: { ...decoded.value.context }, attempt: { ...decoded.value.attempt } })
}

function readClock(now: () => number) {
  // receive is intentionally synchronous and has no Effect/services; a throwing host clock must fail closed too.
  try {
    const at = now()
    if (Number.isSafeInteger(at) && at >= 0 && Number.isSafeInteger(at + FabricIdentityAttemptAccess.duration))
      return at
  } catch {
    return
  }
}

function hash(state: string) {
  return createHash("sha256").update(state).digest("hex")
}

function unknownOutcome() {
  return new Capability.Failure({
    code: "outcome_unknown",
    message: "Fabric callback delivery requires an explicit restart",
  })
}
