export * as SlashCommand from "./slash-command"

// The Location's slash commands, as V1 offers them: the configured commands, then each connected MCP server's prompts
// named `server:prompt`. A run renders the command into the text one prompt sends, resolves its template as V1 did
// (`!`command`` output and `@path` attachments) and carries the command's own agent, model and subtask settings; the
// Session admits the result as any prompt.

import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { Duration, Effect, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import type { Model } from "@orchestra/schema/model"
import type { PromptInput } from "@orchestra/schema/prompt-input"
import { AgentV2 } from "./agent"
import { CommandV2 } from "./command"
import { Config } from "./config"
import { FSUtil } from "./fs-util"
import { Location } from "./location"
import { Mcp } from "./mcp"
import { McpCatalog } from "./mcp/catalog"
import { AppProcess } from "./process"
import { BashTool } from "./tool/bash"

const FILE_REFERENCE = /(?<![\w`])@(\.?[^\s`,.]*(?:\.[^\s`,.]+)*)/g
const SHELL_REFERENCE = /!`([^`]+)`/g
// V1 bound each template command to 120 s.
const SHELL_TIMEOUT = Duration.seconds(120)
const SHELL_OUTPUT_BYTES = 256 * 1024

export type Rendered = {
  readonly text: string
  readonly agent?: string
  readonly model?: Model.Ref
  readonly subtask?: boolean
}

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("SlashCommand.NotFoundError", {
  name: Schema.String,
}) {}

export const list = Effect.fn("SlashCommand.list")(function* () {
  const commands = yield* CommandV2.Service
  const mcp = yield* Mcp.Service
  const configured = yield* commands.list()
  const names = new Set(configured.map((command) => command.name))
  const prompts = (yield* mcp.prompts()).flatMap((prompt): CommandV2.Info[] =>
    names.has(promptName(prompt))
      ? []
      : [
          {
            name: promptName(prompt),
            template: "",
            ...(prompt.description === undefined ? {} : { description: prompt.description }),
          },
        ],
  )
  return [...configured, ...prompts]
})

/** The text one run of the command sends, with its arguments filled in. */
export const render = Effect.fn("SlashCommand.render")(function* (name: string, args: string) {
  const commands = yield* CommandV2.Service
  const configured = yield* commands.get(name)
  if (configured)
    return {
      text: expand(configured.template, args),
      ...(configured.agent === undefined ? {} : { agent: configured.agent }),
      ...(configured.model === undefined ? {} : { model: configured.model }),
      ...(configured.subtask === undefined ? {} : { subtask: configured.subtask }),
    } satisfies Rendered
  const mcp = yield* Mcp.Service
  const prompt = (yield* mcp.prompts()).find((item) => promptName(item) === name)
  if (!prompt) return yield* new NotFoundError({ name })
  // As V1: the prompt's arguments are rendered as `$1`…`$n` placeholders, which the invocation's arguments then fill.
  const template = yield* mcp.getPrompt(
    prompt.server,
    prompt.name,
    Object.fromEntries((prompt.arguments ?? []).map((argument, index) => [argument.name, `$${index + 1}`])),
  )
  return { text: expand(template, args) } satisfies Rendered
})

/**
 * The prompt a rendered command sends, as V1 built it: each `!`command`` runs in the Location's shell and is replaced
 * by its output; each `@path` naming a file or directory (relative to the project, or `~/`) is attached, and one naming
 * an agent is mentioned. A subtask command (or one whose agent is a subagent) mentions its agent for the task tool;
 * otherwise its agent and model (the agent's own model by default) are what the Session switches to.
 */
export const resolve = Effect.fn("SlashCommand.resolve")(function* (rendered: Rendered) {
  const agents = yield* AgentV2.Service
  const fs = yield* FSUtil.Service
  const location = yield* Location.Service
  const text = yield* shell(rendered.text)
  const references = Array.from(new Set(Array.from(text.matchAll(FILE_REFERENCE), (match) => match[1]).filter(Boolean)))
  const attached = yield* Effect.forEach(
    references,
    (name) =>
      Effect.gen(function* () {
        const filepath = name.startsWith("~/")
          ? path.join(os.homedir(), name.slice(2))
          : path.resolve(location.project.directory, name)
        const info = yield* fs.stat(filepath).pipe(Effect.option)
        if (info._tag === "Some")
          return {
            // A directory URI ends in a slash, which admission reads as a directory.
            file: { uri: pathToFileURL(info.value.type === "Directory" ? `${filepath}/` : filepath).href, name },
          }
        const agent = yield* agents.resolve(name)
        return agent ? { agent: { name: agent.id } } : {}
      }),
    { concurrency: "unbounded" },
  )
  const info = rendered.agent === undefined ? undefined : yield* agents.resolve(rendered.agent)
  const subtask = rendered.subtask === true || (info?.mode === "subagent" && rendered.subtask !== false)
  const mentioned = attached.flatMap((item) => ("agent" in item && item.agent ? [item.agent] : []))
  const prompt = {
    text,
    files: attached.flatMap((item) => ("file" in item && item.file ? [item.file] : [])),
    agents: subtask && rendered.agent ? [...mentioned, { name: rendered.agent }] : mentioned,
  } satisfies PromptInput.Prompt
  if (subtask) return { prompt }
  return {
    prompt,
    ...(rendered.agent === undefined ? {} : { agent: rendered.agent }),
    ...((rendered.model ?? info?.model) === undefined ? {} : { model: rendered.model ?? info?.model }),
  }
})

const shell = Effect.fnUntraced(function* (text: string) {
  const commands = Array.from(text.matchAll(SHELL_REFERENCE), (match) => match[1])
  if (commands.length === 0) return text
  const appProcess = yield* AppProcess.Service
  const config = yield* Config.Service
  const location = yield* Location.Service
  const shell = BashTool.configuredShell(yield* config.entries())
  const outputs = yield* Effect.forEach(
    commands,
    (command) =>
      appProcess
        .run(
          ChildProcess.make(command, [], {
            cwd: location.directory,
            shell,
            stdin: "ignore",
            detached: process.platform !== "win32",
            forceKillAfter: Duration.seconds(3),
          }),
          { combineOutput: true, timeout: SHELL_TIMEOUT, maxOutputBytes: SHELL_OUTPUT_BYTES },
        )
        .pipe(
          Effect.map((result) => (result.output ?? result.stdout).toString("utf8")),
          Effect.catchTag("AppProcessError", (error) => Effect.succeed(error.message)),
        ),
    { concurrency: "unbounded" },
  )
  let index = 0
  return text.replace(SHELL_REFERENCE, () => outputs[index++] ?? "")
})

/**
 * Fills `$1`…`$n` with the arguments, the last placeholder taking the rest, and `$ARGUMENTS` with all of them; a
 * template with neither gets the arguments appended.
 */
export function expand(template: string, args: string) {
  const values = (args.match(/(?:\[Image\s+\d+\]|"[^"]*"|'[^']*'|[^\s"']+)/gi) ?? []).map((arg) =>
    arg.replace(/^["']|["']$/g, ""),
  )
  const placeholders = template.match(/\$(\d+)/g) ?? []
  const last = placeholders.reduce((last, item) => Math.max(last, Number(item.slice(1))), 0)
  const filled = template
    .replaceAll(/\$(\d+)/g, (_, index) => {
      const position = Number(index)
      if (position > values.length) return ""
      if (position === last) return values.slice(position - 1).join(" ")
      return values[position - 1] ?? ""
    })
    .replaceAll("$ARGUMENTS", () => args)
  if (placeholders.length === 0 && !template.includes("$ARGUMENTS") && args.trim()) return `${filled}\n\n${args}`.trim()
  return filled.trim()
}

function promptName(prompt: Mcp.Prompt) {
  return `${McpCatalog.sanitize(prompt.server)}:${McpCatalog.sanitize(prompt.name)}`
}
