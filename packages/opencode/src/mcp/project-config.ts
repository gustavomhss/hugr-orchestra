export * as McpProjectConfig from "./project-config"

import path from "path"
import { Effect } from "effect"
import { applyEdits, modify, parse } from "jsonc-parser"
import { FSUtil } from "@opencode-ai/core/fs-util"
import type { ConfigMCPV1 } from "@opencode-ai/core/v1/config/mcp"
import { isRecord } from "@/util/record"

const format = { formattingOptions: { tabSize: 2, insertSpaces: true } }
// Keys that only make sense for one transport; switching transport drops the other side's keys.
const exclusive = {
  local: ["command", "cwd", "environment"],
  remote: ["url", "headers", "oauth"],
} as const

// The profile-scoped files `opencode mcp add` writes, in the order it prefers them.
export function files(directory: string) {
  return [
    path.join(directory, "opencode.json"),
    path.join(directory, "opencode.jsonc"),
    path.join(directory, ".opencode", "opencode.json"),
    path.join(directory, ".opencode", "opencode.jsonc"),
  ]
}

/**
 * Creates or updates one MCP server in the profile's own config file. Only the given fields are
 * written, so values the dialog does not edit (environment, headers, `{env:...}` references,
 * comments) stay exactly as the owner wrote them. Returns the file that was written.
 */
export const write = Effect.fn("McpProjectConfig.write")(function* (
  directory: string,
  name: string,
  config: ConfigMCPV1.Info,
) {
  const fs = yield* FSUtil.Service
  const documents = yield* read(directory)
  const target =
    documents.findLast((document) => defines(document.text, name)) ??
    documents.find((document) => document.text !== undefined) ??
    documents[0]
  const current = entry(target.text, name)
  // jsonc-parser cannot delete a missing path, so only drop keys the entry really has.
  const stale = exclusive[config.type === "local" ? "remote" : "local"].filter((key) => current && key in current)
  const text = [
    ...stale.map((key) => [key, undefined] as const),
    ...Object.entries(config).map(([key, value]) => [key, value] as const),
  ].reduce(
    (result, [key, value]) => applyEdits(result, modify(result, ["mcp", name, key], value, format)),
    target.text ?? "{}",
  )
  yield* fs.writeWithDirs(target.file, text)
  return target.file
})

// Removes the server from every profile file that defines it; returns the files that changed.
export const remove = Effect.fn("McpProjectConfig.remove")(function* (directory: string, name: string) {
  const fs = yield* FSUtil.Service
  const defining = (yield* read(directory)).filter((document): document is { file: string; text: string } =>
    defines(document.text, name),
  )
  yield* Effect.forEach(defining, (document) =>
    fs.writeWithDirs(document.file, applyEdits(document.text, modify(document.text, ["mcp", name], undefined, format))),
  )
  return defining.map((document) => document.file)
})

const read = Effect.fnUntraced(function* (directory: string) {
  const fs = yield* FSUtil.Service
  return yield* Effect.forEach(files(directory), (file) =>
    fs.readFileStringSafe(file).pipe(Effect.map((text) => ({ file, text }))),
  )
})

function defines(text: string | undefined, name: string) {
  return entry(text, name) !== undefined
}

function entry(text: string | undefined, name: string) {
  if (text === undefined) return
  const value: unknown = parse(text)
  if (!isRecord(value) || !isRecord(value.mcp) || !Object.hasOwn(value.mcp, name)) return
  const server: unknown = value.mcp[name]
  return isRecord(server) ? server : {}
}
