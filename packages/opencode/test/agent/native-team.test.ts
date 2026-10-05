import { afterEach, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Effect } from "effect"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { nativeProfiles, roster } from "../../src/maestro/roster"
import { Permission } from "../../src/permission"
import { Plugin } from "../../src/plugin"
import { Provider } from "../../src/provider/provider"
import { Skill } from "../../src/skill"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([Agent.node, Plugin.node, Provider.node, Auth.node, Config.node, Skill.node, RuntimeFlags.node]),
    [[RuntimeFlags.node, RuntimeFlags.layer({})]],
  ),
)

const nativeTeam = [
  { id: "charlie", profile: "execution", prompt: "You are Charlie, backend execution specialist." },
  { id: "patty", profile: "execution", prompt: "You are Patty, frontend execution specialist." },
  { id: "lucy", profile: "review", prompt: "You are Lucy, cold code reviewer." },
  { id: "bobby", profile: "review", prompt: "You are Bobby, architecture reviewer." },
  { id: "billy", profile: "review", prompt: "You are Billy, security reviewer." },
  { id: "jimmy", profile: "review", prompt: "You are Jimmy, exploration reviewer." },
  { id: "rosie", profile: "execution", prompt: "You are Rosie, documentation execution specialist." },
  { id: "frankie", profile: "review", prompt: "You are Frankie, process auditor." },
] as const

function load<A>(fn: (service: Agent.Interface) => Effect.Effect<A>) {
  return Agent.Service.use(fn)
}

function evaluate(agent: Agent.Info | undefined, permission: string): PermissionV1.Action | undefined {
  if (!agent) return undefined
  return Permission.evaluate(permission, "*", agent.permission).action
}

afterEach(async () => {
  await disposeAllInstances()
})

it.instance("registers native team specialists with fixed profiles", () =>
  Effect.gen(function* () {
    for (const seat of nativeTeam) {
      const agent = yield* load((service) => service.get(seat.id))
      expect(agent).toMatchObject({ id: seat.id, mode: "subagent", native: true })
      expect(agent.prompt).toStartWith(seat.prompt)
      expect(agent.prompt).toContain("Return card:")
      expect(agent.prompt).toContain("Forbidden:")
      expect(evaluate(agent, "read")).toBe("allow")
      expect(evaluate(agent, "glob")).toBe("allow")
      expect(evaluate(agent, "grep")).toBe("allow")
      expect(evaluate(agent, "task")).toBe("deny")
      expect(evaluate(agent, "webfetch")).toBe("deny")
      expect(evaluate(agent, "websearch")).toBe("deny")
      expect(evaluate(agent, "skill")).toBe("deny")
      expect(evaluate(agent, "external_directory")).toBe("deny")
      expect(evaluate(agent, "bash")).toBe(seat.profile === "execution" ? "allow" : "deny")
      expect(evaluate(agent, "edit")).toBe(seat.profile === "execution" ? "allow" : "deny")
    }
  }),
)

it.instance("native team prompts use roster return cards", () =>
  Effect.sync(() => {
    for (const member of roster) {
      if (!member.nativeProfile) continue
      expect(member.prompt).toContain(`Return card: ${member.returnCard}`)
    }
  }),
)

it.instance(
  "native team config only permits model variant and temperature",
  () =>
    Effect.gen(function* () {
      const lucy = yield* load((service) => service.get("lucy"))
      expect(String(lucy.model?.providerID)).toBe("anthropic")
      expect(String(lucy.model?.modelID)).toBe("claude-3")
      expect(lucy.variant).toBe("fast")
      expect(lucy.temperature).toBe(0.2)
      expect(lucy.name).toBe("Lucy")
      expect(lucy.mode).toBe("subagent")
      expect(lucy.native).toBe(true)
      expect(lucy.prompt).toStartWith("You are Lucy, cold code reviewer.")
      expect(evaluate(lucy, "edit")).toBe("deny")
    }),
  {
    config: {
      permission: { edit: "allow" },
      agent: {
        lucy: {
          model: "anthropic/claude-3",
          variant: "fast",
          temperature: 0.2,
          name: "Not Lucy",
          mode: "primary",
          prompt: "Not Lucy prompt",
          disable: true,
          permission: { edit: "allow" },
        },
      },
    },
  },
)

it.instance("native profiles reject runtime mutation", () =>
  Effect.gen(function* () {
    expect(Object.isFrozen(nativeProfiles)).toBe(true)
    expect(Object.isFrozen(nativeProfiles.review)).toBe(true)
    expect(Reflect.set(nativeProfiles.review, "edit", "allow")).toBe(false)
    expect(Reflect.set(nativeProfiles, "review", nativeProfiles.execution)).toBe(false)

    const lucy = yield* load((service) => service.get("lucy"))
    expect(evaluate(lucy, "edit")).toBe("deny")
    expect(evaluate(lucy, "bash")).toBe("deny")
  }),
)
