export * as BackendEvidence from "./backend-evidence"

import path from "path"
import type { SessionV1 } from "@orchestra/core/v1/session"
import type { BackendResult } from "./backend-result"
import { ShellID } from "@/tool/shell/id"

// ShellTool exposes this ID even when its executable is PowerShell (shell/id.ts).
const knownToolIds = new Set<string>([ShellID.ToolID])

/** F4 cl.16 / F4-CH: bind claims, without changing them or deriving any result axis. */
export function bind(
  result: BackendResult.WorkResult,
  history: readonly SessionV1.WithParts[],
  input: { executionSessionID: string; directory: string },
): BackendResult.WorkerEvidence {
  const parts = history.flatMap((message) =>
    message.parts.flatMap((part) => (part.type === "tool" ? [{ message: message.info, part }] : [])),
  )
  const callCounts = new Map<string, number>()
  const partCounts = new Map<string, number>()
  const messageCounts = new Map<string, number>()
  history.forEach((message) => {
    messageCounts.set(message.info.id, (messageCounts.get(message.info.id) ?? 0) + 1)
    message.parts.forEach((part) => partCounts.set(part.id, (partCounts.get(part.id) ?? 0) + 1))
  })
  parts.forEach(({ part }) => {
    callCounts.set(part.callID, (callCounts.get(part.callID) ?? 0) + 1)
  })
  const calls = parts.flatMap(({ message, part }) => {
    if (
      !path.isAbsolute(input.directory) ||
      message.role !== "assistant" ||
      message.sessionID !== input.executionSessionID ||
      part.sessionID !== input.executionSessionID ||
      part.messageID !== message.id ||
      !part.callID ||
      !part.id ||
      callCounts.get(part.callID) !== 1 ||
      partCounts.get(part.id) !== 1 ||
      messageCounts.get(message.id) !== 1 ||
      part.state.status !== "completed"
    ) return []
    return [{ part, state: part.state }]
  })
  const writes = calls.map(({ part, state }) => ({
    callID: part.callID,
    paths: part.tool === "write" || part.tool === "edit"
      ? [resolve(state.input.filePath, input.directory)].filter((file) => file !== undefined)
      : part.tool === "apply_patch" ? patchPaths(state.metadata.files) : [],
  }))
  return {
    changes: result.changes.map((claim, index) => {
      const file = resolve(claim.path, input.directory)
      const callIDs = file === undefined ? [] : writes.filter((call) => call.paths.includes(file)).map((call) => call.callID)
      return { index, evidence: callIDs.length ? "bound" : "unbound", callIDs }
    }),
    checks: result.checks.map((claim, index) => {
      const callIDs = calls.flatMap(({ part, state }) => {
        if (!knownToolIds.has(part.tool) || state.input.command !== claim.command) return []
        const exit: unknown = state.metadata.exit
        if (typeof exit !== "number" || !Number.isFinite(exit) || !Number.isInteger(exit)) return []
        if (claim.exitCode !== undefined && claim.exitCode !== exit) return []
        if (claim.status !== "pass" && claim.status !== "fail") return []
        if ((claim.status === "pass") !== (exit === 0)) return []
        const cwd = state.input.workdir === undefined || state.input.workdir === ""
          ? input.directory : resolve(state.input.workdir, input.directory)
        if (cwd === undefined || resolve(claim.cwd, input.directory) !== path.resolve(cwd)) return []
        return [part.callID]
      })
      return { index, evidence: callIDs.length ? "bound" : "unbound", callIDs }
    }),
  }
}

function resolve(value: unknown, directory: string) {
  if (typeof value !== "string" || !value || value.includes("\0") || !path.isAbsolute(directory)) return
  // Windows POSIX paths may need cygpath; drive-relative paths depend on ambient per-drive cwd. Neither is observable here.
  if (process.platform === "win32" && (value.startsWith("/") || /^[a-z]:(?:$|[^\\/])/i.test(value))) return
  return path.resolve(directory, value)
}

function patchPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const files: unknown[] = value
  const paths = files.map((file) => {
    if (typeof file !== "object" || file === null || !("filePath" in file) || !("type" in file)) return
    if (typeof file.filePath !== "string" || !path.isAbsolute(file.filePath) || file.filePath.includes("\0")) return
    if (typeof file.type !== "string" || !["add", "update", "delete", "move"].includes(file.type)) return
    if (file.type !== "move") return [path.resolve(file.filePath)]
    if (!("movePath" in file) || typeof file.movePath !== "string" || !path.isAbsolute(file.movePath) || file.movePath.includes("\0")) return
    return [path.resolve(file.filePath), path.resolve(file.movePath)]
  })
  return paths.some((files) => files === undefined) ? [] : paths.flatMap((files) => files ?? [])
}
