import { EOL } from "os"
import * as Effect from "effect/Effect"
import { Option } from "effect"
import type { McpAddInput, Orchestra } from "@orchestra/client"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { Daemon } from "../../../services/daemon"
import { terminal, type Prompter } from "../prompt"

type Config = McpAddInput["config"]

export default Runtime.handler(
  Commands.commands.mcp.commands.add,
  Effect.fn("cli.mcp.add")(function* (input) {
    const daemon = yield* Daemon.Service
    const client = yield* daemon.client()
    const name = yield* Effect.promise(() =>
      add(client, terminal, process.cwd(), {
        name: Option.getOrUndefined(input.name),
        url: Option.getOrUndefined(input.url),
        env: input.env,
        header: input.header,
        command: input.command,
      }),
    )
    process.stdout.write(`MCP server "${name}" added` + EOL)
  }),
)

export async function add(
  client: ReturnType<typeof Orchestra.make>,
  prompter: Prompter,
  directory: string,
  input: {
    readonly name?: string
    readonly url?: string
    readonly env: ReadonlyArray<string>
    readonly header: ReadonlyArray<string>
    readonly command: ReadonlyArray<string>
  },
) {
  const interactive = !input.name && !input.url && input.env.length === 0 && input.header.length === 0 && input.command.length === 0
  const name = input.name ?? (interactive ? await prompter.text("Enter MCP server name") : fail("A server name is required for non-interactive MCP configuration"))
  if (!name) fail("A server name is required")
  const config = interactive ? await ask(prompter) : parse(input)
  await client.mcp.add({ server: name, location: { directory }, config })
  return name
}

/** The flag form: exactly one of --url or a command, with only the options that kind accepts. */
export function parse(input: {
  readonly url?: string
  readonly env: ReadonlyArray<string>
  readonly header: ReadonlyArray<string>
  readonly command: ReadonlyArray<string>
}): Config {
  if (!!input.url === input.command.length > 0) fail("Provide either --url <url> or a command after --")
  if (input.url && !URL.canParse(input.url)) fail(`Invalid URL: ${input.url}`)
  if (input.url && input.env.length > 0) fail("--env is only valid for local MCP servers")
  if (input.command.length > 0 && input.header.length > 0) fail("--header is only valid for remote MCP servers")
  const environment = pairs(input.env, "environment variable")
  const headers = pairs(input.header, "HTTP header")
  if (input.url) return { type: "remote", url: input.url, ...(Object.keys(headers).length ? { headers } : {}) }
  return { type: "local", command: [...input.command], ...(Object.keys(environment).length ? { environment } : {}) }
}

function pairs(values: ReadonlyArray<string>, kind: string) {
  return Object.fromEntries(
    values.map((entry) => {
      const index = entry.indexOf("=")
      if (index < 1) fail(`Invalid ${kind}: ${entry}. Expected KEY=VALUE`)
      return [entry.slice(0, index), entry.slice(index + 1)]
    }),
  )
}

async function ask(prompter: Prompter): Promise<Config> {
  const type = await prompter.select("Select MCP server type", [
    { label: "Local (run a local command)", value: "local" as const },
    { label: "Remote (connect to a remote URL)", value: "remote" as const },
  ])
  if (type === "local") {
    const command = (await prompter.text("Enter command to run")).split(" ").filter(Boolean)
    if (command.length === 0) fail("A command is required")
    return { type: "local", command }
  }
  const url = await prompter.text("Enter MCP server URL")
  if (!URL.canParse(url)) fail(`Invalid URL: ${url}`)
  return { type: "remote", url }
}

function fail(message: string): never {
  throw new Error(message)
}
