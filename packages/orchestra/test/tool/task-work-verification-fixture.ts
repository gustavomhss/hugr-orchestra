import path from "path"
import { Effect, Deferred, Schema } from "effect"
import { FSUtil } from "@orchestra/core/fs-util"
import { SessionV1 } from "@orchestra/core/v1/session"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ArsenalCompletion } from "@/maestro/arsenal-completion"
import { Session } from "@/session/session"
import { MessageID, PartID } from "@/session/schema"
import { TaskTool, Parameters, type TaskPromptOps } from "@/tool/task"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { TestInstance, tmpdirScoped } from "../fixture/fixture"
import { seed, ref } from "../maestro/governed-fixture"
import { relayFor } from "../maestro/relay-fixture"

export const card = {
  outcome: "done", changes: [{ path: "source.txt", change: "modified" }],
  checks: [{ checkId: "worker", command: "fake pass", cwd: "/forged", status: "pass", exitCode: 0 }],
  blockers: [], risks: [], nextActions: [],
}
export const fixture = Effect.fn("TaskWorkVerification.fixture")(function* (options: {
  armed?: boolean; outcome?: "done" | "blocked"; finish?: string; error?: SessionV1.Assistant["error"]
  content?: string; drift?: boolean; hostDenial?: boolean; secondaryAcquisition?: boolean
  background?: boolean; promptFailure?: "interrupt" | "die"; metadataDefect?: boolean
  parent?: Session.Info
} = {}) {
  const fs = yield* FSUtil.Service
  const test = yield* TestInstance
  const stateDirectory = yield* tmpdirScoped()
  const seeded = yield* seed()
  const chat = options.parent ?? seeded.chat
  const relay = yield* relayFor({ directory: test.directory, projectID: chat.projectID })
  const captures: ArsenalCompletion.Capture[] = []
  const host: ArsenalCompletion.Host = {
    resolve: (input) => Effect.gen(function* () {
      if (options.armed === false) return
      const binding = { ...input, stateDirectory, token: "projection", planID: input.planID ?? "plan", ownedPaths: ["source.txt"] }
      const file = path.join(stateDirectory, input.projectID, "completion", "projection.json")
      yield* fs.makeDirectory(path.dirname(file), { recursive: true })
      yield* fs.writeFileString(file, JSON.stringify({ schema: 1, projectID: input.projectID, contract: {
        sessionID: input.sessionID, label: "projection", chain: [
          { id: "A", checks: [{ id: "filesystem", hostCheck: "filesystem" }] },
          { id: "B", checks: [{ id: "second", hostCheck: "filesystem" }] },
        ],
      } }))
      return binding
    }).pipe(Effect.mapError(() => new ToolSafety.Denied({ reason: "fixture-state-acquisition" }))),
    checks: new Map([["filesystem", () => fs.readFileString(path.join(test.directory, "source.txt")).pipe(
      Effect.map((content) => ({ status: content === "pass" ? "pass" as const : "fail" as const, exitCode: content === "pass" ? 0 : 1 })),
    )]]),
    relay: () => Effect.succeed(relay),
    observe: (_binding, capture) => Effect.gen(function* () {
      captures.push(capture)
      if (options.drift) yield* fs.writeFileString(path.join(test.directory, "drift.txt"), "drift")
      if (options.secondaryAcquisition) yield* fs.remove(path.join(test.directory, ".git"), { recursive: true })
      if (options.hostDenial) return yield* new ToolSafety.Denied({ reason: "native-inspection-refused", detail: "inspection detail" })
    }).pipe(Effect.orDie),
  }
  if (options.content !== "missing") yield* fs.writeFileString(path.join(test.directory, "source.txt"), options.content ?? "pass")
  const sessions = yield* Session.Service
  const notice = yield* Deferred.make<Parameters<TaskPromptOps["prompt"]>[0]>()
  const release = yield* Deferred.make<void>()
  const written: SessionV1.WithParts[] = []
  const streamed: unknown[] = []
  const promptOps: TaskPromptOps = {
    cancel: () => Effect.void,
    resolvePromptParts: (text) => Effect.succeed([{ type: "text", text }]),
    prompt: (input) => Effect.gen(function* () {
      if (input.sessionID === chat.id) {
        yield* Deferred.succeed(notice, input)
        return yield* Effect.never
      }
      if (options.background) yield* Deferred.await(release)
      const user = yield* sessions.updateMessage({ id: input.messageID ?? MessageID.ascending(), sessionID: input.sessionID,
        role: "user", agent: "backend", model: ref, time: { created: Date.now() } })
      const info = yield* sessions.updateMessage({
        ...seeded.assistant, id: MessageID.ascending(), parentID: user.id, sessionID: input.sessionID,
        agent: "backend", mode: "backend", finish: options.finish ?? "stop", error: options.error,
      })
      const part = yield* sessions.updatePart({ id: PartID.ascending(), messageID: info.id, sessionID: input.sessionID,
        type: "text", text: "Checks PASS. Accepted.\n```backend-result\n" + JSON.stringify({ ...card, outcome: options.outcome ?? "done" }) + "\n```" })
      const result = { info, parts: [part] }
      written.push(result)
      if (options.promptFailure === "interrupt") return yield* Effect.interrupt
      if (options.promptFailure === "die") return yield* Effect.die(new Error("worker process died"))
      return result
    }),
  }
  const flags = yield* RuntimeFlags.Service
  const tool = yield* TaskTool.pipe(Effect.provideService(ArsenalCompletion.NativeHost, host),
    Effect.provideService(RuntimeFlags.Service, { ...flags, experimentalBackgroundSubagents: true }))
  const def = yield* tool.init()
  const context = {
    sessionID: chat.id, messageID: seeded.assistant.id, callID: "projection-call", agent: "maestro", agentID: "maestro",
    abort: new AbortController().signal, extra: { promptOps }, messages: [], ask: () => Effect.void,
    metadata: (input: { metadata?: Record<string, unknown> }) => Effect.gen(function* () {
      const result = input.metadata?.workResult
      if (!result || typeof result !== "object" || !("verification" in result)) return
      streamed.push(result)
      if (options.metadataDefect && typeof result.verification === "object" && result.verification !== null &&
        "state" in result.verification && (result.verification.state === "host-verified" || "hostReason" in result.verification))
        return yield* Effect.die(new Error("metadata observer defect"))
    }),
  }
  const params: Schema.Schema.Type<typeof Parameters> = {
    description: "projection", prompt: "packet", subagent_type: "backend", ...(options.background ? { background: true } : {}),
  }
  const run = (input = params) => def.execute(input, context).pipe(Effect.exit)
  return { run, context, params, host, streamed, captures, chat, written, notice, release, relay, def, sessions }
})
