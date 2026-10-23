export * as SkillSources from "./skill-sources"
export * as MaestroSkillSources from "./skill-sources"
export * as MaestroPlaybooks from "./skill-sources"
export * as Playbooks from "./skill-sources"

import path from "path"
import { Effect, Layer } from "effect"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { AgentV2 } from "@orchestra/core/agent"
import { PluginV2 } from "@orchestra/core/plugin"
import { SkillV2 } from "@orchestra/core/skill"
import { AbsolutePath } from "@orchestra/core/schema"
import { SeatSkillRoot } from "../seat-skill-root"
import { PlaybookContent } from "../playbook-content"

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const plugins = yield* PluginV2.Service
    const agents = yield* AgentV2.Service
    const skills = yield* SkillV2.Service
    yield* plugins.wait(PluginV2.ID.make("config-agent"))
    yield* plugins.ensure(PluginV2.ID.make("maestro/skill-sources"), () =>
      Effect.gen(function* () {
        yield* skills.transform((draft) => {
          draft.source(SkillV2.DirectorySource.make({ type: "directory", path: AbsolutePath.make(SeatSkillRoot.playbooks) }))
        })
        yield* agents.transform((draft) => {
          const playbooksRoot = SeatSkillRoot.playbooks
          for (const agent of draft.list()) {
            if (agent.id === AgentV2.defaultID) continue
            draft.update(agent.id, (current) => {
              current.permissions.push(
                { action: "skill", resource: path.join(playbooksRoot, "*"), effect: "deny" },
                ...PlaybookContent.names.map((name) => ({ action: "skill", resource: name, effect: "deny" as const })),
              )
            })
          }
        })
      }).pipe(Effect.asVoid),
    )
  }),
)

export const node = makeLocationNode({ name: "maestro/skill-sources", layer, deps: [PluginV2.node, AgentV2.node, SkillV2.node] })
