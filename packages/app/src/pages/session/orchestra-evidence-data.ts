import type { ToolPart } from "@opencode-ai/sdk/v2"
import type { SessionMessageInfo } from "@opencode-ai/client/promise"
import {
  detectTestRunner,
  failedCount,
  parseTestOutput,
  ranCount,
  SUMMARY_WINDOW,
  testOutputWindow,
  type TestRunner,
  type TestSummary,
} from "./orchestra-evidence-parse"

export type EvidenceSource = {
  scope: string
  directory: string
  sessionID: string
  messageID: string
  partID: string
  callID: string
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
  durationMs?: number
}

const TRUNCATED_PREFIX = "...output truncated..."
export const EVIDENCE_CACHE_LIMIT = 32
// Serialized key, revision and result combined; oversized entries simply bypass caching.
export const EVIDENCE_CACHE_ENTRY_LIMIT = 8 * SUMMARY_WINDOW

export function isShellTool(tool: string) {
  return tool === "bash" || tool === "shell"
}

// Live V2 projection also indexes its synthetic assistant in the legacy source
// list. The raw shell already projects that assistant; emitting both duplicates
// the same part/virtual row identity. Historical real assistants remain intact.
export function withoutShellProjections(messages: SessionMessageInfo[]) {
  const shells = new Set(messages.flatMap((message) => (message.type === "shell" ? [`${message.id}:assistant`] : [])))
  if (shells.size === 0) return messages
  return messages.filter((message) => message.type !== "assistant" || !shells.has(message.id))
}

// The output tab shows the same retained output; parsing reads state.output only
// because metadata.output is a capped live preview, not the retained result.
export function readExecutionEvidence(
  part: ToolPart,
  scope: { scope: string; directory: string },
  sourceMessage?: SessionMessageInfo,
) {
  if (!isShellTool(part.tool) || part.state.status !== "completed") return
  const input = part.state.input
  const metadata = record(part.state.metadata) ? part.state.metadata : {}
  if (typeof input.command !== "string") return
  if (input.workdir !== undefined && typeof input.workdir !== "string") return
  const runner = detectTestRunner(input.command)
  if (!runner) return
  // A normalized shell part can look completed after interruption, and can have a
  // fabricated end time. Only the matching raw shell message establishes its result.
  const shell = sourceMessage?.type === "shell" ? sourceMessage : undefined
  if (shell && (part.messageID !== `${shell.id}:assistant` || part.callID !== shell.shellID)) return
  if (shell ? shell.status !== "exited" : metadata.status !== undefined) return
  const source: EvidenceSource = {
    ...scope,
    sessionID: part.sessionID,
    messageID: shell?.id ?? part.messageID,
    partID: part.id,
    callID: part.callID,
    command: shell?.command ?? input.command,
    workdir: typeof input.workdir === "string" ? input.workdir : undefined,
  }
  if (shell && shell.command !== input.command) return
  const code = shell ? shell.exit : metadata.exit
  const exit = Number.isSafeInteger(code) ? (code as number) : undefined
  const outputPath = typeof metadata.outputPath === "string" ? metadata.outputPath : undefined
  const output = shell ? shell.output?.output : part.state.output
  if (output === undefined) return
  const truncated = shell ? shell.output?.truncated : metadata.truncated
  if (truncated === true || output.startsWith(TRUNCATED_PREFIX))
    return { source, runner, state: "partial", exit, outputPath } satisfies ExecutionEvidence
  if (truncated !== false) return
  const summary = parseTestOutput(runner, output)
  if (!summary) return
  const failed = failedCount(summary)
  if (summary.failures.length > 0 && failed === 0) return
  // A clean exit next to reported failures is contradictory: keep the plain output.
  if (exit === 0 && failed > 0) return
  if (exit !== undefined && exit !== 0 && failed === 0 && ranCount(summary) > 0) return
  const time = executionTime(part, sourceMessage)
  const durationMs =
    time.start !== undefined &&
    time.end !== undefined &&
    Number.isFinite(time.start) &&
    Number.isFinite(time.end) &&
    time.end >= time.start
      ? time.end - time.start
      : undefined
  return { source, runner, state: outcome(summary, exit), exit, summary, durationMs } satisfies ExecutionEvidence
}

function outcome(summary: TestSummary, exit: number | undefined): EvidenceState {
  if (exit === undefined) return "unconfirmed"
  if (ranCount(summary) === 0 && (exit === 0 || (summary.runner === "pytest" && exit === 5))) return "empty"
  if (exit !== 0 || failedCount(summary) > 0) return "failed"
  return "passed"
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

type CacheEntry = { revision: string; value: ExecutionEvidence | undefined; characters: number }

function executionTime(part: ToolPart, source?: SessionMessageInfo) {
  if (source?.type === "shell") return { start: source.time.created, end: source.time.completed }
  const tool =
    source?.type === "assistant"
      ? source.content.find((item) => item.type === "tool" && item.id === part.id)
      : undefined
  if (tool?.type === "tool") return { start: tool.time.ran, end: tool.time.completed }
  const state = part.state
  return {
    start: "time" in state ? state.time.start : undefined,
    end: "time" in state && "end" in state.time ? state.time.end : undefined,
  }
}

// Track only consumed text, total length, truncation and scalar execution metadata.
// JSON serialization detaches tail substrings from their potentially huge backing
// logs. Edits outside the parser's window do not change its result.
function revision(part: ToolPart, source?: SessionMessageInfo) {
  const state = part.state
  const metadata = "metadata" in state && record(state.metadata) ? state.metadata : {}
  const input = state.input
  const time = executionTime(part, source)
  const output = source?.type === "shell" ? source.output?.output : "output" in state ? state.output : undefined
  const fields = [
    state.status,
    typeof input.command === "string" ? input.command : undefined,
    typeof input.workdir === "string" ? input.workdir : undefined,
    input.workdir === undefined || typeof input.workdir === "string",
    Number.isSafeInteger(metadata.exit) ? metadata.exit : undefined,
    typeof metadata.truncated === "boolean" ? metadata.truncated : undefined,
    typeof metadata.outputPath === "string" ? metadata.outputPath : undefined,
    metadata.status === undefined,
    typeof metadata.status === "string" ? metadata.status : undefined,
    part.tool,
    part.messageID,
    part.callID,
    time.start,
    time.end,
    ...(source?.type === "shell"
      ? [
          source.id,
          source.shellID,
          source.command,
          source.status,
          source.exit,
          source.output?.truncated,
          source.time.created,
          source.time.completed,
        ]
      : []),
  ]
  if (fields.some((field) => typeof field === "string" && field.length > SUMMARY_WINDOW)) return
  return JSON.stringify([
    ...fields,
    output?.length,
    output?.startsWith(TRUNCATED_PREFIX),
    output === undefined ? undefined : testOutputWindow(output),
  ])
}

// Bounded per-session cache so virtual rows remounting on scroll do not re-parse.
export function createEvidenceCache(limit = EVIDENCE_CACHE_LIMIT) {
  const capacity = Number.isSafeInteger(limit)
    ? Math.min(EVIDENCE_CACHE_LIMIT, Math.max(0, limit))
    : EVIDENCE_CACHE_LIMIT
  const entries = new Map<string, CacheEntry>()
  return {
    read(part: ToolPart, scope: { scope: string; directory: string }, source?: SessionMessageInfo) {
      // Live runs stream output on every delta; only completed revisions are parsed or kept.
      const key = `${scope.scope}\0${scope.directory}\0${part.sessionID}\0${part.id}`
      const hit = entries.get(key)
      entries.delete(key)
      if (part.state.status !== "completed") return
      const next = revision(part, source)
      if (next === undefined || key.length > SUMMARY_WINDOW || capacity === 0)
        return readExecutionEvidence(part, scope, source)
      if (hit && hit.revision === next) {
        entries.set(key, hit)
        return hit.value
      }
      const value = readExecutionEvidence(part, scope, source)
      const serialized = value === undefined ? undefined : JSON.stringify(value)
      const characters = key.length + next.length + (serialized?.length ?? 0)
      if (characters > EVIDENCE_CACHE_ENTRY_LIMIT) return value
      // Detach result strings too: command/path fields and regex captures may be
      // slices of a larger source buffer. Only this bounded copy enters the cache.
      const stored = serialized === undefined ? undefined : (JSON.parse(serialized) as ExecutionEvidence)
      entries.set(key, { revision: next, value: stored, characters })
      while (entries.size > capacity) entries.delete(entries.keys().next().value!)
      return stored
    },
    clear: () => entries.clear(),
    get size() {
      return entries.size
    },
    get retainedCharacters() {
      return [...entries.values()].reduce((total, entry) => total + entry.characters, 0)
    },
  }
}
