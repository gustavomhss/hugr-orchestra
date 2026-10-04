import { For, Show, createEffect, createMemo, createUniqueId, on, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { useNavigate } from "@solidjs/router"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Mark } from "@opencode-ai/ui/logo"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { ServerConnection } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { sessionHref } from "@/utils/session-route"
import {
  createTaskStops,
  createTasksData,
  live,
  summarizeTasks,
  type StopState,
  type TasksData,
  type TasksItem,
} from "./tasks-data"
import { OrchestraCockpitList } from "./orchestra-cockpit-list"

export const taskStateLabel = {
  running: "session.tasks.state.running",
  "needs-input": "session.tasks.state.needsInput",
  completed: "session.tasks.state.completed",
  error: "session.tasks.state.failed",
  interrupted: "ui.message.interrupted",
  unknown: "orchestra.tasks.state.unknown",
} as const

const stateColor = {
  "needs-input": "var(--v2-state-fg-warning)",
  completed: "var(--v2-state-fg-success)",
  error: "var(--v2-state-fg-danger)",
  interrupted: "var(--text-weak)",
  unknown: "transparent",
} as const

function fmtElapsed(start: number): string {
  const s = Math.max(0, Math.floor((Date.now() - start) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function fmtDuration(start: number, end: number): string {
  const s = Math.max(0, Math.floor((end - start) / 1000))
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`
}

function StateMark(props: { state: TasksItem["state"] }) {
  return (
    <Show when={props.state !== "running"} fallback={<span data-slot="titlebar-update-loader" aria-hidden />}>
      <span
        aria-hidden
        class="inline-block size-2 shrink-0 rounded-full"
        style={{
          background: props.state === "running" ? undefined : stateColor[props.state],
          // An unknown outcome reads as a hollow mark, never as a finished one.
          border: props.state === "unknown" ? "1px solid var(--text-weaker)" : undefined,
          "box-shadow": props.state === "needs-input" ? "0 0 6px var(--v2-state-fg-warning)" : "none",
          margin: "2px",
        }}
      />
    </Show>
  )
}

function TaskRow(props: {
  item: TasksItem
  tick: number
  compact?: boolean
  stop?: StopState
  onOpen: (item: TasksItem) => void
  onStop: (item: TasksItem) => void
  onDismiss: (item: TasksItem) => void
}) {
  const language = useLanguage()
  const id = createUniqueId()
  // Rows can receive an updated item for the same key; read it through props, never a snapshot.
  const item = () => props.item
  const active = () => live(item())
  const unknown = () => language.t("common.unknown")
  const time = () => {
    void props.tick
    const start = item().startTime
    const end = item().endTime
    if (active()) return start === undefined ? unknown() : fmtElapsed(start)
    if (start === undefined || end === undefined) return unknown()
    return fmtDuration(start, end)
  }
  const count = (value: number | undefined) => (value === undefined ? unknown() : value.toLocaleString(language.intl()))
  const money = (value: number | undefined) => (value === undefined ? unknown() : `$${value.toFixed(4)}`)

  return (
    <div
      data-slot="task-row"
      data-state={item().state}
      data-kind={item().kind}
      role="button"
      // The row's content (headline, state, time) stays its name; where a shell row leads is its description.
      aria-describedby={
        item().kind !== "shell" ? undefined : item().originUserMessageID ? `${id}-open` : `${id}-open ${id}-source`
      }
      title={
        item().kind === "shell" && !item().originUserMessageID
          ? language.t("orchestra.tasks.sourceMissing")
          : item().headline
      }
      tabIndex={0}
      onClick={() => props.onOpen(item())}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          props.onOpen(item())
        }
      }}
      data-compact={props.compact ? "" : undefined}
      class="flex min-h-7 shrink-0 cursor-pointer items-start gap-2 rounded-md border border-transparent px-3 py-2"
      classList={{
        "bg-surface-raised-base": active(),
        "border-border-weaker-base": active(),
        "opacity-75 hover:opacity-100": !active(),
      }}
    >
      <div data-slot="task-mark" class="mt-0.5 flex">
        <StateMark state={item().state} />
      </div>
      <div data-slot="task-main" class="min-w-0 flex-1">
        <div
          data-slot="task-title"
          class="truncate text-strong"
          style={{ "font-size": "13px", "font-weight": "400", "line-height": "130%", "letter-spacing": "-0.04px" }}
        >
          <bdi dir="auto">{item().headline || language.t("session.tasks.subagent")}</bdi>
          <Show when={item().nested}>
            <bdi dir="ltr" class="text-text-weak">
              {" "}
              (+{item().nested})
            </bdi>
          </Show>
        </div>
        <div data-slot="task-meta" class="text-12-regular text-text-weak mt-[3px] truncate tabular-nums">
          {item().kind === "agent" ? language.t("session.tasks.kind.agent") : language.t("session.tasks.kind.shell")}
          {" · "}
          <span
            data-slot="task-state"
            style={{ color: item().state === "needs-input" ? "var(--v2-state-fg-warning)" : undefined }}
          >
            {language.t(taskStateLabel[item().state])}
          </span>
          {" · "}
          <bdi dir="ltr" data-slot="task-time" class="text-12-mono text-text-weaker">
            {time()}
          </bdi>
          <Show when={item().agent}>
            <span>
              {" · "}
              <bdi dir="auto" style={{ color: "var(--text-interactive-base)" }}>
                @{item().agent}
              </bdi>
            </span>
          </Show>
          <Show when={props.compact && item().stats?.model}>
            {(model) => (
              <span>
                {" · "}
                <bdi dir="auto" title={model()}>
                  {model()}
                </bdi>
              </span>
            )}
          </Show>
        </div>
        <Show when={active() && props.stop}>
          {(stop) => (
            <div
              data-slot="task-stop-status"
              data-status={stop()}
              role={stop() === "failed" ? "alert" : "status"}
              class="text-12-regular mt-2 flex items-center gap-2"
              style={{ color: stop() === "failed" ? "var(--v2-state-fg-danger)" : "var(--text-weak)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <span>{language.t(stop() === "failed" ? "orchestra.tasks.stopFailed" : "orchestra.tasks.stopping")}</span>
              <Show when={stop() === "failed"}>
                <ButtonV2 size="small" variant="outline" onClick={() => props.onStop(item())}>
                  {language.t("orchestra.tasks.retry")}
                </ButtonV2>
              </Show>
            </div>
          )}
        </Show>
        <Show when={!props.compact && item().stats}>
          {(stats) => (
            <div
              data-slot="task-stats"
              class="text-12-regular text-text-weak mt-3 flex flex-wrap gap-4 border-t border-border-weaker-base pt-3"
            >
              <Show when={stats().model}>
                <div class="flex items-center gap-1">
                  <span class="text-text-weaker">{language.t("session.tasks.stats.model")}:</span>
                  <bdi dir="auto" class="font-mono text-text-base">
                    {stats().model}
                  </bdi>
                </div>
              </Show>
              <Show when={stats().agent}>
                <div class="flex items-center gap-1">
                  <span class="text-text-weaker">{language.t("session.tasks.stats.agent")}:</span>
                  <bdi dir="auto" class="font-mono text-text-base">
                    {stats().agent}
                  </bdi>
                </div>
              </Show>
              <div data-slot="task-stat-tools" class="flex items-center gap-1">
                <span class="text-text-weaker">{language.t("session.tasks.stats.tools")}:</span>
                <bdi dir="ltr" class="font-mono text-text-base">
                  {count(stats().toolCalls)}
                </bdi>
              </div>
              <Show when={(stats().fails ?? 0) > 0}>
                <div class="flex items-center gap-1" style={{ color: "var(--v2-state-fg-danger)" }}>
                  <span class="text-text-weaker">{language.t("session.tasks.stats.fails")}:</span>
                  <bdi dir="ltr" class="font-mono text-text-base">
                    {count(stats().fails)}
                  </bdi>
                </div>
              </Show>
              <Show when={stats().fails === 0 && (stats().toolCalls ?? 0) > 0}>
                <div class="flex items-center gap-1" style={{ color: "var(--v2-state-fg-success)" }}>
                  <span class="text-text-weaker">{language.t("session.tasks.stats.fails")}:</span>
                  <bdi dir="ltr" class="font-mono text-text-base">
                    {count(0)}
                  </bdi>
                </div>
              </Show>
              <div data-slot="task-stat-tokens" class="flex items-center gap-1">
                <span class="text-text-weaker">{language.t("session.tasks.stats.tokens")}:</span>
                <bdi dir="ltr" class="font-mono text-text-base">
                  <Show when={stats().tokens} fallback={unknown()}>
                    {(tokens) => `↓${count(tokens().input)} ↑${count(tokens().output)}`}
                  </Show>
                </bdi>
              </div>
              <div data-slot="task-stat-cost" class="flex items-center gap-1">
                <span class="text-text-weaker">{language.t("session.tasks.stats.cost")}:</span>
                <bdi dir="ltr" class="font-mono text-text-base">
                  {money(stats().cost)}
                </bdi>
              </div>
            </div>
          )}
        </Show>
      </div>
      <div data-slot="task-actions" class="flex shrink-0" onClick={(e) => e.stopPropagation()}>
        <Show
          when={active()}
          fallback={
            <IconButton
              icon="close-small"
              variant="ghost"
              class="h-5 w-5"
              onClick={() => props.onDismiss(item())}
              aria-label={language.t("session.tasks.dismiss")}
              title={language.t("session.tasks.dismiss")}
            />
          }
        >
          <Show when={item().childId}>
            <IconButton
              icon="stop"
              variant="ghost"
              class="h-5 w-5"
              disabled={props.stop === "pending"}
              aria-busy={props.stop === "pending"}
              onClick={() => props.onStop(item())}
              aria-label={language.t("session.tasks.stop")}
              title={language.t(props.stop === "pending" ? "orchestra.tasks.stopping" : "session.tasks.stop")}
            />
          </Show>
        </Show>
      </div>
      <Show when={item().kind === "shell"}>
        <span id={`${id}-open`} hidden>
          {language.t(item().originUserMessageID ? "orchestra.tasks.openExecution" : "orchestra.tasks.openSession")}
        </span>
        <Show when={!item().originUserMessageID}>
          <span id={`${id}-source`} hidden>
            {language.t("orchestra.tasks.sourceMissing")}
          </span>
        </Show>
      </Show>
    </div>
  )
}

/** Expansion of the cockpit's Tasks card; the session owner keeps it so commands can open the detail. */
export type TasksSummary = { expanded: () => boolean; setExpanded: (value: boolean) => void }

export function TasksPanel(
  props: { data?: TasksData; summary?: TasksSummary; onOpenItem?: (item: TasksItem) => void } = {},
) {
  const language = useLanguage()
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const navigate = useNavigate()
  // Views mounted beside each other read the projection their session owner created.
  const data = props.data ?? createTasksData()
  const items = data.items
  const [view, setView] = createStore({
    dismissed: [] as string[],
    tick: 0,
    visible: false,
    foreground: !document.hidden,
  })
  const stops = createTaskStops((sessionID) => sdk().api.session.interrupt({ sessionID }))
  const listID = createUniqueId()
  let root: HTMLDivElement | undefined

  onMount(() => {
    const observer = new IntersectionObserver(([entry]) => setView("visible", entry.isIntersecting))
    if (root) observer.observe(root)
    const visible = () => setView("foreground", !document.hidden)
    document.addEventListener("visibilitychange", visible)
    onCleanup(() => {
      observer.disconnect()
      document.removeEventListener("visibilitychange", visible)
    })
  })

  // Elapsed-time ticker exists only while live work is present: no timer,
  // no re-render churn, nothing retained when the panel is idle.
  createEffect(() => {
    if (!view.visible || !view.foreground || items().running.length === 0) return
    const timer = setInterval(() => setView("tick", (t) => t + 1), 1000)
    onCleanup(() => clearInterval(timer))
  })

  const visible = createMemo(() => {
    return {
      running: items().running,
      finished: items().finished.filter((t) => !view.dismissed.includes(t.key)),
    }
  })
  const summary = createMemo(() => summarizeTasks(visible()))
  // The cockpit counts every finished task, so its detail lists every one, failures first. The side
  // panel shows no counts and has no virtual list, so it keeps only the 12 newest.
  const finished = createMemo(() => (props.summary ? summary().finished : summary().recent))
  const rows = createMemo(
    () => new Map([...visible().running, ...visible().finished].map((item) => [item.key, item] as const)),
  )
  const expanded = () => !props.summary || props.summary.expanded()
  createEffect(
    on(
      () => summary().needsInput,
      (next, previous) => {
        if (next > 0 && !previous) props.summary?.setExpanded(true)
      },
    ),
  )

  // Agent work opens its child session on the server that owns it; shell work lives in this session.
  const openItem = (item: TasksItem) => {
    if (props.onOpenItem) return props.onOpenItem(item)
    if (![...items().running, ...items().finished].includes(item)) return
    navigate(sessionHref(ServerConnection.key(serverSDK().server), item.childId ?? item.sessionId))
  }

  const stopItem = (item: TasksItem) => {
    if (items().running.includes(item)) stops.stop(item)
  }

  const dismissItem = (item: TasksItem) => {
    if (live(item)) return
    setView("dismissed", (prev) => [
      ...prev.filter((key) => items().finished.some((item) => item.key === key)),
      item.key,
    ])
  }

  const row = (key: string, compact = false) => (
    <Show when={rows().get(key)}>
      {(item) => (
        <TaskRow
          item={item()}
          tick={view.tick}
          compact={compact}
          stop={stops.state(key)}
          onOpen={openItem}
          onStop={stopItem}
          onDismiss={dismissItem}
        />
      )}
    </Show>
  )

  // A cockpit section past 30 rows mounts only the rows in view; the side panel scrolls as a whole.
  const TaskList = (list: { items: TasksItem[]; label: string }) => (
    <Show
      when={props.summary && list.items.length > 30}
      fallback={<For each={list.items.map((item) => item.key)}>{(key) => row(key)}</For>}
    >
      <OrchestraCockpitList items={list.items} estimate={100} label={list.label}>
        {(item) => (
          <TaskRow
            item={item()}
            tick={view.tick}
            stop={stops.state(item().key)}
            onOpen={openItem}
            onStop={stopItem}
            onDismiss={dismissItem}
          />
        )}
      </OrchestraCockpitList>
    </Show>
  )

  return (
    <div
      ref={root}
      data-component="tasks-panel"
      data-variant={props.summary ? "summary" : undefined}
      data-attention={summary().needsInput > 0 ? "" : undefined}
      class="flex min-h-0 flex-col"
      classList={{ "h-full": !props.summary }}
    >
      <Show when={props.summary}>
        {(card) => (
          <div data-slot="tasks-header">
            <h2 data-slot="tasks-title">{language.t("session.tab.tasks")}</h2>
            <Show when={summary().active > 0}>
              <span data-slot="tasks-count">{language.plural("orchestra.tasks.count", summary().active)}</span>
            </Show>
            <Show when={summary().needsInput > 0}>
              <span data-slot="tasks-needs-input">
                {language.t("session.tasks.state.needsInput")} {summary().needsInput}
              </span>
            </Show>
            <Show when={!expanded() && summary().hiddenFailures > 0}>
              <button
                type="button"
                data-slot="tasks-failures"
                aria-controls={listID}
                onClick={() => card().setExpanded(true)}
              >
                {language.t("session.tasks.state.failed")} {summary().hiddenFailures}
              </button>
            </Show>
            <Show when={summary().total > 0}>
              <button
                type="button"
                data-slot="tasks-view-all"
                aria-expanded={expanded()}
                aria-controls={listID}
                onClick={() => card().setExpanded(!expanded())}
              >
                {expanded()
                  ? language.t("orchestra.common.showLess")
                  : language.t("orchestra.common.viewAllCount", { count: summary().total })}
              </button>
            </Show>
          </div>
        )}
      </Show>
      <div
        id={listID}
        data-slot="task-scroll"
        class="flex min-h-0 flex-col gap-2 px-2 py-1"
        classList={{ "flex-1 overflow-y-auto": !props.summary }}
      >
        <Show
          when={summary().total > 0}
          fallback={
            <Show
              when={props.summary}
              fallback={
                <div class="flex h-full flex-col items-center justify-center gap-6 px-6 pb-42 text-center">
                  <Mark class="w-14 opacity-10" />
                  <div class="text-14-regular text-text-weak max-w-56">{language.t("session.tasks.empty")}</div>
                </div>
              }
            >
              <p data-slot="tasks-empty" role="status" aria-busy={!data.ready()}>
                {language.t(data.ready() ? "session.tasks.empty" : "common.loading")}
              </p>
            </Show>
          }
        >
          <Show
            when={expanded()}
            fallback={<For each={summary().rows.map((item) => item.key)}>{(key) => row(key, true)}</For>}
          >
            <Show when={summary().running.length > 0}>
              <div data-slot="task-section" class="text-12-medium text-text-weak px-1 pb-1 pt-2">
                {language.t("session.tasks.running")}
              </div>
              <TaskList items={summary().running} label={language.t("session.tasks.running")} />
            </Show>
            <Show when={finished().length > 0}>
              <div data-slot="task-section" class="text-12-medium text-text-weak px-1 pb-1 pt-2">
                {props.summary
                  ? language.t("orchestra.tasks.recent", { count: finished().length })
                  : language.t("orchestra.tasks.finished")}
              </div>
              <TaskList items={finished()} label={language.t("orchestra.tasks.recent", { count: finished().length })} />
            </Show>
          </Show>
        </Show>
      </div>
    </div>
  )
}
