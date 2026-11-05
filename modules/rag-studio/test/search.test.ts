import { expect, test } from "bun:test"
import { memoryStore, withStore } from "../src/context"
import { searchWords } from "../src/search"

test("A52 — Given a current `read` file whose text contains the word W and not the word Z, word search for W returns only chunk ids whose stored text contains W. Word search for Z returns no chunk ids and no invented span.", async () => {
  const store = memoryStore({ projectRoot: "/project" })
  const file = "W is here. And more. W again"
  const early = {
    id: "chunk_early",
    sourceId: "src_read",
    start: 0,
    end: 10,
    text: "W is here.",
    sourceHash: "h_read",
  }
  const other = {
    id: "chunk_other",
    sourceId: "src_read",
    start: 11,
    end: 20,
    text: "And more.",
    sourceHash: "h_read",
  }
  const late = {
    id: "chunk_late",
    sourceId: "src_read",
    start: 21,
    end: 28,
    text: "W again",
    sourceHash: "h_read",
  }
  store.putSource({
    id: "src_read",
    locationId: "loc_1",
    path: "notes.txt",
    contentHash: "h_read",
    status: "read",
    text: file,
  })
  store.putChunk(late)
  store.putChunk(other)
  store.putChunk(early)
  store.putRevision({
    id: "rev_a52",
    snapshot: "snap_a52",
    pipelineHash: "pipe",
    fill: "complete",
    locationId: "loc_1",
    members: [{ sourceId: "src_read", contentHash: "h_read" }],
  })
  expect(file.includes("W")).toBe(true)
  expect(file.includes("Z")).toBe(false)
  expect(file.slice(early.start, early.end)).toBe(early.text)
  expect(file.slice(other.start, other.end)).toBe(other.text)
  expect(file.slice(late.start, late.end)).toBe(late.text)
  const before = JSON.stringify({
    sources: store.sources(),
    chunks: store.chunks(),
    revision: store.revision("rev_a52"),
  })
  const found = await withStore(store, () => searchWords("rev_a52", "W"))
  const missed = await withStore(store, () => searchWords("rev_a52", "Z"))
  expect(found).toEqual([early, late])
  expect(found.map((hit) => hit.id)).toEqual(["chunk_early", "chunk_late"])
  expect(found.every((hit) => hit.text.includes("W"))).toBe(true)
  expect(found.some((hit) => hit.id === other.id)).toBe(false)
  expect(missed).toEqual([])
  expect(
    JSON.stringify({
      sources: store.sources(),
      chunks: store.chunks(),
      revision: store.revision("rev_a52"),
    }),
  ).toBe(before)
})

test("A79 — Word search returns no chunk id from a `not_yet_read`, `failed`, or hash-stale source, even when another current `read` file contains the same word. It returns the current `read` file's matching chunk ids and invents no span.", async () => {
  const store = memoryStore({ projectRoot: "/project" })
  const unread = {
    id: "chunk_unread",
    sourceId: "src_unread",
    start: 0,
    end: 6,
    text: "needle",
    sourceHash: "h_unread",
  }
  const failed = {
    id: "chunk_failed",
    sourceId: "src_failed",
    start: 0,
    end: 6,
    text: "needle",
    sourceHash: "h_failed",
  }
  const stale = {
    id: "chunk_stale",
    sourceId: "src_stale",
    start: 0,
    end: 6,
    text: "needle",
    sourceHash: "h_old",
  }
  const hitEarly = {
    id: "chunk_hit_early",
    sourceId: "src_current",
    start: 0,
    end: 6,
    text: "needle",
    sourceHash: "h_now",
  }
  const miss = {
    id: "chunk_miss",
    sourceId: "src_current",
    start: 7,
    end: 12,
    text: "other",
    sourceHash: "h_now",
  }
  const hitLate = {
    id: "chunk_hit_late",
    sourceId: "src_current",
    start: 13,
    end: 19,
    text: "needle",
    sourceHash: "h_now",
  }
  const elsewhere = {
    id: "chunk_elsewhere",
    sourceId: "src_elsewhere",
    start: 2,
    end: 8,
    text: "needle",
    sourceHash: "h_else",
  }
  const orphan = {
    id: "chunk_orphan",
    sourceId: "src_missing",
    start: 4,
    end: 10,
    text: "needle",
    sourceHash: "h_orphan",
  }
  store.putSource({
    id: "src_unread",
    locationId: "loc_1",
    path: "unread.txt",
    contentHash: "h_unread",
    status: "not_yet_read",
    text: "needle",
  })
  store.putSource({
    id: "src_failed",
    locationId: "loc_1",
    path: "failed.txt",
    contentHash: "h_failed",
    status: "failed",
    text: "needle",
  })
  store.putSource({
    id: "src_stale",
    locationId: "loc_1",
    path: "stale.txt",
    contentHash: "h_fresh",
    status: "read",
    text: "needle",
  })
  store.putSource({
    id: "src_current",
    locationId: "loc_1",
    path: "current.txt",
    contentHash: "h_now",
    status: "read",
    text: "needle other needle",
  })
  store.putSource({
    id: "src_elsewhere",
    locationId: "loc_other",
    path: "elsewhere.txt",
    contentHash: "h_else",
    status: "read",
    text: "x needle",
  })
  store.putChunk(unread)
  store.putChunk(failed)
  store.putChunk(stale)
  store.putChunk(hitLate)
  store.putChunk(miss)
  store.putChunk(hitEarly)
  store.putChunk(elsewhere)
  store.putChunk(orphan)
  store.putRevision({
    id: "rev_a79",
    snapshot: "snap_a79",
    pipelineHash: "pipe",
    fill: "complete",
    locationId: "loc_1",
    members: [
      { sourceId: "src_unread", contentHash: "h_unread" },
      { sourceId: "src_failed", contentHash: "h_failed" },
      { sourceId: "src_stale", contentHash: "h_fresh" },
      { sourceId: "src_current", contentHash: "h_now" },
    ],
  })
  expect(stale.sourceHash).not.toBe(store.sources().find((source) => source.id === "src_stale")?.contentHash)
  const found = await withStore(store, () => searchWords("rev_a79", "needle"))
  expect(found).toEqual([hitEarly, hitLate])
  expect(found.map((hit) => hit.id)).toEqual(["chunk_hit_early", "chunk_hit_late"])
  expect(found.map((hit) => hit.id)).not.toContain(unread.id)
  expect(found.map((hit) => hit.id)).not.toContain(failed.id)
  expect(found.map((hit) => hit.id)).not.toContain(stale.id)
  expect(found.map((hit) => hit.id)).not.toContain(miss.id)
  expect(found.map((hit) => hit.id)).not.toContain(elsewhere.id)
  expect(found.map((hit) => hit.id)).not.toContain(orphan.id)
  expect(found[0]?.start).toBe(hitEarly.start)
  expect(found[0]?.end).toBe(hitEarly.end)
  expect(found[1]?.start).toBe(hitLate.start)
  expect(found[1]?.end).toBe(hitLate.end)
})

test("A48 — An empty corpus returns no invented hits. (The light itself is not this file. Assert search returns `[]`.)", async () => {
  const store = memoryStore({ projectRoot: "/project" })
  store.putRevision({
    id: "rev_empty",
    snapshot: "snap_empty",
    pipelineHash: "pipe",
    fill: "complete",
    locationId: "loc_1",
    members: [],
  })
  const found = await withStore(store, () => searchWords("rev_empty", "W"))
  expect(found).toEqual([])
  expect(store.chunks()).toEqual([])
  expect(store.sources()).toEqual([])
})

test("paths b.txt then a.txt come back a then b", async () => {
  const store = memoryStore({ projectRoot: "/project" })
  const chunkB = {
    id: "chunk_b",
    sourceId: "src_b",
    start: 0,
    end: 1,
    text: "w",
    sourceHash: "h_b",
  }
  const chunkA = {
    id: "chunk_a",
    sourceId: "src_a",
    start: 9,
    end: 10,
    text: "w",
    sourceHash: "h_a",
  }
  store.putSource({
    id: "src_b",
    locationId: "loc_1",
    path: "b.txt",
    contentHash: "h_b",
    status: "read",
    text: "w",
  })
  store.putChunk(chunkB)
  store.putSource({
    id: "src_a",
    locationId: "loc_1",
    path: "a.txt",
    contentHash: "h_a",
    status: "read",
    text: "w",
  })
  store.putChunk(chunkA)
  store.putRevision({
    id: "rev_order",
    snapshot: "snap_order",
    pipelineHash: "pipe",
    fill: "complete",
    locationId: "loc_1",
    members: [
      { sourceId: "src_b", contentHash: "h_b" },
      { sourceId: "src_a", contentHash: "h_a" },
    ],
  })
  const found = await withStore(store, () => searchWords("rev_order", "w"))
  expect(found).toEqual([chunkA, chunkB])
  expect(found.map((hit) => hit.id)).toEqual(["chunk_a", "chunk_b"])
})

test('`"Beta"` does not match a chunk whose text is `"beta"`', async () => {
  const store = memoryStore({ projectRoot: "/project" })
  const chunk = {
    id: "chunk_beta",
    sourceId: "src_beta",
    start: 0,
    end: 4,
    text: "beta",
    sourceHash: "h_beta",
  }
  store.putSource({
    id: "src_beta",
    locationId: "loc_1",
    path: "case.txt",
    contentHash: "h_beta",
    status: "read",
    text: "beta",
  })
  store.putChunk(chunk)
  store.putRevision({
    id: "rev_case",
    snapshot: "snap_case",
    pipelineHash: "pipe",
    fill: "complete",
    locationId: "loc_1",
    members: [{ sourceId: "src_beta", contentHash: "h_beta" }],
  })
  const upper = await withStore(store, () => searchWords("rev_case", "Beta"))
  const lower = await withStore(store, () => searchWords("rev_case", "beta"))
  expect(upper).toEqual([])
  expect(lower).toEqual([chunk])
})

test("a hash-stale chunk (source.contentHash !== chunk.sourceHash) is absent", async () => {
  const store = memoryStore({ projectRoot: "/project" })
  const stale = {
    id: "chunk_stale",
    sourceId: "src_mixed",
    start: 0,
    end: 1,
    text: "w",
    sourceHash: "h_old",
  }
  const fresh = {
    id: "chunk_fresh",
    sourceId: "src_mixed",
    start: 2,
    end: 3,
    text: "w",
    sourceHash: "h_fresh",
  }
  store.putSource({
    id: "src_mixed",
    locationId: "loc_1",
    path: "mixed.txt",
    contentHash: "h_fresh",
    status: "read",
    text: "w w",
  })
  store.putChunk(stale)
  store.putChunk(fresh)
  store.putRevision({
    id: "rev_stale",
    snapshot: "snap_stale",
    pipelineHash: "pipe",
    fill: "complete",
    locationId: "loc_1",
    members: [{ sourceId: "src_mixed", contentHash: "h_fresh" }],
  })
  expect(store.sources()[0]?.contentHash).not.toBe(stale.sourceHash)
  const found = await withStore(store, () => searchWords("rev_stale", "w"))
  expect(found.map((hit) => hit.id)).not.toContain(stale.id)
  expect(found).toEqual([fresh])
})

test('searchWords("today", "w") throws when no revision has that id', async () => {
  const store = memoryStore({ projectRoot: "/project" })
  const chunk = {
    id: "chunk_today",
    sourceId: "src_today",
    start: 0,
    end: 1,
    text: "w",
    sourceHash: "h_today",
  }
  store.putSource({
    id: "src_today",
    locationId: "loc_1",
    path: "today",
    contentHash: "h_today",
    status: "read",
    text: "w",
  })
  store.putChunk(chunk)
  store.putRevision({
    id: "rev_1",
    snapshot: "today",
    pipelineHash: "pipe",
    fill: "complete",
    locationId: "loc_1",
    members: [{ sourceId: "src_today", contentHash: "h_today" }],
  })
  const found = await withStore(store, () => searchWords("rev_1", "w"))
  expect(found).toEqual([chunk])
  const thrown = await withStore(store, () => searchWords("today", "w")).catch((error: unknown) => error)
  if (!(thrown instanceof Error)) throw new Error("expected rejection")
  expect(thrown.message).toBe("rejected")
})
