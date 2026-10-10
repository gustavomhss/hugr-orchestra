import { expect, test } from "bun:test"
import { Effect } from "effect"
import path from "node:path"
import { LeanMetrics } from "@orchestra/schema/lean-metrics"
import { LeanEngine } from "@orchestra/schema/lean-engine"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { InstanceRef } from "../../src/effect/instance-ref"
import { Session } from "../../src/session/session"
import { SessionPrompt } from "../../src/session/prompt"
import { MessageV2 } from "../../src/session/message-v2"
import { LeanProfilePreferences } from "../../src/session/lean-profile-preferences"
import { provideInstance, tmpdirScoped, testInstanceStoreLayer } from "../fixture/fixture"
import { TestLLMServer } from "../lib/llm-server"
import { testEffect } from "../lib/effect"
import { makeHttp } from "./prompt.fixture"

const it = testEffect(makeHttp())
const preferencesLayer = LayerNode.compile(LayerNode.group([FSUtil.node, Global.node]))

function native(enabled: boolean) {
  return Effect.gen(function* () {
    const instance = yield* InstanceRef
    if (!instance) throw new Error("Native instance missing")
    const owner = { projectID: instance.project.id, directory: instance.directory }
    const prefs = yield* LeanProfilePreferences.update(owner, { itemID: "go", enabled }).pipe(Effect.provide(preferencesLayer))
    expect(prefs.scope.projectID).toBe(owner.projectID)
    expect(prefs.scope.directory).toBe(owner.directory)
    const llm = yield* TestLLMServer
    yield* Effect.promise(async () => {
      await Bun.write(path.join(owner.directory, "orchestra.json"), JSON.stringify({
        model: "test/test-model", tool_output: { lean: { enabled: true } },
        provider: { test: { name: "Test", id: "test", env: [], npm: "@ai-sdk/openai-compatible",
          models: { "test-model": { id: "test-model", name: "Test Model", attachment: false, reasoning: false,
            temperature: false, tool_call: true, release_date: "2025-01-01", limit: { context: 100000, output: 10000 },
            cost: { input: 0, output: 0 }, options: {} } }, options: { apiKey: "synthetic-key", baseURL: llm.url } } },
      }))
      await Bun.write(path.join(owner.directory, "go.mod"), "module example.test\n\ngo 1.20\n")
      await Bun.write(path.join(owner.directory, "native_test.go"), `package example\nimport "testing"\n${Array.from({ length: 20 }, (_, i) =>
        `func TestCase${i}(t *testing.T) {}`).join("\n")}\n`)
    })
    const sessions = yield* Session.Service
    const prompt = yield* SessionPrompt.Service
    const session = yield* sessions.create({ title: "Native item settings", permission: [{ permission: "*", pattern: "*", action: "allow" }] })
    yield* prompt.prompt({ sessionID: session.id, agent: "maestro", noReply: true, parts: [{ type: "text", text: "Run native tests once." }] })
    yield* llm.tool("bash", { command: "go test -v .", workdir: owner.directory, timeout: 120000 })
    yield* llm.text("done")
    yield* prompt.loop({ sessionID: session.id })
    const saved = yield* MessageV2.filterCompactedEffect(session.id)
    const tool = saved.flatMap((message) => message.parts).find((part) => part.type === "tool" && part.tool === "bash")
    if (!tool || tool.type !== "tool" || tool.state.status !== "completed") throw new Error("Completed native tool missing")
    expect(tool.state.input.command).toBe("go test -v .")
    expect(tool.state.metadata.exit).toBe(0)
    expect(tool.state.metadata.truncated).toBe(false)
    expect(tool.state.metadata.timeout).toBe(false)
    expect(tool.state.metadata.aborted).toBe(false)
    expect(tool.state.output.includes("=== RUN")).toBe(!enabled)
    const metric = LeanMetrics.decode(tool.state.metadata.lean)
    expect(metric).toMatchObject({ itemID: "go", engine: LeanEngine.current,
      orchestraProfile: prefs.scope.profileID, status: enabled ? "applied" : "passthrough" })
    expect(metric?.owner.location).toBe(owner.directory)
    expect(metric?.reason).toBe(enabled ? "profile_reduction" : "item_disabled")
    return { owner, scope: prefs.scope }
  })
}

it.live("same Project ID, different profile directories keep independent native item settings", () => Effect.gen(function* () {
  // Non-Git instances deliberately share the global project ID; directories still partition controls.
  const firstDirectory = yield* tmpdirScoped()
  const secondDirectory = yield* tmpdirScoped()
  const first = yield* native(false).pipe(provideInstance(firstDirectory))
  const second = yield* native(true).pipe(provideInstance(secondDirectory))
  expect(first.owner.projectID).toBe(second.owner.projectID)
  expect(first.owner.directory).not.toBe(second.owner.directory)
  expect(first.scope.profileID).not.toBe(second.scope.profileID)
  const a = yield* LeanProfilePreferences.read(first.owner).pipe(Effect.provide(preferencesLayer))
  const b = yield* LeanProfilePreferences.read(second.owner).pipe(Effect.provide(preferencesLayer))
  expect(a.items.go).toBe(false)
  expect(b.items.go).toBe(true)
}).pipe(Effect.provide(testInstanceStoreLayer)), 180_000)

test("full native Orchestra types require real processor checkpoint", async () => {
  const compiler = Bun.spawn([process.execPath, "run", "typecheck"], {
    cwd: path.join(import.meta.dir, "../.."), stdout: "pipe", stderr: "pipe",
  })
  const [code, stdout, stderr] = await Promise.all([
    compiler.exited, new Response(compiler.stdout).text(), new Response(compiler.stderr).text(),
  ])
  if (code !== 0) throw new Error(`Native Orchestra typecheck failed (${code})\n${stdout}${stderr}`)
  expect(code).toBe(0)
}, 180_000)
