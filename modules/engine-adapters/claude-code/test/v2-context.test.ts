import { beforeEach, expect, test } from "bun:test"
import type { HookInput, McpSdkServerConfigWithInstance, Options, SDKMessage, SDKUserMessage, query } from "@anthropic-ai/claude-agent-sdk"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { ToolDefinition } from "@orchestra/llm"
import { AgentV2 } from "@orchestra/core/agent"
import { PermissionV2 } from "@orchestra/core/permission"
import { SessionSchema } from "@orchestra/core/session"
import { ToolSafety } from "@orchestra/core/tool-safety"
import type { ExecutionHost } from "@orchestra/core/session/runner"
import { Effect, Layer, Schema, Stream } from "effect"
import { QuestionV2 } from "@orchestra/core/question"
import { ClaudeHostOptions } from "../src/host/options"
import { ClaudeCodeSDK } from "../src/sdk"
import { ClaudeCodeHost, permission } from "../src/v2/host"

// The V2 Claude Code host, driven through the SDK seam with scripted frames: no Claude Code process, no Claude API.
// One SDK query is one provider turn; the next turn resumes the same Claude Code session with only the new message.

const calls: { prompt: unknown; options: Options | undefined }[] = []
// Frames, or frames built from the client uuid the host stamped on its prompt (Claude Code echoes it on its replies).
let script: SDKMessage[] | ((sent: string | undefined) => SDKMessage[]) = []
// Runs before the frames, as Claude Code would mid-turn: approvals and Orchestra tool calls.
let during: (options: Options) => Promise<void> = async () => {}
// A test that sets `during` would otherwise run its approvals and MCP calls inside every later test's turn.
beforeEach(() => {
  during = async () => {}
})

// Replaces the scripted frames when a test needs to read the whole streaming input or outlive the turn.
let pump: ((input: AsyncIterable<SDKUserMessage>, options: Options) => AsyncGenerator<SDKMessage>) | undefined

const sdk = Layer.succeed(
  ClaudeCodeSDK.Service,
  ClaudeCodeSDK.Service.of({
    query: ((input: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => {
      if (pump) return pump(input.prompt, input.options)
      const frames = script
      return (async function* () {
        const first = await input.prompt[Symbol.asyncIterator]().next()
        calls.push({ prompt: first.done ? undefined : first.value.message.content, options: input.options })
        await during(input.options)
        yield* typeof frames === "function" ? frames(first.done ? undefined : first.value.uuid) : frames
      })()
    }) as unknown as typeof query,
  }),
)

const frame = (value: Record<string, unknown>) => value as unknown as SDKMessage
const usage = { input_tokens: 5, output_tokens: 4, cache_read_input_tokens: 10, cache_creation_input_tokens: 1 }
const user = (id: string, text: string) => ({ id, type: "user", text, files: [], agents: [], time: { created: 0 } })

// The ports a Turn carries beyond the call-through basics; a test overrides the one it exercises.
const ports = {
  question: () => Effect.die("unused"),
  memory: { recall: Effect.succeed(undefined), archive: () => Effect.void },
  steers: Stream.empty,
  consumed: () => Effect.void,
  notify: () => Effect.void,
  todos: () => Effect.void,
} satisfies Pick<ExecutionHost.Turn, "question" | "memory" | "steers" | "consumed" | "notify" | "todos">

const turnOf = (input: Partial<ExecutionHost.Turn> = {}): ExecutionHost.Turn => ({
  session: { id: SessionSchema.ID.make("ses_host"), location: { directory: "/project" } } as unknown as SessionSchema.Info,
  agent: AgentV2.Info.empty(AgentV2.ID.make("maestro")),
  model: undefined,
  system: [],
  context: [],
  history: [user("msg_1", "Go")] as unknown as ExecutionHost.Turn["history"],
  tools: [],
  execute: () => Effect.die("unused"),
  authorize: () => Effect.die("unused"),
  ...ports,
  state: { get: Effect.succeed(undefined), update: () => Effect.void },
  ...input,
})
const collect = (turn: ExecutionHost.Turn) =>
  Effect.runPromise(
    ClaudeCodeHost.make.pipe(
      Effect.flatMap((host) => Stream.runCollect(host.stream(turn))),
      Effect.provide(sdk),
      Effect.provideService(ClaudeCodeSDK.Environment, {}),
    ),
  ).then((events) => Array.from(events))
const done = frame({ type: "result", subtype: "success", is_error: false, session_id: "claude-1", result: "", usage })

// Append to modules/engine-adapters/claude-code/test/v2-host.test.ts in an isolated CI harness.
// Uses that file's existing scripted SDK seam and production ClaudeCodeHost.make.
test("audit: materialized attachment context reaches Claude Code", async () => {
  script = [done]
  const before = calls.length
  await collect(turnOf({ history: [
    user("msg_attachment", "Summarize the attached document"),
    { id: "msg_materialized", type: "synthetic", text: "ATTACHMENT_CONTENT_NONCE_036", time: { created: 1 } },
  ] as unknown as ExecutionHost.Turn["history"] }))
  expect(calls.length).toBe(before + 1)
  expect(JSON.stringify(calls.at(-1)?.prompt)).toContain("ATTACHMENT_CONTENT_NONCE_036")
})

test("audit: image-only prompt is not silently completed without querying the host", async () => {
  script = [done]
  const before = calls.length
  await collect(turnOf({ history: [{
    ...user("msg_image", ""),
    files: [{ mime: "image/png", name: "probe.png", uri: "data:image/png;base64,iVBORw0KGgo=" }],
  }] as unknown as ExecutionHost.Turn["history"] }))
  expect(calls.length).toBe(before + 1)
  expect(JSON.stringify(calls.at(-1)?.prompt)).toContain("iVBORw0KGgo=")
})

test("canonical input lowering sends reminders, agent routing, shell and documents once", async () => {
  const stored = { value: undefined as unknown }
  const history = [
    { ...user("msg_input", "Review"), promptContext: { reminders: ["HOOK_NONCE"] }, agents: [{ name: "backend" }], files: [
      { mime: "application/pdf", name: "paper.pdf", uri: "data:application/pdf;base64,JVBERg==" },
      { mime: "text/plain", name: "note", uri: "data:text/plain;base64,Tk9URQ==" },
      { mime: "application/octet-stream", name: "local", uri: "file:///local" },
    ] },
    { id: "msg_skill", type: "synthetic", text: "SKILL_NONCE", time: { created: 1 } },
    { id: "msg_shell", type: "shell", command: "echo hi", output: "SHELL_NONCE", time: { created: 1 } },
  ] as unknown as ExecutionHost.Turn["history"]
  const turn = turnOf({ history, state: {
    get: Effect.sync(() => stored.value), update: (fn) => Effect.sync(() => void (stored.value = fn(stored.value))),
  } })
  script = [done]
  const before = calls.length
  await collect(turn)
  const sent = JSON.stringify(calls.at(-1)?.prompt)
  for (const text of ["HOOK_NONCE", "subagent: backend", "SKILL_NONCE", "Shell command: echo hi", "SHELL_NONCE", "NOTE", "Attached application/octet-stream: local", "JVBERg=="])
    expect(sent).toContain(text)
  expect(calls.at(-1)?.prompt).toContainEqual({ type: "document", source: { type: "base64", media_type: "application/pdf", data: "JVBERg==" }, title: "paper.pdf" })
  expect(stored.value).toMatchObject({ delivered: ["msg_input", "msg_skill", "msg_shell"] })
  await collect(turn)
  expect(calls.length).toBe(before + 1)
})

test("unsupported inline attachments fail visibly without marking input delivered", async () => {
  const before = calls.length
  const events = await collect(turnOf({ history: [{ ...user("msg_bad", "inspect"), files: [{ mime: "audio/wav", uri: "data:audio/wav;base64,YQ==" }] }] as unknown as ExecutionHost.Turn["history"] }))
  expect(events.some((event) => event.type === "provider-error")).toBe(true)
  expect(calls.length).toBe(before)
})

test("audit: Orchestra image tool output reaches the Claude MCP client as media", async () => {
  let reply: unknown
  during = async (options) => {
    const server = options.mcpServers?.orchestra as McpSdkServerConfigWithInstance
    const [client, transport] = InMemoryTransport.createLinkedPair()
    await server.instance.connect(transport)
    const mcp = new Client({ name: "audit", version: "0" })
    await mcp.connect(client)
    reply = await mcp.callTool({ name: "image_probe", arguments: {} })
    await mcp.close()
  }
  script = [done]
  await collect(turnOf({
    tools: [new ToolDefinition({ name: "image_probe", description: "probe", inputSchema: { type: "object", properties: {} } })],
    execute: () => Effect.succeed({ result: { type: "content", value: [{ type: "file", mime: "image/png", uri: "data:image/png;base64,iVBORw0KGgo=" }] } }),
  }))
  expect(reply).toMatchObject({ content: [{ type: "image", mimeType: "image/png", data: "iVBORw0KGgo=" }] })
})

test("MCP bridge preserves mixed document/text and errors, and refuses unsupported media", async () => {
  const replies: unknown[] = []
  during = async (options) => {
    const server = options.mcpServers?.orchestra as McpSdkServerConfigWithInstance
    const [client, transport] = InMemoryTransport.createLinkedPair()
    await server.instance.connect(transport)
    const mcp = new Client({ name: "media", version: "0" })
    await mcp.connect(client)
    for (const mode of ["mixed", "unsupported", "unresolved", "error"]) replies.push(await mcp.callTool({ name: "probe", arguments: { mode } }))
    await mcp.close()
  }
  script = [done]
  await collect(turnOf({ tools: [new ToolDefinition({ name: "probe", description: "probe", inputSchema: { type: "object" } })],
    execute: (call) => {
      const input = Schema.decodeUnknownSync(Schema.Struct({ mode: Schema.String }))(call.input)
      return Effect.succeed({ result: input.mode === "error" ? { type: "error", value: "failed" } : { type: "content", value: [
        { type: "text", text: "caption" },
        { type: "file", mime: input.mode === "unsupported" ? "video/mp4" : "application/pdf", uri: input.mode === "unresolved" ? "file:///document" : "data:application/pdf;base64,JVBERg==" },
      ] } })
    },
  }))
  expect(replies[0]).toMatchObject({ content: [{ type: "text", text: "caption" }, { type: "resource", resource: { mimeType: "application/pdf", blob: "JVBERg==" } }] })
  expect(replies[1]).toMatchObject({ isError: true })
  expect(replies[2]).toMatchObject({ isError: true })
  expect(replies[3]).toMatchObject({ isError: true, content: [{ type: "text", text: "failed" }] })
})
