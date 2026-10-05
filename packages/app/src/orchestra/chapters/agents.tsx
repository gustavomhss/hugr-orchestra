import { createEffect, createMemo, For, Show } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { useQuery, useQueryClient } from "@tanstack/solid-query"
import type { Agent, AgentFileInput } from "@opencode-ai/sdk/v2/client"
import { getFilename } from "@opencode-ai/core/util/path"
import { useLanguage } from "@/context/language"
import { ServerConnection } from "@/context/server"
import { useServerSync } from "@/context/server-sync"
import { useSync } from "@/context/sync"
import { useSDK } from "@/context/sdk"
import { useTabs } from "@/context/tabs"
import { directoryKey, normalizeAgentList } from "@/context/global-sync/utils"
import { useProviders } from "@/hooks/use-providers"
import type { ChapterPageProps } from "../chapter-route"
import { MxBadge } from "./kit"
import { AgentDialog } from "./agents-dialog"
import { agentRoster, agentUnavailable } from "./agents-roster"
import "./agents.css"

export default function Agents(props: ChapterPageProps) {
  const language = useLanguage()
  const sync = useSync()
  const sdk = useSDK()
  const serverSync = useServerSync()
  const tabs = useTabs()
  const providers = useProviders(() => props.directory)
  const queryClient = useQueryClient()
  const query = useQuery(() => {
    const options = serverSync().queryOptions.agents(directoryKey(props.directory))
    return {
      // Legacy SDK throws only the response body, losing the HTTP status. Keep the
      // page's query separate so bootstrap cannot replace its status-aware loader.
      queryKey: [...options.queryKey, "chapter-agents"],
      initialData: () => queryClient.getQueryData(options.queryKey),
      queryFn: async ({ signal }) => {
        if ((await sdk().protocol) !== "v1") {
          return sdk()
            .api.agent.list({ location: { directory: props.directory } }, { signal })
            .then((result) => normalizeAgentList(result.data))
        }
        const result = await sdk()
          .createClient({ directory: props.directory, throwOnError: false, signal })
          .app.agents()
        if (!result.response.ok)
          throw new Error(language.t("orchestra.agents.error"), { cause: { status: result.response.status } })
        return normalizeAgentList(result.data ?? [])
      },
      staleTime: Infinity,
      retry: false,
    }
  })
  const [state, setState] = createStore({
    editing: undefined as { agent?: Agent } | undefined,
    opening: false,
    failed: false,
  })
  createEffect(() => {
    if (query.isSuccess && query.data) sync().set("agent", reconcile(query.data))
  })
  const roster = createMemo(() => agentRoster(sync().data.agent))
  const models = createMemo(() =>
    providers.connected().map((provider) => ({
      id: provider.id,
      name: provider.name,
      models: Object.values(provider.models).map((model) => ({
        value: `${provider.id}/${model.id}`,
        label: model.name,
      })),
    })),
  )
  const legacy = () => sdk().createClient({ directory: props.directory, throwOnError: false })
  const statusError = (response: Response | undefined) =>
    new Error(language.t("orchestra.agents.error.save"), { cause: { status: response?.status } })

  // Agent files live in `<profile>/.opencode/agent`; the server reloads its V2 agents after a write.
  const load = async (name: string) => {
    const result = await legacy().v2.agent.file.get({ agentID: name, location: { directory: props.directory } })
    if (!result.data) throw statusError(result.response)
    return result.data.data
  }
  const save = async (name: string, input: AgentFileInput) => {
    const result = await legacy().v2.agent.file.update({
      agentID: name,
      location: { directory: props.directory },
      agentFileInput: input,
    })
    if (!result.data) throw statusError(result.response)
    // V1 keeps config per instance; reopen it so the legacy roster reads the new file.
    if ((await sdk().protocol) === "v1") await legacy().instance.dispose()
    await query.refetch()
  }
  const steps = (agent: Agent) => {
    if (agent.steps === undefined) return language.t("orchestra.agents.stepsUnlimited")
    if (agent.steps === 1) return language.t("orchestra.agents.stepsOne")
    return language.t("orchestra.agents.stepsCount", { count: agent.steps })
  }
  const openChat = (agent: Agent) => {
    setState({ opening: true, failed: false })
    void tabs
      .newDraft(
        { server: ServerConnection.key(props.server), directory: props.directory },
        undefined,
        undefined,
        agent.name,
      )
      .catch(() => setState({ opening: false, failed: true }))
  }

  return (
    <section class="mx-page orchestra-agents" aria-labelledby="agents-title">
      <div class="agents-inner">
        <header class="agents-mast">
          <div>
            <div class="agents-kicker">{language.t("orchestra.agents.title")}</div>
            <h1 id="agents-title">
              {language.t("orchestra.agents.headline")}
              <br />
              <span>{language.t("orchestra.agents.headlineMuted")}</span>
            </h1>
          </div>
        </header>
        <div class="mx-toolbar">
          <button
            type="button"
            class="mx-btn primary"
            disabled={!query.isSuccess}
            onClick={() => setState("editing", {})}
          >
            {language.t("orchestra.agents.create")}
          </button>
          <MxBadge>
            <bdi>{getFilename(props.directory) || props.directory}</bdi>
          </MxBadge>
        </div>
        <Show
          when={!query.isPending}
          fallback={
            <p class="mx-empty" role="status">
              {language.t("orchestra.agents.loading")}
            </p>
          }
        >
          <Show
            when={!query.isError}
            fallback={
              <div class="mx-empty">
                <p role="alert">
                  {language.t(agentUnavailable(query.error) ? "orchestra.agents.unavailable" : "orchestra.agents.error")}
                </p>
                <button
                  type="button"
                  class="mx-btn"
                  disabled={query.isFetching}
                  onClick={() => void query.refetch()}
                >
                  {language.t("orchestra.agents.refresh")}
                </button>
              </div>
            }
          >
            <Show
              when={roster().length > 0}
              fallback={
                <div class="mx-empty">
                  <p role="status">{language.t("orchestra.agents.empty")}</p>
                  <button
                    type="button"
                    class="mx-btn"
                    disabled={query.isFetching}
                    onClick={() => void query.refetch()}
                  >
                    {language.t("orchestra.agents.refresh")}
                  </button>
                </div>
              }
            >
              <ul class="mx-grid agents-grid" aria-label={language.t("orchestra.agents.roster")}>
                <For each={roster()}>
                  {(item) => (
                    <li class="agent mx-card" aria-labelledby={`agent-${item.agent.name}`}>
                      <div class="agent-top mx-card-top">
                        <span class="mx-mark">
                          <svg class="agents-ic" viewBox="0 0 16 16" aria-hidden="true">
                            <path d="m8 1 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" />
                          </svg>
                        </span>
                        <b id={`agent-${item.agent.name}`}>
                          <bdi>{item.agent.name}</bdi>
                        </b>
                        <span class="agent-role">{item.agent.mode}</span>
                      </div>
                      <p>{item.agent.description ?? language.t("orchestra.agents.noDescription")}</p>
                      <div class="mx-meta">
                        <MxBadge>
                          <bdi title={item.agent.model ? `${item.agent.model.providerID}/${item.agent.model.modelID}` : undefined}>
                            {item.agent.model?.modelID ?? language.t("orchestra.agents.defaultModel")}
                          </bdi>
                        </MxBadge>
                        <MxBadge>{steps(item.agent)}</MxBadge>
                        <MxBadge tone="good">{language.t("orchestra.agents.available")}</MxBadge>
                      </div>
                      <footer class="mx-card-foot">
                        <button type="button" class="mx-btn" onClick={() => setState("editing", { agent: item.agent })}>
                          {language.t("orchestra.agents.configure")}
                        </button>
                        <button
                          type="button"
                          class="mx-btn"
                          disabled={!item.chat || state.opening || !tabs.ready()}
                          title={item.chat ? undefined : language.t("orchestra.agents.subagentNote")}
                          onClick={() => openChat(item.agent)}
                        >
                          {language.t("orchestra.agents.openChat")}
                        </button>
                      </footer>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Show>
        </Show>
        <Show when={state.failed}>
          <p class="mx-error agents-draft-error" role="alert">
            {language.t("orchestra.agents.draftError")}
          </p>
        </Show>
      </div>
      <Show when={state.editing}>
        {(editing) => (
          <AgentDialog
            agent={editing().agent}
            agents={sync().data.agent}
            models={models()}
            load={load}
            save={save}
            onClose={() => setState("editing", undefined)}
          />
        )}
      </Show>
    </section>
  )
}
