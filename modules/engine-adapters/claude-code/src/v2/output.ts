export * as ClaudeCodeOutput from "./output"

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import type { ExecutionHost } from "@orchestra/core/session/runner"
import { LLMEvent, ToolOutput } from "@orchestra/llm"
import type { SessionTodo } from "@orchestra/schema/session-todo"
import { Effect } from "effect"
import path from "node:path"

/**
 * Gives a built-in call's result the output Orchestra's own tool records, so its widget and panel show the same: a
 * TodoWrite replaces the Session's todo list, an Edit or MultiEdit carries its patch and line counts. Only the record
 * changes; what Claude Code sent and received stays as it was.
 */
export function settle(
  items: ReadonlyArray<LLMEvent>,
  message: SDKMessage,
  input: { readonly todos: Map<string, unknown>; readonly turn: ExecutionHost.Turn },
) {
  return Effect.forEach(items, (event) => {
    if (!LLMEvent.is.toolResult(event) || event.result.type === "error") return Effect.succeed(event)
    const content = ToolOutput.fromResultValue(event.result)?.content ?? []
    if (event.name === "todowrite") {
      const todos = list(input.todos.get(event.id))
      return input.turn.todos(todos).pipe(Effect.as(LLMEvent.toolResult({ ...event, output: { structured: { todos }, content } })))
    }
    const edited = event.name === "edit" && message.type === "user" ? diff(message.tool_use_result, input.turn.session.location.directory) : undefined
    return Effect.succeed(edited ? LLMEvent.toolResult({ ...event, output: { structured: { files: [edited] }, content } }) : event)
  })
}

/** Claude Code's checklist as Orchestra's todo list. Claude Code has no priority, so each item reads as medium. */
function list(value: unknown): SessionTodo.Info[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) =>
    typeof item === "object" && item !== null && typeof item.content === "string" && typeof item.status === "string"
      ? [{ content: item.content, status: item.status, priority: "medium" }]
      : [],
  )
}

/** The file entry Orchestra's edit tool records, built from the patch Claude Code reports for its edit. */
function diff(result: unknown, directory: string) {
  if (typeof result !== "object" || result === null) return
  if (!("filePath" in result) || typeof result.filePath !== "string") return
  if (!("structuredPatch" in result) || !Array.isArray(result.structuredPatch)) return
  const relative = path.relative(directory, result.filePath)
  const file = relative.startsWith("..") || path.isAbsolute(relative) ? result.filePath : relative
  const hunks = result.structuredPatch.filter(
    (hunk): hunk is { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] } =>
      typeof hunk === "object" && hunk !== null && Array.isArray(hunk.lines),
  )
  const lines = hunks.flatMap((hunk) => hunk.lines)
  return {
    file,
    // The unified form `createTwoFilesPatch` writes, which the edit widget reads.
    patch: [
      `Index: ${file}`,
      "=".repeat(67),
      `--- ${file}`,
      `+++ ${file}`,
      ...hunks.flatMap((hunk) => [`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`, ...hunk.lines]),
      "",
    ].join("\n"),
    status: "modified" as const,
    additions: lines.filter((line) => line.startsWith("+")).length,
    deletions: lines.filter((line) => line.startsWith("-")).length,
  }
}
