import { ModelsDev } from "@orchestra/core/models-dev"
import { ClaudeCode } from "@/claude-code/engine"
import { ClaudeHost } from "@/claude-code/host/session"
import { InstanceStore } from "@/project/instance-store"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { FSUtil } from "@orchestra/core/fs-util"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { Ripgrep } from "@orchestra/core/ripgrep"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionExecutionLocal } from "@orchestra/core/session/execution/local"
import { Effect, Layer } from "effect"
import { Agent } from "../../src/agent/agent"
import { BackgroundJob } from "../../src/background/job"
import { Command } from "../../src/command"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Env } from "../../src/env"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { Format } from "../../src/format"
import { Git } from "../../src/git"
import { Image } from "../../src/image/image"
import { LSP } from "../../src/lsp/lsp"
import { MCP } from "../../src/mcp"
import { Permission } from "../../src/permission"
import { Plugin } from "../../src/plugin"
import { Provider } from "../../src/provider/provider"
import { Question } from "../../src/question"
import { SessionCompaction } from "../../src/session/compaction"
import { Instruction } from "../../src/session/instruction"
import { LLM } from "../../src/session/llm"
import { MessageV2 } from "../../src/session/message-v2"
import { SessionProcessor } from "../../src/session/processor"
import { SessionPrompt } from "../../src/session/prompt"
import { SessionRevert } from "../../src/session/revert"
import { SessionRunState } from "../../src/session/run-state"
import { Session } from "../../src/session/session"
import { SessionStatus } from "../../src/session/status"
import { SessionSummary } from "../../src/session/summary"
import { SystemPrompt } from "../../src/session/system"
import { Todo } from "../../src/session/todo"
import { Skill } from "../../src/skill"
import { Snapshot } from "../../src/snapshot"
import { ToolRegistry } from "../../src/tool/registry"
import { Truncate } from "../../src/tool/truncate"
import { TestLLMServer } from "../lib/llm-server"
import { SessionContinuity } from "@/continuity/service"
import { Archive } from "@/continuity/archive"
import { EffectFlock } from "@orchestra/core/util/effect-flock"
import { AppProcess } from "@orchestra/core/process"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { ArsenalObservations } from "@/maestro/arsenal-observations"

const summary = Layer.succeed(
  SessionSummary.Service,
  SessionSummary.Service.of({
    summarize: () => Effect.void,
    diff: () => Effect.succeed([]),
    computeDiff: () => Effect.succeed([]),
  }),
)

function makeMcp(instructions: MCP.ServerInstructions[] = []) {
  return Layer.succeed(
    MCP.Service,
    MCP.Service.of({
      status: () => Effect.succeed({}),
      clients: () => Effect.succeed({}),
      instructions: () => Effect.succeed(instructions),
      tools: () => Effect.succeed({}),
      catalog: () => Effect.succeed({}),
      prompts: () => Effect.succeed({}),
      resources: () => Effect.succeed({}),
      resourceTemplates: () => Effect.succeed({}),
      add: () => Effect.succeed({ status: { status: "disabled" as const } }),
      connect: () => Effect.void,
      disconnect: () => Effect.void,
      getPrompt: () => Effect.succeed(undefined),
      readResource: () => Effect.succeed(undefined),
      startAuth: () => Effect.die("unexpected MCP auth in prompt-effect tests"),
      authenticate: () => Effect.die("unexpected MCP auth in prompt-effect tests"),
      finishAuth: () => Effect.die("unexpected MCP auth in prompt-effect tests"),
      removeAuth: () => Effect.void,
      supportsOAuth: () => Effect.succeed(false),
      hasStoredTokens: () => Effect.succeed(false),
      getAuthStatus: () => Effect.succeed("not_authenticated" as const),
    }),
  )
}

const lsp = Layer.succeed(
  LSP.Service,
  LSP.Service.of({
    discoveryQuery: () => Effect.die(new Error("Native semantic queries require a real LSP fixture")),
    init: () => Effect.void,
    status: () => Effect.succeed([]),
    hasClients: () => Effect.succeed(false),
    touchFile: () => Effect.void,
    diagnostics: () => Effect.succeed({}),
    hover: () => Effect.succeed(undefined),
    definition: () => Effect.succeed([]),
    references: () => Effect.succeed([]),
    implementation: () => Effect.succeed([]),
    documentSymbol: () => Effect.succeed([]),
    workspaceSymbol: () => Effect.succeed([]),
    prepareCallHierarchy: () => Effect.succeed([]),
    incomingCalls: () => Effect.succeed([]),
    outgoingCalls: () => Effect.succeed([]),
  }),
)

export const processorCreateStarted: Array<() => void> = []

const blockingProcessor = Layer.succeed(
  SessionProcessor.Service,
  SessionProcessor.Service.of({
    create: () => Effect.sync(() => processorCreateStarted.shift()?.()).pipe(Effect.andThen(Effect.never)),
  }),
)

const promptRoot = LayerNode.group([
  ClaudeCode.node,
  ClaudeHost.node,
  InstanceStore.node,
  ModelsDev.node,
  SessionPrompt.node,
  Session.node,
  SessionProjector.node,
  SessionSubagentModels.node,
  SessionV2.node,
  SessionExecution.node,
  MessageV2.node,
  Snapshot.node,
  LLM.node,
  Env.node,
  Agent.node,
  Command.node,
  Permission.node,
  Plugin.node,
  Config.node,
  Provider.node,
  LSP.node,
  MCP.node,
  FSUtil.node,
  BackgroundJob.node,
  SessionStatus.node,
  SessionRunState.node,
  Database.node,
  EventV2Bridge.node,
  Question.node,
  Todo.node,
  ToolRegistry.node,
  Skill.node,
  Git.node,
  Ripgrep.node,
  Format.node,
  Truncate.node,
  SessionProcessor.node,
  Image.node,
  SessionCompaction.node,
  SessionRevert.node,
  Instruction.node,
  SystemPrompt.node,
  CrossSpawnSpawner.node,
  SessionContinuity.node,
  Archive.node,
  EffectFlock.node,
  RuntimeFlags.node,
  // Real per-Session MCP runtime bindings, exposed alongside the host for integration tests.
  AppProcess.node,
  LocationServiceMap.node,
  filesystem,
  ArsenalObservations.node,
])

function replacements(input?: { mcpInstructions?: MCP.ServerInstructions[]; realSummary?: boolean }) {
  return [
    ...(input?.realSummary ? [] : [[SessionSummary.node, summary] as const]),
    [LSP.node, lsp],
    [MCP.node, makeMcp(input?.mcpInstructions)],
    [RuntimeFlags.node, RuntimeFlags.layer({ experimentalEventSystem: true })],
    [SessionExecution.node, SessionExecutionLocal.node],
  ] as const
}

function makePrompt(input?: { mcpInstructions?: MCP.ServerInstructions[]; processor?: "blocking" }) {
  const layers = replacements(input)
  if (input?.processor === "blocking") {
    return TestAppNodeBuilder.build(promptRoot, [...layers, [SessionProcessor.node, blockingProcessor]])
  }
  return TestAppNodeBuilder.build(promptRoot, layers)
}

export function makeHttp(input?: {
  realSummary?: boolean
  mcpInstructions?: MCP.ServerInstructions[]
  processor?: "blocking"
  replacements?: LayerNode.Replacements
}) {
  const root = LayerNode.group([
    promptRoot,
    LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] }),
  ])
  const layers = [...replacements(input), ...(input?.replacements ?? [])]
  if (input?.processor === "blocking") {
    return TestAppNodeBuilder.build(root, [...layers, [SessionProcessor.node, blockingProcessor]])
  }
  return TestAppNodeBuilder.build(root, layers)
}

export function makeHttpNoLLMServer(input?: { mcpInstructions?: MCP.ServerInstructions[]; processor?: "blocking" }) {
  return makePrompt(input)
}
