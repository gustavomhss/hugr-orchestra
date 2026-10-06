import { afterEach, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect } from "effect"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Permission } from "../../src/permission"
import { Plugin } from "../../src/plugin"
import { Provider } from "../../src/provider/provider"
import { Skill } from "../../src/skill"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([Agent.node, Plugin.node, Provider.node, Auth.node, Config.node, Skill.node, RuntimeFlags.node]),
    [[RuntimeFlags.node, RuntimeFlags.layer({})]],
  ),
)

function load<A>(fn: (svc: Agent.Interface) => Effect.Effect<A>) {
  return Agent.Service.use(fn)
}

afterEach(async () => {
  await disposeAllInstances()
})

it.instance("every native agent runs on its own prompt, free of opencode and Claude Code", () =>
  Effect.gen(function* () {
    // An agent without a prompt runs on the provider base prompt, which speaks as opencode.
    const agents = (yield* load((svc) => svc.list())).filter((agent) => agent.native)
    expect(agents.map((agent) => agent.id)).toEqual(expect.arrayContaining(["maestro", "general", "explore", "lucy"]))
    for (const agent of agents) {
      expect(agent.prompt?.trim()).toBeTruthy()
      expect(agent.prompt).not.toMatch(/opencode|claude code/i)
    }
  }),
)

it.instance("maestro, general and explore ask before reading .env files", () =>
  Effect.gen(function* () {
    for (const id of ["maestro", "general", "explore"]) {
      const agent = yield* load((svc) => svc.get(id))
      for (const file of [".env", ".env.local", "config/.env.production", "deploy/prod.env", "../other/.env"])
        expect(Permission.evaluate("read", file, agent.permission).action).toBe("ask")
      for (const file of [".env.example", "src/index.ts", "environment.ts"])
        expect(Permission.evaluate("read", file, agent.permission).action).toBe("allow")
    }
  }),
)
