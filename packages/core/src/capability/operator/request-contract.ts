export * as CapabilityRequestContract from "./request-contract"

import type { Capability } from "@orchestra/schema/capability"
import type { Effect, Schema } from "effect"
import type { SqlError } from "effect/unstable/sql/SqlError"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import type { Database } from "../../database/database"
import type { CapabilityOperatorContract } from "./contract"

export type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]
export type Interface = Readonly<{
  /** SQL-only mutation; result must be redacted JSON. Authority and idempotency are fenced in the same writer. */
  commit: <E, R>(target: CapabilityOperatorContract.Target, payload: Schema.Json,
    write: (tx: Transaction) => Effect.Effect<Schema.Json, E, R>,
    verify?: (tx: Transaction) => Effect.Effect<void, E, R>) =>
    Effect.Effect<Readonly<{ requestID: string; reused: boolean; data: Schema.Json }>,
      E | Capability.Failure | SqlError | EffectDrizzleQueryError, R>
}>

export type Reconciliation = Readonly<{
  /** SQL-only verification under current authority; a missing receipt consumes no quota. */
  reconcile: <E = never, R = never>(target: CapabilityOperatorContract.Target, payload: Schema.Json,
    verify?: (tx: Transaction) => Effect.Effect<void, E, R>) =>
    Effect.Effect<Readonly<{ requestID: string; reused: boolean; data: Schema.Json }> | undefined,
      E | Capability.Failure | SqlError | EffectDrizzleQueryError, R>
}>
