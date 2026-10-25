import { describe, expect, test } from "bun:test"
import { Orchestra } from "@orchestra/client"
import { clientUrl, stubServer } from "../test-support"
import type { Prompter } from "../prompt"
import { listProviders } from "./list"
import { login } from "./login"
import { logout } from "./logout"

const location = { directory: "/work", project: { id: "p", directory: "/work" } }
const openai = {
  id: "openai",
  name: "OpenAI",
  methods: [{ type: "key" }, { type: "env", names: ["OPENAI_API_KEY"] }],
  connections: [{ type: "credential", id: "cred_1", label: "work" }, { type: "env", name: "OPENAI_API_KEY" }],
}
const github = {
  id: "github",
  name: "GitHub",
  methods: [
    {
      id: "device",
      type: "oauth",
      label: "Device",
      prompts: [
        { type: "select", key: "kind", message: "Kind", options: [{ label: "Enterprise", value: "ent" }, { label: "Public", value: "pub" }] },
        { type: "text", key: "domain", message: "Domain", when: { key: "kind", op: "eq", value: "ent" } },
      ],
    },
  ],
  connections: [],
}

// Answers are consumed in order; a question with no scripted answer fails the test.
function script(answers: ReadonlyArray<unknown>): Prompter & { asked: string[] } {
  const queue = [...answers]
  const asked: string[] = []
  const next = (message: string) => {
    asked.push(message)
    if (queue.length === 0) throw new Error(`unexpected question: ${message}`)
    return queue.shift()
  }
  return {
    asked,
    select: async (message) => next(message) as never,
    text: async (message) => next(message) as string,
    secret: async (message) => next(message) as string,
  }
}

function stub(options: { integrations?: unknown[]; statuses?: unknown[] } = {}) {
  const calls: Array<{ route: string; body: unknown; query: string }> = []
  const statuses = [...(options.statuses ?? [])]
  const server = stubServer(async (request) => {
    const url = new URL(request.url)
    const route = `${request.method} ${url.pathname.replace(/^\/api/, "")}`
    calls.push({ route, body: request.method === "GET" ? undefined : await request.json().catch(() => undefined), query: url.search })
    if (route === "GET /integration") return Response.json({ location, data: options.integrations ?? [openai, github] })
    if (route.endsWith("/connect/key") || route.startsWith("DELETE ")) return new Response(null, { status: 204 })
    if (route.endsWith("/connect/oauth"))
      return Response.json({
        location,
        data: { attemptID: "att_1", url: "https://auth.example/device", instructions: "Enter ABCD", mode: options.statuses ? "auto" : "code", time: { created: 1, expires: 2 } },
      })
    if (route.startsWith("GET ") && route.includes("/connect/oauth/"))
      return Response.json({ location, data: statuses.shift() ?? { status: "pending", time: { created: 1, expires: 2 } } })
    if (route.endsWith("/complete")) return new Response(null, { status: 204 })
    return new Response("not found", { status: 404 })
  })
  return { server, calls, client: Orchestra.make({ baseUrl: clientUrl(server) }) }
}

describe("providers list", () => {
  test("lists stored credentials and set environment variables", async () => {
    const s = stub()
    try {
      const lines = await listProviders(s.client, "/work")
      expect(lines).toEqual(["Credentials", "  OpenAI  work", "1 credentials", "", "Environment", "  OpenAI  OPENAI_API_KEY", "1 environment variable"])
    } finally {
      s.server.stop(true)
    }
  })
})

describe("providers login", () => {
  test("stores an API key for a provider picked by name", async () => {
    const s = stub()
    const said: string[] = []
    try {
      await login(s.client, script(["sk-test"]), { directory: "/work", provider: "openai", label: "ci", say: (line) => said.push(line) })
      expect(s.calls.find((call) => call.route === "POST /integration/openai/connect/key")?.body).toEqual({ key: "sk-test", label: "ci" })
      expect(said).toEqual(["Logged into OpenAI"])
    } finally {
      s.server.stop(true)
    }
  })

  test("rejects an unknown provider and an unknown method", async () => {
    const s = stub()
    try {
      await expect(login(s.client, script([]), { directory: "/work", provider: "nope", say: () => {} })).rejects.toThrow('Unknown provider "nope"')
      await expect(login(s.client, script([]), { directory: "/work", provider: "github", method: "magic", say: () => {} })).rejects.toThrow(
        'Unknown method "magic" for github. Available: Device',
      )
    } finally {
      s.server.stop(true)
    }
  })

  test("asks conditional prompts only when their condition holds, then completes the code flow", async () => {
    const s = stub()
    const said: string[] = []
    try {
      await login(s.client, script(["ent", "git.corp", "the-code"]), { directory: "/work", provider: "github", say: (line) => said.push(line) })
      expect(s.calls.find((call) => call.route.endsWith("/connect/oauth"))?.body).toEqual({ methodID: "device", inputs: { kind: "ent", domain: "git.corp" } })
      expect(s.calls.find((call) => call.route.endsWith("/complete"))?.body).toEqual({ code: "the-code" })
      expect(said).toContain("Go to: https://auth.example/device")

      const skipped = script(["pub", "the-code"])
      await login(s.client, skipped, { directory: "/work", provider: "github", say: () => {} })
      expect(skipped.asked).toEqual(["Kind", "Paste the authorization code here"])
    } finally {
      s.server.stop(true)
    }
  })

  test("polls an automatic oauth attempt until it completes and fails when it fails", async () => {
    const time = { created: 1, expires: 2 }
    const done = stub({ statuses: [{ status: "pending", time }, { status: "complete", time }] })
    const failed = stub({ statuses: [{ status: "failed", message: "denied", time }] })
    try {
      await login(done.client, script(["pub"]), { directory: "/work", provider: "github", say: () => {}, pollMs: 1 })
      expect(done.calls.filter((call) => call.route.startsWith("GET /integration/github/connect/oauth/")).length).toBe(2)
      await expect(login(failed.client, script(["pub"]), { directory: "/work", provider: "github", say: () => {}, pollMs: 1 })).rejects.toThrow(
        "Failed to authorize: denied",
      )
    } finally {
      done.server.stop(true)
      failed.server.stop(true)
    }
  })
})

describe("providers login for providers outside the list", () => {
  test("stores a key under a custom provider id typed after choosing Other", async () => {
    const s = stub()
    const said: string[] = []
    try {
      await login(s.client, script(["other", "@ai-sdk/my-llm", "sk-custom"]), { directory: "/work", say: (line) => said.push(line) })
      expect(s.calls.find((call) => call.route === "POST /integration/my-llm/connect/key")?.body).toEqual({ key: "sk-custom" })
      expect(said.at(-1)).toBe("Logged into my-llm")
      await expect(login(s.client, script(["Bad_ID"]), { directory: "/work", provider: "other", say: () => {} })).rejects.toThrow(
        "a-z, 0-9 and hyphens only",
      )
    } finally {
      s.server.stop(true)
    }
  })

  test("runs the well-known auth command and stores its output with the env name", async () => {
    const s = stub()
    const wellknown = Bun.serve({
      port: 0,
      fetch: (request) =>
        new URL(request.url).pathname === "/.well-known/orchestra"
          ? Response.json({ auth: { command: ["print-token", "--now"], env: "CORP_TOKEN" } })
          : new Response("no", { status: 404 }),
    })
    const ran: string[][] = []
    try {
      const url = `http://127.0.0.1:${wellknown.port}/`
      await login(s.client, script([]), {
        directory: "/work",
        url,
        say: () => {},
        runAuth: async (command) => (ran.push([...command]), { exitCode: 0, stdout: "tok-123\n" }),
      })
      expect(ran).toEqual([["print-token", "--now"]])
      expect(
        s.calls.find((call) => call.route === `POST /integration/${encodeURIComponent(url.replace(/\/+$/, ""))}/connect/key`)?.body,
      ).toEqual({ key: "tok-123", metadata: { wellknown: { env: "CORP_TOKEN" } } })
      await expect(
        login(s.client, script([]), { directory: "/work", url, say: () => {}, runAuth: async () => ({ exitCode: 1, stdout: "" }) }),
      ).rejects.toThrow("The auth provider command failed")
    } finally {
      wellknown.stop(true)
      s.server.stop(true)
    }
  })
})

describe("providers logout", () => {
  test("removes every credential of the named provider", async () => {
    const s = stub()
    try {
      expect(await logout(s.client, script([]), "/work", "OpenAI")).toBe("OpenAI")
      expect(s.calls.some((call) => call.route === "DELETE /credential/cred_1")).toBe(true)
    } finally {
      s.server.stop(true)
    }
  })

  test("fails for a provider without credentials and when nothing is stored", async () => {
    const s = stub()
    const empty = stub({ integrations: [github] })
    try {
      await expect(logout(s.client, script([]), "/work", "github")).rejects.toThrow('Unknown configured provider "github"')
      await expect(logout(empty.client, script([]), "/work", undefined)).rejects.toThrow("No credentials found")
    } finally {
      s.server.stop(true)
      empty.server.stop(true)
    }
  })
})
