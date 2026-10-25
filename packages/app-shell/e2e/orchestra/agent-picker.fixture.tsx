import { Dialog } from "@orchestra/ui/dialog"
import { DialogProvider, useDialog } from "@orchestra/ui/context/dialog"
import { createMemo, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import type { Agent, Provider } from "../../src/v2-wire"

import { LanguageProvider, useLanguage } from "../../src/context/language"
import { PlatformProvider } from "../../src/context/platform"
import { SubagentModelPicker } from "../../src/components/subagent-model-picker"
import { ServerUnavailable } from "../../src/components/server-unavailable"
import { Empty } from "../../src/orchestra/actions/components"
import { AgentsRoster } from "../../src/orchestra/chapters/agents-view"
import { AgentDialog } from "../../src/orchestra/chapters/agents-dialog"
import { agentModels } from "../../src/orchestra/chapters/agents-roster"
import type { ModelRule } from "../../src/components/subagent-model-rules"
import { draftVersion, pendingRules } from "../../src/components/draft-subagent-models"
import { agentProvider } from "./chapter-agents.models"
import "../../src/index.css"
import "../../src/orchestra/chapters/agents.css"

function Fixture() {
  const dialog = useDialog()
  const language = useLanguage()
  const params = new URL(location.href).searchParams
  const count = Math.min(5000, Math.max(1, Number(params.get("count") ?? 2)))
  const pendingKey = params.get("pending") ?? "fixture/server/draft"
  const pending = createMemo(() => {
    draftVersion()
    return pendingRules(pendingKey)
  })
  const providers: Provider[] = params.has("count")
    ? Array.from({ length: Math.ceil(count / 100) }, (_, group) => ({
        ...agentProvider,
        id: `provider-${group}`,
        name: `Provider ${group.toString().padStart(3, "0")}`,
        models: Object.fromEntries(
          Array.from({ length: Math.min(100, count - group * 100) }, (_, offset) => {
            const index = group * 100 + offset
            const id = `team/model-${index}`
            return [
              id,
              {
                ...agentProvider.models.builder,
                id,
                name: `Model ${index.toString().padStart(5, "0")}`,
                providerID: `provider-${group}`,
              },
            ]
          }),
        ),
      }))
    : [agentProvider]
  const agents: Agent[] = Array.from({ length: count }, (_, index) => ({
    id: `seat-${index}`,
    name: `Agent ${index.toString().padStart(5, "0")}`,
    description: "Specialist role",
    mode: "subagent",
    permission: [],
    options: {},
  }))
  const [state, setState] = createStore({
    rules: [] as ModelRule[],
    writes: [] as ModelRule[][],
    roster: false,
    retries: 0,
    refreshed: false,
    editing: undefined as Agent | undefined,
    measurement: undefined as
      | { count: number; kind: string; milliseconds: number; rows: number; nodes: number }
      | undefined,
  })
  const catalog = createMemo(() =>
    state.refreshed
      ? providers.map((provider) => ({
          ...provider,
          models: Object.fromEntries(
            Object.entries(provider.models).map(([key, model]) => [
              key,
              { ...model, name: model.name === "Builder" ? "Renamed Builder" : model.name },
            ]),
          ),
        }))
      : providers,
  )
  const measurement = { observer: undefined as MutationObserver | undefined }
  const measure = (kind: "picker" | "roster") => {
    measurement.observer?.disconnect()
    setState("measurement", undefined)
    const start = performance.now()
    const selector = kind === "picker" ? '[data-slot="list-item"]' : ".agents-grid > li"
    measurement.observer = new MutationObserver(() => {
      const rows = document.querySelectorAll(selector).length
      if (!rows) return
      const milliseconds = performance.now() - start
      measurement.observer?.disconnect()
      setState("measurement", { count, kind, milliseconds, rows, nodes: document.querySelectorAll("*").length })
    })
    measurement.observer.observe(document.body, { childList: true, subtree: true })
  }
  onCleanup(() => measurement.observer?.disconnect())
  const openPicker = () => {
    measure("picker")
    void dialog.show(() => (
      <SubagentModelPicker
        directory="/fixture"
        pendingKey={pendingKey}
        sessionID={params.has("draft") ? undefined : "fixture"}
        providers={catalog()}
        status="success"
        supported
        rulesReady
        readRules={() => state.rules}
        writeRules={async (rules) => {
          setState("writes", [...state.writes, rules])
          if (params.has("remote")) {
            const response = await fetch("/fixture-save", { method: "POST" })
            if (!response.ok) throw new Error("Rejected")
          }
          setState("rules", [...state.rules, ...rules])
          return state.rules
        }}
        onRetry={() => {}}
      />
    ))
  }
  onMount(() => {
    language.setDirection(params.get("dir") === "rtl" ? "rtl" : "ltr")
    if (params.get("auto") !== "0") openPicker()
  })
  return (
    <>
      <button data-testid="open-picker" onClick={openPicker}>
        Open picker
      </button>
      <button
        data-testid="open-roster"
        onClick={() => {
          measure("roster")
          setState("roster", true)
        }}
      >
        Open roster
      </button>
      <button data-testid="open-agent" onClick={() => setState("editing", agents[0])}>
        Configure agent
      </button>
      <button
        data-testid="open-connect"
        onClick={() =>
          void dialog.show((dispose) => (
            <Dialog title="Connect fixture">
              <button
                onClick={() =>
                  void dialog.push(() => (
                    <Dialog title="Nested fixture">
                      <button autofocus>Inner control</button>
                    </Dialog>
                  ))
                }
              >
                Open nested
              </button>
              <button
                onClick={() =>
                  void dialog.show(() => (
                    <Dialog title="Replacement fixture">
                      <button autofocus>Replacement control</button>
                    </Dialog>
                  ))
                }
              >
                Replace dialog
              </button>
              <button onClick={dispose}>Remove directly</button>
              <button
                onClick={() => {
                  dialog.close()
                  document.querySelector<HTMLButtonElement>('[data-testid="unrelated"]')?.focus()
                }}
              >
                Close with new focus
              </button>
            </Dialog>
          ))
        }
      >
        Connect fixture
      </button>
      <button data-testid="unrelated">Unrelated control</button>
      <button data-testid="refresh-models" onClick={() => setState("refreshed", true)}>
        Refresh model metadata
      </button>
      <Show when={state.roster}>
        <section class="orchestra-agents">
          <AgentsRoster
            agents={agents}
            scope="fixture"
            availability={() => ({ ok: true })}
            onConfigure={(agent) => setState("editing", agent)}
            onChat={() => {}}
          />
        </section>
      </Show>
      <Show when={state.editing} keyed>
        {(agent) => (
          <AgentDialog
            agent={agent}
            agents={agents}
            directory="/fixture"
            models={agentModels(providers)}
            load={async () => ({ path: `/fixture/.orchestra/agent/${agent.id}.md`, exists: false, revision: "" })}
            save={async () => {}}
            onClose={() => setState("editing", undefined)}
          />
        )}
      </Show>
      <Show when={params.has("failures")}>
        <ServerUnavailable onRetry={() => setState("retries", (count) => count + 1)} />
        <Empty
          title="Provider request failed"
          error="Unavailable"
          retry={{ label: "Retry load", run: () => setState("retries", (count) => count + 1) }}
        />
        <output data-testid="retries">{state.retries}</output>
      </Show>
      <output data-testid="writes">{JSON.stringify(state.writes)}</output>
      <output data-testid="pending">{JSON.stringify(pending())}</output>
      <output data-testid="measurement" data-ready={!!state.measurement}>
        {JSON.stringify(state.measurement)}
      </output>
    </>
  )
}

render(
  () => (
    <PlatformProvider value={{ platform: "web", openExternal() {}, restart: async () => {}, notify: async () => {} }}>
      <LanguageProvider locale="en">
        <DialogProvider>
          <Fixture />
        </DialogProvider>
      </LanguageProvider>
    </PlatformProvider>
  ),
  document.getElementById("root")!,
)
