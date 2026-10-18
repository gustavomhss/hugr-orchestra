import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import { createModelCatalog } from "../src/hooks/provider-catalog"
import { mixedEngineAgents, mixedEngineCatalog } from "../src/testing/model-execution-fixture"

const host = { providerID: "anthropic", modelID: "claude-host" }
const api = { providerID: "openai", modelID: "gpt-api" }
const [state, setState] = createStore({
  data: { agent: mixedEngineAgents("orchestra"), config: {} },
  catalog: mixedEngineCatalog(),
  chosen: host as { providerID: string; modelID: string; variant?: string | null } | undefined,
})
const ready = Object.assign(() => true, { promise: undefined })
const writes: unknown[] = []
const catalog = createModelCatalog(
  () => state.catalog.connected.flatMap((id) => state.catalog.all.get(id) ?? []),
  () => [],
)
const models = {
  ...catalog,
  ready,
  find: (key: { providerID: string; modelID: string }) =>
    catalog.list().find((model) => model.provider.id === key.providerID && model.id === key.modelID),
  recent: { list: () => [host, api], push() {} },
  setVisibility() {},
  variant: { get: () => undefined, set() {} },
}
const fixtures = {
  context: {
    createSimpleContext: (input: { init: () => unknown }) => ({ provider: input.init, use: () => undefined }),
  },
  models: { useModels: () => models },
  sdk: { useSDK: () => () => ({ directory: "/mixed-engine-project" }) },
  sync: { useSync: () => () => state },
  server: { useServerSDK: () => () => ({ scope: "local" }) },
  router: { useParams: () => ({}), useSearchParams: () => [{}] },
  providers: {
    useProviders: () => ({
      all: () => state.catalog.all,
      connected: () => state.catalog.connected.flatMap((id) => state.catalog.all.get(id) ?? []),
      default: () => state.catalog.default,
      defaultModel: () => state.catalog.defaultModel,
    }),
  },
  persist: {
    Persist: { serverWorkspace: () => ({ key: "selection" }) },
    persisted: (_target: unknown, store: readonly unknown[]) => [store[0], store[1], null, ready],
  },
  prompt: {
    usePrompt: () => ({
      model: {
        current: () => state.chosen,
        set: (item: typeof state.chosen) => {
          writes.push(item)
          setState("chosen", item)
        },
      },
    }),
  },
  tabs: { useTabs: () => ({ store: [] }) },
}

// Stub context boundaries only; exercise the actual LocalProvider/composer initialization and
// selection methods against the real normalized mixed-engine fixture and reactive Solid store.
Bun.plugin({
  name: "model-execution-selection-fixtures",
  setup(build) {
    build.onResolve({ filter: /^model-execution-fixture:/ }, (args) => ({
      path: args.path.slice("model-execution-fixture:".length),
      namespace: "model-execution-fixture",
    }))
    build.onLoad({ filter: /.*/, namespace: "model-execution-fixture" }, (args) => ({
      loader: "object",
      exports: fixtures[args.path as keyof typeof fixtures],
    }))
    build.onLoad({ filter: /(?:local\.tsx|prompt-model-selection\.ts)\?execution-test$/ }, async (args) => ({
      contents: (await Bun.file(args.path.replace(/\?execution-test$/, "")).text())
        .replace('"@orchestra/ui/context"', '"model-execution-fixture:context"')
        .replace('"@solidjs/router"', '"model-execution-fixture:router"')
        .replace('"@/context/models"', '"model-execution-fixture:models"')
        .replace('"@/hooks/use-providers"', '"model-execution-fixture:providers"')
        .replace('"@/utils/persist"', '"model-execution-fixture:persist"')
        .replace('"./sdk"', '"model-execution-fixture:sdk"')
        .replace('"@/context/sdk"', '"model-execution-fixture:sdk"')
        .replace('"./sync"', '"model-execution-fixture:sync"')
        .replace('"@/context/sync"', '"model-execution-fixture:sync"')
        .replace('"./server-sdk"', '"model-execution-fixture:server"')
        .replace('"@/context/prompt"', '"model-execution-fixture:prompt"')
        .replace('"@/context/tabs"', '"model-execution-fixture:tabs"'),
      loader: "ts",
    }))
  },
})
const { LocalProvider }: typeof import("../src/context/local") = await import(
  `${Bun.resolveSync("../src/context/local.tsx", import.meta.dir)}?execution-test`
)
const { createPromptModelSelection }: typeof import("../src/pages/session/composer/prompt-model-selection") =
  await import(
    `${Bun.resolveSync("../src/pages/session/composer/prompt-model-selection.ts", import.meta.dir)}?execution-test`
  )

test("LocalProvider and composer filter all candidates by Maestro engine, not a secondary CC seat", () => {
  setState({ data: { agent: mixedEngineAgents("orchestra"), config: {} }, catalog: mixedEngineCatalog(), chosen: host })
  writes.length = 0
  createRoot((dispose) => {
    const local = LocalProvider({}) as unknown as ReturnType<typeof import("../src/context/local").useLocal>
    const composer = createPromptModelSelection({ agent: local.agent.current })
    try {
      expect(local.agent.current()?.engine).toBe("orchestra")
      expect(state.data.agent.find((agent) => agent.id === "secondary")?.engine).toBe("claude-code")
      for (const selection of [local.model, composer]) {
        expect(selection.list().map((model) => model.id)).toEqual(["claude-api", "gpt-api", "zen-free", "api-model"])
        expect(selection.current()?.id).toBe("gpt-api")
        expect(selection.recent().map((model) => model?.id)).toEqual(["gpt-api"])
        selection.set(host)
        expect(selection.current()?.id).toBe("gpt-api")
      }
      expect(writes).toEqual([])
      setState("data", "agent", mixedEngineAgents("claude-code"))
      for (const selection of [local.model, composer]) {
        expect(selection.list().map((model) => model.id)).toEqual([
          "claude-host",
          "claude-api",
          "gpt-api",
          "zen-free",
          "api-model",
        ])
        expect(selection.current()?.id).toBe("claude-host")
      }
      setState("data", "agent", mixedEngineAgents("orchestra"))
      // Real API-connected Anthropic has no host-only marker. CC login is irrelevant to this control.
      const original = mixedEngineCatalog()
      const provider = original.all.get("anthropic")!
      setState("catalog", {
        ...original,
        all: new Map(original.all).set("anthropic", { ...provider, options: { apiKeySource: "api-connection" } }),
      })
      expect(local.model.list().some((model) => model.id === "claude-host")).toBe(true)
      expect(composer.current()?.id).toBe("claude-host")
    } finally {
      dispose()
    }
  })
})
