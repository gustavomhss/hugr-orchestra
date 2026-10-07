import { expect, test } from "bun:test"
import type { Hooks, ToolContext } from "@opencode-ai/plugin"
import { createLinuxWorkspaceHooks } from "./linux-workspace"

const context = { ask: async () => {}, abort: new AbortController().signal, sessionID: "ses_test" } as unknown as ToolContext

function workspace(error: string) {
  const listeners: ((event: { data: unknown }) => void)[] = []
  const port = {
    on: (_event: "message", listener: (event: { data: unknown }) => void) => listeners.push(listener),
    postMessage: (message: unknown) => {
      const request = message as { type: string; id: string }
      if (request.type !== "linux.rpc") return
      queueMicrotask(() => listeners.forEach((listener) => listener({ data: { type: "linux.rpc.result", id: request.id, ok: false, error } })))
    },
  }
  return createLinuxWorkspaceHooks(port) as Required<Hooks>
}

test("a stopped workspace tells the agent what to report instead of an opaque failure", async () => {
  expect(JSON.parse(String(await workspace("workspace-not-running").tool.linux_exec.execute({ argv: ["true"] }, context)))).toEqual({
    error: "workspace-not-running",
    hint: "The Linux workspace is stopped; stop and report that the owner must open Apps > Linux workspace in the App Dock",
  })
  expect(JSON.parse(String(await workspace("workspace-busy").tool.linux_exec.execute({ argv: ["true"] }, context))))
    .toEqual({ error: "workspace-busy" })
})
