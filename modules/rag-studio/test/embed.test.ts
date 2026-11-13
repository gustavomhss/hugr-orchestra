import { expect, test } from "bun:test"
import { ask } from "../src/ask"
import { compareRevisions } from "../src/compare"
import { memoryStore, withStore } from "../src/context"
import { withEncoder } from "../src/embed"
import { admit } from "../src/admit"
import { parseSource } from "../src/parse"
import { runPass } from "../src/passes"
import { saveQuestion } from "../src/proof"
import { openRevision, readPipeline, setPipeline } from "../src/revision"

const path = "/location/a/note.txt"
const other = "/location/a/other.txt"

test("a named OpenRouter model stores vectors and does not touch project source", async () => {
  const store = memoryStore({
    projectRoot: "/repo",
    files: { [path]: "alpha beta", [other]: "gamma only" },
  })
  await withStore(store, async () => {
    expect(await admit({ locationId: "a", path: "/repo/src/main.ts" })).toEqual({ refused: "atlas" })
    const admitted = await admit({ locationId: "a", path })
    const neighbor = await admit({ locationId: "a", path: other })
    if (!("id" in admitted) || !("id" in neighbor)) throw new Error("admit")
    await parseSource(admitted.id)
    await parseSource(neighbor.id)
    expect(await runPass("redo_numbers", admitted.id)).toEqual({ pass: "redo_numbers", result: "not_applicable" })
    await setPipeline("a", "embedding_model", "nvidia/nemotron-3-embed-1b:free")
    expect((await readPipeline("a")).embedding).toBe(true)
    expect(await runPass("redo_numbers", admitted.id)).toEqual({ pass: "redo_numbers", result: "no_key" })
    expect(store.vectors()).toEqual([])
    await withEncoder(
      async ({ texts }) => texts.map((text) => [text.length, 1]),
      async () => {
        expect(await runPass("redo_numbers", admitted.id)).toEqual({ pass: "redo_numbers", fill: "complete" })
        expect(await runPass("redo_numbers", neighbor.id)).toEqual({ pass: "redo_numbers", fill: "complete" })
        const lexical = store.chunks().find((chunk) => chunk.sourceId === admitted.id)
        const neighborChunk = store.chunks().find((chunk) => chunk.sourceId === neighbor.id)
        if (!lexical || !neighborChunk) throw new Error("chunks")
        expect(store.vector(lexical.id, "nvidia/nemotron-3-embed-1b:free")).toEqual([10, 1])
        const revision = await openRevision("a")
        const result = await ask(revision.id, "beta")
        expect(result.sense).toBe("fused")
        expect(result.hits).toEqual([lexical.id])
        expect(result.promptChunkIds).toContain(lexical.id)
        expect(result.hits).not.toContain(neighborChunk.id)
        expect(result.promptChunkIds).not.toContain(neighborChunk.id)
        expect(store.embeddingCalls).toBe(3)
      },
    )
  })
})

test("a higher-scoring neighbor does not push a word chunk past K", async () => {
  const late = "/location/a/zeta.txt"
  const store = memoryStore({
    projectRoot: "/repo",
    files: { [path]: "alpha beta", [other]: "gamma only", [late]: "beta too" },
  })
  await withStore(store, async () => {
    const admitted = await admit({ locationId: "a", path })
    const neighbor = await admit({ locationId: "a", path: other })
    const second = await admit({ locationId: "a", path: late })
    if (!("id" in admitted) || !("id" in neighbor) || !("id" in second)) throw new Error("admit")
    await parseSource(admitted.id)
    await parseSource(neighbor.id)
    await parseSource(second.id)
    await setPipeline("a", "k", 2)
    await setPipeline("a", "embedding_model", "nvidia/nemotron-3-embed-1b:free")
    await withEncoder(
      async ({ texts }) => {
        return texts.map((text) => {
          if (text === "beta") return [1, 0]
          if (text.includes("beta")) return [0, 1]
          return [1, 0]
        })
      },
      async () => {
        expect(await runPass("redo_numbers", admitted.id)).toEqual({ pass: "redo_numbers", fill: "complete" })
        expect(await runPass("redo_numbers", neighbor.id)).toEqual({ pass: "redo_numbers", fill: "complete" })
        const lexical = store.chunks().find((chunk) => chunk.sourceId === admitted.id)
        const neighborChunk = store.chunks().find((chunk) => chunk.sourceId === neighbor.id)
        const lateChunk = store.chunks().find((chunk) => chunk.sourceId === second.id)
        if (!lexical || !neighborChunk || !lateChunk) throw new Error("chunks")
        expect(store.vector(neighborChunk.id, "nvidia/nemotron-3-embed-1b:free")).toEqual([1, 0])
        expect(store.vector(lateChunk.id, "nvidia/nemotron-3-embed-1b:free")).toBeUndefined()
        const revision = await openRevision("a")
        expect(revision.k).toBe(2)
        const result = await ask(revision.id, "beta")
        expect(result.sense).toBe("fused")
        expect(result.hits).toContain(lexical.id)
        expect(result.hits).toContain(lateChunk.id)
        expect(result.promptChunkIds).toContain(lateChunk.id)
        expect(result.hits).not.toContain(neighborChunk.id)
        expect(result.promptChunkIds).not.toContain(neighborChunk.id)
        expect(result.dropped).not.toContain(lateChunk.id)
      },
    )
  })
})

test("a closer neighbor that lacks the sentence does not move the saved span", async () => {
  const store = memoryStore({
    projectRoot: "/repo",
    files: { [path]: "alpha beta", [other]: "gamma only" },
  })
  await withStore(store, async () => {
    const admitted = await admit({ locationId: "a", path })
    const neighbor = await admit({ locationId: "a", path: other })
    if (!("id" in admitted) || !("id" in neighbor)) throw new Error("admit")
    await parseSource(admitted.id)
    await parseSource(neighbor.id)
    const lexical = store.chunks().find((chunk) => chunk.sourceId === admitted.id)
    if (!lexical) throw new Error("chunk")
    const start = lexical.text.indexOf("beta")
    await setPipeline("a", "embedding_model", "model-a")
    await withEncoder(
      async ({ texts }) => texts.map((text) => (text === "beta" || !text.includes("beta") ? [1, 0] : [0, 1])),
      async () => {
        expect(await runPass("redo_numbers", admitted.id)).toEqual({ pass: "redo_numbers", fill: "complete" })
        expect(await runPass("redo_numbers", neighbor.id)).toEqual({ pass: "redo_numbers", fill: "complete" })
        const left = await openRevision("a")
        const saved = await saveQuestion(left.id, "beta", {
          sourceId: admitted.id,
          start,
          end: start + "beta".length,
        })
        await setPipeline("a", "embedding_model", "model-b")
        expect(await runPass("redo_numbers", admitted.id)).toEqual({ pass: "redo_numbers", fill: "complete" })
        expect(await runPass("redo_numbers", neighbor.id)).toEqual({ pass: "redo_numbers", fill: "complete" })
        const right = await openRevision("a")
        const compared = await compareRevisions(left.id, right.id, left.snapshot)
        if ("rejected" in compared) throw new Error("compare")
        expect(compared.questions).toEqual([
          {
            id: saved.id,
            text: "beta",
            startChanged: false,
            endChanged: false,
            textChanged: false,
          },
        ])
      },
    )
  })
})
