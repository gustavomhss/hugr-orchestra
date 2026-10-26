import path from "path"
import { describe, expect } from "bun:test"
import { LLMClient, LLMEvent, type LLMClientShape } from "@orchestra/llm"
import { AgentV2 } from "@orchestra/core/agent"
import { Config } from "@orchestra/core/config"
import { PermissionV2 } from "@orchestra/core/permission"
import { SessionV2 } from "@orchestra/core/session"
import { Prompt } from "@orchestra/core/session/prompt"
import { ExecutionHost } from "@orchestra/core/session/runner"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { SystemContext } from "@orchestra/core/system-context"
import { ConfigMCP } from "@orchestra/schema/config-mcp"
import { Effect, Layer, Stream } from "effect"
import { expectSpawn } from "./fixture/omni-expect"
import { Harness, sessionID } from "./session-runner-harness"

// A configured MCP server's tools reach a hosted turn: the runner starts the Location's MCP servers before it
// materializes the agent's tools, so an execution host such as Claude Code serves them with the Orchestra tools.

const fixture = path.join(import.meta.dir, "fixture", "mcp-omni-stdio.ts")
const seen: string[][] = []

const host: ExecutionHost.Interface = {
  id: "claude-code",
  stateKey: "claudeCode",
  stream: (turn) =>
    Stream.unwrap(
      Effect.sync(() => {
        seen.push(turn.tools.map((tool) => tool.name))
        return Stream.make(LLMEvent.stepStart({ index: 0 }), LLMEvent.stepFinish({ index: 0, reason: "stop" }))
      }),
    ),
}

const it = Harness.make({
  client: Layer.succeed(
    LLMClient.Service,
    LLMClient.Service.of({
      prepare: () => Effect.die("unused"),
      stream: (() => Stream.die("a hosted turn must not call llm.stream")) as unknown as LLMClientShape["stream"],
      generate: () => Effect.die("unused"),
    }),
  ),
  models: SessionRunnerModel.layerWith(() => Effect.die("a hosted turn must not resolve a model")),
  echo: Layer.empty,
  permissions: Layer.mock(PermissionV2.Service, { authorize: () => Effect.void }),
  systemContext: Harness.systemContextLayer,
  skillGuidance: Layer.mock(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) }),
  hosts: Layer.succeed(ExecutionHost.Service, ExecutionHost.of([host])),
  config: Layer.succeed(
    Config.Service,
    Config.Service.of({
      entries: () =>
        Effect.succeed([
          new Config.Document({
            type: "document",
            info: new Config.Info({
              compaction: Harness.compaction,
              mcp: new ConfigMCP.Info({
                servers: {
                  fixture: new ConfigMCP.Local({
                    type: "local",
                    command: [process.execPath, fixture, "probe"],
                    cwd: import.meta.dir,
                  }),
                },
              }),
            }),
          }),
        ]),
    }),
  ),
})

describe("SessionRunner execution host with MCP", () => {
  it.live(
    "offers a configured MCP server's tools to the host's turn",
    () =>
      Effect.gen(function* () {
        expectSpawn(import.meta.path)
        yield* Harness.setup
        const agents = yield* AgentV2.Service
        yield* agents.transform((draft) =>
          draft.update(AgentV2.defaultID, (agent) => {
            agent.engine = "claude-code"
            agent.mode = "primary"
          }),
        )
        const session = yield* SessionV2.Service
        yield* session.prompt({ sessionID, prompt: Prompt.make({ text: "Use the MCP tool" }), resume: false })
        yield* session.resume(sessionID)

        expect(seen).toHaveLength(1)
        expect(seen[0]).toContain("fixture_probe")
      }),
    30_000,
  )
})
