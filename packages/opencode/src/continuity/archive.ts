export * as Archive from "./archive"

import { randomUUID } from "node:crypto"
import path from "node:path"
import { Context, Effect, Layer, Schema, Semaphore } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Global } from "@opencode-ai/core/global"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import type { SessionID } from "@/session/schema"
import type { ArchiveChunk, ArchiveReference } from "./memory-types"
import { hash, hashPattern, identity, readManifest, readStored, verify, writeStored, type StoredMemory } from "./archive-format"
import { chunks } from "./transcript"

export class ArchiveError extends Schema.TaggedErrorClass<ArchiveError>()("ContinuityArchiveError", {
  reason: Schema.String,
}) {}

export interface Interface {
  /** Publishes input chunks, verifying existing input IDs without reading unrelated retained fragments. */
  readonly publish: (input: { sessionID: SessionID; messages: SessionV1.WithParts[] }) => Effect.Effect<ArchiveChunk[], ArchiveError>
  /** Returns own-session index descriptors after schema/membership validation, without checking fragment
   * availability, hashes, or descriptor agreement with stored content. */
  readonly list: (sessionID: SessionID) => Effect.Effect<ArchiveReference[], ArchiveError>
  /** Verifies the requested fragment's hash, ownership and descriptors; callers must read active refs before pruning. */
  readonly read: (input: { sessionID: SessionID; id: string }) => Effect.Effect<ArchiveChunk | undefined, ArchiveError>
  /** The session's persisted memory; a corrupt or foreign file fails with archive-corrupt-memory. */
  readonly readMemory: (sessionID: SessionID) => Effect.Effect<StoredMemory | undefined, ArchiveError>
  /** Atomically replaces the file with the value taken under the session's memory lock; nothing stored deletes it. */
  readonly writeMemory: (sessionID: SessionID, value: () => StoredMemory | undefined) => Effect.Effect<void, ArchiveError>
  readonly removeMemory: (sessionID: SessionID) => Effect.Effect<void, ArchiveError>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ContinuityArchive") {}

// Shared across fresh service instances; entries live only while callers hold/wait for them.
const locks = new Map<string, { semaphore: Semaphore.Semaphore; users: number }>()
type Inventory = { dir: string; entries: Map<string, FSUtil.DirEntry["type"]> }

export const layer = Layer.effect(Service, Effect.gen(function* () {
  const fs = yield* FSUtil.Service

  const directory = Effect.fnUntraced(function* (sessionID: SessionID, create: boolean) {
    yield* checked(() => identity(sessionID, "ses"))
    const base = yield* fs.realPath(Global.Path.data)
    const root = yield* childDirectory(base, "continuity", create)
    return root === undefined ? undefined : yield* childDirectory(root, hash(sessionID), create)
  })

  const childDirectory = Effect.fnUntraced(function* (parent: string, name: string, create: boolean) {
    const target = path.join(parent, name)
    const entry = (yield* fs.readDirectoryEntries(parent)).find((entry) => entry.name === name)
    if (!entry && !create) return undefined
    if (!entry) yield* fs.makeDirectory(target, { mode: 0o700 }).pipe(
      Effect.catchReason("PlatformError", "AlreadyExists", () => Effect.void),
    )
    const current = (yield* fs.readDirectoryEntries(parent)).find((entry) => entry.name === name)
    if (current?.type !== "directory" || (yield* fs.realPath(target)) !== target)
      return yield* new ArchiveError({ reason: "archive-unsafe-path" })
    return target
  })

  const inventory = Effect.fnUntraced(function* (dir: string) {
    if ((yield* fs.realPath(dir)) !== dir) return yield* new ArchiveError({ reason: "archive-unsafe-path" })
    // One scan per operation; never share a stale inventory across calls or service instances.
    return { dir, entries: new Map((yield* fs.readDirectoryEntries(dir)).map((entry) => [entry.name, entry.type])) }
  })

  const file = Effect.fnUntraced(function* (files: Inventory, name: string) {
    if ((yield* fs.realPath(files.dir)) !== files.dir) return yield* new ArchiveError({ reason: "archive-unsafe-path" })
    const type = files.entries.get(name)
    if (type !== undefined && type !== "file") return yield* new ArchiveError({ reason: "archive-unsafe-path" })
    const target = path.join(files.dir, name)
    const resolved = yield* fs.realPath(target).pipe(Effect.catchReason("PlatformError", "NotFound", (_reason, error) =>
      type === undefined ? Effect.succeed(undefined) : Effect.fail(error)))
    if (resolved === undefined) return undefined
    if (resolved !== target) return yield* new ArchiveError({ reason: "archive-unsafe-path" })
    // An entry created after the scan is inspected individually, not with another directory scan.
    if (type === undefined && (yield* fs.stat(target)).type !== "File")
      return yield* new ArchiveError({ reason: "archive-unsafe-path" })
    files.entries.set(name, "file")
    return target
  })

  const index = Effect.fnUntraced(function* (files: Inventory, sessionID: SessionID) {
    const target = yield* file(files, "index.json")
    if (!target) return [] as ArchiveReference[]
    const text = yield* fs.readFileString(target)
    return yield* checked(() => readManifest(text, sessionID), "archive-corrupt-index")
  })

  const readChunk = Effect.fnUntraced(function* (files: Inventory, sessionID: SessionID, ref: ArchiveReference) {
    const target = yield* file(files, `${ref.id}.md`)
    if (!target) return yield* new ArchiveError({ reason: "archive-unavailable" })
    const bytes = yield* fs.readFile(target)
    const text = yield* checked(() => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes), "archive-corrupt-content")
    return yield* checked(() => verify(text, sessionID, ref))
  })

  const temporary = Effect.fnUntraced(function* (dir: string, content: string, publish: (temp: string) => Effect.Effect<void, FSUtil.Error | ArchiveError>) {
    const temp = path.join(dir, `.archive-${randomUUID()}.tmp`)
    return yield* Effect.gen(function* () {
      if ((yield* fs.realPath(dir)) !== dir) return yield* new ArchiveError({ reason: "archive-unsafe-path" })
      yield* Effect.scoped(Effect.gen(function* () {
        const handle = yield* fs.open(temp, { flag: "wx", mode: 0o600 })
        yield* handle.writeAll(Buffer.from(content, "utf8"))
        yield* handle.sync
      }))
      yield* publish(temp)
    }).pipe(Effect.ensuring(fs.remove(temp, { force: true }).pipe(Effect.ignore)))
  })

  const immutable = Effect.fnUntraced(function* (files: Inventory, sessionID: SessionID, value: ArchiveChunk) {
    if (yield* file(files, `${value.id}.md`)) {
      yield* readChunk(files, sessionID, value)
      return
    }
    yield* temporary(files.dir, value.markdown, (temp) => Effect.gen(function* () {
      yield* file(files, `${value.id}.md`)
      // Hard-link publication is atomic and cannot overwrite an existing immutable ID.
      const linked = yield* fs.link(temp, path.join(files.dir, `${value.id}.md`)).pipe(
        Effect.as(true), Effect.catchReason("PlatformError", "AlreadyExists", () => Effect.succeed(false)),
      )
      // macOS may resolve an inode to its other hard-link name while the staging link is live.
      yield* fs.remove(temp)
      if (linked) files.entries.set(`${value.id}.md`, "file")
      yield* readChunk(files, sessionID, value)
    }))
  })

  const writeMemory = Effect.fn("ContinuityArchive.writeMemory")(function* (sessionID: SessionID, value: () => StoredMemory | undefined) {
    yield* checked(() => identity(sessionID, "ses"))
    // Read the value under the lock, so a write queued behind a delete cannot restore cleared memory.
    return yield* serialized(path.join(Global.Path.data, hash(sessionID), "memory.json"), Effect.gen(function* () {
      const stored = value()
      const empty = !stored?.context && !stored?.masks.length
      const dir = yield* directory(sessionID, !empty)
      if (!dir) return
      const files = yield* inventory(dir)
      if (!stored || empty) {
        const target = yield* file(files, "memory.json")
        if (target) yield* fs.remove(target, { force: true })
        return
      }
      yield* temporary(dir, writeStored(sessionID, stored), (temp) => Effect.gen(function* () {
        yield* file(files, "memory.json")
        yield* fs.rename(temp, path.join(dir, "memory.json"))
      }))
    }))
  }, Effect.mapError(unavailable))

  return Service.of({
    publish: Effect.fn("ContinuityArchive.publish")(function* (input: Parameters<Interface["publish"]>[0]) {
      // Validate/render the whole batch before creating directories or publishing any bytes.
      const values = yield* checked(() => chunks(input.sessionID, input.messages), "archive-invalid-input")
      return yield* serialized(path.join(Global.Path.data, hash(input.sessionID)), Effect.gen(function* () {
        const dir = yield* directory(input.sessionID, true)
        if (!dir) return yield* new ArchiveError({ reason: "archive-unavailable" })
        const files = yield* inventory(dir)
        const retained = yield* index(files, input.sessionID)
        const refs = new Map(retained.map((ref) => [ref.id, ref]))
        for (const value of values) {
          const existing = refs.get(value.id)
          // An indexed missing/corrupt input must fail rather than be silently reconstructed.
          if (existing) yield* readChunk(files, input.sessionID, existing)
          if (!existing) yield* immutable(files, input.sessionID, value)
          const { markdown, ...ref } = value
          refs.set(ref.id, ref)
        }
        if (refs.size !== retained.length) {
          const content = JSON.stringify({ version: 1, sessionID: input.sessionID, references: [...refs.values()] }, null, 2) + "\n"
          yield* temporary(dir, content, (temp) => Effect.gen(function* () {
            yield* file(files, "index.json")
            yield* fs.rename(temp, path.join(dir, "index.json"))
            files.entries.set("index.json", "file")
          }))
        }
        return values
      }))
    }, Effect.mapError(unavailable)),
    list: Effect.fn("ContinuityArchive.list")(function* (sessionID: SessionID) {
      const dir = yield* directory(sessionID, false)
      if (!dir) return []
      const files = yield* inventory(dir)
      return yield* index(files, sessionID)
    }, Effect.mapError(unavailable)),
    read: Effect.fn("ContinuityArchive.read")(function* (input: Parameters<Interface["read"]>[0]) {
      yield* checked(() => identity(input.sessionID, "ses"))
      if (!hashPattern.test(input.id)) return undefined
      const dir = yield* directory(input.sessionID, false)
      if (!dir) return undefined
      const files = yield* inventory(dir)
      const refs = yield* index(files, input.sessionID)
      const ref = refs.find((ref) => ref.id === input.id)
      return ref ? yield* readChunk(files, input.sessionID, ref) : undefined
    }, Effect.mapError(unavailable)),
    readMemory: Effect.fn("ContinuityArchive.readMemory")(function* (sessionID: SessionID) {
      const dir = yield* directory(sessionID, false)
      if (!dir) return undefined
      const target = yield* file(yield* inventory(dir), "memory.json")
      if (!target) return undefined
      const text = yield* fs.readFileString(target)
      return yield* checked(() => readStored(text, sessionID), "archive-corrupt-memory")
    }, Effect.mapError(unavailable)),
    writeMemory,
    removeMemory: (sessionID: SessionID) => writeMemory(sessionID, () => undefined),
  })
}))

function checked<A>(body: () => A, fallback = "archive-corrupt-content") {
  return Effect.try({ try: body, catch: (error) => new ArchiveError({
    reason: error instanceof Error && /^archive-[a-z-]+$/.test(error.message) ? error.message : fallback,
  }) })
}

function unavailable(error: FSUtil.Error | ArchiveError) {
  return error instanceof ArchiveError ? error : new ArchiveError({ reason: "archive-unavailable" })
}

function serialized<A, E, R>(key: string, effect: Effect.Effect<A, E, R>) {
  return Effect.suspend(() => {
    const lock = locks.get(key) ?? { semaphore: Semaphore.makeUnsafe(1), users: 0 }
    locks.set(key, lock)
    lock.users++
    return lock.semaphore.withPermit(effect).pipe(Effect.ensuring(Effect.sync(() => {
      if (--lock.users === 0) locks.delete(key)
    })))
  })
}

export const node = LayerNode.make({ service: Service, layer, deps: [FSUtil.node] })
