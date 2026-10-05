import { describe, expect, test } from "bun:test"
import { createStore } from "solid-js/store"
import { QueryClient } from "@tanstack/solid-query"
import type { Config, OpencodeClient, Project } from "@opencode-ai/sdk/v2/client"
import type { AgentApi, CatalogApi, CommandApi, ReferenceApi } from "@opencode-ai/client/promise"
import type { NormalizedProviderListResponse } from "@opencode-ai/session-ui/context"
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
import { ServerScope } from "@/utils/server-scope"
import type { ServerApi } from "@/utils/server"

type ProjectApi = ServerApi["project"]

const provider = { all: new Map(), connected: [], default: {} } satisfies NormalizedProviderListResponse
const api = {
  agent: { list: async () => ({ location: {}, data: [] }) },
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
} as unknown as ServerApi

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
      config: { get: () => gate.then(() => ({ data: { share: "manual" } })) },
      session: { status: () => gate.then(() => ({ data: {} })) },
      vcs: { get: async () => ({ data: undefined }) },
      permission: { list: async () => ({ data: [] }) },
      question: { list: async () => ({ data: [] }) },
      v2: { reference: { list: async () => ({ data: { data: [] } }) } },
      provider: { list: async () => ({ data: { all: [], connected: [], default: {} } }) },
    } as unknown as OpencodeClient,
    api,
    store: state[0],
    setStore: state[1],
    vcsCache: { setStore() {} } as unknown as VcsCache,
    loadSessions() {},
    loadActiveSessions: async () => ({}),
    translate: (key) => key,
    queryClient: new QueryClient(),
    protocol: Promise.resolve("v1"),
  })
}

describe("bootstrapDirectory", () => {
  test("uses legacy MCP endpoints while refreshing a v1 directory", async () => {
    const legacyConfigReads: string[] = []
    const mcpReads: string[] = []
    const [store, setStore] = directoryState()

    await bootstrapDirectory({
      directory: "/project",
      scope: ServerScope.local,
      mcp: true,
      global: {
        config: {} satisfies Config,
        path: { state: "", config: "", worktree: "/project", directory: "/project", home: "/home" },
        project: [{ id: "project", worktree: "/project" } as Project],
        provider,
      },
      sdk: {
        app: { agents: async () => ({ data: [{ name: "build", mode: "primary" }] }) },
        config: {
          get: async () => {
            legacyConfigReads.push("directory")
            return { data: {} }
          },
        },
        session: { status: async () => ({ data: {} }) },
        vcs: { get: async () => ({ data: undefined }) },
        command: {
          list: async () => {
            mcpReads.push("command")
            return { data: [] }
          },
        },
        permission: { list: async () => ({ data: [] }) },
        question: { list: async () => ({ data: [] }) },
        v2: { reference: { list: async () => ({ data: { data: [] } }) } },
        mcp: {
          status: async () => {
            mcpReads.push("status")
            return { data: {} }
          },
        },
        experimental: {
          resource: {
            list: async () => {
              mcpReads.push("resource")
              return { data: {} }
            },
          },
        },
        provider: { list: async () => ({ data: { all: [], connected: [], default: {} } }) },
      } as unknown as OpencodeClient,
      api,
      store,
      setStore,
      vcsCache: { setStore() {} } as unknown as VcsCache,
      loadSessions() {},
      loadActiveSessions: async () => ({}),
      translate: (key) => key,
      queryClient: new QueryClient(),
      protocol: Promise.resolve("v1"),
    })

    expect(store.status).toBe("partial")

    await new Promise((resolve) => setTimeout(resolve, 80))

    expect(store.status).toBe("complete")
    expect(legacyConfigReads).toEqual(["directory"])
    expect(mcpReads.sort()).toEqual(["command", "resource", "status"])
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
      } as unknown as OpencodeClient,
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
          config: { get: async () => ({ data: { share: "manual" } }) },
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
        } as unknown as OpencodeClient,
        api,
        store,
        setStore,
        vcsCache: { setStore() {} } as unknown as VcsCache,
        loadSessions() {},
        loadActiveSessions: async () => ({}),
        translate: (key) => key,
        queryClient: new QueryClient(),
        protocol: Promise.resolve("v1"),
      })
      expect(store.load).toEqual({ agent: "pending", config: "pending", session_status: "pending" })
      await new Promise((resolve) => setTimeout(resolve, 80))
      return store
    }

    const loaded = await run(async () => ({ data: [{ name: "maestro", mode: "primary" }] }))
    expect(loaded.status).toBe("partial")
    expect(loaded.load).toEqual({ agent: "ready", config: "ready", session_status: "ready" })
    expect(loaded.config).toEqual({ share: "manual" })
    expect(loaded.agent.map((agent) => agent.name)).toEqual(["maestro"])

    const failed = await run(async () => {
      throw new Error("agents unavailable")
    })
    expect(failed.load).toEqual({ agent: "failed", config: "ready", session_status: "ready" })
  })

  test("records the v1 status read and the v2 active session seed, which stays out of the bootstrap outcome", async () => {
    for (const protocol of ["v1", "v2"] as const) {
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
          } as unknown as OpencodeClient,
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
        } as unknown as OpencodeClient,
        api,
        store,
        setStore,
        vcsCache: { setStore() {} } as unknown as VcsCache,
        loadSessions() {},
        loadActiveSessions: async () => ({}),
        translate: (key) => key,
        queryClient: new QueryClient(),
        protocol: Promise.resolve("v1"),
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
        config: { share: "manual" },
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
    } as unknown as OpencodeClient

    const result = await new QueryClient().fetchQuery(
      loadGlobalConfigQuery(ServerScope.local, sdk, Promise.resolve("v2")),
    )

    expect(result).toEqual({})
  })

  test("loads legacy global config for v1 servers", async () => {
    const calls: string[] = []
    const config = { shell: "zsh" } satisfies Config
    const sdk = {
      global: {
        config: {
          get: async () => {
            calls.push("global")
            return { data: config }
          },
        },
      },
    } as unknown as OpencodeClient

    const result = await new QueryClient().fetchQuery(
      loadGlobalConfigQuery(ServerScope.local, sdk, Promise.resolve("v1")),
    )

    expect(result).toEqual(config)
    expect(calls).toEqual(["global"])
  })
})

describe("query keys", () => {
  test("partitions identical directories by server scope", () => {
    const client = {} as Parameters<typeof loadPathQuery>[2]
    const api = {} as CatalogApi
    const remote = "https://debian.example" as typeof ServerScope.local

    expect([...loadPathQuery(ServerScope.local, "/repo", client).queryKey]).toEqual(["local", "/repo", "path"])
    expect([...loadPathQuery(remote, "/repo", client).queryKey]).toEqual(["https://debian.example", "/repo", "path"])
    expect([...loadProvidersQuery(remote, null, api).queryKey]).toEqual(["https://debian.example", null, "providers"])
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
    } as unknown as AgentApi

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
    } as unknown as CommandApi

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
    } as unknown as ReferenceApi

    const result = await new QueryClient().fetchQuery(loadReferencesQuery(ServerScope.local, "/repo", api))

    expect(calls).toEqual([{ location: { directory: "/repo" } }])
    expect(result).toHaveLength(1)
  })
})
