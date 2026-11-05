import { expect, test } from "bun:test"
import type { Options, SDKMessage, SDKUserMessage, query } from "@anthropic-ai/claude-agent-sdk"
import { AgentV2 } from "@orchestra/core/agent"
import { SessionSchema } from "@orchestra/core/session"
import type { ExecutionHost } from "@orchestra/core/session/runner"
import { Effect, Layer, Stream } from "effect"
import { ClaudeHostOptions } from "../src/host/options"
import { ClaudeCodeSDK } from "../src/sdk"
import { ClaudeCodeHost } from "../src/v2/host"

// Seats in Claude mode work as on Orchestra's own engine: Maestro dispatches each through Orchestra's `task`, as its own
// Session, and a seat on Claude Code keeps its own Orchestra prompt, appended to Claude Code's preset.

const calls: (Options | undefined)[] = []
const sdk = Layer.succeed(
  ClaudeCodeSDK.Service,
  ClaudeCodeSDK.Service.of({
    query: ((input: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) =>
      (async function* () {
        await input.prompt[Symbol.asyncIterator]().next()
        calls.push(input.options)
        yield { type: "result", subtype: "success", is_error: false, session_id: "claude-1", result: "",
          usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as unknown as SDKMessage
      })()) as unknown as typeof query,
  }),
)

const turnOf = (agent: string, input: Partial<ExecutionHost.Turn> = {}): ExecutionHost.Turn => ({
  session: { id: SessionSchema.ID.make("ses_seat"), location: { directory: "/project" } } as unknown as SessionSchema.Info,
  agent: AgentV2.Info.empty(AgentV2.ID.make(agent)),
  model: undefined,
  system: [],
  context: [],
  history: [{ id: "msg_1", type: "user", text: "Go", files: [], agents: [], time: { created: 0 } }] as unknown as ExecutionHost.Turn["history"],
  tools: [],
  execute: () => Effect.die("unused"),
  authorize: () => Effect.die("unused"),
  question: () => Effect.die("unused"),
  memory: { recall: Effect.succeed(undefined), archive: () => Effect.void },
  steers: Stream.empty,
  consumed: () => Effect.void,
  notify: () => Effect.void,
  todos: () => Effect.void,
  state: { get: Effect.succeed(undefined), update: () => Effect.void },
  ...input,
})
const run = (turn: ExecutionHost.Turn) =>
  Effect.runPromise(
    ClaudeCodeHost.make.pipe(
      Effect.flatMap((host) => Stream.runCollect(host.stream(turn))),
      Effect.provide(sdk),
      Effect.provideService(ClaudeCodeSDK.Environment, {}),
    ),
  )

test("the Maestro note names only the Orchestra tools the session is served, and sends seats through task", () => {
  const bare = ClaudeHostOptions.append("maestro")
  const full = ClaudeHostOptions.append("maestro", ["task", "skill", "board_read", "process_control", "context_recall"])
  // Positive control: each line appears when its tool is served.
  expect(full).toContain("Dispatch a seat with `mcp__orchestra__task`")
  expect(full).toContain("Route by the `<team>` list")
  expect(full).toContain("`mcp__orchestra__skill`")
  expect(full).toContain("`mcp__orchestra__board_read` at the start")
  expect(full).toContain("`mcp__orchestra__process_control`")
  for (const name of ["mcp__orchestra__task", "<team>", "mcp__orchestra__skill", "`mcp__orchestra__board_read` at the start", "mcp__orchestra__process_control"])
    expect(bare).not.toContain(name)
  expect(full).not.toContain("task_grant")
})

test("a seat on Claude Code keeps its own Orchestra prompt, never the context, and gets no Claude Code subagents", async () => {
  await run(turnOf("backend", { system: ["You are the backend seat.", "Context"], context: ["Context"] }))
  const append = ClaudeHostOptions.append("backend", [], ["You are the backend seat."])

  expect(append).toContain("You are the `backend` seat of HuGR Orchestra")
  expect(append).toContain("You are the backend seat.")
  expect(append).not.toContain("Context")
  expect(calls.at(-1)).toMatchObject({
    systemPrompt: { type: "preset", preset: "claude_code", append },
    disallowedTools: ["Agent", "Task"],
  })
})
