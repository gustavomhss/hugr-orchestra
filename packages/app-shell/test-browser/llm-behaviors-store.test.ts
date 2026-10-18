import { describe, expect, test } from "bun:test"
import { defaultBehaviorState, type LlmBehavior } from "../src/utils/llm-behaviors"
import { llmBehaviors, resolveBehaviorSystem } from "../src/utils/llm-behaviors-store"
import { pathKey } from "../src/utils/path-key"
import { PersistTesting } from "../src/utils/persist"
import { ServerScope } from "../src/utils/server-scope"

const KEY = "workspace:orchestra-llm-behaviors"
const caveman = (patch: Partial<LlmBehavior>) => ({ ...defaultBehaviorState().behaviors[0]!, ...patch })

// Desktop storage answers asynchronously, like the Electron IPC store.
function desktop(read: (name: string, key: string) => Promise<string | null>) {
  const writes: { name: string; key: string; value: string }[] = []
  return {
    writes,
    platform: {
      platform: "desktop" as const,
      openExternal: () => {},
      restart: async () => {},
      notify: async () => {},
      storage: (name = "default") => ({
        getItem: (key: string) => read(name, key),
        setItem: async (key: string, value: string) => void writes.push({ name, key, value }),
        removeItem: async () => {},
      }),
    },
  }
}

function saved(directory: string, behaviors: LlmBehavior[]) {
  const name = PersistTesting.workspaceStorage(pathKey(directory))
  return async (storage: string, key: string) =>
    storage === name && key === KEY ? JSON.stringify({ behaviors }) : null
}

describe("profile LLM behavior store", () => {
  test("a sandbox send waits for its repository's saved behaviors and the page shares that store", async () => {
    const stub = desktop(saved("/repo/a", [caveman({ enabled: true, intensity: "ultra" })]))
    const projects = [{ worktree: "/repo/a", sandboxes: ["/repo/a-feature"] }]
    const system = await resolveBehaviorSystem({
      platform: stub.platform,
      scope: ServerScope.local,
      projects,
      directory: "/repo/a-feature",
    })
    expect(system).toContain("## Caveman (intensity: ultra)")

    const page = llmBehaviors(stub.platform, ServerScope.local, "/repo/a/")
    expect(page.loading()).toBe(false)
    page.update([caveman({ enabled: false })])
    expect(stub.writes.at(-1)).toMatchObject({ name: PersistTesting.workspaceStorage(pathKey("/repo/a")), key: KEY })
    expect(
      await resolveBehaviorSystem({
        platform: stub.platform,
        scope: ServerScope.local,
        projects,
        directory: "/repo/a",
      }),
    ).toBeUndefined()
  })

  test("profiles on another directory or server keep their own behaviors", async () => {
    const stub = desktop(saved("/repo/b", [caveman({ enabled: true })]))
    const resolve = (scope: ServerScope, directory: string) =>
      resolveBehaviorSystem({ platform: stub.platform, scope, projects: [], directory })
    expect(await resolve(ServerScope.local, "/repo/b")).toContain("## Caveman (intensity: full)")
    expect(await resolve(ServerScope.local, "/repo/b-other")).toBeUndefined()
    expect(
      await resolve(
        ServerScope.fromServerKey("http://remote:4096" as Parameters<typeof ServerScope.fromServerKey>[0]),
        "/repo/b",
      ),
    ).toBeUndefined()
  })

  test("a storage read that fails sends nothing and never throws", async () => {
    const stub = desktop(async () => {
      throw new Error("storage unavailable")
    })
    const store = llmBehaviors(stub.platform, ServerScope.local, "/repo/c")
    await store.loaded
    expect(store.loading()).toBe(false)
    expect(store.behaviors()).toEqual(defaultBehaviorState().behaviors)
    expect(
      await resolveBehaviorSystem({
        platform: stub.platform,
        scope: ServerScope.local,
        projects: [],
        directory: "/repo/c",
      }),
    ).toBeUndefined()
  })

  test("a storage read that never answers does not hold the message past the timeout", async () => {
    const stub = desktop(() => new Promise<string | null>(() => {}))
    const started = performance.now()
    const system = await resolveBehaviorSystem({
      platform: stub.platform,
      scope: ServerScope.local,
      projects: [],
      directory: "/repo/d",
      timeout: 30,
    })
    expect(system).toBeUndefined()
    expect(performance.now() - started).toBeLessThan(1_000)
    expect(llmBehaviors(stub.platform, ServerScope.local, "/repo/d").loading()).toBe(true)
  })
})
