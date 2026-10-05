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

const publishing = [
  "git push",
  "git push origin branch",
  "git push --force-with-lease origin HEAD:dev",
  "git -C /tmp/repo push origin branch",
  "gh pr create",
  "gh pr create --fill --base dev",
  "gh pr merge",
  "gh pr merge 12 --squash",
  "gh release",
  "gh release create v1.2.3",
]

function bash(agent: Agent.Info, command: string) {
  return Permission.evaluate("bash", command, agent.permission).action
}

it.instance("maestro asks before publishing and other agents keep their bash access", () =>
  Effect.gen(function* () {
    const agents = yield* load((svc) => svc.list())
    const maestro = agents.find((agent) => agent.id === "maestro")!

    for (const command of publishing) expect(bash(maestro, command)).toBe("ask")
    for (const command of ["git status", "git commit -m 'push gate'", "git -C /tmp/repo log", "gh pr view 12"])
      expect(bash(maestro, command)).toBe("allow")
    for (const agent of agents.filter((agent) => agent.id !== "maestro"))
      for (const command of publishing) expect(bash(agent, command)).toBe(bash(agent, "git status"))
  }),
)

it.instance(
  "maestro publishing follows agent config",
  () =>
    Effect.gen(function* () {
      const maestro = yield* load((svc) => svc.get("maestro"))
      expect(bash(maestro, "git push")).toBe("allow")
      expect(bash(maestro, "git push origin branch")).toBe("allow")
      expect(bash(maestro, "gh pr create --fill")).toBe("ask")
    }),
  { config: { agent: { maestro: { permission: { bash: { "git push *": "allow" } } } } } },
)

it.instance(
  "maestro publishing follows top-level permission",
  () =>
    Effect.gen(function* () {
      const maestro = yield* load((svc) => svc.get("maestro"))
      expect(bash(maestro, "gh pr create --fill")).toBe("allow")
      expect(bash(maestro, "gh pr merge 12 --squash")).toBe("allow")
      expect(bash(maestro, "gh release create v1.2.3")).toBe("ask")
    }),
  { config: { permission: { bash: { "gh pr *": "allow" } } } },
)
