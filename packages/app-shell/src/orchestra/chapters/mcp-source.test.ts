import { expect, test } from "bun:test"
import { createMcpSource } from "./mcp-source"

const location = { directory: "/repo", project: { id: "prj_one", directory: "/repo" } }

function source() {
  const calls: unknown[] = []
  const serverSDK = {
    api: {
      mcp: {
        config: async (payload: unknown) => {
          calls.push(["config", payload])
          return {
            location,
            data: {
              docs: { type: "local", command: ["bun", "docs.ts"] },
              remote: { type: "remote", url: "https://mcp.test/sse?token=abc" },
            },
          }
        },
        entries: async (payload: unknown) => {
          calls.push(["entries", payload])
          return { location, data: { docs: { type: "local", command: ["bun", "docs.ts"] } } }
        },
        tools: async (payload: unknown) => {
          calls.push(["tools", payload])
          return { location, data: { docs: ["search", "fetch"] } }
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
  expect(await mcp.entries()).toEqual({ docs: { type: "local", command: ["bun", "docs.ts"] } })
  expect(calls).toEqual([
    ["config", { location: { directory: "/repo" } }],
    ["entries", { location: { directory: "/repo" } }],
  ])
})

test("tools list each connected server's tool names", async () => {
  const { calls, mcp } = source()
  expect(await mcp.tools()).toEqual({ docs: ["search", "fetch"] })
  expect(calls).toEqual([["tools", { location: { directory: "/repo" } }]])
})

// A V2 config write reconnects only the edited server, so no running session is interrupted.
test("a config write stops no sessions", async () => {
  expect(await source().mcp.working()).toBe(0)
})
