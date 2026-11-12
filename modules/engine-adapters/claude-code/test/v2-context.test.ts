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
import { Cause, Effect, Exit, Layer, Schema, Stream } from "effect"
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

test("audit: all background completions are delivered before closing a Claude query", async () => {
  const notified: { id: string; text: string }[] = []
  const trace = { closed: false }
  pump = async function* (input, options) {
    options.abortController?.signal.addEventListener("abort", () => void (trace.closed = true), { once: true })
    await input[Symbol.asyncIterator]().next()
    yield frame({ type: "system", subtype: "background_tasks_changed", tasks: [
      { task_id: "t1", task_type: "bash", description: "first" },
      { task_id: "t2", task_type: "bash", description: "second" },
    ] })
    yield done
    // The active list can empty before queued completion notifications have been read.
    yield frame({ type: "system", subtype: "background_tasks_changed", tasks: [] })
    yield frame({ type: "system", subtype: "task_notification", task_id: "t1", status: "completed", summary: "first", output_file: "/tmp/t1.out" })
    yield frame({ type: "system", subtype: "task_notification", task_id: "t2", status: "completed", summary: "second", output_file: "/tmp/t2.out" })
    yield frame({ type: "system", subtype: "background_tasks_changed", tasks: [] })
  }
  try {
    await collect(turnOf({ notify: (input) => Effect.sync(() => void notified.push(input)) }))
    for (let waited = 0; !trace.closed && waited < 100; waited++) await new Promise((resolve) => setTimeout(resolve, 20))
    expect(notified.map((item) => item.id)).toEqual([
      "msg_ses_host_task_t1_completed", "msg_ses_host_task_t2_completed",
    ])
  } finally {
    pump = undefined
  }
})

test("PostCompact archives carry explicit identity and are not replayed after history reload", async () => {
  const stored = { value: undefined as unknown }
  const archived: Array<ExecutionHost.Turn["history"][number]> = []
  const state: ExecutionHost.Turn["state"] = { get: Effect.sync(() => stored.value), update: (fn) => Effect.sync(() => void (stored.value = fn(stored.value))) }
  during = async (options) => {
    await options.hooks?.PostCompact?.[0]?.hooks[0]?.({ hook_event_name: "PostCompact", compact_summary: "SDK_OWNED_SUMMARY", trigger: "auto", session_id: "claude-1", transcript_path: "", cwd: "/project" } as HookInput, undefined, { signal: new AbortController().signal })
  }
  script = [done]
  const before = calls.length
  await collect(turnOf({ state, memory: { recall: Effect.succeed(undefined), archive: (value) => Effect.sync(() => {
    const record = value as typeof value & { messageID?: string }
    archived.push({ id: record.messageID ?? "msg_archive_fallback", type: "synthetic", text: `Engine compaction summary (${value.trigger}):\nNative owner: ${value.nativeSessionID}\n\n${value.summary}`, time: { created: 1 } } as ExecutionHost.Turn["history"][number])
  }) } }))
  expect(archived).toHaveLength(1)
  during = async () => {}
  await collect(turnOf({ state, history: [user("msg_1", "Go"), ...archived] as ExecutionHost.Turn["history"] }))
  expect(calls.length).toBe(before + 1)
  expect(stored.value).toMatchObject({ delivered: expect.arrayContaining([archived[0]!.id]) })
})

test("tracked work receives a durable pending notice before cancellation, query failure or unsuccessful result aborts it", async () => {
  for (const mode of ["cancel", "throw", "error"]) {
    const notified: Array<{ id: string; text: string }> = []
    let ready: () => void = () => {}
    const reached = new Promise<void>((resolve) => { ready = resolve })
    let notifiedBeforeAbort = false
    pump = async function* (input, options) {
      await input[Symbol.asyncIterator]().next()
      options.abortController?.signal.addEventListener("abort", () => { notifiedBeforeAbort = notified.length === 1 }, { once: true })
      yield frame({ type: "system", subtype: "background_tasks_changed", tasks: [{ task_id: "pending", task_type: "bash", description: "work" }] })
      ready()
      if (mode === "throw") throw new Error("query broke")
      if (mode === "error") { yield frame({ type: "result", subtype: "error_during_execution", is_error: true, session_id: "claude-1", errors: ["failed"], usage }); return }
      await new Promise<void>(() => {})
    }
    const signal = new AbortController()
    try {
      const host = await Effect.runPromise(ClaudeCodeHost.make.pipe(Effect.provide(sdk), Effect.provideService(ClaudeCodeSDK.Environment, {})))
      const running = Effect.runPromise(Stream.runCollect(host.stream(turnOf({ notify: (event) => Effect.sync(() => void notified.push(event)) }))), { signal: signal.signal }).catch(() => undefined)
      await reached
      if (mode === "cancel") signal.abort()
      await running
      expect(notified).toHaveLength(1)
      expect(notified[0]?.text).toContain("pending")
      expect(notifiedBeforeAbort).toBe(true)
      pump = undefined
      script = [done]
      await Effect.runPromise(Stream.runCollect(host.stream(turnOf({ history: [user("msg_next", "Continue")] as ExecutionHost.Turn["history"] }))))
      expect(notified).toHaveLength(1)
    } finally { pump = undefined }
  }
})

test("ambient and skip_transcript notifications never wake the Session in foreground or tail", async () => {
  const notified: Array<{ id: string; text: string }> = []
  let closed: () => void = () => {}
  const ended = new Promise<void>((resolve) => { closed = resolve })
  pump = async function* (input, options) {
    await input[Symbol.asyncIterator]().next()
    options.abortController?.signal.addEventListener("abort", closed, { once: true })
    yield frame({ type: "system", subtype: "background_tasks_changed", tasks: [{ task_id: "real", task_type: "bash", description: "work" }, { task_id: "watcher", ambient: true }] })
    yield frame({ type: "system", subtype: "task_notification", task_id: "foreground_ambient", ambient: true, status: "completed", summary: "watcher", output_file: "" })
    yield frame({ type: "system", subtype: "task_notification", task_id: "foreground_skip", skip_transcript: true, status: "completed", summary: "watcher", output_file: "" })
    yield done
    yield frame({ type: "system", subtype: "task_notification", task_id: "watcher", ambient: true, status: "completed", summary: "watcher", output_file: "" })
    yield frame({ type: "system", subtype: "task_notification", task_id: "tail_skip", skip_transcript: true, status: "completed", summary: "watcher", output_file: "" })
    // A tracked task can later become ambient: retire it without admitting a steer.
    yield frame({ type: "system", subtype: "task_notification", task_id: "real", ambient: true, status: "completed", summary: "watcher", output_file: "" })
  }
  try {
    await collect(turnOf({ notify: (event) => Effect.sync(() => void notified.push(event)) }))
    await ended
    expect(notified).toEqual([])
  } finally { pump = undefined }
})

test("failed PostCompact publication never marks an archive delivered", async () => {
  const stored = { value: undefined as unknown }
  during = async (options) => {
    await options.hooks?.PostCompact?.[0]?.hooks[0]?.({ hook_event_name: "PostCompact", compact_summary: "failed", trigger: "auto", session_id: "claude-1", transcript_path: "", cwd: "/project" } as HookInput, undefined, { signal: new AbortController().signal })
  }
  script = [done]
  await collect(turnOf({
    state: { get: Effect.sync(() => stored.value), update: (fn) => Effect.sync(() => void (stored.value = fn(stored.value))) },
    memory: { recall: Effect.succeed(undefined), archive: () => Effect.die("archive publish failed") },
  }))
  expect(stored.value).toMatchObject({ delivered: ["msg_1"] })
})

test("notify defect still settles handed input and closes the query without replay after cancellation or error", async () => {
  for (const mode of ["cancel", "error"]) {
    const stored = { value: undefined as unknown }
    const state: ExecutionHost.Turn["state"] = { get: Effect.sync(() => stored.value), update: (fn) => Effect.sync(() => void (stored.value = fn(stored.value))) }
    let ready: () => void = () => {}
    const reached = new Promise<void>((resolve) => { ready = resolve })
    let closed = false
    let noticeAttempts = 0
    pump = async function* (input, options) {
      const incoming = input[Symbol.asyncIterator]()
      await incoming.next()
      // Asking for the next message acknowledges that the SDK wrote the first one to its transcript.
      const waiting = incoming.next()
      options.abortController?.signal.addEventListener("abort", () => { closed = true }, { once: true })
      yield frame({ type: "system", subtype: "background_tasks_changed", tasks: [{ task_id: "pending", task_type: "bash", description: "work" }] })
      ready()
      if (mode === "error") throw new Error("QUERY_FAILED_BEFORE_RESULT")
      await waiting
    }
    const signal = new AbortController()
    try {
      const host = await Effect.runPromise(ClaudeCodeHost.make.pipe(Effect.provide(sdk), Effect.provideService(ClaudeCodeSDK.Environment, {})))
      const providerErrors: string[] = []
      const running = Effect.runPromiseExit(host.stream(turnOf({ state, notify: () => Effect.sync(() => { noticeAttempts++; throw new Error("NOTICE_WRITE_FAILED") }) })).pipe(
        Stream.runForEach((event) => Effect.sync(() => { if (event.type === "provider-error") providerErrors.push(event.message) })),
      ), { signal: signal.signal })
      await reached
      if (mode === "cancel") signal.abort()
      const exit = await running
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(Cause.pretty(exit.cause)).toContain("NOTICE_WRITE_FAILED")
        if (mode === "cancel") expect(Cause.hasInterrupts(exit.cause)).toBe(true)
      }
      if (mode === "error") expect(providerErrors).toContain("QUERY_FAILED_BEFORE_RESULT")
      expect(noticeAttempts).toBe(1)
      expect(closed).toBe(true)
      expect(stored.value).toMatchObject({ delivered: ["msg_1"] })
      pump = undefined
      script = [done]
      const before = calls.length
      await Effect.runPromise(Stream.runCollect(host.stream(turnOf({ state }))))
      expect(calls.length).toBe(before)
    } finally { pump = undefined }
  }
})
