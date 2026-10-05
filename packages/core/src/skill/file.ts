export * as SkillFile from "./file"

import path from "path"
import matter from "gray-matter"
import { Effect, Schema } from "effect"
import { ConfigMarkdown } from "../config/markdown"
import { FSUtil } from "../fs-util"

// New names become directory names and skill tool arguments, so they follow the Agent Skills naming rule.
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const NAME_LIMIT = 64

export class WriteError extends Schema.TaggedErrorClass<WriteError>()("SkillWriteError", {
  reason: Schema.Literals(["invalid", "missing", "conflict"]),
  message: Schema.String,
}) {}

export type Registered = { readonly name: string; readonly location: string }

export interface SaveInput {
  readonly name: string
  readonly description: string
  readonly content: string
  /** Existing registered skill file to rewrite. Omit to create a project skill. */
  readonly location?: string
}

export interface Saved {
  readonly name: string
  readonly description: string
  readonly location: string
  readonly content: string
}

/**
 * Creates `<directory>/.opencode/skills/<name>/SKILL.md`, or rewrites a registered skill file in place.
 * Edits keep frontmatter keys other than `name` and `description`.
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
    input.skill.location === undefined ? undefined : yield* requireFile(input.registered, input.skill.location)
  if (!name || name.length > NAME_LIMIT || (name !== current?.name && !NAME.test(name)))
    return yield* new WriteError({
      reason: "invalid",
      message: `Skill names use up to ${NAME_LIMIT} lowercase letters, numbers and single hyphens.`,
    })
  if (!description) return yield* new WriteError({ reason: "invalid", message: "A skill needs a description." })
  if (input.registered.some((skill) => skill.name === name && skill.location !== current?.location))
    return yield* new WriteError({ reason: "conflict", message: `A skill named ${name} is already registered.` })
  const location = current?.location ?? path.join(input.directory, ".opencode", "skills", name, "SKILL.md")
  const existing = yield* fs.readFileStringSafe(location).pipe(Effect.orDie)
  if (!current && existing !== undefined)
    return yield* new WriteError({ reason: "conflict", message: `${location} already exists.` })
  const data = existing === undefined ? {} : ConfigMarkdown.parseOption(existing)?.data
  const body = input.skill.content.endsWith("\n") ? input.skill.content : `${input.skill.content}\n`
  const text = matter.stringify(body, { ...data, name, description })
  yield* fs.writeWithDirs(location, text).pipe(Effect.orDie)
  return { name, description, location, content: ConfigMarkdown.parse(text).content } satisfies Saved
})

/** Deletes a registered skill file, then its folder when the skill was the folder's only file. */
export const remove = Effect.fn("SkillFile.remove")(function* (input: {
  registered: readonly Registered[]
  location: string
}) {
  const fs = yield* FSUtil.Service
  const skill = yield* requireFile(input.registered, input.location)
  yield* fs.remove(skill.location).pipe(Effect.orDie)
  const folder = path.dirname(skill.location)
  if (path.basename(skill.location) !== "SKILL.md") return skill
  // Bun rejects removing a directory without `recursive`; the folder is known to be empty here.
  if ((yield* fs.readDirectory(folder).pipe(Effect.orDie)).length === 0)
    yield* fs.remove(folder, { recursive: true }).pipe(Effect.orDie)
  return skill
})

// Only files the catalog currently registers may change, so the API cannot reach arbitrary paths.
const requireFile = Effect.fnUntraced(function* (registered: readonly Registered[], location: string) {
  const fs = yield* FSUtil.Service
  const skill = registered.find((item) => item.location === location)
  if (!skill) return yield* new WriteError({ reason: "missing", message: `${location} is not a registered skill.` })
  if (!path.isAbsolute(location) || path.extname(location) !== ".md" || !(yield* fs.isFile(location)))
    return yield* new WriteError({ reason: "invalid", message: `${skill.name} is built in and cannot be changed.` })
  return skill
})
