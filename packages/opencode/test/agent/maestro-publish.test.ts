import { afterEach, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect } from "effect"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { nativeProfiles, roster } from "../../src/maestro/roster"
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

// Maestro and general ask the owner. Seats with a shell never get a prompt and explore only reads, so they are denied.
const asking = ["maestro", "general"]
const denied = [
  ...roster.filter((member) => member.nativeProfile === "execution").map((member) => member.memberId),
  "explore",
]

it.instance("maestro and general ask before publishing, shell seats and explore cannot, others keep their access", () =>
  Effect.gen(function* () {
    const agents = yield* load((svc) => svc.list())
    expect(denied).toEqual(["charlie", "patty", "rosie", "explore"])

    for (const agent of agents) {
      const id = agent.id ?? agent.name
      if (!asking.includes(id) && !denied.includes(id)) {
        for (const command of publishing) expect(bash(agent, command)).toBe(bash(agent, "git status"))
        continue
      }
      for (const command of publishing) expect(bash(agent, command)).toBe(asking.includes(id) ? "ask" : "deny")
      for (const command of ["git status", "git commit -m 'push gate'", "git -C /tmp/repo log", "gh pr view 12"])
        expect(bash(agent, command)).toBe("allow")
    }
    // A seat's runtime check reads its native profile directly.
    for (const command of publishing)
      expect(Permission.evaluate("bash", command, Permission.fromConfig(nativeProfiles.execution)).action).toBe("deny")
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
  "maestro and general publishing follow top-level permission, seats stay denied",
  () =>
    Effect.gen(function* () {
      for (const id of asking) {
        const agent = yield* load((svc) => svc.get(id))
        expect(bash(agent, "gh pr create --fill")).toBe("allow")
        expect(bash(agent, "gh pr merge 12 --squash")).toBe("allow")
        expect(bash(agent, "gh release create v1.2.3")).toBe("ask")
      }
      const charlie = yield* load((svc) => svc.get("charlie"))
      expect(bash(charlie, "gh pr create --fill")).toBe("deny")
    }),
  { config: { permission: { bash: { "gh pr *": "allow" } } } },
)
