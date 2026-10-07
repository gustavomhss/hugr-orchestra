import { describe, expect } from "bun:test"
import { Cause, Effect } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Permission } from "@/permission"
import { Session } from "@/session/session"
import { MessageID } from "@/session/schema"
import { Skill } from "@/skill"
import { MaestroArsenalTools } from "@/tool/maestro-arsenal"
import { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { requireInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([FSUtil.node, Config.node, Agent.node, Skill.node, Permission.node, Session.node, Truncate.node]),
    [[RuntimeFlags.node, RuntimeFlags.layer({ pure: true, disableDefaultPlugins: true, disableExternalSkills: true })]],
  ),
)

describe("V1 Maestro Arsenal native identity", () => {
  it.instance("rejects display-name impersonation using the actual agent ID before catalog acquisition", () =>
    Effect.gen(function* () {
      const tools = yield* MaestroArsenalTools.tools
      const catalog = yield* Tool.init(tools[0])
      const sessions = yield* Session.Service
      const permission = yield* Permission.Service
      const agents = yield* Agent.Service
      const session = yield* sessions.create({ title: "arsenal identity", agent: "general" })
      const agent = yield* agents.get("general")
      const metadata: unknown[] = []
      const context: Tool.Context = {
        sessionID: session.id,
        messageID: MessageID.ascending(),
        agent: "maestro",
        agentID: "general",
        abort: new AbortController().signal,
        messages: [],
        metadata: (input) =>
          Effect.sync(() => {
            metadata.push(input)
          }),
        ask: (input) =>
          permission.ask({ ...input, sessionID: session.id, ruleset: agent.permission }).pipe(Effect.orDie),
      }
      const failure = yield* catalog.execute({}, context).pipe(Effect.exit)
      expect(failure._tag).toBe("Failure")
      if (failure._tag !== "Failure") throw new Error("native identity was not checked")
      expect(Cause.pretty(failure.cause)).toContain("requires native Maestro identity")
      expect(metadata).toEqual([])
      expect(yield* permission.list()).toEqual([])
    }),
  )

  it.instance(
    "uses real V1 permission denial before package loading",
    () =>
      Effect.gen(function* () {
        const instance = yield* requireInstance
        expect(instance.project.id.length).toBeGreaterThan(0)
        const tools = yield* MaestroArsenalTools.tools
        const catalog = yield* Tool.init(tools[0])
        const sessions = yield* Session.Service
        const permission = yield* Permission.Service
        const agents = yield* Agent.Service
        const session = yield* sessions.create({ title: "arsenal denied", agent: "maestro" })
        const agent = yield* agents.get("maestro")
        expect(agent.id).toBe("maestro")
        expect(agent.native).toBe(true)
        const context: Tool.Context = {
          sessionID: session.id,
          messageID: MessageID.ascending(),
          agent: "maestro",
          agentID: "maestro",
          abort: new AbortController().signal,
          messages: [],
          metadata: () => sessions.get(session.id).pipe(Effect.asVoid, Effect.orDie),
          ask: (input) =>
            permission.ask({ ...input, sessionID: session.id, ruleset: agent.permission }).pipe(Effect.orDie),
        }
        const failure = yield* catalog.execute({}, context).pipe(Effect.exit)
        expect(failure._tag).toBe("Failure")
        if (failure._tag !== "Failure") throw new Error("native permission was not checked")
        expect(Cause.pretty(failure.cause)).toContain("PermissionDeniedError")
      }),
    { config: { permission: { maestro_arsenal_catalog: "deny" } } },
  )
})
