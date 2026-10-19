import { expect, test } from "bun:test"
import type { Options, SDKMessage, query } from "@anthropic-ai/claude-agent-sdk"
import { AgentV2 } from "@orchestra/core/agent"
import { SessionSchema } from "@orchestra/core/session"
import type { ExecutionHost } from "@orchestra/core/session/runner"
import { Effect, Layer, Stream } from "effect"
import { ClaudeCodeSDK } from "../src/sdk"
import { ClaudeCodeHost } from "../src/v2/host"

// The V2 Claude Code host, driven through the SDK seam with scripted frames: no Claude Code process, no Claude API.
// One SDK query is one provider turn; the next turn resumes the same Claude Code session with only the new message.

const calls: { prompt: unknown; options: Options | undefined }[] = []
let script: SDKMessage[] = []

const sdk = Layer.succeed(
  ClaudeCodeSDK.Service,
  ClaudeCodeSDK.Service.of({
    query: ((input: { prompt: unknown; options?: Options }) => {
      calls.push({ prompt: input.prompt, options: input.options })
      const frames = script
      return (async function* () {
        yield* frames
      })()
    }) as unknown as typeof query,
  }),
)

const frame = (value: Record<string, unknown>) => value as unknown as SDKMessage
const usage = { input_tokens: 5, output_tokens: 4, cache_read_input_tokens: 10, cache_creation_input_tokens: 1 }
const user = (id: string, text: string) => ({ id, type: "user", text, files: [], agents: [], time: { created: 0 } })

test("one SDK query is one turn: tool calls surface provider-executed and the next turn resumes with only new input", async () => {
  const stored: { value: unknown } = { value: undefined }
  const turn = (history: ReadonlyArray<unknown>): ExecutionHost.Turn => ({
    session: { id: SessionSchema.ID.make("ses_host"), location: { directory: "/project" } } as unknown as SessionSchema.Info,
    agent: AgentV2.Info.empty(AgentV2.ID.make("maestro")),
    model: undefined,
    system: ["Maestro instructions", "Context"],
    history: history as ExecutionHost.Turn["history"],
    state: {
      get: Effect.sync(() => stored.value),
      update: (fn) => Effect.sync(() => void (stored.value = fn(stored.value))),
    },
  })
  const run = (history: ReadonlyArray<unknown>) =>
    Effect.runPromise(
      ClaudeCodeHost.make.pipe(
        Effect.flatMap((host) => Stream.runCollect(host.stream(turn(history)))),
        Effect.provide(sdk),
        Effect.provideService(ClaudeCodeSDK.Environment, {}),
      ),
    ).then((events) => Array.from(events))

  script = [
    frame({ type: "system", subtype: "init", session_id: "claude-1" }),
    frame({ type: "assistant", uuid: "a1", session_id: "claude-1", parent_tool_use_id: null,
      message: { content: [{ type: "text", text: "Listing" }, { type: "tool_use", id: "tu1", name: "Bash", input: { command: "ls" } }] } }),
    // A subagent's frame stays inside its Agent call.
    frame({ type: "assistant", uuid: "s1", session_id: "claude-1", parent_tool_use_id: "tu0",
      message: { content: [{ type: "text", text: "subagent" }] } }),
    frame({ type: "user", session_id: "claude-1", parent_tool_use_id: null,
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tu1", content: "a.txt" }] } }),
    frame({ type: "assistant", uuid: "a2", session_id: "claude-1", parent_tool_use_id: null,
      message: { content: [{ type: "text", text: "Done" }] } }),
    frame({ type: "result", subtype: "success", is_error: false, session_id: "claude-1", result: "Done", usage }),
  ]
  const first = await run([user("msg_1", "First")])

  expect(calls[0]?.prompt).toBe("First")
  expect(calls[0]?.options).toMatchObject({
    cwd: "/project",
    sessionId: ClaudeCodeHost.claudeSessionID("ses_host"),
    systemPrompt: { type: "preset", preset: "claude_code", append: "Maestro instructions\n\nContext" },
  })
  expect(calls[0]?.options?.resume).toBeUndefined()
  expect(first.map((event) => event.type)).toEqual([
    "step-start", "text-start", "text-delta", "text-end", "tool-call", "tool-result",
    "text-start", "text-delta", "text-end", "step-finish",
  ])
  expect(first[4]).toMatchObject({ id: "tu1", name: "Bash", input: { command: "ls" }, providerExecuted: true })
  expect(first[5]).toMatchObject({ id: "tu1", result: { type: "text", value: "a.txt" }, providerExecuted: true })
  expect(first.at(-1)).toMatchObject({ reason: "stop", usage: { inputTokens: 16, outputTokens: 4 } })
  expect(stored.value).toEqual({ sessionId: "claude-1", delivered: ["msg_1"] })

  script = [
    frame({ type: "assistant", uuid: "b1", session_id: "claude-1", parent_tool_use_id: null, error: "authentication_failed",
      message: { content: [] } }),
  ]
  const second = await run([user("msg_1", "First"), user("msg_2", "Second")])

  expect(calls[1]?.prompt).toBe("Second")
  expect(calls[1]?.options).toMatchObject({ resume: "claude-1" })
  expect(calls[1]?.options?.sessionId).toBeUndefined()
  expect(second).toMatchObject([{ type: "step-start" }, { type: "provider-error", message: ClaudeCodeSDK.SIGNED_OUT }])
  // A failed turn delivers nothing, so the message is sent again next time.
  expect(stored.value).toEqual({ sessionId: "claude-1", delivered: ["msg_1"] })
})
