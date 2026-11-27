import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import { AgentV2 } from "@orchestra/core/agent"
import { SessionSchema } from "@orchestra/core/session"
import { SessionMessage } from "@orchestra/core/session/message"
import type { ExecutionHost } from "@orchestra/core/session/runner"
import type { ToolSafety } from "@orchestra/core/tool-safety"
import { DateTime, Effect, Stream } from "effect"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { ClaudeCodeExecutable } from "./src/executable"
import { ClaudeCodeSDK } from "./src/sdk"
import { ClaudeCodeHost } from "./src/v2/host"
import { tmpdir } from "./test/fixture/tmpdir"

function check(assertion: unknown, message: string): asserts assertion {
  if (!assertion) throw new Error(message)
}

async function smoke() {
  const token = process.env.CLAUDE_CODE_OAUTH_TOKEN
  check(token, "The approved CI Claude credential is unavailable")
  await using project = await tmpdir()
  await using config = await tmpdir()
  const captured: { version?: string; result?: string; error?: unknown } = {}
  const file = path.join(project.path, "sample.txt")
  const fileMarker = `FILE-${randomUUID()}`
  const hookMarker = `HOOK-${randomUUID()}`
  const agentsMarker = `AGENTS-${randomUUID()}`
  await Bun.write(file, fileMarker)
  await Bun.write(path.join(project.path, "AGENTS.md"), `Project token: ${agentsMarker}\n`)
  const approved: string[] = []
  const settled: { id: string; outcome: ToolSafety.HostedOutcome }[] = []
  const turn: ExecutionHost.Turn = {
    session: { id: SessionSchema.ID.make("ses_ci_auth_smoke"), location: { directory: project.path } } as SessionSchema.Info,
    agent: AgentV2.Info.empty(AgentV2.ID.make("maestro")),
    model: undefined,
    system: [],
    context: [`Project token: ${agentsMarker}`],
    history: [SessionMessage.User.make({
      id: SessionMessage.ID.make("msg_ci_auth_smoke"),
      type: "user",
      text: `Use Read exactly once on ${file} to obtain the file token. The tool's attached context will provide a hook token. Reply with the exact project token, file token and hook token. Do not ask for anything or call any other tool.`,
      agents: [], files: [], time: { created: DateTime.makeUnsafe(0) },
    })],
    tools: [],
    authorize: (input) => {
      if (input.tool !== "Read" || input.safety?.args.filePath !== file)
        return Effect.fail(new Error("Smoke permits only the synthetic Read")) as ReturnType<ExecutionHost.Turn["authorize"]>
      approved.push(input.callID)
      return Effect.succeed({ after: (outcome) => Effect.sync(() => {
        settled.push({ id: input.callID, outcome })
        return [`Hook token: ${hookMarker}`]
      }) })
    },
    execute: () => Effect.die("No MCP during this smoke"),
    question: () => Effect.die("No interactive question during this smoke"),
    memory: { recall: Effect.succeed(undefined), archive: () => Effect.void },
    steers: Stream.empty,
    consumed: () => Effect.void,
    notify: () => Effect.void,
    todos: () => Effect.void,
    state: { get: Effect.succeed(undefined), update: () => Effect.void },
  }
  const realSDK = (input: Parameters<typeof query>[0]) => {
    const run = query({ ...input, options: { ...input.options, maxTurns: 4, maxBudgetUsd: 0.5 } })
    return new Proxy(run, {
      get(target, key) {
        if (key === Symbol.asyncIterator) return async function* () {
          for await (const frame of target as AsyncIterable<SDKMessage>) {
            if (frame.type === "system" && frame.subtype === "init") captured.version = frame.claude_code_version
            if (frame.type === "assistant" && frame.error) captured.error = frame.error
            if (frame.type === "result") captured.result = frame.subtype
            yield frame
          }
        }
        const value = Reflect.get(target, key, target)
        return typeof value === "function" ? value.bind(target) : value
      },
    })
  }
  const events = await Effect.runPromise(ClaudeCodeHost.make.pipe(
    Effect.flatMap((host) => Stream.runCollect(host.stream(turn))),
    Effect.provideService(ClaudeCodeSDK.Service, ClaudeCodeSDK.Service.of({ query: realSDK })),
    Effect.provideService(ClaudeCodeSDK.Environment, {
      PATH: process.env.PATH,
      HOME: config.path,
      CLAUDE_CONFIG_DIR: config.path,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      CLAUDE_CODE_OAUTH_TOKEN: token,
    }),
  ))
  check(captured.version === ClaudeCodeExecutable.CODE_VERSION, "The pinned Claude Code binary did not initialize")
  if (captured.error) {
    const classification = ["authentication_failed", "billing_error", "rate_limit", "server_error", "invalid_request"].find((value) => value === captured.error)
    throw new Error(`Provider refused the smoke (${classification ?? "other"})`)
  }
  check(captured.result === "success", "The authenticated SDK turn did not report success")
  const reply = events.filter((event) => event.type === "text-delta").map((event) => event.text).join("")
  check(approved.length === 1 && settled.length === 1 && approved[0] === settled[0].id, "Read did not authorize and settle exactly once")
  check(settled[0].outcome.succeeded && JSON.stringify(settled[0].outcome.response).includes(fileMarker), "The SDK response did not carry the file token")
  check([agentsMarker, fileMarker, hookMarker].every((marker) => reply.includes(marker)), "The bounded model reply did not reflect all three context tokens")
  console.log(`Authenticated Claude Code ${captured.version} / Agent SDK ${ClaudeCodeExecutable.SDK_VERSION}`)
  console.log(`Read before/after paired once on ${approved[0]}; live response and all three synthetic markers confirmed`)
}

try {
  await smoke()
} catch (error) {
  // No provider payloads, stderr, transcripts, tokens, or SDK error objects reach public CI logs.
  const message = error instanceof Error && /^(The |Read did |Provider refused)/.test(error.message)
    ? error.message
    : "Authenticated smoke failed before the expected receipt"
  console.error(message)
  process.exitCode = 1
}
