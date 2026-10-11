// Production-boundary smoke. Run with isolated HOME/XDG directories; authentication belongs only to the SDK.
// Six bounded Haiku turns, the real continuity producer, and a seventh SDK resume whose native view is inspected.
import path from "node:path"
import { mkdirSync, writeFileSync } from "node:fs"
import { Effect, Layer } from "effect"
import { query } from "@anthropic-ai/claude-agent-sdk"
import { FSUtil } from "@orchestra/core/fs-util"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { AppNodeBuilderV1 } from "@/effect/app-node-builder-v1"
import { ClaudeCodeSDK } from "@/claude-code/sdk"
import { InstanceStore } from "@/project/instance-store"
import { Session } from "@/session/session"
import { SessionPrompt } from "@/session/prompt"
import { SessionContinuity } from "@/continuity/service"
import { BackgroundJob } from "@/background/job"
import { ClaudeCodeStore } from "@/claude-code/store"
import { ClaudeCodeTranscript } from "@/claude-code/transcript"

const workspace = path.resolve(process.argv[2] ?? "")
if (!process.argv[2]) throw new Error("usage: bun script/claude-code-engine/continuity-smoke.ts <isolated-workspace>")
mkdirSync(workspace, { recursive: true })
writeFileSync(path.join(workspace, "orchestra.json"), JSON.stringify({ continuity: { trigger: 0.65 }, agent: { claude: {
  mode: "primary", engine: "claude-code", model: "anthropic/claude-haiku-4-5-20251001",
  prompt: "This is a bounded continuity smoke. Do not call tools. Follow the requested text format.",
} } }))

const program = Effect.gen(function* () {
  const sessions = yield* Session.Service
  const prompt = yield* SessionPrompt.Service
  const continuity = yield* SessionContinuity.Service
  const jobs = yield* BackgroundJob.Service
  const fs = yield* FSUtil.Service
  const session = yield* sessions.create({ title: "Claude Code continuity live smoke", permission: [{ permission: "*", pattern: "*", action: "allow" }] })
  const needle = "ORCHID-CC-7D92"
  for (let turn = 0; turn < 6; turn++) {
    const text = turn === 0
      ? `Keep this release codename for later: ${needle}. Do not repeat it now. Reply ACK, then exactly 40 numbered synthetic cache-audit log lines, each at least 12 words. These lines are expendable sample data, not real findings.`
      : turn === 1
        ? "Reply ACK, then exactly 40 numbered synthetic inventory log lines, each at least 12 words. Expendable sample data only; no tools or real work."
        : `Checkpoint ${turn}: sample output can be discarded, no new work. Reply ACK only.`
    const answer = yield* prompt.prompt({ sessionID: session.id, agent: "claude", parts: [{ type: "text", text }] })
    if (answer.info.role !== "assistant" || answer.info.error) throw new Error(JSON.stringify(answer.info))
    console.log("turn", turn, "finish", answer.info.finish)
  }
  const outcome = yield* continuity.compact({ sessionID: session.id, force: true, canRecall: true })
  console.log("compact", outcome)
  console.log("producer jobs", JSON.stringify((yield* jobs.list()).filter((job) => job.metadata?.sessionId === session.id)
    .map((job) => ({ status: job.status, output: job.output, error: job.error }))))
  const history = yield* sessions.messages({ sessionID: session.id })
  const view = yield* continuity.prepare({ sessionID: session.id, messages: history, canRecall: true })
  if (!view.system.join("\n").includes(needle)) throw new Error("Actual producer did not preserve the memory needle")
  const context = yield* Effect.context<never>()
  const native = ClaudeCodeStore.create({ sessionID: session.id, sessions, continuity, fs,
    run: (effect) => Effect.runPromiseWith(context)(effect), rewrite: () => true, canRecall: true })
  const before = yield* native.read
  const main = before.keys.find((item) => !item.key.subpath)
  if (!main) throw new Error("SDK did not archive its native transcript")
  const loaded = yield* Effect.promise(() => native.store.load(main.key))
  if (!loaded || loaded[0].subtype !== "compact_boundary" || loaded[1].isCompactSummary !== true)
    throw new Error("Actual native swap was not prepared")
  if (loaded.slice(2).some((entry) => JSON.stringify(entry).includes(needle))) throw new Error("Needle still exists in native tail")
  console.log("swap", JSON.stringify({ archived: main.entries.length, loaded: loaded.length,
    version: ClaudeCodeTranscript.version(main.entries), memoryOnlyNeedle: true }))
  const answer = yield* prompt.prompt({ sessionID: session.id, agent: "claude", parts: [{ type: "text", text: "What release codename did I give you? Return only that exact codename; no tools." }] })
  const text = answer.parts.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n")
  console.log("recall", text)
  console.log("session metadata", JSON.stringify((yield* sessions.get(session.id)).metadata))
  if (!text.includes(needle)) throw new Error("Resumed SDK did not recall the memory-only needle")
  const after = yield* native.read
  if (JSON.stringify(after.keys[0].entries.slice(0, main.entries.length)) !== JSON.stringify(main.entries))
    throw new Error("Native archive prefix changed")
  console.log("PASS: real SDK producer, validated memory, swap, recall, immutable native archive")
})

const layer = AppNodeBuilderV1.build(LayerNode.group([
  SessionPrompt.node, SessionContinuity.node, Session.node, InstanceStore.node, FSUtil.node, BackgroundJob.node,
]), [[ClaudeCodeSDK.node, Layer.succeed(ClaudeCodeSDK.Service, ClaudeCodeSDK.Service.of({
  // The real SDK, with a per-query provider-turn bound in this smoke harness only.
  query: (params) => query({ ...params, options: { ...params.options, maxTurns: 1 } }),
}))]])
await Effect.runPromise(InstanceStore.Service.use((store) => store.provide({ directory: workspace }, program)).pipe(
  Effect.timeout("5 minutes"), Effect.provide(layer)))
process.exit(0)
