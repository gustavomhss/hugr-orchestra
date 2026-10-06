import { afterEach, expect } from "bun:test"
import { Database } from "@opencode-ai/core/database/database"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { filesystem } from "@opencode-ai/core/effect/app-node-platform"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { Cause, Effect, Exit } from "effect"
import { Agent } from "@/agent/agent"
import { BackgroundJob } from "@/background/job"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { roster } from "@/maestro/roster"
import { MCP } from "@/mcp"
import { Permission } from "@/permission"
import { Plugin } from "@/plugin"
import { scopeLinuxWorkspace } from "@/plugin/app-dock-linux"
import { Provider } from "@/provider/provider"
import { MessageID } from "@/session/schema"
import { Session } from "@/session/session"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { SessionTools } from "@/session/tools"
import { ToolRegistry } from "@/tool/registry"
import { Truncate } from "@/tool/truncate"
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
      ToolRegistry.node,
      Truncate.node,
    ]),
  ),
)

const model = {
  providerID: ProviderV2.ID.make("test"),
  api: { id: "test-model" },
} as Provider.Model

// The real Linux workspace agent, registered the way the App Dock plugin registers it.
const linux: { agent?: Record<string, Record<string, unknown>> } = {}
scopeLinuxWorkspace(linux)

// A truncated result either points at a saved file the agent can open with its real tools, or names no file at all.
it.instance(
  "every agent reads the saved output it is pointed at, and the rest are told to ask for less",
  () =>
    Effect.gen(function* () {
      const agents = yield* Agent.Service
      const truncate = yield* Truncate.Service
      const sessions = yield* Session.Service
      const directory = (yield* TestInstance).directory
      const session = yield* sessions.create({})
      const message: SessionV1.Assistant = {
        id: MessageID.ascending(),
        sessionID: session.id,
        parentID: MessageID.ascending(),
        role: "assistant",
        agent: "maestro",
        mode: "maestro",
        path: { cwd: directory, root: directory },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: ModelV2.ID.make("test-model"),
        providerID: ProviderV2.ID.make("test"),
        time: { created: Date.now() },
      }
      yield* sessions.updateMessage(message)
      const text = Array.from({ length: 3000 }, (_, i) => `line${i}`).join("\n")
      const access: Record<string, "read" | "narrow"> = {}

      for (const agent of yield* agents.list()) {
        const result = yield* truncate.output(text, {}, agent)
        if (!result.truncated) throw new Error("expected truncated")
        const tools = yield* SessionTools.resolve({
          agent,
          model,
          session,
          processor: { message, updateToolCall: () => Effect.succeed(undefined), completeToolCall: () => Effect.void },
          bypassAgentCheck: true,
          messages: [],
          promptOps: {} as never,
        })
        const run = (tool: string, args: Record<string, unknown>) => {
          const execute = tools[tool]?.execute
          if (!execute) return Effect.succeed(undefined)
          return Effect.promise(() =>
            execute(args, {
              toolCallId: `call_${agent.id}_${tool}`,
              abortSignal: new AbortController().signal,
              messages: [],
            }),
          ).pipe(Effect.exit)
        }
        const denied = (exit: Exit.Exit<unknown> | undefined) =>
          exit === undefined || (Exit.isFailure(exit) && Cause.pretty(exit.cause).includes("PermissionDeniedError"))

        // No seat may change or delete saved output, whether or not it may read it.
        if (roster.some((member) => member.memberId === agent.id && member.nativeProfile)) {
          expect(denied(yield* run("write", { filePath: result.outputPath, content: "changed" }))).toBe(true)
          expect(denied(yield* run("edit", { filePath: result.outputPath, oldString: "line0", newString: "x" }))).toBe(
            true,
          )
          expect(denied(yield* run("bash", { command: `rm "${result.outputPath}"`, description: "remove" }))).toBe(true)
        }

        if (!result.content.includes(result.outputPath)) {
          expect(result.content).toContain("do not look for a file")
          expect(result.content).not.toContain("`read`")
          expect(result.content).not.toContain("`grep`")
          // The hint is withheld only from agents that really cannot open the file.
          expect(denied(yield* run("read", { filePath: result.outputPath }))).toBe(true)
          access[agent.id ?? agent.name] = "narrow"
          continue
        }
        expect(result.content).toContain("Use `grep` to search the full content or `read` with offset/limit")
        const read = yield* run("read", { filePath: result.outputPath, offset: 2990, limit: 5 })
        if (!read || Exit.isFailure(read)) throw new Error(`${agent.id} cannot read the saved output it was pointed at`)
        expect(JSON.stringify(read.value)).toContain("line2990")
        const grep = yield* run("grep", { pattern: "line2999", path: result.outputPath })
        if (grep && Exit.isFailure(grep)) throw new Error(`${agent.id} cannot grep the saved output it was pointed at`)
        if (grep) expect(JSON.stringify(grep.value)).toContain("line2999")
        access[agent.id ?? agent.name] = "read"
      }

      expect(access).toEqual({
        maestro: "read",
        general: "read",
        explore: "read",
        lucy: "read",
        bobby: "read",
        billy: "read",
        jimmy: "read",
        frankie: "read",
        // Bash and edit seats: external access to the directory would also let them run commands and edit there.
        backend: "narrow",
        patty: "narrow",
        rosie: "narrow",
        // The Linux workspace agent's tools reach only the workspace.
        linux: "narrow",
        // Hidden agents hold no tools.
        compaction: "narrow",
        title: "narrow",
        summary: "narrow",
      })
    }),
  { config: linux },
)
