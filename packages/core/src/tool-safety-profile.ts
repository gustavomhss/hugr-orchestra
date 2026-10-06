export * as ToolSafetyProfile from "./tool-safety-profile"

import path from "path"
import { Effect, Option, Schema } from "effect"
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
    if (!info) { cache.version = undefined; cache.preferences = undefined; return host }
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
    return {
      ...host,
      neverTouch: [...new Set([...(host?.neverTouch ?? []), ...preferences.neverTouch])],
      askBefore: [...new Set([...(host?.askBefore ?? []), ...preferences.askBefore])],
      requireSandbox: host?.requireSandbox === true || preferences.neverTouch.length > 0,
    } satisfies ToolSafety.Profile
  })
}
