import { describe, expect, test } from "bun:test"
import { createRoster, nativeProfiles, roster } from "../../src/maestro/roster"
import { lookupRouteGrant } from "../../src/maestro/route-grant"
import {
  reviewPolicyHash,
  rosterHash,
  verifyReviewPolicyHash,
  verifyRosterHash,
} from "../../src/maestro/validation-record"

// F1.4: roster, grant and review-policy hashes bind behavior; a label change alone never changes them.

// Produced by the pre-v2 algorithm (full roster, labels included) at 4755c75d5d, before seat prompts became templates.
const historical = {
  roster: "fab95c176e80b185e87f31599aa9f0008d4a35d9ff4c01f9a9d19cb8df149a45",
  reviewPolicy: "05807085f9d9cf64a9cad4766f7eacde2ff1898435252d177d2725434d646c59",
}

const renamed = createRoster(
  roster.map((member) => ({ ...member, displayName: member.memberId === "charlie" ? "Pikachu" : `${member.displayName} 2` })),
)
const lucy = roster.find((member) => member.memberId === "lucy")!
const profile = nativeProfiles.review

describe("roster hash", () => {
  test("two rosters differing only in labels hash the same", () => {
    expect(rosterHash(renamed)).toBe(rosterHash(roster))
    expect(rosterHash(roster)).toMatch(/^[0-9a-f]{64}$/)
  })

  test("a behavioral change still changes the hash", () => {
    const changed = createRoster(
      roster.map((member) =>
        member.memberId === "charlie" ? { ...member, forbiddenActions: [...member.forbiddenActions, "x"] } : member,
      ),
    )
    expect(rosterHash(changed)).not.toBe(rosterHash(roster))
    const prompt = createRoster(
      roster.map((member) => (member.memberId === "patty" ? { ...member, prompt: `${member.prompt}!` } : member)),
    )
    expect(rosterHash(prompt)).not.toBe(rosterHash(roster))
  })

  test("new records verify as v2 and historical records still verify as v1", () => {
    expect(verifyRosterHash(rosterHash(roster), roster)).toBe("maestro-roster-v2")
    expect(verifyRosterHash(rosterHash(roster), renamed)).toBe("maestro-roster-v2")
    expect(verifyRosterHash(historical.roster, roster)).toBe("maestro-roster-v1")
    expect(historical.roster).not.toBe(rosterHash(roster))
    expect(verifyRosterHash("0".repeat(64), roster)).toBeUndefined()
  })

  test("review policy hash ignores the reviewer label and historical policy hashes verify as v1", () => {
    const relabeled = { ...lucy, displayName: "Not Lucy" }
    expect(reviewPolicyHash(relabeled, profile)).toBe(reviewPolicyHash(lucy, profile))
    expect(reviewPolicyHash(lucy, { ...profile, bash: "allow" })).not.toBe(reviewPolicyHash(lucy, profile))
    expect(verifyReviewPolicyHash(reviewPolicyHash(lucy, profile), lucy, profile)).toBe("maestro-review-policy-v2")
    expect(verifyReviewPolicyHash(historical.reviewPolicy, lucy, profile)).toBe("maestro-review-policy-v1")
  })

  test("the route grant projection carries no label", () => {
    const grant = lookupRouteGrant("charlie")
    if (grant.status !== "ROUTED") throw new Error("expected charlie to route")
    expect(Object.keys(grant.grant).toSorted()).toEqual([
      "abilityClass",
      "forbiddenActions",
      "memberId",
      "returnCard",
      "role",
    ])
  })
})
