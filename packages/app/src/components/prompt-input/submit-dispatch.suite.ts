import { describe, expect, test } from "bun:test"
import { createPromptState } from "@/context/prompt-state"
import { Worktree } from "@/utils/worktree"
import { ServerScope } from "@/utils/server-scope"
import { createApiForServer, createSdkForServer } from "@/utils/server"
import { createCompatibleApi } from "@/utils/server-compat"
import { clearPending, pendingRules, togglePending } from "../draft-subagent-models"
import type { FollowupDraft } from "./submit"
import {
  clientFor,
  commands,
  createPromptSubmit,
  interrupts,
  optimistic,
  policyFixture,
  promoted,
  preparations,
  promptInputs,
  sendFollowupDraft,
  sdkReads,
  state,
  statusWrites,
  storedSessions,
  submitInput,
  sentCommands, sentShell, toasts,
} from "./submit-harness"

const deferred = () => Promise.withResolvers<void>()

test("non-string nested policy errors use the localized fallback and retain input", async () => {
  state.params.id = "session-1"
  state.policyWait = async () => { throw { data: { message: 42 } } }
  const real = createPromptState({ prompt: "keep draft" })
  expect(await createPromptSubmit({ ...submitInput(), prompt: real }).handleSubmit(new Event("submit"))).toBe(false)
  expect(real.current()[0]).toMatchObject({ content: "keep draft" })
  expect(toasts.at(-1)?.description).toBe("common.requestFailed")
  expect(promptInputs).toEqual([])
})

// Complete frozen e6c39ff72d cases, bound to the shared submission harness.
test("distinct existing Session steer and queue submissions both reach pending policy barrier", async () => {
  state.params.id = "session-1"
  const entered = deferred()
  const gate = deferred()
  const waits: string[] = []
  state.policyWait = async () => { waits.push("policy"); entered.resolve(); await gate.promise }
  const real = createPromptState({ prompt: "first steer" })
  let delivery: "steer" | "queue" = "steer"
  const submit = createPromptSubmit({ ...submitInput(), prompt: real, delivery: () => delivery, working: () => true })
  const first = submit.handleSubmit(new Event("submit"))
  await entered.promise
  real.set([{ type: "text", content: "second queue", start: 0, end: 12 }])
  delivery = "queue"
  const second = submit.handleSubmit(new Event("submit"))
  await Bun.sleep(0)
  expect(waits).toHaveLength(2)
  expect(promptInputs).toEqual([])
  gate.resolve()
  await Promise.all([first, second])
  expect(promptInputs).toHaveLength(2)
  expect(promptInputs).toEqual(expect.arrayContaining([
    expect.objectContaining({ text: "first steer", delivery: "steer" }),
    expect.objectContaining({ text: "second queue", delivery: "queue" }),
  ]))
})

test("empty existing Session submit interrupts while another submission awaits policy", async () => {
  state.params.id = "session-1"
  const entered = deferred()
  const gate = deferred()
  state.policyWait = async () => { entered.resolve(); await gate.promise }
  const real = createPromptState({ prompt: "pending send" })
  const submit = createPromptSubmit({ ...submitInput(), prompt: real, working: () => true })
  const sending = submit.handleSubmit(new Event("submit"))
  await entered.promise
  real.reset()
  await submit.handleSubmit(new Event("submit"))
  expect(interrupts).toEqual(["session-1"])
  expect(promptInputs).toEqual([])
  gate.resolve()
  await sending
  expect(promptInputs).toEqual([])
})

test("failed Stop toasts and reads the Session status back instead of keeping the optimistic idle", async () => {
  state.params.id = "session-1"
  const fixture = policyFixture.sdk
  policyFixture.sdk = {
    ...fixture,
    api: {
      ...fixture.api,
      session: {
        ...fixture.api.session,
        interrupt: async () => { throw new Error("interrupt failed") },
        active: async () => ({ "session-1": { type: "running" as const } }),
      },
    },
  }
  const entered = deferred()
  const gate = deferred()
  state.policyWait = async () => { entered.resolve(); await gate.promise }
  const submit = createPromptSubmit({ ...submitInput(), prompt: createPromptState({ prompt: "pending send" }), working: () => true })
  const sending = submit.handleSubmit(new Event("submit"))
  await entered.promise
  await submit.abort()
  expect(toasts.at(-1)).toMatchObject({ title: "orchestra.chat.stop.failed", description: "interrupt failed" })
  expect(statusWrites).toEqual([{ sessionID: "session-1", type: "idle" }, { sessionID: "session-1", type: "busy" }])
  gate.resolve()
  await sending
  expect(promptInputs).toEqual([])
})

test.each(["prompt", "command", "shell", "handoff"])("existing Session %s fences failed writes without clearing", async (pathway) => {
  state.params.id = "session-1"
  commands.push({ name: "review" })
  const real = createPromptState({ prompt: pathway === "command" ? "/review changes" : "keep input" })
  real.context.add({ type: "file", path: "/repo/main/file", comment: "keep comment" })
  const contents = real.current()
  const context = real.context.items()
  const failure = new Error("latest write failed")
  state.policyWait = async () => { throw failure }
  const queued: FollowupDraft[] = []
  const submit = createPromptSubmit({
    ...submitInput(), prompt: real, mode: () => pathway === "shell" ? "shell" : "normal",
    shouldQueue: () => pathway === "handoff", onQueue: (draft) => { queued.push(draft) },
  })
  expect(await submit.handleSubmit(new Event("submit"))).toBe(false)
  expect(real.current()).toBe(contents)
  expect(real.context.items()).toBe(context)
  expect(promptInputs).toEqual([])
  expect(sentCommands).toEqual([])
  expect(sentShell).toEqual([])
  expect(queued).toEqual([])
})

describe("prompt dispatch and cancellation", () => {
  test.each(["prompt_async", "shell", "command"] as const)(
    "real V1 adapter keeps %s bound to A before receipt while transport preparation waits",
    async (operation) => {
      const requests: Request[] = []
      const admitted = Promise.withResolvers<void>()
      const release = Promise.withResolvers<void>()
      const prepared = Promise.withResolvers<void>()
      const dispatch = Promise.withResolvers<void>()
      const server = { url: "http://origin.invalid" }
      const fetcher = Object.assign(
        async (input: string | URL | Request, init?: RequestInit) => {
          const request = new Request(input, init)
          requests.push(request)
          if (new URL(request.url).pathname === "/session") {
            admitted.resolve()
            await release.promise
            return Response.json({
              id: "created-v1",
              directory: "/repo/worktree-a",
              projectID: "project",
              title: "Created",
              time: { created: 1, updated: 1 },
            })
          }
          return new Response(null, { status: 204 })
        },
        { preconnect: fetch.preconnect },
      )
      const currentApi = createApiForServer({ server, fetch: fetcher })
      const createClient = (options: { directory?: string }) =>
        createSdkForServer({
          server,
          fetch: fetcher,
          ...options,
          throwOnError: true,
          requestValidator: async (data: unknown) => {
            if (!data || typeof data !== "object" || !("url" in data) || typeof data.url !== "string")
              throw new Error("Missing SDK request options")
            if (!data.url.endsWith(`/${operation}`)) return
            // The SDK awaits this before body serialization, URL construction and fetch.
            prepared.resolve()
            await dispatch.promise
            if (process.env.ORCHESTRA_SUBMIT_PROBE === "wrong-api") Reflect.set(data, "baseUrl", "http://other.invalid")
            if (
              process.env.ORCHESTRA_SUBMIT_PROBE === "wrong-directory" && "headers" in data && data.headers instanceof Headers
            )
              data.headers.set("x-orchestra-directory", encodeURIComponent("/wrong"))
          },
        })
      const original = {
        protocol: Promise.resolve("v1" as const),
        currentApi,
        createClient,
        client: createClient({ directory: "/repo/main" }),
      }
      state.serverOverride = original
      state.sdkOverride = {
        scope: "origin",
        directory: "/repo/main",
        client: original.client,
        api: createCompatibleApi({
          ...original,
          current: currentApi,
          legacy: (directory) => createClient({ directory }),
          directory: "/repo/main",
        }),
      }
      if (operation === "command") commands.push({ name: "custom" })
      const source = createPromptState({ prompt: operation === "command" ? "/custom args" : "first" })
      const destination = createPromptState()
      const submit = createPromptSubmit({
        ...submitInput(),
        prompt: { ...source, capture: (scope) => (scope || state.params.id ? destination : source) },
        info: () => undefined,
        mode: () => (operation === "shell" ? "shell" : "normal"),
        newSessionWorktree: () => "/repo/worktree-a",
      })
      const result = submit.handleSubmit({ preventDefault: () => undefined } as Event)
      await admitted.promise
      release.resolve()
      await prepared.promise
      expect(promoted).toEqual([])
      expect(sdkReads.some((read) => read.scope === "origin" && read.directory === "/repo/main")).toBe(true)
      expect(requests.map((request) => new URL(request.url).pathname)).toEqual(["/session"])
      const otherServer = { url: "http://other.invalid" }
      const otherClient = (options: { directory?: string }) =>
        createSdkForServer({ server: otherServer, fetch: fetcher, ...options, throwOnError: true })
      const otherApi = createApiForServer({ server: otherServer, fetch: fetcher })
      state.serverOverride = {
        protocol: Promise.resolve("v1"),
        currentApi: otherApi,
        createClient: otherClient,
        client: otherClient({ directory: "/other" }),
      }
      state.sdkOverride = {
        scope: "other",
        directory: "/other",
        api: createCompatibleApi({
          protocol: Promise.resolve("v1"),
          current: otherApi,
          legacy: (directory) => otherClient({ directory }),
          directory: "/other",
        }),
      }
      dispatch.resolve()
      await result
      expect(requests.map((request) => new URL(request.url).origin)).toEqual([server.url, server.url])
      expect(requests.map((request) => request.headers.get("x-orchestra-directory"))).toEqual([
        "%2Frepo%2Fworktree-a",
        "%2Frepo%2Fworktree-a",
      ])
      expect(new URL(requests[1].url).pathname).toBe(`/session/created-v1/${operation}`)
      expect(promoted).toEqual([])
      expect(source.current()[0]).toMatchObject({ content: operation === "command" ? "/custom args" : "first" })
      expect(destination.current()[0]).toMatchObject({ content: "" })
    },
  )

  test("V1 source change during admission holds A text/rules/created ID until owner A returns", async () => {
    const requests: Request[] = []
    const admitted = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const server = { url: "http://admission-a.invalid" }
    const info = {
      id: "created-held-a", directory: "/repo/worktree-a", projectID: "project", title: "Held A",
      time: { created: 1, updated: 1 },
    }
    const fetcher = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const request = new Request(input, init)
        requests.push(request)
        if (new URL(request.url).pathname === "/session") {
          admitted.resolve()
          await release.promise
          return Response.json(info)
        }
        if (request.method === "PATCH") return Response.json(info)
        return new Response(null, { status: 204 })
      },
      { preconnect: fetch.preconnect },
    )
    const currentApi = createApiForServer({ server, fetch: fetcher })
    const createClient = (options: { directory?: string }) =>
      createSdkForServer({ server, fetch: fetcher, ...options, throwOnError: true })
    const original = {
      protocol: Promise.resolve("v1" as const), currentApi, createClient,
      client: createClient({ directory: "/repo/main" }),
    }
    const directorySDK = {
      scope: "admission-a", directory: "/repo/main", client: original.client,
      api: createCompatibleApi({
        protocol: original.protocol, current: currentApi,
        legacy: (directory) => createClient({ directory }), directory: "/repo/main",
      }),
    }
    state.serverOverride = original
    state.sdkOverride = directorySDK
    const key = "admission-a\u0000draft\u0000full/slash/id"
    togglePending(key, "provider", "team/model", true)
    const rules = pendingRules(key)
    const source = createPromptState({ prompt: "held A input" })
    const destination = createPromptState()
    const untouched = destination.current().slice()
    const submit = createPromptSubmit({
      ...submitInput(),
      prompt: { ...source, capture: (scope) => (scope || state.params.id ? destination : source) }, info: () => undefined,
      pendingKey: () => key, newSessionWorktree: () => "/repo/worktree-a",
    })
    const event = { preventDefault: () => undefined } as Event
    const result = submit.handleSubmit(event)
    await admitted.promise
    state.serverOverride = {
      ...original,
      currentApi: createApiForServer({ server: { url: "http://admission-b.invalid" }, fetch: fetcher }),
    }
    state.sdkOverride = { scope: "admission-b", directory: "/other", api: currentApi }
    release.resolve()
    await result
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual(["/session"])
    expect(requests.map((request) => new URL(request.url).origin)).toEqual([server.url])
    expect(promoted).toEqual([])
    expect(sdkReads.at(-1)).toEqual({ scope: "admission-b", directory: "/other" })
    expect(source.current()[0]).toMatchObject({ content: "held A input" })
    expect(destination.current()).toEqual(untouched)
    expect(pendingRules(key)).toEqual(rules)
    expect(storedSessions["/repo/worktree-a"]?.map((session) => session.id)).toEqual([])
    state.serverOverride = original
    state.sdkOverride = directorySDK
    await submit.handleSubmit(event)
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/session", `/session/${info.id}`, `/session/${info.id}/prompt_async`,
    ])
    expect(requests.every((request) => new URL(request.url).origin === server.url)).toBe(true)
    expect(requests.filter((request) => new URL(request.url).pathname === "/session")).toHaveLength(1)
    expect(await requests[1].json()).toMatchObject({ permission: rules })
    expect(promoted).toEqual([{ directory: "/repo/worktree-a", sessionID: info.id }])
    expect(storedSessions["/repo/worktree-a"]?.map((session) => session.id)).toEqual([info.id])
    expect(pendingRules(key)).toEqual([])
    clearPending(key)
  })

  test("Stop cancels every preflight, including delayed preparation, without deleting later jobs", async () => {
    state.params = { id: "session-1" }
    const delayed = Promise.withResolvers<void>()
    preparations.push(delayed)
    const submit = createPromptSubmit(submitInput())
    const event = { preventDefault: () => undefined } as Event
    const first = submit.handleSubmit(event)
    const second = submit.handleSubmit(event)
    await submit.abort()
    const third = submit.handleSubmit(event)
    delayed.resolve()
    await Promise.all([first, second, third])
    expect(interrupts).toEqual(["session-1"])
    expect(promptInputs).toHaveLength(1)
  })

  test("canceled preparation cannot resurrect busy or optimistic content after it resolves", async () => {
    state.params = { id: "session-1" }
    const delayed = Promise.withResolvers<void>()
    preparations.push(delayed)
    const submit = createPromptSubmit(submitInput())
    const submitted = submit.handleSubmit({ preventDefault: () => undefined } as Event)
    await submit.abort()
    expect(statusWrites).toEqual([{ sessionID: "session-1", type: "idle" }])
    delayed.resolve()
    await submitted
    expect(statusWrites).toEqual([{ sessionID: "session-1", type: "idle" }])
    expect(optimistic).toEqual([])
    expect(promptInputs).toEqual([])
  })

  test("cancellation during attachment preparation cannot mark busy or add an optimistic turn", async () => {
    const { useSync } = await import("@/context/sync")
    const { useServerSync } = await import("@/context/server-sync")
    const controller = new AbortController()
    const submitted = sendFollowupDraft({
      api: clientFor("/repo/main").api.session as unknown as Parameters<typeof sendFollowupDraft>[0]["api"],
      sync: useSync()(),
      serverSync: useServerSync()(),
      draft: {
        sessionID: "session-1",
        sessionDirectory: "/repo/main",
        prompt: state.promptValue,
        context: [],
        agent: "maestro",
        model: { providerID: "provider", modelID: "model" },
      },
      optimisticBusy: true,
      signal: controller.signal,
    })
    controller.abort()
    expect(await submitted).toBe(false)
    expect(statusWrites).toEqual([])
    expect(optimistic).toEqual([])
    expect(promptInputs).toEqual([])
  })

  test.each(["v1", "v2"] as const)(
    "Stop cancels real %s dispatch waiting for protocol; normal control sends once",
    async (kind) => {
      state.params = { id: "session-1" }
      const protocol = Promise.withResolvers<"v1" | "v2">()
      const dispatched = Promise.withResolvers<void>()
      const requests: Request[] = []
      const server = { url: "http://protocol-fixture.invalid" }
      const fetcher = Object.assign(
        async (input: string | URL | Request, init?: RequestInit) => {
          const request = new Request(input, init)
          requests.push(request)
          if (new URL(request.url).pathname.endsWith("/prompt")) {
            return Response.json({
              data: {
                admittedSeq: 1,
                id: "message",
                sessionID: "session-1",
                timeCreated: 1,
                type: "user",
                data: { text: "hello" },
                delivery: "steer",
              },
            })
          }
          return new Response(null, { status: 204 })
        },
        { preconnect: fetch.preconnect },
      )
      const current = createApiForServer({ server, fetch: fetcher })
      const createClient = (options: { directory?: string }) =>
        createSdkForServer({ server, fetch: fetcher, ...options, throwOnError: true })
      const compatible = createCompatibleApi({
        protocol: protocol.promise,
        current,
        legacy: (directory) => createClient({ directory }),
        directory: "/repo/main",
      })
      const session = new Proxy(compatible.session, {
        get(target, property, receiver) {
          if (property !== "prompt") return Reflect.get(target, property, receiver)
          return (...args: Parameters<typeof compatible.session.prompt>) => {
            // Observe actual lazy adapter entry; do not replace its implementation.
            const result = compatible.session.prompt(...args)
            dispatched.resolve()
            return result
          }
        },
      })
      state.sdkOverride = {
        scope: "local",
        directory: "/repo/main",
        protocol: protocol.promise,
        api: { ...compatible, session },
      }
      const submit = createPromptSubmit({ ...submitInput(), prompt: createPromptState({ prompt: "hello" }) })
      const event = { preventDefault: () => undefined } as Event
      const submitted = submit.handleSubmit(event)
      await dispatched.promise
      const stopped = submit.abort()
      expect(requests).toEqual([])
      protocol.resolve(kind)
      await Promise.all([submitted, stopped])
      const interrupt = kind === "v1" ? "/session/session-1/abort" : "/api/session/session-1/interrupt"
      expect(requests.map((request) => new URL(request.url).pathname)).toEqual([interrupt])

      await submit.handleSubmit(event)
      const prompt = kind === "v1" ? "/session/session-1/prompt_async" : "/api/session/session-1/prompt"
      expect(requests.map((request) => new URL(request.url).pathname)).toEqual([interrupt, prompt])
      expect(requests[1].signal.aborted).toBe(false)
    },
  )

  test("Stop cancels both actual worktree waiters before readiness can send either prompt", async () => {
    state.params = { id: "session-1" }
    Worktree.pending(ServerScope.local, "/repo/main")
    const submit = createPromptSubmit(submitInput())
    const first = submit.handleSubmit({ preventDefault: () => undefined } as Event)
    const second = submit.handleSubmit({ preventDefault: () => undefined } as Event)
    await state.waitersReady.promise
    await submit.abort()
    Worktree.ready(ServerScope.local, "/repo/main")
    await Promise.all([first, second])
    expect(promptInputs).toEqual([])
    expect(interrupts).toEqual(["session-1"])
    await submit.handleSubmit({ preventDefault: () => undefined } as Event)
    expect(promptInputs).toHaveLength(1)
  })
})
