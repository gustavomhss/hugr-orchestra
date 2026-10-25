import { describe, expect, test } from "bun:test"
import { Orchestra } from "@orchestra/client"
import { clientUrl, stubServer } from "./test-support"
import { aggregate, render } from "./stats"

const DAY = 24 * 60 * 60 * 1000
const now = Date.now()
const tokens = (input: number) => ({ input, output: 10, reasoning: 0, cache: { read: 5, write: 0 } })
const session = (id: string, projectID: string, updated: number, input: number, cost: number) => ({
  id,
  projectID,
  cost,
  tokens: tokens(input),
  time: { created: updated - DAY, updated },
  title: id,
  location: { directory: "/work" },
})
const assistant = (id: string, tool: string) => ({
  id,
  type: "assistant",
  agent: "build",
  model: { id: "gpt-x", providerID: "openai" },
  time: { created: 1 },
  cost: 0.5,
  tokens: tokens(100),
  content: [{ type: "tool", id: "t", name: tool, state: { status: "completed" } }, { type: "text", id: "x", text: "hi" }],
})

// Two pages of sessions prove the cursor is followed; messages exist for ses_a only.
function stub() {
  const server = stubServer((request) => {
    const url = new URL(request.url)
    const route = `${request.method} ${url.pathname.replace(/^\/api/, "")}`
    if (route === "GET /session" && !url.searchParams.get("cursor"))
      return Response.json({ data: [session("ses_a", "proj_1", now - DAY, 100, 1)], cursor: { next: "page2" } })
    if (route === "GET /session")
      return Response.json({
        data: [session("ses_b", "proj_2", now - 10 * DAY, 300, 3), session("ses_c", "proj_1", now - 2 * DAY, 200, 2)],
        cursor: {},
      })
    if (route === "GET /session/ses_a/message")
      return Response.json({ data: [{ id: "u", type: "user", text: "q", time: { created: 1 } }, assistant("a1", "bash"), assistant("a2", "bash")], cursor: {} })
    if (route.endsWith("/message")) return Response.json({ data: [], cursor: {} })
    return new Response("not found", { status: 404 })
  })
  return { server, client: Orchestra.make({ baseUrl: clientUrl(server) }) }
}

describe("stats", () => {
  test("totals sessions across pages and counts models and tools from assistant messages", async () => {
    const s = stub()
    try {
      const stats = await aggregate(s.client, {})
      expect(stats.totalSessions).toBe(3)
      expect(stats.totalMessages).toBe(3)
      expect(stats.totalCost).toBe(6)
      expect(stats.totalTokens.input).toBe(600)
      expect(stats.toolUsage).toEqual({ bash: 2 })
      expect(stats.modelUsage["openai/gpt-x"]).toMatchObject({ messages: 2, cost: 1 })
      expect(stats.medianTokensPerSession).toBe(215)
    } finally {
      s.server.stop(true)
    }
  })

  test("--days drops older sessions and --project keeps one project", async () => {
    const s = stub()
    try {
      const recent = await aggregate(s.client, { days: 5 })
      expect(recent.totalSessions).toBe(2)
      expect(recent.days).toBe(5)
      const project = await aggregate(s.client, { projectID: "proj_2" })
      expect(project.totalSessions).toBe(1)
      expect(project.totalCost).toBe(3)
    } finally {
      s.server.stop(true)
    }
  })

  test("renders the overview, the optional model table and the tool bars", async () => {
    const s = stub()
    try {
      const stats = await aggregate(s.client, {})
      const text = render(stats, undefined, Infinity).join("\n")
      expect(text).toContain("OVERVIEW")
      expect(text).toContain("openai/gpt-x")
      expect(text).toContain("TOOL USAGE")
      expect(render(stats).join("\n")).not.toContain("MODEL USAGE")
      expect(render(stats).every((line) => line === "" || line.length === 58)).toBe(true)
    } finally {
      s.server.stop(true)
    }
  })
})
