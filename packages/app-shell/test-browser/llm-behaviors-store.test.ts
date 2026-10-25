import { describe, expect, test } from "bun:test"
import { defaultBehaviorState, type LlmBehavior } from "../src/utils/llm-behaviors"
import { llmBehaviors } from "../src/utils/llm-behaviors-store"
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

async function settled(store: ReturnType<typeof llmBehaviors>) {
  while (store.loading()) await Bun.sleep(0)
}

describe("profile LLM behavior store", () => {
  test("the page loads its profile's saved behaviors and persists changes", async () => {
    const stub = desktop(saved("/repo/a", [caveman({ enabled: true, intensity: "ultra" })]))
    const page = llmBehaviors(stub.platform, ServerScope.local, "/repo/a")
    await settled(page)
    expect(page.behaviors()[0]).toMatchObject({ enabled: true, intensity: "ultra" })
    expect(llmBehaviors(stub.platform, ServerScope.local, "/repo/a/")).toBe(page)

    page.update([caveman({ enabled: false })])
    expect(stub.writes.at(-1)).toMatchObject({ name: PersistTesting.workspaceStorage(pathKey("/repo/a")), key: KEY })
    expect(page.behaviors()[0]?.enabled).toBe(false)
  })

  test("profiles on another directory or server keep their own behaviors", async () => {
    const stub = desktop(saved("/repo/b", [caveman({ enabled: true })]))
    const open = async (scope: ServerScope, directory: string) => {
      const store = llmBehaviors(stub.platform, scope, directory)
      await settled(store)
      return store.behaviors()[0]?.enabled
    }
    expect(await open(ServerScope.local, "/repo/b")).toBe(true)
    expect(await open(ServerScope.local, "/repo/b-other")).toBe(false)
    expect(
      await open(
        ServerScope.fromServerKey("http://remote:4096" as Parameters<typeof ServerScope.fromServerKey>[0]),
        "/repo/b",
      ),
    ).toBe(false)
  })

  test("a storage read that fails keeps the defaults and never throws", async () => {
    const stub = desktop(async () => {
      throw new Error("storage unavailable")
    })
    const store = llmBehaviors(stub.platform, ServerScope.local, "/repo/c")
    await settled(store)
    expect(store.behaviors()).toEqual(defaultBehaviorState().behaviors)
  })
})
