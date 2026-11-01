export * as SkillTool from "./skill"

import path from "path"
import { ToolFailure } from "@orchestra/llm"
import { Effect, Layer, Option, Schema } from "effect"
import { ConfigMarkdown } from "../config/markdown"
import { makeLocationNode } from "../effect/app-node"
import { FSUtil } from "../fs-util"
import { SkillV2 } from "../skill"
import { PermissionV2 } from "../permission"
import { ToolRegistry } from "./registry"
import { ToolText } from "./text"
import { Tool } from "./tool"
import { Tools } from "./tools"

export const name = "skill"
const FILE_LIMIT = 10
// The sample reads at most this many directories, so a huge tree beside a SKILL.md costs a fixed amount.
const DIRECTORY_LIMIT = 50
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules"])
// A miss lists every available name up to this many, and the closest few beyond it.
const NAME_LIMIT = 20
const CLOSE_LIMIT = 5

export const Input = Schema.Struct({
  name: Schema.String.annotate({ description: "The name of the skill from the available skills list" }),
})

export const Output = Schema.Struct({
  name: Schema.String,
  directory: Schema.String,
  output: Schema.String,
})

export const description = ToolText.skill

export const toModelOutput = (skill: SkillV2.Info, files: ReadonlyArray<string>, next: ReadonlyArray<Node> = []) => {
  const directory = path.dirname(skill.location)
  return [
    `<skill_content name="${skill.name}">`,
    `# Skill: ${skill.name}`,
    "",
    skill.content.trim(),
    "",
    ...(next.length === 0
      ? []
      : [
          "## Next level",
          "",
          "Load the one node that covers the work with the skill tool, one level at a time. Stop at the first node that covers it.",
          "",
          ...next.map((node) =>
            [
              `- \`${node.name}\`: ${node.description ?? ""}`,
              node.when ? ` When: ${node.when}` : "",
              node.notWhen ? ` Not when: ${node.notWhen}` : "",
            ].join(""),
          ),
          "",
        ]),
    `Base directory for this skill: ${directory}`,
    "Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.",
    "Note: file list is sampled.",
    "",
    "<skill_files>",
    ...files.map((file) => `<file>${file}</file>`),
    "</skill_files>",
    "</skill_content>",
  ].join("\n")
}

/** A child node as its parent's "Next level" index shows it. */
export type Node = {
  readonly name: string
  readonly description?: string
  readonly when?: string
  readonly notWhen?: string
}

const Routing = Schema.Struct({
  when: Schema.String.pipe(Schema.optional),
  "not-when": Schema.String.pipe(Schema.optional),
})
const decodeRouting = Schema.decodeUnknownOption(Routing)

/**
 * The skill's model-facing content with a sample of the files beside its `SKILL.md` and, for a skill tree node, the
 * "Next level" index of its `children` built from their frontmatter.
 */
export const load = Effect.fn("SkillTool.load")(function* (
  fs: FSUtil.Interface,
  skill: SkillV2.Info,
  children: ReadonlyArray<SkillV2.Info> = [],
) {
  const files = path.basename(skill.location) === "SKILL.md" ? yield* sampleFiles(fs, path.dirname(skill.location)) : []
  const next = yield* Effect.forEach(children, (child) =>
    fs.readFileStringSafe(child.location).pipe(
      Effect.catch(() => Effect.succeed(undefined)),
      Effect.map((content) => {
        const markdown = content === undefined ? undefined : ConfigMarkdown.parseOption(content)
        const routing = markdown ? decodeRouting(markdown.data).pipe(Option.getOrUndefined) : undefined
        return { name: child.name, description: child.description, when: routing?.when, notWhen: routing?.["not-when"] }
      }),
    ),
  )
  return toModelOutput(skill, files, next)
})

/**
 * A bounded breadth-first sample of the files beside a `SKILL.md`, shallowest first and sorted within a directory. It
 * stops at FILE_LIMIT files or DIRECTORY_LIMIT directories, whichever comes first; symlinks are not followed.
 */
export const sampleFiles = Effect.fn("SkillTool.sampleFiles")(function* (fs: FSUtil.Interface, directory: string) {
  const files: string[] = []
  const queue = [directory]
  for (let visited = 0; visited < DIRECTORY_LIMIT && files.length < FILE_LIMIT; visited++) {
    const current = queue.shift()
    if (current === undefined) break
    const entries = (yield* fs
      .readDirectoryEntries(current)
      .pipe(Effect.catch(() => Effect.succeed([] as FSUtil.DirEntry[]))))
      .toSorted((a, b) => a.name.localeCompare(b.name))
    files.push(
      ...entries
        .filter((entry) => entry.type === "file" && entry.name !== "SKILL.md")
        .slice(0, FILE_LIMIT - files.length)
        .map((entry) => path.join(current, entry.name)),
    )
    queue.push(
      ...entries
        .filter((entry) => entry.type === "directory" && !SKIPPED_DIRECTORIES.has(entry.name))
        .map((entry) => path.join(current, entry.name)),
    )
  }
  return files
})

/** What a miss tells the model: the loadable names, or the closest few when there are many. Nodes load only through their parent. */
export function missingSkill(name: string, skills: ReadonlyArray<SkillV2.Info>) {
  const names = skills
    .filter((skill) => !SkillV2.nested(skills, skill))
    .map((skill) => skill.name)
    .toSorted()
  if (names.length === 0) return `Unable to load skill ${name}: not found, and no skills are available`
  if (names.length <= NAME_LIMIT) return `Unable to load skill ${name}: not found. Available skills: ${names.join(", ")}`
  const closest = names
    .map((candidate) => ({ candidate, distance: distance(candidate.toLowerCase(), name.toLowerCase()) }))
    .toSorted((a, b) => a.distance - b.distance)
    .slice(0, CLOSE_LIMIT)
    .map((item) => item.candidate)
  return `Unable to load skill ${name}: not found. Closest of ${names.length} available skills: ${closest.join(", ")}`
}

// Levenshtein distance, one row at a time.
function distance(left: string, right: string) {
  return [...left].reduce(
    (previous, char, row) => {
      const current = [row + 1]
      for (let column = 1; column <= right.length; column++)
        current.push(
          Math.min(
            previous[column] + 1,
            current[column - 1] + 1,
            previous[column - 1] + (char === right[column - 1] ? 0 : 1),
          ),
        )
      return current
    },
    Array.from({ length: right.length + 1 }, (_, index) => index),
  )[right.length]
}

/** The failure keeps the underlying cause on `error` and in its message, so the model sees why the load failed. */
const unableToLoad = (name: string, error: unknown) =>
  new ToolFailure({ message: `Unable to load skill ${name}: ${reasonOf(error)}`, error })

function reasonOf(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "object" && error !== null && "_tag" in error) return String(error._tag)
  return String(error)
}

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const fs = yield* FSUtil.Service
    const skills = yield* SkillV2.Service
    const permission = yield* PermissionV2.Service
    yield* tools
      .register({
        [name]: Tool.make({
          description,
          input: Input,
          output: Output,
          toModelOutput: ({ output }) => [{ type: "text", text: output.output }],
          execute: (input, context) =>
            Effect.gen(function* () {
              const current = yield* skills.list()
              const skill = current.find((skill) => skill.name === input.name)
              if (!skill) return yield* new ToolFailure({ message: missingSkill(input.name, current) })
              return yield* Effect.gen(function* () {
                yield* permission.assert({
                  action: name,
                  resources: [skill.name],
                  save: [skill.name],
                  sessionID: context.sessionID,
                  agent: context.agent,
                  source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
                })
                return {
                  name: skill.name,
                  directory: path.dirname(skill.location),
                  output: yield* load(fs, skill, SkillV2.children(current, skill)),
                }
              }).pipe(Effect.mapError((error) => unableToLoad(input.name, error)))
            }),
        }),
      })
      .pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "tool/skill",
  layer,
  deps: [ToolRegistry.node, FSUtil.node, SkillV2.node, PermissionV2.node],
})
