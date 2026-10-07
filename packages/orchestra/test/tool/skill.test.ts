import { PermissionV1 } from "@orchestra/core/v1/permission"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Npm } from "@orchestra/core/npm"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { Ripgrep } from "@orchestra/core/ripgrep"
import { Cause, Effect, Exit, Layer } from "effect"
import { afterEach, describe, expect } from "bun:test"
import path from "path"
import type { Permission } from "../../src/permission"
import type { Tool } from "@/tool/tool"
import { SkillTool } from "../../src/tool/skill"
import { Session } from "@/session/session"
import { SessionProjector } from "@orchestra/core/session/projector"
import { ToolRegistry } from "@/tool/registry"
import { NpmTest } from "../fake/npm"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { SessionID, MessageID } from "../../src/session/schema"
import { testEffect } from "../lib/effect"

const baseCtx: Omit<Tool.Context, "ask"> = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make("msg_test"),
  callID: "",
  agent: "maestro",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
}

afterEach(async () => {
  await disposeAllInstances()
})

// The first test writes .orchestra/skill, and Config starts a detached npm install into every .orchestra directory it
// loads. A real one outlives its test and, on Windows, starves file I/O for later test files in the same process.
const it = testEffect(
  TestAppNodeBuilder.build(
    LayerNode.group([ToolRegistry.node, Session.node, SessionProjector.node, CrossSpawnSpawner.node, Ripgrep.node]),
    [[Npm.node, NpmTest.noop]],
  ),
)

describe("tool.skill", () => {
  it.instance("execute returns skill content block with files", () =>
    Effect.gen(function* () {
      const dir = (yield* TestInstance).directory
      const skill = path.join(dir, ".orchestra", "skill", "tool-skill")

      const home = process.env.ORCHESTRA_TEST_HOME
      process.env.ORCHESTRA_TEST_HOME = dir
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          process.env.ORCHESTRA_TEST_HOME = home
        }),
      )

      const registry = yield* ToolRegistry.Service
      const agent = { name: "maestro", mode: "primary" as const, permission: [], options: {} }
      const tool = (yield* registry.tools({
        providerID: "opencode" as any,
        modelID: "gpt-5" as any,
        agent,
      })).find((tool) => tool.id === SkillTool.id)
      if (!tool) throw new Error("Skill tool not found")

      expect(tool.description).not.toContain("tool-skill")
      expect(tool.description).not.toContain("Skill for tool tests.")

      const requests: Array<Omit<PermissionV1.Request, "id" | "sessionID" | "tool">> = []
      const sessions = yield* Session.Service
      const session = yield* sessions.create({ agent: "maestro" })
      const ctx: Tool.Context = {
        ...baseCtx,
        sessionID: session.id,
        ask: (req) =>
          Effect.sync(() => {
            requests.push(req)
          }),
      }

      const result = yield* tool.execute({ name: "tool-skill" }, ctx)
      const file = path.resolve(skill, "scripts", "demo.txt")

      expect(requests.length).toBe(1)
      expect(requests[0].permission).toBe("skill")
      expect(requests[0].patterns).toContain("tool-skill")
      expect(requests[0].always).toContain("tool-skill")
      expect(result.metadata.dir).toBe(skill)
      expect(result.output).toContain(`<skill_content name="tool-skill">`)
      expect(result.output).toContain(`Base directory for this skill: ${skill}`)
      expect(result.output).toContain(`<file>${file}</file>`)
    }),
    {
      init: (directory) => Effect.promise(async () => {
        const skill = path.join(directory, ".orchestra", "skill", "tool-skill")
        await Bun.write(path.join(skill, "SKILL.md"), `---
name: tool-skill
description: Skill for tool tests.
---

# Tool Skill

Use this skill.
`)
        await Bun.write(path.join(skill, "scripts", "demo.txt"), "demo")
      }),
    },
  )

  it.instance("execute preserves not found message", () =>
    Effect.gen(function* () {
      const dir = (yield* TestInstance).directory
      const home = process.env.ORCHESTRA_TEST_HOME
      process.env.ORCHESTRA_TEST_HOME = dir
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          process.env.ORCHESTRA_TEST_HOME = home
        }),
      )

      const registry = yield* ToolRegistry.Service
      const agent = { name: "maestro", mode: "primary" as const, permission: [], options: {} }
      const tool = (yield* registry.tools({
        providerID: "opencode" as any,
        modelID: "gpt-5" as any,
        agent,
      })).find((tool) => tool.id === SkillTool.id)
      if (!tool) throw new Error("Skill tool not found")

      const sessions = yield* Session.Service
      const session = yield* sessions.create({ agent: "maestro" })
      const exit = yield* tool
        .execute(
          { name: "missing-skill" },
          {
            ...baseCtx,
            sessionID: session.id,
            ask: () => Effect.void,
          },
        )
        .pipe(Effect.exit)

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const error = Cause.squash(exit.cause)
        expect(error).toBeInstanceOf(Error)
        if (error instanceof Error) expect(error.message).toContain('Skill "missing-skill" not found.')
      }
    }),
  )
})
