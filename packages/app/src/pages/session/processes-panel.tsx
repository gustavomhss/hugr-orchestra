import { For, Show, createEffect, createUniqueId, on, onCleanup, onMount } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import type { SessionProcess } from "@opencode-ai/sdk/v2/client"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useSessionLayout } from "./session-layout"
import {
  PROCESS_POLL_MS,
  createProcessStops,
  descendants,
  sortProcesses,
  tailLines,
  type ProcessStop,
} from "./processes-data"

function ProcessRow(props: { item: SessionProcess; stop?: ProcessStop; onStop: (id: string) => void }) {
  const language = useLanguage()
  const id = createUniqueId()
  const item = () => props.item
  const tail = () => tailLines(item().output)
  const children = () => descendants(item())

  return (
    <div
      data-slot="process-row"
      class="flex shrink-0 flex-col gap-2 rounded-md border border-border-weaker-base bg-surface-raised-base px-3 py-2"
      aria-labelledby={`${id}-title`}
      role="group"
    >
      <div class="flex items-start gap-2">
        <span data-slot="titlebar-update-loader" aria-hidden class="mt-0.5" />
        <div class="min-w-0 flex-1">
          <div
            id={`${id}-title`}
            data-slot="process-title"
            class="truncate font-mono text-strong"
            style={{ "font-size": "13px", "line-height": "130%" }}
            title={item().title}
          >
            <bdi dir="ltr">{item().title}</bdi>
          </div>
          <div data-slot="process-meta" class="text-12-regular text-text-weak mt-[3px] truncate tabular-nums">
            <bdi dir="ltr" class="text-12-mono">
              {language.t("orchestra.processes.pid", { pid: item().pid })}
            </bdi>
            <Show when={children().length > 0}>
              {" · "}
              <span>{language.t("orchestra.processes.children", { count: children().length })}</span>
            </Show>
          </div>
        </div>
        <IconButton
          icon="stop"
          variant="ghost"
          class="h-5 w-5 shrink-0"
          disabled={props.stop === "pending"}
          aria-busy={props.stop === "pending"}
          onClick={() => props.onStop(item().id)}
          aria-label={language.t("orchestra.processes.stop")}
          title={language.t(props.stop === "pending" ? "orchestra.tasks.stopping" : "orchestra.processes.stop")}
        />
      </div>
      <Show when={props.stop}>
        {(stop) => (
          <div
            data-slot="process-stop-status"
            data-status={stop()}
            role={stop() === "failed" ? "alert" : "status"}
            class="text-12-regular flex items-center gap-2"
            style={{ color: stop() === "failed" ? "var(--v2-state-fg-danger)" : "var(--text-weak)" }}
          >
            <span>
              {language.t(stop() === "failed" ? "orchestra.processes.stopFailed" : "orchestra.tasks.stopping")}
            </span>
            <Show when={stop() === "failed"}>
              <ButtonV2 size="small" variant="outline" onClick={() => props.onStop(item().id)}>
                {language.t("orchestra.tasks.retry")}
              </ButtonV2>
            </Show>
          </div>
        )}
      </Show>
      <Show
        when={tail()}
        fallback={<p class="text-12-regular text-text-weaker">{language.t("orchestra.processes.noOutput")}</p>}
      >
        <pre
          data-slot="process-output"
          aria-label={language.t("orchestra.processes.output")}
          tabIndex={0}
          class="text-12-mono text-text-weak max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-background-base px-2 py-1"
        >
          {tail()}
        </pre>
      </Show>
    </div>
  )
}

/** The rows, without data access: the panel and its story render the same component. */
export function ProcessesList(props: {
  items: readonly SessionProcess[]
  stop: (id: string) => ProcessStop | undefined
  onStop: (id: string) => void
}) {
  const language = useLanguage()
  const listID = createUniqueId()
  return (
    <Show when={props.items.length > 0}>
      <section
        data-component="processes-panel"
        aria-labelledby={`${listID}-title`}
        class="flex flex-col gap-2 px-2 py-1"
      >
        <div data-slot="task-section" class="text-12-medium text-text-weak flex items-center gap-2 px-1 pb-1 pt-2">
          <h2 id={`${listID}-title`} class="text-12-medium">
            {language.t("orchestra.processes.title")}
          </h2>
          <span class="text-text-weaker tabular-nums">{props.items.length}</span>
        </div>
        <For each={props.items.map((item) => item.id)}>
          {(id) => (
            <Show when={props.items.find((item) => item.id === id)}>
              {(item) => <ProcessRow item={item()} stop={props.stop(id)} onStop={props.onStop} />}
            </Show>
          )}
        </For>
      </section>
    </Show>
  )
}

/**
 * Background processes of the open session: polled while the panel is mounted (its tab is open) and the window is
 * visible, with a stop button per tree. Renders nothing while the session has none.
 */
export function BackgroundProcessesPanel() {
  const sdk = useSDK()
  const { params } = useSessionLayout()
  const [state, setState] = createStore({
    items: [] as SessionProcess[],
    foreground: !document.hidden,
  })

  const refresh = (sessionID: string) =>
    sdk()
      .client.session.processes({ sessionID })
      .then((result) => {
        if (params.id !== sessionID) return
        setState("items", reconcile(sortProcesses(result.data ?? []), { key: "id" }))
      })
      .catch(() => undefined)

  const stops = createProcessStops((processID) => {
    const sessionID = params.id
    if (!sessionID) return Promise.resolve()
    return sdk()
      .client.session.processStop({ sessionID, processID }, { throwOnError: true })
      .then(() => refresh(sessionID))
  })

  onMount(() => {
    const visible = () => setState("foreground", !document.hidden)
    document.addEventListener("visibilitychange", visible)
    onCleanup(() => document.removeEventListener("visibilitychange", visible))
  })

  createEffect(
    on(
      () => params.id,
      () => setState("items", []),
    ),
  )

  createEffect(() => {
    const sessionID = params.id
    if (!sessionID || !state.foreground) return
    void refresh(sessionID)
    const timer = setInterval(() => void refresh(sessionID), PROCESS_POLL_MS)
    onCleanup(() => clearInterval(timer))
  })

  return <ProcessesList items={state.items} stop={stops.state} onStop={stops.stop} />
}
