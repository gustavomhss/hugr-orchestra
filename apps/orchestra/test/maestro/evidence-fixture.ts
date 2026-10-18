import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { Skill } from "../../src/skill"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionV1 } from "@orchestra/core/v1/session"
import { Effect } from "effect"
import { Agent } from "../../src/agent/agent"
import { Config } from "../../src/config/config"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { Git } from "../../src/git"
import type { SessionPrompt } from "../../src/session/prompt"
import { MessageID, PartID } from "../../src/session/schema"
import { Session } from "../../src/session/session"
import type { TaskPromptOps } from "../../src/tool/task"
import { Truncate } from "../../src/tool/truncate"
import { testEffect } from "../lib/effect"

export const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }
export const workCard = [
  "# Card",
  "## Definition of Done",
  "Lucy reviews the full branch diff.",
  "## Invariants",
  "The working tree stays clean from context to review.",
  "## Quality Standards",
  "Review evidence binds exact SHAs.",
  "## Completeness Criteria",
  "Every committed path in the branch delta is covered.",
  "## Success Criteria",
  "A durable review receipt exists for this card.",
  "",
].join("\n")
export const it = testEffect(
  LayerNode.compile(
    LayerNode.group([
      filesystem,
      Skill.node,
      Agent.node,
      Config.node,
      CrossSpawnSpawner.node,
      Database.node,
      EventV2Bridge.node,
      Git.node,
      Session.node,
      SessionProjector.node,
      Truncate.node,
    ]),
  ),
)

export const seed = Effect.fn("MaestroEvidenceToolsTest.seed")(function* () {
  const sessions = yield* Session.Service
  const chat = yield* sessions.create({ title: "evidence tools" })
  const user = yield* sessions.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID: chat.id,
    agent: "maestro",
    model,
    time: { created: Date.now() },
  })
  const assistant: SessionV1.Assistant = {
    id: MessageID.ascending(),
    role: "assistant",
    parentID: user.id,
    sessionID: chat.id,
    mode: "maestro",
    agent: "maestro",
    cost: 0,
    path: { cwd: chat.directory, root: chat.directory },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: model.modelID,
    providerID: model.providerID,
    time: { created: Date.now() },
  }
  yield* sessions.updateMessage(assistant)
  return { chat, assistant }
})

export function promptOps(onPrompt: (input: SessionPrompt.PromptInput) => void): TaskPromptOps {
  return {
    cancel: () => Effect.void,
    resolvePromptParts: (template) => Effect.succeed([{ type: "text", text: template }]),
    prompt: (input) =>
      Effect.sync(() => {
        onPrompt(input)
        const id = MessageID.ascending()
        return {
          info: {
            id,
            role: "assistant",
            parentID: input.messageID ?? MessageID.ascending(),
            sessionID: input.sessionID,
            mode: input.agent ?? "lucy",
            agent: input.agent ?? "lucy",
            cost: 0,
            path: { cwd: "/tmp", root: "/tmp" },
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            modelID: input.model?.modelID ?? model.modelID,
            providerID: input.model?.providerID ?? model.providerID,
            time: { created: Date.now() },
            finish: "stop",
          },
          parts: [{ id: PartID.ascending(), messageID: id, sessionID: input.sessionID, type: "text", text: "done" }],
        }
      }),
  }
}
