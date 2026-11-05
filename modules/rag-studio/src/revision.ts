import type { Pipeline, PipelineField, Revision } from "./types"
import { digest, requireStore } from "./context"
import type { Fill, StoredRevision } from "./context"

export function readPipeline(locationId: string): Promise<Pipeline> {
  return Promise.resolve(requireStore().pipeline(locationId))
}

export function setPipeline(locationId: string, field: PipelineField, value: string | number): Promise<Pipeline> {
  const store = requireStore()
  const current = store.pipeline(locationId)
  const next = {
    ...current,
    [field]: field === "k" ? Number(value) : String(value),
  } as Pipeline
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
  }
  store.putRevision(revision)
  return Promise.resolve(revision)
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
