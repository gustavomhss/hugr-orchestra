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

const contribution = MaestroSeatsV2.contribution
const merged = Host.merge([contribution])
const layer = AppNodeBuilder.build(
  LayerNode.group([LocationServiceMap.node, SessionV2.node, SessionExecution.node, AgentV2.node, SkillV2.node]),
  [...merged.replacements, [SessionExecution.node, SessionExecutionLocal.node]],
  merged.locationNodes,
)

test("playbooks are visible to maestro but not general", async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const locations = yield* LocationServiceMap.Service
      const locationLayer = locations.get(Location.Ref.make({ directory: AbsolutePath.make("/tmp") }))
      return yield* Effect.gen(function* () {
        const skills = yield* SkillV2.Service
        const agents = yield* AgentV2.Service
        const list = yield* skills.list()
        const maestro = yield* agents.get(AgentV2.ID.make("maestro"))
        const general = yield* agents.get(AgentV2.ID.make("general"))
        return {
          maestro: SkillV2.available(list, maestro!).map((skill) => skill.name),
          general: SkillV2.available(list, general!).map((skill) => skill.name),
        }
      }).pipe(Effect.provide(locationLayer))
    }).pipe(Effect.provide(layer)) as Effect.Effect<{ maestro: string[]; general: string[] }>,
  )
  expect(result.maestro).toContain("maestro-governed")
  expect(result.maestro).toContain("frame-request")
  expect(result.general).not.toContain("maestro-governed")
  expect(result.general).not.toContain("frame-request")
})
