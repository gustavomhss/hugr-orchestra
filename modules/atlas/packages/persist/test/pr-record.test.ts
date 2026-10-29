// @atlas/persist — test/pr-record.test.ts  (the PR record the merge-queue host renders, merge-queue spec §4.5)

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { asHash } from "@atlas/kernel"
import { attemptTrailer, bundleTrailer, recordPort, githubPrWriter, readPrRecordRefs, renderBundleRecord, renderPrRecord } from "../src/host-adapter.js"
import type { PrRecord, SendJson } from "../src/host-adapter.js"

const record: PrRecord = {
  intent: "Let a card's PR say why it exists.",
  change: { text: "Adds the record renderer.", start: ["packages/persist/src/host-adapter.ts"] },
  decisions: ["The host renders, Maestro writes prose."],
  notCovered: "Bundle ejection UI.",
  risk: { level: "medium", breaks: "PR bodies.", notice: "A reviewer reading the body.", undo: "Revert the commit." },
  followUps: [],
  facts: { files: 3, added: 120, removed: 4, packages: ["@atlas/persist"], ownUnits: [] },
  evidence: { doneWhen: [], reviews: [], checks: [], used: "unseen" },
  cost: { attempts: [{ n: 1, cause: "first" }, { n: 2, cause: "review finding" }], ciRuns: 2, ciMinutes: 14, wallMs: 30 * 60_000 },
  lineage: { card: "ORC-7", dependsOn: [], seats: ["backend"] },
  integration: { state: "queued" },
}

describe("renderPrRecord", () => {
  it("renders missing evidence as missing, carries no spend, and names its attempts", () => {
    const body = renderPrRecord(record)
    for (const line of ["Done when: missing.", "Probe: missing.", "Review: missing.", "Checks: missing.", "Unseen: not used as the user would."])
      expect(body).toContain(line)
    expect(body).toContain("Attempts: a1 (first), a2 (review finding). CI: 2 runs, 14 min. Ready to queued: 30 min.")
    expect(body).not.toMatch(/\$|usd|tokens/i)
    expect(readPrRecordRefs(body)).toEqual([{ card: "ORC-7", attempts: [1, 2] }])
  })

  it("keeps the refs comment closed when the card key holds `-->`", () => {
    const body = renderPrRecord({ ...record, lineage: { ...record.lineage, card: "x-->y" } })
    expect(body.slice(body.indexOf("<!-- atlas-record:refs")).match(/-->/g)).toHaveLength(1)
    expect(readPrRecordRefs(body)).toEqual([{ card: "x-->y", attempts: [1, 2] }])
  })

  it("reads no refs from a body without the comment or with a malformed one", () => {
    expect(readPrRecordRefs("plain body")).toEqual([])
    expect(readPrRecordRefs("<!-- atlas-record:refs {nope -->")).toEqual([])
  })
})

describe("renderBundleRecord", () => {
  it("takes the highest member risk and sums cost with the bundle's own runs", () => {
    const high = { ...record, risk: { ...record.risk, level: "high" as const }, lineage: { ...record.lineage, card: "ORC-8" } }
    const body = renderBundleRecord({
      members: [
        { title: "one", head: "a".repeat(40), record },
        { title: "two", head: "b".repeat(40), record: high },
      ],
      testedOn: "c0ffee",
      skew: 3,
      ciRuns: 1,
      ciMinutes: 9,
      ejections: [{ card: "ORC-9", cause: "conflict" }],
    })
    expect(body).toContain("Highest risk: **high**.")
    expect(body).toContain("Attempts: 4. CI: 5 runs, 37 min.")
    expect(body).toContain("Tested on `c0ffee`, 3 commits behind the base.")
    expect(body).toContain("- ORC-9: conflict")
    expect(readPrRecordRefs(body).map((ref) => ref.card)).toEqual(["ORC-7", "ORC-8"])
  })
})

describe("trailers", () => {
  it("ends a card commit with Attempt and a bundle merge with one WP line per card", () => {
    const trailer = attemptTrailer({ WP: "ORC-7", Model: "opus", Gates: "typecheck", Verdict: "pass", TranscriptSha: asHash("ab12"), Attempt: "a2" })
    expect(trailer).toContain("WP: ORC-7")
    expect(trailer).toContain("Attempt: a2")
    expect(attemptTrailer({ WP: "ORC-7", Attempt: "a1" })).toBe("WP: ORC-7\nAttempt: a1")
    expect(recordPort.trailer({ WP: "ORC-7", Attempt: "a1" })).toBe(attemptTrailer({ WP: "ORC-7", Attempt: "a1" }))
    expect(bundleTrailer(["ORC-7", "ORC-8"])).toBe("WP: ORC-7\nWP: ORC-8")
  })
})

describe("githubPrWriter", () => {
  const saved = { GITHUB_TOKEN: process.env.GITHUB_TOKEN, GH_TOKEN: process.env.GH_TOKEN }
  beforeEach(() => {
    process.env.GITHUB_TOKEN = "t0ken"
    delete process.env.GH_TOKEN
  })
  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it("opens a PR and replaces its body", async () => {
    const calls: { url: string; method: string; body: unknown; auth: string | undefined }[] = []
    const send: SendJson = async (url, init) => {
      calls.push({ url, method: init.method, body: JSON.parse(init.body), auth: init.headers.authorization })
      return init.method === "POST" ? { status: 201, json: async () => ({ number: 42 }) } : { status: 200, json: async () => ({}) }
    }
    const writer = githubPrWriter("o/r", { send })
    expect(await writer.open({ head: "card", base: "dev", title: "t", body: "b", draft: true })).toBe(42)
    await writer.write(42, "new body")
    expect(calls).toEqual([
      { url: "https://api.github.com/repos/o/r/pulls", method: "POST", body: { head: "card", base: "dev", title: "t", body: "b", draft: true }, auth: "Bearer t0ken" },
      { url: "https://api.github.com/repos/o/r/pulls/42", method: "PATCH", body: { body: "new body" }, auth: "Bearer t0ken" },
    ])
  })

  it("throws without a token and on an unexpected status", async () => {
    const send: SendJson = async () => ({ status: 422, json: async () => ({}) })
    await expect(githubPrWriter("o/r", { send }).write(1, "b")).rejects.toThrow("answered 422")
    delete process.env.GITHUB_TOKEN
    await expect(githubPrWriter("o/r", { send }).write(1, "b")).rejects.toThrow("GITHUB_TOKEN or GH_TOKEN")
  })
})
