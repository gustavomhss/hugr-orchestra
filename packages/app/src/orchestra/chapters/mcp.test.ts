import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { toggleMcp } from "@/context/global-sync/mcp"
import { createMcpActions, mcpAction, mcpErrorDetail } from "./mcp-actions"

describe("MCP chapter actions", () => {
  test.each([
    [{ error: "MCP server secured does not support OAuth" }, "MCP server secured does not support OAuth"],
    [
      { _tag: "McpServerNotFoundError", name: "shared", message: "MCP server not found: shared" },
      "MCP server not found: shared",
    ],
    [
      {
        name: "UnknownError",
        data: { message: "Unexpected server error. Check server logs for details.", ref: "err_test" },
      },
      "Unexpected server error. Check server logs for details.",
    ],
  ])("preserves the HttpApi detail in raw and SDK-wrapped errors: %j", (body, detail) => {
    expect(mcpErrorDetail(body)).toBe(detail)
    expect(mcpErrorDetail(new Error("Request failed", { cause: { body, status: 400 } }))).toBe(detail)
  })

  test("keeps network error details and tolerates empty server errors", () => {
    expect(mcpErrorDetail(new Error("Network unreachable"))).toBe("Network unreachable")
    expect(mcpErrorDetail(new Error("Empty response", { cause: { body: {}, status: 500 } }))).toBe("Empty response")
    expect(mcpErrorDetail(undefined)).toBeUndefined()
  })
  test.each([
    ["connected", "disconnect"],
    ["disabled", "connect"],
    ["failed", "connect"],
    ["needs_client_registration", "connect"],
    ["needs_auth", "authenticate"],
    ["pending", undefined],
  ] as const)("%s dispatches %s through the existing action", async (status, action) => {
    const calls: string[] = []
    expect(mcpAction(status)).toBe(action)
    await toggleMcp({
      status,
      connect: async () => {
        calls.push("connect")
      },
      disconnect: async () => {
        calls.push("disconnect")
      },
      authenticate: async () => {
        calls.push("authenticate")
      },
      refresh: async () => {
        calls.push("refresh")
      },
    })
    expect(calls).toEqual(action ? [action, "refresh"] : [])
  })

  test("pending actions block duplicate requests until completion", async () => {
    const calls: string[] = []
    const gate = Promise.withResolvers<void>()
    const owner = createRoot((dispose) => ({
      dispose,
      actions: createMcpActions(async (name) => {
        calls.push(name)
        await gate.promise
      }),
    }))
    const request = owner.actions.run("shared", "disabled")
    const duplicate = owner.actions.run("shared", "disabled")
    expect(calls).toEqual(["shared"])
    expect(owner.actions.state.pending.shared).toBe(true)
    gate.resolve()
    await Promise.all([request, duplicate])
    expect(owner.actions.state.pending.shared).toBe(false)
    await owner.actions.run("shared", "connected")
    expect(calls).toEqual(["shared", "shared"])
    owner.dispose()
  })

  test("failure remains visible after settling and an unrelated row succeeds", async () => {
    const owner = createRoot((dispose) => ({
      dispose,
      actions: createMcpActions(async (name) => {
        if (name === "broken") throw { error: "OAuth denied" }
      }),
    }))
    await owner.actions.run("broken", "needs_auth")
    await owner.actions.run("other", "disabled")
    expect(owner.actions.state.pending.broken).toBe(false)
    expect(owner.actions.state.failures.broken).toEqual({ detail: "OAuth denied" })
    owner.dispose()
  })

  test.each(["constructor", "toString", "__proto__"])("%s is a valid MCP name", async (name) => {
    const calls: string[] = []
    const owner = createRoot((dispose) => ({
      dispose,
      actions: createMcpActions(async (value) => {
        calls.push(value)
        throw new Error("Connection refused")
      }),
    }))
    expect(owner.actions.state.pending[name]).toBeUndefined()
    expect(owner.actions.state.failures[name]).toBeUndefined()
    await owner.actions.run(name, "disabled")
    expect(calls).toEqual([name])
    expect(owner.actions.state.pending[name]).toBe(false)
    expect(owner.actions.state.failures[name]).toEqual({ detail: "Connection refused" })
    owner.dispose()
  })

  test("a server pending status cannot dispatch an action", async () => {
    const calls: string[] = []
    const owner = createRoot((dispose) => ({
      dispose,
      actions: createMcpActions(async (name) => {
        calls.push(name)
      }),
    }))
    await owner.actions.run("waiting", "pending")
    expect(calls).toEqual([])
    owner.dispose()
  })

  test("disposing a profile prevents late failures and further actions", async () => {
    const gate = Promise.withResolvers<void>()
    const calls: string[] = []
    const owner = createRoot((dispose) => ({
      dispose,
      actions: createMcpActions(async (name) => {
        calls.push(name)
        await gate.promise
      }),
    }))
    const request = owner.actions.run("shared", "disabled")
    owner.dispose()
    gate.reject(new Error("Old profile failed"))
    await request
    await owner.actions.run("other", "disabled")
    expect(owner.actions.state.failures.shared).toBeUndefined()
    expect(calls).toEqual(["shared"])
  })
})
