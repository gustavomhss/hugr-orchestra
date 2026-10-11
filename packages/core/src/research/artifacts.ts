export * as ResearchArtifacts from "./artifacts"

import { Capability } from "@orchestra/schema/capability"
import { Research } from "@orchestra/schema/research"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { constants } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"
import { Global } from "../global"
import { ResearchLedger } from "./ledger"

export type PutInput = {
  readonly content: Uint8Array | string
  readonly representation: typeof Research.Representation.Type
  readonly artifact?: Capability.ArtifactRef
}
export type Stored = { readonly ref: Capability.ArtifactRef; readonly digest: string; readonly bytes: number }
export interface Interface {
  readonly put: (binding: Research.Binding, input: PutInput, operation: string) => Effect.Effect<Stored, Research.Error>
  readonly read: (binding: Research.Binding, artifact: Capability.ArtifactRef, cursor?: string, scope?: "task") => Effect.Effect<Research.ArtifactPage, Research.Error>
  readonly verifySource: (binding: Research.Binding, ref: Research.SourceRef) => Effect.Effect<void, Research.Error>
  /** Host removal hook: call before deleting native task/Session placement. Never a model-facing file operation. */
  readonly remove: (binding: Research.Binding) => Effect.Effect<void, Research.Error>
  /** Stable host intent reconciles metadata and timestamps across file-before-event failures. Bodies stay outside it. */
  readonly prepare: (binding: Research.Binding, entry: ResearchLedger.Entry) => Effect.Effect<ResearchLedger.Entry, Research.Error>
}
export class Service extends Context.Service<Service, Interface>()("@orchestra/ResearchArtifacts") {}

const Manifest = Schema.Struct({
  binding: Research.Binding, operation: Schema.String, ref: Capability.ArtifactRef,
  representation: Research.Representation, digest: Research.Digest, bytes: Schema.Int,
})
const Cursor = Schema.Struct({
  bindingHash: Research.Digest, ref: Capability.ArtifactRef, digest: Research.Digest,
  representation: Research.Representation, offset: Schema.Int, size: Schema.Literal(Research.Limits.pageBytes),
})

export const layer = Layer.effect(Service, Effect.gen(function* () {
  const global = yield* Global.Service
  const database = yield* Database.Service
  const retained = (binding: Research.Binding) => ResearchLedger.retained(binding).pipe(Effect.provideService(Database.Service, database))
  const entries = (binding: Research.Binding, id: string, scope?: "task") => ResearchLedger.entries(binding, id, scope === "task").pipe(Effect.provideService(Database.Service, database))

  const put = Effect.fn("ResearchArtifacts.put")(function* (binding: Research.Binding, input: PutInput, operation: string) {
    if ((typeof input.content === "string" ? Buffer.byteLength(input.content, "utf8") : input.content.byteLength) > Research.Limits.sourceBytes)
      return yield* new Research.Error({ code: "over_cap", message: "Research artifact exceeds source byte limit" })
    const content = typeof input.content === "string" ? Buffer.from(input.content, "utf8") : Buffer.from(input.content)
    const representation = yield* Schema.decodeUnknownEffect(Research.Representation)(input.representation).pipe(
      Effect.mapError(() => new Research.Error({ code: "unsupported", message: "Unsupported research representation" })),
    )
    if (!operation || Buffer.byteLength(operation) > 256)
      return yield* new Research.Error({ code: "reference_invalid", message: "Invalid host operation" })
    yield* retained(binding)
    const ref = yield* Schema.decodeUnknownEffect(Capability.ArtifactRef)(input.artifact ?? {
      id: `cart_${ResearchLedger.digest(ResearchLedger.canonical([binding, operation])).slice(0, 26)}`, revision: 1,
    }).pipe(Effect.mapError(() => new Research.Error({ code: "reference_invalid", message: "Invalid artifact reference" })))
    const manifest = { binding, operation, ref, representation, digest: ResearchLedger.digest(content), bytes: content.byteLength }
    return yield* Effect.tryPromise({
      try: async () => {
        const root = await directory(global.data, binding, true)
        const operationPath = path.join(root, `op-${ResearchLedger.digest(operation)}.json`)
        const existing = await bytes(operationPath, Research.Limits.eventBytes).catch((error: unknown) => {
          if (missing(error)) return undefined
          throw error
        })
        const stored = existing ? Schema.decodeUnknownSync(Schema.fromJsonString(Manifest))(existing.toString("utf8")) : undefined
        if (stored && ResearchLedger.canonical(stored) !== ResearchLedger.canonical(manifest))
          throw new Research.Error({ code: "conflict", message: "Artifact operation was reused with different input or reference" })
        // Immutable deterministic body survives a crash before its operation manifest or ledger receipt.
        await publish(path.join(root, `${ref.id}-${ref.revision}.body`), content)
        await publish(operationPath, Buffer.from(ResearchLedger.canonical(manifest)))
        return { ref, digest: manifest.digest, bytes: manifest.bytes }
      },
      catch: (error) => error instanceof Research.Error ? error : new Research.Error({ code: "publication_uncertain", message: "Research artifact publication is uncertain" }),
    })
  })

  const load = Effect.fn("ResearchArtifacts.load")(function* (binding: Research.Binding, artifact: Capability.ArtifactRef, scope?: "task") {
    const ref = yield* Schema.decodeUnknownEffect(Capability.ArtifactRef)(artifact).pipe(
      Effect.mapError(() => new Research.Error({ code: "not_found", message: "Research artifact not found" })),
    )
    yield* retained(binding)
    const admitted = (yield* entries(binding, ref.id, scope)).filter((entry) => {
      if (entry.type === "research.source.admitted") return entry.data.receipt.ref.artifact.revision === ref.revision
      if (entry.type === "research.document.published") return entry.data.receipt.artifact.revision === ref.revision
      return false
    })
    const event = admitted[0]
    if (admitted.length !== 1 || !event || event.type === "research.record.committed")
      return yield* new Research.Error({ code: "not_found", message: "Research artifact not found" })
    yield* retained(event.data.binding)
    const receipt = event.data.receipt
    const representation = event.type === "research.source.admitted" ? event.data.receipt.ref.representation : "markdown"
    const digest = event.type === "research.source.admitted" ? event.data.receipt.ref.digest : event.data.receipt.digest
    const content = yield* Effect.tryPromise({
      try: async () => {
        const root = await directory(global.data, event.data.binding, false)
        const manifest = Schema.decodeUnknownSync(Schema.fromJsonString(Manifest))(
          (await bytes(path.join(root, `op-${ResearchLedger.digest(event.data.operation)}.json`), Research.Limits.eventBytes)).toString("utf8"),
        )
        if (manifest.operation !== event.data.operation || manifest.ref.id !== ref.id || manifest.ref.revision !== ref.revision || manifest.digest !== digest ||
          manifest.representation !== representation || manifest.bytes !== receipt.bytes ||
          ResearchLedger.canonical(manifest.binding) !== ResearchLedger.canonical(event.data.binding))
          throw new Error("Manifest differs from admission")
        const body = await bytes(path.join(root, `${ref.id}-${ref.revision}.body`), Research.Limits.sourceBytes)
        if (body.byteLength !== receipt.bytes || ResearchLedger.digest(body) !== digest) throw new Error("Body differs from admission")
        return body
      },
      catch: () => new Research.Error({ code: "source_unavailable", message: "Admitted research bytes are missing or corrupt" }),
    })
    return { ref, receipt, representation, digest, content, event }
  })
  const verifySource = Effect.fn("ResearchArtifacts.verifySource")(function* (binding: Research.Binding, ref: Research.SourceRef) {
    const stored = yield* load(binding, ref.artifact)
    if (stored.event.type !== "research.source.admitted" || stored.digest !== ref.digest || stored.representation !== ref.representation)
      return yield* new Research.Error({ code: "reference_invalid", message: "Source representation does not match its admission" })
  })
  const read = Effect.fn("ResearchArtifacts.read")(function* (binding: Research.Binding, artifact: Capability.ArtifactRef, cursor?: string, scope?: "task") {
    const stored = yield* load(binding, artifact, scope)
    const decoded = cursor === undefined ? undefined : Schema.decodeUnknownOption(Schema.fromJsonString(Cursor))(
      Buffer.from(cursor, "base64url").toString("utf8"),
    )
    if (decoded && (Option.isNone(decoded) || decoded.value.bindingHash !== ResearchLedger.digest(ResearchLedger.canonical(binding)) ||
      decoded.value.ref.id !== stored.ref.id || decoded.value.ref.revision !== stored.ref.revision || decoded.value.digest !== stored.digest ||
      decoded.value.representation !== stored.representation))
      return yield* new Research.Error({ code: "reference_invalid", message: "Research artifact cursor does not match" })
    const offset = decoded && Option.isSome(decoded) ? decoded.value.offset : 0
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > stored.content.byteLength ||
      (offset > 0 && (offset === stored.content.byteLength || (stored.content[offset] & 0xc0) === 0x80)))
      return yield* new Research.Error({ code: "reference_invalid", message: "Invalid research artifact cursor offset" })
    // Validate the whole admitted representation before returning any textual page; binary is never replacement-decoded.
    yield* Effect.try({ try: () => new TextDecoder("utf-8", { fatal: true }).decode(stored.content),
      catch: () => new Research.Error({ code: "unsupported", message: "Research artifact is not supported UTF-8 text" }) })
    const end = Math.min(offset + Research.Limits.pageBytes, stored.content.byteLength)
    const boundary = end === stored.content.byteLength ? end : end - ([0, 1, 2, 3].find((back) => (stored.content[end - back] & 0xc0) !== 0x80) ?? 0)
    const next = boundary < stored.content.byteLength ? Buffer.from(ResearchLedger.canonical({
      bindingHash: ResearchLedger.digest(ResearchLedger.canonical(binding)), ref: stored.ref, digest: stored.digest, representation: stored.representation,
      offset: boundary, size: Research.Limits.pageBytes,
    })).toString("base64url") : undefined
    return {
      ref: stored.ref, representation: stored.representation, text: stored.content.subarray(offset, boundary).toString("utf8"), receipt: stored.receipt,
      complete: next === undefined && (stored.event.type !== "research.source.admitted" || stored.event.data.receipt.complete),
      ...(next ? { cursor: next } : {}),
    }
  })
  const remove = Effect.fn("ResearchArtifacts.remove")(function* (binding: Research.Binding) {
    yield* retained(binding)
    yield* Effect.tryPromise({
      try: async () => {
        const root = await directory(global.data, binding, false).catch((error: unknown) => {
          if (missing(error)) return undefined
          throw error
        })
        if (root) await fs.rm(root, { recursive: true })
      },
      catch: () => new Research.Error({ code: "publication_uncertain", message: "Research artifact removal is uncertain" }),
    })
  })
  const prepare = Effect.fn("ResearchArtifacts.prepare")(function* (binding: Research.Binding, raw: ResearchLedger.Entry) {
    yield* ResearchLedger.bounded(raw)
    const entry = yield* Schema.decodeUnknownEffect(ResearchLedger.Entry)(raw).pipe(
      Effect.mapError(() => new Research.Error({ code: "reference_invalid", message: "Invalid research publication intent" })),
    )
    if (ResearchLedger.canonical(entry.data.binding) !== ResearchLedger.canonical(binding) || entry.data.sessionID !== binding.executionSessionID)
      return yield* new Research.Error({ code: "binding_mismatch", message: "Research intent scope does not match" })
    yield* retained(binding)
    return yield* Effect.tryPromise({
      try: async () => {
        const root = await directory(global.data, binding, true)
        const filename = path.join(root, `intent-${ResearchLedger.digest(entry.data.operation)}.json`)
        const reconcile = async () => {
          const saved = Schema.decodeUnknownSync(Schema.fromJsonString(ResearchLedger.Entry))((await bytes(filename, Research.Limits.eventBytes)).toString("utf8"))
          if (saved.type !== entry.type || saved.id !== entry.id || saved.data.operation !== entry.data.operation ||
            saved.data.inputHash !== entry.data.inputHash || ResearchLedger.canonical(saved.data.binding) !== ResearchLedger.canonical(binding))
            throw new Research.Error({ code: "conflict", message: "Research intent was reused with different input" })
          return saved
        }
        const existing = await reconcile().catch((error: unknown) => {
          if (missing(error)) return undefined
          throw error
        })
        if (existing) return existing
        await publish(filename, Buffer.from(ResearchLedger.canonical(entry))).catch((error: unknown) => {
          // Concurrent identical intent may differ only in its host capture/publication timestamp.
          if (!(error instanceof Research.Error && error.code === "conflict")) throw error
        })
        return reconcile()
      },
      catch: (error) => error instanceof Research.Error ? error : new Research.Error({ code: "publication_uncertain", message: "Research publication intent is uncertain" }),
    })
  })
  return Service.of({ put, read, verifySource, remove, prepare })
}))

export const node = makeGlobalNode({ service: Service, layer, deps: [Global.node, Database.node] })

async function directory(data: string, binding: Research.Binding, create: boolean) {
  const base = await fs.realpath(data)
  const components = ["research", ResearchLedger.digest(binding.projectID), ResearchLedger.digest(binding.taskId)]
  const root = path.join(base, ...components)
  await components.reduce(async (previous, component) => {
    const parent = await previous
    const next = path.join(parent, component)
    if (create) await fs.mkdir(next, { mode: 0o700 }).catch((error: unknown) => {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error
    })
    const stat = await fs.lstat(next)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Unsafe research artifact directory")
    return next
  }, Promise.resolve(base))
  return root
}

async function bytes(filename: string, cap: number) {
  const metadata = await fs.lstat(filename)
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > cap) throw new Error("Invalid artifact file")
  const file = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size > cap) throw new Error("Invalid artifact file")
    const buffer = Buffer.alloc(stat.size + 1)
    const fill = async (offset: number): Promise<number> => {
      if (offset === buffer.byteLength) return offset
      const read = await file.read(buffer, offset, buffer.byteLength - offset, offset)
      return read.bytesRead === 0 ? offset : fill(offset + read.bytesRead)
    }
    if (await fill(0) !== stat.size) throw new Error("Artifact changed while reading")
    return buffer.subarray(0, stat.size)
  } finally {
    await file.close()
  }
}

async function publish(filename: string, content: Buffer) {
  const staging = `${filename}.${randomUUID()}.staging`
  const file = await fs.open(staging, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try {
    try {
      await file.writeFile(content)
      await file.sync()
    } finally {
      await file.close()
    }
    await fs.link(staging, filename).catch(async (error: unknown) => {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error
      if (!(await bytes(filename, content.byteLength)).equals(content))
        throw new Research.Error({ code: "conflict", message: "Immutable research artifact already has different bytes" })
    })
  } finally {
    await fs.unlink(staging)
  }
}

function missing(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}
