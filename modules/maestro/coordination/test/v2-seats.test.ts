import { expect, test } from "bun:test"
import { PermissionV2 } from "@orchestra/core/permission"
import { nativeProfiles } from "../src/roster"
import { MaestroSeatsV2 } from "../src/v2/seats"

// A seat's native profile becomes its V2 permission floor: the profile's own order, so its `*` deny comes first and its
// grants win over it, and as the last rules a configured allow cannot widen it.

test("a review seat's floor denies by default and grants only its profile", () => {
  const rules = MaestroSeatsV2.floor(nativeProfiles.lucy)
  expect(rules[0]).toEqual({ action: "*", resource: "*", effect: "deny" })
  const configured = [{ action: "*", resource: "*", effect: "allow" as const }]
  expect(PermissionV2.evaluate("bash", "ls", configured, rules).effect).toBe("deny")
  expect(PermissionV2.evaluate("maestro_record_review", "*", configured, rules).effect).toBe("allow")
  expect(PermissionV2.evaluate("read", "app/.env", configured, rules).effect).toBe("deny")
  expect(MaestroSeatsV2.floor(undefined)).toEqual([])
})
