export * as ConfigAgentFile from "./agent-file"

import path from "path"
import { createHash, randomUUID } from "crypto"
import matter from "gray-matter"
import { Effect, Schema } from "effect"
import type { AgentFile } from "@orchestra/schema/agent-file"
import { AgentV2 } from "../agent"
import { FSUtil } from "../fs-util"
import { ConfigMarkdown } from "./markdown"

type Fields = Omit<AgentFile.Input, "revision">

const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
// Windows refuses these as file names whatever the extension.
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i
const ACTIONS = new Set(["allow", "ask", "deny"])
const MODES = new Set(["subagent", "primary", "all"])
const TOP_LEVEL_KEY = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:(?:\s|$)/

export class ConflictError extends Schema.TaggedErrorClass<ConflictError>()("ConfigAgentFile.ConflictError", {
  path: Schema.String,
  message: Schema.String,
}) {}

export class RejectedError extends Schema.TaggedErrorClass<RejectedError>()("ConfigAgentFile.RejectedError", {
  path: Schema.String,
  reason: Schema.Literals(["unparseable", "outside", "case", "protected"]),
  message: Schema.String,
}) {}

/** Agent names become file names, so only short plain segments are writable. */
export function validName(name: string) {
  return NAME.test(name) && !RESERVED.test(name)
}

/** Reads the project-scoped markdown definition of an agent in `<directory>/.orchestra`. */
export const read = Effect.fn("ConfigAgentFile.read")(function* (directory: string, name: string) {
  const fs = yield* FSUtil.Service
  const filepath = yield* locate(fs, directory, name)
  return info(filepath, yield* content(fs, filepath))
})

/** Writes the editor-owned fields, keeping every other key, comment and the key order of an existing file. */
export const write = Effect.fn("ConfigAgentFile.write")(function* (
  directory: string,
  name: string,
  input: AgentFile.Input,
) {
  const fs = yield* FSUtil.Service
  const filepath = yield* locate(fs, directory, name)
  // Every session runs on Maestro, so its file may neither disable it nor take it out of primary mode.
  if (name === AgentV2.defaultID && (input.disable || (input.mode ?? "primary") !== "primary"))
    return yield* new RejectedError({
      path: filepath,
      reason: "protected",
      message: "Maestro runs every session, so it cannot be disabled or set to a mode other than primary.",
    })
  const existing = yield* content(fs, filepath)
  if (input.revision !== undefined && input.revision !== revision(existing))
    return yield* new ConflictError({ path: filepath, message: "The agent file changed since it was read." })
  const next = render(existing, input)
  if (next === undefined)
    return yield* new RejectedError({
      path: filepath,
      reason: "unparseable",
      message: "The agent file's front matter cannot be parsed. Fix it by hand.",
    })
  yield* replace(fs, filepath, next)
  return info(filepath, next)
})

/** The editor's view of a file, or undefined when its front matter cannot be parsed. */
export function parse(text: string): Fields | undefined {
  const markdown = markdownOf(text)
  if (!markdown) return
  const data: Record<string, unknown> = markdown.data
  const steps = data.steps ?? data.maxSteps
  const permission = [...rules(data)].filter((entry): entry is [string, AgentFile.Permission] =>
    representable(entry[1]),
  )
  const system = markdown.content.trim()
  return {
    ...(typeof data.description === "string" ? { description: data.description } : {}),
    ...(typeof data.mode === "string" && MODES.has(data.mode) ? { mode: data.mode as Fields["mode"] } : {}),
    ...(typeof data.model === "string" ? { model: data.model } : {}),
    ...(typeof steps === "number" && Number.isInteger(steps) && steps > 0 ? { steps } : {}),
    ...(system ? { system } : {}),
    ...(permission.length ? { permission: Object.fromEntries(permission) } : {}),
    ...(data.disable === true ? { disable: true } : {}),
  }
}

/** The next file text, or undefined when the existing front matter cannot be parsed and must not be replaced. */
export function render(existing: string | undefined, input: AgentFile.Input) {
  const markdown = existing === undefined ? { data: {} } : markdownOf(existing)
  if (!markdown) return
  const data: Record<string, unknown> = markdown.data
  const permission = input.permission === undefined ? undefined : { value: mergePermission(data, input.permission) }
  const changes = new Map(
    Object.entries({
      description: input.description,
      mode: input.mode,
      model: input.model,
      steps: input.steps,
      maxSteps: undefined,
      // `tools` is folded into `permission` on read, so it goes once the merged rules are written.
      ...(permission ? { tools: undefined, permission: permission.value } : {}),
      disable: input.disable || undefined,
      // A variant names a level of the previous model.
      ...(input.model === data.model ? {} : { variant: undefined }),
    }).filter(([key, value]) => !same(data, key, value)),
  )
  const expected = Object.fromEntries([
    ...Object.entries(data).flatMap(([key, value]): [string, unknown][] => {
      if (!changes.has(key)) return [[key, value]]
      const next = changes.get(key)
      return next === undefined ? [] : [[key, next]]
    }),
    ...[...changes].filter(([key, value]) => !(key in data) && value !== undefined),
  ])
  const yaml = patch(frontmatter(existing ?? ""), changes, expected) ?? dump(expected)
  const body = input.system?.trim() ?? ""
  // Always emit the delimiters: a body that starts with `---` must never be read back as front matter.
  return `---\n${yaml ? `${yaml}\n` : ""}---\n${body ? `${body}\n` : ""}`
}

function info(filepath: string, text: string | undefined): AgentFile.Info {
  if (text === undefined) return { path: filepath, exists: false, revision: revision(undefined) }
  return { path: filepath, exists: true, revision: revision(text), ...(parse(text) ?? { invalid: true }) }
}

function revision(text: string | undefined) {
  return text === undefined ? "" : createHash("sha256").update(text).digest("hex")
}

// A permission error is not an absent file.
function content(fs: FSUtil.Interface, filepath: string) {
  return fs
    .readFileString(filepath)
    .pipe(Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(undefined)))
}

const locate = Effect.fnUntraced(function* (fs: FSUtil.Interface, directory: string, name: string) {
  const folders = ["agent", "agents"].map((folder) => path.join(directory, ".orchestra", folder))
  const file = `${name}.md`
  const listed = yield* Effect.forEach(folders, (folder) =>
    fs.readDirectoryEntries(folder).pipe(Effect.orElseSucceed((): FSUtil.DirEntry[] => [])),
  )
  // Discovery names an agent after the file's own spelling, so on a case-insensitive disk `Plan.md`
  // would take a write meant for `plan` while still loading as `Plan`.
  if (listed.flat().some((entry) => entry.name !== file && entry.name.toLowerCase() === file.toLowerCase()))
    return yield* new RejectedError({
      path: path.join(folders[0], file),
      reason: "case",
      message: "An agent file with the same name in different letter case already exists.",
    })
  // Discovery applies `agent/` before `agents/`, so the `agents/` definition wins; edit the winning file.
  const owner = folders.filter((_, index) => listed[index].some((entry) => entry.name === file)).at(-1)
  const filepath = path.join(owner ?? folders[0], file)
  yield* confine(fs, directory, filepath)
  return filepath
})

// Refuse a `.orchestra`, folder or file that resolves outside the profile through a symlink.
const confine = Effect.fnUntraced(function* (fs: FSUtil.Interface, directory: string, filepath: string) {
  const root = yield* fs.realPath(directory)
  const resolved = yield* Effect.forEach([path.join(directory, ".orchestra"), path.dirname(filepath), filepath], (item) =>
    fs.realPath(item).pipe(Effect.orElseSucceed(() => undefined)),
  )
  if (resolved.every((item) => item === undefined || item === root || item.startsWith(root + path.sep))) return
  return yield* new RejectedError({
    path: filepath,
    reason: "outside",
    message: "The agent file resolves outside this profile.",
  })
})

// Write beside the target and rename over it, so readers never see a partial file.
const replace = Effect.fnUntraced(function* (fs: FSUtil.Interface, filepath: string, text: string) {
  const folder = path.dirname(filepath)
  const temp = path.join(folder, `.${path.basename(filepath)}.${randomUUID()}.tmp`)
  yield* fs.ensureDir(folder)
  yield* fs.writeFileString(temp, text).pipe(
    Effect.andThen(fs.rename(temp, filepath)),
    Effect.tapError(() => fs.remove(temp).pipe(Effect.ignore)),
  )
})

function markdownOf(text: string) {
  const markdown = ConfigMarkdown.parseOption(text)
  // gray-matter caches a file before parsing it, so the sanitized retry after a YAML error can return the
  // unparsed text whole. Front matter that was not consumed is a parse failure.
  if (!markdown || (opens(text) && markdown.content === text)) return
  return markdown
}

function opens(text: string) {
  return text.startsWith("---") && text.charAt(3) !== "-"
}

// The raw text between the delimiters, located the way gray-matter does. Its cached results drop this text.
function frontmatter(text: string) {
  if (!opens(text)) return ""
  const rest = text.slice(3)
  const end = rest.indexOf("\n---")
  return end === -1 ? rest : rest.slice(0, end)
}

// Rewrites only the top-level keys that change so comments, quoting and order elsewhere survive. Falls back
// to a full dump when the edited text would not parse back to exactly the expected data.
function patch(raw: string, changes: Map<string, unknown>, expected: Record<string, unknown>) {
  const text = raw.replace(/^\r?\n/, "")
  const segments: { key?: string; lines: string[] }[] = []
  for (const line of text ? text.split("\n") : []) {
    const key = TOP_LEVEL_KEY.exec(line)?.[1]
    const last = segments.at(-1)
    if (key) segments.push({ key, lines: [line] })
    else if (last?.key !== undefined && /^(\s|-|$)/.test(line)) last.lines.push(line)
    else segments.push({ lines: [line] })
  }
  const edited = [...changes].reduce((list, [key, value]) => {
    const lines = value === undefined ? [] : dump({ [key]: value }).split("\n")
    const index = list.findIndex((segment) => segment.key === key)
    if (index === -1) return value === undefined ? list : [...list, { key, lines }]
    const blank = list[index].lines.length - list[index].lines.findLastIndex((line) => line.trim() !== "") - 1
    return list.toSpliced(index, 1, { key, lines: [...lines, ...Array<string>(blank).fill("")] })
  }, segments)
  const result = edited
    .flatMap((segment) => segment.lines)
    .join("\n")
    .replace(/\s+$/, "")
  const parsed = markdownOf(`---\n${result}\n---\n`)
  if (parsed && JSON.stringify(parsed.data) === JSON.stringify(expected)) return result
}

function dump(data: Record<string, unknown>) {
  if (!Object.keys(data).length) return ""
  const text = matter.stringify({ content: "" }, data)
  return text.slice("---\n".length, text.lastIndexOf("\n---\n"))
}

function same(data: Record<string, unknown>, key: string, value: unknown) {
  if (value === undefined) return !(key in data)
  return key in data && JSON.stringify(data[key]) === JSON.stringify(value)
}

// Rules in effective order. `tools` comes first and `permission` assigns over it, as the V1 loader does;
// a bare `permission: allow` means every tool.
function rules(data: Record<string, unknown>) {
  const permission = data.permission
  const own: [string, unknown][] = isRecord(permission)
    ? Object.entries(permission)
    : permission === undefined
      ? []
      : [["*", permission]]
  return new Map<string, unknown>([...Object.entries(legacyTools(data.tools)), ...own])
}

// Listed tools take the editor's value in place, new ones go last, and values the editor cannot show are kept.
function mergePermission(data: Record<string, unknown>, input: Record<string, AgentFile.Permission>) {
  const current = rules(data)
  const merged = Object.fromEntries([
    ...[...current].flatMap(([tool, value]): [string, unknown][] => {
      if (Object.hasOwn(input, tool)) return [[tool, input[tool]]]
      return representable(value) ? [] : [[tool, value]]
    }),
    ...Object.entries(input).filter(([tool]) => !current.has(tool)),
  ])
  const keys = Object.keys(merged)
  if (!keys.length) return
  if (typeof data.permission === "string" && keys.length === 1 && keys[0] === "*") return merged["*"]
  return merged
}

function legacyTools(input: unknown): Record<string, AgentFile.Action> {
  if (!isRecord(input)) return {}
  return Object.fromEntries(
    Object.entries(input).flatMap(([tool, enabled]): [string, AgentFile.Action][] => {
      if (typeof enabled !== "boolean") return []
      return [[tool === "write" || tool === "patch" ? "edit" : tool, enabled ? "allow" : "deny"]]
    }),
  )
}

function representable(value: unknown): value is AgentFile.Permission {
  if (isAction(value)) return true
  return isRecord(value) && Object.keys(value).length > 0 && Object.values(value).every(isAction)
}

function isAction(value: unknown): value is AgentFile.Action {
  return typeof value === "string" && ACTIONS.has(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
