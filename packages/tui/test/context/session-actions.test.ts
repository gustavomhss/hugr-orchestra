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
      if (request.url.endsWith("/compact")) return Response.json({ data: { compacted: true } })
      if (request.url.endsWith("/prompt") || request.url.endsWith("/synthetic"))
        return Response.json({ data: { id: "msg_1" } })
      if (request.method === "POST" && request.url.endsWith("/api/session"))
        return Response.json({ data: { id: "ses_new" } })
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

test("create places the Session in the given directory with the chosen agent and model", async () => {
  const { calls, actions } = recorder()
  await actions.create({
    agent: "build",
    model: { providerID: "p", modelID: "m" },
    directory: "/repo/app",
    workspaceID: "ws_1",
  })
  await actions.create({ agent: "build", model: { providerID: "p", modelID: "m" } })
  expect(calls).toEqual([
    {
      method: "POST",
      path: "/api/session",
      body: {
        agent: "build",
        model: { providerID: "p", id: "m" },
        location: { directory: "/repo/app", workspaceID: "ws_1" },
      },
    },
    { method: "POST", path: "/api/session", body: { agent: "build", model: { providerID: "p", id: "m" } } },
  ])
})

test("prompt selects agent and model, admits editor context without waking, then sends the prompt", async () => {
  const { calls, actions } = recorder()
  await actions.prompt({
    sessionID: "ses_1",
    text: "fix @a.ts with @review",
    context: "selection: line 3",
    agent: "build",
    model: { providerID: "p", modelID: "m", variant: "high" },
    files: [
      {
        url: "file:///a.ts",
        filename: "a.ts",
        source: { type: "file", path: "a.ts", text: { start: 4, end: 9, value: "@a.ts" } },
      },
    ],
    agents: [{ name: "review", source: { start: 15, end: 22, value: "@review" } }],
  })
  expect(calls).toEqual([
    { method: "POST", path: "/api/session/ses_1/agent", body: { agent: "build" } },
    {
      method: "POST",
      path: "/api/session/ses_1/model",
      body: { model: { providerID: "p", id: "m", variant: "high" } },
    },
    { method: "POST", path: "/api/session/ses_1/synthetic", body: { text: "selection: line 3", resume: false } },
    {
      method: "POST",
      path: "/api/session/ses_1/prompt",
      body: {
        prompt: {
          text: "fix @a.ts with @review",
          files: [{ uri: "file:///a.ts", name: "a.ts", source: { start: 4, end: 9, text: "@a.ts" } }],
          agents: [{ name: "review", source: { start: 15, end: 22, text: "@review" } }],
        },
      },
    },
  ])
})

test("prompt without editor context sends no synthetic input", async () => {
  const { calls, actions } = recorder()
  await actions.prompt({
    sessionID: "ses_1",
    text: "hi",
    agent: "build",
    model: { providerID: "p", modelID: "m" },
    files: [],
    agents: [],
  })
  expect(calls.map((call) => call.path)).toEqual([
    "/api/session/ses_1/agent",
    "/api/session/ses_1/model",
    "/api/session/ses_1/prompt",
  ])
})

test("reply answers the permission request on the V2 route", async () => {
  const { calls, actions } = recorder()
  await actions.reply({ sessionID: "ses_1", requestID: "per_1", reply: "once" })
  expect(calls).toEqual([
    { method: "POST", path: "/api/session/ses_1/permission/per_1/reply", body: { reply: "once" } },
  ])
})
