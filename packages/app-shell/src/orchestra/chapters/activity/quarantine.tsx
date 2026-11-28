import type { ActivityEmpty } from "@orchestra/schema/activity-empty"
import { createEffect, createMemo, on, onCleanup, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"

export function ActivityQuarantine(props: { query: string }) {
  const language = useLanguage()
  const platform = usePlatform()
  const server = useServer()
  const [state, setState] = createStore({
    scope: undefined as string | undefined,
    snapshot: undefined as ActivityEmpty.Snapshot | undefined,
    busy: false,
    failed: false,
    emptying: false,
    emptyUnconfirmed: false,
    receipt: undefined as ActivityEmpty.Receipt | undefined,
  })
  let requestID = 0
  let selectionID = 0
  let pending: AbortController | undefined
  const scope = () => {
    const current = server.current
    return current?.type === "sidecar" && current.variant === "base" ? current.http.url : undefined
  }
  const supported = () => platform.os === "windows" && Boolean(platform.readActivityQuarantine && platform.emptyActivityQuarantine)
  const shown = createMemo(() => {
    const needle = props.query.trim().toLowerCase()
    const rows = state.snapshot?.rows ?? []
    return needle
      ? rows.filter((row) => `${row.label}\n${row.owner}\n${row.originalPath}\n${row.phase}`.toLowerCase().includes(needle))
      : rows
  })

  async function refresh() {
    const serverURL = scope()
    const read = platform.readActivityQuarantine
    if (!serverURL || !read || !supported()) return
    pending?.abort()
    const request = new AbortController()
    pending = request
    const id = ++requestID
    setState({ scope: serverURL, busy: true, failed: false })
    try {
      const snapshot = await read(serverURL)
      if (request.signal.aborted || requestID !== id || scope() !== serverURL) return
      if (!snapshot) setState("failed", true)
      else setState({ snapshot, receipt: undefined })
    } catch {
      if (!request.signal.aborted && requestID === id && scope() === serverURL) setState("failed", true)
    } finally {
      if (pending === request) {
        pending = undefined
        if (requestID === id && scope() === serverURL) setState("busy", false)
      }
    }
  }

  async function empty() {
    const serverURL = scope()
    const emptyQuarantine = platform.emptyActivityQuarantine
    const snapshot = state.snapshot
    if (!serverURL || state.scope !== serverURL || !emptyQuarantine || !supported() || !snapshot?.canEmpty ||
      snapshot.rows.length === 0 || state.emptying || state.busy || state.failed) return
    const selection = selectionID
    const current = () => scope() === serverURL && selectionID === selection
    setState({ emptying: true, emptyUnconfirmed: false, receipt: undefined })
    try {
      const receipt = await emptyQuarantine(serverURL)
      if (!current()) return
      if (!receipt) setState("emptyUnconfirmed", true)
      else setState("receipt", receipt)
      await refresh()
      if (current() && receipt) setState("receipt", receipt)
    } catch {
      if (current()) setState("emptyUnconfirmed", true)
    } finally {
      if (current()) setState("emptying", false)
    }
  }

  createEffect(on(scope, (serverURL) => {
    selectionID++
    requestID++
    pending?.abort()
    pending = undefined
    setState({ scope: serverURL, snapshot: undefined, busy: Boolean(serverURL && supported()), failed: false,
      emptying: false, emptyUnconfirmed: false, receipt: undefined })
    if (serverURL && supported()) void refresh()
  }, { defer: false }))
  onCleanup(() => {
    selectionID++
    requestID++
    pending?.abort()
  })

  const filterMiss = () => Boolean(props.query.trim()) && shown().length === 0

  return (
    <section aria-busy={state.busy || state.emptying}>
      <div class="activity-section-heading">
        <p class="mx-note">{language.t("orchestra.monitor.quarantineSource")}</p>
        <div>
          <button type="button" class="mx-btn" disabled={state.busy || !supported() || !scope()} onClick={() => void refresh()}>
            {language.t("orchestra.monitor.refresh")}
          </button>
          <button type="button" class="mx-btn" disabled={!state.snapshot?.canEmpty || state.snapshot.rows.length === 0 ||
            state.scope !== scope() || state.busy || state.failed || state.emptying || !supported()} onClick={() => void empty()}>
            {language.t(state.emptying ? "orchestra.monitor.quarantineEmptying" : "orchestra.monitor.quarantineEmptyAction")}
          </button>
        </div>
      </div>
      <Show when={!supported()}>
        <div class="mx-empty" role="status"><strong>{language.t("orchestra.monitor.quarantineUnsupported")}</strong></div>
      </Show>
      <Show when={supported() && !scope()}>
        <div class="mx-empty" role="status"><strong>{language.t("orchestra.monitor.quarantineSidecarUnavailable")}</strong></div>
      </Show>
      <Show when={state.failed}>
        <p class="activity-error" role="alert">{language.t("orchestra.monitor.quarantineReadFailed")}</p>
      </Show>
      <Show when={state.emptyUnconfirmed}>
        <p class="mx-note" role="status">{language.t("orchestra.monitor.quarantineEmptyUnconfirmed")}</p>
      </Show>
      <Show when={state.receipt}>
        {(receipt) => <div class="mx-note" role="status">
          <p>{language.t(`orchestra.monitor.quarantineReceipt.${receipt().outcome}`, { count: receipt().targets.length })}</p>
          <details>
            <summary>{language.t("orchestra.monitor.quarantineReceiptDetails")}</summary>
            <p>{language.t("orchestra.monitor.quarantineReceiptID", { id: receipt().previewID })}</p>
            <ul><For each={receipt().targets}>{(target) => <li>
              <code>{target.targetID}</code> · {language.t("orchestra.monitor.quarantineReceiptGeneration", { generation: target.generation })}
            </li>}</For></ul>
          </details>
        </div>}
      </Show>
      <Show when={state.snapshot} fallback={supported() && scope()
        ? <div class="mx-empty" role="status"><strong>{language.t(state.busy ? "orchestra.monitor.quarantineLoading" : "orchestra.monitor.quarantineUnread")}</strong></div>
        : undefined}>
        {(snapshot) => <>
          <p class="mx-note" role="status">
            {language.t("orchestra.monitor.quarantineCount", { count: snapshot().rows.length })}
            {snapshot().partial ? ` · ${language.t("orchestra.monitor.quarantinePartial")}` : ""}
          </p>
          <Show when={snapshot().rows.length === 0}>
            <div class="mx-empty" role="status"><strong>{language.t("orchestra.monitor.quarantineEmpty")}</strong></div>
          </Show>
          <Show when={snapshot().rows.length > 0 && shown().length === 0}>
            <div class="mx-empty" role="status"><strong>{language.t(filterMiss() ? "orchestra.monitor.filterMiss" : "orchestra.monitor.quarantineUnread")}</strong></div>
          </Show>
          <Show when={shown().length > 0}>
            <div class="activity-table-scroll">
              <table class="activity-table">
                <thead><tr>
                  <th scope="col">{language.t("orchestra.monitor.quarantineArtifact")}</th>
                  <th scope="col">{language.t("orchestra.monitor.owner")}</th>
                  <th scope="col">{language.t("orchestra.monitor.path")}</th>
                  <th scope="col">{language.t("orchestra.monitor.state")}</th>
                </tr></thead>
                <tbody><For each={shown()}>{(row) => <tr>
                  <td>{row.label}</td>
                  <td>{row.owner}</td>
                  <td class="activity-path"><code>{row.originalPath}</code></td>
                  <td>{language.t(`orchestra.monitor.quarantinePhase.${row.phase}`)}</td>
                </tr>}</For></tbody>
              </table>
            </div>
          </Show>
        </>}
      </Show>
    </section>
  )
}
