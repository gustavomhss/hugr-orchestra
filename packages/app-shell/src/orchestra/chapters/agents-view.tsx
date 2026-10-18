import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { Agent } from "@/compat/sdk-v2-client"
import { useLanguage } from "@/context/language"
import { agentKey } from "@/context/agent-identity"
import { agentRoster } from "./agents-roster"
import { MxBadge } from "./kit"

const PAGE_SIZE = 24

export function AgentsRoster(props: {
  agents: readonly Agent[]
  availability: (agent: Agent) => { ok: boolean; title?: string; modelIssue?: boolean } | undefined
  onConfigure: (agent: Agent) => void
  onChat: () => void
  opening?: boolean
  chatReady?: boolean
}) {
  const language = useLanguage()
  const [state, setState] = createStore({ search: "", page: 0 })
  const roster = createMemo(() => {
    const search = state.search.trim().toLocaleLowerCase()
    return agentRoster(props.agents).filter(
      ({ agent }) =>
        !search ||
        [agentKey(agent), agent.name, agent.description ?? ""].some((value) =>
          value.toLocaleLowerCase().includes(search),
        ),
    )
  })
  const pages = () => Math.max(1, Math.ceil(roster().length / PAGE_SIZE))
  const page = () => Math.min(state.page, pages() - 1)
  const visible = createMemo(() => roster().slice(page() * PAGE_SIZE, (page() + 1) * PAGE_SIZE))
  const steps = (agent: Agent) => {
    if (agent.steps === undefined) return language.t("orchestra.agents.stepsUnlimited")
    if (agent.steps === 1) return language.t("orchestra.agents.stepsOne")
    return language.t("orchestra.agents.stepsCount", { count: agent.steps })
  }
  return (
    <div class="agents-roster">
      <label class="mx-field agents-search">
        <span>{language.t("orchestra.agents.search")}</span>
        <input
          type="search"
          value={state.search}
          dir="auto"
          onInput={(event) => setState({ search: event.currentTarget.value, page: 0 })}
        />
      </label>
      <p class="mx-note" role="status">
        {language.t("orchestra.agents.page.range", {
          start: roster().length ? page() * PAGE_SIZE + 1 : 0,
          end: Math.min((page() + 1) * PAGE_SIZE, roster().length),
          total: roster().length,
        })}
      </p>
      <Show when={roster().length} fallback={<p class="mx-empty">{language.t("orchestra.agents.noMatches")}</p>}>
        <ul class="mx-grid agents-grid" aria-label={language.t("orchestra.agents.roster")}>
          <For each={visible()}>
            {(item, index) => (
              <li
                class="agent mx-card"
                aria-labelledby={`agent-${agentKey(item.agent)}`}
                aria-setsize={roster().length}
                aria-posinset={page() * PAGE_SIZE + index() + 1}
              >
                <div class="agent-top mx-card-top">
                  <span class="mx-mark">
                    <svg class="agents-ic" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="m8 1 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" />
                    </svg>
                  </span>
                  <b id={`agent-${agentKey(item.agent)}`}>
                    <bdi>{item.agent.name}</bdi>
                  </b>
                  <span class="agent-role">{item.agent.mode}</span>
                </div>
                <p>{item.agent.description ?? language.t("orchestra.agents.noDescription")}</p>
                <div class="mx-meta">
                  <MxBadge>
                    <bdi
                      title={
                        item.agent.model ? `${item.agent.model.providerID}/${item.agent.model.modelID}` : undefined
                      }
                    >
                      {item.agent.model?.modelID ?? language.t("orchestra.agents.defaultModel")}
                    </bdi>
                  </MxBadge>
                  <MxBadge>{steps(item.agent)}</MxBadge>
                  <Show when={props.availability(item.agent)}>
                    {(status) => (
                      <span class={status().ok ? "mx-badge good" : "mx-badge bad"} title={status().title}>
                        {status().modelIssue
                          ? status().title
                          : language.t(status().ok ? "orchestra.agents.available" : "orchestra.agents.providerMissing")}
                      </span>
                    )}
                  </Show>
                </div>
                <footer class="mx-card-foot">
                  <button type="button" class="mx-btn" onClick={() => props.onConfigure(item.agent)}>
                    {language.t("orchestra.agents.configure")}
                  </button>
                  <Show
                    when={item.chat}
                    fallback={<p class="mx-note agents-note">{language.t("orchestra.agents.maestroOnly")}</p>}
                  >
                    <button
                      type="button"
                      class="mx-btn"
                      disabled={props.opening || props.chatReady === false}
                      onClick={props.onChat}
                    >
                      {language.t("orchestra.agents.openChat")}
                    </button>
                  </Show>
                </footer>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={pages() > 1}>
        <nav class="agents-pages" aria-label={language.t("orchestra.agents.pages")}>
          <button
            class="mx-btn"
            type="button"
            aria-disabled={page() === 0}
            onClick={() => page() > 0 && setState("page", page() - 1)}
          >
            {language.t("orchestra.agents.page.previous")}
          </button>
          <button
            class="mx-btn"
            type="button"
            aria-disabled={page() + 1 === pages()}
            onClick={() => page() + 1 < pages() && setState("page", page() + 1)}
          >
            {language.t("orchestra.agents.page.next")}
          </button>
        </nav>
      </Show>
    </div>
  )
}
