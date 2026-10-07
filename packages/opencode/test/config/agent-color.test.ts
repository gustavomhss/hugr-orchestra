import { expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect } from "effect"
import { Config } from "@/config/config"
import { Agent as AgentSvc } from "../../src/agent/agent"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([Config.node, AgentSvc.node])))

it.instance(
  "agent color parsed from project config",
  () =>
    Effect.gen(function* () {
      const cfg = yield* Config.use.get()
      expect(cfg.agent?.["maestro"]?.color).toBe("#FFA500")
      expect(cfg.agent?.["general"]?.color).toBe("primary")
    }),
  {
    git: true,
    config: {
      agent: {
        maestro: { color: "#FFA500" },
        general: { color: "primary" },
      },
    },
  },
)

it.instance(
  "Agent.get includes color from config",
  () =>
    Effect.gen(function* () {
      const general = yield* AgentSvc.use.get("general")
      expect(general?.color).toBe("#A855F7")
      expect(general?.native).toBe(true)
      const maestro = yield* AgentSvc.use.get("maestro")
      expect(maestro?.color).toBe("accent")
      expect(maestro?.native).toBe(true)
    }),
  {
    git: true,
    config: {
      agent: {
        general: { color: "#A855F7" },
        maestro: { color: "accent" },
      },
    },
  },
)
