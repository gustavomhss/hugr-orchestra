import { expect, test } from "bun:test"
import { Orchestra } from "@orchestra/client"
import { createSessionActions } from "../../src/context/session-actions"

// The real client builds every request; only the transport is replaced, to record what it sends.
function recorder() {
  const calls: { method: string; path: string; body: unknown }[] = []
  const fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      calls.push({
        method: request.method,
        path: new URL(request.url).pathname,
        body: request.body ? await request.json() : undefined,
      })
      return request.url.endsWith("/revert/stage") || request.url.endsWith("/command")
        ? Response.json({ data: {} })
        : new Response(null, { status: 204 })
    },
    { preconnect: globalThis.fetch.preconnect },
  )
  return { calls, actions: createSessionActions(Orchestra.make({ baseUrl: "http://localhost:1", fetch })) }
}

test("interrupt, compact, shell, revert and unrevert hit the V2 session routes", async () => {
  const { calls, actions } = recorder()
  await actions.interrupt("ses_1")
  await actions.compact("ses_1")
  await actions.shell({ sessionID: "ses_1", command: "ls" })
  await actions.revert({ sessionID: "ses_1", messageID: "msg_1" })
  await actions.unrevert("ses_1")
  expect(calls).toEqual([
    { method: "POST", path: "/api/session/ses_1/interrupt", body: undefined },
    { method: "POST", path: "/api/session/ses_1/compact", body: undefined },
    { method: "POST", path: "/api/session/ses_1/shell", body: { command: "ls" } },
    { method: "POST", path: "/api/session/ses_1/revert/stage", body: { messageID: "msg_1", files: true } },
    { method: "POST", path: "/api/session/ses_1/revert/clear", body: undefined },
  ])
})

test("command selects the agent and model, then maps file parts to V2 files", async () => {
  const { calls, actions } = recorder()
  await actions.command({
    sessionID: "ses_1",
    command: "review",
    arguments: "src",
    agent: "build",
    model: { providerID: "p", modelID: "m", variant: "high" },
    files: [{ url: "file:///a.ts", filename: "a.ts", source: undefined }],
  })
  expect(calls.map((call) => call.path)).toEqual([
    "/api/session/ses_1/agent",
    "/api/session/ses_1/model",
    "/api/session/ses_1/command",
  ])
  expect(calls[1].body).toEqual({ model: { providerID: "p", id: "m", variant: "high" } })
  expect(calls[2].body).toEqual({ command: "review", arguments: "src", files: [{ uri: "file:///a.ts", name: "a.ts" }] })
})
