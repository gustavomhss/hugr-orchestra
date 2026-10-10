import { expect } from "bun:test"
import { createHash } from "node:crypto"
import path from "node:path"
import { Effect } from "effect"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionV1 } from "@orchestra/core/v1/session"
import { LeanMetrics } from "@orchestra/schema/lean-metrics"
import { LeanEngine } from "@orchestra/schema/lean-engine"
import { Agent } from "../../src/agent/agent"
import { Config } from "../../src/config/config"
import { InstanceRef } from "../../src/effect/instance-ref"
import { roster } from "../../src/maestro/roster"
import { Provider } from "../../src/provider/provider"
import { Plugin } from "../../src/plugin"
import { ToolModelCapture } from "@orchestra/core/tool/model-capture"
import { LeanProfilePreferences } from "../../src/session/lean-profile-preferences"
import { Session } from "../../src/session/session"
import { SessionProcessor } from "../../src/session/processor"
import { SessionTools } from "../../src/session/tools"
import { MessageID } from "../../src/session/schema"
import { ToolRegistry } from "../../src/tool/registry"
import { LegacyLeanCapture } from "../../src/tool/lean-capture"
import { TestLLMServer } from "../lib/llm-server"

/** Actual native registry, backend actor, processor, provider and injected private preference store. */
export const fixture = Effect.fnUntraced(function* (globalEnabled = true, store?: Global.Interface, observe = false) {
  const instance = yield* InstanceRef
  if (!instance) throw new Error("Native Session fixture instance missing")
  const fs = yield* FSUtil.Service
  const llm = yield* TestLLMServer
  const owner = { projectID: instance.project.id, directory: instance.directory }
  const global = store ?? Global.make({ data: path.join(owner.directory, ".lean-data"), state: path.join(owner.directory, ".lean-state") })
  const root = path.join(global.data, "lean", "profiles")
  const reads: string[] = []
  const injected: FSUtil.Interface = {
    ...fs,
    // If preferences rebind through realPath, this native owner would be lost. Native leaf services retain actual FS.
    realPath: (file) => file === owner.directory ? Effect.succeed(path.dirname(owner.directory)) : fs.realPath(file),
    open: (file, options) => {
      if (file.startsWith(root) && options?.flag === "r") reads.push(file)
      return fs.open(file, options)
    },
  }
  yield* Effect.promise(async () => {
    await Bun.write(path.join(owner.directory, "orchestra.json"), JSON.stringify({
      model: "test/test-model", tool_output: { lean: { enabled: globalEnabled } },
      provider: { test: { name: "Test", id: "test", env: [], npm: "@ai-sdk/openai-compatible",
        models: { "test-model": { id: "test-model", name: "Test Model", attachment: false, reasoning: false,
          temperature: false, tool_call: true, release_date: "2025-01-01", limit: { context: 100000, output: 10000 },
          cost: { input: 0, output: 0 }, options: {} } }, options: { apiKey: "synthetic-key", baseURL: llm.url } } },
    }))
    await Bun.write(path.join(owner.directory, "go.mod"), "module example.test\n\ngo 1.20\n")
    await Bun.write(path.join(owner.directory, "native_test.go"), `package example\nimport "testing"\n${Array.from({ length: 30 }, (_, i) =>
      `func TestCase${i}(t *testing.T) {}`).join("\n")}\n`)
  })
  const config = yield* Config.Service
  expect((yield* config.get()).tool_output?.lean?.enabled).toBe(globalEnabled)
  const sessions = yield* Session.Service
  const session = yield* sessions.create({ permission: [{ permission: "*", pattern: "*", action: "allow" }] })
  const agents = yield* Agent.Service
  const agent = yield* agents.get("backend")
  expect(agent.native).toBe(true)
  expect(agent.id).toBe("backend")
  const providers = yield* Provider.Service
  const model = yield* providers.getModel(ProviderV2.ID.make("test"), ModelV2.ID.make("test-model"))
  const assistant: SessionV1.Assistant = {
    id: MessageID.ascending(), sessionID: session.id, role: "assistant", parentID: MessageID.ascending(),
    agent: "backend", mode: "backend", path: { cwd: owner.directory, root: instance.worktree },
    cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: ModelV2.ID.make(model.api.id), providerID: model.providerID, time: { created: Date.now() },
  }
  yield* sessions.updateMessage(assistant)
  const processors = yield* SessionProcessor.Service
  const processor = yield* processors.create({ assistantMessage: assistant, sessionID: session.id, model })
  const registry = yield* ToolRegistry.Service
  const plugin = yield* Plugin.Service
  const captures: ToolModelCapture.Binding[] = []
  const approved: LegacyLeanCapture.Output[] = []
  // Read-only taps retain the real executor and every default hook's approval mapping.
  const observer: Plugin.Interface = { ...plugin, trigger: (name, input, output) =>
    plugin.trigger(name, input, output).pipe(Effect.tap(() => Effect.sync(() => {
      if (observe && name === "tool.execute.after") approved.push(structuredClone(output) as LegacyLeanCapture.Output)
    }))),
  }
  // Same native-host registration view used by SessionNativeTools; executors and capabilities stay real.
  const tools = yield* SessionTools.resolve({ agent, model, session, processor, messages: [],
    bypassAgentCheck: false, promptOps: {} as never }).pipe(
    Effect.provideService(ToolRegistry.Service, { ...registry, tools: (request) =>
      registry.tools({ ...request, durableSafety: false }).pipe(Effect.map((items) => items.map((item) =>
        !observe || item.id !== "bash" ? item : { ...item, execute: (args, ctx) => item.execute(args, ctx).pipe(
          Effect.tap((output) => Effect.sync(() => {
            const capture = ctx.callID && LegacyLeanCapture.bind(output, output, { sessionID: ctx.sessionID, callID: ctx.callID })
            if (!capture) throw new Error("Actual same-call native capture missing")
            captures.push(capture)
          })),
        ) },
      ))),
    }),
    Effect.provideService(Plugin.Service, observer),
    Effect.provideService(FSUtil.Service, injected), Effect.provideService(Global.Service, global),
  )
  const execute = tools.bash?.execute
  if (!execute) throw new Error("Actual native bash executor missing")
  const preferences = LeanProfilePreferences.make(injected, global)
  const profileID = createHash("sha256").update(JSON.stringify([owner.projectID, owner.directory])).digest("hex")
  const file = path.join(root, `${profileID}.json`)
  const invoke = Effect.fnUntraced(function* (command = "go test -v .", callID = "native-call") {
    const start = reads.length
    const observed = captures.length
    const after = approved.length
    const output = yield* Effect.promise(async () => {
      const result = await execute({ command, workdir: owner.directory, timeout: 120000 }, {
        toolCallId: callID, abortSignal: AbortSignal.any([]), messages: [],
      })
      if (!result || typeof result !== "object" || !("output" in result) || typeof result.output !== "string"
        || !("metadata" in result) || typeof result.metadata !== "object" || result.metadata === null)
        throw new Error("Actual native settled output missing")
      return result as LegacyLeanCapture.Output
    })
    expect(reads.slice(start)).toEqual([file])
    expect(output.metadata.exit).toBe(0)
    expect(output.metadata.truncated).toBe(false)
    expect(output.metadata.timeout).toBe(false)
    expect(output.metadata.aborted).toBe(false)
    const metric = LeanMetrics.decode(output.metadata.lean)
    if (!metric) throw new Error(`Actual native metric missing: ${JSON.stringify(output.metadata)}`)
    expect(metric.engine).toBe(LeanEngine.current)
    expect(metric.owner).toEqual({ projectID: owner.projectID, location: owner.directory, sessionID: session.id, callID })
    expect(metric.producer).toBe("native-shell")
    expect(metric.eligible).toBe(true)
    expect(metric.orchestraProfile).not.toBe(roster.find((member) => member.memberId === "backend")?.nativeProfile)
    expect(yield* llm.hits).toEqual([])
    const capture = observe ? captures[observed] : undefined
    const raw = observe ? approved[after] : undefined
    if (observe) {
      expect(captures.length - observed).toBe(1)
      expect(approved.length - after).toBe(1)
      if (!capture || !raw) throw new Error("Actual same-call raw observer missing")
      expect(ToolModelCapture.authentic(capture.candidate)).toBe(true)
      expect(capture.candidate.owner).toEqual({ sessionID: session.id, callID })
      expect(capture.candidate.observation.command).toBe(command)
      expect(capture.candidate.observation.output).toBe(raw.output)
      expect(LegacyLeanCapture.model(raw)).toEqual(capture.baseline)
      const { lean, ...metadata } = output.metadata
      expect(metadata).toEqual(raw.metadata)
      expect(output.title).toBe(raw.title)
      expect(output.attachments).toEqual(raw.attachments)
      expect(metric.bytes).toEqual({ before: Buffer.byteLength(raw.output, "utf8"),
        after: Buffer.byteLength(output.output, "utf8"), saved: Buffer.byteLength(raw.output, "utf8") - Buffer.byteLength(output.output, "utf8") })
      if (metric.status === "passthrough") expect(output.output).toBe(raw.output)
    }
    return { output, metric, capture, raw }
  })
  return { owner, global, fs, preferences, file, profileID, invoke, reads }
})
