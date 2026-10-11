import { describe, expect, test } from "bun:test"
import { BACKEND_DEFAULT_LABEL, UPSTREAM_DEFAULT_LABEL, createRoster, lookupRosterMember, roster } from "../../src/maestro/roster"

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
        displayName: BACKEND_DEFAULT_LABEL,
        memberId: "backend",
        role: "backend execution",
        abilityClass: "scoped repository write",
        returnCard: "backend-result",
        forbiddenActions: [
          "investigation or diagnosis",
          "architecture or scope decisions",
          "delegation",
          "self-review",
          "claims of verification or acceptance",
          "commit, push, branch, merge or pull request",
          "installing tools",
          "working around permission denials or safety holds",
          "editing Atlas memory files",
        ],
      },
      {
        displayName: UPSTREAM_DEFAULT_LABEL,
        memberId: "archie",
        role: "product, architecture, specification and planning",
        abilityClass: "scoped proposal authoring",
        returnCard: "upstream-result",
        forbiddenActions: [
          "inventing owner facts or approval",
          "product implementation",
          "dispatch or workflow execution",
          "delegation",
          "self-approval or acceptance claims",
          "commit, push, branch, merge or pull request",
          "installing tools",
          "working around permission denials or safety holds",
          "editing Atlas memory files",
        ],
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
        role: "cold code review; records governed reviews",
        abilityClass: "read-only artifact review",
        returnCard: "cited APPROVE/FIX_FIRST/REJECT card",
        forbiddenActions: ["edit implementation", "receive author transcript", "merge"],
      },
      {
        displayName: "Billy",
        memberId: "billy",
        role: "security review",
        abilityClass: "read-only threat review",
        returnCard: "threat verdict and cited controls",
        forbiddenActions: ["implement product", "merge"],
      },
      {
        displayName: "Jimmy",
        memberId: "jimmy",
        role: "codebase exploration",
        abilityClass: "read-only discovery",
        returnCard: "grounded findings card",
        forbiddenActions: ["ratify alone", "edit product"],
      },
      {
        displayName: "Rosie",
        memberId: "rosie",
        role: "documentation changes",
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
    expect(lookupRosterMember("backend")).toEqual({ status: "FOUND", member: roster[1] })
    expect(lookupRosterMember("archie")).toEqual({ status: "FOUND", member: roster[2] })
  })

  test("rejects retired upstream ID and profile name as routing IDs", () => {
    expect(lookupRosterMember("walt")).toEqual({ status: "HOLD", reason: "unknown-member-id" })
    expect(lookupRosterMember("upstream")).toEqual({ status: "HOLD", reason: "unknown-member-id" })
    expect(lookupRosterMember(UPSTREAM_DEFAULT_LABEL)).toEqual({ status: "HOLD", reason: "malformed-member-id" })
  })

  test("holds unknown or malformed member ID", () => {
    expect(lookupRosterMember("unknown")).toEqual({ status: "HOLD", reason: "unknown-member-id" })
    expect(lookupRosterMember("Backend")).toEqual({ status: "HOLD", reason: "malformed-member-id" })
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

    expect(lookupRosterMember("backend", renamed)).toEqual({ status: "FOUND", member: renamed[0] })
    expect(lookupRosterMember("ana", renamed)).toEqual({ status: "HOLD", reason: "unknown-member-id" })
  })

  test("upstream display rename preserves exact routing ID and behavior profile", () => {
    const renamed = createRoster([{ ...roster[2]!, displayName: "Configured Planner" }])

    expect(lookupRosterMember("archie", renamed)).toEqual({ status: "FOUND", member: renamed[0] })
    expect(renamed[0]?.nativeProfile).toBe("upstream")
    expect(lookupRosterMember("configured-planner", renamed)).toEqual({ status: "HOLD", reason: "unknown-member-id" })
  })
})
