export * as ConfigAgentFile from "./agent-file"

import path from "path"
import matter from "gray-matter"
import { Effect } from "effect"
import type { AgentFile } from "@opencode-ai/schema/agent-file"
import { FSUtil } from "../fs-util"
import { ConfigMarkdown } from "./markdown"

const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const ACTIONS = new Set(["allow", "ask", "deny"])
const MODES = new Set(["subagent", "primary", "all"])
// Frontmatter keys the editor owns. `tools` and `maxSteps` are legacy spellings folded into
// `permission` and `steps` on read, so they are replaced rather than kept beside the new values.
const MANAGED = new Set(["description", "mode", "model", "steps", "maxSteps", "permission", "tools", "disable"])

/** Agent names become file names, so only plain segments are writable. */
export function validName(name: string) {
  return NAME.test(name)
}

/** Reads the project-scoped markdown definition of an agent in `<directory>/.opencode`. */
export const read = Effect.fn("ConfigAgentFile.read")(function* (directory: string, name: string) {
  const fs = yield* FSUtil.Service
  const filepath = yield* locate(fs, directory, name)
  const content = yield* fs.readFileStringSafe(filepath)
  return info(filepath, content)
})

/** Writes the editor-managed fields and keeps every other frontmatter key of an existing file. */
export const write = Effect.fn("ConfigAgentFile.write")(function* (
  directory: string,
  name: string,
  input: AgentFile.Input,
) {
  const fs = yield* FSUtil.Service
  const filepath = yield* locate(fs, directory, name)
  const content = render(yield* fs.readFileStringSafe(filepath), input)
  yield* fs.writeWithDirs(filepath, content)
  return info(filepath, content)
})

export function parse(content: string): AgentFile.Input {
  const markdown = ConfigMarkdown.parseOption(content)
  if (!markdown) return {}
  const data: Record<string, unknown> = markdown.data
  const steps = data.steps ?? data.maxSteps
  const permission = { ...legacyTools(data.tools), ...permissions(data.permission) }
  const system = markdown.content.trim()
  return {
    ...(typeof data.description === "string" ? { description: data.description } : {}),
    ...(typeof data.mode === "string" && MODES.has(data.mode) ? { mode: data.mode as AgentFile.Input["mode"] } : {}),
    ...(typeof data.model === "string" ? { model: data.model } : {}),
    ...(typeof steps === "number" && Number.isInteger(steps) && steps > 0 ? { steps } : {}),
    ...(system ? { system } : {}),
    ...(Object.keys(permission).length ? { permission } : {}),
    ...(data.disable === true ? { disable: true } : {}),
  }
}

export function render(existing: string | undefined, input: AgentFile.Input) {
  const markdown = existing === undefined ? undefined : ConfigMarkdown.parseOption(existing)
  const kept = Object.entries(markdown?.data ?? {}).filter(([key]) => !MANAGED.has(key))
  const data = Object.fromEntries([
    ...kept,
    ...Object.entries({
      description: input.description,
      mode: input.mode,
      model: input.model,
      steps: input.steps,
      permission: input.permission && Object.keys(input.permission).length ? input.permission : undefined,
      disable: input.disable || undefined,
    }).filter((entry) => entry[1] !== undefined),
  ])
  return matter.stringify(input.system?.trim() ?? "", data)
}

function info(filepath: string, content: string | undefined): AgentFile.Info {
  return { path: filepath, exists: content !== undefined, ...(content === undefined ? {} : parse(content)) }
}

// Discovery reads both `.opencode/agent` and `.opencode/agents`. Editing the file that already
// defines the agent avoids a second file whose later glob position would silently win.
const locate = Effect.fnUntraced(function* (fs: FSUtil.Interface, directory: string, name: string) {
  const candidates = ["agent", "agents"].map((folder) => path.join(directory, ".opencode", folder, `${name}.md`))
  const exists = yield* Effect.forEach(candidates, (candidate) => fs.existsSafe(candidate))
  return candidates[exists.indexOf(true)] ?? candidates[0]
})

function permissions(input: unknown): Record<string, AgentFile.Permission> {
  if (!input || typeof input !== "object") return {}
  return Object.fromEntries(
    Object.entries(input).flatMap(([tool, value]): [string, AgentFile.Permission][] => {
      if (isAction(value)) return [[tool, value]]
      if (!value || typeof value !== "object") return []
      const patterns = Object.entries(value).filter((entry): entry is [string, AgentFile.Action] => isAction(entry[1]))
      return patterns.length ? [[tool, Object.fromEntries(patterns)]] : []
    }),
  )
}

function legacyTools(input: unknown): Record<string, AgentFile.Action> {
  if (!input || typeof input !== "object") return {}
  return Object.fromEntries(
    Object.entries(input).flatMap(([tool, enabled]): [string, AgentFile.Action][] => {
      if (typeof enabled !== "boolean") return []
      const action = enabled ? "allow" : "deny"
      return [[tool === "write" || tool === "patch" ? "edit" : tool, action]]
    }),
  )
}

function isAction(value: unknown): value is AgentFile.Action {
  return typeof value === "string" && ACTIONS.has(value)
}
