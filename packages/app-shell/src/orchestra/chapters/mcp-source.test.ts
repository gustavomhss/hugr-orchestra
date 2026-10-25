import { expect, test } from "bun:test"
import { createMcpSource } from "./mcp-source"

const location = { directory: "/repo", project: { id: "prj_one", directory: "/repo" } }

function source(input: { sessions?: Record<string, string | Error> } = {}) {
  const calls: unknown[] = []
  const sessions = input.sessions ?? {}
  const serverSDK = {
    api: { mcp: {} },
    orchestra: {
      mcp: {
        config: async (payload: unknown) => {
          calls.push(["config", payload])
          return {
            location,
            data: {
              servers: {
                docs: { type: "local", command: ["bun", "docs.ts"] },
                remote: { type: "remote", url: "https://mcp.test/sse?token=abc" },
              },
              entries: { docs: { type: "local", command: ["bun", "docs.ts"], environment: { TOKEN: "secret" } } },
            },
          }
        },
        tools: async (payload: unknown) => {
          calls.push(["tools", payload])
          return { location, data: { docs: ["search", "fetch"] } }
        },
      },
      sessions: {
        active: async () => ({ data: Object.fromEntries(Object.keys(sessions).map((id) => [id, { type: "running" }])) }),
        get: async (payload: { sessionID: string }) => {
          const found = sessions[payload.sessionID]
          if (found instanceof Error) throw found
          return { data: { location: { directory: found } } }
        },
      },
    },
  }
  return {
    calls,
    mcp: createMcpSource({
      directory: "/repo",
      serverSDK: serverSDK as unknown as Parameters<typeof createMcpSource>[0]["serverSDK"],
      open: () => {},
    }),
  }
}

test("config and entries come from the V2 server for the profile's location", async () => {
  const { calls, mcp } = source()
  expect(await mcp.config()).toEqual({
    docs: { type: "local", command: ["bun", "docs.ts"] },
    remote: { type: "remote", url: "https://mcp.test/sse?token=abc" },
  })
  // The page keeps only the displayed fields: the file entry's environment never reaches its cache.
  expect(await mcp.entries()).toEqual({ docs: { type: "local", command: ["bun", "docs.ts"] } })
  expect(calls).toEqual([
    ["config", { location: { directory: "/repo" } }],
    ["config", { location: { directory: "/repo" } }],
  ])
})

test("tools list each connected server's tool names", async () => {
  const { mcp } = source()
  expect(await mcp.tools()).toEqual({ docs: ["search", "fetch"] })
})

test("working counts only this profile's running sessions", async () => {
  const { mcp } = source({
    sessions: { ses_a: "/repo", ses_b: "/other", ses_c: "/repo", ses_gone: new Error("not found") },
  })
  expect(await mcp.working()).toBe(2)
  expect(await source().mcp.working()).toBe(0)
})
