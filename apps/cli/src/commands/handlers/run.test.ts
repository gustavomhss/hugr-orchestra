import { describe, expect, test } from "bun:test"
import { Effect, Option } from "effect"
import { Orchestra } from "@orchestra/client"
import { Daemon } from "../../services/daemon"
import { clientUrl, fakeDaemon, stubServer, withCapturedStdout } from "./test-support"
import run, { execute, miniArgs, type Options } from "./run"

const base: Options = {
  message: "hello",
  continue: false,
  fork: false,
  json: false,
  files: [],
  thinking: false,
  auto: false,
  directory: "/work",
}

const session = (id: string, parentID?: string) => ({ id, parentID, title: id, location: { directory: "/work" } })
const event = (seq: number | undefined, type: string, data: Record<string, unknown>) => ({
  id: `evt_${seq ?? "live"}`,
  type,
  data: { timestamp: 1, sessionID: "ses_1", ...data },
  ...(seq === undefined ? {} : { durable: { aggregateID: "ses_1", seq, version: 1 } }),
})

// A stub of the V2 session routes `run` uses; every request is recorded as "METHOD path" with its JSON body.
function stub(
  options: {
    sessions?: unknown[]
    history?: (waits: number) => unknown[]
    stream?: unknown[]
    permissions?: unknown[]
    waitMs?: number
    forkTo?: string
  } = {},
) {
  const calls: Array<{ route: string; body: unknown }> = []
  let waits = 0
  const server = stubServer(async (request) => {
    const url = new URL(request.url)
    const route = `${request.method} ${url.pathname.replace(/^\/api/, "")}`
    const body = request.method === "POST" || request.method === "PUT" ? await request.json().catch(() => undefined) : undefined
    calls.push({ route, body })
    const generic = route.replace(/^(\w+ \/session)\/[^/]+/, "$1/:id")
    if (generic === "GET /session") return Response.json({ data: options.sessions ?? [], cursor: {} })
    if (generic === "POST /session") return Response.json({ data: session("ses_1") })
    if (generic === "GET /session/:id") return Response.json({ data: session(route.split("/")[2]) })
    if (generic === "POST /session/:id/fork") return Response.json({ data: session(options.forkTo ?? "ses_fork") })
    if (generic === "POST /session/:id/prompt" || generic === "POST /session/:id/command")
      return Response.json({ data: { id: "msg_1", sessionID: "ses_1", admittedSeq: 1, prompt: { text: "" }, delivery: "steer", timeCreated: 1 } })
    if (generic === "POST /session/:id/wait") {
      await Bun.sleep(options.waitMs ?? 0)
      waits++
      return new Response(null, { status: 204 })
    }
    if (generic === "GET /session/:id/history") return Response.json({ data: options.history?.(waits) ?? [], hasMore: false })
    if (generic === "GET /session/:id/event")
      return new Response((options.stream ?? []).map((item) => `data: ${JSON.stringify(item)}\n\n`).join(""), {
        headers: { "content-type": "text/event-stream" },
      })
    if (route === "GET /permission/request") return Response.json({ location: {}, data: options.permissions ?? [] })
    if (generic === "POST /session/:id/permission-rules") return Response.json({ data: [] })
    if (request.method !== "GET") return new Response(null, { status: 204 })
    return new Response("not found", { status: 404 })
  })
  return { server, calls, url: clientUrl(server), waits: () => waits }
}

async function exec(url: string, options: Partial<Options>) {
  let ok: boolean | undefined
  const out = await withCapturedStdout(async () => {
    ok = await execute(Orchestra.make({ baseUrl: url }), { ...base, ...options })
  })
  return { ok, out }
}

const forkInput = {
  message: ["hi"],
  command: Option.none(),
  continue: false,
  session: Option.none(),
  fork: true,
  model: Option.none(),
  agent: Option.none(),
  format: "default" as const,
  file: [],
  title: Option.none(),
  attach: Option.none(),
  password: Option.none(),
  username: Option.none(),
  dir: Option.none(),
  variant: Option.none(),
  thinking: false,
  auto: false,
  mini: false,
  port: Option.none<number>(),
}

describe("run", () => {
  test("creates a session, sends the prompt and prints the assistant text", async () => {
    const s = stub({
      stream: [
        event(1, "session.next.prompted", { messageID: "msg_1" }),
        event(2, "session.next.step.started", { agent: "build", model: { id: "gpt-x" } }),
        event(3, "session.next.text.ended", { text: "  hi there  " }),
      ],
    })
    try {
      const result = await exec(s.url, {})
      expect(result.ok).toBe(true)
      expect(result.out).toContain("> build · gpt-x")
      expect(result.out).toContain("hi there")
      expect(s.calls.find((call) => call.route === "POST /session")?.body).toMatchObject({ location: { directory: "/work" } })
      expect(s.calls.find((call) => call.route === "POST /session/ses_1/prompt")?.body).toMatchObject({ prompt: { text: "hello" } })
    } finally {
      s.server.stop(true)
    }
  })

  test("waits again until the history shows the prompt was promoted, and renders what the stream missed", async () => {
    const s = stub({
      history: (waits) =>
        waits < 2
          ? []
          : [event(1, "session.next.prompted", { messageID: "msg_1" }), event(2, "session.next.text.ended", { text: "late answer" })],
    })
    try {
      const result = await exec(s.url, {})
      expect(result.ok).toBe(true)
      expect(result.out).toContain("late answer")
      expect(s.waits()).toBe(2)
    } finally {
      s.server.stop(true)
    }
  })

  test("prints each event once even when the stream and the history both carry it", async () => {
    const events = [event(1, "session.next.prompted", { messageID: "msg_1" }), event(2, "session.next.text.ended", { text: "once" })]
    const s = stub({ stream: events, history: (waits) => (waits > 0 ? events : []) })
    try {
      const result = await exec(s.url, {})
      expect(result.out.match(/once/g)?.length).toBe(1)
    } finally {
      s.server.stop(true)
    }
  })

  test("emits JSON lines with --format json", async () => {
    const s = stub({
      stream: [event(1, "session.next.prompted", { messageID: "msg_1" }), event(2, "session.next.text.ended", { text: "hi" })],
    })
    try {
      const result = await exec(s.url, { json: true })
      const lines = result.out.trim().split("\n").map((line) => JSON.parse(line))
      expect(lines).toEqual([expect.objectContaining({ type: "text", sessionID: "ses_1", data: expect.objectContaining({ text: "hi" }) })])
    } finally {
      s.server.stop(true)
    }
  })

  test("reports a failed step as a failed run", async () => {
    const s = stub({
      stream: [
        event(1, "session.next.prompted", { messageID: "msg_1" }),
        event(2, "session.next.step.failed", { error: { type: "unknown", message: "boom" } }),
      ],
    })
    try {
      expect((await exec(s.url, { json: true })).ok).toBe(false)
    } finally {
      s.server.stop(true)
    }
  })

  test("--continue reuses the latest root session instead of creating one", async () => {
    const s = stub({
      sessions: [session("ses_child", "ses_1"), session("ses_1")],
      stream: [event(1, "session.next.prompted", { messageID: "msg_1" })],
    })
    try {
      const result = await exec(s.url, { continue: true })
      expect(result.ok).toBe(true)
      expect(s.calls.some((call) => call.route === "POST /session")).toBe(false)
      expect(s.calls.some((call) => call.route === "POST /session/ses_1/prompt")).toBe(true)
    } finally {
      s.server.stop(true)
    }
  })

  test("--fork prompts the forked session", async () => {
    const s = stub({ forkTo: "ses_1", stream: [event(1, "session.next.prompted", { messageID: "msg_1" })] })
    try {
      await exec(s.url, { session: "ses_1", fork: true })
      expect(s.calls.some((call) => call.route === "POST /session/ses_1/fork")).toBe(true)
      expect(s.calls.some((call) => call.route === "POST /session")).toBe(false)
    } finally {
      s.server.stop(true)
    }
  })

  test("rejects permission requests unless --auto, and answers with once under --auto", async () => {
    const request = { id: "per_1", sessionID: "ses_1", action: "bash", resources: ["ls"] }
    const events = [event(1, "session.next.prompted", { messageID: "msg_1" })]
    const denied = stub({ stream: events, permissions: [request], waitMs: 600 })
    const allowed = stub({ stream: events, permissions: [request], waitMs: 600 })
    try {
      await exec(denied.url, {})
      await exec(allowed.url, { auto: true })
      expect(denied.calls.find((call) => call.route.endsWith("/permission/per_1/reply"))?.body).toEqual({ reply: "reject" })
      expect(allowed.calls.find((call) => call.route.endsWith("/permission/per_1/reply"))?.body).toEqual({ reply: "once" })
    } finally {
      denied.server.stop(true)
      allowed.server.stop(true)
    }
  })

  test("sends a slash command through the command route", async () => {
    const s = stub({ stream: [event(1, "session.next.prompted", { messageID: "msg_1" })] })
    try {
      await exec(s.url, { command: "init", message: "args" })
      expect(s.calls.find((call) => call.route === "POST /session/ses_1/command")?.body).toMatchObject({ command: "init", arguments: "args" })
    } finally {
      s.server.stop(true)
    }
  })

  test("--mini hands the choices to the TUI and drops what is unset", () => {
    expect(miniArgs({ message: "  ", continue: false, fork: false, auto: false })).toEqual({
      mini: true,
      continue: false,
      fork: false,
      auto: false,
    })
    expect(
      miniArgs({ message: "fix it", model: "p/m", agent: "build", variant: "high", session: "ses_1", continue: false, fork: true, auto: true }),
    ).toEqual({
      mini: true,
      prompt: "fix it",
      model: "p/m",
      agent: "build",
      variant: "high",
      sessionID: "ses_1",
      continue: false,
      fork: true,
      auto: true,
    })
  })

  test("--port cannot be combined with --attach", async () => {
    await expect(
      run({ ...forkInput, fork: false, attach: Option.some("http://127.0.0.1:1"), port: Option.some(4100) }).pipe(
        Effect.provideService(Daemon.Service, fakeDaemon("http://127.0.0.1:1")),
        Effect.runPromise,
      ),
    ).rejects.toThrow("--port cannot be used with --attach")
  })

  test("--fork without --continue or --session fails before anything is sent", async () => {
    const input = forkInput
    await expect(
      run(input).pipe(Effect.provideService(Daemon.Service, fakeDaemon("http://127.0.0.1:1")), Effect.runPromise),
    ).rejects.toThrow("--fork requires --continue or --session")
  })
})
