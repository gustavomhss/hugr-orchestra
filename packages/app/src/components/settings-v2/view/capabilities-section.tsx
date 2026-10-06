import { useNavigate } from "@solidjs/router"
import { createMemo, createSignal, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { ServerConnection } from "@/context/server"
import { useServerSync } from "@/context/server-sync"
import { useTabs } from "@/context/tabs"
import { agentRoster } from "@/orchestra/chapters/agents-roster"
import { MxBadge, MxToggle } from "@/orchestra/chapters/kit"
import { showToast } from "@/utils/toast"
import { SettingsSec } from "./settings-sec"

// Marks copied from the mock's capability icons.
const marks = {
  agent: "m8 1 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z",
  mcp: "M5 2v3M11 2v3M3 5h10v3a5 5 0 0 1-10 0V5ZM8 13v2",
}

function Mark(props: { path: string }) {
  return (
    <span class="mx-mark">
      <svg class="ic" viewBox="0 0 16 16" aria-hidden="true">
        <path d={props.path} />
      </svg>
    </span>
  )
}

// Agent configuration and creation live on the Agents page; Settings lists the roster and opens chats.
export function AgentsSection(props: { server: ServerConnection.Any; directory: string }) {
  const language = useLanguage()
  const serverSync = useServerSync()
  const tabs = useTabs()
  const navigate = useNavigate()
  const [opening, setOpening] = createSignal(false)
  const store = () => serverSync().child(props.directory)[0]
  const agents = createMemo(() => agentRoster(store().agent))
  const openChat = () => {
    setOpening(true)
    void tabs
      // Every desktop session runs on Maestro (#31), so the draft carries no agent choice.
      .newDraft({ server: ServerConnection.key(props.server), directory: props.directory })
      .catch((err: unknown) => {
        setOpening(false)
        showToast({
          title: language.t("common.requestFailed"),
          description: err instanceof Error ? err.message : String(err),
        })
      })
  }

  return (
    <SettingsSec
      title={language.t("settings.agents.title")}
      description={language.t("orchestra.settings.agents.description")}
      action={
        <button type="button" class="mx-btn" onClick={() => navigate("/orchestra/agents")}>
          {language.t("orchestra.settings.agents.create")}
        </button>
      }
    >
      <Show
        when={agents().length > 0}
        fallback={
          <div class="mx-empty">
            {language.t(
              store().load.agent === "pending"
                ? "orchestra.settings.agents.loading"
                : "orchestra.settings.agents.empty",
            )}
          </div>
        }
      >
        <div class="mx-grid">
          <For each={agents()}>
            {(item) => (
              <article class="agent mx-card" data-mx-card data-agent={item.agent.name}>
                <div class="agent-top mx-card-top">
                  <Mark path={marks.agent} />
                  <b>{item.agent.name}</b>
                  <span class="agent-role">{item.agent.mode}</span>
                </div>
                <p class="agent-desc">
                  {item.agent.description ?? language.t("orchestra.settings.agents.noDescription")}
                </p>
                <div class="mx-meta">
                  <MxBadge>{item.agent.model?.modelID ?? language.t("orchestra.settings.agents.defaultModel")}</MxBadge>
                  <Show when={item.agent.steps}>
                    {(steps) => <MxBadge>{language.t("orchestra.settings.agents.steps", { count: steps() })}</MxBadge>}
                  </Show>
                  <MxBadge tone="good">{language.t("orchestra.settings.agents.available")}</MxBadge>
                </div>
                <footer class="mx-card-foot">
                  <button type="button" class="mx-btn" onClick={() => navigate("/orchestra/agents")}>
                    {language.t("orchestra.settings.configure")}
                  </button>
                  <button
                    type="button"
                    class="mx-btn"
                    disabled={!item.chat || opening() || !tabs.ready()}
                    title={item.chat ? undefined : language.t("orchestra.settings.agents.subagentNote")}
                    onClick={() => openChat()}
                  >
                    {language.t("orchestra.settings.agents.openChat")}
                  </button>
                </footer>
              </article>
            )}
          </For>
        </div>
      </Show>
    </SettingsSec>
  )
}

const mcpStatus = {
  connected: "orchestra.settings.mcp.status.connected",
  failed: "orchestra.settings.mcp.status.failed",
  needs_auth: "orchestra.settings.mcp.status.needsAuth",
  needs_client_registration: "orchestra.settings.mcp.status.needsRegistration",
  disabled: "orchestra.settings.mcp.status.disabled",
  pending: "orchestra.settings.mcp.status.pending",
} as const

// Server editing and tool inspection live on the MCP page; Settings lists servers and toggles them.
export function McpSection(props: { directory: string }) {
  const language = useLanguage()
  const serverSync = useServerSync()
  const navigate = useNavigate()
  const [pending, setPending] = createStore<Record<string, boolean>>({})
  const store = () => serverSync().child(props.directory, { mcp: true })[0]
  const servers = createMemo(() => Object.entries(store().mcp).sort(([a], [b]) => a.localeCompare(b)))
  const config = (name: string) => {
    const entry = store().config.mcp?.[name]
    if (!entry || !("type" in entry)) return
    if (entry.type === "local") return { transport: "stdio", endpoint: entry.command.join(" ") }
    return { transport: "http", endpoint: entry.url }
  }
  const toggle = (name: string) => {
    setPending(name, true)
    void serverSync()
      .mcp.toggle(props.directory, name)
      .catch((err: unknown) =>
        showToast({
          title: language.t("common.requestFailed"),
          description: err instanceof Error ? err.message : String(err),
        }),
      )
      .finally(() => setPending(name, false))
  }
  const openPage = () => navigate("/orchestra/mcp")

  return (
    <SettingsSec
      title={language.t("settings.mcp.title")}
      description={language.t("orchestra.settings.mcp.description")}
      action={
        <button type="button" class="mx-btn" onClick={openPage}>
          {language.t("orchestra.settings.mcp.add")}
        </button>
      }
    >
      <Show
        when={servers().length > 0}
        fallback={
          <div class="mx-empty">
            <Show when={store().mcp_ready} fallback={language.t("orchestra.settings.mcp.loading")}>
              {language.t("orchestra.settings.mcp.empty")}
              <br />
              {language.t("orchestra.settings.mcp.emptyHint")}
            </Show>
          </div>
        }
      >
        <div class="mx-grid">
          <For each={servers()}>
            {([name, status]) => (
              <article class="mx-card" data-mx-card data-mcp-name={name} data-status={status.status}>
                <div class="mx-card-top">
                  <Mark path={marks.mcp} />
                  <h3>{name}</h3>
                </div>
                <p>{config(name)?.endpoint ?? ("error" in status ? status.error : "")}</p>
                <div class="mx-meta">
                  <MxBadge
                    tone={status.status === "connected" ? "good" : status.status === "failed" ? "bad" : undefined}
                  >
                    {language.t(mcpStatus[status.status])}
                  </MxBadge>
                  <Show when={config(name)}>{(entry) => <MxBadge>{entry().transport}</MxBadge>}</Show>
                </div>
                <footer class="mx-card-foot">
                  <div>
                    <button type="button" class="mx-btn" onClick={openPage}>
                      {language.t("orchestra.settings.configure")}
                    </button>{" "}
                    <button type="button" class="mx-btn" onClick={openPage}>
                      {language.t("orchestra.settings.mcp.tools")}
                    </button>
                  </div>
                  <MxToggle
                    checked={status.status === "connected"}
                    label={language.t("orchestra.settings.mcp.enable", { name })}
                    disabled={!store().mcp_ready || status.status === "pending" || !!pending[name]}
                    onChange={() => toggle(name)}
                  />
                </footer>
              </article>
            )}
          </For>
        </div>
      </Show>
    </SettingsSec>
  )
}
