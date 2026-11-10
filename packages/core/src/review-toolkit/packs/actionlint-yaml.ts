export * as ReviewActionlintYaml from "./actionlint-yaml"

import { parseDocument } from "yaml"

const MAX_BYTES = 4 * 1024 * 1024
const MAX_ALIASES = 64
const MAX_NODES = 100_000
const MAX_DEPTH = 256

export function validateWorkflow(text: string): { status: "ok" } | { status: "not-run" | "unsupported"; reason: string } {
  if (Buffer.byteLength(text) > MAX_BYTES) return refuse("workflow-too-large")
  const document = parseDocument(text, { uniqueKeys: true })
  if (document.errors.length) return refuse("invalid-workflow-yaml")
  let nodes = 0
  try {
    const value: unknown = document.toJS({ maxAliasCount: MAX_ALIASES })
    const visit = (item: unknown, depth: number): boolean => {
      nodes++
      if (nodes > MAX_NODES || depth > MAX_DEPTH) return false
      if (Array.isArray(item)) return item.every((child) => visit(child, depth + 1))
      if (item && typeof item === "object") return Object.entries(item).every(([key, child]) => {
        if (key === "uses" && typeof child === "string" && /^(?:\.|\/|\\|[A-Za-z]:)/.test(child.trim())) return false
        return visit(child, depth + 1)
      })
      return true
    }
    return visit(value, 0) ? { status: "ok" } : refuse("local-or-complex-workflow")
  } catch {
    return refuse("complex-workflow-yaml")
  }
}

function refuse(reason: string) {
  return { status: "not-run" as const, reason }
}
