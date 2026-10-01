import { describe, expect, test } from "bun:test"
import { createRoster, lookupRosterMember, roster } from "../../src/maestro/roster"

describe("Maestro roster", () => {
  test("declares exact nine contract seats in deterministic order", () => {
    expect(
      roster.map((member) => ({
        displayName: member.displayName,
        memberId: member.memberId,
        role: member.role,
        abilityClass: member.abilityClass,
        returnCard: member.returnCard,
        forbiddenActions: member.forbiddenActions,
      })),
    ).toEqual([
      {
        displayName: "Maestro",
        memberId: "maestro",
        role: "conductor/integrator",
        abilityClass: "lifecycle, routing, reconcile, integration",
        returnCard: "transition/Project/merge receipt",
        forbiddenActions: ["product implementation", "self-approval", "self-review"],
      },
      {
        displayName: "Charlie",
        memberId: "charlie",
        role: "backend execution",
        abilityClass: "scoped repository write",
        returnCard: "implementation card, gates, diff receipt",
        forbiddenActions: ["approve", "review own work", "merge"],
      },
      {
        displayName: "Patty",
        memberId: "patty",
        role: "frontend execution",
        abilityClass: "scoped repository write",
        returnCard: "implementation card, sensory evidence, diff receipt",
        forbiddenActions: ["approve", "review own work", "merge"],
      },
      {
        displayName: "Lucy",
        memberId: "lucy",
        role: "cold review",
        abilityClass: "read-only artifact review",
        returnCard: "cited APPROVE/FIX_FIRST/REJECT card",
        forbiddenActions: ["edit implementation", "receive author transcript", "merge"],
      },
      {
        displayName: "Bobby",
        memberId: "bobby",
        role: "architecture",
        abilityClass: "read-only contract review",
        returnCard: "seam/contract verdict",
        forbiddenActions: ["implement product", "merge"],
      },
      {
        displayName: "Billy",
        memberId: "billy",
        role: "security",
        abilityClass: "read-only threat review",
        returnCard: "threat verdict and cited controls",
        forbiddenActions: ["implement product", "merge"],
      },
      {
        displayName: "Jimmy",
        memberId: "jimmy",
        role: "exploration",
        abilityClass: "read-only discovery",
        returnCard: "grounded findings card",
        forbiddenActions: ["ratify alone", "edit product"],
      },
      {
        displayName: "Rosie",
        memberId: "rosie",
        role: "documentation",
        abilityClass: "scoped docs write",
        returnCard: "docs evidence card",
        forbiddenActions: ["decide product behavior"],
      },
      {
        displayName: "Frankie",
        memberId: "frankie",
        role: "process audit",
        abilityClass: "read-only process/ledger audit",
        returnCard: "audit verdict",
        forbiddenActions: ["implement product", "merge"],
      },
    ])
    expect(Object.isFrozen(roster)).toBe(true)
    expect(roster.every((member) => Object.isFrozen(member) && Object.isFrozen(member.forbiddenActions))).toBe(true)
  })

  test("looks up valid member ID", () => {
    expect(lookupRosterMember("charlie")).toEqual({ status: "FOUND", member: roster[1] })
  })

  test("holds unknown or malformed member ID", () => {
    expect(lookupRosterMember("unknown")).toEqual({ status: "HOLD", reason: "unknown-member-id" })
    expect(lookupRosterMember("Charlie")).toEqual({ status: "HOLD", reason: "malformed-member-id" })
    expect(lookupRosterMember(undefined)).toEqual({ status: "HOLD", reason: "malformed-member-id" })
  })

  test("rejects duplicate member ID", () => {
    expect(() => createRoster([roster[0]!, { ...roster[0]! }])).toThrow("Roster memberId must be unique: maestro")
  })

  test("rejects malformed member ID", () => {
    expect(() => createRoster([{ ...roster[0]!, memberId: "Maestro" }])).toThrow(
      "Roster memberId must be canonical: Maestro",
    )
  })

  test("display rename preserves member identity", () => {
    const renamed = createRoster([{ ...roster[1]!, displayName: "Ana" }])

    expect(lookupRosterMember("charlie", renamed)).toEqual({ status: "FOUND", member: renamed[0] })
    expect(lookupRosterMember("ana", renamed)).toEqual({ status: "HOLD", reason: "unknown-member-id" })
  })
})
