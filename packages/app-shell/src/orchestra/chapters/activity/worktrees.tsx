import { For, Show, createMemo, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { matchingWorktrees, readWorktrees, type WorktreeRecord } from "./inventory"

const columns = ["path", "project", "owner", "logical", "unique", "proof", "age"] as const

export function ActivityWorktrees(props: { query: string }) {
  const language = useLanguage()
  const sdk = useServerSDK()
  const [state, setState] = createStore({
    rows: undefined as WorktreeRecord[] | undefined,
    busy: false,
    failed: false,
    now: Date.now(),
  })
  const controller = new AbortController()
  const shown = createMemo(() => matchingWorktrees(state.rows ?? [], props.query))

  async function refresh() {
    if (state.busy || controller.signal.aborted) return
    setState("busy", true)
    await sdk()
      .ready.then(() => readWorktrees(sdk().api.project, controller.signal))
      .then(
        (rows) => {
          if (!controller.signal.aborted) setState({ rows, failed: false, now: Date.now() })
        },
        (error: unknown) => {
          if (controller.signal.aborted) return
          console.error("[activity] worktree registry read failed", error)
          // Keep the last complete sample and its original timestamps visible after a failed refresh.
          setState("failed", true)
        },
      )
    if (!controller.signal.aborted) setState("busy", false)
  }

  onMount(() => {
    void refresh()
    const poll = setInterval(() => {
      if (!document.hidden) void refresh()
    }, 10_000)
    const age = setInterval(() => setState("now", Date.now()), 1000)
    onCleanup(() => {
      clearInterval(poll)
      clearInterval(age)
    })
  })
  onCleanup(() => controller.abort())

  return (
    <div aria-busy={state.busy}>
      <div class="activity-section-heading">
        <p class="mx-note">{language.t("orchestra.monitor.registry")}</p>
        <button type="button" class="mx-btn" disabled={state.busy} onClick={() => void refresh()}>
          {language.t("orchestra.monitor.refresh")}
        </button>
      </div>
      <Show when={state.failed}>
        <p class="activity-error" role="alert">
          {language.t("orchestra.monitor.loadFailed")}
        </p>
      </Show>
      <Show
        when={state.rows !== undefined}
        fallback={
          <div class="mx-empty" role="status">
            <strong>{language.t("orchestra.monitor.registryUnread")}</strong>
          </div>
        }
      >
        <p class="mx-note" role="status">
          {language.t("orchestra.monitor.registeredCount", { count: state.rows?.length ?? 0 })}
        </p>
        <Show
          when={shown().length > 0}
          fallback={
            <div class="mx-empty" role="status">
              <strong>
                {language.t(props.query.trim() ? "orchestra.monitor.filterMiss" : "orchestra.monitor.noRegistered")}
              </strong>
            </div>
          }
        >
          <div class="activity-table-scroll">
            <table class="activity-table">
              <thead>
                <tr>
                  <For each={columns}>
                    {(column) => <th scope="col">{language.t(`orchestra.monitor.${column}`)}</th>}
                  </For>
                </tr>
              </thead>
              <tbody>
                <For each={shown()}>
                  {(row) => (
                    <tr>
                      <td class="activity-path" title={row.directory}>
                        <code>{row.directory}</code>
                      </td>
                      <td title={row.project}>{row.project}</td>
                      <td>{row.owner}</td>
                      <td>{language.t("orchestra.monitor.unread")}</td>
                      <td>{language.t("orchestra.monitor.notCollapsed")}</td>
                      <td>{language.t("orchestra.monitor.unproved")}</td>
                      <td>
                        {language.t("orchestra.monitor.seconds", {
                          count: Math.max(0, Math.floor((state.now - row.sampledAt) / 1000)),
                        })}
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>
      <p class="mx-note">{language.t("orchestra.monitor.registryLimit")}</p>
    </div>
  )
}
