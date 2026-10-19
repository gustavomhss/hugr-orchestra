export * as SlashCommand from "./slash-command"

// The Location's slash commands, as V1 offers them: the configured commands, then each connected MCP server's prompts
// named `server:prompt`. A run renders the command into the text one prompt sends; the Session admits it as any prompt.

import { Effect, Schema } from "effect"
import { CommandV2 } from "./command"
import { Mcp } from "./mcp"
import { McpCatalog } from "./mcp/catalog"

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
  if (configured) return expand(configured.template, args)
  const mcp = yield* Mcp.Service
  const prompt = (yield* mcp.prompts()).find((item) => promptName(item) === name)
  if (!prompt) return yield* new NotFoundError({ name })
  // As V1: the prompt's arguments are rendered as `$1`…`$n` placeholders, which the invocation's arguments then fill.
  const template = yield* mcp.getPrompt(
    prompt.server,
    prompt.name,
    Object.fromEntries((prompt.arguments ?? []).map((argument, index) => [argument.name, `$${index + 1}`])),
  )
  return expand(template, args)
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
