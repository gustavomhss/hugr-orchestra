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
import { hash, hashPattern, identity, readManifest, verify } from "./archive-format"
import { chunks } from "./transcript"

export class ArchiveError extends Schema.TaggedErrorClass<ArchiveError>()("ContinuityArchiveError", {
  reason: Schema.String,
}) {}

export interface Interface {
  readonly publish: (input: { sessionID: SessionID; messages: SessionV1.WithParts[] }) => Effect.Effect<ArchiveChunk[], ArchiveError>
  readonly list: (sessionID: SessionID) => Effect.Effect<ArchiveReference[], ArchiveError>
  readonly read: (input: { sessionID: SessionID; id: string }) => Effect.Effect<ArchiveChunk | undefined, ArchiveError>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ContinuityArchive") {}

// Shared across fresh service instances; entries live only while callers hold/wait for them.
const locks = new Map<string, { semaphore: Semaphore.Semaphore; users: number }>()

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

  const file = Effect.fnUntraced(function* (dir: string, name: string) {
    // Resolve before opening. Reject symlinks, including dangling links and directories.
    if ((yield* fs.realPath(dir)) !== dir) return yield* new ArchiveError({ reason: "archive-unsafe-path" })
    const entry = (yield* fs.readDirectoryEntries(dir)).find((entry) => entry.name === name)
    if (!entry) return undefined
    const target = path.join(dir, name)
    if (entry.type !== "file" || (yield* fs.realPath(target)) !== target)
      return yield* new ArchiveError({ reason: "archive-unsafe-path" })
    return target
  })

  const index = Effect.fnUntraced(function* (dir: string, sessionID: SessionID) {
    const target = yield* file(dir, "index.json")
    if (!target) return [] as ArchiveReference[]
    const text = yield* fs.readFileString(target)
    return yield* checked(() => readManifest(text, sessionID), "archive-corrupt-index")
  })

  const readChunk = Effect.fnUntraced(function* (dir: string, sessionID: SessionID, ref: ArchiveReference) {
    const target = yield* file(dir, `${ref.id}.md`)
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

  const immutable = Effect.fnUntraced(function* (dir: string, sessionID: SessionID, value: ArchiveChunk) {
    if (yield* file(dir, `${value.id}.md`)) {
      yield* readChunk(dir, sessionID, value)
      return
    }
    yield* temporary(dir, value.markdown, (temp) => Effect.gen(function* () {
      yield* file(dir, `${value.id}.md`)
      // Hard-link publication is atomic and cannot overwrite an existing immutable ID.
      yield* fs.link(temp, path.join(dir, `${value.id}.md`)).pipe(
        Effect.catchReason("PlatformError", "AlreadyExists", () => Effect.void),
      )
      yield* readChunk(dir, sessionID, value)
    }))
  })

  return Service.of({
    publish: Effect.fn("ContinuityArchive.publish")(function* (input: Parameters<Interface["publish"]>[0]) {
      // Validate/render the whole batch before creating directories or publishing any bytes.
      const values = yield* checked(() => chunks(input.sessionID, input.messages), "archive-invalid-input")
      return yield* serialized(path.join(Global.Path.data, hash(input.sessionID)), Effect.gen(function* () {
        const dir = yield* directory(input.sessionID, true)
        if (!dir) return yield* new ArchiveError({ reason: "archive-unavailable" })
        const retained = yield* index(dir, input.sessionID)
        for (const ref of retained) yield* readChunk(dir, input.sessionID, ref)
        const refs = new Map(retained.map((ref) => [ref.id, ref]))
        for (const value of values) {
          yield* immutable(dir, input.sessionID, value)
          const { markdown, ...ref } = value
          refs.set(ref.id, ref)
        }
        if (refs.size !== retained.length) {
          const content = JSON.stringify({ version: 1, sessionID: input.sessionID, references: [...refs.values()] }, null, 2) + "\n"
          yield* temporary(dir, content, (temp) => Effect.gen(function* () {
            yield* file(dir, "index.json")
            yield* fs.rename(temp, path.join(dir, "index.json"))
          }))
        }
        return values
      }))
    }, Effect.mapError(unavailable)),
    list: Effect.fn("ContinuityArchive.list")(function* (sessionID: SessionID) {
      const dir = yield* directory(sessionID, false)
      if (!dir) return []
      const refs = yield* index(dir, sessionID)
      for (const ref of refs) yield* readChunk(dir, sessionID, ref)
      return refs
    }, Effect.mapError(unavailable)),
    read: Effect.fn("ContinuityArchive.read")(function* (input: Parameters<Interface["read"]>[0]) {
      yield* checked(() => identity(input.sessionID, "ses"))
      if (!hashPattern.test(input.id)) return undefined
      const dir = yield* directory(input.sessionID, false)
      if (!dir) return undefined
      const refs = yield* index(dir, input.sessionID)
      const ref = refs.find((ref) => ref.id === input.id)
      return ref ? yield* readChunk(dir, input.sessionID, ref) : undefined
    }, Effect.mapError(unavailable)),
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
