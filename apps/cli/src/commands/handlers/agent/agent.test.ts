import { describe, expect, test } from "bun:test"
import { Orchestra } from "@orchestra/client"
import { clientUrl, stubServer } from "../test-support"
import type { Prompter } from "../prompt"
import { listAgents } from "./list"
import { createAgent } from "./create"

const location = { directory: "/work", project: { id: "p", directory: "/work" } }
const nobody: Prompter = {
  select: async (message) => {
    throw new Error(`unexpected question: ${message}`)
  },
  text: async (message) => {
    throw new Error(`unexpected question: ${message}`)
  },
  secret: async (message) => {
    throw new Error(`unexpected question: ${message}`)
  },
}

function stub(options: { exists?: boolean; generated?: string } = {}) {
  const calls: Array<{ route: string; body: unknown }> = []
  const server = stubServer(async (request) => {
    const route = `${request.method} ${new URL(request.url).pathname.replace(/^\/api/, "")}`
    calls.push({ route, body: request.method === "GET" ? undefined : await request.json().catch(() => undefined) })
    if (route === "GET /agent")
      return Response.json({
        location,
        data: [
          { id: "zed", mode: "subagent", permissions: [], hidden: false },
          { id: "build", name: "Build", mode: "primary", permissions: [{ action: "bash", resource: "*", effect: "allow" }], hidden: false },
        ],
      })
    if (route.startsWith("GET /agent/") && route.endsWith("/file"))
      return Response.json({ location, data: { path: "/work/.orchestra/agents/reviewer.md", exists: options.exists ?? false, revision: "r" } })
    if (route.startsWith("PUT /agent/")) return Response.json({ location, data: { path: "/work/.orchestra/agents/reviewer.md", exists: true, revision: "r2" } })
    if (route === "POST /session") return Response.json({ data: { id: "ses_tmp" } })
    if (route === "POST /session/ses_tmp/generate") return Response.json({ data: { text: options.generated ?? "" } })
    if (route === "DELETE /session/ses_tmp") return new Response(null, { status: 204 })
    return new Response("not found", { status: 404 })
  })
  return { server, calls, client: Orchestra.make({ baseUrl: clientUrl(server) }) }
}

describe("agent list", () => {
  test("prints agents sorted by name with mode and permissions", async () => {
    const s = stub()
    try {
      const lines = await listAgents(s.client, "/work")
      expect(lines.filter((line) => !line.startsWith(" "))).toEqual(["Build (primary)", "zed (subagent)"])
      expect(lines[1]).toContain('"effect": "allow"')
    } finally {
      s.server.stop(true)
    }
  })
})

describe("agent create", () => {
  test("writes the file with denied permissions for everything not selected", async () => {
    const s = stub()
    try {
      const file = await createAgent(s.client, nobody, {
        directory: "/work",
        description: "Reviews code",
        mode: "subagent",
        permissions: "read, grep",
        name: "reviewer",
        system: "You review.",
      })
      expect(file).toBe("/work/.orchestra/agents/reviewer.md")
      const body = s.calls.find((call) => call.route === "PUT /agent/reviewer/file")?.body as Record<string, any>
      expect(body).toMatchObject({ description: "Reviews code", mode: "subagent", system: "You review." })
      expect(Object.keys(body.permission).sort()).toEqual(
        ["bash", "edit", "glob", "lsp", "skill", "task", "todowrite", "webfetch", "websearch"],
      )
      expect(Object.values(body.permission).every((value) => value === "deny")).toBe(true)
    } finally {
      s.server.stop(true)
    }
  })

  test("generates the agent from the description, tolerating a fenced JSON reply, and removes the temporary session", async () => {
    const reply = '```json\n{"identifier":"reviewer","whenToUse":"Use for review","systemPrompt":"You review."}\n```'
    const s = stub({ generated: reply })
    try {
      await createAgent(s.client, nobody, { directory: "/work", description: "Reviews code", mode: "all", permissions: "" })
      expect(s.calls.find((call) => call.route === "PUT /agent/reviewer/file")?.body).toMatchObject({
        description: "Use for review",
        system: "You review.",
        mode: "all",
      })
      expect(s.calls.some((call) => call.route === "DELETE /session/ses_tmp")).toBe(true)
    } finally {
      s.server.stop(true)
    }
  })

  test("refuses to overwrite an existing agent file and rejects an unparseable generation", async () => {
    const existing = stub({ exists: true })
    const garbage = stub({ generated: "sure, here you go" })
    try {
      await expect(
        createAgent(existing.client, nobody, { directory: "/work", description: "d", mode: "all", permissions: "", name: "reviewer", system: "s" }),
      ).rejects.toThrow("Agent file already exists: /work/.orchestra/agents/reviewer.md")
      expect(existing.calls.some((call) => call.route.startsWith("PUT"))).toBe(false)
      await expect(createAgent(garbage.client, nobody, { directory: "/work", description: "d", mode: "all", permissions: "" })).rejects.toThrow(
        "LLM failed to generate agent",
      )
    } finally {
      existing.server.stop(true)
      garbage.server.stop(true)
    }
  })
})
