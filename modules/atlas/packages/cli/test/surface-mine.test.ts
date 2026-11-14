// @atlas/cli — test/surface-mine.test.ts  (D39: the host-driven mining calls over a real indexed repository)

import { afterAll, describe, expect, it } from "vitest"
import { mineSites, mineWith } from "../src/surface-mine.js"
import { createDiskStore } from "@atlas/adapter-io"
import { asHash } from "@atlas/kernel"
import { join } from "node:path"
import { cleanupIndexedRepos, makeIndexedRepo, readStaging } from "./mine-fixtures.js"

afterAll(() => cleanupIndexedRepos())

describe("surface mine", () => {
  it("the host-answer path stages every accepted claim with one shared scratch-free receipt", () => {
    const repo = makeIndexedRepo()
    const listed = mineSites(repo, 1)
    expect(listed.sites).toHaveLength(1)
    const claims = listed.sites[0]!.key.startsWith("src/app.ts")
      ? ["main concatenates the greeting with missingHelper's result", "main supplies the literal world argument to greet"]
      : ["greet prefixes its argument with hi and a space", "greet builds its return using template interpolation"]
    const envelope = `\`\`\`atlas-fact\n${JSON.stringify({ facts: claims.map((claim) => ({ claim })) })}\n\`\`\``
    const result = mineWith(repo, 1, { [listed.sites[0]!.key]: `PRIVATE SCRATCH\n${envelope}\nPRIVATE TRAILING SCRATCH` }, "synthetic/host-answer")
    expect(result.refusal).toBeNull()
    const store = createDiskStore(join(repo, ".atlas/cas"))
    const rows = [...readStaging(store).current.values()]
    expect(rows).toHaveLength(1)
    expect(rows[0]!.claims).toEqual(claims)
    const evidence = rows[0]!.claimEvidenceByClaim!
    const receipts = claims.map((claim) => evidence[claim]!)
    expect(new Set(receipts.map((receipt) => receipt.factRef)).size).toBe(2)
    expect(new Set(receipts.map((receipt) => receipt.answerRef)).size).toBe(1)
    for (const receipt of receipts) {
      expect(store.get(asHash(receipt.factRef))).toBeDefined()
      expect(store.get(asHash(receipt.answerRef!))).toBe(envelope)
    }
  })

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
