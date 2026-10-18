import path from "node:path"
import { Effect } from "effect"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { Database } from "@orchestra/core/database/database"
import { AppProcess } from "@orchestra/core/process"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { Permission } from "@/permission"
import { Git } from "@/git"
import { ArsenalObservations } from "@/maestro/arsenal-observations"
import { AtlasKnowledge } from "@/maestro/atlas-knowledge"
import { EventV2Bridge } from "@/event-v2-bridge"
import type { Tool } from "@/tool/tool"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { FSUtil } from "@orchestra/core/fs-util"
import { Npm } from "@orchestra/core/npm"
import { SessionProjector } from "@orchestra/core/session/projector"
import { Shell } from "@orchestra/core/shell"
import { Auth } from "@/auth"
import { Agent } from "@/agent/agent"
import { BackgroundProcess } from "@/background/process"
import { ClaudeHostProcess } from "@/claude-code/host/process-tool"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Plugin } from "@/plugin"
import { SessionRunState } from "@/session/run-state"
import { Session } from "@/session/session"
import { MessageID } from "@/session/schema"
import { Truncate } from "@/tool/truncate"
import { AuthTest } from "../../fake/auth"
import { NpmTest } from "../../fake/npm"
import { TestInstance } from "../../fixture/fixture"

// The same layer as the shell tool's adoption tests: the process tool feeds the same BackgroundProcess registry.
export const layer = AppNodeBuilder.build(
  LayerNode.group([
    BackgroundProcess.node,
    Session.node,
    SessionProjector.node,
    SessionRunState.node,
    AppProcess.node,
    LocationServiceMap.node,
    Permission.node,
    Git.node,
    ArsenalObservations.node,
    AtlasKnowledge.node,
    Database.node,
    EventV2Bridge.node,
    CrossSpawnSpawner.node,
    FSUtil.node,
    Plugin.node,
    Truncate.node,
    Config.node,
    Agent.node,
    RuntimeFlags.node,
  ]),
  [
    [Auth.node, AuthTest.empty],
    [Npm.node, NpmTest.noop],
    [RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true })],
  ],
)

export const fixture = Effect.gen(function* () {
  const instance = yield* TestInstance
  const fs = yield* FSUtil.Service
  const sessions = yield* Session.Service
  const processes = yield* BackgroundProcess.Service
  const session = yield* sessions.create({})
  yield* Effect.addFinalizer(() => sessions.remove(session.id).pipe(Effect.ignore))
  const tool = yield* Effect.flatMap(ClaudeHostProcess.ProcessTool, (info) => info.init())
  const asks: { permission: string; patterns: readonly string[] }[] = []
  const streamed: unknown[] = []
  const context = (agent = "maestro", callID = MessageID.ascending()): Tool.Context => ({
    sessionID: session.id,
    messageID: MessageID.make("msg_host_process"),
    callID,
    agent,
    agentID: agent,
    abort: new AbortController().signal,
    messages: [],
    metadata: (input) =>
      Effect.sync(() => {
        streamed.push(input.metadata?.output)
      }),
    ask: (request) =>
      Effect.sync(() => {
        asks.push({ permission: request.permission, patterns: request.patterns })
      }),
  })
  const call = (
    params: typeof ClaudeHostProcess.Parameters.Type,
    options?: { agent?: string; profile?: ToolSafety.Profile; ctx?: Tool.Context },
  ) =>
    tool
      .execute(params, options?.ctx ?? context(options?.agent))
      .pipe(Effect.provideService(ToolSafety.RuntimeProfile, options?.profile))
  const node = Effect.fnUntraced(function* (name: string, source: string) {
    const file = path.join(instance.directory, name)
    yield* fs.writeFileString(file, source)
    const ps = Shell.ps(Shell.acceptable())
    return `${ps ? "& " : ""}"${process.execPath.replaceAll("\\", "/")}" "${file.replaceAll("\\", "/")}"${ps ? "; exit $LASTEXITCODE" : ""}`
  })
  return { directory: instance.directory, fs, session, processes, call, context, asks, streamed, node }
})

export * as ProcessFixture from "./process-fixture"
