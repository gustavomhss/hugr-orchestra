import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { createRoot } from "solid-js"

let useLocal: typeof import("./local").useLocal

const native = (name: string, id?: string) => ({ name, mode: "primary", native: true, ...(id ? { id } : {}) })
const roster = [native("build"), native("plan"), native("maestro")]

let params: { id?: string } = {}
let search: { draftId?: string } = {}
let customAgents = false
let agents = roster
let sessions: Record<string, { agent?: string } | undefined> = {}

beforeAll(async () => {
  mock.module("@solidjs/router", () => ({
    useParams: () => params,
    useSearchParams: () => [search, () => undefined],
  }))

  // Each use() runs the real Local init against the route, roster and saved state of the current test.
  mock.module("@opencode-ai/ui/context", () => ({
    createSimpleContext: (input: { init: () => unknown }) => ({ use: input.init, provider: () => undefined }),
  }))

  mock.module("./sdk", () => ({
    useSDK: () => () => ({ directory: "/repo" }),
  }))

  mock.module("./server-sdk", () => ({
    useServerSDK: () => () => ({ scope: "local" }),
  }))

  mock.module("./sync", () => ({
    useSync: () => () => ({ data: { agent: agents, config: {} } }),
  }))

  mock.module("@/context/settings", () => ({
    useSettings: () => ({ visibility: { customAgents: () => customAgents } }),
  }))

  mock.module("@/context/models", () => ({
    useModels: () => ({ recent: { list: () => [] }, find: () => undefined }),
  }))

  mock.module("@/hooks/use-providers", () => ({
    useProviders: () => ({
      all: () => new Map(),
      connected: () => [],
      default: () => ({}),
      defaultModel: () => undefined,
    }),
  }))

  mock.module("@/utils/persist", () => ({
    Persist: { serverWorkspace: () => ({}) },
    persisted: () => [{ session: sessions }, () => undefined, undefined, () => true],
  }))

  useLocal = (await import("./local")).useLocal
})

beforeEach(() => {
  params = {}
  search = {}
  customAgents = false
  agents = roster
  sessions = {}
})

const currentAgent = () =>
  createRoot((dispose) => {
    const name = useLocal().agent.current()?.name
    dispose()
    return name
  })

describe("Local agent", () => {
  test("a follow-up in a Maestro session stays on maestro", () => {
    params = { id: "ses_maestro" }
    sessions = { ses_maestro: { agent: "maestro" } }

    expect(currentAgent()).toBe("maestro")
  })

  test("new sessions and drafts start on maestro", () => {
    search = { draftId: "draft_1" }

    expect(currentAgent()).toBe("maestro")
  })

  test("a session saved on another agent continues on maestro, even with custom agents shown", () => {
    params = { id: "ses_plan" }
    sessions = { ses_plan: { agent: "plan" } }
    customAgents = true

    expect(currentAgent()).toBe("maestro")
  })

  test("build is not a fallback when the server lists no maestro", () => {
    params = { id: "ses_maestro" }
    agents = roster.filter((agent) => agent.name !== "maestro")

    expect(currentAgent()).toBeUndefined()
  })

  test("a renamed maestro is still found and sent by its stable id", () => {
    agents = [native("build"), native("plan"), native("Conductor", "maestro")]

    const key = createRoot((dispose) => {
      const local = useLocal()
      const result = { label: local.agent.current()?.name, key: local.agent.key() }
      dispose()
      return result
    })
    expect(key).toEqual({ label: "Conductor", key: "maestro" })
  })
})
