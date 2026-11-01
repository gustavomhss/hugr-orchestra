import { beforeEach, expect, test } from "bun:test"
import type { HookInput, McpSdkServerConfigWithInstance, Options, SDKMessage, SDKUserMessage, query } from "@anthropic-ai/claude-agent-sdk"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { AgentV2 } from "@orchestra/core/agent"
import { SessionSchema } from "@orchestra/core/session"
import type { ExecutionHost } from "@orchestra/core/session/runner"
import { ToolDefinition } from "@orchestra/llm"
import { Effect, Layer, Stream } from "effect"
import { ClaudeCodeSDK } from "../src/sdk"
import { ClaudeCodeHost } from "../src/v2/host"

// What the V2 host's gate keeps between a hook, `canUseTool` and the MCP server: the tool_use ids it pairs with MCP
// requests, the decisions it caches and the governed playbooks sessions have loaded. Driven through the SDK seam with
// scripted frames, like v2-host.test.ts.

const usage = { input_tokens: 5, output_tokens: 4, cache_read_input_tokens: 10, cache_creation_input_tokens: 1 }
const done = { type: "result", subtype: "success", is_error: false, session_id: "claude-1", result: "", usage } as unknown as SDKMessage
// Runs once the prompt is taken, as Claude Code would mid-turn: approvals and Orchestra tool calls.
let during: (options: Options) => Promise<void> = async () => {}
// Replaces the scripted turn when a test needs to interleave frames with calls.
let pump: ((input: AsyncIterable<SDKUserMessage>, options: Options) => AsyncGenerator<SDKMessage>) | undefined
beforeEach(() => {
  during = async () => {}
  pump = undefined
})

const sdk = Layer.succeed(
  ClaudeCodeSDK.Service,
  ClaudeCodeSDK.Service.of({
    query: ((input: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => {
      if (pump) return pump(input.prompt, input.options)
      return (async function* () {
        await input.prompt[Symbol.asyncIterator]().next()
        await during(input.options)
        yield done
      })()
    }) as unknown as typeof query,
  }),
)

const turnOf = (input: Partial<ExecutionHost.Turn> = {}): ExecutionHost.Turn => ({
  session: { id: SessionSchema.ID.make("ses_host"), location: { directory: "/project" } } as unknown as SessionSchema.Info,
  agent: AgentV2.Info.empty(AgentV2.ID.make("maestro")),
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
const provided = <A>(use: (host: ExecutionHost.Interface) => Effect.Effect<A>) =>
  Effect.runPromise(ClaudeCodeHost.make.pipe(Effect.flatMap(use), Effect.provide(sdk), Effect.provideService(ClaudeCodeSDK.Environment, {})))
const collect = (turn: ExecutionHost.Turn) => provided((host) => Stream.runCollect(host.stream(turn)))

const hookInput = (tool: string, input: Record<string, unknown>, id: string) =>
  ({ hook_event_name: "PreToolUse", tool_name: tool, tool_input: input, tool_use_id: id, session_id: "claude-1", transcript_path: "", cwd: "/project" }) as HookInput
const pre = (options: Options, tool: string, input: Record<string, unknown>, id: string, signal = new AbortController().signal) =>
  options.hooks?.PreToolUse?.[0]?.hooks[0]?.(hookInput(tool, input, id), id, { signal })
const permissionCall = (options: Options, tool: string, input: Record<string, unknown>, id: string) =>
  options.canUseTool?.(tool, input, { signal: new AbortController().signal, toolUseID: id, requestId: id })
const connectMcp = async (options: Options) => {
  const server = options.mcpServers?.orchestra as McpSdkServerConfigWithInstance
  const [client, transport] = InMemoryTransport.createLinkedPair()
  await server.instance.connect(transport)
  const mcp = new Client({ name: "test", version: "0" })
  await mcp.connect(client)
  return mcp
}
const plainTool = (name: string) => new ToolDefinition({ name, description: name, inputSchema: { type: "object", properties: {} } })

test("a call that never reaches MCP does not hand its tool_use id to the next call of the tool", async () => {
  const executed: string[] = []
  const run = () =>
    collect(turnOf({
      tools: [plainTool("task")],
      execute: (call) => Effect.sync(() => void executed.push(call.id)).pipe(Effect.as({ result: { type: "text" as const, value: "ok" } })),
    }))

  // The hook allowed tu-1, then the call was aborted before its MCP request: its id stays queued.
  during = async (options) => {
    await pre(options, "mcp__orchestra__task", { prompt: "first" }, "tu-1")
    await pre(options, "mcp__orchestra__task", { prompt: "second" }, "tu-2")
    const mcp = await connectMcp(options)
    await mcp.callTool({ name: "task", arguments: { prompt: "second" } })
    await mcp.close()
  }
  await run()
  expect(executed).toEqual(["tu-2"])

  // The same arguments cannot tell the two apart: the result frame that settles tu-1 drops its id.
  executed.length = 0
  pump = async function* (input, options) {
    await input[Symbol.asyncIterator]().next()
    await pre(options, "mcp__orchestra__task", { prompt: "go" }, "tu-1")
    yield {
      type: "user", session_id: "claude-1", parent_tool_use_id: null,
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tu-1", is_error: true, content: "Interrupted" }] },
    } as unknown as SDKMessage
    await new Promise((resolve) => setTimeout(resolve, 20))
    await pre(options, "mcp__orchestra__task", { prompt: "go" }, "tu-2")
    const mcp = await connectMcp(options)
    await mcp.callTool({ name: "task", arguments: { prompt: "go" } })
    await mcp.close()
    yield done
  }
  await run()
  expect(executed).toEqual(["tu-2"])
})

test("the governed playbook a session loaded belongs to its host and is let go past the bound", async () => {
  const probed: unknown[] = []
  let load = true
  // Loads the playbook when `load`, then asks for a governed tool: the answer says whether the gate is open.
  during = async (options) => {
    const mcp = await connectMcp(options)
    if (load) await mcp.callTool({ name: "skill", arguments: { name: "maestro-run-governed" } })
    probed.push(await permissionCall(options, "mcp__orchestra__maestro_plan", { goal: "x" }, `tu-${probed.length}`))
    await mcp.close()
  }
  const turnFor = (id: string) =>
    turnOf({
      session: { id: SessionSchema.ID.make(id), location: { directory: "/project" } } as unknown as SessionSchema.Info,
      tools: [plainTool("skill"), plainTool("maestro_plan")],
      execute: () => Effect.succeed({ result: { type: "text" as const, value: "ok" } }),
    })
  const open = { behavior: "allow", updatedInput: { goal: "x" } }
  const closed = { behavior: "deny", message: expect.stringContaining("maestro-run-governed") }

  // Another host (another process, or a test) never inherits the session's playbook.
  await collect(turnFor("ses_host"))
  load = false
  await collect(turnFor("ses_host"))
  expect(probed).toEqual([open, closed])

  // One host keeps it across turns (each turn is a new Claude Code process on the same session) until the bound.
  probed.length = 0
  const sessions = Array.from({ length: ClaudeCodeHost.GOVERNED_SESSIONS + 1 }, (_, index) => `ses_${index}`)
  await provided((host) =>
    Effect.forEach(
      [...sessions.map((id) => [id, true] as const), [sessions[0]!, false] as const, [sessions.at(-1)!, false] as const],
      ([id, loads]) => {
        load = loads
        return Stream.runCollect(host.stream(turnFor(id)))
      },
    ),
  )
  // The oldest session was let go and must load the playbook again; the newest still holds it.
  expect(probed.slice(0, sessions.length)).toEqual(sessions.map(() => open))
  expect(probed.slice(sessions.length)).toEqual([closed, open])
})

test("a decision cut short by an abort is not cached as a refusal", async () => {
  const asked: string[] = []
  const results: unknown[] = []
  during = async (options) => {
    const abort = new AbortController()
    const hooked = pre(options, "Bash", { command: "ls" }, "tu-1", abort.signal)
    for (let waited = 0; !asked.length && waited < 100; waited++) await new Promise((resolve) => setTimeout(resolve, 10))
    abort.abort()
    results.push(await hooked)
    // Claude Code asks again for the same call: it is decided afresh, not handed the earlier refusal.
    results.push(await permissionCall(options, "Bash", { command: "ls" }, "tu-1"))
  }
  await collect(turnOf({
    authorize: (input) =>
      Effect.sync(() => void asked.push(input.callID)).pipe(
        Effect.andThen(Effect.suspend(() => (asked.length === 1 ? Effect.never : Effect.succeed({})))),
      ),
  }))

  expect(results).toEqual([
    { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "Orchestra could not check this call, so it is refused." } },
    { behavior: "allow", updatedInput: { command: "ls" } },
  ])
  expect(asked).toEqual(["tu-1", "tu-1"])
})
