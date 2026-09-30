import { describe, expect, test } from "bun:test"
import { lookupRouteGrant } from "../../src/maestro/route-grant"
import { roster } from "../../src/maestro/roster"

describe("Maestro route grants", () => {
  test("routes every non-Maestro roster seat with roster-derived metadata", () => {
    const grants = roster
      .filter((member) => member.memberId !== "maestro")
      .map((member) => lookupRouteGrant(member.memberId))

    expect(grants).toHaveLength(8)
    expect(grants).toEqual(
      roster
        .filter((member) => member.memberId !== "maestro")
        .map((member) => ({
          status: "ROUTED",
          grant: {
            memberId: member.memberId,
            role: member.role,
            abilityClass: member.abilityClass,
            returnCard: member.returnCard,
            forbiddenActions: member.forbiddenActions,
          },
        })),
    )
  })

  test("holds malformed, unknown, and forged seat IDs", () => {
    expect(lookupRouteGrant(undefined)).toEqual({ status: "HOLD", reason: "malformed-member-id" })
    expect(lookupRouteGrant("Charlie")).toEqual({ status: "HOLD", reason: "malformed-member-id" })
    expect(lookupRouteGrant("unknown")).toEqual({ status: "HOLD", reason: "unknown-member-id" })
    expect(lookupRouteGrant("maestro")).toEqual({ status: "HOLD", reason: "forged-member-id" })
  })

  test("does not write roster metadata", () => {
    const before = structuredClone(roster)

    roster.forEach((member) => lookupRouteGrant(member.memberId))

    expect(roster).toEqual(before)
    expect(roster.every((member) => Object.isFrozen(member) && Object.isFrozen(member.forbiddenActions))).toBe(true)
  })
})
