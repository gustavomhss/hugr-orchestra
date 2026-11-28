import type { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { sampleAnchor } from "./reading"

const columns = ["externalName", "owner", "logical", "unique", "proof", "state", "age", "reading"] as const

export function ActivityExternalCaches(props: { query: string }) {
  const language = useLanguage()
  const sdk = useServerSDK()
  const [state, setState] = createStore({
    snapshot: undefined as ActivityMonitor.ExternalCacheSnapshot | undefined,
    anchors: {} as Record<string, number | undefined>,
    busy: false,
    failed: false,
    now: performance.now(),
  })
  const shown = createMemo(() =>
    (state.snapshot?.records ?? []).filter((row) => row.name.toLowerCase().includes(props.query.trim().toLowerCase())),
  )
  const [read, setRead] = createSignal<((id?: string) => Promise<void>) | undefined>()
  createEffect(on(sdk, (server) => {
    const controller = new AbortController()
    setState({ snapshot: undefined, anchors: {}, busy: false, failed: false, now: performance.now() })
    async function refresh(id?: string) {
      if (state.busy || controller.signal.aborted) return
      setState("busy", true)
      await server.ready
        .then(() => {
          controller.signal.throwIfAborted()
          return id === undefined
            ? server.orchestra.activity.externalCaches({ signal: controller.signal })
            : server.orchestra.activity.readExternalCache({ id }, { signal: controller.signal })
        })
        .then(
          (snapshot) => {
            if (controller.signal.aborted) return
            const previous = state.snapshot
            const same = previous?.instanceID === snapshot.instanceID
            if (same && BigInt(snapshot.snapshotRevision) < BigInt(previous.snapshotRevision)) return
            if (same && snapshot.snapshotRevision === previous.snapshotRevision) {
              setState("failed", false)
              return
            }
            const now = Math.max(state.now, performance.now())
            const anchors = Object.fromEntries(snapshot.records.map((row) => {
              const old = same ? previous?.records.find((item) => item.id === row.id) : undefined
              return [row.id, sampleAnchor(row.logical, old?.logical, same ? state.anchors[row.id] : undefined, { readAt: snapshot.readAt, receivedAt: now })]
            }))
            setState({ snapshot, anchors, now, failed: false })
          },
          () => {
            if (!controller.signal.aborted) setState("failed", true)
          },
        )
      if (!controller.signal.aborted) setState("busy", false)
    }
    void refresh()
    const tick = setInterval(() => setState("now", performance.now()), 1000)
    onCleanup(() => {
      controller.abort()
      clearInterval(tick)
    })
    setRead(() => refresh)
  }))
  function age(id: string) {
    const anchor = state.anchors[id]
    return anchor === undefined
      ? language.t("orchestra.monitor.unread")
      : language.t("orchestra.monitor.seconds", { count: Math.floor(Math.max(0, state.now - anchor) / 1000) })
  }
  return (
    <section aria-busy={state.busy}>
      <div class="activity-section-heading">
        <h2>{language.t("orchestra.monitor.externalTitle")}</h2>
        <button type="button" class="mx-btn" disabled={state.busy} onClick={() => void read()?.()}>
          {language.t("orchestra.monitor.refresh")}
        </button>
      </div>
      <p class="mx-note">
        {language.t("orchestra.monitor.externalSource", {
          source: state.snapshot?.source ?? language.t("orchestra.monitor.unread"),
        })}
      </p>
      <Show when={state.failed}>
        <p class="activity-error" role="alert">{language.t("orchestra.monitor.externalFailed")}</p>
      </Show>
      <Show when={state.snapshot} fallback={<p role="status">{language.t("orchestra.monitor.externalUnread")}</p>}>
        {(snapshot) => (
          <Show
            when={snapshot().status === "ready"}
            fallback={<p role="status">{language.t("orchestra.monitor.externalUnavailable")}</p>}
          >
            <Show
              when={snapshot().records.length > 0}
              fallback={<p role="status">{language.t("orchestra.monitor.externalEmpty")}</p>}
            >
              <Show when={shown().length > 0} fallback={<p role="status">{language.t("orchestra.monitor.filterMiss")}</p>}>
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
                            <td>{row.name}</td>
                            <td>{row.owner}</td>
                            <td>
                              {row.logical
                                ? language.t("orchestra.monitor.bytes", { count: row.logical.bytes })
                                : language.t("orchestra.monitor.unread")}
                            </td>
                            <td>{language.t("orchestra.monitor.notCollapsed")}</td>
                            <td>{language.t("orchestra.monitor.unproved")}</td>
                            <td>
                              {row.attempt
                                ? language.t(row.attempt.state === "complete" ? "orchestra.monitor.walkComplete" : "orchestra.monitor.walkPartial")
                                : language.t("orchestra.monitor.unread")}
                            </td>
                            <td>{age(row.id)}</td>
                            <td>
                              <button type="button" class="mx-btn" disabled={state.busy} onClick={() => void read()?.(row.id)}>
                                {language.t("orchestra.monitor.measureDisk")}
                              </button>
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </Show>
            </Show>
          </Show>
        )}
      </Show>
    </section>
  )
}
