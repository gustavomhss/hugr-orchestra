export * as ActivityActionLedger from "./activity-action-ledger"

import { Effect } from "effect"
import { Database } from "./database/database"

export type Action =
  | "arm"
  | "apply"
  | "restore"
  | "empty"
  | "attest"
  | "accept-cost"
  | "stop-tree"
  | "stop-query"
  | "suspend"
  | "resume"

/** Captured by a server-owned producer. No caller path, observation UUID or PID is action authority. */
export type Observation = {
  readonly targetID: string
  readonly kind: "object" | "tree"
  readonly label: string
  readonly owner: string
  readonly identity: string | null
  readonly members: readonly string[]
  readonly dirty: boolean | null
  readonly eligible: readonly Action[]
}

export type Target = Observation & { readonly generation: string }
export type Binding = Pick<Target, "targetID" | "generation">

/** The ledger stores facts and revalidates bindings. It does not grant approval or run an effect. */
export const make = Effect.gen(function* () {
  const database = yield* Database.Service
  return {
    record(_observation: Observation): Effect.Effect<Target, unknown> {
      return Effect.fail("Activity action ledger is unavailable")
    },
    capture(_action: Action, _bindings: readonly Binding[]): Effect.Effect<readonly Target[] | undefined, unknown> {
      return Effect.succeed(undefined)
    },
  }
})
