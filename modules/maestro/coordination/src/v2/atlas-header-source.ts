export * as AtlasHeaderSource from "./atlas-header-source"

import { Effect, Layer, Option, Schema } from "effect"
import { SystemContextRegistry } from "@orchestra/core/system-context/registry"
import { SystemContext } from "@orchestra/core/system-context"
import { AgentV2 } from "@orchestra/core/agent"
import { SessionV2 } from "@orchestra/core/session"
import { SessionStore } from "@orchestra/core/session/store"
import { Config } from "@orchestra/core/config"
import { AppProcess } from "@orchestra/core/process"
import { FSUtil } from "@orchestra/core/fs-util"
import { SkillV2 } from "@orchestra/core/skill"
import { ConfigMarkdown } from "@orchestra/core/config/markdown"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { SessionSchema } from "@orchestra/core/session"
import { AtlasSource } from "@orchestra/maestro/v2/atlas-source"

const makeLayer = Effect.gen(function* () {
  const registry = yield* SystemContextRegistry.Service
  const agents = yield* AgentV2.Service
  const sessions = yield* SessionV2.Service
  const store = yield* SessionStore.Service
  const config = yield* Config.Service
  const appProcess = yield* AppProcess.Service
  const fsUtil = yield* FSUtil.Service
  const skills = yield* SkillV2.Service

  const loadAtlasHeader = Effect.fn("AtlasHeaderSource.load")(function* (input: { sessionID: string; agent: string }) {
    const agent = yield* agents.get(AgentV2.ID.make(input.agent))
    if (agent?.id !== "maestro") {
      return SystemContext.empty
    }
    const session = yield* sessions.get(SessionSchema.ID.make(input.sessionID)).pipe(Effect.orDie)
    const sessionInfo = yield* store.get(session.id)
    if (!sessionInfo) {
      return SystemContext.make({
        key: SystemContext.Key.make("maestro/atlas-header"),
        codec: Schema.toCodecJson(Schema.String),
        load: Effect.succeed("## Atlas Catalog\n\nSession not found."),
        baseline: (text) => text,
        update: (_prev, text) => text,
      })
    }

    const sessionData = {
      id: sessionInfo.id,
      projectID: sessionInfo.projectID,
      directory: sessionInfo.location.directory,
    }

    const source = yield* AtlasSource.readAtlasSource(sessionData, appProcess, fsUtil, config).pipe(
      Effect.catch(() => Effect.succeed(null)),
    )

    if (!source) {
      const text = "## Atlas Catalog\n\nAtlas not configured or unavailable for this project.\n\nUse `atlas_context` to browse catalog and unit content when available."
      return SystemContext.make({
        key: SystemContext.Key.make("maestro/atlas-header"),
        codec: Schema.toCodecJson(Schema.String),
        load: Effect.succeed(text),
        baseline: (text) => text,
        update: (_prev, text) => text,
      })
    }

    const territories = source.context.territories.map((t) =>
      `- ${t.name} (owner: ${t.owner}, tier: ${t.tier})`
    ).join("\n")

    const units = source.context.units.map((u) =>
      `- ${u.unit} (${u.skillName}, ${u.graphCoverage}, ~${u.tokenEstimate} tokens)`
    ).join("\n")

    const text = [
      "## Atlas Catalog",
      "",
      `Project: ${sessionInfo.projectID}`,
      `Source: ${source.identityHash.slice(0, 16)}`,
      `Revision: ${source.context.sourceRevision.slice(0, 12)}`,
      `Catalog Version: ${source.context.catalogVersion}`,
      "",
      "### Territories",
      territories || "(none)",
      "",
      "### Units",
      units || "(none)",
      "",
      "Use `atlas_context` to browse catalog and unit content.",
    ].join("\n")

    return SystemContext.make({
      key: SystemContext.Key.make("maestro/atlas-header"),
      codec: Schema.toCodecJson(Schema.String),
      load: Effect.succeed(text),
      baseline: (text) => text,
      update: (_prev, text) => text,
    })
  })

  yield* registry.register({
    key: SystemContext.Key.make("maestro/atlas-header"),
    load: loadAtlasHeader as unknown as Effect.Effect<SystemContext.SystemContext>,
  })
})

export const node = makeLocationNode({
  name: "maestro/atlas-header-source",
  layer: Layer.effectDiscard(makeLayer),
  deps: [AgentV2.node, SessionV2.node, SessionStore.node, SystemContextRegistry.node, Config.node, AppProcess.node, FSUtil.node, SkillV2.node] as const,
})