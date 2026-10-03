import { For, Show, createEffect, createMemo, createSignal, createUniqueId, onCleanup } from "solid-js"
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
import { createTasksData, live, summarizeTasks, type TasksData, type TasksItem } from "./tasks-data"

type StopState = "pending" | "failed"

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
          {item().headline || language.t("session.tasks.subagent")}
          <Show when={item().nested}>
            <span class="text-text-weak"> (+{item().nested})</span>
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
          <span data-slot="task-time" class="text-12-mono text-text-weaker">
            {time()}
          </span>
          <Show when={item().agent}>
            <span>
              {" · "}
              <span style={{ color: "var(--text-interactive-base)" }}>@{item().agent}</span>
            </span>
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
                  <span class="font-mono text-text-base">{stats().model}</span>
                </div>
              </Show>
              <Show when={stats().agent}>
                <div class="flex items-center gap-1">
                  <span class="text-text-weaker">{language.t("session.tasks.stats.agent")}:</span>
                  <span class="font-mono text-text-base">{stats().agent}</span>
                </div>
              </Show>
              <div data-slot="task-stat-tools" class="flex items-center gap-1">
                <span class="text-text-weaker">{language.t("session.tasks.stats.tools")}:</span>
                <span class="font-mono text-text-base">{count(stats().toolCalls)}</span>
              </div>
              <Show when={(stats().fails ?? 0) > 0}>
                <div class="flex items-center gap-1" style={{ color: "var(--v2-state-fg-danger)" }}>
                  <span class="text-text-weaker">{language.t("session.tasks.stats.fails")}:</span>
                  <span class="font-mono text-text-base">{count(stats().fails)}</span>
                </div>
              </Show>
              <Show when={stats().fails === 0 && (stats().toolCalls ?? 0) > 0}>
                <div class="flex items-center gap-1" style={{ color: "var(--v2-state-fg-success)" }}>
                  <span class="text-text-weaker">{language.t("session.tasks.stats.fails")}:</span>
                  <span class="font-mono text-text-base">{count(0)}</span>
                </div>
              </Show>
              <div data-slot="task-stat-tokens" class="flex items-center gap-1">
                <span class="text-text-weaker">{language.t("session.tasks.stats.tokens")}:</span>
                <span class="font-mono text-text-base">
                  <Show when={stats().tokens} fallback={unknown()}>
                    {(tokens) => `↓${count(tokens().input)} ↑${count(tokens().output)}`}
                  </Show>
                </span>
              </div>
              <div data-slot="task-stat-cost" class="flex items-center gap-1">
                <span class="text-text-weaker">{language.t("session.tasks.stats.cost")}:</span>
                <span class="font-mono text-text-base">{money(stats().cost)}</span>
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
    </div>
  )
}

/** Expansion of the cockpit's Tasks card; the session owner keeps it so commands can open the detail. */
export type TasksSummary = { expanded: () => boolean; setExpanded: (value: boolean) => void }

export function TasksPanel(props: { data?: TasksData; summary?: TasksSummary } = {}) {
  const language = useLanguage()
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const navigate = useNavigate()
  // Views mounted beside each other read the projection their session owner created.
  const items = (props.data ?? createTasksData()).items
  const [dismissed, setDismissed] = createSignal<Set<string>>(new Set())
  const [stops, setStops] = createStore<Record<string, StopState | undefined>>({})
  const [tick, setTick] = createSignal(0)
  const listID = createUniqueId()

  // Elapsed-time ticker exists only while live work is present: no timer,
  // no re-render churn, nothing retained when the panel is idle.
  createEffect(() => {
    if (items().running.length === 0) return
    const timer = setInterval(() => setTick((t) => t + 1), 1000)
    onCleanup(() => clearInterval(timer))
  })

  const visible = createMemo(() => {
    const gone = dismissed()
    return {
      running: items().running,
      finished: items().finished.filter((t) => !gone.has(t.key)),
    }
  })
  const summary = createMemo(() => summarizeTasks(visible()))
  const expanded = () => !props.summary || props.summary.expanded()

  // Agent work opens its child session on the server that owns it; shell work lives in this session.
  const openItem = (item: TasksItem) => {
    navigate(sessionHref(ServerConnection.key(serverSDK().server), item.childId ?? item.sessionId))
  }

  // Stop interrupts the child session only — never the parent — and keeps the
  // outcome visible: pending while in flight, failed with retry on rejection.
  const stopItem = (item: TasksItem) => {
    const sessionID = item.childId
    if (!sessionID || stops[item.key] === "pending") return
    setStops(item.key, "pending")
    sdk()
      .api.session.interrupt({ sessionID })
      .then(
        () => setStops(item.key, undefined),
        () => setStops(item.key, "failed"),
      )
  }

  const dismissItem = (item: TasksItem) => {
    setDismissed((prev) => new Set(prev).add(item.key))
  }

  const row = (item: TasksItem, compact = false) => (
    <TaskRow
      item={item}
      tick={tick()}
      compact={compact}
      stop={stops[item.key]}
      onOpen={openItem}
      onStop={stopItem}
      onDismiss={dismissItem}
    />
  )

  return (
    <div
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
                  : `${language.t("orchestra.common.viewAll")} (${summary().total})`}
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
              <p data-slot="tasks-empty">{language.t("session.tasks.empty")}</p>
            </Show>
          }
        >
          <Show when={expanded()} fallback={<For each={summary().rows}>{(item) => row(item, true)}</For>}>
            <Show when={visible().running.length > 0}>
              <div data-slot="task-section" class="text-12-medium text-text-weak px-1 pb-1 pt-2">
                {language.t("session.tasks.running")}
              </div>
              <For each={visible().running}>{(item) => row(item)}</For>
            </Show>
            <Show when={visible().finished.length > 0}>
              <div data-slot="task-section" class="text-12-medium text-text-weak px-1 pb-1 pt-2">
                {language.t("orchestra.tasks.finished")}
              </div>
              <For each={visible().finished}>{(item) => row(item)}</For>
            </Show>
          </Show>
        </Show>
      </div>
    </div>
  )
}
