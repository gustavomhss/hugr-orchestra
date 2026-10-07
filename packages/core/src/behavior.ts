export * as BehaviorV2 from "./behavior"

import { randomUUID } from "crypto"
import path from "path"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { Behavior } from "@opencode-ai/schema/behavior"
import { makeLocationNode } from "./effect/app-node"
import { FSUtil } from "./fs-util"
import { Global } from "./global"
import { Location } from "./location"
import { Project } from "./project"
import { SystemContext } from "./system-context/index"
import { SystemContextRegistry } from "./system-context/registry"
import { Hash } from "./util/hash"

export const Info = Behavior.Info
export type Info = Behavior.Info

export class DuplicateError extends Schema.TaggedErrorClass<DuplicateError>()("BehaviorV2.DuplicateError", {
  id: Schema.String,
}) {
  override get message() {
    return `Duplicate behavior id: ${this.id}`
  }
}

/**
 * Model instructions a client keeps for one project. Every Session of the project receives them through its System
 * Context, so they reach each provider turn without being resent with a prompt and never enter the user's message.
 */
export interface Interface {
  /** The behaviors this Location's project applies, in order. */
  readonly list: () => Effect.Effect<ReadonlyArray<Info>>
  /** Replaces the project's behaviors. Sessions pick the change up at their next provider turn. */
  readonly set: (behaviors: ReadonlyArray<Info>) => Effect.Effect<ReadonlyArray<Info>, DuplicateError>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/Behavior") {}

const Stored = Schema.fromJsonString(Schema.Struct({ behaviors: Schema.Array(Info) }))
const decodeStored = Schema.decodeUnknownOption(Stored)
const encodeStored = Schema.encodeSync(Stored)
const Content = Schema.Struct({ name: Schema.String, instructions: Schema.String })

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const global = yield* Global.Service
    const location = yield* Location.Service
    const registry = yield* SystemContextRegistry.Service
    // A project is the profile: its worktrees and sandboxes share one set. Directories outside a repository all
    // resolve to the global project, so each of those keeps its own set.
    const owner =
      location.project.id === Project.ID.global ? `directory:${location.directory}` : `project:${location.project.id}`
    const file = path.join(global.data, "behavior", `${Hash.fast(owner)}.json`)

    // An unreadable or malformed file applies no behaviors rather than blocking every Session of the project.
    const list = Effect.fn("BehaviorV2.list")(function* () {
      const text = yield* fs
        .readFileStringSafe(file)
        .pipe(
          Effect.catch((error) =>
            Effect.logWarning("behavior file unreadable", { file, error }).pipe(Effect.as(undefined)),
          ),
        )
      if (text === undefined) return []
      const stored = decodeStored(text)
      if (Option.isSome(stored)) return stored.value.behaviors
      yield* Effect.logWarning("behavior file malformed", { file })
      return []
    })

    const set = Effect.fn("BehaviorV2.set")(function* (behaviors: ReadonlyArray<Info>) {
      const duplicate = behaviors.find(
        (behavior, index) => behaviors.findIndex((item) => item.id === behavior.id) < index,
      )
      if (duplicate) return yield* new DuplicateError({ id: duplicate.id })
      // Rename into place so a turn reading concurrently sees the old set or the new one, never a partial file.
      const temporary = `${file}.${randomUUID()}.tmp`
      yield* fs
        .writeWithDirs(temporary, encodeStored({ behaviors }))
        .pipe(Effect.andThen(fs.rename(temporary, file)), Effect.orDie)
      return behaviors
    })

    yield* registry.register({
      key: SystemContext.Key.make("core/behaviors"),
      load: list().pipe(Effect.map((behaviors) => SystemContext.combine(behaviors.map(source)))),
    })

    return Service.of({ list, set })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [FSUtil.node, Global.node, Location.node, SystemContextRegistry.node],
})

// Each behavior is its own source with no removal text. Switching one off therefore replaces the context generation,
// so its instructions leave the next provider request instead of lingering behind a "no longer applies" notice.
function source(behavior: Info) {
  return SystemContext.make({
    key: SystemContext.Key.make(`core/behavior/${behavior.id}`),
    codec: Schema.toCodecJson(Content),
    load: Effect.succeed({ name: behavior.name, instructions: behavior.instructions }),
    baseline: (current) => `Active behavior: ${current.name}. Apply it to every answer.\n${current.instructions}`,
    update: (_previous, current) =>
      `Behavior ${current.name} changed. Apply this version instead of the earlier one.\n${current.instructions}`,
  })
}
