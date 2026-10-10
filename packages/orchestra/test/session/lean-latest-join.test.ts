import { expect } from "bun:test"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { Effect } from "effect"
import type { ToolContext } from "@orchestra/plugin"
import { Global } from "@orchestra/core/global"
import { SessionV1 } from "@orchestra/core/v1/session"
import { ToolModelCapture } from "@orchestra/core/tool/model-capture"
import { LeanMetrics } from "@orchestra/schema/lean-metrics"
import { Agent } from "@/agent/agent"
import { Plugin } from "@/plugin"
import { Provider } from "@/provider/provider"
import { SessionProcessor } from "@/session/processor"
import { PartID } from "@/session/schema"
import { SessionTools } from "@/session/tools"
import { LegacyLeanCapture } from "@/tool/lean-capture"
import { ToolRegistry } from "@/tool/registry"
import { TestLLMServer } from "../lib/llm-server"
import { testEffect } from "../lib/effect"
import { fixture, model, pluginOptions } from "../tool/plugin-binding.fixture"
import { makeHttp } from "./prompt.fixture"

// Typed against the current plugin API, then loaded through the actual plugin adapter in CI.
async function compileBody(args: { filePath: string; nested: { marker: string } }, context: ToolContext) {
  await context.metadata({ title: "checked plugin progress", metadata: {
    receipt: "MUST_KEEP 😀", nested: args.nested,
    toolSafety: { outcome: "spoof", callID: "spoof" },
  } })
  return { output: "=== RUN   Plugin😀\n--- PASS: Plugin😀 (0.00s)\nPASS\n", metadata: {
    binding: context.binding, callID: context.callID,
    frozen: Object.isFrozen(args) && Object.isFrozen(args.nested),
    mutation: Reflect.set(args.nested, "marker", "changed"),
    producer: "native-shell", exit: 0, timeout: false, aborted: false,
  } }
}

const sdk = pathToFileURL(path.resolve(import.meta.dir, "../../../plugin/src/tool.ts")).href
const loaded = pluginOptions(`import { tool } from ${JSON.stringify(sdk)}
export default async () => ({ tool: { read: tool({
  description: "binding probe",
  args: { filePath: tool.schema.string(), nested: tool.schema.object({ marker: tool.schema.string() }).default({ marker: "checked" }) },
  execute: ${compileBody.toString()},
}) } })`)
const options = { ...loaded, init: (directory: string) => Effect.gen(function* () {
  yield* loaded.init(directory)
  const llm = yield* TestLLMServer
  yield* Effect.promise(() => Bun.write(path.join(directory, "orchestra.json"), JSON.stringify({
    agent: { backend: { name: "Copper" } }, plugin: [path.join(directory, "binding-plugin.ts")],
    provider: { test: { npm: "@ai-sdk/openai-compatible", name: "Test", options: { baseURL: llm.url, apiKey: "test" },
      models: { "test-model": { name: "Test", limit: { context: 100000, output: 10000 } } } } },
  })))
}) }
const it = testEffect(makeHttp())

for (const status of ["pending", "running", "completed", "error"] as const) {
  it.instance(`latest SessionTools host observation preserves ${status} through checked plugin args`, () => Effect.gen(function* () {
    const f = yield* fixture
    const agents = yield* Agent.Service
    const agent = yield* agents.get("backend")
    const providers = yield* Provider.Service
    const selected = yield* providers.getModel(model.providerID, model.modelID)
    const message: SessionV1.Assistant = {
      id: f.context.messageID, sessionID: f.child.id, role: "assistant", parentID: f.context.messageID,
      agent: "backend", mode: "backend", path: { cwd: f.child.directory, root: f.instance.worktree },
      cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      modelID: model.modelID, providerID: model.providerID, time: { created: 1 },
    }
    yield* f.sessions.updateMessage(message)
    const input = { filePath: f.args.filePath }
    const state: SessionV1.ToolState = status === "pending" ? { status, input, raw: "raw" }
      : status === "running" ? { status, input, title: "old progress", metadata: { receipt: "old" }, time: { start: 7 } }
        : status === "completed" ? { status, input, title: "terminal", output: "TERMINAL MUST_KEEP 😀",
          metadata: { receipt: "terminal", exit: 9, truncated: true }, time: { start: 7, end: 11, compacted: 13 } }
          : { status, input, error: "TERMINAL FAILURE MUST_KEEP 😀", metadata: { receipt: "terminal", timeout: true }, time: { start: 7, end: 11 } }
    const part: SessionV1.ToolPart = {
      id: PartID.ascending(), sessionID: f.child.id, messageID: message.id,
      type: "tool", tool: "read", callID: f.context.callID!, state,
    }
    yield* f.sessions.updatePart(part)
    const updates: SessionV1.ToolPart[] = []
    // Only the processor storage callback is adapted; SessionTools, registry, plugin and Session storage stay real.
    const processor: Pick<SessionProcessor.Handle, "message" | "updateToolCall" | "completeToolCall"> = {
      message,
      updateToolCall: (callID, update) => Effect.gen(function* () {
        expect(callID).toBe(part.callID)
        const current = yield* f.sessions.getPart({ sessionID: part.sessionID, messageID: part.messageID, partID: part.id })
        if (!current || current.type !== "tool") throw new Error("stored join tool part missing")
        const next = update(current)
        updates.push(structuredClone(next))
        return yield* f.sessions.updatePart(next)
      }),
      completeToolCall: () => Effect.die(new Error("unexpected cancelled completion")),
    }
    const tools = yield* SessionTools.resolve({ agent, model: selected, session: f.child, processor,
      bypassAgentCheck: false, messages: [], promptOps: {} as never,
    }).pipe(Effect.provideService(Global.Service, Global.make({
      data: path.join(f.instance.directory, ".join-data"), state: path.join(f.instance.directory, ".join-state"),
    })))
    if (!tools.read?.execute) throw new Error("actual plugin executor missing")
    const result = yield* Effect.promise(() => tools.read.execute!(input, {
      toolCallId: part.callID, messages: [], abortSignal: new AbortController().signal,
    }))
    if (!result || typeof result !== "object" || !("metadata" in result) || !("output" in result)
      || typeof result.output !== "string" || !result.metadata || typeof result.metadata !== "object")
      throw new Error("actual plugin output missing")
    expect(result.output).toBe("=== RUN   Plugin😀\n--- PASS: Plugin😀 (0.00s)\nPASS\n")
    expect(result.metadata).toMatchObject({ frozen: true, mutation: false, exit: 0, timeout: false, aborted: false,
      binding: { memberId: "backend", executionSessionId: f.child.id, authoritySessionId: f.root.id,
        assistantMessageID: message.id, callID: part.callID, projectId: f.child.projectID },
    })
    const metric = LeanMetrics.decode("lean" in result.metadata ? result.metadata.lean : undefined)
    expect(metric).toMatchObject({ producer: "unverified", eligible: false, status: "passthrough", reason: "not_eligible",
      bytes: { before: Buffer.byteLength(result.output), after: Buffer.byteLength(result.output), saved: 0 },
    })
    expect(input).toEqual({ filePath: f.args.filePath })
    // Safety.run observes started, the plugin awaits progress, then the host observes success.
    expect(updates).toHaveLength(3)
    expect(updates[0].state).toMatchObject({ metadata: { toolSafety: { outcome: "started", callID: part.callID } } })
    const saved = yield* f.sessions.getPart({ sessionID: part.sessionID, messageID: part.messageID, partID: part.id })
    if (!saved || saved.type !== "tool" || saved.state.status === "pending") throw new Error("settled host observation missing")
    expect(saved.state.metadata?.toolSafety).toEqual({ outcome: "success", callID: part.callID,
      sessionID: f.child.id, projectID: f.child.projectID, directory: f.child.directory, tool: "read" })
    const { toolSafety, ...metadata } = saved.state.metadata ?? {}
    const progress = updates[1].state
    if (progress.status === "pending") throw new Error("awaited plugin progress missing")
    expect<SessionV1.ToolState>({ ...saved.state, metadata }).toEqual({ ...progress,
      metadata: status === "pending" || status === "running"
        ? { receipt: "MUST_KEEP 😀", nested: { marker: "checked" } }
        : state.status === "pending" ? {} : state.metadata ?? {},
    })
    if (status === "pending" || status === "running") {
      expect(saved.state.status).toBe("running")
      expect(saved.state).toMatchObject({ title: "checked plugin progress", input })
      if (status === "running") expect(saved.state.time.start).toBe(7)
    } else expect<SessionV1.ToolState>({ ...saved.state, metadata }).toEqual(state)
    const llm = yield* TestLLMServer
    expect(yield* llm.hits).toEqual([])
  }), options, 60000)
}

const native = testEffect(makeHttp())
native.instance("latest host join keeps native capture and declines changed after-hook policy flags", () => Effect.gen(function* () {
  const { fixture } = yield* Effect.promise(() => import("./lean-session.fixture"))
  const plugin = yield* Plugin.Service
  const registry = yield* ToolRegistry.Service
  const captures: ToolModelCapture.Binding[] = []
  const approved: LegacyLeanCapture.Output[] = []
  const policy = { changed: false }
  const observer: Plugin.Interface = { ...plugin, trigger: (name, input, output) =>
    plugin.trigger(name, input, output).pipe(Effect.tap(() => Effect.sync(() => {
      if (name !== "tool.execute.after" || !output || typeof output !== "object") return
      if (policy.changed) {
        Reflect.set(output, "isError", true)
        if ("metadata" in output && output.metadata && typeof output.metadata === "object")
          Reflect.set(output.metadata, "policyReceipt", "MUST_KEEP 😀")
      }
      const raw: unknown = structuredClone(output)
      if (!raw || typeof raw !== "object" || !("title" in raw) || typeof raw.title !== "string"
        || !("output" in raw) || typeof raw.output !== "string" || !("metadata" in raw)
        || !raw.metadata || typeof raw.metadata !== "object") throw new Error("approved native output missing")
      approved.push({ ...raw, title: raw.title, output: raw.output, metadata: { ...raw.metadata } })
    }))),
  }
  const f = yield* fixture().pipe(
    Effect.provideService(Plugin.Service, observer),
    Effect.provideService(ToolRegistry.Service, { ...registry, tools: (request) => registry.tools(request).pipe(
      Effect.map((items) => items.map((item) => item.id !== "bash" ? item : { ...item,
        execute: (args, context) => item.execute(args, context).pipe(Effect.tap((output) => Effect.sync(() => {
          const capture = context.callID && LegacyLeanCapture.bind(output, output, { sessionID: context.sessionID, callID: context.callID })
          if (!capture) throw new Error("same-call native capture missing")
          captures.push(capture)
        }))),
      })),
    ) }),
  )
  const positive = yield* f.invoke("go test -v .", "join-positive")
  expect(positive.metric.status).toBe("applied")
  policy.changed = true
  const refused = yield* f.invoke("go test -v .", "join-policy")
  expect(captures).toHaveLength(2)
  expect(approved).toHaveLength(2)
  const capture = captures[1]
  const raw = approved[1]
  expect(ToolModelCapture.authentic(capture.candidate)).toBe(true)
  expect(capture.candidate.owner.callID).toBe("join-policy")
  expect(refused.metric).toMatchObject({ producer: "native-shell", eligible: true,
    status: "passthrough", reason: "policy_mapping_changed", bytes: { saved: 0 } })
  expect(LegacyLeanCapture.model(raw).structured).not.toEqual(capture.baseline.structured)
  expect(Buffer.from(refused.output.output)).toEqual(Buffer.from(raw.output))
  const { lean, ...metadata } = refused.output.metadata
  expect(metadata).toEqual(raw.metadata)
  expect(refused.output).toMatchObject({ isError: true, metadata: { policyReceipt: "MUST_KEEP 😀" } })
  policy.changed = false
  expect((yield* f.invoke("go test -v .", "join-restored")).metric.status).toBe("applied")
}), 180000)
