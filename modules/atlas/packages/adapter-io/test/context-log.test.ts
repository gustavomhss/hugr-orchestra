// @atlas/adapter-io — test/context-log.test.ts  (a session's committed context-continuity archive)

import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { exportContext, readContext, readContextChunk, scrubText } from "../src/context-log.js"
import { blobPath, contextLogPath } from "../src/layout.js"

let repo: string
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "atlas-context-"))
})
afterEach(() => rmSync(repo, { recursive: true, force: true }))

const chunk = (markdown: string) => ({
  id: createHash("sha256").update(markdown).digest("hex"),
  title: "tool output",
  first: "msg_1",
  last: "msg_2",
  bytes: Buffer.byteLength(markdown),
  markdown,
})

describe("context log", () => {
  it("exports once, folds masks, and serves a committed chunk to another session of the seat", () => {
    const a = chunk("# chunk a\n")
    const b = chunk("# chunk b\n")
    const opts = { commit: true, at: "2026-10-28T10:00:00.000Z" }
    expect(exportContext(repo, "backend", "ses_1", { references: [a], masks: [["call_1", a.id]] }, opts).appended).toBe(3)
    expect(exportContext(repo, "backend", "ses_1", { references: [a], masks: [["call_1", a.id]] }, opts).appended).toBe(0)
    exportContext(repo, "backend", "ses_1", { references: [a, b], masks: [["call_2", b.id]] }, {
      ...opts,
      at: "2026-10-28T11:00:00.000Z",
    })

    const read = readContext(repo, "backend", "ses_1")
    expect(read).toMatchObject({ seat: "backend", rejected: 0, masks: [["call_2", b.id]] })
    expect(read.references.map((ref) => ref.id)).toEqual([a.id, b.id])
    expect(readContextChunk(repo, "backend", b.id)).toMatchObject({ session: "ses_1", markdown: b.markdown })
    expect(readContextChunk(repo, "jimmy", b.id)).toBeUndefined()
  })

  it("never commits chunks on a public repository, and refuses a chunk that does not match its id", () => {
    const a = chunk("# public\n")
    exportContext(repo, "backend", "ses_1", { references: [a], masks: [] }, { commit: false, at: "2026-10-28T10:00:00.000Z" })
    expect(existsSync(blobPath(repo, a.id))).toBe(false)
    expect(readContext(repo, "backend", "ses_1").references).toHaveLength(1)
    expect(readContextChunk(repo, "backend", a.id)).toBeUndefined()
    expect(() =>
      exportContext(repo, "backend", "ses_1", { references: [{ ...a, markdown: "edited" }], masks: [] }, {
        commit: true,
        at: "2026-10-28T10:00:00.000Z",
      }),
    ).toThrow(/does not match/)
  })

  it("rejects a line copied from another session and an edited blob", () => {
    const a = chunk("# a\n")
    const opts = { commit: true, at: "2026-10-28T10:00:00.000Z" }
    exportContext(repo, "backend", "ses_1", { references: [a], masks: [] }, opts)
    exportContext(repo, "backend", "ses_2", { references: [], masks: [] }, opts)
    writeFileSync(
      contextLogPath(repo, "backend", "ses_2"),
      readFileSync(contextLogPath(repo, "backend", "ses_2"), "utf8") + readFileSync(contextLogPath(repo, "backend", "ses_1"), "utf8"),
    )
    expect(readContext(repo, "backend", "ses_2").rejected).toBe(2)
    writeFileSync(blobPath(repo, a.id), "other")
    expect(readContextChunk(repo, "backend", a.id)).toBeUndefined()
  })

  it("scrubs credential shapes before text is hashed", () => {
    const secret = "AKIA" + "IOSFODNN7EXAMPLE"
    expect(scrubText(`key ${secret}`)).not.toContain(secret)
    expect(scrubText("plain text")).toBe("plain text")
  })
})
