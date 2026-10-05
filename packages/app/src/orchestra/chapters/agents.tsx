import { createEffect, createMemo, For, Show } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { useQuery, useQueryClient } from "@tanstack/solid-query"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { useLanguage } from "@/context/language"
import { ServerConnection } from "@/context/server"
import { useServerSync } from "@/context/server-sync"
import { useSync } from "@/context/sync"
import { useSDK } from "@/context/sdk"
import { useTabs } from "@/context/tabs"
import { directoryKey, normalizeAgentList } from "@/context/global-sync/utils"
import type { ChapterPageProps } from "../chapter-route"
import { agentRoster, agentUnavailable } from "./agents-roster"
import { agentKey } from "@/context/local-agent"
import "./agents.css"

export default function Agents(props: ChapterPageProps) {
  const language = useLanguage()
  const sync = useSync()
  const sdk = useSDK()
  const serverSync = useServerSync()
  const tabs = useTabs()
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
  const [state, setState] = createStore({ selected: "", opening: false, failed: false })
  createEffect(() => {
    if (query.isSuccess && query.data) sync().set("agent", reconcile(query.data))
  })
  const roster = createMemo(() => agentRoster(sync().data.agent))
  const selected = createMemo(() => roster().find((item) => agentKey(item.agent) === state.selected) ?? roster()[0])
  const mode = (item: ReturnType<typeof agentRoster>[number]) =>
    language.t(
      item.subagent
        ? "orchestra.agents.mode.subagent"
        : item.agent.mode === "all"
          ? "orchestra.agents.mode.all"
          : "orchestra.agents.mode.primary",
    )

  return (
    <section class="orchestra-agents" aria-labelledby="agents-title">
      <header>
        <h1 id="agents-title">{language.t("orchestra.agents.title")}</h1>
        <p>{language.t("orchestra.agents.description")}</p>
      </header>
      <div class="agents-toolbar">
        <bdi class="agents-directory">{props.directory}</bdi>
        <ButtonV2 variant="outline" size="small" disabled={query.isFetching} onClick={() => void query.refetch()}>
          {language.t("orchestra.agents.refresh")}
        </ButtonV2>
      </div>
      <Show when={!query.isPending} fallback={<p role="status">{language.t("orchestra.agents.loading")}</p>}>
        <Show
          when={!query.isError}
          fallback={
            <p role="alert">
              {language.t(agentUnavailable(query.error) ? "orchestra.agents.unavailable" : "orchestra.agents.error")}
            </p>
          }
        >
          <Show when={roster().length > 0} fallback={<p role="status">{language.t("orchestra.agents.empty")}</p>}>
            <div class="agents-content">
              <ul class="agents-roster" aria-label={language.t("orchestra.agents.roster")}>
                <For each={roster()}>
                  {(item) => (
                    <li>
                      <ButtonV2
                        class="agents-card"
                        variant="ghost"
                        aria-pressed={selected() === item}
                        onClick={() => setState("selected", agentKey(item.agent))}
                      >
                        <span class="agents-card-top">
                          <strong>
                            <bdi>{item.agent.name}</bdi>
                          </strong>
                          <span class="agents-mode">{mode(item)}</span>
                        </span>
                        <span class="agents-card-description">
                          {item.agent.description ?? language.t("orchestra.agents.noDescription")}
                        </span>
                        <span class="agents-card-model">
                          <bdi>
                            {item.agent.model
                              ? `${item.agent.model.providerID}/${item.agent.model.modelID}`
                              : language.t("orchestra.agents.inherited")}
                          </bdi>
                        </span>
                      </ButtonV2>
                    </li>
                  )}
                </For>
              </ul>
              <Show when={selected()}>
                {(item) => (
                  <article
                    class="agents-detail"
                    aria-label={language.t("orchestra.agents.details", { name: item().agent.name })}
                  >
                    <h2>
                      <bdi>{item().agent.name}</bdi>
                    </h2>
                    <p>{item().agent.description ?? language.t("orchestra.agents.noDescription")}</p>
                    <dl>
                      <div>
                        <dt>{language.t("orchestra.agents.mode")}</dt>
                        <dd>{mode(item())}</dd>
                      </div>
                      <div>
                        <dt>{language.t("orchestra.agents.model")}</dt>
                        <dd>
                          <bdi>
                            {item().agent.model
                              ? `${item().agent.model!.providerID}/${item().agent.model!.modelID}`
                              : language.t("orchestra.agents.inherited")}
                          </bdi>
                        </dd>
                      </div>
                      <div>
                        <dt>{language.t("orchestra.agents.steps")}</dt>
                        <dd>{item().agent.steps ?? language.t("orchestra.agents.unspecified")}</dd>
                      </div>
                    </dl>
                    <h3>{language.t("orchestra.agents.permissions")}</h3>
                    <Show
                      when={item().agent.permission?.length}
                      fallback={<p>{language.t("orchestra.agents.noPermissions")}</p>}
                    >
                      <div class="agents-permissions">
                        <table>
                          <thead>
                            <tr>
                              <th>{language.t("orchestra.agents.permission")}</th>
                              <th>{language.t("orchestra.agents.pattern")}</th>
                              <th>{language.t("orchestra.agents.action")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            <For each={item().agent.permission}>
                              {(rule) => (
                                <tr>
                                  <td>
                                    <bdi>{rule.permission}</bdi>
                                  </td>
                                  <td>
                                    <code dir="ltr">{rule.pattern}</code>
                                  </td>
                                  <td>{language.t(`orchestra.agents.action.${rule.action}`)}</td>
                                </tr>
                              )}
                            </For>
                          </tbody>
                        </table>
                      </div>
                    </Show>
                    <Show
                      when={item().chat}
                      fallback={<p class="agents-note">{language.t("orchestra.agents.subagentNote")}</p>}
                    >
                      <ButtonV2
                        disabled={state.opening || !tabs.ready()}
                        onClick={() => {
                          setState({ opening: true, failed: false })
                          void tabs
                            .newDraft(
                              { server: ServerConnection.key(props.server), directory: props.directory },
                              undefined,
                              undefined,
                              agentKey(item().agent),
                            )
                            .catch(() => setState({ opening: false, failed: true }))
                        }}
                      >
                        {language.t("orchestra.agents.openChat")}
                      </ButtonV2>
                    </Show>
                    <Show when={state.failed}>
                      <p role="alert">{language.t("orchestra.agents.draftError")}</p>
                    </Show>
                  </article>
                )}
              </Show>
            </div>
          </Show>
        </Show>
      </Show>
    </section>
  )
}
