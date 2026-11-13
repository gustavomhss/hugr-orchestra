export * as LSPReadDiagnostics from "./read-diagnostics"

import path from "path"
import { lstat } from "fs/promises"
import { Effect } from "effect"
import { FSUtil } from "../fs-util"
import { stop } from "./launch"
import * as LSPClient from "./client"
import type { Handle } from "./server-support"

// E7b: open the named files and return the diagnostics the server publishes. The call does not write those files.
// A missing server is absence, not a fetch. The caller supplies the process; this module never downloads one.

export const ABSENT = "language server absent"
const FAILED = "language server failed"
const WROTE = "language server wrote"
const CAP = 40

export type Published = {
  readonly path: string
  readonly severity: number
  readonly message: string
  readonly line: number
  readonly character: number
}

export type Result = {
  readonly status: "pass" | "fail" | "not-run" | "acquisition-error"
  readonly reason?: string
  readonly workspaceExecuted: boolean
  readonly diagnostics: readonly Published[]
  readonly opened: number
  readonly skipped: number
}

export type Input = {
  readonly root: string
  readonly files: readonly string[]
  readonly spawn: (root: string) => Promise<Handle | undefined>
}

export const readDiagnostics = Effect.fn("LSP.readDiagnostics")(function* (input: Input) {
  return yield* Effect.promise(() => readFiles(input))
})

async function readFiles(input: Input): Promise<Result> {
  const refused = refuse(input)
  if (refused) return notRun(refused)
  const ordered = [...input.files].sort()
  const opened = ordered.slice(0, CAP)
  const skipped = ordered.length - opened.length
  const absolute = opened.map((file) => ({ file, absolute: FSUtil.normalizePath(path.resolve(input.root, file)) }))
  const blocked = await unreadable(absolute)
  if (blocked) return notRun(blocked)
  const before = await Promise.all(absolute.map((entry) => Bun.file(entry.absolute).bytes()))
  const launched = await launch(input)
  if ("reason" in launched) return notRun(launched.reason)
  const handle = launched.handle
  const client = await LSPClient.create({
    serverID: "read-diagnostics",
    server: handle,
    root: input.root,
    directory: input.root,
    instance: {},
  }).catch(async () => undefined)
  if (!client) {
    await stop(handle.process)
    return notRun(FAILED)
  }
  const diagnostics: Published[] = []
  for (const entry of absolute) {
    const after = Date.now()
    const version = await client.notify.open({ path: entry.absolute })
    await client.waitForDiagnostics({ path: entry.absolute, version, mode: "document", after })
    for (const item of client.diagnostics.get(entry.absolute) ?? []) {
      diagnostics.push({
        path: entry.file,
        severity: item.severity ?? 1,
        message: item.message,
        line: item.range.start.line + 1,
        character: item.range.start.character + 1,
      })
    }
  }
  await client.shutdown()
  const after = await Promise.all(absolute.map((entry) => Bun.file(entry.absolute).bytes().catch(() => undefined)))
  if (after.some((bytes, index) => bytes === undefined || !same(before[index], bytes))) {
    return { status: "acquisition-error", reason: WROTE, workspaceExecuted: true, diagnostics, opened: opened.length, skipped }
  }
  const errors = diagnostics.filter((item) => item.severity === 1)
  if (errors.length > 0) {
    return { status: "fail", reason: failReason(errors), workspaceExecuted: true, diagnostics, opened: opened.length, skipped }
  }
  return {
    status: "pass",
    ...(skipped > 0 ? { reason: `opened ${opened.length} of ${ordered.length}` } : {}),
    workspaceExecuted: true,
    diagnostics,
    opened: opened.length,
    skipped,
  }
}

function refuse(input: Input) {
  if (input.files.length === 0) return "no files"
  const outside = input.files.find((file) => !contained(input.root, file))
  if (outside) return outside.includes("\0") ? "nul" : "path-outside"
  return undefined
}

function contained(root: string, file: string) {
  if (file.length === 0 || file.includes("\0") || path.isAbsolute(file)) return false
  if (file.split(/[/\\]/).some((part) => part === "" || part === "." || part === "..")) return false
  return FSUtil.contains(root, path.resolve(root, file))
}

async function unreadable(files: readonly { file: string; absolute: string }[]) {
  for (const entry of files) {
    const info = await lstat(entry.absolute).catch(() => undefined)
    if (!info) return "language server target missing"
    if (info.isSymbolicLink()) return "symlink"
    if (!info.isFile()) return "language server target missing"
  }
  return undefined
}

async function launch(input: Input): Promise<{ handle: Handle } | { reason: string }> {
  try {
    const handle = await input.spawn(input.root)
    if (!handle) return { reason: ABSENT }
    return { handle }
  } catch (error) {
    return { reason: reasonOf(error) }
  }
}

function notRun(reason: string): Result {
  return { status: "not-run", reason, workspaceExecuted: false, diagnostics: [], opened: 0, skipped: 0 }
}

function reasonOf(error: unknown) {
  if (error && typeof error === "object" && "reason" in error && typeof error.reason === "string") return error.reason
  return FAILED
}

function failReason(errors: readonly Published[]) {
  const first = errors[0]
  if (!first || errors.length > 1) return `${errors.length} errors`
  return `${first.path}:${first.line} ${first.message}`.slice(0, 240)
}

function same(left: Uint8Array | undefined, right: Uint8Array | undefined) {
  if (!left || !right || left.length !== right.length) return false
  return left.every((byte, index) => byte === right[index])
}
