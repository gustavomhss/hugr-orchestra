import { afterEach, expect } from "bun:test"
import { Database } from "@orchestra/core/database/database"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionV1 } from "@orchestra/core/v1/session"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { Global } from "@orchestra/core/global"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { Ripgrep } from "@orchestra/core/ripgrep"
import { SessionProjector } from "@orchestra/core/session/projector"
import { Effect, Exit } from "effect"
import fs from "node:fs/promises"
import path from "node:path"
import type { Tool as AITool } from "ai"
import { Agent } from "@/agent/agent"
import { BackgroundJob } from "@/background/job"
import { Config } from "@/config/config"
import { EventV2Bridge } from "@/event-v2-bridge"
import { MCP } from "@/mcp"
import { Permission } from "@/permission"
import { Plugin } from "@/plugin"
import { Provider } from "@/provider/provider"
import { Session } from "@/session/session"
import { MessageID } from "@/session/schema"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { SessionTools } from "@/session/tools"
import { Skill } from "@/skill"
import { type TaskPromptOps } from "@/tool/task"
import { ToolRegistry } from "@/tool/registry"
import { Truncate } from "@/tool/truncate"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { backendSkills } from "@/maestro/roster"
import { Git } from "@/git"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(
  TestAppNodeBuilder.build(
    LayerNode.group([
      filesystem,
      Agent.node,
      BackgroundJob.node,
      Config.node,
      CrossSpawnSpawner.node,
      Database.node,
      EventV2Bridge.node,
      Git.node,
      MCP.node,
      Permission.node,
      Plugin.node,
      Ripgrep.node,
      RuntimeFlags.node,
      Session.node,
      SessionProjector.node,
      SessionRunState.node,
      SessionStatus.node,
      Skill.node,
      ToolRegistry.node,
      Truncate.node,
    ]),
  ),
)

const model = {
  providerID: ProviderV2.ID.make("test"),
  api: { id: "test-model" },
} as Provider.Model

const promptOps: TaskPromptOps = {
  cancel: () => Effect.void,
  resolvePromptParts: (template) => Effect.succeed([{ type: "text", text: template }]),
  prompt: () => Effect.die("no subagent prompt in this test"),
}

const resolve = (agent: Agent.Info) =>
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const directory = (yield* TestInstance).directory
    const session = yield* sessions.create({})
    const message: SessionV1.Assistant = {
      id: MessageID.ascending(),
      sessionID: session.id,
      parentID: MessageID.ascending(),
      role: "assistant",
      agent: agent.id ?? agent.name,
      mode: agent.id ?? agent.name,
      path: { cwd: directory, root: directory },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      modelID: ModelV2.ID.make("test-model"),
      providerID: ProviderV2.ID.make("test"),
      time: { created: Date.now() },
    }
    yield* sessions.updateMessage(message)
    return yield* SessionTools.resolve({
      agent,
      model,
      session,
      processor: { message, updateToolCall: () => Effect.succeed(undefined), completeToolCall: () => Effect.void },
      bypassAgentCheck: true,
      messages: [],
      promptOps,
    })
  })

const call = (tool: AITool | undefined, args: Record<string, unknown>) =>
  Effect.tryPromise(async () => {
    if (!tool?.execute) throw new Error("tool missing")
    return tool.execute(args, {
      toolCallId: `call_${Math.random().toString(36).slice(2)}`,
      abortSignal: new AbortController().signal,
      messages: [],
    })
  }).pipe(Effect.exit)

it.instance("backend loads its entry skill, reads a companion and cannot load another skill", () =>
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const skills = yield* Skill.Service
    const backend = yield* agents.get("backend")
    const tools = yield* resolve(backend)
    expect(tools.skill).toBeDefined()

    // Seat skills stay out of the instance-wide list and are offered only to the native seat.
    const listed = (yield* skills.all()).map((item) => item.name)
    expect(backendSkills.names.filter((name) => listed.includes(name))).toEqual([])
    expect((yield* skills.available(backend)).map((item) => item.name).toSorted()).toEqual(
      backendSkills.names.toSorted(),
    )
    const offeredToMaestro = (yield* skills.available(yield* agents.get("maestro"))).map((item) => item.name)
    expect(backendSkills.names.filter((name) => offeredToMaestro.includes(name))).toEqual([])

    const loaded = yield* call(tools.skill, { name: "backend-implement" })
    expect(Exit.isSuccess(loaded)).toBe(true)
    if (Exit.isSuccess(loaded)) {
      expect(JSON.stringify(loaded.value)).toContain(`<skill_content name=\\"backend-implement\\">`)
      // Compare against the JSON-escaped path: Windows separators are backslashes, which JSON doubles.
      expect(JSON.stringify(loaded.value)).toContain(JSON.stringify(path.join(backendSkills.root, "backend-implement")).slice(1, -1))
    }

    const reference = path.join(backendSkills.root, "backend-implement", "references", "continuity.md")
    const read = yield* call(tools.read, { filePath: reference })
    expect(Exit.isSuccess(read)).toBe(true)
    if (Exit.isSuccess(read)) expect(JSON.stringify(read.value)).toContain("continuity.md")

    const other = yield* call(tools.skill, { name: "maestro-governed" })
    expect(Exit.isFailure(other)).toBe(true)
    if (Exit.isFailure(other)) expect(String(other.cause)).toContain("PermissionDeniedError")

    // The root is readable, never writable. Clean up if a regression lets the write through.
    const probe = path.join(backendSkills.root, "write-probe.md")
    yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(probe, { force: true })))
    const write = yield* call(tools.write, { filePath: probe, content: "x" })
    expect(Exit.isFailure(write)).toBe(true)
    if (Exit.isFailure(write)) expect(String(write.cause)).toContain("PermissionDeniedError")
    expect(yield* Effect.promise(() => fs.exists(probe))).toBe(false)
  }),
)

it.instance("other native seats get no skill tool and no seat skills", () =>
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const skills = yield* Skill.Service
    for (const id of ["patty", "rosie", "lucy"]) {
      const agent = yield* agents.get(id)
      const tools = yield* resolve(agent)
      expect(tools.skill).toBeUndefined()
      expect(yield* skills.available(agent)).toEqual([])
    }
  }),
)

it.instance("native execution seats get a shell description without commit or tmp guidance", () =>
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    for (const id of ["backend", "patty", "rosie"]) {
      const description = (yield* resolve(yield* agents.get(id))).bash?.description ?? ""
      expect(description).toContain("Run a command in a fresh, non-interactive process.")
      expect(description).not.toContain("# Git and GitHub")
      expect(description).not.toContain("Commit, push or open a pull request")
      expect(description).not.toContain(Global.Path.tmp)
    }
    const maestro = (yield* resolve(yield* agents.get("maestro"))).bash?.description ?? ""
    expect(maestro).toContain("# Git and GitHub")
    expect(maestro).toContain(Global.Path.tmp)
  }),
)
