import { expect } from "bun:test"
import { Effect } from "effect"
import path from "node:path"
import { LeanMetrics } from "@orchestra/schema/lean-metrics"
import { ProviderV2 } from "@orchestra/core/provider"
import { ModelV2 } from "@orchestra/core/model"
import { InstanceRef } from "../../src/effect/instance-ref"
import { Session } from "../../src/session/session"
import { SessionPrompt } from "../../src/session/prompt"
import { MessageV2 } from "../../src/session/message-v2"
import { Provider } from "../../src/provider/provider"
import { provideTmpdirInstance } from "../fixture/fixture"
import { TestLLMServer } from "../lib/llm-server"
import { testEffect } from "../lib/effect"
import { makeHttp } from "./prompt.fixture"

const it = testEffect(makeHttp())
const modes = ["enabled", "disabled", "failure", "plugin", "plugin-error", "unknown", "truncated", "read", "denied"] as const
type Mode = typeof modes[number]

function native(mode: Mode) {
  return Effect.gen(function* () {
    const instance = yield* InstanceRef
    if (!instance) throw new Error("NATIVE_KPI_INSTANCE_MISSING")
    const directory = instance.directory
    const llm = yield* TestLLMServer
    const approvedPath = path.join(directory, "approved.json")
    const pluginPath = path.join(directory, "capture-plugin.ts")
    yield* Effect.promise(() => Bun.write(pluginPath,
      `import { writeFile } from "node:fs/promises";
export default async () => ({ "tool.execute.after": async (_input, output) => {
  ${mode === "plugin" ? `output.output += "\\n\\nPRIVATE_POLICY_NOTE 😀";` : mode === "plugin-error" ? "output.isError = true;" : ""}
  await writeFile(${JSON.stringify(approvedPath)}, JSON.stringify(output));
} });`))
    yield* Effect.promise(() => Bun.write(path.join(directory, "orchestra.json"), JSON.stringify({
      model: "test/test-model", plugin: [pluginPath],
      tool_output: { lean: { enabled: mode !== "disabled" }, ...(mode === "truncated" ? { max_bytes: 200 } : {}) },
      provider: { test: { name: "Test", id: "test", env: [], npm: "@ai-sdk/openai-compatible",
        models: { "test-model": { id: "test-model", name: "Test Model", attachment: false, reasoning: false,
          temperature: false, tool_call: true, release_date: "2025-01-01", limit: { context: 100000, output: 10000 },
          cost: { input: 0, output: 0 }, options: {} } }, options: { apiKey: "synthetic-key", baseURL: llm.url } } },
    })))
    yield* Effect.promise(() => Bun.write(path.join(directory, "go.mod"), "module example.test\n\ngo 1.20\n"))
    yield* Effect.promise(() => Bun.write(path.join(directory, "native_test.go"),
      `package example\nimport "testing"\n${Array.from({ length: 30 }, (_, i) =>
        `func TestPRIVATE_METRIC_PAYLOAD${i}(t *testing.T) { ${mode === "failure" && i === 0 ? 't.Fatal("FAILURE MUST_KEEP")' : ""} }`).join("\n")}\n`))
    const sessions = yield* Session.Service
    const prompt = yield* SessionPrompt.Service
    const session = yield* sessions.create({ title: "Native KPI fixture",
      permission: [{ permission: "*", pattern: "*", action: mode === "denied" ? "deny" : "allow" }] })
    expect(session.projectID).toBe(instance.project.id)
    yield* prompt.prompt({ sessionID: session.id, agent: "maestro", noReply: true,
      parts: [{ type: "text", text: "Run native tests once." }] })
    const command = mode === "unknown" ? "go test -v . -run TestPRIVATE_METRIC_PAYLOAD0" : "go test -v ."
    const name = mode === "read" ? "read" : "bash"
    yield* llm.tool(name, mode === "read" ? { filePath: path.join(directory, "go.mod") }
      : { command, workdir: directory, timeout: 120000 })
    yield* llm.text("done")
    yield* prompt.loop({ sessionID: session.id })
    const saved = yield* MessageV2.filterCompactedEffect(session.id)
    const tool = saved.flatMap((message) => message.parts).find((part) => part.type === "tool" && part.tool === name)
    if (!tool || tool.type !== "tool") throw new Error("NATIVE_KPI_TOOL_MISSING")
    if (mode === "denied") {
      expect(tool.state.status).toBe("error")
      expect("metadata" in tool.state ? tool.state.metadata?.lean : undefined).toBeUndefined()
      expect(yield* Effect.promise(() => Bun.file(approvedPath).exists())).toBe(false)
      return undefined
    }
    if (tool.state.status !== "completed") throw new Error("NATIVE_KPI_COMPLETED_TOOL_MISSING")
    const stored = tool.state.output
    const approved = yield* Effect.promise(() => Bun.file(approvedPath).json() as Promise<{
      title: string; output: string; metadata: Record<string, unknown>; attachments?: unknown[]
    }>)
    expect(tool.state.title).toBe(approved.title)
    expect(approved.attachments).toEqual(tool.state.attachments)
    const { lean, ...baselineMetadata } = tool.state.metadata
    expect(baselineMetadata).toEqual(approved.metadata)
    if (mode !== "read") {
      expect(tool.state.metadata.exit).toBe(mode === "failure" ? 1 : 0)
      expect(tool.state.metadata.truncated).toBe(mode === "truncated")
      expect(tool.state.metadata.timeout).toBe(false)
      expect(tool.state.metadata.aborted).toBe(false)
      expect(tool.state.input.command).toBe(command)
    }
    if (mode === "enabled") {
      expect(approved.output).toContain("=== RUN   TestPRIVATE_METRIC_PAYLOAD0")
      expect(stored).not.toContain("=== RUN")
      expect(stored).toContain("PASS\n")
      expect(stored).toMatch(/ok {2}\texample\.test\t/)
    } else expect(stored).toBe(approved.output)
    if (mode === "plugin") expect(stored).toContain("PRIVATE_POLICY_NOTE 😀")
    if (mode === "failure") expect(stored).toContain("FAILURE MUST_KEEP")

    const hits = yield* llm.hits
    const messages = hits.flatMap((hit) => Array.isArray(hit.body.messages) ? hit.body.messages : [])
      .filter((message): message is { role: string; tool_call_id: string; content: string } =>
        typeof message === "object" && message !== null && "role" in message && message.role === "tool"
        && "tool_call_id" in message && message.tool_call_id === tool.callID)
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe(stored)
    expect(JSON.stringify(hits.map((hit) => hit.body))).not.toContain('"chars-per-token-4"')

    // Untouched measurement/decoder scaffolds must fail here, never be mocked into green.
    expect(lean).toBeDefined()
    const decision = LeanMetrics.decode(lean)
    if (!decision) throw new Error("NATIVE_KPI_REAL_MEASUREMENT_OR_DECODER_MISSING")
    expect(decision.scope).toBe("standard-registry")
    expect(decision.owner).toEqual({ projectID: instance.project.id, location: directory,
      sessionID: session.id, callID: tool.callID })
    expect(decision.model).toEqual({ provider: "test", id: "test-model" })
    expect(decision.orchestraProfile).toBeUndefined()
    expect(decision.producer).toBe(["failure", "truncated", "read"].includes(mode) ? "unverified" : "native-shell")
    expect(decision.eligible).toBe(!["failure", "truncated", "read"].includes(mode))
    expect(decision.status).toBe(mode === "enabled" ? "applied" : "passthrough")
    expect(decision.reason).toBe(mode === "enabled" ? "profile_reduction" : mode === "disabled" ? "disabled"
      : mode === "plugin" || mode === "plugin-error" ? "policy_mapping_changed"
        : mode === "unknown" ? "no_profile" : "not_eligible")
    expect(decision.filterProfile).toBe(mode === "enabled" ? "go-test-verbose" : undefined)
    expect(decision.bytes).toEqual({ before: Buffer.byteLength(approved.output, "utf8"),
      after: Buffer.byteLength(stored, "utf8"), saved: Buffer.byteLength(approved.output, "utf8") - Buffer.byteLength(stored, "utf8") })
    expect(decision.tokens).toEqual({ kind: "estimated", counter: "chars-per-token-4",
      before: Math.round(approved.output.length / 4), after: Math.round(stored.length / 4),
      saved: Math.round(approved.output.length / 4) - Math.round(stored.length / 4) })
    expect(Number.isFinite(decision.durationMs)).toBe(true)
    expect(decision.durationMs).toBeGreaterThanOrEqual(0)
    expect(Object.keys(lean as object).sort()).toEqual(["bytes", "durationMs", "eligible", "engine",
      ...(mode === "enabled" ? ["filterProfile"] : []), "model", "owner", "producer", "reason", "scope", "status", "tokens", "version"].sort())
    for (const privateText of ["go test", "PRIVATE_METRIC_PAYLOAD", "PRIVATE_POLICY_NOTE", "synthetic-key", "example.test"])
      expect(JSON.stringify(lean)).not.toContain(privateText)

    const provider = yield* Provider.Service
    const model = yield* provider.getModel(ProviderV2.ID.make("test"), ModelV2.ID.make("test-model"))
    for (const history of [saved, yield* MessageV2.filterCompactedEffect(session.id)]) {
      const lowered = yield* MessageV2.toModelMessagesEffect(history, model)
      const replay = lowered.flatMap((message) => message.role === "tool" ? message.content : [])
        .filter((part) => part.type === "tool-result" && part.toolCallId === tool.callID)
      expect(replay).toHaveLength(1)
      if (replay[0].type !== "tool-result" || replay[0].output.type !== "text") throw new Error("NATIVE_KPI_REPLAY_TEXT_MISSING")
      expect(replay[0].output.value).toBe(stored)
      expect(JSON.stringify(lowered)).not.toContain('"chars-per-token-4"')
      const records = history.flatMap((message) => message.parts)
        .flatMap((part) => part.type === "tool" && part.state.status === "completed" ? [part.state.metadata.lean] : [])
      expect(records).toEqual([lean])
    }
    return decision
  })
}

for (const mode of modes) it.instance(`native KPI ${mode}: HTTP, flags, durable metadata and replay`,
  () => native(mode), { git: true }, 180_000)

it.live("native KPIs keep two actual repositories isolated", () => Effect.gen(function* () {
  const first = yield* provideTmpdirInstance(() => native("enabled"), { git: true })
  const second = yield* provideTmpdirInstance(() => native("enabled"), { git: true })
  if (!first || !second) throw new Error("NATIVE_KPI_TWO_REPOSITORIES_MISSING")
  expect(first.owner.projectID).not.toBe(second.owner.projectID)
  expect(first.owner.location).not.toBe(second.owner.location)
  expect(first.owner.sessionID).not.toBe(second.owner.sessionID)
  expect(first.owner.projectID).not.toBe(path.basename(first.owner.location))
  expect(second.owner.projectID).not.toBe(path.basename(second.owner.location))
}), 180_000)
