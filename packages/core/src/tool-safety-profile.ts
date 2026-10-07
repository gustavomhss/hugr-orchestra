export * as ToolSafetyProfile from "./tool-safety-profile"

import path from "path"
import { createHash } from "crypto"
import { Effect, Option, Schema } from "effect"
import { RelayHook } from "@opencode-ai/schema/relay-hook"
import { RelayJson } from "@opencode-ai/relay/json"
import { FSUtil } from "./fs-util"
import { ToolSafety } from "./tool-safety"

// D's onboard/profile.ts contract. This decoder grants no permissions or sandbox/network exceptions.
export const Preferences = Schema.Struct({
  scrutiny: Schema.Literals(["strict", "balanced", "vibe"]),
  askBefore: Schema.Array(Schema.NonEmptyString.check(Schema.isMaxLength(4096))).check(Schema.isMaxLength(512)),
  neverTouch: Schema.Array(Schema.NonEmptyString.check(Schema.isMaxLength(4096))).check(Schema.isMaxLength(512)),
  riskTolerance: Schema.Literals(["low", "medium", "high"]),
  waiverAuthority: Schema.Literal("human-only"),
})
const Bytes = 512 * 1024

/** A project's profile directory under a host state directory: `preferences.json` and Relay's `hooks.json`. */
export const profileDirectory = (stateDirectory: string, projectID: string) =>
  path.join(stateDirectory, projectID, "profile")

/** One project-bound helper/cache; the caller owns its Location/Instance lifetime. No new service or state writes. */
export function makeLoader(fs: FSUtil.Interface, binding: {
  readonly directory: string
  readonly stateDirectory: string
  readonly projectID: string
}, host?: ToolSafety.Profile) {
  const cache: { version?: string; preferences?: typeof Preferences.Type } = {}
  const hooks: HookCache = {}
  return Effect.fn("ToolSafetyProfile.load")(function* () {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(binding.projectID))
      return yield* new ToolSafety.Denied({ reason: "profile-project-invalid" })
    const root = yield* fs.realPath(binding.stateDirectory).pipe(
      Effect.mapError(() => new ToolSafety.Denied({ reason: "profile-state-root-acquisition" })),
    )
    const directory = yield* fs.realPath(binding.directory).pipe(
      Effect.mapError(() => new ToolSafety.Denied({ reason: "profile-project-root-acquisition" })),
    )
    if (FSUtil.contains(directory, root)) return yield* new ToolSafety.Denied({ reason: "profile-state-inside-project" })
    const file = path.join(profileDirectory(root, binding.projectID), "preferences.json")
    const info = yield* fs.stat(file).pipe(
      Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(undefined)),
      Effect.mapError(() => new ToolSafety.Denied({ reason: "profile-stat-acquisition" })),
    )
    const installs = () => loadHooks(fs, path.join(profileDirectory(root, binding.projectID), "hooks.json"), hooks)
    if (!info) { cache.version = undefined; cache.preferences = undefined; return ToolSafety.withHooks(host, yield* installs()) }
    if (info.type !== "File" || info.size > Bytes)
      return yield* new ToolSafety.Denied({ reason: "profile-not-file-or-overflow" })
    if ((yield* fs.realPath(file).pipe(Effect.mapError(() => new ToolSafety.Denied({ reason: "profile-path-acquisition" })))) !== file)
      return yield* new ToolSafety.Denied({ reason: "profile-symlink-denied" })
    const version = JSON.stringify([info.dev, Option.getOrUndefined(info.ino), String(info.size), Option.getOrUndefined(info.mtime)?.getTime()])
    const preferences = cache.version === version && cache.preferences
      ? cache.preferences
      : yield* Effect.scoped(Effect.gen(function* () {
          const handle = yield* fs.open(file, { flag: "r" })
          const bytes = Option.getOrUndefined(yield* handle.readAlloc(Bytes + 1)) ?? new Uint8Array()
          const after = yield* handle.stat
          if (bytes.length !== Number(info.size) || after.size !== info.size ||
            Option.getOrUndefined(after.ino) !== Option.getOrUndefined(info.ino) ||
            Option.getOrUndefined(after.mtime)?.getTime() !== Option.getOrUndefined(info.mtime)?.getTime())
            return yield* new ToolSafety.Denied({ reason: "profile-changed-during-read" })
          return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Preferences))(
            new TextDecoder().decode(bytes), { onExcessProperty: "error" },
          ).pipe(Effect.mapError(() => new ToolSafety.Denied({ reason: "profile-invalid" })))
        })).pipe(Effect.mapError((error) => error instanceof ToolSafety.Denied ? error : new ToolSafety.Denied({ reason: "profile-read-acquisition" })))
    cache.version = version
    cache.preferences = preferences
    return ToolSafety.withHooks({
      ...host,
      neverTouch: [...new Set([...(host?.neverTouch ?? []), ...preferences.neverTouch])],
      askBefore: [...new Set([...(host?.askBefore ?? []), ...preferences.askBefore])],
      requireSandbox: host?.requireSandbox === true || preferences.neverTouch.length > 0,
    } satisfies ToolSafety.Profile, yield* installs())
  })
}

type HookCache = { version?: string; installs?: ReadonlyArray<RelayHook.Install> }

/**
 * Relay's `hooks.json` beside `preferences.json`, under the same rules: a regular file within the cap, no symlink,
 * unchanged while read, strictly decoded. Each install must still match its sha256. An absent file is no hooks. The
 * graph rules are the install writer's, its only writer; enforcement stays closed on a graph they would refuse.
 */
const loadHooks = Effect.fnUntraced(function* (fs: FSUtil.Interface, file: string, cache: HookCache) {
  const info = yield* fs.stat(file).pipe(
    Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(undefined)),
    Effect.mapError(() => new ToolSafety.Denied({ reason: "profile-stat-acquisition" })),
  )
  if (!info) {
    cache.version = undefined
    cache.installs = undefined
    return []
  }
  if (info.type !== "File" || info.size > Bytes) return yield* new ToolSafety.Denied({ reason: "profile-not-file-or-overflow" })
  const real = yield* fs.realPath(file).pipe(Effect.mapError(() => new ToolSafety.Denied({ reason: "profile-path-acquisition" })))
  if (real !== file) return yield* new ToolSafety.Denied({ reason: "profile-symlink-denied" })
  const version = JSON.stringify([info.dev, Option.getOrUndefined(info.ino), String(info.size), Option.getOrUndefined(info.mtime)?.getTime()])
  if (cache.version === version && cache.installs) return cache.installs
  const installs = yield* Effect.scoped(Effect.gen(function* () {
    const handle = yield* fs.open(file, { flag: "r" })
    const bytes = Option.getOrUndefined(yield* handle.readAlloc(Bytes + 1)) ?? new Uint8Array()
    const after = yield* handle.stat
    if (bytes.length !== Number(info.size) || after.size !== info.size ||
      Option.getOrUndefined(after.ino) !== Option.getOrUndefined(info.ino) ||
      Option.getOrUndefined(after.mtime)?.getTime() !== Option.getOrUndefined(info.mtime)?.getTime())
      return yield* new ToolSafety.Denied({ reason: "profile-changed-during-read" })
    return yield* decodeHooks(bytes)
  })).pipe(Effect.mapError((error) => error instanceof ToolSafety.Denied ? error : new ToolSafety.Denied({ reason: "profile-read-acquisition" })))
  cache.version = version
  cache.installs = installs
  return installs
})

const decodeHooks = Effect.fnUntraced(function* (bytes: Uint8Array) {
  const invalid = () => new ToolSafety.Denied({ reason: "profile-invalid" })
  // Fatal: a replacement character would change what the writer pinned.
  const text = yield* Effect.try({ try: () => new TextDecoder("utf-8", { fatal: true }).decode(bytes), catch: invalid })
  const parsed = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(text).pipe(Effect.mapError(invalid))
  const decoded = yield* Schema.decodeUnknownEffect(RelayHook.Installs)(parsed, { onExcessProperty: "error" }).pipe(
    Effect.mapError(invalid),
  )
  if (new Set(decoded.installs.map((item) => item.installID)).size !== decoded.installs.length) return yield* invalid()
  if (decoded.installs.some((item) => !/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(item.installID))) return yield* invalid()
  // Over each snapshot as read: decoding rebuilds objects in schema key order, and the sha256 covers the export's own.
  const pinned = yield* Effect.forEach((parsed as RelayHook.Installs).installs, (item) =>
    RelayJson.compact(item.snapshot).pipe(
      Effect.map((compact) => createHash("sha256").update(compact).digest("hex") === item.sha256),
      Effect.orElseSucceed(() => false),
    ),
  )
  if (pinned.includes(false)) return yield* invalid()
  return decoded.installs
})
