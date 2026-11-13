import type { Pipeline, PipelineField, Revision } from "./types"
import { digest, requireStore } from "./context"
import type { Fill, StoredRevision } from "./context"

export function readPipeline(locationId: string): Promise<Pipeline> {
  return Promise.resolve(requireStore().pipeline(locationId))
}

export function setPipeline(locationId: string, field: PipelineField, value: string | number): Promise<Pipeline> {
  const store = requireStore()
  const next = apply(store.pipeline(locationId), field, value)
  store.setPipeline(locationId, next)
  return Promise.resolve(next)
}

export async function readRevision(revisionId: string): Promise<Revision> {
  const found = requireStore().revision(revisionId)
  if (!found) throw new Error("rejected")
  return {
    id: found.id,
    snapshot: found.snapshot,
    pipelineHash: found.pipelineHash,
    fill: found.fill,
  }
}

export function pipelineHash(pipeline: Pipeline) {
  return digest(
    JSON.stringify({
      boundary: pipeline.boundary,
      k: pipeline.k,
      parser: pipeline.parser,
      tokenizer: pipeline.tokenizer,
      embeddingModel: pipeline.embeddingModel,
      queryModel: pipeline.queryModel,
      dimension: pipeline.dimension,
      numericType: pipeline.numericType,
      metric: pipeline.metric,
    }),
  )
}

export function openRevision(locationId: string): Promise<StoredRevision> {
  const store = requireStore()
  const pipeline = store.pipeline(locationId)
  const members = store
    .sources()
    .filter((row) => row.locationId === locationId)
    .map((row) => ({ sourceId: row.id, contentHash: row.contentHash }))
    .sort((left, right) => (left.sourceId < right.sourceId ? -1 : left.sourceId > right.sourceId ? 1 : 0))
  const revision: StoredRevision = {
    id: store.allocate("rev"),
    snapshot: digest(members.map((row) => `${row.sourceId}\t${row.contentHash}`).join("\n")),
    pipelineHash: pipelineHash(pipeline),
    fill: fillFor(locationId, members),
    locationId,
    members,
    parser: pipeline.parser,
    boundary: pipeline.boundary,
    tokenizer: pipeline.tokenizer,
    k: pipeline.k,
    embeddingModel: pipeline.embeddingModel,
  }
  store.putRevision(revision)
  return Promise.resolve(revision)
}

function apply(current: Pipeline, field: PipelineField, value: string | number): Pipeline {
  if (field === "k") return { ...current, k: Number(value) }
  if (field === "dimension") return { ...current, dimension: Number(value) }
  if (field === "embedding_model") {
    const embeddingModel = String(value)
    return { ...current, embeddingModel, embedding: embeddingModel.length > 0 }
  }
  if (field === "query_model") return { ...current, queryModel: String(value) }
  if (field === "numeric_type") return { ...current, numericType: numeric(String(value)) }
  if (field === "metric") return { ...current, metric: metric(String(value)) }
  return { ...current, [field]: String(value) }
}

function numeric(value: string): Pipeline["numericType"] {
  if (value === "int8" || value === "binary") return value
  return "float32"
}

function metric(value: string): Pipeline["metric"] {
  if (value === "dot" || value === "distance") return value
  return "cosine"
}

export function fillFor(locationId: string, members: Array<{ sourceId: string; contentHash: string }>): Fill {
  const store = requireStore()
  if (store.failed(locationId)) return "failed"
  const memberIds = new Set(members.map((row) => row.sourceId))
  const stale = store.chunks().some((chunk) => {
    const source = store.sources().find((row) => row.id === chunk.sourceId)
    if (!source) return true
    if (source.locationId !== locationId) return false
    if (!memberIds.has(source.id)) return true
    return source.contentHash !== chunk.sourceHash
  })
  if (stale) return "failed"
  return "complete"
}
