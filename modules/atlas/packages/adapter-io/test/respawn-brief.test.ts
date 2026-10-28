// @atlas/adapter-io — test/respawn-brief.test.ts  (the brief a re-spawned run starts from)

import { createHash } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { meterAttempt } from "@atlas/persist"
import { appendAttempt } from "../src/card-log.js"
import { exportContext } from "../src/context-log.js"
import { createDurableMemory } from "../src/memory-store.js"
import { respawnBrief } from "../src/respawn-brief.js"
import { createRepoTranscriptStore } from "../src/transcript-blobs.js"

let repo: string
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "atlas-respawn-"))
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

describe("respawn brief", () => {
  it("gathers the attempt, the seat's own fold, the archived context and the transcript from the record", () => {
    const chunk = record({ commit: true })
    const brief = respawnBrief(repo, "ORC-7", 1)
    expect(brief).toMatchObject({ card: "ORC-7", attempt: 1, transcript: true, fold: { lesson: "read the arity table" } })
    expect(brief?.metering.seat).toBe("backend")
    expect(brief?.context.map((ref) => ref.id)).toEqual([chunk])
    expect(brief?.text).toContain("failed with: typecheck")
    expect(brief?.text).toContain(chunk.slice(0, 12))
    expect(respawnBrief(repo, "ORC-7", 2)).toBeUndefined()
  })

  it("says the transcript is not committed on a public clone", () => {
    record({ commit: false })
    expect(respawnBrief(repo, "ORC-7", 1)?.transcript).toBe(false)
    expect(respawnBrief(repo, "ORC-7", 1)?.text).toContain("not committed")
  })
})
