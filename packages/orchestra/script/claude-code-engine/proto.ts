// Prototype: Claude Code as Orchestra's harness.
// - Claude Code (Agent SDK) runs the loop and the model, on the machine's Claude Code login.
// - Orchestra's read, edit and write replace the built-in file tools (in-process SDK tools, aliased).
// - Claude Code's auto-compaction is off; between turns Orchestra swaps the loaded context through the
//   SDK session store: a compact boundary, Orchestra's working memory as the summary, and the last turn verbatim.
// Usage: bun script/claude-code-engine/proto.ts <workspace-dir>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { Effect } from "effect"
import { z } from "zod"
import { createSdkMcpServer, query, tool, type SessionStore } from "@anthropic-ai/claude-agent-sdk"
import { AppRuntime } from "@/effect/app-runtime"
import { InstanceStore } from "@/project/instance-store"
import { MessageID, SessionID } from "@/session/schema"
import * as Tool from "@/tool/tool"
import { ReadTool } from "@/tool/read"
import { EditTool } from "@/tool/edit"
import { WriteTool } from "@/tool/write"

const WORKSPACE = path.resolve(process.argv[2] ?? "")
if (!process.argv[2]) throw new Error("usage: bun script/claude-code-engine/proto.ts <workspace-dir>")
mkdirSync(WORKSPACE, { recursive: true })
writeFileSync(path.join(WORKSPACE, "notes.txt"), "status: draft\nowner: nobody\n")

const inInstance = <A>(effect: Effect.Effect<A, unknown, any>) =>
  AppRuntime.runPromise(InstanceStore.Service.use((store) => store.provide({ directory: WORKSPACE }, effect as never)) as never) as Promise<A>

// ---- Orchestra's file tools, exposed to Claude Code ----
const orchestraSession = SessionID.descending()
const context = (): Tool.Context => ({
  sessionID: orchestraSession, messageID: MessageID.ascending(), agent: "claude-code", abort: new AbortController().signal,
  messages: [], metadata: () => Effect.void,
  // Prototype: every permission is granted. The real engine routes ctx.ask to Orchestra's permission service.
  ask: () => Effect.void,
})
const calls: string[] = []
const bridge = (name: string, define: Effect.Effect<any, any, any>) => async (args: Record<string, unknown>) => {
  calls.push(name)
  const result = await inInstance(Effect.gen(function* () {
    const info = yield* Tool.init(yield* define)
    return yield* info.execute(args as never, context())
  })).catch((error: unknown) => ({ output: `Error: ${error instanceof Error ? error.message : String(error)}`, failed: true }))
  return { content: [{ type: "text" as const, text: (result as { output: string }).output }], isError: "failed" in result }
}
const orchestra = createSdkMcpServer({
  name: "orchestra",
  tools: [
    tool("read", readFileSync(path.join(import.meta.dir, "../../src/tool/read.txt"), "utf8"),
      { filePath: z.string(), offset: z.number().int().optional(), limit: z.number().int().positive().optional() },
      bridge("read", ReadTool)),
    tool("edit", readFileSync(path.join(import.meta.dir, "../../src/tool/edit.txt"), "utf8"),
      { filePath: z.string(), oldString: z.string(), newString: z.string(), replaceAll: z.boolean().optional() },
      bridge("edit", EditTool)),
    tool("write", readFileSync(path.join(import.meta.dir, "../../src/tool/write.txt"), "utf8"),
      { filePath: z.string(), content: z.string() },
      bridge("write", WriteTool)),
  ],
})

// ---- Session store: Orchestra keeps every entry; on resume it decides what the session loads ----
type Entry = Record<string, any> & { type: string; uuid?: string; parentUuid?: string | null }
const archive = new Map<string, Entry[]>()
const swapped = new Map<string, Entry[]>()
const keyOf = (key: { projectKey: string; sessionId: string; subpath?: string }) =>
  `${key.projectKey}:${key.sessionId}${key.subpath ? `:${key.subpath}` : ""}`
const store: SessionStore = {
  append: async (key, entries) => { archive.set(keyOf(key), [...archive.get(keyOf(key)) ?? [], ...(entries as Entry[])]) },
  load: async (key) => swapped.get(keyOf(key)) ?? archive.get(keyOf(key)) ?? null,
}

/** The compacted transcript: a boundary, the working memory as the summary, then the last turn re-chained. */
function compacted(entries: Entry[], memory: string): Entry[] {
  const chain = entries.filter((entry) => entry.uuid && (entry.type === "user" || entry.type === "assistant"))
  // The last turn starts at the last user entry that is a prompt, not a tool result.
  const prompt = (entry: Entry) => entry.type === "user" && !entry.isMeta &&
    !(Array.isArray(entry.message?.content) && entry.message.content.some((part: any) => part.type === "tool_result"))
  const start = chain.findLastIndex(prompt)
  const tail = chain.slice(start)
  const base = { isSidechain: false, userType: "external", cwd: tail[0].cwd, sessionId: tail[0].sessionId, version: tail[0].version,
    gitBranch: tail[0].gitBranch, entrypoint: tail[0].entrypoint }
  const boundary: Entry = { ...base, parentUuid: null, logicalParentUuid: tail[0].parentUuid ?? null, type: "system",
    subtype: "compact_boundary", content: "Conversation compacted", isMeta: false, level: "info", uuid: randomUUID(),
    timestamp: new Date().toISOString(), compactMetadata: { trigger: "manual", preTokens: 0 } }
  const summary: Entry = { ...base, parentUuid: boundary.uuid, type: "user", isCompactSummary: true, isVisibleInTranscriptOnly: true,
    uuid: randomUUID(), timestamp: boundary.timestamp, message: { role: "user", content: memory } }
  let parent = summary.uuid!
  const rechained = tail.map((entry) => {
    const next = { ...entry, parentUuid: parent }
    parent = entry.uuid!
    return next
  })
  return [boundary, summary, ...rechained]
}

// ---- Run ----
const options = {
  cwd: WORKSPACE,
  tools: ["Glob", "Grep"],
  disallowedTools: ["Read", "Edit", "Write", "NotebookEdit"],
  toolAliases: { Read: "mcp__orchestra__read", Edit: "mcp__orchestra__edit", Write: "mcp__orchestra__write" },
  mcpServers: { orchestra },
  allowedTools: ["mcp__orchestra__read", "mcp__orchestra__edit", "mcp__orchestra__write", "Glob", "Grep"],
  systemPrompt: { type: "preset" as const, preset: "claude_code" as const,
    append: "You run inside Orchestra. Read, edit and write files only with the mcp__orchestra__read, mcp__orchestra__edit and mcp__orchestra__write tools." },
  settings: { autoCompactEnabled: false },
  sessionStore: store,
  model: process.env.PROTO_MODEL ?? "claude-haiku-4-5-20251001",
}

async function turn(prompt: string, resume?: string) {
  let sessionId = resume ?? ""
  let text = ""
  let input = 0
  const tools: string[] = []
  for await (const message of query({ prompt, options: { ...options, ...(resume ? { resume } : {}) } })) {
    if (message.type === "system" && message.subtype === "init") sessionId = message.session_id
    if (message.type === "assistant") {
      const usage = message.message.usage
      input = Math.max(input, (usage?.input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0))
      for (const part of message.message.content) {
        if (part.type === "text") text += part.text
        if (part.type === "tool_use") tools.push(part.name)
      }
    }
    if (message.type === "result" && message.subtype !== "success") throw new Error(`turn failed: ${message.subtype}`)
  }
  return { sessionId, text: text.trim(), input, tools }
}

const one = await turn(`Read notes.txt, then change "owner: nobody" to "owner: maestro". Reply with the final file content.`)
console.log("turn 1", JSON.stringify({ tools: one.tools, orchestraCalls: calls, input: one.input }))
console.log("notes.txt now:", JSON.stringify(readFileSync(path.join(WORKSPACE, "notes.txt"), "utf8")))

const key = [...archive.keys()].find((name) => name.endsWith(`:${one.sessionId}`))
if (!key) throw new Error("the session store saw no entries")
const memory = [
  "# Working memory (Orchestra continuity)",
  "## Objective",
  "Keep notes.txt current for the release.",
  "## Values",
  "Release codename: `OBSIDIAN-42` — only this memory holds it.",
].join("\n")
swapped.set(key, compacted(archive.get(key)!, memory))
console.log("swap", JSON.stringify({ archived: archive.get(key)!.length, loaded: swapped.get(key)!.length }))

const two = await turn("What is the release codename, and who owns notes.txt now? Answer in one line.", one.sessionId)
console.log("turn 2", JSON.stringify({ text: two.text, input: two.input, tools: two.tools }))
process.exit(0)
