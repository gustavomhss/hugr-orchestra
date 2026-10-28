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
  const directory = path.dirname(skill.location)
  const files =
    path.basename(skill.location) === "SKILL.md"
      ? (yield* fs.glob("**/*", { cwd: directory, absolute: true, include: "file", dot: true }))
          .filter((file) => path.basename(file) !== "SKILL.md")
          .toSorted()
          .slice(0, FILE_LIMIT)
      : []
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

const unableToLoad = (name: string, error?: unknown) =>
  new ToolFailure({ message: `Unable to load skill ${name}`, error })

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
              if (!skill) return yield* unableToLoad(input.name)
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
