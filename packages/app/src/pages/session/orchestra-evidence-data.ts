import type { ToolPart } from "@opencode-ai/sdk/v2"
import {
  detectTestRunner,
  failedCount,
  parseTestOutput,
  ranCount,
  type TestRunner,
  type TestSummary,
} from "./orchestra-evidence-parse"

export type EvidenceSource = {
  scope: string
  directory: string
  sessionID: string
  messageID: string
  partID: string
  command: string
  workdir?: string
}

export type EvidenceState = "passed" | "failed" | "empty" | "unconfirmed" | "partial"

export type ExecutionEvidence = {
  source: EvidenceSource
  runner: TestRunner
  state: EvidenceState
  exit?: number
  outputPath?: string
  summary?: TestSummary
}

const TRUNCATED_PREFIX = "...output truncated..."
export const EVIDENCE_CACHE_LIMIT = 32

export function isShellTool(tool: string) {
  return tool === "bash" || tool === "shell"
}

// The output tab shows the same retained output; parsing reads state.output only
// because metadata.output is a capped live preview, not the retained result.
export function readExecutionEvidence(part: ToolPart, scope: { scope: string; directory: string }) {
  if (!isShellTool(part.tool) || part.state.status !== "completed") return
  const input = part.state.input
  const metadata = record(part.state.metadata) ? part.state.metadata : {}
  if (typeof input.command !== "string") return
  const runner = detectTestRunner(input.command)
  if (!runner) return
  // Direct shell runs carry the real process status; timeout or kill is never a test result.
  if (metadata.status !== undefined && metadata.status !== "exited") return
  const source: EvidenceSource = {
    ...scope,
    sessionID: part.sessionID,
    messageID: part.messageID,
    partID: part.id,
    command: input.command,
    workdir: typeof input.workdir === "string" ? input.workdir : undefined,
  }
  const exit = Number.isSafeInteger(metadata.exit) ? (metadata.exit as number) : undefined
  const outputPath = typeof metadata.outputPath === "string" ? metadata.outputPath : undefined
  const output = part.state.output
  if (metadata.truncated === true || output.startsWith(TRUNCATED_PREFIX))
    return { source, runner, state: "partial", exit, outputPath } satisfies ExecutionEvidence
  const summary = parseTestOutput(runner, output)
  if (!summary) return
  const failed = failedCount(summary)
  // A clean exit next to reported failures is contradictory: keep the plain output.
  if (exit === 0 && failed > 0) return
  return { source, runner, state: outcome(summary, exit), exit, summary } satisfies ExecutionEvidence
}

function outcome(summary: TestSummary, exit: number | undefined): EvidenceState {
  if (ranCount(summary) === 0) return "empty"
  if (exit === undefined) return "unconfirmed"
  if (exit !== 0 || failedCount(summary) > 0) return "failed"
  return "passed"
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

type CacheEntry = { revision: unknown[]; value: ExecutionEvidence | undefined }

// Store updates may mutate the same state object, so the revision is the values the
// result depends on: any output, exit or status change invalidates the parse.
function revision(part: ToolPart) {
  const state = part.state
  const metadata = "metadata" in state && record(state.metadata) ? state.metadata : {}
  const input = state.input
  return [
    state.status,
    "output" in state ? state.output : undefined,
    input.command,
    input.workdir,
    metadata.exit,
    metadata.truncated,
    metadata.outputPath,
    metadata.status,
  ]
}

// Bounded per-session cache so virtual rows remounting on scroll do not re-parse.
export function createEvidenceCache(limit = EVIDENCE_CACHE_LIMIT) {
  const entries = new Map<string, CacheEntry>()
  return {
    read(part: ToolPart, scope: { scope: string; directory: string }) {
      // Live runs stream output on every delta; only completed revisions are parsed or kept.
      if (part.state.status !== "completed") return
      const key = `${scope.scope}\0${scope.directory}\0${part.sessionID}\0${part.id}`
      const next = revision(part)
      const hit = entries.get(key)
      entries.delete(key)
      if (hit && hit.revision.every((value, index) => value === next[index])) {
        entries.set(key, hit)
        return hit.value
      }
      const value = readExecutionEvidence(part, scope)
      entries.set(key, { revision: next, value })
      while (entries.size > limit) entries.delete(entries.keys().next().value!)
      return value
    },
    clear: () => entries.clear(),
    get size() {
      return entries.size
    },
  }
}
