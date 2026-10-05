import { afterEach, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Effect } from "effect"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import path from "path"
import { Global } from "@opencode-ai/core/global"
import { InstanceState } from "../../src/effect/instance-state"
import { charlieSkills, nativeProfiles, roster } from "../../src/maestro/roster"
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
  {
    id: "charlie",
    profile: "charlie",
    mode: "all",
    prompt: "You are the backend implementation specialist on the Orchestra native team.",
  },
  { id: "patty", profile: "execution", mode: "subagent", prompt: "You are Patty, frontend execution specialist." },
  { id: "lucy", profile: "review", mode: "subagent", prompt: "You are Lucy, cold code reviewer." },
  { id: "bobby", profile: "review", mode: "subagent", prompt: "You are Bobby, architecture reviewer." },
  { id: "billy", profile: "review", mode: "subagent", prompt: "You are Billy, security reviewer." },
  { id: "jimmy", profile: "review", mode: "subagent", prompt: "You are Jimmy, exploration reviewer." },
  {
    id: "rosie",
    profile: "execution",
    mode: "subagent",
    prompt: "You are Rosie, documentation execution specialist.",
  },
  { id: "frankie", profile: "review", mode: "subagent", prompt: "You are Frankie, process auditor." },
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
      expect(agent).toMatchObject({ id: seat.id, mode: seat.mode, native: true })
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
      expect(evaluate(agent, "bash")).toBe(seat.profile === "review" ? "deny" : "allow")
      expect(evaluate(agent, "edit")).toBe(seat.profile === "review" ? "deny" : "allow")
      const profile = Permission.fromConfig(nativeProfiles[seat.profile])
      expect(agent.permission.slice(0, profile.length)).toEqual(profile)
      if (seat.id !== "charlie") expect(agent.permission).toEqual(profile)
    }
  }),
)

it.instance("charlie alone gets its entry skills and read-only skill root", () =>
  Effect.gen(function* () {
    const charlie = yield* load((service) => service.get("charlie"))
    const check = (permission: string, pattern: string) =>
      Permission.evaluate(permission, pattern, charlie.permission).action

    expect(charlieSkills.root).toBe(path.resolve(import.meta.dir, "../../../charlie/skills"))
    for (const name of charlieSkills.names) expect(check("skill", name)).toBe("allow")
    expect(check("skill", "customize-opencode")).toBe("deny")
    expect(check("skill", "own_backend-implement")).toBe("deny")
    expect(check("external_directory", path.join(charlieSkills.root, "backend-implement", "references", "*"))).toBe(
      "allow",
    )
    expect(check("external_directory", path.join(path.dirname(charlieSkills.root), "*"))).toBe("deny")
    expect(check("external_directory", path.join(Global.Path.tmp, "*"))).toBe("deny")
    const instance = yield* InstanceState.context
    expect(check("edit", "src/handler.go")).toBe("allow")
    expect(
      check("edit", path.relative(instance.worktree, path.join(charlieSkills.root, "backend-implement", "SKILL.md"))),
    ).toBe("deny")
    for (const denied of ["task", "question", "webfetch", "websearch", "todowrite", "maestro_record_review"])
      expect(check(denied, "*")).toBe("deny")

    // The shared profiles stay exactly as they were for every other native seat.
    expect(nativeProfiles.execution).toEqual({
      "*": "deny",
      read: "allow",
      glob: "allow",
      grep: "allow",
      bash: "allow",
      edit: "allow",
    })
    expect(nativeProfiles.review).toEqual({
      "*": "deny",
      read: "allow",
      glob: "allow",
      grep: "allow",
      maestro_record_review: "allow",
    })
    expect(roster.filter((member) => member.nativeProfile === "charlie").map((member) => member.memberId)).toEqual([
      "charlie",
    ])
    for (const seat of nativeTeam.filter((seat) => seat.id !== "charlie")) {
      const agent = yield* load((service) => service.get(seat.id))
      expect(agent.mode).toBe("subagent")
      for (const name of charlieSkills.names)
        expect(Permission.evaluate("skill", name, agent.permission).action).toBe("deny")
      expect(
        Permission.evaluate("external_directory", path.join(charlieSkills.root, "*"), agent.permission).action,
      ).toBe("deny")
    }
  }),
)

it.instance("charlie charter renders the roster Forbidden list verbatim", () =>
  Effect.sync(() => {
    const charlie = roster.find((member) => member.memberId === "charlie")
    expect(charlie?.prompt?.split("Forbidden:")).toHaveLength(2)
    expect(charlie?.prompt).toEndWith(`\n\nForbidden: ${charlie?.forbiddenActions.join(", ")}.\n`)
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
    expect(Object.isFrozen(nativeProfiles.charlie.skill)).toBe(true)
    expect(Object.isFrozen(nativeProfiles.charlie.external_directory)).toBe(true)
    expect(Reflect.set(nativeProfiles.review, "edit", "allow")).toBe(false)
    expect(Reflect.set(nativeProfiles, "review", nativeProfiles.execution)).toBe(false)

    const lucy = yield* load((service) => service.get("lucy"))
    expect(evaluate(lucy, "edit")).toBe("deny")
    expect(evaluate(lucy, "bash")).toBe("deny")
  }),
)
