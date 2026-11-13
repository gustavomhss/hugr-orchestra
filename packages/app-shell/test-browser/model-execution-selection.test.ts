import { beforeAll, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import { Schema } from "effect"
import { Location } from "@orchestra/schema/location"
import { Model } from "@orchestra/schema/model"
import { ModelExecution } from "@orchestra/schema/model-execution"
import { Provider } from "@orchestra/schema/provider"
import type { makeModelExecutionQuery } from "@orchestra/client"
import { createModelCatalog } from "../src/hooks/provider-catalog"
import { mixedEngineAgents, mixedEngineCatalog } from "../src/testing/model-execution-fixture"

const host = { providerID: "anthropic", modelID: "claude-host", variant: "high" }
const api = { providerID: "openai", modelID: "gpt-api" }
const [state, setState] = createStore({
  data: { agent: mixedEngineAgents("orchestra"), config: {} },
  catalog: mixedEngineCatalog(),
  epoch: 0,
  chosen: host as { providerID: string; modelID: string; variant?: string | null } | undefined,
})
const ready = Object.assign(() => true, { promise: undefined })
const writes: unknown[] = []
const persistedWrites: unknown[] = []
type Execute = Parameters<typeof makeModelExecutionQuery>[0]["execute"]
const calls: { request: Parameters<Execute>[0]; signal: AbortSignal;
  reply: ReturnType<typeof Promise.withResolvers<Awaited<ReturnType<Execute>>>> }[] = []
const sdk = {
  directory: "/mixed-engine-project",
  modelExecutionEpoch: () => state.epoch,
  orchestra: { models: { execution: ((request, options) => {
    const reply = Promise.withResolvers<Awaited<ReturnType<Execute>>>()
    calls.push({ request: structuredClone(request), signal: options.signal, reply })
    return reply.promise
  }) satisfies Execute } },
}
const server = { scope: "local" }
const entries = [...mixedEngineCatalog().all.values()].flatMap((provider) =>
  Object.values(provider.models).map((model) => Model.Info.empty(Provider.ID.make(provider.id), Model.ID.make(model.id))),
)
const responseSchema = Location.response(ModelExecution.Response)
const ref = Model.Ref.make({ providerID: Provider.ID.make(host.providerID), id: Model.ID.make(host.modelID),
  variant: Model.VariantID.make(host.variant) })

// Explicit public transport outcomes qualify consumer ownership, not the backend eligibility algorithm.
function response(decision: ModelExecution.Decision, engine: string, missing = false) {
  return Schema.decodeUnknownSync(responseSchema)({
    location: { directory: sdk.directory, project: { id: "project", directory: sdk.directory } },
    data: {
      models: entries.filter((model) => !missing || model.id !== host.modelID).map((model) => ({
        model, engine, ...(model.id === host.modelID ? decision : { status: "ready" }),
      })),
      selection: { ref, engine, ...decision },
    },
  })
}
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
  variant: { get: () => host.variant, set() {} },
}
const fixtures = {
  context: {
    createSimpleContext: (input: { init: () => unknown }) => ({ provider: input.init, use: () => undefined }),
  },
  models: { useModels: () => models },
  sdk: { useSDK: () => () => sdk },
  sync: { useSync: () => () => state },
  server: { useServerSDK: () => () => server },
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
    persisted: (_target: unknown, store: ReturnType<typeof createStore>) => [store[0], (...args: unknown[]) => {
      persistedWrites.push(args)
      return Reflect.apply(store[1], undefined, args)
    }, null, ready],
  },
  prompt: {
    usePrompt: () => ({
      ready,
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
let LocalProvider: typeof import("../src/context/local").LocalProvider
let createPromptModelSelection: typeof import("../src/pages/session/composer/prompt-model-selection").createPromptModelSelection
beforeAll(async () => {
  const local = await import(`${Bun.resolveSync("../src/context/local.tsx", import.meta.dir)}?execution-test`)
  const composer = await import(`${Bun.resolveSync("../src/pages/session/composer/prompt-model-selection.ts", import.meta.dir)}?execution-test`)
  LocalProvider = local.LocalProvider
  createPromptModelSelection = composer.createPromptModelSelection
})

async function wait(condition: () => boolean, label: string) {
  const deadline = performance.now() + 1500
  while (!condition()) {
    if (performance.now() >= deadline) throw new Error(`Selection fixture did not settle: ${label}`)
    await Bun.sleep(1)
  }
}

test("Local and composer retain explicit intent and consume Maestro eligibility without fallback writes", async () => {
  setState({ data: { agent: mixedEngineAgents("orchestra"), config: {} }, catalog: mixedEngineCatalog(), chosen: host, epoch: 0 })
  writes.length = 0
  persistedWrites.length = 0
  calls.length = 0
  const owner = createRoot((dispose) => {
    const local = LocalProvider({}) as unknown as ReturnType<typeof import("../src/context/local").useLocal>
    const composer = createPromptModelSelection({ agent: local.agent.current })
    local.model.set({ providerID: host.providerID, modelID: host.modelID })
    local.model.variant.set(host.variant)
    return { dispose, selections: [local.model, composer], local, composer }
  })
  const expectedRequest = {
    location: { directory: sdk.directory }, context: { type: "draft", agentID: "maestro" }, model: ref,
  }
  const answer = async (value: ReturnType<typeof response>, from: number, label: string) => {
    await wait(() => calls.slice(from).filter((call) => !call.signal.aborted).length === 2, `${label} requests`)
    const current = calls.slice(from).filter((call) => !call.signal.aborted)
    for (const call of current) {
      expect(call.request).toEqual(expectedRequest)
      call.reply.resolve(value)
    }
    await wait(() => owner.selections.every((selection) => selection.execution.read().status === "ready"), label)
  }
  const retained = () => {
    for (const selection of owner.selections) {
      expect(selection.intent()).toEqual({ model: { providerID: host.providerID, modelID: host.modelID }, variant: host.variant })
      expect(selection.current()?.id).toBe(host.modelID)
    }
    expect(state.chosen).toEqual(host)
    expect(writes).toEqual([])
    expect(persistedWrites).toEqual([])
  }
  try {
    // Loading checks explicit composer intent only; no automatic Local default is assumed.
    expect(owner.composer.current()?.id).toBe(host.modelID)
    expect(owner.composer.execution.ready()).toBe(false)
    expect(owner.composer.execution.read().status).toBe("loading")
    expect(writes).toEqual([])
    expect(persistedWrites).toEqual([])
    await answer(response({ status: "unsupported", reason: "unsupported-api" }, "orchestra"), 0, "unsupported host")
    retained()
    for (const selection of owner.selections) {
      expect(selection.list().map((model) => model.id)).toEqual(entries.map((model) => model.id))
      expect(selection.execution.ready()).toBe(false)
      expect(selection.execution.reason(host)).toBe("unsupported-api")
    }

    const secondary = calls.length
    expect(state.data.agent.find((agent) => agent.id === "secondary")?.engine).toBe("claude-code")
    setState("data", "agent", mixedEngineAgents("orchestra").map((agent) =>
      agent.id === "secondary" ? { ...agent, engine: "orchestra" } : agent))
    await answer(response({ status: "unsupported", reason: "unsupported-api" }, "orchestra"), secondary, "secondary-only refresh")
    retained()
    for (const selection of owner.selections) {
      expect(selection.execution.ready()).toBe(false)
      expect(selection.execution.reason(host)).toBe("unsupported-api")
    }

    const primary = calls.length
    setState("data", "agent", state.data.agent.map((agent) =>
      agent.id === "maestro" ? { ...agent, engine: "claude-code" } : agent))
    expect(owner.local.agent.current()?.engine).toBe("claude-code")
    await answer(response({ status: "ready" }, "claude-code"), primary, "Maestro ready")
    retained()
    for (const selection of owner.selections) expect(selection.execution.ready()).toBe(true)

    const removed = calls.length
    const original = mixedEngineCatalog()
    const provider = original.all.get(host.providerID)
    if (!provider) throw new Error("Missing controlled host provider")
    setState("catalog", { ...original, all: new Map(original.all).set(host.providerID, {
      ...provider, models: Object.fromEntries(Object.entries(provider.models).filter(([id]) => id !== host.modelID)),
    }) })
    setState("epoch", 1)
    await answer(response({ status: "unavailable", reason: "model-missing" }, "claude-code", true), removed, "missing host")
    retained()
    for (const selection of owner.selections) {
      expect(selection.execution.ready()).toBe(false)
      expect(selection.execution.reason(host)).toBe("model-missing")
      expect(selection.list().some((model) => model.id === host.modelID)).toBe(true)
    }
  } finally {
    owner.dispose()
    // Settle every controlled transport, including superseded generations, after the real owners abort it.
    for (const call of calls) call.reply.resolve(response({ status: "unavailable", reason: "model-missing" }, "claude-code", true))
    await Promise.all(calls.map((call) => call.reply.promise))
    expect(calls.every((call) => call.signal.aborted)).toBe(true)
  }
})
