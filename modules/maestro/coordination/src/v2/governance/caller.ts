export * as CallerGateV2 from "./caller"

import { ToolFailure } from "@orchestra/llm"
import { Effect } from "effect"
import { PermissionV2 } from "@orchestra/core/permission"
import type { nativeProfiles } from "../../roster"
import type { MaestroSeats } from "../seats-service"

/**
 * A native seat starts only the teammates its own native profile allows. The profile is checked before anything else,
 * whatever the seat's configured rules or the Session's saved approvals say.
 */
export const check = Effect.fn("CallerGateV2.check")(function* (
  seats: MaestroSeats.Interface,
  profiles: typeof nativeProfiles,
  caller: string,
  target: string,
) {
  if (!seats.has(caller)) return
  // The profile's own order, as `MaestroSeatsV2.floor` reads it; importing that here would make `seats.ts` a cycle.
  const rules = Object.entries(profiles[caller] ?? {}).flatMap(([action, value]) =>
    typeof value === "string"
      ? [{ action, resource: "*", effect: value }]
      : Object.entries(value).map(([resource, effect]) => ({ action, resource, effect })),
  )
  if (PermissionV2.evaluate("task", target, rules).effect !== "deny") return
  return yield* new ToolFailure({ message: `Task denied: ${caller} may not start ${target}` })
})
