import { expect, test } from "bun:test"
import { Effect } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { AbsolutePath } from "@orchestra/core/schema"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { Host } from "@orchestra/core/host"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { SkillV2 } from "@orchestra/core/skill"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionExecutionLocal } from "@orchestra/core/session/execution/local"
import { SessionV2 } from "@orchestra/core/session"
import { MaestroSeatsV2 } from "../src/v2/seats"
import { MaestroSeats } from "../src/v2/seats-service"

const contribution = MaestroSeatsV2.contribution
const merged = Host.merge([contribution])
const layer = AppNodeBuilder.build(
  LayerNode.group([LocationServiceMap.node, SessionV2.node, SessionExecution.node, AgentV2.node, SkillV2.node]),
  [...merged.replacements, [SessionExecution.node, SessionExecutionLocal.node]],
  merged.locationNodes,
)

test("projected seat ids contain jimmy, archie and backend", async () => {
  const ids = await Effect.runPromise(
    Effect.gen(function* () {
      const locations = yield* LocationServiceMap.Service
      const locationLayer = locations.get(Location.Ref.make({ directory: AbsolutePath.make("/tmp") }))
      return yield* Effect.gen(function* () {
        const service = yield* MaestroSeats.Service
        return yield* service.ids()
      }).pipe(Effect.provide(locationLayer))
    }).pipe(Effect.provide(layer)) as Effect.Effect<ReadonlySet<string>>,
  )
  expect(ids.has("jimmy")).toBe(true)
  expect(ids.has("archie")).toBe(true)
  expect(ids.has("backend")).toBe(true)
  expect(ids.has("maestro")).toBe(false)
})
