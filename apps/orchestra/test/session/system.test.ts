import { describe, expect } from "bun:test"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Effect, Layer } from "effect"
import type { Agent } from "../../src/agent/agent"
import { NamedError } from "@orchestra/core/util/error"
import { Skill } from "../../src/skill"
import { Permission } from "../../src/permission"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { LLMRequestPrep } from "../../src/session/llm/request"
import { MessageID, SessionID } from "../../src/session/schema"
import { SystemPrompt } from "../../src/session/system"
import { MCP } from "../../src/mcp"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderTest } from "../fake/provider"
import { testEffect } from "../lib/effect"

const skills: Skill.Info[] = [
  {
    name: "zeta-skill",
    description: "Zeta skill.",
    location: "/tmp/zeta-skill/SKILL.md",
    content: "# zeta-skill",
  },
  {
    name: "alpha-skill",
    description: "Alpha skill.",
    location: "/tmp/alpha-skill/SKILL.md",
    content: "# alpha-skill",
  },
  {
    name: "middle-skill",
    description: "Middle skill.",
    location: "/tmp/middle-skill/SKILL.md",
    content: "# middle-skill",
  },
  {
    name: "manual-skill",
    location: "/tmp/manual-skill/SKILL.md",
    content: "# manual-skill",
  },
]

const maestro: Agent.Info = {
  name: "maestro",
  mode: "primary",
  permission: Permission.fromConfig({ "*": "allow" }),
  options: {},
}

const it = testEffect(
  LayerNode.compile(SystemPrompt.node, [
    [
      MCP.node,
      Layer.mock(MCP.Service, {
        instructions: () =>
          Effect.succeed([
            {
              name: "guide-server",
              instructions: "Use lookup before mutate.",
              tools: [],
            },
            {
              name: "tool-server",
              instructions: "Prefer search before update.",
              tools: ["tool-server_search", "tool-server_update"],
            },
          ]),
      }),
    ],
    [
      Skill.node,
      Layer.succeed(
        Skill.Service,
        Skill.Service.of({
          get: (name) => Effect.succeed(skills.find((skill) => skill.name === name)),
          require: (name) => {
            const info = skills.find((skill) => skill.name === name)
            if (info) return Effect.succeed(info)
            return Effect.fail(new Skill.NotFoundError({ name, available: skills.map((skill) => skill.name) }))
          },
          all: () => Effect.succeed(skills),
          dirs: () => Effect.succeed([]),
          available: () => Effect.succeed(skills),
          save: () => Effect.die("unused"),
          remove: () => Effect.die("unused"),
        }),
      ),
    ],
  ]),
)

const prep = testEffect(RuntimeFlags.layer())

describe("session.system", () => {
  // Models once got one of several upstream provider prompts; now every model gets the same Orchestra prompt.
  prep.effect("gives an agent without a prompt the Orchestra base prompt, whatever the model", () =>
    Effect.gen(function* () {
      const flags = yield* RuntimeFlags.Service
      for (const id of ["claude-sonnet-4-5", "gpt-5", "gpt-5-codex", "gemini-2.5-pro", "kimi-k2", "muse-spark-1.1"]) {
        const model = ProviderTest.model({ id: ModelV2.ID.make(id) })
        const prepared = yield* LLMRequestPrep.prepare({
          sessionID: "ses_base_prompt",
          model,
          agent: { name: "conductor", mode: "primary", permission: [], options: {} },
          user: {
            id: MessageID.make("msg_base_prompt"),
            sessionID: SessionID.make("ses_base_prompt"),
            role: "user",
            agent: "conductor",
            model: { providerID: model.providerID, modelID: model.id },
            time: { created: 0 },
          },
          system: ["Environment"],
          messages: [],
          tools: {},
          provider: ProviderTest.info({}, model),
          auth: undefined,
          plugin: { trigger: (_name, _input, output) => Effect.succeed(output), list: () => Effect.succeed([]), init: () => Effect.void },
          flags,
          isWorkflow: false,
        })
        expect(prepared.system).toEqual([`${SystemPrompt.base}\nEnvironment`])
      }
      expect(SystemPrompt.base).toStartWith("You are an agent in HuGR Orchestra")
    }),
  )

  it.effect("skills output is sorted by name and stable across calls", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const first = yield* prompt.skills(maestro)
      const second = yield* prompt.skills(maestro)
      const output = first ?? (yield* Effect.fail(new NamedError.Unknown({ message: "missing skills output" })))

      expect(first).toBe(second)

      const alpha = output.indexOf("<name>alpha-skill</name>")
      const middle = output.indexOf("<name>middle-skill</name>")
      const zeta = output.indexOf("<name>zeta-skill</name>")

      expect(alpha).toBeGreaterThan(-1)
      expect(middle).toBeGreaterThan(alpha)
      expect(zeta).toBeGreaterThan(middle)
      expect(output).not.toContain("manual-skill")
    }),
  )

  it.effect("MCP output includes connected server instructions", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const output = yield* prompt.mcp(maestro)

      expect(output).toBe(
        [
          "<mcp_instructions>",
          '  <server name="guide-server">',
          "    Use lookup before mutate.",
          "  </server>",
          '  <server name="tool-server">',
          "    Prefer search before update.",
          "  </server>",
          "</mcp_instructions>",
        ].join("\n"),
      )
    }),
  )

  it.effect("MCP output omits servers when all advertised tools are denied", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const output = yield* prompt.mcp(maestro, Permission.fromConfig({ "tool-server_*": "deny" }))

      expect(output).toBe(
        [
          "<mcp_instructions>",
          '  <server name="guide-server">',
          "    Use lookup before mutate.",
          "  </server>",
          "</mcp_instructions>",
        ].join("\n"),
      )
    }),
  )
})
