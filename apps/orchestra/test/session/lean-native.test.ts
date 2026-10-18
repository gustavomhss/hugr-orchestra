import { expect } from "bun:test"
import { Effect } from "effect"
import path from "node:path"
import { Session } from "../../src/session/session"
import { SessionPrompt } from "../../src/session/prompt"
import { MessageV2 } from "../../src/session/message-v2"
import { Provider } from "../../src/provider/provider"
import { ProviderV2 } from "@orchestra/core/provider"
import { ModelV2 } from "@orchestra/core/model"
import { Global } from "@orchestra/core/global"
import { TestInstance } from "../fixture/fixture"
import { TestLLMServer } from "../lib/llm-server"
import { testEffect } from "../lib/effect"
import { makeHttp } from "./prompt.fixture"

const it = testEffect(makeHttp())

function withPreferences<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return Effect.gen(function* () {
    const { directory } = yield* TestInstance
    return yield* effect.pipe(Effect.provideService(Global.Service, Global.make({
      data: path.join(directory, ".lean-data"), state: path.join(directory, ".lean-state"),
    })))
  })
}

for (const mode of ["enabled", "disabled", "failure", "plugin", "plugin-error", "unknown", "truncated"] as const) it.instance(`native Lean ${mode} next model result and saved replay view`, () =>
  withPreferences(Effect.gen(function* () {
    const enabled = mode !== "disabled"
    const changed = mode === "enabled"
    const { directory } = yield* TestInstance
    const llm = yield* TestLLMServer
    if (mode === "plugin" || mode === "plugin-error") yield* Effect.promise(() => Bun.write(path.join(directory, "native-plugin.ts"),
      `export default async () => ({ "tool.execute.after": async (_input, output) => { ${mode === "plugin" ? `output.output += "\\n\\nPLUGIN MUST_KEEP"` : "output.isError = true"} } })`))
    yield* Effect.promise(() => Bun.write(path.join(directory, "orchestra.json"), JSON.stringify({
      model: "test/test-model", tool_output: { lean: { enabled }, ...(mode === "truncated" ? { max_bytes: 200 } : {}) },
      ...(mode === "plugin" || mode === "plugin-error" ? { plugin: [path.join(directory, "native-plugin.ts")] } : {}),
      provider: { test: { name: "Test", id: "test", env: [], npm: "@ai-sdk/openai-compatible",
        models: { "test-model": { id: "test-model", name: "Test Model", attachment: false, reasoning: false,
          temperature: false, tool_call: true, release_date: "2025-01-01", limit: { context: 100000, output: 10000 },
          cost: { input: 0, output: 0 }, options: {} } }, options: { apiKey: "synthetic-key", baseURL: llm.url } } },
    })))
    yield* Effect.promise(() => Bun.write(path.join(directory, "go.mod"), "module example.test\n\ngo 1.20\n"))
    yield* Effect.promise(() => Bun.write(path.join(directory, "native_test.go"),
      `package example\nimport "testing"\n${Array.from({ length: 30 }, (_, i) => `func TestCase${i}(t *testing.T) { ${mode === "failure" && i === 0 ? "t.Fatal(\"FAILURE MUST_KEEP\")" : ""} }`).join("\n")}\n`))
    const sessions = yield* Session.Service
    const prompt = yield* SessionPrompt.Service
    const session = yield* sessions.create({ title: "Native Lean fixture", permission: [{ permission: "*", pattern: "*", action: "allow" }] })
    yield* prompt.prompt({ sessionID: session.id, agent: "maestro", noReply: true, parts: [{ type: "text", text: "Run native tests once." }] })
    const command = mode === "unknown" ? "go test -v . -run TestCase0" : "go test -v ."
    yield* llm.tool("bash", { command, workdir: directory, timeout: 120000 })
    yield* llm.text("done")
    const reply = yield* prompt.loop({ sessionID: session.id })
    expect(reply.info.role).toBe("assistant")
    const saved = yield* MessageV2.filterCompactedEffect(session.id)
    const tool = saved.flatMap((message) => message.parts).find((part) => part.type === "tool" && part.tool === "bash")
    if (!tool || tool.type !== "tool" || tool.state.status !== "completed") throw new Error("NATIVE_LEAN_COMPLETED_TOOL_MISSING")
    const stored = tool.state.output
    expect(tool.state.metadata.exit).toBe(mode === "failure" ? 1 : 0)
    expect(tool.state.metadata.truncated).toBe(mode === "truncated")
    expect(tool.state.input.command).toBe(command)
    if (mode === "failure") {
      expect(stored).toContain("FAILURE MUST_KEEP")
      expect(stored).toContain("exit code: 1")
    } else {
      expect(stored).toContain("PASS\n")
      expect(stored).toMatch(/ok {2}\texample\.test\t/)
    }
    if (mode === "plugin") expect(stored).toContain("PLUGIN MUST_KEEP")
    if (changed) expect(stored).not.toContain("=== RUN")
    if (mode === "truncated") {
      expect(stored).toContain("...output truncated...")
      expect(stored).toContain("Full output saved to:")
    } else if (!changed) expect(stored).toContain("=== RUN   TestCase0")
    const hits = yield* llm.hits
    const matches = hits.flatMap((hit) => Array.isArray(hit.body.messages) ? hit.body.messages : [])
      .filter((message): message is { role: string; tool_call_id: string; content: string } =>
        typeof message === "object" && message !== null && "role" in message && message.role === "tool"
        && "tool_call_id" in message && message.tool_call_id === tool.callID)
    expect(matches).toHaveLength(1)
    expect(matches[0].content).toBe(stored)
    const provider = yield* Provider.Service
    const model = yield* provider.getModel(ProviderV2.ID.make("test"), ModelV2.ID.make("test-model"))
    const lowered = yield* MessageV2.toModelMessagesEffect(saved, model)
    const replay = lowered.flatMap((message) => message.role === "tool" ? message.content : [])
      .filter((part) => part.type === "tool-result" && part.toolCallId === tool.callID)
    expect(replay).toHaveLength(1)
    if (replay[0].type !== "tool-result" || replay[0].output.type !== "text") throw new Error("NATIVE_LEAN_REPLAY_TEXT_MISSING")
    expect(replay[0].output.value).toBe(stored)
    const serialized = JSON.stringify(lowered)
    expect(serialized).toContain("example.test")
    if (changed) expect(serialized).not.toContain("=== RUN")
    if (!changed && mode !== "truncated") expect(serialized).toContain("=== RUN")
  })), 180_000)
