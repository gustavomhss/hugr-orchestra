// @atlas/adapter-io — test/pr-record.test.ts  (the Attempt trailer and the Atlas record in a PR body)

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { asHash } from "@atlas/kernel"
import { makeHostAdapter, meterAttempt } from "@atlas/persist"
import type { AttemptEntry } from "../src/card-log.js"
import { createForge } from "../src/git-forge.js"
import { readPrRecord, withPrRecord, writeGithubPrRecord } from "../src/pr-record.js"
import { runGit } from "../src/run-git.js"

let repo: string
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "atlas-pr-record-"))
})
afterEach(() => rmSync(repo, { recursive: true, force: true }))

const trailer = { WP: "ORC-7", Model: "opus", Gates: "typecheck", Verdict: "pass", TranscriptSha: asHash("ab12") }

const entry = (card: string, n: number): AttemptEntry => ({
  card,
  n,
  at: "2026-10-28T10:00:00.000Z",
  metering: meterAttempt(
    { model: "opus", tokensIn: 1200, tokensOut: 300, wallTime: 61_000, gates: ["typecheck"], verdict: "pass", transcriptSha: asHash("ab12cd34ef56aa") },
    { seat: "backend", session: "ses_1", engine: "claude-code", costUsd: 0.25 },
  ),
})

describe("Attempt trailer", () => {
  it("round-trips through a real commit, and a trailer without it reads unchanged", () => {
    runGit(repo, ["init", "-q"])
    runGit(repo, ["config", "user.name", "t"])
    runGit(repo, ["config", "user.email", "t@t"])
    runGit(repo, ["commit", "-q", "--allow-empty", "-m", "feat: one"])
    const adapter = makeHostAdapter(createForge(repo))
    adapter.attachToCommit(runGit(repo, ["rev-parse", "HEAD"]).trim(), { trailer: { ...trailer, Attempt: "a2" } })
    expect(runGit(repo, ["show", "-s", "--format=%B", "HEAD"])).toContain("Attempt: a2")
    expect(adapter.readCommit(runGit(repo, ["rev-parse", "HEAD"]).trim())?.trailer).toEqual({ ...trailer, Attempt: "a2" })

    runGit(repo, ["commit", "-q", "--allow-empty", "-m", "feat: two"])
    adapter.attachToCommit(runGit(repo, ["rev-parse", "HEAD"]).trim(), { trailer })
    expect(adapter.readCommit(runGit(repo, ["rev-parse", "HEAD"]).trim())?.trailer).toEqual(trailer)
  })
})

describe("PR record", () => {
  it("appends a block, replaces it in place, keeps the human body, and reads back the attempts", () => {
    const first = withPrRecord("## Summary\n\nwhat changed\n", [entry("ORC-7", 1)], { redact: false })
    expect(first.startsWith("## Summary\n\nwhat changed\n\n<!-- atlas-record:start -->")).toBe(true)
    expect(first).toContain("| ORC-7 | a1 | backend | claude-code | opus | pass | typecheck | 1200 / 300 | 61s | $0.2500 | `ab12cd34ef56` |")

    const second = withPrRecord(`${first}\n\n🤖 footer`, [entry("ORC-7", 1), entry("ORC--8", 2)], { redact: false })
    expect(second.match(/atlas-record:start/g)).toHaveLength(1)
    expect(second.endsWith("🤖 footer")).toBe(true)
    expect(readPrRecord(second)).toEqual([
      { card: "ORC-7", attempt: 1 },
      { card: "ORC--8", attempt: 2 },
    ])
  })

  it("drops spend when redacted, and reads nothing from a body without a record", () => {
    expect(withPrRecord("", [entry("ORC-7", 1)], { redact: true })).not.toContain("$")
    expect(readPrRecord("plain body")).toEqual([])
    expect(readPrRecord("<!-- atlas-record:start -->\n<!-- atlas-record:refs {bad -->")).toEqual([])
  })

  it("writes the record back to GitHub, and throws on a refused write", async () => {
    const token = process.env.GITHUB_TOKEN
    process.env.GITHUB_TOKEN = "test-token"
    const sent: { url: string; body: string }[] = []
    const get = async () => ({ status: 200, json: async () => ({ body: "human text" }) })
    await writeGithubPrRecord("a/b", 12, [entry("ORC-7", 1)], {
      redact: true,
      get,
      send: async (url, init) => {
        sent.push({ url, body: init.body })
        return { status: 200 }
      },
    })
    expect(sent[0]?.url).toBe("https://api.github.com/repos/a/b/pulls/12")
    const body = JSON.parse(sent[0]?.body ?? "{}").body as string
    expect(body.startsWith("human text\n\n")).toBe(true)
    expect(readPrRecord(body)).toEqual([{ card: "ORC-7", attempt: 1 }])
    await expect(writeGithubPrRecord("a/b", 12, [], { redact: true, get, send: async () => ({ status: 403 }) })).rejects.toThrow(/403/)
    if (token === undefined) delete process.env.GITHUB_TOKEN
    else process.env.GITHUB_TOKEN = token
  })
})
