import { afterEach, expect } from "bun:test"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { PermissionV1 } from "@orchestra/core/v1/permission"
import { Effect } from "effect"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import path from "path"
import { Global } from "@orchestra/core/global"
import { InstanceState } from "../../src/effect/instance-state"
import { backendSkills, nativeProfiles, roster, UPSTREAM_DEFAULT_LABEL } from "../../src/maestro/roster"
import { Seats } from "../../src/maestro/seats"
import { Permission } from "../../src/permission"
import { Plugin } from "../../src/plugin"
import { Provider } from "../../src/provider/provider"
import { Skill } from "../../src/skill"
import { Truncate } from "../../src/tool/truncate"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([Agent.node, Plugin.node, Provider.node, Auth.node, Config.node, Skill.node, RuntimeFlags.node]),
    [[RuntimeFlags.node, RuntimeFlags.layer({})]],
  ),
)

const execution = "Edits files and runs shell commands."
const review = "Read-only: reads and searches files; cannot edit or run commands."

const nativeTeam = [
  {
    id: "backend",
    profile: "backend",
    prompt: "You are the backend implementation specialist on the Orchestra native team.",
    description: "Backend implementation specialist. Use it to implement one complete backend work packet: the target behavior with its acceptance, the write paths, and the checks to run. Edits only dispatch writePaths; read-only without them. Runs shell commands. Returns the change, check evidence and blockers. Not for investigation, diagnosis, design or review.",
  },
  {
    id: "archie",
    profile: "upstream",
    prompt: `You are ${UPSTREAM_DEFAULT_LABEL}, the upstream product, architecture, specification and planning specialist`,
    description: "Upstream product, architecture, specification and planning specialist. Use it to author or revise requirements, technical proposals, roadmaps, decomposition, tasks, work packages and briefs. Edits only dispatch writePaths; read-only without them. Returns attributed proposals, source references, blockers and next actions. Does not implement products, approve scope, dispatch work or execute workflows.",
  },
  {
    id: "patty",
    profile: "execution",
    prompt: "You are Patty, frontend execution specialist.",
    description: `Frontend execution. ${execution} Returns implementation card, sensory evidence, diff receipt.`,
  },
  {
    id: "lucy",
    profile: "review",
    prompt: "You are Lucy, cold code reviewer.",
    description: `Cold code review; records governed reviews. ${review} Returns cited APPROVE/FIX_FIRST/REJECT card.`,
  },
  {
    id: "billy",
    profile: "review",
    prompt: "You are Billy, security reviewer.",
    description: `Security review. ${review} Returns threat verdict and cited controls.`,
  },
  {
    id: "jimmy",
    profile: "review",
    prompt: "You are Jimmy, exploration reviewer.",
    description: `Codebase exploration. ${review} Returns grounded findings card.`,
  },
  {
    id: "rosie",
    profile: "execution",
    prompt: "You are Rosie, documentation execution specialist.",
    description: `Documentation changes. ${execution} Returns docs evidence card.`,
  },
  {
    id: "frankie",
    profile: "review",
    prompt: "You are Frankie, process auditor.",
    description: `Process audit. ${review} Returns audit verdict.`,
  },
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
      // The user talks only to Maestro: every seat, the backend specialist included, is a subagent.
      expect(agent).toMatchObject({ id: seat.id, mode: "subagent", native: true })
      expect(agent.description).toBe(seat.description)
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
      // External access covers bash and edit too, so only the review profile, which holds neither, reaches saved output.
      expect(Permission.evaluate("external_directory", Truncate.GLOB, agent.permission).action).toBe(
        seat.profile === "review" ? "allow" : "deny",
      )
      expect(evaluate(agent, "bash")).toBe(seat.profile === "review" ? "deny" : "allow")
      expect(evaluate(agent, "edit")).toBe(seat.profile === "review" ? "deny" : "allow")
      const profile = Permission.fromConfig(nativeProfiles[seat.profile])
      expect(agent.permission.slice(0, profile.length)).toEqual(profile)
      if (seat.id !== "backend" && seat.id !== "archie") expect(agent.permission).toEqual(profile)
    }
  }),
)

it.instance("backend alone gets backend skills and Atlas grants", () =>
  Effect.gen(function* () {
    const backend = yield* load((service) => service.get("backend"))
    const check = (permission: string, pattern: string) =>
      Permission.evaluate(permission, pattern, backend.permission).action

    expect(backendSkills.root).toBe(path.resolve(import.meta.dir, "../../../backend-specialist/skills"))
    for (const name of backendSkills.names) expect(check("skill", name)).toBe("allow")
    expect(check("skill", "maestro-governed")).toBe("deny")
    expect(check("skill", "own_backend-implement")).toBe("deny")
    expect(check("external_directory", path.join(backendSkills.root, "backend-implement", "references", "*"))).toBe(
      "allow",
    )
    expect(check("external_directory", path.join(path.dirname(backendSkills.root), "*"))).toBe("deny")
    expect(check("external_directory", path.join(Global.Path.tmp, "*"))).toBe("deny")
    const instance = yield* InstanceState.context
    expect(check("edit", "src/handler.go")).toBe("allow")
    expect(
      check("edit", path.relative(instance.worktree, path.join(backendSkills.root, "backend-implement", "SKILL.md"))),
    ).toBe("deny")
    for (const denied of ["task", "question", "webfetch", "websearch", "todowrite", "maestro_record_review"])
      expect(check(denied, "*")).toBe("deny")
    // F3 clause 29: the bound Atlas Memory tools are granted by explicit tool ID, to this seat only.
    expect(check("atlas_memory_recall", "backend")).toBe("allow")
    expect(check("atlas_memory_emit", "backend")).toBe("allow")
    expect(check("atlas_memory_header", "*")).toBe("deny")

    // The shared profiles stay exactly as they were for every other native seat.
    const envRead = { "*": "allow", "*.env": "deny", "*.env.*": "deny", "*.env.example": "allow" } as const
    const publishDenied = {
      "*": "allow",
      "git push *": "deny",
      "git -C * push *": "deny",
      "gh pr create *": "deny",
      "gh pr merge *": "deny",
      "gh release *": "deny",
    } as const
    expect(nativeProfiles.execution).toEqual({
      "*": "deny",
      read: envRead,
      glob: "allow",
      grep: "allow",
      bash: publishDenied,
      edit: "allow",
    })
    expect(nativeProfiles.review).toEqual({
      "*": "deny",
      read: envRead,
      glob: "allow",
      grep: "allow",
      maestro_record_review: "allow",
      external_directory: { "*": "deny", [Truncate.GLOB]: "allow" },
    })
    // The backend specialist keeps the seat rules: no .env reads and no publishing.
    expect(nativeProfiles.backend.read).toEqual(envRead)
    expect(nativeProfiles.backend.bash).toEqual(publishDenied)
    expect(roster.filter((member) => member.nativeProfile === "backend").map((member) => member.memberId)).toEqual([
      "backend",
    ])
    for (const seat of nativeTeam.filter((seat) => seat.id !== "backend")) {
      const agent = yield* load((service) => service.get(seat.id))
      expect(agent.mode).toBe("subagent")
      for (const name of backendSkills.names)
        expect(Permission.evaluate("skill", name, agent.permission).action).toBe("deny")
      for (const tool of ["atlas_memory_recall", "atlas_memory_emit"])
        expect(Permission.evaluate(tool, "*", agent.permission).action).toBe("deny")
      expect(
        Permission.evaluate("external_directory", path.join(backendSkills.root, "*"), agent.permission).action,
      ).toBe("deny")
    }
  }),
)

it.instance("upstream registration retains native scope and isolates its authoring skills", () =>
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const skills = yield* Skill.Service
    const upstream = yield* agents.get("archie")
    expect(upstream).toMatchObject({ id: "archie", name: UPSTREAM_DEFAULT_LABEL, native: true, mode: "subagent" })
    expect(roster.find((member) => member.memberId === "archie")?.nativeProfile).toBe("upstream")
    expect(nativeProfiles.upstream).toBe(nativeProfiles.archie)
    expect((yield* skills.available(upstream)).map((skill) => skill.name).toSorted()).toEqual(Seats.all.archie.skills.toSorted())
    expect((yield* skills.require("archie-work-package", "archie")).content).toContain("RelaySprint.Sprint")
    const backend = yield* agents.get("backend")
    expect((yield* skills.available(backend)).map((skill) => skill.name)).not.toContain("archie-plan")
    expect((yield* skills.all()).map((skill) => skill.name)).not.toContain("archie-plan")
    expect(yield* agents.get("bobby")).toBeUndefined()
    for (const tool of ["task", "question", "atlas_memory_recall", "atlas_memory_emit", "maestro_record_review", "maestro_record_approval"])
      expect(evaluate(upstream, tool)).toBe("deny")
  }),
)

it.instance("upstream name config cannot widen its native charter or permissions", () =>
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const upstream = yield* agents.get("archie")
    expect(upstream).toMatchObject({ id: "archie", name: "Configured Planner", native: true, mode: "subagent" })
    expect(upstream.prompt).toStartWith("You are Configured Planner, the upstream product")
    expect(evaluate(upstream, "task")).toBe("deny")
    expect(evaluate(upstream, "maestro_record_approval")).toBe("deny")
  }),
  { config: { permission: { task: "allow" }, agent: { archie: {
    name: "Configured Planner", mode: "primary", disable: true, prompt: "replacement", permission: { task: "allow" },
  } } } },
)

testEffect(LayerNode.compile(
  LayerNode.group([Agent.node, Plugin.node, Provider.node, Auth.node, Config.node, Skill.node, RuntimeFlags.node]),
  [[RuntimeFlags.node, RuntimeFlags.layer({ seatLabels: { archie: "Environment Planner" } })]],
)).instance("upstream environment label overrides config without changing routing", () =>
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const upstream = yield* agents.get("archie")
    expect(upstream).toMatchObject({ id: "archie", name: "Environment Planner", native: true, mode: "subagent" })
    expect(upstream.prompt).toStartWith("You are Environment Planner, the upstream product")
    expect(yield* agents.get("Environment Planner")).toBeUndefined()
  }),
  { config: { agent: { archie: { name: "Configured Planner" } } } },
)

it.instance("retired upstream ID is not registered or aliased", () =>
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    expect(yield* agents.get("walt")).toBeUndefined()
    expect(Seats.find("walt")).toBeUndefined()
    expect(nativeProfiles).not.toHaveProperty("walt")
    expect(yield* agents.get("upstream")).toBeUndefined()
    expect(yield* agents.get(UPSTREAM_DEFAULT_LABEL)).toBeUndefined()
  }),
)

it.instance("custom agents remain non-native rather than acquiring the upstream charter", () =>
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const custom = yield* agents.get("custom-planner")
    expect(custom).toMatchObject({ id: "custom-planner", name: "Custom Planner", native: false, mode: "subagent" })
    expect(custom.prompt).toBe("Custom proposal prompt")
    expect(Seats.find(custom.id)).toBeUndefined()
    expect(roster.find((member) => member.memberId === custom.id)).toBeUndefined()
    expect(yield* agents.get("Custom Planner")).toBeUndefined()
  }),
  { config: { agent: { "custom-planner": { name: "Custom Planner", mode: "subagent", prompt: "Custom proposal prompt" } } } },
)

it.instance("native team seats cannot read .env files but can read .env.example", () =>
  Effect.gen(function* () {
    for (const seat of nativeTeam) {
      const agent = yield* load((service) => service.get(seat.id))
      // The runtime check reads the native profile directly; the agent carries the same rules.
      for (const ruleset of [agent.permission, Permission.fromConfig(nativeProfiles[seat.profile])]) {
        for (const file of [".env", ".env.local", "config/.env.production", "deploy/prod.env", "../other/.env"])
          expect(Permission.evaluate("read", file, ruleset).action).toBe("deny")
        for (const file of [".env.example", "config/.env.example", "src/index.ts", "environment.ts"])
          expect(Permission.evaluate("read", file, ruleset).action).toBe("allow")
      }
    }
  }),
)

it.instance("backend charter renders the roster Forbidden list verbatim", () =>
  Effect.sync(() => {
    const backend = roster.find((member) => member.memberId === "backend")
    expect(backend?.prompt?.split("Forbidden:")).toHaveLength(2)
    expect(backend?.prompt).toEndWith(`\n\nForbidden: ${backend?.forbiddenActions.join(", ")}.\n`)
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
  "native team config only permits model, variant, temperature and label",
  () =>
    Effect.gen(function* () {
      const lucy = yield* load((service) => service.get("lucy"))
      expect(String(lucy.model?.providerID)).toBe("anthropic")
      expect(String(lucy.model?.modelID)).toBe("claude-3")
      expect(lucy.variant).toBe("fast")
      expect(lucy.temperature).toBe(0.2)
      expect(lucy.id).toBe("lucy")
      expect(lucy.name).toBe("Not Lucy")
      expect(lucy.mode).toBe("subagent")
      expect(lucy.native).toBe(true)
      expect(lucy.prompt).toStartWith("You are Not Lucy, cold code reviewer.")
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
    expect(Object.isFrozen(nativeProfiles.backend.skill)).toBe(true)
    expect(Object.isFrozen(nativeProfiles.backend.external_directory)).toBe(true)
    expect(Reflect.set(nativeProfiles.review, "edit", "allow")).toBe(false)
    expect(Reflect.set(nativeProfiles, "review", nativeProfiles.execution)).toBe(false)

    const lucy = yield* load((service) => service.get("lucy"))
    expect(evaluate(lucy, "edit")).toBe("deny")
    expect(evaluate(lucy, "bash")).toBe("deny")
  }),
)
