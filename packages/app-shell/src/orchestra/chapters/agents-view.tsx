import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { Agent } from "@/v2-wire"
import type { AgentFileInfo } from "@/v2-types"
import { useLanguage } from "@/context/language"
import { agentKey } from "@/context/agent-identity"
import {
  agentAvatar,
  agentRoster,
  inheritedAction,
  mcpPermission,
  PERMISSION_TOOLS,
  type PermissionChoice,
} from "./agents-roster"
import { avatarUrl } from "../avatars"
import { MxBadge } from "./kit"

const PAGE_SIZE = 24

/** What an agent can use and remembers; a count is undefined until its source answers. */
export type AgentStats = { tools?: number; skills?: number; memories?: number }

export function AgentsRoster(props: {
  agents: readonly Agent[]
  availability: (agent: Agent) => { ok: boolean; title?: string; modelIssue?: boolean } | undefined
  scope: string
  /** The catalog's display name for an agent's model, when this profile's catalog has loaded it. */
  modelName?: (agent: Agent) => string | undefined
  stats: (agent: Agent) => AgentStats
  working?: (agent: Agent) => boolean
  onOpen: (agent: Agent) => void
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
  return (
    <div class="agents-roster">
      <div class="mx-toolbar">
        <input
          class="mx-search"
          type="search"
          aria-label={language.t("orchestra.agents.search")}
          placeholder={language.t("orchestra.agents.search")}
          value={state.search}
          dir="auto"
          onInput={(event) => setState({ search: event.currentTarget.value, page: 0 })}
        />
        <MxBadge>
          <bdi>{props.scope}</bdi>
        </MxBadge>
      </div>
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
            {(item, index) => {
              const id = `agent-${agentKey(item.agent)}`
              const status = () => props.availability(item.agent)
              const stats = () => props.stats(item.agent)
              return (
                <li
                  class="agent mx-card"
                  aria-labelledby={id}
                  aria-setsize={roster().length}
                  aria-posinset={page() * PAGE_SIZE + index() + 1}
                >
                  <div class="agent-top">
                    <AgentPortrait agent={item.agent} class="agent-avatar" working={props.working?.(item.agent)} />
                    <div class="agent-title">
                      {/* The name is the card's one link: its hit area stretches over the whole card. */}
                      <button type="button" class="agent-open" id={id} onClick={() => props.onOpen(item.agent)}>
                        <bdi>{item.agent.name}</bdi>
                      </button>
                      <span class="agent-role">
                        {language.t(
                          item.agent.mode === "subagent"
                            ? "orchestra.agents.kind.subagent"
                            : "orchestra.agents.kind.primary",
                        )}
                      </span>
                    </div>
                    <Show when={status()}>
                      {(status) => (
                        <span
                          class={status().ok ? "agent-status good" : "agent-status bad"}
                          title={status().title ?? language.t("orchestra.agents.available")}
                          role="img"
                          aria-label={
                            status().modelIssue
                              ? status().title
                              : language.t(
                                  status().ok ? "orchestra.agents.available" : "orchestra.agents.providerMissing",
                                )
                          }
                        />
                      )}
                    </Show>
                  </div>
                  <p class="agent-desc" title={item.agent.description}>
                    {item.agent.description ?? language.t("orchestra.agents.noDescription")}
                  </p>
                  <dl class="agent-stats">
                    <For each={["tools", "skills", "memories"] as const}>
                      {(kind) => (
                        <div>
                          <dt>{language.t(`orchestra.agents.stat.${kind}`)}</dt>
                          <dd>{stats()[kind] ?? "–"}</dd>
                        </div>
                      )}
                    </For>
                  </dl>
                  <div class="agent-foot">
                    <span
                      class="agent-model"
                      title={
                        item.agent.model ? `${item.agent.model.providerID}/${item.agent.model.modelID}` : undefined
                      }
                    >
                      <bdi>
                        {props.modelName?.(item.agent) ??
                          item.agent.model?.modelID ??
                          language.t("orchestra.agents.defaultModel")}
                      </bdi>
                    </span>
                    <Show when={item.chat}>
                      <button
                        type="button"
                        class="mx-btn agent-chat"
                        disabled={props.opening || props.chatReady === false}
                        onClick={props.onChat}
                      >
                        {language.t("orchestra.agents.openChat")}
                      </button>
                    </Show>
                  </div>
                </li>
              )
            }}
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

/** The agent's picture, or the star mark in the same slot when it has none. */
export function AgentPortrait(props: { agent: Agent; avatar?: string; class: string; working?: boolean }) {
  return (
    <Show
      when={avatarUrl(props.avatar ?? agentAvatar(props.agent))}
      fallback={
        <span class={`mx-mark ${props.class}`}>
          <svg class="agents-ic" viewBox="0 0 16 16" aria-hidden="true">
            <path d="m8 1 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" />
          </svg>
        </span>
      }
    >
      {(url) => <img class={props.class} src={url()} alt="" data-working={props.working || undefined} />}
    </Show>
  )
}

/** One permission select per built-in tool, then one per configured MCP server covering all its tools. */
export function AgentToolPermissions(props: {
  rules: Agent["permission"]
  file: AgentFileInfo["permission"]
  draft: Record<string, PermissionChoice>
  servers: readonly string[]
  onChange: (tool: string, choice: PermissionChoice) => void
}) {
  const language = useLanguage()
  const rows = () => [
    ...PERMISSION_TOOLS.map((tool) => ({ tool, label: language.t(`orchestra.agents.tool.${tool}`) })),
    ...props.servers.map((server) => ({
      tool: mcpPermission(server),
      label: language.t("orchestra.agents.tool.mcp", { server }),
    })),
  ]
  const inheritLabel = (tool: string) => {
    const action = inheritedAction(props.rules, tool, props.file?.[tool])
    if (!action) return language.t("orchestra.agents.choice.inherit")
    return language.t("orchestra.agents.choice.inheritValue", { action })
  }
  return (
    <div class="mx-table">
      <For each={rows()}>
        {(row) => (
          <div class="mx-row">
            <div class="mx-grow">
              <strong id={`agents-tool-${row.tool}`}>
                <bdi>{row.label}</bdi>
              </strong>
            </div>
            <select
              name={`perm-${row.tool}`}
              class="mx-search"
              aria-labelledby={`agents-tool-${row.tool}`}
              onChange={(event) => props.onChange(row.tool, event.currentTarget.value as PermissionChoice)}
            >
              <option value="inherit" selected={props.draft[row.tool] === "inherit"}>
                {inheritLabel(row.tool)}
              </option>
              <Show when={typeof props.file?.[row.tool] === "object"}>
                <option value="custom" selected={props.draft[row.tool] === "custom"}>
                  {language.t("orchestra.agents.choice.custom")}
                </option>
              </Show>
              <For each={["allow", "ask", "deny"] as const}>
                {(action) => (
                  <option value={action} selected={props.draft[row.tool] === action}>
                    {language.t(`orchestra.agents.action.${action}`)}
                  </option>
                )}
              </For>
            </select>
          </div>
        )}
      </For>
    </div>
  )
}
