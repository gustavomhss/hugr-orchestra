export * as ActionsState from "./state"

import { Actions } from "@orchestra/schema/actions"
import { createHash, randomUUID } from "node:crypto"
import { rmSync } from "node:fs"
import path from "node:path"
import { Effect, Option, Schema } from "effect"
import { KeyedMutex } from "../effect/keyed-mutex"
import { FSUtil } from "../fs-util"
import { PhysicalPath } from "../util/physical-path"
import { ActionsError } from "./error"

const STRICT = { onExcessProperty: "error" } as const
const MAX_BYTES = 1024 * 1024
const locks = KeyedMutex.makeUnsafe<string>()
const Document = Schema.Struct({
  version: Schema.Literal(1),
  records: Schema.Array(Schema.Struct({ binding: Actions.Binding, policy: Actions.Policy })),
})
export type Document = typeof Document.Type
const url = Option.liftThrowable((text: string) => new URL(text))
const utf8 = Option.liftThrowable((bytes: Uint8Array) => new TextDecoder("utf-8", { fatal: true }).decode(bytes))

export const canonical = Effect.fn("ActionsState.canonical")(function* (directory: string) {
  if (!directory || directory.includes("\0"))
    return yield* new ActionsError({ kind: "invalid_input", message: "Invalid Actions directory." })
  return yield* Effect.tryPromise({
    try: () => PhysicalPath.physicalPath(path.resolve(FSUtil.windowsPath(directory))),
    catch: () => new ActionsError({ kind: "invalid_input", message: "Actions directory is unavailable." }),
  })
})

export function locationKey(directory: string, workspaceID?: string) {
  return createHash("sha256").update(JSON.stringify([directory, workspaceID ?? null])).digest("hex")
}

export const make = Effect.fn("ActionsState.make")(function* (input: {
  directory: string
  workspaceID?: string
  projectID: string
  stateDirectory: string
  repository: string
}) {
  const fs = yield* FSUtil.Service
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(input.projectID) ||
    /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(input.projectID) ||
    (input.workspaceID !== undefined && (!input.workspaceID || /[\x00-\x1f\x7f]/.test(input.workspaceID))))
    return yield* new ActionsError({ kind: "invalid_input", message: "Invalid Actions project or workspace identity." })
  const root = yield* canonical(input.stateDirectory)
  const repository = yield* canonical(input.repository)
  if (FSUtil.contains(repository, root))
    return yield* new ActionsError({ kind: "invalid_input", message: "Actions state must be outside the repository." })
  const target = path.join(root, "actions", input.projectID, locationKey(input.directory, input.workspaceID), "bindings.json")
  const failed = () => new ActionsError({ kind: "maintenance_required", message: "Actions binding state is unavailable or corrupt." })
  const physical = Effect.fnUntraced(function* () {
    if ((yield* canonical(target).pipe(Effect.mapError(failed))) !== target)
      return yield* failed()
  })
  function parents(directory: string): Effect.Effect<void, ActionsError> {
    return Effect.gen(function* () {
      const info = yield* fs.stat(directory).pipe(
        Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(undefined)), Effect.mapError(failed),
      )
      if (info) {
        if (info.type !== "Directory") return yield* failed()
        return
      }
      if (path.dirname(directory) === directory) return yield* failed()
      yield* parents(path.dirname(directory))
    })
  }
  const decode = Effect.fnUntraced(function* (text: string) {
    const document = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Document), STRICT)(text).pipe(Effect.mapError(failed))
    if (new Set(document.records.map((record) => record.binding.id)).size !== document.records.length ||
      new Set(document.records.map((record) => record.binding.remote)).size !== document.records.length ||
      new Set(document.records.map((record) => identityKey(record.binding))).size !== document.records.length)
      return yield* failed()
    yield* Effect.try({
      try: () => document.records.forEach((record) => {
        const binding = record.binding
        if (binding.directory !== input.directory || binding.workspaceID !== input.workspaceID ||
          !validRemote(binding.remote) || !binding.projectID.trim() || /[\x00-\x20\x7f]/.test(binding.projectID) ||
          !binding.account || /[\x00-\x20\x7f]/.test(binding.account) ||
          projectPath(binding.provider.kind, binding.projectPath) !== binding.projectPath ||
          JSON.stringify(provider(binding.provider)) !== JSON.stringify(binding.provider)) throw failed()
      }),
      catch: failed,
    })
    return document
  })
  const read = Effect.fnUntraced(function* () {
    yield* physical()
    // ENOTDIR can look like NotFound on a platform; a blocked parent is corruption, not an empty store.
    yield* parents(path.dirname(target))
    const info = yield* fs.stat(target).pipe(
      Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(undefined)),
      Effect.mapError(failed),
    )
    if (!info) return { version: 1, records: [] } satisfies Document
    if (info.type !== "File" || info.size > MAX_BYTES) return yield* failed()
    const bytes = yield* fs.readFile(target).pipe(Effect.mapError(failed))
    const text = utf8(bytes)
    if (bytes.length > MAX_BYTES || Option.isNone(text)) return yield* failed()
    return yield* decode(text.value)
  })
  const write = Effect.fnUntraced(function* (document: Document) {
    const text = JSON.stringify(document)
    if (Buffer.byteLength(text) > MAX_BYTES) return yield* failed()
    yield* decode(text)
    yield* physical()
    yield* fs.makeDirectory(path.dirname(target), { recursive: true, mode: 0o700 }).pipe(Effect.mapError(failed))
    yield* physical()
    const temp = path.join(path.dirname(target), `.bindings.${randomUUID()}.tmp`)
    yield* fs.writePhysical(temp, text, { exclusive: true }).pipe(
      Effect.andThen(fs.chmod(temp, 0o600)),
      Effect.andThen(physical()),
      Effect.andThen(fs.rename(temp, target)),
      Effect.mapError(failed),
      Effect.ensuring(Effect.try({ try: () => rmSync(temp, { force: true }), catch: failed }).pipe(Effect.ignore)),
      Effect.uninterruptible,
    )
  })
  return {
    read: () => locks.withLock(target)(read()),
    change: <A>(edit: (document: Document) => Effect.Effect<{ document: Document; value: A }, ActionsError>) =>
      locks.withLock(target)(Effect.gen(function* () {
        const next = yield* edit(yield* read())
        yield* write(next.document)
        return next.value
      })),
  }
})

export function validRemote(remote: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(remote) && remote.split("/").every((part) => part && part !== "." && part !== "..")
}

export function projectPath(kind: Actions.ProviderKind, text: string) {
  const parts = text.split("/")
  if ((kind === "github" ? parts.length !== 2 : parts.length < 2) ||
    parts.some((part) => !/^[A-Za-z0-9_.-]+$/.test(part) || part === "." || part === ".." || part.endsWith(".git")))
    throw new ActionsError({ kind: "invalid_input", message: "Invalid provider project path." })
  return text
}

export function provider(input: Actions.Provider): Actions.Provider {
  const host = Option.getOrUndefined(url(`https://${input.hostname}`))
  const api = Option.getOrUndefined(url(input.apiOrigin))
  if (!host || !api || !/^[A-Za-z0-9.-]+(?::[0-9]+)?$/.test(input.hostname) ||
    host.username || host.password || host.pathname !== "/" || host.search || host.hash ||
    host.hostname.endsWith(".") || host.hostname.split(".").some((part) => !part || part.startsWith("-") || part.endsWith("-")) ||
    api.protocol !== "https:" || api.username || api.password || api.pathname !== "/" || api.search || api.hash ||
    /[\x00-\x20\x7f]/.test(input.apiOrigin))
    throw new ActionsError({ kind: "invalid_input", message: "Invalid Actions provider host or API origin." })
  const hostname = host.host
  if (["ssh.github.com", "altssh.gitlab.com", "api.github.com"].includes(host.hostname) ||
    (host.hostname === "github.com" && (input.kind !== "github" || api.origin !== "https://api.github.com" || host.port)) ||
    (host.hostname === "gitlab.com" && (input.kind !== "gitlab" || api.origin !== "https://gitlab.com" || host.port)) ||
    (!["github.com", "gitlab.com"].includes(host.hostname) && api.host !== hostname))
    throw new ActionsError({ kind: "host_mismatch", message: "Actions provider host and API origin do not match." })
  return { kind: input.kind, hostname, apiOrigin: api.origin, ...(input.version === undefined ? {} : { version: input.version }) }
}

export function identityKey(binding: Pick<Actions.Binding, "provider" | "projectID">) {
  return JSON.stringify([binding.provider.kind, binding.provider.hostname, binding.provider.apiOrigin, binding.projectID])
}
