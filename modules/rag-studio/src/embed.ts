import { AsyncLocalStorage } from "node:async_hooks"
import type { Chunk, Metric, NumericType, Pipeline, Sense } from "./types"
import { requireStore } from "./context"

export type Encoder = (input: { model: string; texts: string[] }) => Promise<number[][]>

const encoders = new AsyncLocalStorage<Encoder>()

export function withEncoder<T>(encoder: Encoder, run: () => T) {
  return encoders.run(encoder, run)
}

export function currentEncoder() {
  return encoders.getStore()
}

export async function redoNumbers(sourceId: string) {
  const store = requireStore()
  const source = store.sources().find((row) => row.id === sourceId)
  if (!source) return { pass: "redo_numbers" as const, result: "not_applicable" as const }
  const pipeline = store.pipeline(source.locationId)
  if (!pipeline.embeddingModel) return { pass: "redo_numbers" as const, result: "not_applicable" as const }
  const encoder = currentEncoder()
  if (!encoder) return { pass: "redo_numbers" as const, result: "no_key" as const }
  const chunks = store.chunks().filter((chunk) => chunk.sourceId === sourceId)
  if (chunks.length === 0) return { pass: "redo_numbers" as const, fill: "complete" as const }
  store.embeddingCalls += 1
  const encoded = await encoder({ model: pipeline.embeddingModel, texts: chunks.map((chunk) => chunk.text) })
  if (encoded.length !== chunks.length) throw new Error("rejected")
  const width = encoded[0]?.length ?? 0
  if (pipeline.dimension && width && pipeline.dimension !== width) {
    return { pass: "redo_numbers" as const, fill: "failed" as const }
  }
  chunks.forEach((chunk, index) => {
    store.putVector(chunk.id, pipeline.embeddingModel, quantize(encoded[index] ?? [], pipeline.numericType))
  })
  if (!pipeline.dimension && width) store.setPipeline(source.locationId, { ...pipeline, dimension: width })
  return { pass: "redo_numbers" as const, fill: "complete" as const }
}

export async function fuse(input: {
  locationId: string
  boundary: string
  sentence: string
  words: Chunk[]
  pipeline: Pipeline
}): Promise<{ matches: Chunk[]; sense: Sense }> {
  if (!input.pipeline.embeddingModel) return { matches: input.words, sense: "off" }
  const store = requireStore()
  const encoder = currentEncoder()
  const model = input.pipeline.embeddingModel
  const eligible = store.chunks().filter((chunk) => {
    const source = store.sources().find((row) => row.id === chunk.sourceId)
    if (!source || source.locationId !== input.locationId || source.status !== "read") return false
    if (source.contentHash !== chunk.sourceHash) return false
    if (store.chunkCut(chunk.id) !== input.boundary) return false
    return store.vector(chunk.id, model) !== undefined
  })
  if (!encoder || eligible.length === 0) return { matches: input.words, sense: "missing" }
  const queryModel = input.pipeline.queryModel || model
  store.embeddingCalls += 1
  const encoded = await encoder({ model: queryModel, texts: [input.sentence] })
  const query = quantize(encoded[0] ?? [], input.pipeline.numericType)
  const sample = store.vector(eligible[0].id, model)
  if (!sample || query.length !== sample.length) return { matches: input.words, sense: "missing" }
  const ranked = eligible
    .map((chunk) => ({
      chunk,
      score: score(query, store.vector(chunk.id, model) ?? [], input.pipeline.metric),
    }))
    .toSorted((left, right) => right.score - left.score)
  return { matches: merge(input.words, ranked.map((row) => row.chunk)), sense: "fused" }
}

function merge(words: Chunk[], sensed: Chunk[]) {
  const score = new Map<string, number>()
  words.forEach((chunk, index) => score.set(chunk.id, (score.get(chunk.id) ?? 0) + 1 / (60 + index + 1)))
  sensed.forEach((chunk, index) => score.set(chunk.id, (score.get(chunk.id) ?? 0) + 1 / (60 + index + 1)))
  const byId = new Map<string, Chunk>()
  for (const chunk of [...words, ...sensed]) byId.set(chunk.id, chunk)
  return [...byId.values()].toSorted((left, right) => (score.get(right.id) ?? 0) - (score.get(left.id) ?? 0))
}

function score(left: number[], right: number[], metric: Metric) {
  if (metric === "distance") return -distance(left, right)
  if (metric === "dot") return dot(left, right)
  return dot(normalize(left), normalize(right))
}

function quantize(values: number[], kind: NumericType) {
  if (kind === "binary") return values.map((value) => (value >= 0 ? 1 : 0))
  if (kind === "int8") {
    const peak = values.reduce((max, value) => Math.max(max, Math.abs(value)), 0) || 1
    return values.map((value) => Math.round((value / peak) * 127))
  }
  return values
}

function dot(left: number[], right: number[]) {
  return left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0)
}

function distance(left: number[], right: number[]) {
  return Math.sqrt(left.reduce((sum, value, index) => sum + (value - (right[index] ?? 0)) ** 2, 0))
}

function normalize(values: number[]) {
  const length = Math.sqrt(dot(values, values)) || 1
  return values.map((value) => value / length)
}
