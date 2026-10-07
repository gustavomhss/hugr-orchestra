export * as ToolSafetyOutput from "./tool-safety-output"

import type { ToolOutput } from "@opencode-ai/llm"

/** Native producer metadata determines process failure; a successful Effect alone does not. */
export function outcome(output: ToolOutput | undefined): "success" | "failure" | "cancelled" {
  const structured = output?.structured
  if (!structured || typeof structured !== "object") return "success"
  if ("cancelled" in structured && structured.cancelled === true) return "cancelled"
  if ("timeout" in structured && structured.timeout === true) return "failure"
  if ("exit" in structured && typeof structured.exit === "number" && structured.exit !== 0) return "failure"
  if ("exitCode" in structured && typeof structured.exitCode === "number" && structured.exitCode !== 0) return "failure"
  return "success"
}

/** Called only after existing output storage reports actual overflow; no second artifact or transcript ledger. */
export function nudge(output: ToolOutput, paths: readonly string[], limits: { maxBytes: number; maxLines: number }): ToolOutput {
  if (!paths.length) return output
  const first = output.content.find((part) => part.type === "text")
  if (!first || first.type !== "text") return output
  const hint = prefix(`Context pressure: ${limits.maxBytes}-byte/${limits.maxLines}-line tool budget exceeded. Read bounded slices from ${paths[0]}; use existing Session compaction, not full transcript dumps.`, limits.maxBytes)
  const text = limits.maxLines <= 2 || Buffer.byteLength(hint) + 2 >= limits.maxBytes ? hint :
    `${hint}\n\n${prefix(first.text.split("\n").slice(0, limits.maxLines - 2).join("\n"), limits.maxBytes - Buffer.byteLength(hint) - 2)}`
  return { ...output, content: output.content.map((part) => part === first ? { ...part, text } : part) }
}

function prefix(text: string, budget: number) {
  const result = { text: "", bytes: 0 }
  for (const char of text) {
    const bytes = Buffer.byteLength(char)
    if (result.bytes + bytes > budget) break
    result.bytes += bytes
    result.text += char
  }
  return result.text
}
