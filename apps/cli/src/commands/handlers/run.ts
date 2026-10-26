import { EOL } from "os"
import path from "path"
import { pathToFileURL } from "url"
import * as Effect from "effect/Effect"
import { Option } from "effect"
import { Orchestra } from "@orchestra/client"
import { ServerAuth } from "@orchestra/server/auth"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { Daemon } from "../../services/daemon"
import { miniOptions } from "./mini-options"
import { runTurn, type Event } from "../../turn"

type Client = ReturnType<typeof Orchestra.make>

export type Options = {
  readonly message: string
  readonly command?: string
  readonly continue: boolean
  readonly session?: string
  readonly fork: boolean
  readonly model?: string
  readonly agent?: string
  readonly json: boolean
  readonly files: ReadonlyArray<{ uri: string; name: string }>
  readonly title?: string
  readonly directory?: string
  readonly variant?: string
  readonly thinking: boolean
  readonly auto: boolean
}

const ATTACH_FILE_MAX_BYTES = 10 * 1024 * 1024

export default Runtime.handler(
  Commands.commands.run,
  Effect.fn("cli.run")(function* (input) {
    if (input.fork && !input.continue && Option.isNone(input.session))
      return yield* Effect.fail(new Error("--fork requires --continue or --session"))

    const attach = Option.getOrUndefined(input.attach)
    const port = Option.getOrUndefined(input.port)
    if (attach && port !== undefined) return yield* Effect.fail(new Error("--port cannot be used with --attach"))
    // The daemon shares this machine's filesystem; an attached server may not, so files travel inline there.
    const files = yield* Effect.promise(() => readFiles(input.file, attach !== undefined))
    if (typeof files === "string") return yield* Effect.fail(new Error(files))

    const typed = input.message.map((arg) => (arg.includes(" ") ? `"${arg.replace(/"/g, '\\"')}"` : arg)).join(" ")
    const piped = input.mini || process.stdin.isTTY ? undefined : yield* Effect.promise(() => Bun.stdin.text())
    const message = !piped ? typed : !typed ? piped : typed + "\n" + piped
    const command = Option.getOrUndefined(input.command)
    if (message.trim().length === 0 && !command && !input.mini) return yield* Effect.fail(new Error("You must provide a message or a command"))

    const dir = Option.getOrUndefined(input.dir)
    const daemon = yield* Daemon.Service
    const transport = attach
      ? {
          url: attach,
          headers: ServerAuth.headers({
            password: Option.getOrUndefined(input.password),
            username: Option.getOrUndefined(input.username),
          }),
        }
      : port !== undefined
        ? { url: yield* daemon.startOn(port), headers: ServerAuth.headers({ password: yield* daemon.password() }) }
        : yield* daemon.transport()
    const client = Orchestra.make({ baseUrl: transport.url, headers: transport.headers })

    const mini = yield* Effect.try({ try: () => miniOptions(input), catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))) })
    if (input.mini) {
      if (command) return yield* Effect.fail(new Error("--mini cannot be used with --command"))
      if (input.format === "json") return yield* Effect.fail(new Error("--mini cannot be used with --format json"))
      if (!process.stdout.isTTY) return yield* Effect.fail(new Error("--mini requires a TTY stdout"))
      const { runTui } = yield* Effect.promise(() => import("../../tui"))
      return yield* runTui(transport, {
        directory: dir ? (attach ? dir : path.resolve(process.cwd(), dir)) : undefined,
        args: miniArgs({
          message,
          model: Option.getOrUndefined(input.model),
          agent: Option.getOrUndefined(input.agent),
          variant: Option.getOrUndefined(input.variant),
          continue: input.continue,
          session: Option.getOrUndefined(input.session),
          fork: input.fork,
          auto: input.auto,
          ...mini,
        }),
      })
    }
    const title = Option.getOrUndefined(input.title)

    const ok = yield* Effect.promise(() =>
      execute(client, {
        message,
        command,
        continue: input.continue,
        session: Option.getOrUndefined(input.session),
        fork: input.fork,
        model: Option.getOrUndefined(input.model),
        agent: Option.getOrUndefined(input.agent),
        json: input.format === "json",
        files,
        title: title === undefined ? undefined : title !== "" ? title : message.slice(0, 50) + (message.length > 50 ? "..." : ""),
        // A daemon runs elsewhere than this shell, so it is always told the directory; an attached server is told only when asked.
        directory: dir ? (attach ? dir : path.resolve(process.cwd(), dir)) : attach ? undefined : process.cwd(),
        variant: Option.getOrUndefined(input.variant),
        thinking: input.thinking,
        auto: input.auto,
      }),
    )
    if (!ok) process.exitCode = 1
  }),
)

/** What the TUI is started with for `run --mini`: the same choices a headless run takes, minus the message framing. */
export function miniArgs(input: {
  readonly message: string
  readonly model?: string
  readonly agent?: string
  readonly variant?: string
  readonly continue: boolean
  readonly session?: string
  readonly fork: boolean
  readonly auto: boolean
  readonly replay?: boolean
  readonly replayLimit?: number
  readonly demo?: boolean
}) {
  return {
    mini: true,
    ...(input.replay === false ? { replay: false } : {}),
    ...(input.replayLimit !== undefined ? { replayLimit: input.replayLimit } : {}),
    ...(input.demo ? { demo: true } : {}),
    ...(input.message.trim() ? { prompt: input.message } : {}),
    ...(input.model ? { model: input.model } : {}),
    ...(input.agent ? { agent: input.agent } : {}),
    ...(input.variant ? { variant: input.variant } : {}),
    ...(input.session ? { sessionID: input.session } : {}),
    continue: input.continue,
    fork: input.fork,
    auto: input.auto,
  }
}

/** Runs one prompt (or slash command) to completion and prints the turn. Resolves false when the run reported a failure. */
export async function execute(client: Client, options: Options) {
  const location = options.directory ? { directory: options.directory } : undefined
  const sessionID = await resolveSession(client, options, location)
  if (!sessionID) return fail(options, "Session not found")
  await denyQuestions(client, sessionID)

  const agent = await pickAgent(client, options.agent, location)
  const model = parseModel(options.model, options.variant)
  if (model === "invalid") return fail(options, `Invalid model "${options.model}": use provider/model`)
  if (agent) await client.sessions.switchAgent({ sessionID, agent })
  if (model) await client.sessions.switchModel({ sessionID, model })

  const state = { started: false, failure: false, tools: new Map<string, string>() }

  const out = (line: string) => process.stdout.write(line + EOL)
  const emit = (type: string, data: unknown) => {
    if (!options.json) return false
    out(JSON.stringify({ type, timestamp: Date.now(), sessionID, data }))
    return true
  }
  const warn = (line: string) => {
    if (options.json) return
    process.stderr.write(line + EOL)
  }

  const render = (event: Event) => {
    const data = event.data as Record<string, any>
    if (data.sessionID !== sessionID) return
    switch (event.type) {
      case "session.next.step.started":
        if (emit("step_start", data) || state.started) return
        state.started = true
        out(`${EOL}> ${data.agent} · ${data.model.id}${EOL}`)
        return
      case "session.next.step.ended":
        emit("step_finish", data)
        return
      case "session.next.step.failed":
        state.failure = true
        if (!emit("error", data)) warn(`Error: ${data.error.message}`)
        return
      case "session.next.text.ended": {
        if (emit("text", data)) return
        const text = String(data.text).trim()
        if (text) out(process.stdout.isTTY ? `${EOL}${text}${EOL}` : text)
        return
      }
      case "session.next.reasoning.ended": {
        if (!options.thinking || emit("reasoning", data)) return
        const text = String(data.text).trim()
        if (text) out(`Thinking: ${text}`)
        return
      }
      case "session.next.tool.called":
        state.tools.set(data.callID, data.tool)
        return
      case "session.next.tool.success":
        if (emit("tool_use", { ...data, tool: state.tools.get(data.callID) })) return
        out(`⚙ ${state.tools.get(data.callID) ?? data.callID}`)
        return
      case "session.next.tool.failed": {
        if (emit("tool_use", { ...data, tool: state.tools.get(data.callID) })) return
        out(`✗ ${state.tools.get(data.callID) ?? data.callID} failed`)
        warn(`Error: ${data.error.message}`)
        return
      }
      case "session.next.retried":
        if (!emit("retry", data)) warn(`Retrying (attempt ${data.attempt}): ${data.error.message}`)
        return
    }
  }

  const finished = await runTurn(client, {
    sessionID,
    location,
    onEvent: render,
    onPermission: async (request) => {
      if (!options.auto) warn(`! permission requested: ${request.action} (${request.resources.join(", ")}); auto-rejecting`)
      return options.auto ? "once" : "reject"
    },
    submit: () =>
      options.command
        ? client.sessions.command({ sessionID, command: options.command, arguments: options.message })
        : client.sessions.prompt({ sessionID, prompt: { text: options.message, files: options.files.map((file) => ({ ...file })) } }),
  }).catch((error: Error) => error)
  if (finished instanceof Error) return fail(options, finished.message || "Prompt was rejected")
  if (!finished) return fail(options, "The prompt was not processed")
  return !state.failure
}

function fail(options: Options, message: string) {
  if (options.json) process.stdout.write(JSON.stringify({ type: "error", timestamp: Date.now(), data: { message } }) + EOL)
  else process.stderr.write(message + EOL)
  return false
}

async function resolveSession(client: Client, options: Options, location: { directory: string } | undefined) {
  const found = options.session
    ? await client.sessions.get({ sessionID: options.session }).catch(() => undefined)
    : options.continue
      ? (await client.sessions.list({ limit: 25, order: "desc", directory: location?.directory })).data.find((item) => !item.parentID)
      : undefined
  // An unknown --session resolves to undefined; every other path resolves to the session ID the run prompts.
  if (options.session && !found) return undefined
  if (found && options.fork) return (await client.sessions.fork({ sessionID: found.id })).id
  if (found) return found.id
  const created = await client.sessions.create({ location })
  if (options.title) await client.sessions.rename({ sessionID: created.id, title: options.title })
  return created.id
}

/** Headless runs cannot answer questions, so whichever Session they prompt (new, continued, resumed or forked) denies them. */
async function denyQuestions(client: Client, sessionID: string) {
  const current = (await client.sessions.getPermission({ sessionID })).data
  if (current.some((rule) => rule.permission === "question" && rule.pattern === "*" && rule.action === "deny")) return
  // setPermission replaces the whole ruleset, so the Session's existing rules are kept and the deny goes last to win.
  await client.sessions.setPermission({
    sessionID,
    permission: [...current, { permission: "question", pattern: "*", action: "deny" }],
  })
}

async function pickAgent(client: Client, name: string | undefined, location: { directory: string } | undefined) {
  if (!name) return undefined
  const agents = await client.agents.list({ location }).catch(() => undefined)
  if (!agents) return skip(`failed to list agents. Falling back to default agent`)
  const agent = agents.data.find((item) => item.id === name)
  if (!agent) return skip(`agent "${name}" not found. Falling back to default agent`)
  if (agent.mode === "subagent") return skip(`agent "${name}" is a subagent, not a primary agent. Falling back to default agent`)
  return name
}

function skip(message: string) {
  process.stderr.write(`! ${message}${EOL}`)
  return undefined
}

function parseModel(value: string | undefined, variant: string | undefined) {
  if (!value) return undefined
  const [providerID, ...rest] = value.split("/")
  const id = rest.join("/")
  if (!providerID || !id) return "invalid" as const
  return { providerID, id, variant }
}

/** Resolves --file arguments to prompt attachments; returns an error message string on failure. */
export async function readFiles(paths: ReadonlyArray<string>, inline: boolean) {
  const files: Array<{ uri: string; name: string }> = []
  for (const input of paths) {
    const resolved = path.resolve(process.cwd(), input)
    const file = Bun.file(resolved)
    if (!(await file.exists()) && !(await isDirectory(resolved))) return `File not found: ${input}`
    if (!inline) {
      files.push({ uri: pathToFileURL(resolved).href, name: path.basename(resolved) })
      continue
    }
    if (await isDirectory(resolved)) return `Cannot attach local directory without a shared filesystem: ${input}`
    if (file.size > ATTACH_FILE_MAX_BYTES) return `Cannot attach local file larger than 10 MiB or a special file: ${input}`
    const mime = file.type.split(";")[0] || "application/octet-stream"
    files.push({ uri: `data:${mime};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`, name: path.basename(resolved) })
  }
  return files
}

async function isDirectory(target: string) {
  return (await Bun.file(target).stat().catch(() => undefined))?.isDirectory() ?? false
}
