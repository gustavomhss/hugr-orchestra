import type {
  PermissionV2Request,
  QuestionV2Request,
  SessionMessageAssistant,
  SessionMessageAssistantTool,
  SessionMessageUser,
} from "../types"

type Content = SessionMessageAssistant["content"][number]

// Demo mode (`run --mini --demo`): slash commands that put synthetic output on screen instead of running a model
// turn, to check formatting and the permission and question prompts without a provider.
//   /fmt <kind>        a message of one kind: markdown, table, text, reasoning, bash, write, edit, patch, task, todo,
//                      question, error or mix
//   /permission [kind] a permission request: edit, bash, read, task, external or doom
//   /question [kind]   a question request: multi, single, checklist or custom

export const FORMATS = ["markdown", "table", "text", "reasoning", "bash", "write", "edit", "patch", "task", "todo", "question", "error", "mix"] as const
export const PERMISSIONS = ["edit", "bash", "read", "task", "external", "doom"] as const
export const QUESTIONS = ["multi", "single", "checklist", "custom"] as const

export type Command =
  | { readonly type: "fmt"; readonly kind: (typeof FORMATS)[number] }
  | { readonly type: "permission"; readonly kind: (typeof PERMISSIONS)[number] }
  | { readonly type: "question"; readonly kind: (typeof QUESTIONS)[number] }
  | { readonly type: "invalid"; readonly message: string }

/** The demo command a line of input names, or undefined when it is an ordinary prompt. */
export function parse(input: string): Command | undefined {
  const [name, argument] = input.trim().split(/\s+/)
  if (name === "/fmt") {
    const kind = FORMATS.find((item) => item === (argument ?? "").toLowerCase())
    return kind ? { type: "fmt", kind } : { type: "invalid", message: `Usage: /fmt <${FORMATS.join("|")}>` }
  }
  if (name === "/permission") {
    const kind = PERMISSIONS.find((item) => item === (argument ?? "edit").toLowerCase())
    return kind ? { type: "permission", kind } : { type: "invalid", message: `Usage: /permission [${PERMISSIONS.join("|")}]` }
  }
  if (name === "/question") {
    const kind = QUESTIONS.find((item) => item === (argument ?? "multi").toLowerCase())
    return kind ? { type: "question", kind } : { type: "invalid", message: `Usage: /question [${QUESTIONS.join("|")}]` }
  }
  return undefined
}

/** The tool a demo permission request is for. */
export const PERMISSION_TOOLS = { edit: "edit", bash: "bash", read: "read", task: "task", external: "read", doom: "bash" } as const

/** Ids of everything the demo makes up start with this, so a reply to one is answered locally. */
export const PREFIX = "demo_"

export function isDemoRequest(id: string) {
  return id.startsWith(PREFIX)
}

const MARKDOWN = [
  "# Direct Mode Demo",
  "",
  "This is a realistic assistant response for formatting checks. It mixes **bold**, _italic_, `inline code`, links and code fences.",
  "",
  "- Restored the final markdown flush so the last block is committed on idle.",
  "- Added regression coverage for split rendering.",
  "",
  "| Area | Before | After |",
  "| --- | --- | --- |",
  "| Direct mode | Missing final rows | Stable |",
  "| Tables | Dropped in streaming | Visible |",
  "",
  "```ts",
  "const result = { markdown: true, tables: 1, stable: true }",
  "```",
].join("\n")

const TABLE = [
  "| Kind | Example | Notes |",
  "| --- | --- | --- |",
  "| Pipe | `A\\|B` | Escaped pipes stay in one cell |",
  "| Unicode | `漢字` | Wide characters stay aligned |",
  "| Wrap | `LongTokenWithoutNaturalBreaks_1234567890` | Width stress |",
].join("\n")

/** A completed assistant message with the content one `/fmt` kind shows. */
export function message(
  kind: (typeof FORMATS)[number],
  options: { readonly now: number; readonly sequence: number; readonly cwd: string; readonly agent: string },
): SessionMessageAssistant {
  const id = `${PREFIX}msg_${options.sequence}`
  const time = { created: options.now, completed: options.now }
  let n = 0
  const text = (value: string): Content => ({ id: `${id}_${n++}`, type: "text", text: value })
  const tool = (name: string, input: Record<string, unknown>, output: string, structured: Record<string, unknown> = {}): Content => ({
    id: `${id}_call_${n++}`,
    type: "tool",
    name,
    provider: { executed: false },
    state: { status: "completed", input, content: [{ type: "text", text: output }], structured: { title: name, ...structured } },
    time: { created: options.now, ran: options.now, completed: options.now },
  })
  const reasoning = (value: string): Content => ({ id: `${id}_${n++}`, type: "reasoning", text: value, time })
  const content: Record<(typeof FORMATS)[number], () => Content[]> = {
    markdown: () => [text(MARKDOWN)],
    table: () => [text(TABLE)],
    text: () => [text("Plain assistant text with a second sentence to check wrapping at the edge of the terminal.")],
    reasoning: () => [reasoning("Weighing two approaches before answering."), text("Went with the simpler one.")],
    bash: () => [tool("bash", { command: "ls -la", description: "List files" }, "total 0\ndrwxr-xr-x  2 user  staff  64 Jan  1 00:00 .", { output: "total 0" })],
    write: () => [tool("write", { filePath: `${options.cwd}/demo.txt`, content: "hello\n" }, "Wrote file", {})],
    edit: () => [
      tool("edit", { filePath: `${options.cwd}/demo.txt`, oldString: "hello", newString: "hello world" }, "Edited file", {
        diff: "--- a/demo.txt\n+++ b/demo.txt\n@@ -1 +1 @@\n-hello\n+hello world\n",
      }),
    ],
    patch: () => [tool("apply_patch", { patchText: "*** Begin Patch\n*** Update File: demo.txt\n@@\n-hello\n+hello world\n*** End Patch" }, "Patched demo.txt", {})],
    task: () => [tool("task", { description: "Explore the repo", prompt: "Find the entrypoint", subagent_type: "explore" }, "Found src/index.ts", {})],
    todo: () => [
      tool(
        "todowrite",
        { todos: [{ content: "Write the demo", status: "completed", priority: "high" }, { content: "Run it", status: "in_progress", priority: "medium" }] },
        "2 todos",
        {},
      ),
    ],
    question: () => [
      tool("question", { questions: [{ question: "Which one?", header: "Pick", options: [{ label: "A", description: "first" }] }] }, "Answered: A", {}),
    ],
    error: () => [
      {
        id: `${id}_call`,
        type: "tool",
        name: "bash",
        provider: { executed: false },
        state: {
          status: "error",
          input: { command: "false" },
          content: [],
          structured: {},
          error: { type: "unknown", message: "Command exited with code 1" },
        },
        time: { created: options.now, ran: options.now, completed: options.now },
      },
    ],
    mix: () => [reasoning("Plan: list, then summarise."), tool("bash", { command: "ls" }, "demo.txt", { output: "demo.txt" }), text(MARKDOWN)],
  }
  return {
    id,
    type: "assistant",
    agent: options.agent,
    model: { id: "demo", providerID: "demo" },
    content: content[kind](),
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    finish: "stop",
    time,
  }
}

export function permission(sessionID: string, kind: (typeof PERMISSIONS)[number], sequence: number): PermissionV2Request {
  const patterns: Record<(typeof PERMISSIONS)[number], string[]> = {
    edit: ["demo.txt"],
    bash: ["ls -la"],
    read: ["demo.txt"],
    task: ["explore"],
    external: ["/tmp/*"],
    doom: ["doom"],
  }
  return { id: `${PREFIX}per_${sequence}`, sessionID, action: kind, resources: patterns[kind], metadata: {}, save: patterns[kind] }
}

export function question(sessionID: string, kind: (typeof QUESTIONS)[number], sequence: number): QuestionV2Request {
  const options = [
    { label: "Alpha", description: "First option" },
    { label: "Beta", description: "Second option" },
  ]
  const info: Record<(typeof QUESTIONS)[number], QuestionV2Request["questions"]> = {
    multi: [
      { question: "Pick a letter", header: "Letter", options, multiple: false },
      { question: "Pick any of these", header: "Many", options, multiple: true },
    ],
    single: [{ question: "Pick one", header: "One", options, multiple: false }],
    checklist: [{ question: "Pick several", header: "Several", options, multiple: true }],
    custom: [{ question: "Type your own", header: "Custom", options, multiple: false, custom: true }],
  }
  return { id: `${PREFIX}que_${sequence}`, sessionID, questions: info[kind] }
}

/** The user message that carries the demo command the person typed. */
export function user(text: string, options: { readonly now: number; readonly sequence: number }): SessionMessageUser {
  return { id: `${PREFIX}usr_${options.sequence}`, type: "user", text, time: { created: options.now } }
}

type Waiting = {
  readonly messageID: string
  readonly tool: SessionMessageAssistantTool
  readonly done: { readonly title: string; readonly output: string }
}

// The synthetic tool call each unanswered demo request is waiting on, by request id.
const waiting = new Map<string, Waiting>()

/** An assistant message holding a running tool call for a demo request, which the request's tool field points at. */
export function waitingMessage(
  request: { readonly id: string; readonly tool: string; readonly input: Record<string, unknown>; readonly done: Waiting["done"] },
  options: { readonly now: number; readonly sequence: number; readonly cwd: string; readonly agent: string },
): { message: SessionMessageAssistant; tool: { messageID: string; callID: string } } {
  const built = message("text", options)
  const tool: SessionMessageAssistantTool = {
    id: `${built.id}_call`,
    type: "tool",
    name: request.tool,
    provider: { executed: false },
    state: { status: "running", input: request.input, structured: {}, content: [] },
    time: { created: options.now, ran: options.now },
  }
  waiting.set(request.id, { messageID: built.id, tool, done: request.done })
  return {
    message: { ...built, content: [tool], finish: undefined, time: { created: options.now } },
    tool: { messageID: built.id, callID: tool.id },
  }
}

/**
 * Settles the tool call a demo request waited on: an accepted permission completes it, a rejected permission or
 * question fails it, and an answered question completes it with the answers in its metadata.
 */
export function settle(
  requestID: string,
  outcome: { readonly type: "completed"; readonly answers?: readonly (readonly string[])[] } | { readonly type: "error"; readonly error: string },
  now = Date.now(),
): { messageID: string; tool: SessionMessageAssistantTool } | undefined {
  const entry = waiting.get(requestID)
  if (!entry) return undefined
  waiting.delete(requestID)
  const input = entry.tool.state.status === "pending" ? {} : entry.tool.state.input
  const time = { ...entry.tool.time, completed: now }
  if (outcome.type === "error")
    return {
      messageID: entry.messageID,
      tool: {
        ...entry.tool,
        state: { status: "error", input, content: [], structured: {}, error: { type: "unknown", message: outcome.error } },
        time,
      },
    }
  return {
    messageID: entry.messageID,
    tool: {
      ...entry.tool,
      state: {
        status: "completed",
        input,
        content: [{ type: "text", text: entry.done.output }],
        structured: { title: entry.done.title },
        metadata: outcome.answers ? { answers: outcome.answers.map((answer) => [...answer]) } : undefined,
      },
      time,
    },
  }
}
