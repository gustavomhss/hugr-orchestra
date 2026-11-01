export * as ToolSafetyOutput from "./tool-safety-output"

import type { ToolOutput } from "@orchestra/llm"

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
  const text = limits.maxLines <= 3 || Buffer.byteLength(hint) + 2 >= limits.maxBytes ? hint :
    `${hint}\n\n${fit(first.text, limits.maxLines - 3, limits.maxBytes - Buffer.byteLength(hint) - 2)}`
  return { ...output, content: output.content.map((part) => part === first ? { ...part, text } : part) }
}

/**
 * The bounded text already keeps its start and its end; making room for the hint must not turn that back into a start
 * only, since the error a command prints last is what the model needs. One line of the budget is the joiner of the two
 * halves when the bytes have to be cut.
 */
function fit(text: string, maxLines: number, maxBytes: number) {
  const lines = text.split("\n")
  const sampled =
    lines.length <= maxLines
      ? text
      : [...lines.slice(0, Math.ceil(maxLines / 2)), ...lines.slice(lines.length - Math.floor(maxLines / 2))].join("\n")
  if (Buffer.byteLength(sampled) <= maxBytes) return sampled
  return `${prefix(sampled, Math.ceil(maxBytes / 2))}\n${suffix(sampled, Math.floor(maxBytes / 2) - 1)}`
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

function suffix(text: string, budget: number) {
  const result = { chars: [] as string[], bytes: 0 }
  for (const char of Array.from(text).toReversed()) {
    const bytes = Buffer.byteLength(char)
    if (result.bytes + bytes > budget) break
    result.bytes += bytes
    result.chars.push(char)
  }
  return result.chars.toReversed().join("")
}
