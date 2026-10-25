import { EOL } from "os"
import path from "path"
import { pathToFileURL } from "url"
import * as Effect from "effect/Effect"
import { Option } from "effect"
import { Orchestra } from "@orchestra/client"
import type { SessionsEventsOutput } from "@orchestra/client"
import { ServerAuth } from "@orchestra/server/auth"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { Daemon } from "../../services/daemon"

type Client = ReturnType<typeof Orchestra.make>
type Event = SessionsEventsOutput

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
    // The daemon shares this machine's filesystem; an attached server may not, so files travel inline there.
    const files = yield* Effect.promise(() => readFiles(input.file, attach !== undefined))
    if (typeof files === "string") return yield* Effect.fail(new Error(files))

    const typed = input.message.map((arg) => (arg.includes(" ") ? `"${arg.replace(/"/g, '\\"')}"` : arg)).join(" ")
    const piped = process.stdin.isTTY ? undefined : yield* Effect.promise(() => Bun.stdin.text())
    const message = !piped ? typed : !typed ? piped : typed + "\n" + piped
    const command = Option.getOrUndefined(input.command)
    if (message.trim().length === 0 && !command) return yield* Effect.fail(new Error("You must provide a message or a command"))

    const dir = Option.getOrUndefined(input.dir)
    const daemon = yield* Daemon.Service
    const client = attach
      ? Orchestra.make({
          baseUrl: attach,
          headers: ServerAuth.headers({
            password: Option.getOrUndefined(input.password),
            username: Option.getOrUndefined(input.username),
          }),
        })
      : yield* daemon.client()
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

/** Runs one prompt (or slash command) to completion and prints the turn. Resolves false when the run reported a failure. */
export async function execute(client: Client, options: Options) {
  const location = options.directory ? { directory: options.directory } : undefined
  const session = await resolveSession(client, options, location)
  if (typeof session === "string") return fail(options, session)
  const sessionID = session

  const agent = await pickAgent(client, options.agent, location)
  const model = parseModel(options.model, options.variant)
  if (model === "invalid") return fail(options, `Invalid model "${options.model}": use provider/model`)
  if (agent) await client.sessions.switchAgent({ sessionID, agent })
  if (model) await client.sessions.switchModel({ sessionID, model })

  const baseline = await lastSeq(client, sessionID)
  const state = {
    seq: baseline ?? -1,
    started: false,
    failure: false,
    promoted: new Set<string>(),
    tools: new Map<string, string>(),
  }

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
    const seq = event.durable?.seq
    if (seq !== undefined) {
      if (seq <= state.seq) return
      state.seq = seq
    }
    const data = event.data as Record<string, any>
    if (data.sessionID !== sessionID) return
    switch (event.type) {
      case "session.next.prompted":
        state.promoted.add(data.messageID)
        return
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

  const stop = new AbortController()
  const stream = (async () => {
    for await (const event of client.sessions.events({ sessionID, after: baseline }, { signal: stop.signal })) render(event)
  })().catch(() => undefined)
  const permissions = answerPermissions(client, sessionID, options.auto, location, stop.signal, warn)

  const admitted = await (options.command
    ? client.sessions.command({ sessionID, command: options.command, arguments: options.message })
    : client.sessions.prompt({ sessionID, prompt: { text: options.message, files: options.files.map((file) => ({ ...file })) } })
  ).catch((error) => (error instanceof Error ? error : new Error(JSON.stringify(error))))
  if (admitted instanceof Error) {
    stop.abort()
    await Promise.all([stream, permissions])
    return fail(options, admitted.message || "Prompt was rejected")
  }

  // The wake that drains the prompt is advisory: a wait that returns before our prompt was promoted observed an idle
  // session, not our turn, so wait again until the history shows the prompt was picked up.
  const finished = await (async () => {
    for (let attempt = 0; attempt < 40; attempt++) {
      await client.sessions.wait({ sessionID })
      await flush(client, sessionID, state, render)
      if (state.promoted.has(admitted.id)) return true
      await Bun.sleep(250)
    }
    return false
  })()
  stop.abort()
  await Promise.all([stream, permissions])
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
  if (options.session && !found) return "Session not found"
  if (found && options.fork) return (await client.sessions.fork({ sessionID: found.id })).id
  if (found) return found.id
  const created = await client.sessions.create({ location })
  if (options.title) await client.sessions.rename({ sessionID: created.id, title: options.title })
  // Headless runs cannot answer questions.
  await client.sessions.setPermission({ sessionID: created.id, permission: [{ permission: "question", pattern: "*", action: "deny" }] })
  return created.id
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

async function lastSeq(client: Client, sessionID: string) {
  let after: number | undefined
  while (true) {
    const page = await client.sessions.history({ sessionID, after })
    after = page.data.at(-1)?.durable?.seq ?? after
    if (!page.hasMore) return after
  }
}

async function flush(client: Client, sessionID: string, state: { seq: number }, render: (event: Event) => void) {
  while (true) {
    const page = await client.sessions.history({ sessionID, after: state.seq < 0 ? undefined : state.seq })
    page.data.forEach((event) => render(event as Event))
    if (!page.hasMore) return
  }
}

/** Answers permission requests raised by this session or its subagents; an unanswered request would block the run forever. */
async function answerPermissions(
  client: Client,
  sessionID: string,
  auto: boolean,
  location: { directory: string } | undefined,
  signal: AbortSignal,
  warn: (line: string) => void,
) {
  const answered = new Set<string>()
  const family = new Map<string, boolean>([[sessionID, true]])
  const belongs = async (id: string): Promise<boolean> => {
    const known = family.get(id)
    if (known !== undefined) return known
    const parent = (await client.sessions.get({ sessionID: id }).catch(() => undefined))?.parentID
    const result = parent ? await belongs(parent) : false
    family.set(id, result)
    return result
  }
  while (!signal.aborted) {
    const requests = await client.permissions.listRequests({ location }).catch(() => undefined)
    for (const request of requests?.data ?? []) {
      if (answered.has(request.id) || !(await belongs(request.sessionID))) continue
      answered.add(request.id)
      if (!auto) warn(`! permission requested: ${request.action} (${request.resources.join(", ")}); auto-rejecting`)
      await client.permissions
        .reply({ sessionID: request.sessionID, requestID: request.id, reply: auto ? "once" : "reject" })
        .catch(() => undefined)
    }
    await Bun.sleep(200)
  }
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
