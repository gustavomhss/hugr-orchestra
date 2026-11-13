export * as ReviewLspDiagnostics from "./lsp-diagnostics"

import path from "path"
import { lstat, realpath } from "fs/promises"
import { Effect } from "effect"
import { FSUtil } from "../fs-util"
import { Module } from "../util/module"
import { ResearchProcess } from "../research-toolkit/process"
import { confined } from "../lsp/launch"
import { LSPReadDiagnostics } from "../lsp/read-diagnostics"
import type { ReviewAnalyze } from "./analyze"

// The project's own typescript-language-server, resolved inside the scratch copy. No download, no host binary.
// A symlink whose target leaves the copy is absence: the review must not run a tool the repository did not ship.

export const ABSENT = LSPReadDiagnostics.ABSENT

export const read = Effect.fn("ReviewLspDiagnostics.read")(function* (input: {
  readonly root: string
  readonly files: readonly string[]
}) {
  return yield* LSPReadDiagnostics.readDiagnostics({
    root: input.root,
    files: input.files,
    spawn: projectServer,
  })
})

async function projectServer(root: string) {
  const tsserver = Module.resolve("typescript/lib/tsserver.js", root)
  if (!tsserver) return
  const bin = path.join(root, "node_modules", ".bin", "typescript-language-server")
  if (!(await lstat(bin).catch(() => undefined))) return
  const rootReal = await realpath(root).catch(() => undefined)
  const binary = await realpath(bin).catch(() => undefined)
  const server = await realpath(tsserver).catch(() => undefined)
  if (!rootReal || !binary || !server) return
  if (!FSUtil.contains(rootReal, binary) || !FSUtil.contains(rootReal, server)) return
  return {
    process: await confined(bin, ["--stdio"], { cwd: rootReal, env: ResearchProcess.environment() }),
    initialization: { tsserver: { path: server } },
  }
}

const SOURCE = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"])

/** Read-only diagnostics for a trusted build-lane review. No server in the copy is absence, not a fetch. */
export const analyze = Effect.fnUntraced(function* (input: ReviewAnalyze.RunInput, context: ReviewAnalyze.RunContext, reader: typeof read) {
  if (input.lane !== "build" || !input.trusted) return []
  const files = Object.keys(input.changed).filter(sourceFile).sort()
  if (files.length === 0) return []
  const head = yield* context.head
  if ("failed" in head) return []
  const report = yield* reader({ root: head.snapshot.root, files })
  const uri = report.workspaceExecuted ? yield* context.write("raw/lsp.log", formatDiagnostics(report)) : undefined
  return [{
    id: "lsp",
    pack: "lsp",
    version: "project",
    lane: "build" as const,
    status: report.status,
    ...(report.reason === undefined ? {} : { reason: report.reason }),
    workspaceExecuted: report.workspaceExecuted,
    ...(uri === undefined ? {} : { uri }),
  }]
})

function sourceFile(file: string) {
  if (!SOURCE.has(path.posix.extname(file)) || file.includes("\0") || path.isAbsolute(file)) return false
  return file.split(/[/\\]/).every((part) => part !== "" && part !== "." && part !== "..")
}

function formatDiagnostics(report: { diagnostics: readonly { path: string; severity: number; line: number; character: number; message: string }[]; opened: number; skipped: number }) {
  const lines = report.diagnostics.map((item) => `${item.path}:${item.line}:${item.character} ${item.message}`)
  return [`opened ${report.opened}`, `skipped ${report.skipped}`, ...lines].join("\n")
}
