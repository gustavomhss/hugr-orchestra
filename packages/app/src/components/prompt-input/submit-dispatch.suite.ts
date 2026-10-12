import { describe, expect, test } from "bun:test"
import { createPromptState } from "@/context/prompt-state"
import { Worktree } from "@/utils/worktree"
import { ServerScope } from "@/utils/server-scope"
import { createApiForServer, createSdkForServer } from "@/utils/server"
import { createCompatibleApi } from "@/utils/server-compat"
import {
  clientFor,
  commands,
  createPromptSubmit,
  interrupts,
  optimistic,
  preparations,
  promptInputs,
  sendFollowupDraft,
  state,
  statusWrites,
  submitInput,
} from "./submit-harness"

describe("prompt dispatch and cancellation", () => {
  test.each(["prompt_async", "shell", "command"] as const)(
    "real V1 adapter binds %s to created worktree and originating server",
    async (operation) => {
      const requests: Request[] = []
      const admitted = Promise.withResolvers<void>()
      const release = Promise.withResolvers<void>()
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
        createSdkForServer({ server, fetch: fetcher, ...options, throwOnError: true })
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
        prompt: { ...source, capture: (scope) => (scope ? destination : source) },
        info: () => undefined,
        mode: () => (operation === "shell" ? "shell" : "normal"),
        newSessionWorktree: () => "/repo/worktree-a",
      })
      const result = submit.handleSubmit({ preventDefault: () => undefined } as Event)
      await admitted.promise
      state.serverOverride = {
        ...original,
        currentApi: createApiForServer({ server: { url: "http://other.invalid" }, fetch: fetcher }),
      }
      state.sdkOverride = {
        scope: "other",
        directory: "/other",
        api: (state.serverOverride as typeof original).currentApi,
      }
      release.resolve()
      await result
      expect(requests.map((request) => new URL(request.url).origin)).toEqual([server.url, server.url])
      expect(requests.map((request) => request.headers.get("x-orchestra-directory"))).toEqual([
        "%2Frepo%2Fworktree-a",
        "%2Frepo%2Fworktree-a",
      ])
      expect(new URL(requests[1].url).pathname).toBe(`/session/created-v1/${operation}`)
    },
  )

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
