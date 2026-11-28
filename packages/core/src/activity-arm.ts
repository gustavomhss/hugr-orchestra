export * as ActivityArmLedger from "./activity-arm"

import { ActivityArm } from "@orchestra/schema/activity-arm"
import { Effect } from "effect"
import type { Database } from "./database/database"

export interface Interface {
  readonly preview: (request: ActivityArm.Request) => Effect.Effect<ActivityArm.Preview | undefined, unknown>
  readonly confirm: (request: ActivityArm.Confirm) => Effect.Effect<ActivityArm.Receipt | undefined, unknown>
}

/** An owner is constructed once per private Desktop channel incarnation. */
export function make(_database: Database.Interface): Interface {
  return {
    preview: () => Effect.succeed(undefined),
    confirm: () => Effect.succeed(undefined),
  }
}
