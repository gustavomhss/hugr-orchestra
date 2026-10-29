// @atlas/adapter-io — test/attempt-trailer.test.ts  (the Attempt trailer on a real commit)

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { asHash } from "@atlas/kernel"
import { makeHostAdapter } from "@atlas/persist"
import { createForge } from "../src/git-forge.js"
import { runGit } from "../src/run-git.js"

let repo: string
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "atlas-trailer-"))
})
afterEach(() => rmSync(repo, { recursive: true, force: true }))

const trailer = { WP: "ORC-7", Model: "opus", Gates: "typecheck", Verdict: "pass", TranscriptSha: asHash("ab12") }

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

