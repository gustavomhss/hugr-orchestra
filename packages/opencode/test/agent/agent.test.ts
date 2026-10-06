import { afterEach, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Cause, Effect, Exit, Layer } from "effect"
import path from "path"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Global } from "@opencode-ai/core/global"
import { Permission } from "../../src/permission"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Plugin } from "../../src/plugin"
import { Provider } from "../../src/provider/provider"
import { Skill } from "../../src/skill"
import { Truncate } from "../../src/tool/truncate"

const agentLayer = (flags: Partial<RuntimeFlags.Info> = {}) =>
  LayerNode.compile(
    LayerNode.group([Agent.node, Plugin.node, Provider.node, Auth.node, Config.node, Skill.node, RuntimeFlags.node]),
    [[RuntimeFlags.node, RuntimeFlags.layer(flags)]],
  )

const it = testEffect(agentLayer())

// Helper to evaluate permission for a tool with wildcard pattern
function evalPerm(agent: Agent.Info | undefined, permission: string): PermissionV1.Action | undefined {
  if (!agent) return undefined
  return Permission.evaluate(permission, "*", agent.permission).action
}

function load<A>(fn: (svc: Agent.Interface) => Effect.Effect<A>) {
  return Agent.Service.use(fn)
}

const expectDefaultAgentError = Effect.fn("AgentTest.expectDefaultAgentError")(function* (message: string) {
  const exit = yield* load((svc) => svc.defaultAgent()).pipe(Effect.exit)
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).toContain(message)
})

afterEach(async () => {
  await disposeAllInstances()
})

it.instance("returns default native agents when no config", () =>
  Effect.gen(function* () {
    const agents = yield* load((svc) => svc.list())
    const names = agents.map((a) => a.name)
    expect(names).toContain("maestro")
    expect(names).not.toContain("build")
    expect(names).not.toContain("plan")
    expect(names).toContain("general")
    expect(names).toContain("explore")
    expect(names).toContain("compaction")
    expect(names).toContain("title")
    expect(names).toContain("summary")
  }),
)

it.instance("maestro agent has correct default properties", () =>
  Effect.gen(function* () {
    const maestro = yield* load((svc) => svc.get("maestro"))
    expect(maestro).toBeDefined()
    expect(maestro?.mode).toBe("primary")
    expect(maestro?.native).toBe(true)
    expect(evalPerm(maestro, "edit")).toBe("allow")
    expect(evalPerm(maestro, "bash")).toBe("allow")
    expect(evalPerm(maestro, "question")).toBe("allow")
  }),
)

it.instance("plan mode is gone: no build or plan agent and no plan tool permissions", () =>
  Effect.gen(function* () {
    expect(yield* load((svc) => svc.get("build"))).toBeUndefined()
    expect(yield* load((svc) => svc.get("plan"))).toBeUndefined()
    for (const agent of yield* load((svc) => svc.list())) {
      expect(agent.permission.some((rule) => rule.permission === "plan_enter" || rule.permission === "plan_exit")).toBe(
        false,
      )
    }
  }),
)

it.instance("explore agent denies edit and write", () =>
  Effect.gen(function* () {
    const explore = yield* load((svc) => svc.get("explore"))
    expect(explore).toBeDefined()
    expect(explore?.mode).toBe("subagent")
    expect(evalPerm(explore, "edit")).toBe("deny")
    expect(evalPerm(explore, "write")).toBe("deny")
    expect(evalPerm(explore, "todowrite")).toBe("deny")
  }),
)

it.instance("explore agent asks for external directories and allows whitelisted external paths", () =>
  Effect.gen(function* () {
    const explore = yield* load((svc) => svc.get("explore"))
    expect(explore).toBeDefined()
    expect(Permission.evaluate("external_directory", "/some/other/path", explore!.permission).action).toBe("ask")
    expect(Permission.evaluate("external_directory", Truncate.GLOB, explore!.permission).action).toBe("allow")
    expect(
      Permission.evaluate("external_directory", path.join(Global.Path.tmp, "agent-work"), explore!.permission).action,
    ).toBe("allow")
  }),
)

it.instance(
  "reference config does not create subagents",
  () =>
    Effect.gen(function* () {
      const agents = yield* load((svc) => svc.list())
      const names = agents.map((agent) => agent.name)
      expect(names).not.toContain("effect")
      expect(names).not.toContain("effectFull")
      expect(names).not.toContain("localdocs")
      expect(names).not.toContain("localdocsFull")
    }),
  {
    config: {
      references: {
        effect: "github.com/effect/effect-smol",
        effectFull: {
          repository: "Effect-TS/effect",
          branch: "main",
        },
        localdocs: "../docs",
        localdocsFull: {
          path: "../local-docs",
        },
      },
    },
  },
)

it.instance("general agent denies todo tools", () =>
  Effect.gen(function* () {
    const general = yield* load((svc) => svc.get("general"))
    expect(general).toBeDefined()
    expect(general?.mode).toBe("subagent")
    expect(general?.hidden).toBeUndefined()
    expect(evalPerm(general, "todowrite")).toBe("deny")
  }),
)

it.instance("compaction agent denies all permissions", () =>
  Effect.gen(function* () {
    const compaction = yield* load((svc) => svc.get("compaction"))
    expect(compaction).toBeDefined()
    expect(compaction?.hidden).toBe(true)
    expect(evalPerm(compaction, "bash")).toBe("deny")
    expect(evalPerm(compaction, "edit")).toBe("deny")
    expect(evalPerm(compaction, "read")).toBe("deny")
  }),
)

it.instance(
  "custom agent from config creates new agent",
  () =>
    Effect.gen(function* () {
      const custom = yield* load((svc) => svc.get("my_custom_agent"))
      expect(custom).toBeDefined()
      expect(String(custom?.model?.providerID)).toBe("openai")
      expect(String(custom?.model?.modelID)).toBe("gpt-4")
      expect(custom?.description).toBe("My custom agent")
      expect(custom?.temperature).toBe(0.5)
      expect(custom?.topP).toBe(0.9)
      expect(custom?.native).toBe(false)
      expect(custom?.mode).toBe("all")
    }),
  {
    config: {
      agent: {
        my_custom_agent: {
          model: "openai/gpt-4",
          description: "My custom agent",
          temperature: 0.5,
          top_p: 0.9,
        },
      },
    },
  },
)

it.instance(
  "custom agent config overrides native agent properties",
  () =>
    Effect.gen(function* () {
      const maestro = yield* load((svc) => svc.get("maestro"))
      expect(maestro).toBeDefined()
      expect(String(maestro?.model?.providerID)).toBe("anthropic")
      expect(String(maestro?.model?.modelID)).toBe("claude-3")
      expect(maestro?.description).toBe("Custom maestro agent")
      expect(maestro?.temperature).toBe(0.7)
      expect(maestro?.color).toBe("#FF0000")
      expect(maestro?.native).toBe(true)
    }),
  {
    config: {
      agent: {
        maestro: {
          model: "anthropic/claude-3",
          description: "Custom maestro agent",
          temperature: 0.7,
          color: "#FF0000",
        },
      },
    },
  },
)

it.instance(
  "agent disable removes agent from list",
  () =>
    Effect.gen(function* () {
      const explore = yield* load((svc) => svc.get("explore"))
      expect(explore).toBeUndefined()
      const agents = yield* load((svc) => svc.list())
      const names = agents.map((a) => a.name)
      expect(names).not.toContain("explore")
    }),
  {
    config: {
      agent: {
        explore: { disable: true },
      },
    },
  },
)

it.instance(
  "agent permission config merges with defaults",
  () =>
    Effect.gen(function* () {
      const maestro = yield* load((svc) => svc.get("maestro"))
      expect(maestro).toBeDefined()
      // Specific pattern is denied
      expect(Permission.evaluate("bash", "rm -rf *", maestro!.permission).action).toBe("deny")
      // Edit still allowed
      expect(evalPerm(maestro, "edit")).toBe("allow")
    }),
  {
    config: {
      agent: {
        maestro: {
          permission: {
            bash: {
              "rm -rf *": "deny",
            },
          },
        },
      },
    },
  },
)

it.instance(
  "global permission config applies to all agents",
  () =>
    Effect.gen(function* () {
      const maestro = yield* load((svc) => svc.get("maestro"))
      expect(maestro).toBeDefined()
      expect(evalPerm(maestro, "bash")).toBe("deny")
    }),
  {
    config: {
      permission: {
        bash: "deny",
      },
    },
  },
)

it.instance(
  "agent steps/maxSteps config sets steps property",
  () =>
    Effect.gen(function* () {
      const maestro = yield* load((svc) => svc.get("maestro"))
      const general = yield* load((svc) => svc.get("general"))
      expect(maestro?.steps).toBe(50)
      expect(general?.steps).toBe(100)
    }),
  {
    config: {
      agent: {
        maestro: { steps: 50 },
        general: { maxSteps: 100 },
      },
    },
  },
)

it.instance(
  "agent mode can be overridden",
  () =>
    Effect.gen(function* () {
      const explore = yield* load((svc) => svc.get("explore"))
      expect(explore?.mode).toBe("primary")
    }),
  {
    config: {
      agent: {
        explore: { mode: "primary" },
      },
    },
  },
)

it.instance(
  "agent name can be overridden",
  () =>
    Effect.gen(function* () {
      const maestro = yield* load((svc) => svc.get("maestro"))
      expect(maestro?.name).toBe("Conductor")
    }),
  {
    config: {
      agent: {
        maestro: { name: "Conductor" },
      },
    },
  },
)

it.instance(
  "agent prompt can be set from config",
  () =>
    Effect.gen(function* () {
      const maestro = yield* load((svc) => svc.get("maestro"))
      expect(maestro?.prompt).toBe("Custom system prompt")
    }),
  {
    config: {
      agent: {
        maestro: { prompt: "Custom system prompt" },
      },
    },
  },
)

it.instance(
  "unknown agent properties are placed into options",
  () =>
    Effect.gen(function* () {
      const maestro = yield* load((svc) => svc.get("maestro"))
      expect(maestro?.options.random_property).toBe("hello")
      expect(maestro?.options.another_random).toBe(123)
    }),
  {
    config: {
      agent: {
        maestro: {
          random_property: "hello",
          another_random: 123,
        },
      },
    },
  },
)

it.instance(
  "agent options merge correctly",
  () =>
    Effect.gen(function* () {
      const maestro = yield* load((svc) => svc.get("maestro"))
      expect(maestro?.options.custom_option).toBe(true)
      expect(maestro?.options.another_option).toBe("value")
    }),
  {
    config: {
      agent: {
        maestro: {
          options: {
            custom_option: true,
            another_option: "value",
          },
        },
      },
    },
  },
)

it.instance(
  "multiple custom agents can be defined",
  () =>
    Effect.gen(function* () {
      const agentA = yield* load((svc) => svc.get("agent_a"))
      const agentB = yield* load((svc) => svc.get("agent_b"))
      expect(agentA?.description).toBe("Agent A")
      expect(agentA?.mode).toBe("subagent")
      expect(agentB?.description).toBe("Agent B")
      expect(agentB?.mode).toBe("primary")
    }),
  {
    config: {
      agent: {
        agent_a: {
          description: "Agent A",
          mode: "subagent",
        },
        agent_b: {
          description: "Agent B",
          mode: "primary",
        },
      },
    },
  },
)

it.instance(
  "Agent.list keeps maestro first when default_agent is not set",
  () =>
    Effect.gen(function* () {
      const names = (yield* load((svc) => svc.list())).map((a) => a.name)
      expect(names[0]).toBe("maestro")
      expect(names.slice(1)).toEqual(names.slice(1).toSorted((a, b) => a.localeCompare(b)))
    }),
  {
    config: {
      agent: {
        alpha: {
          description: "Alpha",
          mode: "primary",
        },
      },
    },
  },
)

it.instance(
  "Agent.list keeps the default agent first and sorts the rest by name",
  () =>
    Effect.gen(function* () {
      const names = (yield* load((svc) => svc.list())).map((a) => a.name)
      expect(names[0]).toBe("conductor")
      expect(names.slice(1)).toEqual(names.slice(1).toSorted((a, b) => a.localeCompare(b)))
    }),
  {
    config: {
      default_agent: "conductor",
      agent: {
        conductor: {
          description: "Conductor",
          mode: "primary",
        },
        zebra: {
          description: "Zebra",
          mode: "subagent",
        },
        alpha: {
          description: "Alpha",
          mode: "subagent",
        },
      },
    },
  },
)

it.instance("Agent.get returns undefined for non-existent agent", () =>
  Effect.gen(function* () {
    const nonExistent = yield* load((svc) => svc.get("does_not_exist"))
    expect(nonExistent).toBeUndefined()
  }),
)

it.instance("default permission includes doom_loop and external_directory as ask", () =>
  Effect.gen(function* () {
    const maestro = yield* load((svc) => svc.get("maestro"))
    expect(evalPerm(maestro, "doom_loop")).toBe("ask")
    expect(evalPerm(maestro, "external_directory")).toBe("ask")
  }),
)

it.instance("webfetch is allowed by default", () =>
  Effect.gen(function* () {
    const maestro = yield* load((svc) => svc.get("maestro"))
    expect(evalPerm(maestro, "webfetch")).toBe("allow")
  }),
)

it.instance(
  "legacy tools config converts to permissions",
  () =>
    Effect.gen(function* () {
      const maestro = yield* load((svc) => svc.get("maestro"))
      expect(evalPerm(maestro, "bash")).toBe("deny")
      expect(evalPerm(maestro, "read")).toBe("deny")
    }),
  {
    config: {
      agent: {
        maestro: {
          tools: {
            bash: false,
            read: false,
          },
        },
      },
    },
  },
)

it.instance(
  "legacy tools config maps write/edit/patch to edit permission",
  () =>
    Effect.gen(function* () {
      const maestro = yield* load((svc) => svc.get("maestro"))
      expect(evalPerm(maestro, "edit")).toBe("deny")
    }),
  {
    config: {
      agent: {
        maestro: {
          tools: {
            write: false,
          },
        },
      },
    },
  },
)

it.instance(
  "Truncate.GLOB is allowed even when user denies external_directory globally",
  () =>
    Effect.gen(function* () {
      const maestro = yield* load((svc) => svc.get("maestro"))
      expect(Permission.evaluate("external_directory", Truncate.GLOB, maestro!.permission).action).toBe("allow")
      expect(Permission.evaluate("external_directory", Truncate.DIR, maestro!.permission).action).toBe("deny")
      expect(Permission.evaluate("external_directory", "/some/other/path", maestro!.permission).action).toBe("deny")
    }),
  {
    config: {
      permission: {
        external_directory: "deny",
      },
    },
  },
)

it.instance("global tmp directory children are allowed for external_directory", () =>
  Effect.gen(function* () {
    const maestro = yield* load((svc) => svc.get("maestro"))
    expect(
      Permission.evaluate("external_directory", path.join(Global.Path.tmp, "scratch"), maestro!.permission).action,
    ).toBe("allow")
    expect(Permission.evaluate("external_directory", "/some/other/path", maestro!.permission).action).toBe("ask")
  }),
)

it.instance(
  "Truncate.GLOB is allowed even when user denies external_directory per-agent",
  () =>
    Effect.gen(function* () {
      const maestro = yield* load((svc) => svc.get("maestro"))
      expect(Permission.evaluate("external_directory", Truncate.GLOB, maestro!.permission).action).toBe("allow")
      expect(Permission.evaluate("external_directory", Truncate.DIR, maestro!.permission).action).toBe("deny")
      expect(Permission.evaluate("external_directory", "/some/other/path", maestro!.permission).action).toBe("deny")
    }),
  {
    config: {
      agent: {
        maestro: {
          permission: {
            external_directory: "deny",
          },
        },
      },
    },
  },
)

it.instance(
  "explicit Truncate.GLOB deny is respected",
  () =>
    Effect.gen(function* () {
      const maestro = yield* load((svc) => svc.get("maestro"))
      expect(Permission.evaluate("external_directory", Truncate.GLOB, maestro!.permission).action).toBe("deny")
      expect(Permission.evaluate("external_directory", Truncate.DIR, maestro!.permission).action).toBe("deny")
    }),
  {
    config: {
      permission: {
        external_directory: {
          "*": "deny",
          [Truncate.GLOB]: "deny",
        },
      },
    },
  },
)

it.instance(
  "skill directories are allowed for external_directory",
  () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const skillDir = path.join(test.directory, ".opencode", "skill", "perm-skill")
      yield* Effect.promise(() =>
        Bun.write(
          path.join(skillDir, "SKILL.md"),
          `---
name: perm-skill
description: Permission skill.
---

# Permission Skill
`,
        ),
      )

      const home = process.env.OPENCODE_TEST_HOME
      process.env.OPENCODE_TEST_HOME = test.directory
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          process.env.OPENCODE_TEST_HOME = home
        }),
      )

      const maestro = yield* load((svc) => svc.get("maestro"))
      const target = path.join(skillDir, "reference", "notes.md")
      expect(Permission.evaluate("external_directory", target, maestro!.permission).action).toBe("allow")
    }),
  { git: true },
)

it.instance(
  "project reference directories are allowed for external_directory",
  () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const maestro = yield* load((svc) => svc.get("maestro"))
      const target = path.resolve(test.directory, "../docs/reference/notes.md")
      expect(Permission.evaluate("external_directory", target, maestro!.permission).action).toBe("allow")
    }),
  {
    git: true,
    config: {
      references: {
        docs: "../docs",
      },
    },
  },
)

it.instance("defaultAgent returns maestro when no default_agent config", () =>
  Effect.gen(function* () {
    const agent = yield* load((svc) => svc.defaultAgent())
    expect(agent).toBe("maestro")
  }),
)

it.instance("defaultInfo returns resolved maestro agent when no default_agent config", () =>
  Effect.gen(function* () {
    const agent = yield* load((svc) => svc.defaultInfo())
    expect(agent.name).toBe("maestro")
    expect(agent.mode).toBe("primary")
    expect(agent.native).toBe(true)
  }),
)

it.instance(
  "defaultAgent keeps maestro when a configured primary agent is not named by default_agent",
  () =>
    Effect.gen(function* () {
      expect(yield* load((svc) => svc.defaultAgent())).toBe("maestro")
      expect((yield* load((svc) => svc.get("conductor")))?.mode).toBe("primary")
    }),
  {
    config: {
      agent: {
        conductor: { description: "Conductor", mode: "primary" },
      },
    },
  },
)

it.instance(
  "defaultAgent respects default_agent config set to a configured primary agent",
  () =>
    Effect.gen(function* () {
      const agent = yield* load((svc) => svc.defaultAgent())
      expect(agent).toBe("conductor")
    }),
  {
    config: {
      default_agent: "conductor",
      agent: {
        conductor: { description: "Conductor", mode: "primary" },
      },
    },
  },
)

it.instance(
  "defaultAgent respects default_agent config set to custom agent with mode all",
  () =>
    Effect.gen(function* () {
      const agent = yield* load((svc) => svc.defaultAgent())
      expect(agent).toBe("my_custom")
    }),
  {
    config: {
      default_agent: "my_custom",
      agent: {
        my_custom: {
          description: "My custom agent",
        },
      },
    },
  },
)

it.instance(
  "defaultAgent throws when default_agent points to subagent",
  () => expectDefaultAgentError('default agent "explore" is a subagent'),
  {
    config: {
      default_agent: "explore",
    },
  },
)

it.instance(
  "defaultAgent throws when default_agent points to hidden agent",
  () => expectDefaultAgentError('default agent "compaction" is hidden'),
  {
    config: {
      default_agent: "compaction",
    },
  },
)

it.instance(
  "defaultAgent throws when default_agent points to non-existent agent",
  () => expectDefaultAgentError('default agent "does_not_exist" not found'),
  {
    config: {
      default_agent: "does_not_exist",
    },
  },
)

it.instance(
  "defaultAgent throws when maestro is disabled and default_agent is not set",
  () => expectDefaultAgentError('default agent "maestro" not found'),
  {
    config: {
      agent: {
        maestro: { disable: true },
      },
    },
  },
)

it.instance(
  "defaultAgent does not fall back to a configured primary agent when maestro is disabled",
  () => expectDefaultAgentError('default agent "maestro" not found'),
  {
    config: {
      agent: {
        maestro: { disable: true },
        conductor: { description: "Conductor", mode: "primary" },
      },
    },
  },
)
