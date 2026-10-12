import { expect, test } from "bun:test"
import { Schema } from "effect"
import { Research } from "@orchestra/schema/research"
import { loadResearchDocument } from "./research-document"

const receipt = Schema.decodeUnknownSync(Research.DocumentReceipt)({
  binding: {
    projectID: "fixture",
    memberID: "jimmy",
    taskId: "task-fixture",
    executionSessionID: "ses_fixture",
    authoritySessionID: "ses_authority",
    directory: "/fixture",
    worktree: "/fixture",
  },
  ref: { id: `rdoc_${"a".repeat(26)}`, revision: 1 },
  artifact: { id: `cart_${"b".repeat(26)}`, revision: 1 },
  digest: new Bun.CryptoHasher("sha256").update("abcd").digest("hex"),
  title: "Qualified answer",
  genre: "answer",
  bytes: 4,
  publishedAt: 1,
  findingRefs: [],
  citations: {},
})

test("document reader binds every page and preserves exact text across bounded continuation", async () => {
  const calls: (string | undefined)[] = []
  const text = await loadResearchDocument(receipt, async (sessionID, artifact, cursor) => {
    expect(sessionID).toBe(receipt.binding.executionSessionID)
    expect(artifact).toEqual(receipt.artifact)
    calls.push(cursor)
    return {
      ref: receipt.artifact,
      representation: "markdown",
      receipt,
      text: cursor ? "cd" : "ab",
      complete: !!cursor,
      ...(cursor ? {} : { cursor: "next" }),
    }
  })
  expect(calls).toEqual([undefined, "next"])
  expect(text).toBe("abcd")
})

test("document reader refuses foreign revisions, unfinished pages, oversized bodies and repeating cursors", async () => {
  const page = { ref: receipt.artifact, representation: "markdown", receipt, text: "abcd", complete: true }
  for (const invalid of [
    { ...page, ref: { ...receipt.artifact, revision: 2 } },
    { ...page, receipt: { ...receipt, digest: "d".repeat(64) } },
    { ...page, receipt: { ...receipt, artifact: { ...receipt.artifact, revision: 2 } } },
    { ...page, receipt: { ...receipt, title: "Foreign title" } },
    { ...page, receipt: { ...receipt, genre: "comparison" } },
    { ...page, receipt: { ...receipt, publishedAt: 2 } },
    { ...page, receipt: { ...receipt, findingRefs: [{ id: `rfnd_${"e".repeat(26)}`, revision: 1 }] } },
    {
      ...page,
      receipt: {
        ...receipt,
        citations: {
          foreign: {
            source: { artifact: receipt.artifact, representation: "text", digest: receipt.digest },
            locator: { kind: "lines", start: 1, end: 1 },
          },
        },
      },
    },
    { ...page, complete: true, cursor: "next" },
    { ...page, complete: false },
    { ...page, text: "abc" },
    { ...page, text: "abcde" },
    { ...page, text: "", cursor: "repeat" },
  ])
    await expect(loadResearchDocument(receipt, async () => invalid)).rejects.toThrow()
  await expect(
    loadResearchDocument({ ...receipt, bytes: 100 }, async () => ({
      ...page,
      receipt: { ...receipt, bytes: 100 },
      text: "x",
      complete: false,
      cursor: "repeat",
    })),
  ).rejects.toThrow("Research artifact differs from its admitted document revision")
})

test("document reader rejects every foreign binding field before following continuation", async () => {
  for (const binding of [
    { ...receipt.binding, projectID: "other" },
    { ...receipt.binding, taskId: "other" },
    { ...receipt.binding, executionSessionID: "ses_other" },
    { ...receipt.binding, authoritySessionID: "ses_other" },
    { ...receipt.binding, directory: "/other" },
    { ...receipt.binding, worktree: "/other" },
  ]) {
    const calls: (string | undefined)[] = []
    await expect(
      loadResearchDocument(receipt, async (_, __, cursor) => {
        calls.push(cursor)
        return {
          ref: receipt.artifact,
          representation: "markdown",
          receipt: { ...receipt, binding },
          text: "ab",
          complete: false,
          cursor: "next",
        }
      }),
    ).rejects.toThrow("Research artifact differs from its admitted document revision")
    expect(calls).toEqual([undefined])
  }
})

test("document reader verifies UTF-8 bytes and digest, not only matching receipt labels", async () => {
  const body = "אב🙂\n"
  const admitted = {
    ...receipt,
    bytes: new TextEncoder().encode(body).byteLength,
    digest: new Bun.CryptoHasher("sha256").update(body).digest("hex"),
  }
  expect(
    await loadResearchDocument(admitted, async (_, __, cursor) => ({
      ref: admitted.artifact,
      representation: "markdown",
      receipt: admitted,
      text: cursor ? "🙂\n" : "אב",
      complete: !!cursor,
      ...(cursor ? {} : { cursor: "next" }),
    })),
  ).toBe(body)
  await expect(
    loadResearchDocument(receipt, async () => ({
      ref: receipt.artifact,
      representation: "markdown",
      receipt,
      text: "abce",
      complete: true,
    })),
  ).rejects.toThrow("Research artifact differs from its admitted document revision")
})

test("document reader cancellation stops before first read and after an in-flight page", async () => {
  const cancelled = new AbortController()
  cancelled.abort()
  const calls: (string | undefined)[] = []
  const read = async (_: string, __: typeof receipt.artifact, cursor?: string) => {
    calls.push(cursor)
    return { ref: receipt.artifact, representation: "markdown", receipt, text: "abcd", complete: true }
  }
  await expect(loadResearchDocument(receipt, read, cancelled.signal)).rejects.toHaveProperty("name", "AbortError")
  expect(calls).toEqual([])

  const controller = new AbortController()
  const page = Promise.withResolvers<unknown>()
  const loading = loadResearchDocument(
    receipt,
    async (_, __, cursor) => {
      calls.push(cursor)
      return page.promise
    },
    controller.signal,
  )
  controller.abort()
  page.resolve({
    ref: receipt.artifact,
    representation: "markdown",
    receipt,
    text: "ab",
    complete: false,
    cursor: "next",
  })
  await expect(loading).rejects.toHaveProperty("name", "AbortError")
  expect(calls).toEqual([undefined])
})

test("document reader bounds requests even when every cursor is unique and makes byte progress", async () => {
  const calls: (string | undefined)[] = []
  const admitted = {
    ...receipt,
    bytes: 100,
    digest: new Bun.CryptoHasher("sha256").update("x".repeat(100)).digest("hex"),
  }
  await expect(
    loadResearchDocument(admitted, async (_, __, cursor) => {
      calls.push(cursor)
      return {
        ref: admitted.artifact,
        representation: "markdown",
        receipt: admitted,
        text: "x",
        complete: false,
        cursor: `next-${calls.length}`,
      }
    }),
  ).rejects.toThrow("Research document exceeds supported page bounds")
  expect(calls).toHaveLength(17)
})
