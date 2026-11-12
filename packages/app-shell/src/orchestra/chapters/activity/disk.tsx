import type { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import { For, Show, createMemo, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { readingAge } from "./reading"

const columns = ["path", "owner", "logical", "unique", "proof", "state", "age"] as const

export function ActivityDisk(props: { rootID: ActivityMonitor.DiskRootID; query: string }) {
  const language = useLanguage()
  const sdk = useServerSDK()
  const [state, setState] = createStore({
    snapshot: undefined as ActivityMonitor.DiskSnapshot | undefined,
    busy: false,
    failed: false,
    receivedAt: performance.now(),
    now: performance.now(),
  })
  const controller = new AbortController()
  const root = createMemo(() => state.snapshot?.roots.find((row) => row.id === props.rootID))
  const matches = createMemo(() => root()?.path.toLowerCase().includes(props.query.trim().toLowerCase()))
  const age = (sampledAt?: number) => {
    const value = readingAge({
      sampledAt,
      readAt: state.snapshot?.readAt ?? NaN,
      receivedAt: state.receivedAt,
      now: state.now,
    })
    return value === undefined
      ? language.t("orchestra.monitor.unread")
      : language.t("orchestra.monitor.seconds", { count: Math.floor(value / 1000) })
  }
  async function refresh(measure: boolean) {
    if (state.busy || controller.signal.aborted) return
    setState("busy", true)
    await sdk()
      .ready.then(() =>
        measure
          ? sdk().orchestra.activity.readDisk({ rootID: props.rootID }, { signal: controller.signal })
          : sdk().orchestra.activity.disk({ signal: controller.signal }),
      )
      .then(
        (snapshot) => {
          if (controller.signal.aborted) return
          const now = performance.now()
          setState({ snapshot, receivedAt: now, now, failed: false })
        },
        (error: unknown) => {
          if (controller.signal.aborted) return
          console.error("[activity] disk reading failed", error)
          setState("failed", true)
        },
      )
    if (!controller.signal.aborted) setState("busy", false)
  }
  onMount(() => {
    void refresh(false)
    const tick = setInterval(() => setState("now", performance.now()), 1000)
    onCleanup(() => clearInterval(tick))
  })
  onCleanup(() => controller.abort())

  return (
    <div aria-busy={state.busy}>
      <div class="activity-section-heading">
        <p class="mx-note">{language.t("orchestra.monitor.diskSource")}</p>
        <button type="button" class="mx-btn" disabled={state.busy} onClick={() => void refresh(true)}>
          {language.t("orchestra.monitor.measureDisk")}
        </button>
      </div>
      <Show when={state.failed}>
        <p class="activity-error" role="alert">
          {language.t("orchestra.monitor.diskFailed")}
        </p>
      </Show>
      <p class="mx-note">{language.t("orchestra.monitor.diskLimit")}</p>
      <Show when={root()} fallback={<p role="status">{language.t("orchestra.monitor.unread")}</p>}>
        {(row) => (
          <>
            <p class="mx-note" role="status">
              {language.t("orchestra.monitor.diskCount", { count: 1 })}
            </p>
            <Show
              when={matches()}
              fallback={
                <div class="mx-empty" role="status">
                  {language.t("orchestra.monitor.filterMiss")}
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
                    <tr>
                      <td class="activity-path">
                        <code>{row().path}</code>
                      </td>
                      <td></td>
                      <td>
                        {row().logical
                          ? language.t("orchestra.monitor.bytes", { count: row().logical!.bytes })
                          : language.t("orchestra.monitor.unread")}
                      </td>
                      <td>{language.t("orchestra.monitor.notCollapsed")}</td>
                      <td>{language.t("orchestra.monitor.unproved")}</td>
                      <td>
                        {row().attempt
                          ? language.t(
                              row().attempt!.state === "complete"
                                ? "orchestra.monitor.walkComplete"
                                : "orchestra.monitor.walkPartial",
                            )
                          : language.t("orchestra.monitor.unread")}
                      </td>
                      <td>{age(row().logical?.sampledAt)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <Show when={row().attempt}>
                {(attempt) => (
                  <div class="mx-note">
                    <p>
                      {language.t("orchestra.monitor.walkDetails", {
                        bytes: attempt().observedBytes,
                        entries: attempt().entries,
                        age: age(attempt().sampledAt),
                        issues: attempt().issueCount,
                      })}
                    </p>
                    <Show when={attempt().issueCount > 0}>
                      <p>{language.t("orchestra.monitor.gapsLimit")}</p>
                      <ul>
                        <For each={attempt().issues}>
                          {(issue) => (
                            <li>
                              <code>{issue.path}</code> · {language.t(`orchestra.monitor.diskIssue.${issue.reason}`)}
                            </li>
                          )}
                        </For>
                      </ul>
                    </Show>
                  </div>
                )}
              </Show>
            </Show>
          </>
        )}
      </Show>
    </div>
  )
}
