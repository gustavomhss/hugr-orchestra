import { describe, expect, test } from "bun:test"
import { createStore } from "solid-js/store"
import { QueryClient } from "@tanstack/solid-query"
import type { Config } from "@/v2-wire"
import type { Project } from "@/v2-types"
import type { Session } from "@/v2-wire"

import type { ServerApi, ServerSdk } from "@/utils/server"

import type { CatalogApi } from "./bootstrap"
import type { NormalizedProviderListResponse } from "@orchestra/session-ui/context"
import {
  bootstrapDirectory,
  loadAgentsQuery,
  loadCommands,
  loadGlobalConfigQuery,
  loadPathQuery,
  loadProjectsQuery,
  loadProvidersQuery,
  loadReferencesQuery,
} from "./bootstrap"
import type { State, VcsCache } from "./types"
import { createServerSession } from "../server-session"
import { sessionPermissionRequest, sessionQuestionRequest } from "@/pages/session/composer/session-request-tree"
import { ServerScope } from "@/utils/server-scope"

type ProjectApi = ServerApi["project"]

const provider = { all: new Map(), connected: [], default: {} } satisfies NormalizedProviderListResponse
const api = {
  agent: { list: async () => ({ location: {}, data: [] }) },
  location: { paths: async () => ({ home: "/home" }) },
  provider: { list: async () => ({ location: {}, data: [] }) },
  model: {
    list: async () => ({ location: {}, data: [] }),
    default: async () => ({ location: {}, data: null }),
  },
  permission: { request: { list: async () => ({ location: {}, data: [] }) } },
  project: {
    list: async () => [],
    current: async () => ({ id: "project", directory: "/project" }),
  },
  question: { request: { list: async () => ({ location: {}, data: [] }) } },
  reference: { list: async () => ({ location: {}, data: [] }) },
  vcs: { get: async () => ({ location: {}, data: {} }) },
} as unknown as Parameters<typeof bootstrapDirectory>[0]["api"]

function directoryState() {
  return createStore<State>({
    status: "loading",
    load: { agent: "pending", config: "pending", session_status: "pending" },
    agent: [],
    command: [],
    reference: [],
    project: "",
    projectMeta: undefined,
    icon: undefined,
    provider_ready: true,
    provider,
    config: {},
    path: { state: "", config: "", worktree: "/project", directory: "/project", home: "/home" },
    session: [],
    sessionTotal: 0,
    session_status: {},
    session_working(id: string) {
      return this.session_status[id]?.type !== "idle"
    },
    session_diff: {},
    todo: {},
    permission: {},
    question: {},
    mcp_ready: true,
    mcp: {},
    mcp_resource: {},
    lsp_ready: true,
    lsp: [],
    vcs: undefined,
    limit: 5,
    message: {},
    session_message: {},
    part: {},
    part_text_accum_delta: {},
  })
}

// One of several bootstrap runs of the same directory; its config and status reads settle with `gate`.
function overlappingRun(state: ReturnType<typeof directoryState>, gate: Promise<void>) {
  return bootstrapDirectory({
    directory: "/project",
    scope: ServerScope.local,
    mcp: false,
    global: {
      config: {} satisfies Config,
      path: { state: "", config: "", worktree: "/project", directory: "/project", home: "/home" },
      project: [{ id: "project", worktree: "/project" } as Project],
      provider,
    },
    sdk: {
      app: { agents: async () => ({ data: [{ name: "maestro", mode: "primary" }] }) },
      config: { get: () => gate.then(() => ({ data: { model: "anthropic/claude" } })) },
      session: { status: () => gate.then(() => ({ data: {} })) },
      vcs: { get: async () => ({ data: undefined }) },
      permission: { list: async () => ({ data: [] }) },
      question: { list: async () => ({ data: [] }) },
      v2: { reference: { list: async () => ({ data: { data: [] } }) } },
      provider: { list: async () => ({ data: { all: [], connected: [], default: {} } }) },
    } as unknown as ServerSdk,
    api,
    readV2Config: () => gate.then(() => ({ model: "anthropic/claude" })),
    store: state[0],
    setStore: state[1],
    vcsCache: { setStore() {} } as unknown as VcsCache,
    loadSessions() {},
    loadActiveSessions: () => gate.then(() => ({})),
    translate: (key) => key,
    queryClient: new QueryClient(),
    protocol: Promise.resolve("v2"),
  })
}

describe("bootstrapDirectory", () => {
  test("hands a removed project directory to onMissingDirectory once instead of a reload failure", async () => {
    const [store, setStore] = directoryState()
    const gone = { _tag: "InvalidRequestError", kind: "location_not_found", message: "Directory not found: /project" }
    const fail = async () => {
      throw gone
    }
    const missing: string[] = []

    await bootstrapDirectory({
      directory: "/project",
      scope: ServerScope.local,
      mcp: false,
      global: {
        config: {} satisfies Config,
        path: { state: "", config: "", worktree: "", directory: "", home: "/home" },
        project: [],
        provider,
      },
      sdk: {} as unknown as ServerSdk,
      api: {
        agent: { list: fail },
        provider: { list: fail },
        model: { list: fail, default: fail },
        permission: { request: { list: fail } },
        project: { list: fail, current: fail },
        question: { request: { list: fail } },
        reference: { list: fail },
        vcs: { get: fail },
      } as unknown as Parameters<typeof bootstrapDirectory>[0]["api"],
      readV2Config: fail,
      store,
      setStore,
      vcsCache: { setStore() {} } as unknown as VcsCache,
      loadSessions() {},
      loadActiveSessions: fail,
      translate: (key) => key,
      queryClient: new QueryClient(),
      protocol: Promise.resolve("v2"),
      onMissingDirectory: (directory) => missing.push(directory),
    })

    await new Promise((resolve) => setTimeout(resolve, 80))

    expect(missing).toEqual(["/project"])
    expect(store.status).toBe("partial")
  })

  test("skips legacy config while refreshing a v2 directory", async () => {
    const [store, setStore] = directoryState()

    await bootstrapDirectory({
      directory: "/project",
      scope: ServerScope.local,
      mcp: false,
      global: {
        config: {} satisfies Config,
        path: { state: "", config: "", worktree: "/project", directory: "/project", home: "/home" },
        project: [{ id: "project", worktree: "/project" } as Project],
        provider,
      },
      sdk: {
        config: {
          get: async () => {
            throw new Error("legacy directory config should not be called")
          },
        },
      } as unknown as ServerSdk,
      api,
      store,
      setStore,
      vcsCache: { setStore() {} } as unknown as VcsCache,
      loadSessions() {},
      loadActiveSessions: async () => ({}),
      translate: (key) => key,
      queryClient: new QueryClient(),
      protocol: Promise.resolve("v2"),
    })

    expect(store.status).toBe("partial")

    await new Promise((resolve) => setTimeout(resolve, 80))

    expect(store.status).toBe("complete")
  })
  test("records agent and config reads apart from unrelated failures", async () => {
    const run = async (agents: () => Promise<unknown>) => {
      const [store, setStore] = directoryState()
      await bootstrapDirectory({
        directory: "/project",
        scope: ServerScope.local,
        mcp: false,
        global: {
          config: {} satisfies Config,
          path: { state: "", config: "", worktree: "/project", directory: "/project", home: "/home" },
          project: [{ id: "project", worktree: "/project" } as Project],
          provider,
        },
        sdk: {
          app: { agents },
          config: { get: async () => ({ data: { model: "anthropic/claude" } }) },
          session: { status: async () => ({ data: {} }) },
          vcs: {
            get: async () => {
              throw new Error("vcs unavailable")
            },
          },
          permission: { list: async () => ({ data: [] }) },
          question: { list: async () => ({ data: [] }) },
          v2: { reference: { list: async () => ({ data: { data: [] } }) } },
          provider: { list: async () => ({ data: { all: [], connected: [], default: {} } }) },
        } as unknown as ServerSdk,
        api: { ...api, agent: { list: agents } } as unknown as typeof api,
        readV2Config: async () => ({ model: "anthropic/claude" }),
        store,
        setStore,
        vcsCache: { setStore() {} } as unknown as VcsCache,
        loadSessions() {},
        loadActiveSessions: async () => ({}),
        translate: (key) => key,
        queryClient: new QueryClient(),
        protocol: Promise.resolve("v2"),
      })
      expect(store.load).toEqual({ agent: "pending", config: "pending", session_status: "pending" })
      await new Promise((resolve) => setTimeout(resolve, 80))
      return store
    }

    const loaded = await run(async () => ({ data: [{ name: "maestro", mode: "primary" }] }))
    expect(loaded.status).toBe("complete")
    expect(loaded.load).toEqual({ agent: "ready", config: "ready", session_status: "ready" })
    expect(loaded.config).toEqual({ model: "anthropic/claude" })
    expect(loaded.agent.map((agent) => agent.name)).toEqual(["maestro"])

    const failed = await run(async () => {
      throw new Error("agents unavailable")
    })
    expect(failed.load).toEqual({ agent: "failed", config: "ready", session_status: "ready" })
  })

  test("records the v1 status read and the v2 active session seed, which stays out of the bootstrap outcome", async () => {
    for (const protocol of ["v2"] as const) {
      for (const outcome of ["ready", "failed"] as const) {
        const read = Promise.withResolvers<{ data: {} }>()
        const [store, setStore] = directoryState()
        await bootstrapDirectory({
          directory: "/project",
          scope: ServerScope.local,
          mcp: false,
          global: {
            config: {} satisfies Config,
            path: { state: "", config: "", worktree: "/project", directory: "/project", home: "/home" },
            project: [{ id: "project", worktree: "/project" } as Project],
            provider,
          },
          sdk: {
            app: { agents: async () => ({ data: [] }) },
            config: { get: async () => ({ data: {} }) },
            session: { status: () => read.promise },
            vcs: { get: async () => ({ data: undefined }) },
            permission: { list: async () => ({ data: [] }) },
            question: { list: async () => ({ data: [] }) },
            v2: { reference: { list: async () => ({ data: { data: [] } }) } },
            provider: { list: async () => ({ data: { all: [], connected: [], default: {} } }) },
          } as unknown as ServerSdk,
          api,
          store,
          setStore,
          vcsCache: { setStore() {} } as unknown as VcsCache,
          loadSessions() {},
          loadActiveSessions: () => read.promise,
          translate: (key) => key,
          queryClient: new QueryClient(),
          protocol: Promise.resolve(protocol),
        })
        await new Promise((resolve) => setTimeout(resolve, 80))
        expect(store.load.session_status).toBe("pending")
        if (outcome === "ready") read.resolve({ data: {} })
        if (outcome === "failed") read.reject(new Error("status unavailable"))
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect([protocol, store.load.session_status]).toEqual([protocol, outcome])
        if (protocol === "v2") expect(store.status).toBe("complete")
      }
    }
  })

  test("an older bootstrap run that fails late cannot overwrite a newer run's read outcomes", async () => {
    const [store, setStore] = directoryState()
    const run = (read: () => Promise<unknown>) =>
      bootstrapDirectory({
        directory: "/project",
        scope: ServerScope.local,
        mcp: false,
        global: {
          config: {} satisfies Config,
          path: { state: "", config: "", worktree: "/project", directory: "/project", home: "/home" },
          project: [{ id: "project", worktree: "/project" } as Project],
          provider,
        },
        sdk: {
          app: { agents: async () => ({ data: [{ name: "maestro", mode: "primary" }] }) },
          config: { get: read },
          session: { status: read },
          vcs: { get: async () => ({ data: undefined }) },
          permission: { list: async () => ({ data: [] }) },
          question: { list: async () => ({ data: [] }) },
          v2: { reference: { list: async () => ({ data: { data: [] } }) } },
          provider: { list: async () => ({ data: { all: [], connected: [], default: {} } }) },
        } as unknown as ServerSdk,
        api,
        readV2Config: () => read().then(() => ({ model: "anthropic/claude" })),
        store,
        setStore,
        vcsCache: { setStore() {} } as unknown as VcsCache,
        loadSessions() {},
        loadActiveSessions: () => read().then(() => ({})),
        translate: (key) => key,
        queryClient: new QueryClient(),
        protocol: Promise.resolve("v2"),
      })
    const older = Promise.withResolvers<never>()
    await run(() => older.promise)
    await run(async () => ({ data: {} }))
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(store.load).toEqual({ agent: "ready", config: "ready", session_status: "ready" })
    older.reject(new Error("older read failed"))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(store.load).toEqual({ agent: "ready", config: "ready", session_status: "ready" })
  })

  test("a superseded run's successful read stays ready when the newer run's read fails, in either order", async () => {
    // The older run's data lands in the store and a failed read never removes it, so "failed" would deny it.
    for (const newerFirst of [true, false]) {
      const state = directoryState()
      const older = Promise.withResolvers<void>()
      const newer = Promise.withResolvers<void>()
      await overlappingRun(state, older.promise)
      await overlappingRun(state, newer.promise)
      await new Promise((resolve) => setTimeout(resolve, 80))
      const outcomes = [() => older.resolve(), () => newer.reject(new Error("newer read failed"))]
      for (const settle of newerFirst ? outcomes.toReversed() : outcomes) {
        settle()
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
      expect({ newerFirst, load: state[0].load, config: state[0].config }).toEqual({
        newerFirst,
        load: { agent: "ready", config: "ready", session_status: "ready" },
        config: { model: "anthropic/claude" },
      })
    }
  })

  test("only the latest run records a failure; an older run's failure waits for the newer outcome", async () => {
    const state = directoryState()
    const older = Promise.withResolvers<void>()
    const newer = Promise.withResolvers<void>()
    await overlappingRun(state, older.promise)
    await overlappingRun(state, newer.promise)
    await new Promise((resolve) => setTimeout(resolve, 80))
    older.reject(new Error("older read failed"))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(state[0].load).toEqual({ agent: "ready", config: "pending", session_status: "pending" })
    newer.reject(new Error("newer read failed"))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(state[0].load).toEqual({ agent: "ready", config: "failed", session_status: "failed" })
  })

  test("indexes the subagent Sessions between a pending request and its root so the parent still finds it", async () => {
    const info = (id: string, parentID?: string): Session => ({
      id,
      slug: id,
      projectID: "project",
      directory: "/project",
      title: id,
      version: "1",
      parentID,
      time: { created: 1, updated: 1 },
    })
    const sessions: Record<string, Session> = {
      root: info("root"),
      child: info("child", "root"),
      grandchild: info("grandchild", "child"),
    }
    const session = createServerSession({
      session: { get: async (input: { sessionID: string }) => ({ data: sessions[input.sessionID] }) },
    } as unknown as ServerSdk)
    const [store, setStore] = directoryState()
    const testApi = {
      ...api,
      permission: { request: { list: async () => ({ location: {}, data: [{ id: "per_1", sessionID: "grandchild" }] }) } },
      question: { request: { list: async () => ({ location: {}, data: [{ id: "que_1", sessionID: "child" }] }) } },
    }

    await bootstrapDirectory({
      directory: "/project",
      scope: ServerScope.local,
      mcp: false,
      global: {
        config: {} satisfies Config,
        path: { state: "", config: "", worktree: "/project", directory: "/project", home: "/home" },
        project: [{ id: "project", worktree: "/project" } as Project],
        provider,
      },
      sdk: {
        app: { agents: async () => ({ data: [] }) },
        config: { get: async () => ({ data: {} }) },
        session: { status: async () => ({ data: {} }) },
        vcs: { get: async () => ({ data: undefined }) },
        permission: { list: async () => ({ data: [{ id: "per_1", sessionID: "grandchild" }] }) },
        question: { list: async () => ({ data: [{ id: "que_1", sessionID: "child" }] }) },
        v2: { reference: { list: async () => ({ data: { data: [] } }) } },
        provider: { list: async () => ({ data: { all: [], connected: [], default: {} } }) },
      } as unknown as ServerSdk,
      api: testApi as unknown as typeof api,
      store,
      setStore,
      vcsCache: { setStore() {} } as unknown as VcsCache,
      loadSessions() {},
      loadActiveSessions: async () => ({}),
      translate: (key) => key,
      queryClient: new QueryClient(),
      session,
      protocol: Promise.resolve("v2"),
    })
    await new Promise((resolve) => setTimeout(resolve, 80))

    expect(store.session.map((item) => item.id)).toEqual(["child", "grandchild"])
    expect(sessionPermissionRequest(store.session, session.data.permission, "root")?.id).toBe("per_1")
    expect(sessionQuestionRequest(store.session, session.data.question, "root")?.id).toBe("que_1")
  })
})

describe("config queries", () => {
  test("skips legacy global config for v2 servers", async () => {
    const sdk = {
      global: {
        config: {
          get: async () => {
            throw new Error("legacy global config should not be called")
          },
        },
      },
    } as unknown as ServerSdk

    const result = await new QueryClient().fetchQuery(
      loadGlobalConfigQuery(ServerScope.local, sdk, Promise.resolve("v2")),
    )

    expect(result).toEqual({})
  })

  test("loads the current provider and model catalog", async () => {
    const calls: unknown[] = []
    const api = {
      provider: {
        list: async (input: unknown) => {
          calls.push(["provider", input])
          return { location: {}, data: [{ id: "openai", name: "OpenAI", package: "@ai-sdk/openai" }] }
        },
      },
      model: {
        list: async (input: unknown) => {
          calls.push(["model", input])
          return { location: {}, data: [] }
        },
        default: async (input: unknown) => {
          calls.push(["default", input])
          return { location: {}, data: null }
        },
      },
    } as unknown as CatalogApi

    const result = await new QueryClient().fetchQuery(loadProvidersQuery(ServerScope.local, "/repo", api))

    expect(calls).toEqual([
      ["provider", { location: { directory: "/repo" } }],
      ["model", { location: { directory: "/repo" } }],
      ["default", { location: { directory: "/repo" } }],
    ])
    expect(result.connected).toEqual(["openai"])
  })

  test("loads agents from the current location-scoped endpoint", async () => {
    const calls: unknown[] = []
    const api = {
      list: async (input: unknown) => {
        calls.push(input)
        return { location: {}, data: [] }
      },
    } as unknown as ServerApi["agent"]

    const result = await new QueryClient().fetchQuery(loadAgentsQuery(ServerScope.local, "/repo", api))

    expect(calls).toEqual([{ location: { directory: "/repo" } }])
    expect(result).toEqual([])
  })

  test("loads commands from the current location-scoped endpoint", async () => {
    const calls: unknown[] = []
    const api = {
      list: async (input: unknown) => {
        calls.push(input)
        return {
          location: {},
          data: [{ name: "review", template: "Review files" /* source: "command" as const */ }],
        }
      },
    } as unknown as ServerApi["command"]

    const result = await loadCommands("/repo", api)

    expect(calls).toEqual([{ location: { directory: "/repo" } }])
    expect(result).toEqual([{ name: "review", template: "Review files" /* source: "command" */ }])
  })

  test("loads projects from the current endpoint", async () => {
    const api = {
      list: async () => [
        { id: "b", worktree: "/b", time: { created: 1, updated: 1 }, sandboxes: [] },
        { id: "a", worktree: "/a", time: { created: 1, updated: 1 }, sandboxes: [] },
      ],
    } as unknown as ProjectApi

    const result = await new QueryClient().fetchQuery(loadProjectsQuery(ServerScope.local, api))

    expect(result.map((project) => project.id)).toEqual(["a", "b"])
  })

  test("loads references from the current location-scoped endpoint", async () => {
    const calls: unknown[] = []
    const api = {
      list: async (input: unknown) => {
        calls.push(input)
        return { location: {}, data: [{ name: "AGENTS.md", path: "/repo/AGENTS.md", source: "instructions" }] }
      },
    } as unknown as ServerApi["reference"]

    const result = await new QueryClient().fetchQuery(loadReferencesQuery(ServerScope.local, "/repo", api))

    expect(calls).toEqual([{ location: { directory: "/repo" } }])
    expect(result).toHaveLength(1)
  })
})
