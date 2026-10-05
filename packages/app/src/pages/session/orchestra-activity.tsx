import { For, Show, createMemo, createUniqueId, type Accessor } from "solid-js"
import { Dynamic } from "solid-js/web"
import { Icon } from "@opencode-ai/ui/icon"
import { useJanitor } from "@/context/janitor"
import { useLanguage } from "@/context/language"
import { ServerConnection } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { deriveActivity, type ActivityItem } from "./orchestra-activity-data"
import type { DockSnapshot } from "./orchestra-dock-snapshot"
import type { TasksData, TasksItem } from "./tasks-data"
import { taskStateLabel } from "./tasks-panel"
import { OrchestraCockpitList } from "./orchestra-cockpit-list"

const summaryRows = 4

const dockStateLabel = {
  restoring: "orchestra.dock.loading",
  failed: "orchestra.dock.loadFailed",
  "no-tabs": "orchestra.activity.dock.noTabs",
  ready: "orchestra.activity.dock.ready",
  loading: "orchestra.activity.dock.loading",
  crashed: "orchestra.activity.dock.crashed",
  "navigation-error": "orchestra.dock.connection.title",
} as const

const scopeLabel = {
  session: "orchestra.activity.session",
  window: "orchestra.activity.window",
  server: "orchestra.activity.server",
} as const

const icon = { agent: "task", shell: "console", dock: "window-cursor", janitor: "shield" } as const

// Current and recent work this session and window have already loaded, typed by source. It reads the
// session's Tasks projection, the Dock controller's snapshot and the Janitor report already in memory.
export function OrchestraActivity(props: {
  tasks: TasksData
  dock: () => DockSnapshot | undefined
  expanded: () => boolean
  setExpanded: (value: boolean) => void
  agents: boolean
  setAgents: (value: boolean) => void
  onOpenTask: (task: TasksItem) => void
  onShowBrowser: (dock: DockSnapshot) => void
}) {
  const language = useLanguage()
  const janitor = useJanitor()
  const serverSDK = useServerSDK()
  const listID = createUniqueId()
  const items = createMemo(() =>
    deriveActivity({
      tasks: props.tasks.items(),
      dock: props.dock(),
      janitor: { report: janitor.store.report, source: janitor.store.source },
      server: ServerConnection.key(serverSDK().server),
    }),
  )
  const filtered = createMemo(() => (props.agents ? items().filter((item) => item.kind === "agent") : items()))
  const shown = createMemo(() => (props.expanded() ? filtered() : filtered().slice(0, summaryRows)))
  const rows = createMemo(() => new Map((shown().length > 30 ? [] : shown()).map((item) => [item.key, item] as const)))
  const observed = createMemo(() => filtered().some((item) => item.kind !== "janitor" || item.findings !== undefined))

  const kind = (item: ActivityItem) => {
    if (item.kind === "agent") return language.t("session.tasks.kind.agent")
    if (item.kind === "shell") return language.t("session.tasks.kind.shell")
    if (item.kind === "dock") return language.t("orchestra.nav.dock")
    return language.t("janitor.report.title")
  }
  const title = (item: ActivityItem) => {
    if (item.kind === "dock") return item.dock.title
    if (item.kind === "janitor") return undefined
    return item.task.headline || language.t("session.tasks.subagent")
  }
  const state = (item: ActivityItem) => {
    if (item.kind === "dock") return language.t(dockStateLabel[item.dock.state])
    if (item.kind === "janitor")
      return item.findings === undefined
        ? language.t("orchestra.activity.noSnapshot")
        : language.plural("janitor.notify.title", item.findings)
    return language.t(taskStateLabel[item.task.state])
  }
  const action = (item: ActivityItem) => {
    if (item.kind === "dock") return item.dock.tab ? () => props.onShowBrowser(item.dock) : undefined
    if (item.kind === "janitor")
      return item.findings === undefined
        ? undefined
        : () => {
            if (items().includes(item) && janitor.store.source === ServerConnection.key(serverSDK().server))
              janitor.expand()
          }
    return () => props.onOpenTask(item.task)
  }
  const row = (item: Accessor<ActivityItem>) => (
    <Dynamic
      component={action(item()) ? "button" : "div"}
      type={action(item()) ? "button" : undefined}
      data-slot="activity-row"
      data-kind={item().kind}
      data-attention={item().rank === 0 ? "" : undefined}
      onClick={() => action(item())?.()}
    >
      <span data-slot="activity-mark">
        <Icon name={icon[item().kind]} size="small" />
      </span>
      <span data-slot="activity-label" title={[kind(item()), title(item())].filter(Boolean).join(" · ")}>
        <span data-slot="activity-kind">{kind(item())}</span>
        <Show when={title(item())}>{(text) => <bdi data-slot="activity-name">{text()}</bdi>}</Show>
      </span>
      <span data-slot="activity-meta">
        {language.t(scopeLabel[item().scope])} · {state(item())}
      </span>
    </Dynamic>
  )

  return (
    <section data-component="orchestra-activity" aria-labelledby={`${listID}-title`}>
      <div data-slot="activity-header">
        <h2 id={`${listID}-title`} data-slot="activity-title">
          {language.t("orchestra.activity.title")}
        </h2>
        <Show when={filtered().length > summaryRows}>
          <button
            type="button"
            data-slot="activity-view-all"
            aria-expanded={props.expanded()}
            aria-controls={listID}
            onClick={() => props.setExpanded(!props.expanded())}
          >
            {props.expanded()
              ? language.t("orchestra.common.showLess")
              : language.t("orchestra.common.viewAllCount", { count: filtered().length })}
          </button>
        </Show>
      </div>
      <div data-slot="activity-filter" role="group" aria-label={language.t("orchestra.activity.filter")}>
        <button type="button" aria-pressed={!props.agents} onClick={() => props.setAgents(false)}>
          {language.t("orchestra.activity.all")}
        </button>
        <button type="button" aria-pressed={props.agents} onClick={() => props.setAgents(true)}>
          {language.t("orchestra.activity.agents")}
        </button>
      </div>
      <Show when={!observed()}>
        <div data-slot="activity-empty" role="status">
          <strong>{language.t(props.tasks.ready() ? "orchestra.activity.empty.title" : "common.loading")}</strong>
          <Show when={props.tasks.ready()}>
            <span>{language.t("orchestra.activity.empty.body")}</span>
          </Show>
        </div>
      </Show>
      <div id={listID}>
        <Show
          when={shown().length > 30}
          fallback={
            <ul data-slot="activity-list">
              <For each={[...rows().keys()]}>
                {(key) => <Show when={rows().get(key)}>{(item) => <li>{row(item)}</li>}</Show>}
              </For>
            </ul>
          }
        >
          <OrchestraCockpitList items={shown()} estimate={40} label={language.t("orchestra.activity.title")}>
            {row}
          </OrchestraCockpitList>
        </Show>
      </div>
    </section>
  )
}
