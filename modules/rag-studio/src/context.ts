// Lead-owned. Work packages import this file. They do not edit it.
// Contract rag-studio-v1 @ fb61d451. Signatures stay in docs/specs/rag-studio/seam.ts.

import { AsyncLocalStorage } from "node:async_hooks"
import path from "node:path"
import { blake3 } from "@noble/hashes/blake3"
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils"
import type { Chunk, Pipeline, Revision, Source, SpanRef } from "../../../docs/specs/rag-studio/seam"

export type { Chunk, FileStatus, Fill, Light, PassName, Pipeline, PipelineField, QuestionResult, Revision, Source, SpanRef } from "../../../docs/specs/rag-studio/seam"

export function digest(value: string) {
  return bytesToHex(blake3(utf8ToBytes(value)))
}

export function canonical(file: string) {
  return path.posix.normalize(file)
}

export function inProject(file: string, projectRoot: string) {
  const normalized = canonical(file)
  return normalized === projectRoot || normalized.startsWith(`${projectRoot}/`)
}

export function insideLocation(file: string, locationId: string, locationRoot?: string) {
  const normalized = canonical(file)
  if (normalized.startsWith(`/location/${locationId}/`)) return true
  if (!locationRoot) return false
  return normalized === locationRoot || normalized.startsWith(`${locationRoot}/`)
}

export function gate(
  store: Store,
  locationId: string,
  file: string,
): { path: string } | { refused: "atlas" | "permission" } {
  const normalized = canonical(file)
  if (inProject(normalized, store.projectRoot)) return { refused: "atlas" }
  if (!insideLocation(normalized, locationId, store.locationRoot) && store.permission(locationId, normalized) !== "allow") {
    return { refused: "permission" }
  }
  return { path: normalized }
}

export function defaultPipeline(): Pipeline {
  return {
    parser: "plain",
    boundary: "document",
    tokenizer: "utf16",
    lexical: true,
    embedding: false,
    k: 4,
  }
}

export interface SourceRow extends Source {
  text: string
  reparsedHash?: string | null
}

export interface QuestionRow {
  id: string
  revisionId: string
  text: string
  span: SpanRef
}

export interface TraceRow {
  questionId: string
  hits: string[]
  dropped: string[]
  k?: number
}

export interface RevisionMember {
  sourceId: string
  contentHash: string
}

export interface StoredRevision extends Revision {
  locationId: string
  members: RevisionMember[]
  parser?: string
  boundary?: string
  tokenizer?: string
  k?: number
}

export type ReadBytes = { text: string } | { failed: "no_text_layer"; bytes: string } | { failed: "missing" }

export interface Store {
  projectRoot: string
  locationRoot?: string
  atlasWrites: number
  chats: number
  embeddingCalls: number
  fail(locationId: string): void
  clear(locationId: string): void
  failed(locationId: string): boolean
  permission(locationId: string, file: string): "allow" | "deny"
  file(file: string): string | { failed: "no_text_layer"; bytes: string } | undefined
  writeFile(file: string, body: string | { failed: "no_text_layer"; bytes: string }): void
  readBytes(file: string): Promise<ReadBytes>
  allocate(prefix: string): string
  sources(): SourceRow[]
  putSource(row: SourceRow): void
  removeSource(id: string): void
  chunks(): Chunk[]
  putChunk(row: Chunk): void
  deleteChunk(id: string): void
  chunkCut(id: string): string
  setChunkCut(id: string, boundary: string): void
  pipeline(locationId: string): Pipeline
  setPipeline(locationId: string, pipeline: Pipeline): void
  revision(id: string): StoredRevision | undefined
  revisions(): StoredRevision[]
  putRevision(row: StoredRevision): void
  questions(): QuestionRow[]
  putQuestion(row: QuestionRow): void
  trace(questionId: string): TraceRow | undefined
  putTrace(row: TraceRow): void
}

const slot = new AsyncLocalStorage<Store>()

export function requireStore() {
  const found = slot.getStore()
  if (!found) throw new Error("rejected")
  return found
}

export function withStore<T>(store: Store, run: () => T) {
  return slot.run(store, run)
}

export function promptChunkIds(trace: TraceRow) {
  const dropped = new Set(trace.dropped)
  return trace.hits.filter((id) => !dropped.has(id))
}

export function textAt(store: Store, span: SpanRef) {
  const chunk = store
    .chunks()
    .find((item) => item.sourceId === span.sourceId && item.start <= span.start && item.end >= span.end)
  if (!chunk) return ""
  return chunk.text.slice(span.start - chunk.start, span.end - chunk.start)
}

export function memoryStore(input: {
  projectRoot: string
  locationRoot?: string
  allowExternal?: (locationId: string, file: string) => boolean
  files?: Record<string, string | { failed: "no_text_layer"; bytes: string }>
}): Store {
  const files = new Map<string, string | { failed: "no_text_layer"; bytes: string }>(Object.entries(input.files ?? {}))
  const sources = new Map<string, SourceRow>()
  const chunks = new Map<string, Chunk>()
  const cuts = new Map<string, string>()
  const pipelines = new Map<string, Pipeline>()
  const revisions = new Map<string, StoredRevision>()
  const failed = new Set<string>()
  const questions = new Map<string, QuestionRow>()
  const traces = new Map<string, TraceRow>()
  let seq = 0
  const allowExternal = input.allowExternal ?? (() => false)
  return {
    projectRoot: input.projectRoot,
    locationRoot: input.locationRoot,
    atlasWrites: 0,
    chats: 0,
    embeddingCalls: 0,
    fail(locationId) {
      failed.add(locationId)
    },
    clear(locationId) {
      failed.delete(locationId)
    },
    failed(locationId) {
      return failed.has(locationId)
    },
    permission(locationId, file) {
      return allowExternal(locationId, canonical(file)) ? "allow" : "deny"
    },
    file(file) {
      return files.get(canonical(file))
    },
    writeFile(file, body) {
      files.set(canonical(file), body)
    },
    async readBytes(file) {
      const found = files.get(canonical(file))
      if (found === undefined) return { failed: "missing" }
      if (typeof found === "string") return { text: found }
      return found
    },
    allocate(prefix) {
      seq += 1
      return `${prefix}_${seq}`
    },
    sources: () => [...sources.values()],
    putSource(row) {
      sources.set(row.id, row)
    },
    removeSource(id) {
      sources.delete(id)
    },
    chunks: () => [...chunks.values()],
    putChunk(row) {
      chunks.set(row.id, row)
    },
    deleteChunk(id) {
      chunks.delete(id)
      cuts.delete(id)
    },
    chunkCut(id) {
      return cuts.get(id) ?? "document"
    },
    setChunkCut(id, boundary) {
      cuts.set(id, boundary)
    },
    pipeline(locationId) {
      return pipelines.get(locationId) ?? defaultPipeline()
    },
    setPipeline(locationId, pipeline) {
      pipelines.set(locationId, pipeline)
    },
    revision(id) {
      return revisions.get(id)
    },
    revisions: () => [...revisions.values()],
    putRevision(row) {
      revisions.set(row.id, row)
    },
    questions: () => [...questions.values()],
    putQuestion(row) {
      questions.set(row.id, row)
    },
    trace(questionId) {
      return traces.get(questionId)
    },
    putTrace(row) {
      traces.set(row.questionId, row)
    },
  }
}

export function publicSource(row: SourceRow): Source {
  return {
    id: row.id,
    locationId: row.locationId,
    path: row.path,
    contentHash: row.contentHash,
    status: row.status,
  }
}
