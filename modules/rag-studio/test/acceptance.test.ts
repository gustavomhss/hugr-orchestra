import { expect, test } from "bun:test"
import { ask } from "../src/ask"
import { compareRevisions } from "../src/compare"
import { digest, memoryStore, withStore } from "../src/context"
import type { Store } from "../src/context"
import { enableEmbedding } from "../src/embed-off"
import { runPasses } from "../src/guard"
import { admit, listSources } from "../src/admit"
import { removeSource } from "../src/orphan"
import { parseSource } from "../src/parse"
import { runPass } from "../src/passes"
import { citationProof, retrievalProof, saveQuestion } from "../src/proof"
import { noteBytes, reparse } from "../src/reparse"
import { rechunk } from "../src/rechunk"
import { openRevision, readPipeline, readRevision, setPipeline } from "../src/revision"
import { searchWords } from "../src/search"
import { replaceChunkText } from "../src/span"
import { orphanDelete } from "../src/orphan"

const root = "/repo"
const path = "/location/a/note.txt"

function box(files: Record<string, string> = { [path]: "alpha beta" }) {
  const store = memoryStore({ projectRoot: root, files })
  const run = <T>(fn: () => T) => withStore(store, fn)
  return { store, run }
}

async function ready(store: Store, file = path, locationId = "a") {
  const admitted = await admit({ locationId, path: file })
  if (!("id" in admitted)) throw new Error("admit")
  await parseSource(admitted.id)
  const revision = await openRevision(locationId)
  return { source: admitted, revision }
}

test("atlas refuse, other location, and a canonical path", async () => {
  const { store, run } = box()
  await run(async () => {
    expect(await admit({ locationId: "a", path: "/repo/src/main.ts" })).toEqual({ refused: "atlas" })
    expect(await admit({ locationId: "a", path: "/tmp/../repo/src/main.ts" })).toEqual({ refused: "atlas" })
    expect(await admit({ locationId: "a", path })).toHaveProperty("id")
    expect(await listSources("b")).toEqual([])
    expect(store.atlasWrites).toBe(0)
  })
})

test("parse, search, ask sent, and the prompt block", async () => {
  const { store, run } = box()
  await run(async () => {
    const { source, revision } = await ready(store)
    const hits = await searchWords(revision.id, "beta")
    expect(hits.map((chunk) => chunk.id)).toEqual([`chk_${source.id}`])
    expect(hits[0]?.start).toBe(0)
    expect(hits[0]?.end).toBe("alpha beta".length)
    const result = await ask(revision.id, "beta")
    expect(result.light).toBe("sent")
    expect(result.reasons).toEqual({
      not_in_corpus: "not_in_corpus",
      search_miss: "search_miss",
      dropped_before_model: "dropped_before_model",
      sent: "sent",
    })
    expect(result.span).toEqual({ sourceId: source.id, start: 0, end: "alpha beta".length })
    expect(result.promptText).toBe("alpha beta")
    expect(result.promptChunkIds).toEqual([`chk_${source.id}`])
    expect(result.retrievalOptional).toBe(true)
    expect(result.hits).not.toContain("not_recorded")
    expect(result.dropped).not.toContain("not_recorded")
    expect(store.chats).toBe(0)
    expect(store.embeddingCalls).toBe(0)
    const before = store.sources()[0]?.contentHash
    await ask(revision.id, "beta")
    expect(store.sources()[0]?.contentHash).toBe(before)
    expect(store.revision(revision.id)?.snapshot).toBe(revision.snapshot)
  })
})

test("the four lights and an unread file", async () => {
  const { store, run } = box()
  await run(async () => {
    const admitted = await admit({ locationId: "a", path })
    if (!("id" in admitted)) throw new Error("admit")
    const unread = await openRevision("a")
    const waiting = await ask(unread.id, "beta")
    expect(waiting.light).toBeNull()
    expect(waiting.fileStatus).toBe("not_yet_read")
    expect(waiting.span).toBeNull()
    expect(waiting.hits).toEqual([])
    await parseSource(admitted.id)
    const revision = await openRevision("a")
    expect((await ask(revision.id, "missing")).light).toBe("not_in_corpus")
    expect((await ask(revision.id, "missing")).span).toBeNull()
    store.putChunk({
      id: "partial",
      sourceId: admitted.id,
      start: 0,
      end: 5,
      text: "alpha",
      sourceHash: store.sources()[0]?.contentHash ?? "",
    })
    store.setChunkCut("partial", "document")
    store.deleteChunk(`chk_${admitted.id}`)
    const miss = await ask(revision.id, "beta")
    expect(miss.light).toBe("search_miss")
    expect(miss.span?.sourceId).toBe(admitted.id)
    expect(store.sources()[0]?.text.slice(miss.span?.start, miss.span?.end)).toBe("beta")
    await setPipeline("a", "k", 0)
    const droppedRevision = await openRevision("a")
    store.putChunk({
      id: `chk_${admitted.id}`,
      sourceId: admitted.id,
      start: 0,
      end: "alpha beta".length,
      text: "alpha beta",
      sourceHash: store.sources()[0]?.contentHash ?? "",
    })
    store.setChunkCut(`chk_${admitted.id}`, "document")
    const dropped = await ask(droppedRevision.id, "beta")
    expect(dropped.light).toBe("dropped_before_model")
    expect(dropped.dropped).toContain(`chk_${admitted.id}`)
    expect(dropped.promptChunkIds).toEqual([])
  })
})

test("pipeline hash, revision identity, and embedding stays off", async () => {
  const { store, run } = box()
  await run(async () => {
    const pipeline = await readPipeline("a")
    expect(pipeline).toEqual({
      parser: "plain",
      boundary: "document",
      tokenizer: "utf16",
      lexical: true,
      embedding: false,
      embeddingModel: "",
      queryModel: "",
      dimension: 0,
      numericType: "float32",
      metric: "cosine",
      k: 4,
    })
    const first = await openRevision("a")
    await setPipeline("a", "k", 4)
    const same = await openRevision("a")
    expect(same.pipelineHash).toBe(first.pipelineHash)
    await setPipeline("a", "k", 2)
    const changed = await openRevision("a")
    expect(changed.pipelineHash).not.toBe(first.pipelineHash)
    expect((await readPipeline("a")).parser).toBe("plain")
    expect(await readRevision(changed.id)).toEqual({
      id: changed.id,
      snapshot: changed.snapshot,
      pipelineHash: changed.pipelineHash,
      fill: changed.fill,
    })
    await expect(readRevision("today")).rejects.toThrow("rejected")
    await expect(ask("missing", "beta")).rejects.toThrow("rejected")
    expect(await enableEmbedding()).toEqual({ refused: "embedding_off" })
    expect(await runPass("redo_numbers", "src")).toEqual({ pass: "redo_numbers", result: "not_applicable" })
    expect(store.embeddingCalls).toBe(0)
    expect((await readPipeline("a")).embedding).toBe(false)
  })
})

test("byte change, passes, and the other source stays", async () => {
  const { store, run } = box({ [path]: "alpha", "/location/a/other.txt": "gamma" })
  await run(async () => {
    const first = await admit({ locationId: "a", path })
    const second = await admit({ locationId: "a", path: "/location/a/other.txt" })
    if (!("id" in first) || !("id" in second)) throw new Error("admit")
    await parseSource(first.id)
    await parseSource(second.id)
    const before = store.sources().find((row) => row.id === second.id)
    store.writeFile(path, "alpha beta")
    const noted = await noteBytes(first.id)
    expect(noted.status).toBe("not_yet_read")
    expect(noted.contentHash).toBe(digest("alpha beta"))
    expect(await rechunk(first.id)).toEqual({ fill: "failed" })
    expect(await searchWords((await openRevision("a")).id, "beta")).toEqual([])
    expect(await reparse(first.id)).toEqual({ fill: "complete" })
    expect(store.sources().find((row) => row.id === first.id)?.status).toBe("read")
    expect(await searchWords((await openRevision("a")).id, "beta")).toEqual([])
    expect(await rechunk(first.id)).toEqual({ fill: "complete" })
    const revision = await openRevision("a")
    expect((await ask(revision.id, "beta")).light).toBe("sent")
    expect((await ask(revision.id, "old-only")).light).toBe("not_in_corpus")
    const other = store.sources().find((row) => row.id === second.id)
    expect(other?.status).toBe("read")
    expect(other?.contentHash).toBe(before?.contentHash)
    expect(store.chunks().some((chunk) => chunk.sourceId === second.id && chunk.text === "gamma")).toBe(true)
  })
})

test("remove, orphan, and the file bytes stay", async () => {
  const { store, run } = box()
  await run(async () => {
    const { source, revision } = await ready(store)
    const chunksBefore = store.chunks().length
    await removeSource(source.id)
    expect(await listSources("a")).toEqual([])
    expect(store.chunks()).toHaveLength(chunksBefore)
    expect(await searchWords(revision.id, "beta")).toEqual([])
    expect((await ask(revision.id, "beta")).light).not.toBe("sent")
    expect((await ask(revision.id, "beta")).span).toBeNull()
    await orphanDelete()
    expect(store.chunks().filter((chunk) => chunk.sourceId === source.id)).toEqual([])
    expect(await rechunk(source.id)).toEqual({ fill: "failed" })
    expect(await searchWords(revision.id, "beta")).toEqual([])
    const gone = await openRevision("a")
    expect((await ask(gone.id, "beta")).light).toBe("not_in_corpus")
    expect(store.file(path)).toBe("alpha beta")
  })
})

test("boundary change waits for rechunk, then comparison names both questions", async () => {
  const { store, run } = box({ [path]: "alpha\nbeta", "/location/a/solo.txt": "solo" })
  await run(async () => {
    const changed = await admit({ locationId: "a", path })
    const still = await admit({ locationId: "a", path: "/location/a/solo.txt" })
    if (!("id" in changed) || !("id" in still)) throw new Error("admit")
    await parseSource(changed.id)
    await parseSource(still.id)
    const left = await openRevision("a")
    const moved = await saveQuestion(left.id, "beta", { sourceId: changed.id, start: 0, end: "alpha\nbeta".length })
    const kept = await saveQuestion(left.id, "solo", { sourceId: still.id, start: 0, end: 4 })
    await setPipeline("a", "boundary", "line")
    const right = await openRevision("a")
    expect((await ask(right.id, "beta")).light).not.toBe("sent")
    const early = await compareRevisions(left.id, right.id, left.snapshot)
    if ("rejected" in early) throw new Error("compare")
    expect(early.questions.every((row) => !row.startChanged && !row.endChanged && !row.textChanged)).toBe(true)
    await rechunk(changed.id)
    await rechunk(still.id)
    const after = await compareRevisions(left.id, right.id, left.snapshot)
    if ("rejected" in after) throw new Error("compare")
    const movedRow = after.questions.find((row) => row.id === moved.id)
    const keptRow = after.questions.find((row) => row.id === kept.id)
    expect(movedRow?.startChanged || movedRow?.endChanged || movedRow?.textChanged).toBe(true)
    expect(keptRow).toEqual({ id: kept.id, text: "solo", startChanged: false, endChanged: false, textChanged: false })
    expect(await compareRevisions(left.id, right.id, "other")).toEqual({ rejected: true })
    const twin = await openRevision("a")
    await setPipeline("a", "k", 2)
    await setPipeline("a", "parser", "other")
    const drifted = await openRevision("a")
    expect(await compareRevisions(twin.id, drifted.id, twin.snapshot)).toEqual({ rejected: true })
  })
})

test("proofs, a shifted span, and a foreign K", async () => {
  const { store, run } = box()
  await run(async () => {
    const { source, revision } = await ready(store)
    const saved = await saveQuestion(revision.id, "beta", { sourceId: source.id, start: 0, end: "alpha beta".length })
    expect(store.questions()[0]).toMatchObject({ text: "beta", revisionId: revision.id })
    store.putTrace({ questionId: saved.id, hits: [`chk_${source.id}`], dropped: [], k: revision.k })
    expect(await retrievalProof(saved.id, revision.id)).toBe(true)
    expect(await retrievalProof(saved.id, "other")).toBe(false)
    expect(await citationProof(saved.id, "beta")).toBe(true)
    expect(await citationProof("missing", "beta")).toBe(false)
    store.putChunk({
      id: `chk_${source.id}`,
      sourceId: source.id,
      start: 0,
      end: "alpha beta".length,
      text: "xxalpha beta",
      sourceHash: store.sources()[0]?.contentHash ?? "",
    })
    expect(await citationProof(saved.id, "beta")).toBe(false)
    store.putTrace({ questionId: saved.id, hits: [`chk_${source.id}`], dropped: [], k: 1 })
    await expect(retrievalProof(saved.id, revision.id)).rejects.toThrow("rejected")
    expect(await replaceChunkText("chk", "nope")).toEqual({ refused: "not_source_text" })
  })
})

test("one pass only, screens do not write, and fill fails when the cut is stale", async () => {
  const { store, run } = box()
  await run(async () => {
    const { source } = await ready(store)
    const chunks = store.chunks().map((chunk) => chunk.text)
    expect(await runPasses(["reparse", "rechunk"])).toEqual({ refused: "one_pass" })
    expect(store.chunks().map((chunk) => chunk.text)).toEqual(chunks)
    await setPipeline("a", "boundary", "line")
    expect(store.chunks().map((chunk) => chunk.text)).toEqual(chunks)
    await removeSource(source.id)
    expect(store.chunks().map((chunk) => chunk.text)).toEqual(chunks)
    await listSources("a")
    await readPipeline("a")
    expect(store.chunks().map((chunk) => chunk.text)).toEqual(chunks)
    const failed = await openRevision("a")
    expect(failed.fill).toBe("failed")
    await expect(ask(failed.id, "beta")).rejects.toThrow("rejected")
    expect(store.file(path)).toBe("alpha beta")
  })
})
