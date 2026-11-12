export * as HostFilesystem from "./host-filesystem"

import path from "node:path"
import fs from "node:fs/promises"
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { afterAll, expect } from "bun:test"
import type { HookInput, Options } from "@anthropic-ai/claude-agent-sdk"
import { eq } from "drizzle-orm"
import { Effect, Fiber, Layer, Queue, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { PermissionV2 } from "@orchestra/core/permission"
import { AppProcess } from "@orchestra/core/process"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { Prompt } from "@orchestra/core/session/prompt"
import { ExecutionHost } from "@orchestra/core/session/runner"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SessionTable } from "@orchestra/core/session/sql"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { SystemContext } from "@orchestra/core/system-context"
import { Harness } from "@orchestra/core/test/session-runner-harness"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { LLMClient } from "@orchestra/llm"
import { RequestExecutor } from "@orchestra/llm/route"
import { ClaudeCodeSDK } from "../../src/sdk"
import { ClaudeCodeHost } from "../../src/v2/host"
import { ClaudeCodeAccountFixture } from "./account"
import { ScriptedSDK } from "./scripted-sdk"

export function make() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "host-filesystem-")))
  const paths = {
    root,
    inside: path.join(root, "inside"),
    outside: path.join(root, "outside"),
    insideFile: path.join(root, "inside", "inside.txt"),
    restricted: path.join(root, "inside", "restricted.txt"),
    outsideFile: path.join(root, "outside", "sentinel.txt"),
    outsideSecond: path.join(root, "outside", "second.txt"),
  }
  mkdirSync(paths.inside)
  mkdirSync(paths.outside)
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  const agentID = AgentV2.ID.make("filesystem-host")
  const allow: PermissionV2.Ruleset = [{ action: "*", resource: "*", effect: "allow" }]
  const denyExternal: PermissionV2.Ruleset = [...allow, { action: "external_directory", resource: "*", effect: "deny" }]
  const fileTools = [
    { tool: "Read", field: "file_path", action: "read", kind: "directory" },
    { tool: "Write", field: "file_path", action: "edit", kind: "file" },
    { tool: "Edit", field: "file_path", action: "edit", kind: "file" },
    { tool: "MultiEdit", field: "file_path", action: "edit", kind: "file" },
    { tool: "NotebookEdit", field: "notebook_path", action: "edit", kind: "file" },
  ] as const
  const searchTools = [
    { tool: "Glob", action: "glob", pattern: "*.txt" },
    { tool: "Grep", action: "grep", pattern: "SENTINEL" },
  ] as const

  type Result = { hook: unknown; sdk: unknown; allow: boolean }
  const state = {
    options: [] as Options[],
    inputs: [] as Parameters<ExecutionHost.Turn["authorize"]>[0][],
    results: [] as Result[],
    observed: [] as string[],
    effects: 0,
    profile: undefined as ToolSafety.Profile | undefined,
    controller: new AbortController(),
    controllers: new Set<AbortController>(),
    during: async (_options: Options): Promise<void> => {
      throw new Error("Filesystem SDK scenario was not set")
    },
  }
  const controller = () => {
    const value = new AbortController()
    state.controllers.add(value)
    return value
  }

  const sdk = Layer.succeed(
    ClaudeCodeSDK.Service,
    ClaudeCodeSDK.Service.of({
      query: (input) => {
        if (!input.options) throw new Error("Expected actual host SDK options")
        const options = input.options
        const scripted = ScriptedSDK.query(input, state.options)
        const messages = (async function* () {
          const first = await scripted.next()
          await state.during(options)
          if (!first.done) yield first.value
          yield* scripted
        })()
        return Object.assign(messages, scripted)
      },
    }),
  )

  const hosts = Layer.effect(
    ExecutionHost.Service,
    ClaudeCodeHost.make.pipe(
      Effect.provide(ClaudeCodeAccountFixture.layer),
      Effect.provide(sdk),
      Effect.provideService(ClaudeCodeSDK.Environment, {}),
      Effect.map((host) =>
        ExecutionHost.Service.of({
          get: (engine) =>
            engine === host.id
              ? {
                  ...host,
                  stream: (turn) =>
                    host.stream({
                      ...turn,
                      authorize: (input) => {
                        // Observe and delegate the actual runner port; no permission implementation is replaced.
                        state.inputs.push(structuredClone(input))
                        return turn.authorize(input)
                      },
                    }),
                }
              : undefined,
        }),
      ),
    ),
  )

  const safetyNode = makeLocationNode({
    service: ToolSafety.Service,
    layer: Layer.effect(
      ToolSafety.Service,
      Effect.gen(function* () {
        const safety = yield* ToolSafety.make
        const bound = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
          effect.pipe(Effect.provideService(ToolSafety.RuntimeProfile, state.profile))
        return ToolSafety.Service.of({
          ...safety,
          before: (input) => bound(safety.before(input)),
          run: (input, effect, observe, outcome) => bound(safety.run(input, effect, observe, outcome)),
        })
      }),
    ),
    deps: [FSUtil.node, AppProcess.node, Global.node],
  })

  const it = Harness.make({
    client: LLMClient.layer.pipe(Layer.provide(RequestExecutor.fetchLayer)),
    models: SessionRunnerModel.layerWith(() => Effect.die("A Claude filesystem turn cannot resolve a native model")),
    hosts,
    echo: Layer.empty,
    systemContext: Harness.systemContextLayer,
    skillGuidance: Layer.succeed(
      SkillGuidance.Service,
      SkillGuidance.Service.of({ load: () => Effect.succeed(SystemContext.empty) }),
    ),
    directory: paths.inside,
    replacements: [
      // Last replacement restores the production node and its real Agent/Session/SQL dependencies over Harness's stub.
      [PermissionV2.node, PermissionV2.node],
      [Database.node, Database.layerFromPath(":memory:")],
      [
        Global.node,
        Global.layerWith({
          home: root,
          data: path.join(root, "data"),
          state: path.join(root, "state"),
          config: path.join(root, "config"),
          cache: path.join(root, "cache"),
        }),
      ],
      [ToolSafety.node, safetyNode],
    ],
  })

  const setup = (
    rules: PermissionV2.Ruleset = allow,
    sessionRules: PermissionV2.Ruleset = [],
    profile?: ToolSafety.Profile,
  ) =>
    Effect.gen(function* () {
      state.options.length = 0
      state.inputs.length = 0
      state.results.length = 0
      state.observed.length = 0
      state.effects = 0
      state.profile = profile
      state.controllers.clear()
      state.controller = controller()
      state.during = async () => {
        throw new Error("Filesystem SDK scenario was not set")
      }
      yield* Effect.promise(() =>
        Promise.all([
          Bun.write(paths.insideFile, "INSIDE"),
          Bun.write(paths.restricted, "RESTRICTED"),
          Bun.write(paths.outsideFile, "OUTSIDE SENTINEL"),
          Bun.write(paths.outsideSecond, "SECOND SENTINEL"),
        ]),
      )
      yield* Harness.setupAt(paths.inside)
      const agents = yield* AgentV2.Service
      yield* agents.transform((draft) =>
        draft.update(agentID, (agent) => {
          agent.engine = "claude-code"
          agent.mode = "primary"
          agent.permissions = [...rules]
        }),
      )
      const sessions = yield* SessionV2.Service
      yield* sessions.switchAgent({ sessionID: Harness.sessionID, agent: agentID })
      const database = yield* Database.Service
      yield* database.db
        .update(SessionTable)
        .set({
          permission: sessionRules.map((rule) => ({
            permission: rule.action,
            pattern: rule.resource,
            action: rule.effect,
          })),
        })
        .where(eq(SessionTable.id, Harness.sessionID))
        .run()
        .pipe(Effect.orDie)
      const permission = yield* PermissionV2.Service
      const execution = yield* SessionExecution.Service
      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          state.controllers.forEach((value) => value.abort())
          yield* permission.cancelSession(Harness.sessionID)
          yield* execution.interrupt(Harness.sessionID)
        }),
      )
      // Bootstrap control: the default stub dies here; a private/mismatched Agent graph returns deny.
      expect(
        yield* permission.evaluate({
          sessionID: Harness.sessionID,
          agent: agentID,
          action: "fixture_permission",
          resources: ["*"],
        }),
      ).toBe("allow")
      return sessions
    })

  const run = Effect.gen(function* () {
    const sessions = yield* SessionV2.Service
    yield* sessions.prompt({
      sessionID: Harness.sessionID,
      prompt: Prompt.make({ text: "Exercise the filesystem gate" }),
      resume: false,
    })
    yield* sessions.resume(Harness.sessionID)
    expect(state.options).toHaveLength(1)
    expect(state.options[0].settingSources).toEqual(["project"])
    expect(state.options[0].permissionMode).toBe("default")
    expect(state.options[0].systemPrompt).toMatchObject({ type: "preset", preset: "claude_code" })
  })

  const decodeHook = Schema.decodeUnknownSync(
    Schema.Struct({ hookSpecificOutput: Schema.Struct({ permissionDecision: Schema.Literals(["allow", "deny"]) }) }),
  )
  const decodeSdk = Schema.decodeUnknownSync(Schema.Struct({ behavior: Schema.Literals(["allow", "deny"]) }))

  async function gates(
    options: Options,
    input: {
      tool: string
      args: Readonly<Record<string, unknown>>
      id: string
      order?: "hook-first" | "sdk-first"
      signal?: AbortSignal
      effect?: () => Promise<unknown>
    },
  ) {
    const hook = options.hooks?.PreToolUse?.[0]?.hooks[0]
    const sdk = options.canUseTool
    if (!hook || !sdk) throw new Error("Actual host did not install both filesystem gates")
    const signal = input.signal ?? state.controller.signal
    const pre = () =>
      hook(
        {
          hook_event_name: "PreToolUse",
          tool_name: input.tool,
          tool_input: input.args,
          tool_use_id: input.id,
          session_id: "filesystem-sdk",
          transcript_path: "",
          cwd: paths.inside,
        } as HookInput,
        input.id,
        { signal },
      )
    const can = () => sdk(input.tool, input.args, { signal, toolUseID: input.id, requestId: input.id })
    // The second entry arrives while the first decision is pending, testing shared in-flight admission too.
    const pending = input.order === "sdk-first" ? { sdk: can(), hook: pre() } : { hook: pre(), sdk: can() }
    const completed = await Promise.all([pending.hook, pending.sdk])
    const result = { hook: completed[0], sdk: completed[1] }
    const allowed =
      decodeHook(result.hook).hookSpecificOutput.permissionDecision === "allow" &&
      decodeSdk(result.sdk).behavior === "allow"
    state.results.push({ ...result, allow: allowed })
    if (allowed) {
      state.effects++
      await input.effect?.()
    }
    return result
  }

  const requests = Effect.gen(function* () {
    const queue = yield* Queue.unbounded<PermissionV2.Request>()
    const events = yield* EventV2.Service
    const unsubscribe = yield* events.listen((event) => {
      if (event.type !== PermissionV2.Event.Asked.type) return Effect.void
      return Queue.offer(queue, Schema.decodeUnknownSync(PermissionV2.Request)(event.data)).pipe(Effect.asVoid)
    })
    yield* Effect.addFinalizer(() => unsubscribe)
    return queue
  })

  const write = (target: string) => async () => {
    await Bun.write(target, "SDK EFFECT")
  }
  const read = (target: string) => async () => {
    state.observed.push(await Bun.file(target).text())
  }
  const search = (target: string) => async () => {
    state.observed.push(...(await fs.readdir(target)))
  }

  const nextRequest = <A, E>(queue: Effect.Success<typeof requests>, running: Fiber.Fiber<A, E>) =>
    Effect.raceFirst(
      Queue.take(queue),
      Fiber.join(running).pipe(
        Effect.andThen(Effect.fail(new Error("SDK gate completed without the expected filesystem permission request"))),
      ),
    )

  const fileInput = (tool: string, target: unknown) => {
    if (tool === "Read") return { file_path: target }
    if (tool === "Write") return { file_path: target, content: "SDK EFFECT" }
    if (tool === "MultiEdit") return { file_path: target, edits: [{ old_string: "INSIDE", new_string: "SDK EFFECT" }] }
    if (tool === "NotebookEdit")
      return {
        notebook_path: target,
        cell_id: "cell-1",
        new_source: "SDK EFFECT",
        cell_type: "code",
        edit_mode: "replace",
      }
    return { file_path: target, old_string: "INSIDE", new_string: "SDK EFFECT" }
  }
  const allRefused = (count = 1) => {
    expect(state.results).toHaveLength(count)
    expect(state.results.every((result) => !result.allow)).toBe(true)
    state.results.forEach((result) => {
      expect(decodeHook(result.hook).hookSpecificOutput.permissionDecision).toBe("deny")
      expect(decodeSdk(result.sdk).behavior).toBe("deny")
    })
    expect(state.effects).toBe(0)
  }
  const externalResource = paths.outside.split(path.sep).join("/") + "/*"

  return {
    paths,
    agentID,
    allow,
    denyExternal,
    fileTools,
    searchTools,
    state,
    controller,
    it,
    setup,
    run,
    gates,
    requests,
    nextRequest,
    write,
    read,
    search,
    fileInput,
    allRefused,
    externalResource,
  }
}
