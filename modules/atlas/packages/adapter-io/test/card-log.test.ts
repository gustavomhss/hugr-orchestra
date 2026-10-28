// @atlas/adapter-io — test/card-log.test.ts  (card and attempt logs, committed transcripts, repo visibility)

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { meterAttempt, toGitPointer } from "@atlas/persist"
import { appendAttempt, appendCardEvent, attemptNumbers, readAttempt, readCard } from "../src/card-log.js"
import { attemptPath, blobPath, cardLogPath } from "../src/layout.js"
import { githubSlug, repoVisibility } from "../src/repo-visibility.js"
import { runGit } from "../src/run-git.js"
import { createRepoTranscriptStore } from "../src/transcript-blobs.js"

let repo: string
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "atlas-cards-"))
})
afterEach(() => rmSync(repo, { recursive: true, force: true }))

const run = { seat: "backend", session: "ses_1", engine: "claude-code", costUsd: 0.1234567 }

describe("card log", () => {
  it("reads events in (at, contentHash) order whatever the file order, and keeps text only when private", () => {
    appendCardEvent(repo, "ORC-7", { kind: "status", status: "review", by: "maestro", at: "2026-10-28T12:00:00.000Z" }, { redact: false })
    appendCardEvent(repo, "ORC-7", { kind: "message", thread: "brief", from: "maestro", text: "do it", at: "2026-10-28T10:00:00.000Z" }, { redact: false })
    appendCardEvent(repo, "ORC-7", { kind: "decision", by: "maestro", text: "ship", at: "2026-10-28T11:00:00.000Z" }, { redact: true })

    const read = readCard(repo, "ORC-7")
    expect(read.rejected).toBe(0)
    expect(read.events.map((e) => e.kind)).toEqual(["message", "decision", "status"])
    expect(read.events[0]).toMatchObject({ text: "do it" })
    expect(read.events[1]).not.toHaveProperty("text")
    expect(read.events[1]).toHaveProperty("textHash")
    expect(readFileSync(cardLogPath(repo, "ORC-7"), "utf8")).not.toContain("ship")
  })

  it("rejects an edited line and a line copied from another card", () => {
    appendCardEvent(repo, "ORC-1", { kind: "link", rel: "pr", target: "1117", at: "2026-10-28T10:00:00.000Z" }, { redact: false })
    appendCardEvent(repo, "ORC-2", { kind: "link", rel: "pr", target: "1118", at: "2026-10-28T10:00:00.000Z" }, { redact: false })
    const path = cardLogPath(repo, "ORC-1")
    writeFileSync(path, readFileSync(path, "utf8").replace("1117", "9999") + readFileSync(cardLogPath(repo, "ORC-2"), "utf8"))
    expect(readCard(repo, "ORC-1")).toEqual({ events: [], rejected: 2 })
  })
})

describe("attempt log", () => {
  it("records integer micro-USD, drops spend when redacted, and lists attempts", () => {
    const metering = meterAttempt({ model: "opus", tokensIn: 10 }, run)
    expect(metering.costMicroUsd).toBe(123457)
    appendAttempt(repo, "ORC-7", 1, metering, { redact: false, at: "2026-10-28T10:00:00.000Z" })
    appendAttempt(repo, "ORC-7", 2, metering, { redact: true, at: "2026-10-28T11:00:00.000Z" })

    expect(readAttempt(repo, "ORC-7", 1).entry?.metering).toMatchObject({ seat: "backend", engine: "claude-code", costMicroUsd: 123457 })
    expect(readAttempt(repo, "ORC-7", 2).entry?.metering).not.toHaveProperty("costMicroUsd")
    expect(readAttempt(repo, "ORC-7", 3)).toEqual({ rejected: 0 })
    expect(attemptNumbers(repo, "ORC-7")).toEqual([1, 2])
  })

  it("keeps the latest line of an attempt and rejects one moved from another attempt", () => {
    appendAttempt(repo, "ORC-7", 1, meterAttempt({ verdict: "rework" }, run), { redact: false, at: "2026-10-28T10:00:00.000Z" })
    appendAttempt(repo, "ORC-7", 1, meterAttempt({ verdict: "pass" }, run), { redact: false, at: "2026-10-28T11:00:00.000Z" })
    appendAttempt(repo, "ORC-7", 2, meterAttempt({}, run), { redact: false, at: "2026-10-28T12:00:00.000Z" })
    writeFileSync(attemptPath(repo, "ORC-7", 1), readFileSync(attemptPath(repo, "ORC-7", 2), "utf8") + readFileSync(attemptPath(repo, "ORC-7", 1), "utf8"))

    const read = readAttempt(repo, "ORC-7", 1)
    expect(read.entry?.metering.verdict).toBe("pass")
    expect(read.rejected).toBe(1)
  })
})

describe("committed transcripts", () => {
  it("writes the scrubbed bytes to blobs/ and fetches them back on a fresh store", () => {
    const body = new TextEncoder().encode("turn one\nturn two\n")
    const sha = createRepoTranscriptStore(repo, { commit: true }).put(body)
    expect(new Uint8Array(readFileSync(blobPath(repo, sha)))).toEqual(body)
    expect(createRepoTranscriptStore(repo, { commit: true }).fetch(toGitPointer(sha))).toEqual(body)
  })

  it("writes nothing on a public repository, and refuses an edited blob", () => {
    const body = new TextEncoder().encode("secret plan")
    const sha = createRepoTranscriptStore(repo, { commit: false }).put(body)
    expect(() => createRepoTranscriptStore(repo, { commit: true }).fetch(toGitPointer(sha))).toThrow(/not committed/)
    createRepoTranscriptStore(repo, { commit: true }).put(body)
    writeFileSync(blobPath(repo, sha), "other")
    expect(() => createRepoTranscriptStore(repo, { commit: true }).fetch(toGitPointer(sha))).toThrow(/does not match/)
  })
})

describe("repo visibility", () => {
  it("parses GitHub remotes in every form, and nothing else", () => {
    expect(githubSlug("git@github.com:gustavomhss/hugr-orchestra.git")).toBe("gustavomhss/hugr-orchestra")
    expect(githubSlug("https://github.com/a/b")).toBe("a/b")
    expect(githubSlug("ssh://git@github.com/a/b.git/")).toBe("a/b")
    expect(githubSlug("https://gitlab.com/a/b")).toBeUndefined()
  })

  it("answers private only when the host says so, and public on any doubt", async () => {
    runGit(repo, ["init", "-q"])
    expect(await repoVisibility(repo, async () => ({ status: 200, json: async () => ({ private: true }) }))).toBe("public")
    runGit(repo, ["remote", "add", "origin", "git@github.com:a/b.git"])
    const answer = (status: number, body: unknown) => async () => ({ status, json: async () => body })
    expect(await repoVisibility(repo, answer(200, { private: true }))).toBe("private")
    expect(await repoVisibility(repo, answer(200, { private: false }))).toBe("public")
    expect(await repoVisibility(repo, answer(404, {}))).toBe("private")
    expect(await repoVisibility(repo, answer(500, {}))).toBe("public")
    expect(await repoVisibility(repo, async () => Promise.reject(new Error("offline")))).toBe("public")
  })
})
