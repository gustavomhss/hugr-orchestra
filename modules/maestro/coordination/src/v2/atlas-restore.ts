export * as AtlasRestore from "./atlas-restore"

import { Effect, Layer, Option, Schema } from "effect"
import { SessionCompaction } from "@orchestra/core/session/compaction"
import { SessionV2 } from "@orchestra/core/session"
import { SessionStore } from "@orchestra/core/session/store"
import { SystemContextRegistry } from "@orchestra/core/system-context/registry"
import { SystemContext } from "@orchestra/core/system-context"
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
  const sessions = yield* SessionV2.Service
  const store = yield* SessionStore.Service
  const config = yield* Config.Service
  const appProcess = yield* AppProcess.Service
  const fsUtil = yield* FSUtil.Service
  const skills = yield* SkillV2.Service

  const loadAtlasMemory = Effect.fn("AtlasMemorySource.load")(function* (input: { sessionID: string }) {
    const session = yield* sessions.get(SessionSchema.ID.make(input.sessionID)).pipe(Effect.orDie)
    const sessionInfo = yield* store.get(session.id)
    if (!sessionInfo) {
      return SystemContext.empty
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
      return SystemContext.empty
    }

    // Return Atlas memory as a system context source
    const text = [
      "## Atlas Memory (persisted across compaction)",
      "",
      `Project: ${sessionInfo.projectID}`,
      `Source: ${source.identityHash.slice(0, 16)}`,
      `Revision: ${source.context.sourceRevision.slice(0, 12)}`,
      `Catalog Version: ${source.context.catalogVersion}`,
      "",
      "### Territories",
      source.context.territories.map((t) =>
        `- ${t.name} (owner: ${t.owner}, tier: ${t.tier})`
      ).join("\n") || "(none)",
      "",
      "### Units",
      source.context.units.map((u) =>
        `- ${u.unit} (${u.skillName}, ${u.graphCoverage}, ~${u.tokenEstimate} tokens)`
      ).join("\n") || "(none)",
      "",
      "This context survives compaction and is restored on resume.",
    ].join("\n")

    return SystemContext.make({
      key: SystemContext.Key.make("maestro/atlas-memory"),
      codec: Schema.toCodecJson(Schema.String),
      load: Effect.succeed(text),
      baseline: (text) => text,
      update: (_prev, text) => text,
    })
  })

  yield* registry.register({
    key: SystemContext.Key.make("maestro/atlas-memory"),
    load: loadAtlasMemory as unknown as Effect.Effect<SystemContext.SystemContext>,
  })
  yield* Effect.logInfo("Atlas restore integration registered: Atlas memory source registered for compaction survival")
})

export const node = makeLocationNode({
  name: "maestro/atlas-restore",
  layer: Layer.effectDiscard(makeLayer),
  deps: [
    SessionCompaction.node,
    SessionV2.node,
    SessionStore.node,
    SystemContextRegistry.node,
    Config.node,
    AppProcess.node,
    FSUtil.node,
    SkillV2.node,
  ] as const,
})