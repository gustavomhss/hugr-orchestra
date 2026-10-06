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
  // Produced by the v2 algorithm at 263a9a27d4, before the backend seat's stable id became `backend`.
  preRenameRoster: "5a2df5f95e6c6783322fcf59f39af317639f9fdec9ad1a704e4b9ad75661ea3a",
}

const renamed = createRoster(
  roster.map((member) => ({ ...member, displayName: member.memberId === "backend" ? "Pikachu" : `${member.displayName} 2` })),
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
        member.memberId === "backend" ? { ...member, forbiddenActions: [...member.forbiddenActions, "x"] } : member,
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

  test("records written before the backend seat's id rename still verify", () => {
    expect(historical.preRenameRoster).not.toBe(rosterHash(roster))
    expect(verifyRosterHash(historical.preRenameRoster, roster)).toBe("maestro-roster-v2")
    expect(verifyRosterHash(historical.preRenameRoster, renamed)).toBe("maestro-roster-v2")
  })

  test("review policy hash ignores the reviewer label and historical policy hashes verify as v1", () => {
    const relabeled = { ...lucy, displayName: "Not Lucy" }
    expect(reviewPolicyHash(relabeled, profile)).toBe(reviewPolicyHash(lucy, profile))
    expect(reviewPolicyHash(lucy, { ...profile, bash: "allow" })).not.toBe(reviewPolicyHash(lucy, profile))
    expect(verifyReviewPolicyHash(reviewPolicyHash(lucy, profile), lucy, profile)).toBe("maestro-review-policy-v2")
    expect(verifyReviewPolicyHash(historical.reviewPolicy, lucy, profile)).toBe("maestro-review-policy-v1")
  })

  test("the route grant projection carries no label", () => {
    const grant = lookupRouteGrant("backend")
    if (grant.status !== "ROUTED") throw new Error("expected backend to route")
    expect(Object.keys(grant.grant).toSorted()).toEqual([
      "abilityClass",
      "forbiddenActions",
      "memberId",
      "returnCard",
      "role",
    ])
  })
})

// Windows checkouts may convert prompt files to CRLF; the roster normalizes them so hashes match every platform.
test("roster hash is independent of prompt line endings", () => {
  const crlf = createRoster(
    roster.map((member) => (member.prompt === undefined ? member : { ...member, prompt: member.prompt.replaceAll("\n", "\r\n") })),
  )
  expect(rosterHash(crlf)).toBe(rosterHash(roster))
})

// Changing any seat's behavior (its prompt included) changes this value. When it does, add the previous value to the
// historical ledger in validation-record.ts so records written under it keep verifying, then update the pin.
test("the current roster hash is pinned and superseded ones stay verifiable", () => {
  expect(rosterHash(roster)).toBe("d409ee796e265fb4f6ed0908bef20e2c5ac36b173231b7b86719ddd1d5e247f5")
  expect(verifyRosterHash("8887e66c850f0cf281b059f6b437f320aa3a33c652e54f5fe379713dc92768b5", roster)).toBe(
    "maestro-roster-v2",
  )
  expect(verifyRosterHash("constructor", roster)).toBeUndefined()
  expect(verifyRosterHash("0".repeat(64), roster)).toBeUndefined()
})
