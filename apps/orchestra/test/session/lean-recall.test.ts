import { expect } from "bun:test"
import { Effect } from "effect"
import { createHash } from "node:crypto"
import path from "node:path"
import { Global } from "@orchestra/core/global"
import { LeanMetrics } from "@orchestra/schema/lean-metrics"
import { Session } from "../../src/session/session"
import { SessionPrompt } from "../../src/session/prompt"
import { MessageV2 } from "../../src/session/message-v2"
import { LeanProject } from "../../src/session/lean-project"
import { InstanceRef } from "../../src/effect/instance-ref"
import { TestLLMServer } from "../lib/llm-server"
import { testEffect } from "../lib/effect"
import { makeHttp } from "./prompt.fixture"

const it = testEffect(makeHttp())

// A real native failing command: Lean 2.0 summarizes it for the model, keeps the failure whole, and the model's own
// lean_recall call gets the complete original back, byte for byte, on Linux and Windows alike.
it.instance("model reads a summarized failure, recalls the exact original and the profile KPIs count it", () => Effect.gen(function* () {
  const instance = yield* InstanceRef
  if (!instance) throw new Error("LEAN_RECALL_INSTANCE_MISSING")
  const directory = instance.directory
  const project = instance.project
  const llm = yield* TestLLMServer
  yield* Effect.promise(() => Bun.write(path.join(directory, "orchestra.json"), JSON.stringify({
    model: "test/test-model", tool_output: { lean: { enabled: true } },
    provider: { test: { name: "Test", id: "test", env: [], npm: "@ai-sdk/openai-compatible",
      models: { "test-model": { id: "test-model", name: "Test Model", attachment: false, reasoning: false,
        temperature: false, tool_call: true, release_date: "2025-01-01", limit: { context: 100000, output: 10000 },
        cost: { input: 0, output: 0 }, options: {} } }, options: { apiKey: "synthetic-key", baseURL: llm.url } } },
  })))
  const emitted = Array.from({ length: 600 }, (_, i) => i === 300 ? "FAILURE MUST_KEEP: assertion failed 😀"
    : `progress line ${i} ${"-".repeat(40)}`).join("\n") + "\n"
  yield* Effect.promise(() => Bun.write(path.join(directory, "emit.js"),
    `process.stdout.write(${JSON.stringify(emitted)}, () => process.exit(1))\n`))
  const original = `<shell_metadata>\nexit code: 1\n</shell_metadata>\n\n${emitted}`
  const global = Global.make({ data: path.join(directory, ".lean-data"), state: path.join(directory, ".lean-state") })
  yield* Effect.gen(function* () {
    const sessions = yield* Session.Service
    const prompt = yield* SessionPrompt.Service
    const session = yield* sessions.create({ title: "Lean recall", permission: [{ permission: "*", pattern: "*", action: "allow" }] })
    yield* prompt.prompt({ sessionID: session.id, agent: "maestro", noReply: true, parts: [{ type: "text", text: "Run it." }] })
    yield* llm.tool("bash", { command: "bun emit.js", workdir: directory, timeout: 120000 })
    yield* llm.text("done")
    yield* prompt.loop({ sessionID: session.id })
    const first = yield* MessageV2.filterCompactedEffect(session.id)
    const shell = first.flatMap((message) => message.parts).find((part) => part.type === "tool" && part.tool === "bash")
    if (!shell || shell.type !== "tool" || shell.state.status !== "completed") throw new Error("LEAN_RECALL_SHELL_MISSING")
    const summary = shell.state.output
    expect(shell.state.metadata.exit).toBe(1)
    expect(summary).toContain("exit code: 1")
    expect(summary).toContain("FAILURE MUST_KEEP: assertion failed 😀")
    expect(summary).toContain("lines omitted]")
    const id = /\n\[full output: lean recall ([a-f0-9]{32})\]$/.exec(summary)?.[1]
    if (!id) throw new Error(`LEAN_RECALL_LINE_MISSING\n${summary.slice(-400)}`)
    const metric = LeanMetrics.decode(shell.state.metadata.lean)
    expect(metric).toMatchObject({ itemID: "shell", producer: "native-shell", eligible: true, status: "applied",
      reason: "shell_summary_failed_command", bytes: { before: Buffer.byteLength(original), after: Buffer.byteLength(summary) } })
    // The model saw the summary and was offered the recall tool.
    const hits = yield* llm.hits
    const offered = hits.flatMap((hit) => Array.isArray(hit.body.tools) ? hit.body.tools : [])
      .map((tool) => typeof tool === "object" && tool !== null && "function" in tool ? (tool.function as { name?: string }).name : undefined)
    expect(offered).toContain("lean_recall")
    const seen = hits.flatMap((hit) => Array.isArray(hit.body.messages) ? hit.body.messages : [])
      .filter((message) => typeof message === "object" && message !== null && "tool_call_id" in message && message.tool_call_id === shell.callID)
    expect(seen.map((message) => (message as { content: string }).content)).toEqual([summary])

    yield* prompt.prompt({ sessionID: session.id, agent: "maestro", noReply: true, parts: [{ type: "text", text: "Show it all." }] })
    yield* llm.tool("lean_recall", { id })
    // The emitted failure is line 300 of the command output, line 305 of the original after the 4-line exit header.
    yield* llm.tool("lean_recall", { id: `lean recall ${id}`, lines: "304-306" })
    yield* llm.text("done")
    yield* prompt.loop({ sessionID: session.id })
    const recalls = (yield* MessageV2.filterCompactedEffect(session.id)).flatMap((message) => message.parts)
      .filter((part) => part.type === "tool" && part.tool === "lean_recall")
    const outputs = recalls.map((part) => part.type === "tool" && part.state.status === "completed" ? part.state.output : undefined)
    expect(outputs).toHaveLength(2)
    expect(Buffer.from(outputs[0] ?? "")).toEqual(Buffer.from(original))
    expect(outputs[1]).toBe(original.split("\n").slice(303, 306).join("\n"))
    expect(outputs[1]).toContain("FAILURE MUST_KEEP")

    const profileID = createHash("sha256").update(JSON.stringify([project.id, directory])).digest("hex")
    const kpis = yield* LeanProject.collect({ profileID, projectID: project.id, directory })
    const info = LeanProject.dashboard({ scope: { profileID, projectID: project.id, directory }, items: {} }, true, kpis)
    expect(info.items.find((item) => item.id === "shell")?.savings).toMatchObject({ bytesSaved: metric?.bytes.saved, calls: 1 })
  }).pipe(Effect.provideService(Global.Service, global))
}), 180_000)
