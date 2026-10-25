import { EOL } from "os"
import * as Effect from "effect/Effect"
import { Option } from "effect"
import type { IntegrationsListOutput, Orchestra } from "@orchestra/client"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { Daemon } from "../../../services/daemon"
import { Spawn } from "../../../services/process"
import { terminal, type Prompter } from "../prompt"

type Integration = IntegrationsListOutput["data"][number]
type Method = Integration["methods"][number]
type LoginMethod = Exclude<Method, { type: "env" }>

export default Runtime.handler(
  Commands.commands.providers.commands.login,
  Effect.fn("cli.providers.login")(function* (input) {
    const daemon = yield* Daemon.Service
    const client = yield* daemon.client()
    const spawner = yield* ChildProcessSpawner
    yield* Effect.promise(() =>
      login(client, terminal, {
        directory: process.cwd(),
        url: Option.getOrUndefined(input.url),
        runAuth: (command) =>
          Effect.runPromise(
            Spawn.run(command, { stdin: "inherit", stderr: "inherit" }).pipe(
              Effect.provideService(ChildProcessSpawner, spawner),
            ),
          ),
        provider: Option.getOrUndefined(input.provider),
        method: Option.getOrUndefined(input.method),
        label: Option.getOrUndefined(input.label),
        say: (line) => process.stdout.write(line + EOL),
      }),
    )
  }),
)

export async function login(
  client: ReturnType<typeof Orchestra.make>,
  prompter: Prompter,
  options: {
    readonly directory: string
    /** Auth provider URL: its `/.well-known/orchestra` names a command whose output is the token to store. */
    readonly url?: string
    /** Runs the well-known auth command with the terminal attached and returns what it printed. */
    readonly runAuth?: (command: readonly [string, ...string[]]) => Promise<{ readonly exitCode: number; readonly stdout: string }>
    readonly provider?: string
    readonly method?: string
    readonly label?: string
    readonly say: (line: string) => void
    readonly pollMs?: number
  },
) {
  const location = { directory: options.directory }
  if (options.url) return wellknownLogin(client, options.url, location, options)
  const integrations = (await client.integrations.list({ location })).data
  const choice =
    options.provider === other
      ? other
      : options.provider
        ? find(integrations, options.provider, (item) => [item.id, item.name]) ??
          fail(`Unknown provider "${options.provider}"`)
        : await prompter.select<Integration | typeof other>("Select provider", [
            ...integrations.filter(loginMethods).map((item) => ({ label: item.name, value: item })),
            { label: "Other", value: other },
          ])
  if (choice === other) return customLogin(client, prompter, location, options)
  const integration = choice
  const methods = loginMethods(integration)
  if (methods.length === 0) fail(`${integration.name} has no login method; configure it with its environment variables`)
  const method = options.method
    ? find(methods, options.method, (item) => [methodLabel(item), item.type]) ??
      fail(`Unknown method "${options.method}" for ${integration.id}. Available: ${methods.map(methodLabel).join(", ")}`)
    : methods.length === 1
      ? methods[0]
      : await prompter.select("Login method", methods.map((item) => ({ label: methodLabel(item), value: item })))

  if (method.type === "key") {
    const key = await prompter.secret("Enter your API key")
    if (!key) fail("An API key is required")
    await client.integrations.connectKey({ integrationID: integration.id, location, key, label: options.label })
    return options.say(`Logged into ${integration.name}`)
  }

  const inputs = await collectInputs(prompter, method.prompts ?? [])
  const attempt = (
    await client.integrations.connectOauth({
      integrationID: integration.id,
      location,
      methodID: method.id,
      inputs,
      label: options.label,
    })
  ).data
  options.say(`Go to: ${attempt.url}`)
  if (attempt.instructions) options.say(attempt.instructions)
  const target = { integrationID: integration.id, attemptID: attempt.attemptID, location }
  if (attempt.mode === "code") {
    const code = await prompter.text("Paste the authorization code here")
    await client.integrations.oauthComplete({ ...target, code })
    return options.say(`Logged into ${integration.name}`)
  }
  while (true) {
    const status = (await client.integrations.oauthStatus(target)).data
    if (status.status === "complete") return options.say(`Logged into ${integration.name}`)
    if (status.status === "failed") fail(`Failed to authorize: ${status.message}`)
    if (status.status === "expired") fail("Failed to authorize: the login expired")
    await Bun.sleep(options.pollMs ?? 1000)
  }
}

function loginMethods(integration: Integration) {
  return integration.methods.filter((method): method is LoginMethod => method.type !== "env")
}

function methodLabel(method: LoginMethod) {
  return method.type === "oauth" ? method.label : (method.label ?? "API key")
}

function find<A>(items: ReadonlyArray<A>, wanted: string, names: (item: A) => ReadonlyArray<string>) {
  return items.find((item) => names(item).some((name) => name.toLowerCase() === wanted.toLowerCase()))
}

function fail(message: string): never {
  throw new Error(message)
}

type Prompts = NonNullable<Extract<LoginMethod, { type: "oauth" }>["prompts"]>

// Prompts depend on earlier answers: one whose `when` key was never answered is skipped.
async function collectInputs(prompter: Prompter, prompts: Prompts) {
  const inputs: Record<string, string> = {}
  for (const prompt of prompts) {
    if (prompt.when) {
      const value = inputs[prompt.when.key]
      if (value === undefined) continue
      if ((prompt.when.op === "eq") !== (value === prompt.when.value)) continue
    }
    inputs[prompt.key] =
      prompt.type === "select"
        ? await prompter.select(prompt.message, prompt.options.map((option) => ({ label: option.label, value: option.value })))
        : await prompter.text(prompt.message)
  }
  return inputs
}

const other = "other"

// A provider the server does not list: the credential is stored under the id the person types, to be wired in config.
async function customLogin(
  client: ReturnType<typeof Orchestra.make>,
  prompter: Prompter,
  location: { readonly directory: string },
  options: { readonly label?: string; readonly say: (line: string) => void },
) {
  const id = (await prompter.text("Enter provider id")).replace(/^@ai-sdk\//, "")
  if (!/^[0-9a-z-]+$/.test(id)) fail("Provider id: a-z, 0-9 and hyphens only")
  options.say(`This only stores a credential for ${id} - you will need to configure it in the config file.`)
  const key = await prompter.secret("Enter your API key")
  if (!key) fail("An API key is required")
  await client.integrations.connectKey({ integrationID: id, location, key, label: options.label })
  options.say(`Logged into ${id}`)
}

async function wellknownLogin(
  client: ReturnType<typeof Orchestra.make>,
  rawURL: string,
  location: { readonly directory: string },
  options: {
    readonly label?: string
    readonly say: (line: string) => void
    readonly runAuth?: (command: readonly [string, ...string[]]) => Promise<{ readonly exitCode: number; readonly stdout: string }>
  },
) {
  const url = rawURL.replace(/\/+$/, "")
  const metadata = await fetch(`${url}/.well-known/orchestra`)
    .then((response) => response.json() as Promise<{ auth: { command: string[]; env: string } }>)
    .catch((error: unknown) =>
      fail(`Failed to load auth provider metadata from ${url}: ${error instanceof Error ? error.message : error}`),
    )
  if (!options.runAuth) fail("Running an auth provider command is not available here")
  const [program, ...args] = metadata.auth.command
  if (!program) fail("The auth provider names no command to run")
  options.say(`Running \`${metadata.auth.command.join(" ")}\``)
  const result = await options.runAuth([program, ...args])
  if (result.exitCode !== 0) fail("The auth provider command failed")
  await client.integrations.connectKey({
    integrationID: url,
    location,
    key: result.stdout.trim(),
    label: options.label,
    metadata: { wellknown: { env: metadata.auth.env } },
  })
  options.say(`Logged into ${url}`)
}
