// @atlas/cli — test/surface-mine.test.ts  (D39: the host-driven mining calls over a real indexed repository)

import { afterAll, describe, expect, it } from "vitest"
import { mineSites, mineWith } from "../src/surface-mine.js"
import { cleanupIndexedRepos, makeIndexedRepo } from "./mine-fixtures.js"

afterAll(() => cleanupIndexedRepos())

describe("surface mine", () => {
  it("lists every visited site with its advisory prompt", () => {
    const repo = makeIndexedRepo()
    const listed = mineSites(repo, 10)
    expect(listed.sites.length).toBeGreaterThan(0)
    expect(listed.promptDigest.length).toBeGreaterThan(0)
    for (const site of listed.sites) {
      expect(site.key.length).toBeGreaterThan(0)
      expect(site.prompt).toContain("atlas-fact")
    }
  })

  it("runs the same sites again and stages nothing when every site abstains", () => {
    const repo = makeIndexedRepo()
    const listed = mineSites(repo, 10)
    const answers = Object.fromEntries(listed.sites.map((site) => [site.key, "NO-FACT"]))
    const out = mineWith(repo, 10, answers, "test/model")
    expect(out.sites).toBe(listed.sites.length)
    expect(out.facts).toBe(0)
    expect(out.complete).toBe(true)
    expect(out.why).not.toBeNull()
    expect(out.refusal).toBeNull()
  })

  it("treats a site with no reply as an abstention", () => {
    const repo = makeIndexedRepo()
    const out = mineWith(repo, 10, {}, "test/model")
    expect(out.facts).toBe(0)
    expect(out.complete).toBe(true)
  })
})
