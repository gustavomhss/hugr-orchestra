import type { AssistantMessage, Message, Part, ToolPart, PermissionRequest, QuestionRequest } from "../compat/schema"

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

/** A completed assistant message with the parts one `/fmt` kind shows. */
export function message(
  sessionID: string,
  parentID: string,
  kind: (typeof FORMATS)[number],
  options: { readonly now: number; readonly sequence: number; readonly cwd: string; readonly agent: string },
): { info: AssistantMessage; parts: Part[] } {
  const id = `${PREFIX}msg_${options.sequence}`
  const base = { sessionID, messageID: id }
  const time = { start: options.now, end: options.now }
  let n = 0
  const text = (value: string): Part => ({ ...base, id: `${id}_${n++}`, type: "text", text: value })
  const tool = (name: string, input: Record<string, unknown>, output: string, metadata: Record<string, unknown> = {}): Part => ({
    ...base,
    id: `${id}_${n++}`,
    type: "tool",
    callID: `${id}_call_${n}`,
    tool: name,
    state: { status: "completed", input, output, title: name, metadata, time },
  })
  const reasoning = (value: string): Part => ({ ...base, id: `${id}_${n++}`, type: "reasoning", text: value, time })
  const parts: Record<(typeof FORMATS)[number], () => Part[]> = {
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
        ...base,
        id: `${id}_${n++}`,
        type: "tool",
        callID: `${id}_call`,
        tool: "bash",
        state: { status: "error", input: { command: "false" }, error: "Command exited with code 1", time },
      },
    ],
    mix: () => [reasoning("Plan: list, then summarise."), tool("bash", { command: "ls" }, "demo.txt", { output: "demo.txt" }), text(MARKDOWN)],
  }
  return {
    info: {
      id,
      sessionID,
      role: "assistant",
      time: { created: options.now, completed: options.now },
      parentID,
      modelID: "demo",
      providerID: "demo",
      mode: options.agent,
      agent: options.agent,
      path: { cwd: options.cwd, root: options.cwd },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      finish: "stop",
    },
    parts: parts[kind](),
  }
}

export function permission(sessionID: string, kind: (typeof PERMISSIONS)[number], sequence: number): PermissionRequest {
  const patterns: Record<(typeof PERMISSIONS)[number], string[]> = {
    edit: ["demo.txt"],
    bash: ["ls -la"],
    read: ["demo.txt"],
    task: ["explore"],
    external: ["/tmp/*"],
    doom: ["doom"],
  }
  return { id: `${PREFIX}per_${sequence}`, sessionID, permission: kind, patterns: patterns[kind], metadata: {}, always: patterns[kind] }
}

export function question(sessionID: string, kind: (typeof QUESTIONS)[number], sequence: number): QuestionRequest {
  const options = [
    { label: "Alpha", description: "First option" },
    { label: "Beta", description: "Second option" },
  ]
  const info: Record<(typeof QUESTIONS)[number], QuestionRequest["questions"]> = {
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
export function user(
  sessionID: string,
  text: string,
  options: { readonly now: number; readonly sequence: number; readonly agent: string },
): { info: Message; parts: Part[] } {
  const id = `${PREFIX}usr_${options.sequence}`
  return {
    info: { id, sessionID, role: "user", time: { created: options.now }, agent: options.agent, model: { providerID: "demo", modelID: "demo" } },
    parts: [{ sessionID, messageID: id, id: `${id}_0`, type: "text", text }],
  }
}

type Waiting = { readonly part: Extract<Part, { type: "tool" }>; readonly done: { readonly title: string; readonly output: string } }

// The synthetic tool part each unanswered demo request is waiting on, by request id.
const waiting = new Map<string, Waiting>()

/** An assistant message holding a running tool part for a demo request, which the request's tool field points at. */
export function waitingMessage(
  sessionID: string,
  parentID: string,
  request: { readonly id: string; readonly tool: string; readonly input: Record<string, unknown>; readonly done: Waiting["done"] },
  options: { readonly now: number; readonly sequence: number; readonly cwd: string; readonly agent: string },
): { info: AssistantMessage; parts: Part[]; tool: { messageID: string; callID: string } } {
  const built = message(sessionID, parentID, "text", options)
  const part: Waiting["part"] = {
    sessionID,
    messageID: built.info.id,
    id: `${built.info.id}_wait`,
    type: "tool",
    callID: `${built.info.id}_call`,
    tool: request.tool,
    state: { status: "running", input: request.input, time: { start: options.now } },
  }
  waiting.set(request.id, { part, done: request.done })
  return { info: { ...built.info, time: { created: options.now } }, parts: [part], tool: { messageID: built.info.id, callID: part.callID } }
}

/**
 * Settles the tool part a demo request waited on, as V1's demo did: an accepted permission completes it, a rejected
 * permission or question fails it, and an answered question completes it with the answers in its metadata.
 */
export function settle(
  requestID: string,
  outcome: { readonly type: "completed"; readonly answers?: readonly (readonly string[])[] } | { readonly type: "error"; readonly error: string },
  now = Date.now(),
): ToolPart | undefined {
  const entry = waiting.get(requestID)
  if (!entry) return undefined
  waiting.delete(requestID)
  const state = entry.part.state
  const start = state.status === "running" ? state.time.start : now
  return {
    ...entry.part,
    state:
      outcome.type === "error"
        ? { status: "error", input: state.input, error: outcome.error, metadata: {}, time: { start, end: now } }
        : {
            status: "completed",
            input: state.input,
            output: entry.done.output,
            title: entry.done.title,
            metadata: outcome.answers ? { answers: outcome.answers } : {},
            time: { start, end: now },
          },
  }
}
