import { expect, test } from "bun:test"
import type { HookInput, Options, SDKMessage, SDKUserMessage, query } from "@anthropic-ai/claude-agent-sdk"
import { AgentV2 } from "@orchestra/core/agent"
import { PermissionV2 } from "@orchestra/core/permission"
import { SessionSchema } from "@orchestra/core/session"
import type { ExecutionHost } from "@orchestra/core/session/runner"
import type { SessionScope } from "@orchestra/core/session/store"
import { Effect, Layer, Stream } from "effect"
import { ClaudeCodeSDK } from "../src/sdk"
import { ClaudeCodeHost } from "../src/v2/host"

// A scoped Session (SessionScope) on the Claude Code host: Claude Code is offered only the built-ins the scope names,
// its own Skill tool never, and every built-in call still goes to the runner's `authorize`, which enforces the scope
// and counts the call. Driven through the SDK seam with scripted frames, never the binary.

const seen: { options?: Options; decisions: unknown[] } = { decisions: [] }
let during: (options: Options) => Promise<void> = async () => {}
const done = {
  type: "result",
  subtype: "success",
  is_error: false,
  session_id: "claude-1",
  result: "",
  usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
} as unknown as SDKMessage
const sdk = Layer.succeed(
  ClaudeCodeSDK.Service,
  ClaudeCodeSDK.Service.of({
    query: ((input: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) =>
      (async function* () {
        await input.prompt[Symbol.asyncIterator]().next()
        seen.options = input.options
        await during(input.options)
        yield done
      })()) as unknown as typeof query,
  }),
)

const turnOf = (input: Partial<ExecutionHost.Turn>): ExecutionHost.Turn => ({
  session: { id: SessionSchema.ID.make("ses_scoped_host"), location: { directory: "/project" } } as unknown as SessionSchema.Info,
  agent: AgentV2.Info.empty(AgentV2.ID.make("lucy")),
  model: undefined,
  system: [],
  context: [],
  history: [{ id: "msg_1", type: "user", text: "Review", files: [], agents: [], time: { created: 0 } }] as unknown as ExecutionHost.Turn["history"],
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
const pre = (options: Options, tool: string, input: Record<string, unknown>, id: string) =>
  options.hooks?.PreToolUse?.[0]?.hooks[0]?.(
    { hook_event_name: "PreToolUse", tool_name: tool, tool_input: input, tool_use_id: id, session_id: "claude-1", transcript_path: "", cwd: "/project" } as HookInput,
    id,
    { signal: new AbortController().signal },
  )

const scope: SessionScope.Scope = {
  skills: { entry: "lucy-lens-correctness", allow: ["team-stack"] },
  tools: ["read", "grep", "skill"],
  budgets: { loads: 2, toolCalls: 15 },
}
const OUTSIDE_SCOPE = "This tool is outside this Session's scope. Continue with the tools you are allowed to use."

test("a scoped Session's built-ins are derived from its scope, and the runner's refusal reaches Claude Code", async () => {
  const asked: unknown[] = []
  seen.decisions = []
  during = async (options) => {
    const signal = new AbortController().signal
    seen.decisions.push(await pre(options, "Read", { file_path: "/project/a.ts" }, "tu-1"))
    seen.decisions.push(await pre(options, "Bash", { command: "ls" }, "tu-2"))
    seen.decisions.push(await pre(options, "Skill", { skill: "release" }, "tu-3"))
    seen.decisions.push(await options.canUseTool?.("AskUserQuestion", { questions: [] }, { signal, toolUseID: "tu-4", requestId: "r4" }))
  }
  await run(turnOf({
    scope,
    authorize: (input) =>
      Effect.sync(() => asked.push(input.safety?.tool)).pipe(
        Effect.andThen(
          scope.tools.includes(input.safety?.tool ?? input.action)
            ? Effect.succeed({})
            : Effect.fail(new PermissionV2.CorrectedError({ feedback: `The tool ${input.safety?.tool} is outside this Session's scope.` })),
        ),
      ),
  }))

  // Claude Code is never offered what the scope does not name, nor its own Skill tool.
  expect(seen.options?.disallowedTools?.toSorted()).toEqual(
    ["Agent", "Task", "Bash", "Write", "Edit", "MultiEdit", "NotebookEdit", "Glob", "WebFetch", "WebSearch", "TodoWrite",
      "TaskCreate", "TaskUpdate", "AskUserQuestion", "Skill"].toSorted(),
  )
  // A built-in that reaches the gate anyway is decided by the runner, which records the deviation.
  expect(asked).toEqual(["read", "bash"])
  expect(seen.decisions).toEqual([
    { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } },
    { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "The tool bash is outside this Session's scope." } },
    { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: OUTSIDE_SCOPE } },
    { behavior: "deny", message: OUTSIDE_SCOPE },
  ])
})

test("an unscoped Session keeps today's built-ins", async () => {
  during = async () => {}
  await run(turnOf({}))
  expect(seen.options?.disallowedTools).toEqual(["Agent", "Task"])
})
