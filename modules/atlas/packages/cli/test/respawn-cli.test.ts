// @atlas/cli — test/respawn-cli.test.ts  (`atlas respawn <CARD> a<n>`)

import { createHash } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { meterAttempt } from "@atlas/persist"
import { appendAttempt, createDurableMemory, createRepoTranscriptStore, exportContext } from "@atlas/adapter-io"
import { runRespawn } from "../src/respawn-cli.js"

let repo: string
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "atlas-respawn-cli-"))
})
afterEach(() => rmSync(repo, { recursive: true, force: true }))

function record(opts: { readonly commit: boolean }) {
  const transcriptSha = createRepoTranscriptStore(repo, opts).put(new TextEncoder().encode("prior run transcript"))
  const metering = meterAttempt(
    { model: "opus", tokensIn: 10, tokensOut: 5, wallTime: 1000, gates: ["typecheck"], verdict: "fail", transcriptSha },
    { seat: "backend", session: "ses_1", engine: "claude-code", costUsd: 0.1 },
  )
  appendAttempt(repo, "ORC-7", 1, metering, { redact: !opts.commit, at: "2026-10-28T10:00:00.000Z" })
  createDurableMemory(repo).append({
    owner: "backend",
    kind: "task",
    entry: { taskId: "ORC-7", attempted: ["patched the parser"], failedWith: ["typecheck"], stoppedAt: "parse.ts", lesson: "read the arity table" },
  })
  const markdown = "# parser notes\n"
  const chunk = { id: createHash("sha256").update(markdown).digest("hex"), title: "parser notes", first: "m1", last: "m2", bytes: Buffer.byteLength(markdown), markdown }
  exportContext(repo, "backend", "ses_1", { references: [chunk], masks: [] }, { ...opts, at: "2026-10-28T10:00:00.000Z" })
  return chunk.id
}

describe("atlas respawn", () => {
  it("prints the brief, a usage error, or a refusal", () => {
    record({ commit: true })
    const ok = runRespawn(repo, ["ORC-7", "a1"])
    expect(ok.exitCode).toBe(0)
    expect(ok.stdout).toContain("fold: recalled")
    expect(ok.stdout).toContain("brief:")
    expect(runRespawn(repo, ["ORC-7", "1"]).exitCode).toBe(1)
    expect(runRespawn(repo, ["ORC-7", "a3"]).exitCode).toBe(2)
  })
})
