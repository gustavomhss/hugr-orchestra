export * as LeanProfilePreferences from "./lean-profile-preferences"

import { createHash, randomUUID } from "node:crypto"
import path from "node:path"
import { Effect, Option, Schema } from "effect"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { Flock } from "@orchestra/core/util/flock"
import { LeanCoverage } from "@orchestra/schema/lean-coverage"
import type { LeanDashboard } from "@orchestra/schema/lean-dashboard"

export interface Owner { readonly projectID: string; readonly directory: string }
export interface State {
  readonly scope: LeanDashboard.Scope
  readonly enabled?: boolean
  readonly items: LeanCoverage.Settings
}
export class Unavailable extends Schema.TaggedErrorClass<Unavailable>()("LeanPreferences.Unavailable", {
  message: Schema.String,
}) {}

const MAX_BYTES = 4096
const Stored = Schema.fromJsonString(Schema.Struct({
  version: Schema.Literal(1),
  enabled: Schema.optional(Schema.Boolean),
  items: Schema.Record(Schema.String, Schema.Boolean),
}))
const decode = Schema.decodeUnknownSync(Stored, { onExcessProperty: "error" })
const unavailable = (cause: unknown) => new Unavailable({ message: `Lean profile preferences unavailable: ${String(cause)}` })

const locate = Effect.fnUntraced(function* (owner: Owner, fs: FSUtil.Interface, global: Global.Interface) {
  // Native callers already use canonical InstanceRef directories. Resolve aliases defensively.
  const directory = yield* fs.realPath(owner.directory)
  const profileID = createHash("sha256").update(JSON.stringify([owner.projectID, directory])).digest("hex")
  return {
    fs,
    scope: { profileID, projectID: owner.projectID, directory },
    root: path.join(global.data, "lean", "profiles"),
    locks: path.join(global.state, "locks"),
  }
})

const load = Effect.fnUntraced(function* (location: Effect.Success<ReturnType<typeof locate>>) {
  const stored = yield* Effect.scoped(Effect.gen(function* () {
    const file = yield* location.fs.open(path.join(location.root, `${location.scope.profileID}.json`), { flag: "r" })
    const chunks: Uint8Array[] = []
    let size = 0
    while (size <= MAX_BYTES) {
      const chunk = yield* file.readAlloc(MAX_BYTES + 1 - size)
      if (Option.isNone(chunk)) break
      size += chunk.value.length
      chunks.push(chunk.value)
    }
    if (size > MAX_BYTES) return yield* new Unavailable({ message: "Lean preferences exceed byte limit" })
    return yield* Effect.try({
      try: () => {
        const value = decode(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)))
        if (Object.keys(value.items).some((id) => !LeanCoverage.ids.includes(id as LeanCoverage.ItemID)))
          throw new Error("Unknown Lean preference item")
        return value
      },
      catch: unavailable,
    })
  })).pipe(Effect.catchIf(
    (error) => "reason" in error && error.reason._tag === "NotFound",
    () => Effect.succeed({ version: 1 as const, enabled: undefined, items: {} }),
  ))
  return { scope: location.scope, enabled: stored.enabled, items: stored.items } satisfies State
})

const readWith = Effect.fn("LeanPreferences.read")(
  function* (owner: Owner, fs: FSUtil.Interface, global: Global.Interface) {
    return yield* load(yield* locate(owner, fs, global))
  },
  Effect.mapError(unavailable),
)

const updateWith = Effect.fn("LeanPreferences.update")(
  function* (owner: Owner, value: LeanDashboard.Update, fs: FSUtil.Interface, global: Global.Interface) {
    const location = yield* locate(owner, fs, global)
    yield* Effect.try({ try: () => Schema.decodeUnknownSync(Schema.Struct({
      itemID: Schema.optional(LeanCoverage.ItemID), enabled: Schema.Boolean,
    }), { onExcessProperty: "error" })(value), catch: unavailable })
    return yield* Effect.scoped(Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.tryPromise(() => Flock.acquire(`lean-profile:${location.scope.profileID}`, { dir: location.locks })),
        (lock) => Effect.promise(() => lock.release()),
      )
      const previous = yield* load(location)
      const next: State = value.itemID === undefined
        ? { ...previous, enabled: value.enabled }
        : { ...previous, items: { ...previous.items, [value.itemID]: value.enabled } }
      yield* location.fs.makeDirectory(location.root, { recursive: true, mode: 0o700 })
      const temp = path.join(location.root, `${location.scope.profileID}.${randomUUID()}.tmp`)
      yield* Effect.acquireUseRelease(
        location.fs.writeFileString(temp, JSON.stringify({ version: 1, enabled: next.enabled, items: next.items }), { flag: "wx", mode: 0o600 }),
        () => location.fs.rename(temp, path.join(location.root, `${location.scope.profileID}.json`)),
        () => location.fs.remove(temp).pipe(Effect.catchReason("PlatformError", "NotFound", () => Effect.void), Effect.orDie),
      )
      return next
    }))
  },
  Effect.catchCause((cause) => Effect.fail(unavailable(cause))),
)
export function make(fs: FSUtil.Interface, global: Global.Interface) {
  return {
    read: (owner: Owner) => readWith(owner, fs, global),
    update: (owner: Owner, value: LeanDashboard.Update) => updateWith(owner, value, fs, global),
  }
}

export const read: (owner: Owner) => Effect.Effect<State, Unavailable, FSUtil.Service | Global.Service> = Effect.fn("LeanPreferences.readService")(function* (owner: Owner) {
  const fs = yield* FSUtil.Service
  const global = yield* Global.Service
  return yield* readWith(owner, fs, global)
})
export const update: (owner: Owner, value: LeanDashboard.Update) => Effect.Effect<State, Unavailable, FSUtil.Service | Global.Service> = Effect.fn("LeanPreferences.updateService")(function* (owner: Owner, value: LeanDashboard.Update) {
  const fs = yield* FSUtil.Service
  const global = yield* Global.Service
  return yield* updateWith(owner, value, fs, global)
})
