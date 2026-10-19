import { describe, expect, test } from "bun:test"
import { omit } from "remeda"
import { createRoster, nativeProfiles, roster } from "@orchestra/maestro/roster"
import { lookupRouteGrant } from "@orchestra/maestro/route-grant"
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
  expect(rosterHash(roster)).toBe("8d3204388b964a4236bdd7fe78fc7039eabc16642683dc017b91fde3cb67754b")
  for (const superseded of [
    "2e940ff3b3b693177f372b9e9a144267102988ad0f777f9c5f408ae6c1a64a9f",
    "06cd43178bba652b3c5ee3676472b8f4acee93b391b02512b1e4b54184354a10",
    "21de782c4f626aa289a129f2147ace8bb82ef786fc02d6c7b629169a6f95cb05",
    "2651606b1bc8c46808086482c7b71297733573306096b641a6e24c7efe78382f",
    "e956abbc3f4ce9c67a6e453f14616de06bf20231bca302ee412355eb33610695",
    "18647c12823dcd3c1afbfd3efa5e65e34b662e11f7c5ca6b239c3898047931a4",
    "929cd402f4cf9a8a4b37ec12f9cfcab003a41301a989e0dff81ed65ada05c5ef",
    "9a00703e9ba953b12ae6bb03d5f5ce47dff0c1b7b63997a0b23183c6e97fb912",
    "697b106693b751ffa6113f7507e149d47138944a47bf690a3e301b47e69effd8",
    "92b759346ac3366f26bc2940408770ba33767bc56108c9f3b0b5d13a58b9f127",
    "a3299fc84b55ea2db06883778675d0f7747c0a585f26f815efd7a9db06f1f98c",
    "6a1f034e0bb11b6ba2962716b087effe72b591f292a06c823595b97690dcebac",
    "d5ea1eb8112a6e6dcf67a28bc78e8f9298ca15f9fecad67d4b31018405730346",
  ]) {
    expect(rosterHash(roster)).not.toBe(superseded)
    expect(verifyRosterHash(superseded, roster)).toBe("maestro-roster-v2")
    expect(verifyRosterHash(superseded, renamed)).toBe("maestro-roster-v2")
  }
  expect(verifyRosterHash("8887e66c850f0cf281b059f6b437f320aa3a33c652e54f5fe379713dc92768b5", roster)).toBe(
    "maestro-roster-v2",
  )
  expect(verifyRosterHash("d409ee796e265fb4f6ed0908bef20e2c5ac36b173231b7b86719ddd1d5e247f5", roster)).toBe(
    "maestro-roster-v2",
  )
  // The review policy before the harness rewrite reworded the cold reviewer's role and denied seats .env reads.
  expect(
    verifyReviewPolicyHash("3d84eb72e8c4bc22d0e4cbb50affaab01f45b0fb2a41c7375d02640d095a9f2a", lucy, profile),
  ).toBe("maestro-review-policy-v2")
  // The review policy before review seats could read saved tool output.
  const superseded = "b6996d6a55dfa44e2b781b06bb8ddac2be43c7c1f8b7c1d63b2068b985de4a22"
  expect(reviewPolicyHash(lucy, profile)).not.toBe(superseded)
  expect(reviewPolicyHash(lucy, omit(profile, ["external_directory"]))).toBe(superseded)
  expect(verifyReviewPolicyHash(superseded, lucy, profile)).toBe("maestro-review-policy-v2")
  expect(verifyRosterHash("constructor", roster)).toBeUndefined()
  expect(verifyRosterHash("0".repeat(64), roster)).toBeUndefined()
})
