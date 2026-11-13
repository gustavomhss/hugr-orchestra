import { expect, test } from "bun:test"
import { memoryStore, withStore } from "../src/context"
import { citationProof, retrievalProof, saveQuestion } from "../src/proof"
import { openRevision } from "../src/revision"

test("A28 — A saved question stores the text, the labeled span, and the revision id.", async () => {
  const store = memoryStore({ projectRoot: "/project" })
  const span = { sourceId: "src_1", start: 0, end: 14 }
  store.putRevision({
    id: "rev_1",
    snapshot: "snap",
    pipelineHash: "pipe",
    fill: "complete",
    locationId: "loc_1",
    members: [],
  })
  const saved = await withStore(store, () => saveQuestion("rev_1", "where is the sentence", span))
  expect(store.questions()).toEqual([
    {
      id: saved.id,
      revisionId: "rev_1",
      text: "where is the sentence",
      span,
    },
  ])
  expect(store.chunks()).toEqual([])
  await expect(withStore(store, () => saveQuestion("missing", "where is the sentence", span))).rejects.toThrow("rejected")
})

test("A29 — Retrieval proof passes only when the labeled span id is inside the prompt block of that revision.", async () => {
  const store = memoryStore({ projectRoot: "/project" })
  const span = { sourceId: "src_1", start: 0, end: 14 }
  store.putRevision({
    id: "rev_1",
    snapshot: "snap",
    pipelineHash: "pipe",
    fill: "complete",
    locationId: "loc_1",
    members: [],
  })
  store.putChunk({
    id: "chunk_1",
    sourceId: "src_1",
    start: 0,
    end: 14,
    text: "hello sentence",
    sourceHash: "h",
  })
  store.putChunk({
    id: "wide",
    sourceId: "src_2",
    start: 0,
    end: 20,
    text: "hello sentence extra",
    sourceHash: "h",
  })
  await withStore(store, async () => {
    expect(await retrievalProof("missing", "rev_1")).toBe(false)
    const alone = await saveQuestion("rev_1", "question row alone", { sourceId: "src_missing", start: 0, end: 4 })
    expect(await retrievalProof(alone.id, "rev_1")).toBe(false)
    const saved = await saveQuestion("rev_1", "where is the sentence", span)
    expect(await retrievalProof(saved.id, "rev_other")).toBe(false)
    expect(await retrievalProof(saved.id, "rev_1")).toBe(false)
    const shifted = await saveQuestion("rev_1", "wider than the label", { sourceId: "src_2", start: 0, end: 14 })
    store.putTrace({ questionId: shifted.id, hits: ["wide"], dropped: [] })
    expect(await retrievalProof(shifted.id, "rev_1")).toBe(false)
    store.putTrace({ questionId: saved.id, hits: ["other"], dropped: [] })
    expect(await retrievalProof(saved.id, "rev_1")).toBe(false)
    store.putTrace({ questionId: saved.id, hits: ["chunk_1"], dropped: ["chunk_1"] })
    expect(await retrievalProof(saved.id, "rev_1")).toBe(false)
    store.putTrace({ questionId: saved.id, hits: ["chunk_1"], dropped: [] })
    expect(await retrievalProof(saved.id, "rev_1")).toBe(true)
  })
})

test("A30 — Citation proof passes only when the stored text of the resolved span contains the known sentence. A check that only asserts a citation id exists does not pass.", async () => {
  const store = memoryStore({ projectRoot: "/project" })
  const known = "known sentence"
  store.putRevision({
    id: "rev_1",
    snapshot: "snap",
    pipelineHash: "pipe",
    fill: "complete",
    locationId: "loc_1",
    members: [],
  })
  store.putChunk({
    id: "chunk_1",
    sourceId: "src_1",
    start: 0,
    end: 24,
    text: "pad known sentence end",
    sourceHash: "h",
  })
  await withStore(store, async () => {
    expect(await citationProof("missing", known)).toBe(false)
    const saved = await saveQuestion("rev_1", "cite the known sentence", { sourceId: "src_1", start: 4, end: 18 })
    expect(await citationProof(saved.id, known)).toBe(true)
    expect(await citationProof(saved.id, "not in the slice")).toBe(false)
    const outside = await saveQuestion("rev_1", "span misses the sentence", { sourceId: "src_1", start: 0, end: 3 })
    expect(await citationProof(outside.id, known)).toBe(false)
    const noChunk = await saveQuestion("rev_1", "saved without a chunk", { sourceId: "src_none", start: 0, end: 5 })
    expect(await citationProof(noChunk.id, known)).toBe(false)
  })
})

test("A31 — A prefix added to stored chunk text that shifts the old coordinates fails A30 for the known sentence.", async () => {
  const store = memoryStore({ projectRoot: "/project" })
  const text = "hello sentence"
  expect(text).toBe("hello sentence")
  expect(text.length).toBe(14)
  store.putRevision({
    id: "rev_1",
    snapshot: "snap",
    pipelineHash: "pipe",
    fill: "complete",
    locationId: "loc_1",
    members: [],
  })
  store.putChunk({
    id: "chunk_1",
    sourceId: "src_1",
    start: 0,
    end: 14,
    text,
    sourceHash: "h",
  })
  await withStore(store, async () => {
    const saved = await saveQuestion("rev_1", "cite sentence", { sourceId: "src_1", start: 0, end: 14 })
    expect(await citationProof(saved.id, "sentence")).toBe(true)
    store.putChunk({
      id: "chunk_1",
      sourceId: "src_1",
      start: 0,
      end: 14,
      text: "xxhello sentence",
      sourceHash: "h",
    })
    expect(await citationProof(saved.id, "sentence")).toBe(false)
  })
})

test("a rebuilt store keeps a loaded question and revision when the next one is saved", async () => {
  const store = memoryStore({ projectRoot: "/project" })
  store.putRevision({
    id: "rev_1",
    snapshot: "snap",
    pipelineHash: "pipe",
    fill: "complete",
    locationId: "loc_1",
    members: [],
  })
  store.putQuestion({
    id: "q_1",
    revisionId: "rev_1",
    text: "kept",
    span: { sourceId: "src_1", start: 0, end: 4 },
  })
  const saved = await withStore(store, () => saveQuestion("rev_1", "next", { sourceId: "src_1", start: 0, end: 4 }))
  const opened = await withStore(store, () => openRevision("loc_1"))
  expect(saved.id).toBe("q_2")
  expect(opened.id).toBe("rev_2")
  expect(store.questions().map((row) => row.id).sort()).toEqual(["q_1", "q_2"])
  expect(store.revision("rev_1")?.snapshot).toBe("snap")
})
