import { describe, expect, it } from "vitest"
import { createTaskProposer } from "../src/mine-proposer.js"
import type { Candidate } from "@atlas/genesis"

const cand = {
  site: { qualifiedPath: "packages/cli/src/mine.ts" },
  signals: {},
  ppr: 1,
  rank: 0,
} as unknown as Candidate

describe("Task proposal adapter", () => {
  it("reattaches ranked candidate and abstains outside supplied sites", () => {
    const proposer = createTaskProposer(new Map([["packages/cli/src/mine.ts", { claim: "Task-produced proposal." }]]))
    expect(proposer.propose(cand)).toEqual({ claim: "Task-produced proposal.", cand })
    expect(proposer.propose({ ...cand, site: { qualifiedPath: "other.ts" } } as Candidate)).toBeNull()
  })
})
