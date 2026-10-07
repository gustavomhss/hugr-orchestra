// Requires the real assembled package; no substitute validator or handler.
import { expect } from "bun:test"
import { Cause, Effect, Schema } from "effect"
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
import { testEffect } from "../lib/effect"

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([FSUtil.node, Config.node, Agent.node, Skill.node, Permission.node, Session.node, Truncate.node]),
    [[RuntimeFlags.node, RuntimeFlags.layer({ pure: true, disableDefaultPlugins: true, disableExternalSkills: true })]],
  ),
)

it.instance(
  "V1 Arsenal package conformance: fitting schema is exact; invalid and denied inputs leave state intact",
  () =>
    Effect.gen(function* () {
      const { Arsenal } = yield* Effect.promise(() => import("@opencode-ai/maestro-arsenal"))
      const stateDirectory = yield* MaestroArsenalTools.prepare
      const native = yield* MaestroArsenalTools.tools
      const catalog = yield* Tool.init(native[0])
      const describe = yield* Tool.init(native[1])
      const execute = yield* Tool.init(native[2])
      const agents = yield* Agent.Service
      const sessions = yield* Session.Service
      const permission = yield* Permission.Service
      const fs = yield* FSUtil.Service
      const session = yield* sessions.create({ title: "native package", agent: "maestro" })
      const agent = yield* agents.get("maestro")
      const asks: string[] = []
      const context: Tool.Context = {
        sessionID: session.id,
        messageID: MessageID.ascending(),
        agent: "maestro",
        agentID: "maestro",
        callID: "native-package-conformance",
        abort: new AbortController().signal,
        messages: [],
        metadata: () => sessions.get(session.id).pipe(Effect.asVoid, Effect.orDie),
        ask: (input) =>
          Effect.sync(() => {
            asks.push(input.permission)
          }).pipe(
            Effect.andThen(permission.ask({ ...input, sessionID: session.id, ruleset: agent.permission })),
            Effect.orDie,
          ),
      }
      const page = yield* catalog.execute({ limit: 1 }, context)
      const descriptors = yield* Effect.promise(() => Arsenal.list())
      expect(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(page.output)).toMatchObject({
        total: descriptors.length,
        capabilities: [{ name: descriptors[0].name, effects: descriptors[0].effects }],
      })
      expect(page.output).not.toContain("inputSchema")
      const beforeDescribe = yield* execute.execute({ name: "profile", arguments: {} }, context).pipe(Effect.exit)
      expect(beforeDescribe._tag).toBe("Failure")
      if (beforeDescribe._tag !== "Failure") throw new Error("describe prerequisite was not enforced")
      expect(Cause.pretty(beforeDescribe.cause)).toContain(
        'call maestro_arsenal_describe with name "profile" first, then pass arguments that match its inputSchema',
      )
      const descriptor = yield* describe.execute({ name: "profile" }, context)
      expect(descriptor.metadata.truncated).toBe(false)
      expect(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(descriptor.output)).toEqual(
        yield* Effect.promise(() => Arsenal.describe("profile")),
      )
      const start = asks.length
      const invalid = yield* execute
        .execute({ name: "profile", arguments: { action: "set", patch: { scrutiny: "invalid" } } }, context)
        .pipe(Effect.exit)
      expect(invalid._tag).toBe("Failure")
      if (invalid._tag !== "Failure") throw new Error("invalid arguments were accepted")
      expect(Cause.pretty(invalid.cause)).toContain(
        "Arsenal capability failed (invalid_arguments): invalid arguments for profile: args.patch.scrutiny: value outside enum",
      )
      expect(asks.slice(start)).toEqual(["maestro_arsenal_execute"])
      expect(yield* fs.readDirectory(stateDirectory)).toEqual([])
      const denied = yield* execute
        .execute({ name: "profile", arguments: { action: "set", patch: { scrutiny: "strict" } } }, context)
        .pipe(Effect.exit)
      expect(denied._tag).toBe("Failure")
      expect(yield* fs.readDirectory(stateDirectory)).toEqual([])
      const read = yield* execute.execute({ name: "profile", arguments: { action: "get" } }, context)
      expect(read.metadata.truncated).toBe(false)
      expect(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(read.output)).toMatchObject({
        content: [{ type: "text" }],
      })
    }),
  { config: { permission: { edit: "deny" } } },
)

it.instance("V1 describe refuses over-budget contract before minting execution authority", () => Effect.gen(function* () {
  yield* MaestroArsenalTools.prepare
  const tools = yield* MaestroArsenalTools.tools
  const describe = yield* Tool.init(tools[1])
  const execute = yield* Tool.init(tools[2])
  const sessions = yield* Session.Service
  const agents = yield* Agent.Service
  const permission = yield* Permission.Service
  const session = yield* sessions.create({ agent: "maestro" })
  const agent = yield* agents.get("maestro")
  const context: Tool.Context = { sessionID: session.id, messageID: MessageID.ascending(), agent: "maestro", agentID: "maestro", callID: "budget", abort: new AbortController().signal, messages: [], metadata: () => Effect.void, ask: (request) => permission.ask({ ...request, sessionID: session.id, ruleset: agent.permission }).pipe(Effect.orDie) }
  const refused = yield* describe.execute({ name: "profile" }, context).pipe(Effect.exit)
  expect(refused._tag).toBe("Failure")
  if (refused._tag !== "Failure") throw new Error("Over-budget descriptor returned")
  expect(Cause.pretty(refused.cause)).toContain("DESCRIBE_CONTRACT_OVER_BUDGET")
  const blocked = yield* execute.execute({ name: "profile", arguments: { action: "get" } }, context).pipe(Effect.exit)
  expect(blocked._tag).toBe("Failure")
  if (blocked._tag !== "Failure") throw new Error("Refused describe minted authority")
  expect(Cause.pretty(blocked.cause)).toContain("Describe this Arsenal capability")
}), { config: { tool_output: { max_lines: 1, max_bytes: 1 } } })
