export * as SkillFile from "./file"

import path from "path"
import { rmdir } from "fs/promises"
import matter from "gray-matter"
import { Effect, Option, Schema } from "effect"
import { ConfigMarkdown } from "../config/markdown"
import { FSUtil } from "../fs-util"

// New names become directory names and skill tool arguments, so they follow the Agent Skills naming rule.
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const NAME_LIMIT = 64
// The project's own skill folders that opencode reads. Global, configured-path and URL skills stay read-only.
const PROJECT_ROOTS = [".opencode/skills", ".opencode/skill", ".claude/skills", ".agents/skills"]
// Atlas owns these skills and verifies them by name; editing them here would bypass that governance.
const GOVERNED_ROOT = ".opencode/skills/own"

export class WriteError extends Schema.TaggedErrorClass<WriteError>()("SkillWriteError", {
  reason: Schema.Literals(["invalid", "missing", "readonly", "conflict"]),
  message: Schema.String,
}) {}

export type Registered = { readonly name: string; readonly location: string }

export interface SaveInput {
  readonly name: string
  readonly description: string
  readonly content: string
  /** Existing registered skill file to rewrite. Omit to create a project skill. */
  readonly location?: string
  /** Modification time (ms) the caller read; a different time on disk fails with a conflict. */
  readonly mtime?: number
}

export interface Saved {
  readonly name: string
  readonly description: string
  readonly location: string
  readonly content: string
  readonly mtime?: number
}

/** Last modification time in whole milliseconds, the token `SaveInput.mtime` is compared against. */
export const modified = Effect.fn("SkillFile.modified")(function* (file: string) {
  const fs = yield* FSUtil.Service
  const info = yield* fs.stat(file).pipe(Effect.option)
  return Option.getOrUndefined(Option.flatMap(info, (item) => item.mtime))?.getTime()
})

/**
 * Creates `<directory>/.opencode/skills/<name>/SKILL.md`, or rewrites a registered project skill file in place.
 * Edits keep the other front-matter keys, but the front matter is re-serialized as YAML, so comments and
 * formatting inside it are not preserved. Files are written to a temporary sibling and then linked (create)
 * or renamed (edit) into place, so readers never see a partial file and a symlink at the target is not followed.
 */
export const save = Effect.fn("SkillFile.save")(function* (input: {
  directory: string
  registered: readonly Registered[]
  skill: SaveInput
}) {
  const fs = yield* FSUtil.Service
  const name = input.skill.name.trim()
  const description = input.skill.description.trim()
  const current =
    input.skill.location === undefined
      ? undefined
      : yield* requireFile(input.directory, input.registered, input.skill.location)
  if (!name || name.length > NAME_LIMIT || (name !== current?.name && !NAME.test(name)))
    return yield* new WriteError({
      reason: "invalid",
      message: `Skill names use up to ${NAME_LIMIT} lowercase letters, numbers and single hyphens.`,
    })
  if (!description) return yield* new WriteError({ reason: "invalid", message: "A skill needs a description." })
  if (input.registered.some((skill) => skill.name === name && skill.location !== current?.location))
    return yield* new WriteError({ reason: "conflict", message: `A skill named ${name} is already registered.` })
  if (current && input.skill.mtime !== undefined && (yield* modified(current.location)) !== input.skill.mtime)
    return yield* new WriteError({
      reason: "conflict",
      message: `${current.name} changed on disk after it was read. Reopen it and try again.`,
    })

  const location = current?.location ?? path.join(input.directory, ".opencode", "skills", name, "SKILL.md")
  if (!current) yield* requireLexical(input.directory, location)
  const existing = current ? yield* fs.readFileStringSafe(location).pipe(Effect.orDie) : undefined
  const data = existing === undefined ? {} : ConfigMarkdown.parseOption(existing)?.data
  const body = input.skill.content.endsWith("\n") ? input.skill.content : `${input.skill.content}\n`
  // The object form keeps a body that itself starts with `---` from being parsed as front matter.
  const text = matter.stringify({ content: body }, { ...data, name, description })
  const folder = path.dirname(location)
  yield* fs.makeDirectory(folder, { recursive: true }).pipe(Effect.orDie)
  const temp = path.join(folder, `.${path.basename(location)}.${crypto.randomUUID()}.tmp`)
  yield* Effect.acquireUseRelease(
    fs.writeFileString(temp, text, { flag: "wx" }).pipe(Effect.orDie),
    () =>
      current
        ? fs.rename(temp, location).pipe(Effect.orDie)
        : fs.link(temp, location).pipe(
            Effect.catchReason("PlatformError", "AlreadyExists", () =>
              Effect.fail(new WriteError({ reason: "conflict", message: `${location} already exists.` })),
            ),
            Effect.catchTag("PlatformError", (error) => Effect.die(error)),
          ),
    () => fs.remove(temp).pipe(Effect.ignore),
  )
  return {
    name,
    description,
    location,
    content: ConfigMarkdown.parse(text).content,
    mtime: yield* modified(location),
  } satisfies Saved
})

/** Deletes a registered project skill file, then its folder when nothing else is left in it. */
export const remove = Effect.fn("SkillFile.remove")(function* (input: {
  directory: string
  registered: readonly Registered[]
  location: string
}) {
  const fs = yield* FSUtil.Service
  const skill = yield* requireFile(input.directory, input.registered, input.location)
  yield* fs.remove(skill.location).pipe(Effect.orDie)
  if (path.basename(skill.location) !== "SKILL.md") return skill
  // rmdir without recursion refuses a folder that still holds references or scripts.
  yield* Effect.tryPromise({ try: () => rmdir(path.dirname(skill.location)), catch: (error) => error }).pipe(
    Effect.catch((error) =>
      error instanceof Error && "code" in error && (error.code === "ENOTEMPTY" || error.code === "EEXIST")
        ? Effect.void
        : Effect.die(error),
    ),
  )
  return skill
})

// Only project skill files the catalog currently registers may change, so the API cannot reach other paths.
const requireFile = Effect.fnUntraced(function* (
  directory: string,
  registered: readonly Registered[],
  location: string,
) {
  const fs = yield* FSUtil.Service
  const skill = registered.find((item) => item.location === location)
  if (!skill) return yield* new WriteError({ reason: "missing", message: `${location} is not a registered skill.` })
  if (!path.isAbsolute(location) || location.startsWith("/builtin/"))
    return yield* new WriteError({ reason: "readonly", message: `${skill.name} is built in and cannot be changed.` })
  const relative = path.relative(directory, location).replaceAll("\\", "/")
  if (relative === GOVERNED_ROOT || relative.startsWith(`${GOVERNED_ROOT}/`))
    return yield* new WriteError({
      reason: "readonly",
      message: `${skill.name} is governed by Atlas and is read-only.`,
    })
  if (path.extname(location) !== ".md" || !PROJECT_ROOTS.some((root) => relative.startsWith(`${root}/`)))
    return yield* new WriteError({
      reason: "readonly",
      message: `${skill.name} is outside this project's skill folders and is read-only here.`,
    })
  if (!(yield* fs.isFile(location)))
    return yield* new WriteError({ reason: "missing", message: `${location} no longer exists on disk.` })
  yield* requireLexical(directory, location)
  return skill
})

// Refuses targets whose nearest existing path resolves elsewhere, so a symlinked folder or file cannot redirect a
// write or delete outside the project. A symlinked project root itself is fine.
const requireLexical = Effect.fnUntraced(function* (directory: string, location: string) {
  const fs = yield* FSUtil.Service
  const root = yield* fs.realPath(directory).pipe(Effect.orDie)
  const existing = yield* nearestExisting(location)
  const real = yield* fs.realPath(existing).pipe(Effect.orDie)
  if (real === path.join(root, path.relative(directory, existing))) return
  return yield* new WriteError({
    reason: "readonly",
    message: `${location} resolves through a symbolic link and cannot be changed.`,
  })
})

const nearestExisting = Effect.fnUntraced(function* (location: string) {
  const fs = yield* FSUtil.Service
  for (const item of ancestors(location)) if (yield* fs.existsSafe(item)) return item
  return path.parse(location).root
})

function ancestors(location: string): string[] {
  const parent = path.dirname(location)
  return parent === location ? [location] : [location, ...ancestors(parent)]
}
