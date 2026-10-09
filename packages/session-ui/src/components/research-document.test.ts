import { expect, test } from "bun:test"
import { Schema } from "effect"
import { Research } from "@orchestra/schema/research"
import { loadResearchDocument } from "./research-document"

const receipt = Schema.decodeUnknownSync(Research.DocumentReceipt)({
  binding: { projectID: "fixture", memberID: "jimmy", taskId: "task-fixture", executionSessionID: "ses_fixture",
    authoritySessionID: "ses_authority", directory: "/fixture", worktree: "/fixture" },
  ref: { id: `rdoc_${"a".repeat(26)}`, revision: 1 }, artifact: { id: `cart_${"b".repeat(26)}`, revision: 1 },
  digest: "c".repeat(64), title: "Qualified answer", genre: "answer", bytes: 4, publishedAt: 1, findingRefs: [], citations: {},
})

test("document reader binds every page and preserves exact text across bounded continuation", async () => {
  const calls: (string | undefined)[] = []
  const text = await loadResearchDocument(receipt, async (sessionID, artifact, cursor) => {
    expect(sessionID).toBe(receipt.binding.executionSessionID)
    expect(artifact).toEqual(receipt.artifact)
    calls.push(cursor)
    return { ref: receipt.artifact, representation: "markdown", receipt,
      text: cursor ? "cd" : "ab", complete: !!cursor, ...(cursor ? {} : { cursor: "next" }) }
  })
  expect(calls).toEqual([undefined, "next"])
  expect(text).toBe("abcd")
})

test("document reader refuses foreign revisions, unfinished pages, oversized bodies and repeating cursors", async () => {
  const page = { ref: receipt.artifact, representation: "markdown", receipt, text: "abcd", complete: true }
  for (const invalid of [
    { ...page, ref: { ...receipt.artifact, revision: 2 } },
    { ...page, receipt: { ...receipt, digest: "d".repeat(64) } },
    { ...page, complete: false },
    { ...page, text: "abc" },
    { ...page, text: "abcde" },
    { ...page, text: "", cursor: "repeat" },
  ]) await expect(loadResearchDocument(receipt, async () => invalid)).rejects.toThrow()
  await expect(loadResearchDocument({ ...receipt, bytes: 100 }, async () => ({ ...page,
    receipt: { ...receipt, bytes: 100 }, text: "x", complete: false, cursor: "repeat",
  }))).rejects.toThrow("Research artifact differs from its admitted document revision")
})
