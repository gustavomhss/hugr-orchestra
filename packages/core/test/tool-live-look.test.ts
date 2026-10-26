import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Location } from "@orchestra/core/location"
import { PermissionV2 } from "@orchestra/core/permission"
import { ProjectV2 } from "@orchestra/core/project"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionMessage } from "@orchestra/core/session/message"
import { LiveLookTool } from "@orchestra/core/tool/live-look"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { testEffect } from "./lib/effect"
import { executeTool } from "./lib/tool"

const directory = AbsolutePath.make("/project")
const sessionID = SessionV2.ID.make("ses_live_look")
const assertions: PermissionV2.AssertInput[] = []
const state = { deny: false }

const permission = Layer.mock(PermissionV2.Service, {
  assert: (input) =>
    Effect.sync(() => assertions.push(input)).pipe(
      Effect.andThen(state.deny ? Effect.fail(new PermissionV2.BlockedError({ rules: [] })) : Effect.void),
    ),
})

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, ToolRegistry.node, ToolRegistry.toolsNode, LiveLookTool.node]), [
    [Location.node, Layer.succeed(Location.Service, { directory, project: { id: ProjectV2.ID.global, directory } })],
    [PermissionV2.node, permission],
    [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
  ]),
)

const call = (agent: string) => ({
  sessionID,
  agent: AgentV2.ID.make(agent),
  assistantMessageID: SessionMessage.ID.make("msg_live_look_test"),
  call: { type: "tool-call" as const, id: "call-live-look", name: LiveLookTool.name, input: { question: "Which slide?" } },
})

describe("LiveLookTool", () => {
  it.effect("asks for a frame for live and tells it the frame comes as the next input", () =>
    Effect.gen(function* () {
      assertions.length = 0
      state.deny = false
      const registry = yield* ToolRegistry.Service

      const result = yield* executeTool(registry, call("live"))
      expect(result.type).toBe("text")
      expect(result.value).toContain("[On screen]")
      expect(assertions).toMatchObject([{ sessionID, action: "live_look", resources: ["screen"] }])
    }),
  )

  it.effect("refuses any other seat and a denied permission", () =>
    Effect.gen(function* () {
      assertions.length = 0
      state.deny = false
      const registry = yield* ToolRegistry.Service

      expect(yield* executeTool(registry, call("maestro"))).toEqual({
        type: "error",
        value: "maestro cannot see the owner's screen",
      })
      expect(assertions).toEqual([])
      state.deny = true
      expect(yield* executeTool(registry, call("live"))).toEqual({
        type: "error",
        value: "Not allowed to look at the screen",
      })
    }),
  )
})
