import { createEffect, createSignal, createUniqueId, For, onCleanup, Show } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { useLanguage } from "@/context/language"
import type { LiveRecoveryItem, LiveRecoveryPort, LiveRecoverySnapshot } from "@/live"
import "./recovery.css"

const statusKeys = {
  sending: "orchestra.flightEngineer.recovery.sending",
  paused: "orchestra.flightEngineer.recovery.paused",
  blocked: "orchestra.flightEngineer.recovery.blocked",
  interrupted: "orchestra.flightEngineer.recovery.interrupted",
  "storage-error": "orchestra.flightEngineer.recovery.storage",
} as const

export function FlightRecovery(props: {
  port: LiveRecoveryPort
  onSnapshot?: (snapshot: LiveRecoverySnapshot | undefined) => void
}) {
  const language = useLanguage()
  const t = language.t
  const titleID = createUniqueId()
  const [data, setData] = createStore<LiveRecoverySnapshot>({ state: "ready", canStart: false, items: [], unconfirmedStarts: [] })
  const [loaded, setLoaded] = createSignal(false)
  const snapshot = () => loaded() ? data : undefined
  const [readFailed, setReadFailed] = createSignal(false)
  const [actionFailed, setActionFailed] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  const [confirmation, setConfirmation] = createSignal<{ id: string; title: string }>()
  const focus = { discard: undefined as HTMLButtonElement | undefined }
  const operations = { current: undefined as {
    active: boolean; port: LiveRecoveryPort; refresh: (fresh?: boolean) => Promise<void>
  } | undefined }

  createEffect(() => {
    const port = props.port
    const owner = { active: true, port, read: undefined as Promise<void> | undefined, refresh }
    function refresh(fresh = false): Promise<void> {
      if (!owner.active) return Promise.resolve()
      if (owner.read) return fresh ? owner.read.then(() => refresh(true)) : owner.read
      const read = Promise.resolve().then(() => owner.active ? port.snapshot() : undefined).then(
        (value) => {
          if (!owner.active || !value) return
          // Polling must not replace a focused record's controls when its ID and values are unchanged.
          setData(reconcile(value))
          setLoaded(true)
          setReadFailed(false)
          props.onSnapshot?.(value)
        },
        () => {
          if (!owner.active) return
          setReadFailed(true)
          props.onSnapshot?.(undefined)
        },
      ).finally(() => { if (owner.read === read) owner.read = undefined })
      owner.read = read
      return read
    }
    operations.current = owner
    setLoaded(false)
    setReadFailed(false)
    setActionFailed(false)
    setBusy(false)
    setConfirmation(undefined)
    props.onSnapshot?.(undefined)
    const focus = () => { void refresh() }
    const timer = setInterval(focus, 1000)
    window.addEventListener("focus", focus)
    void refresh()
    onCleanup(() => {
      owner.active = false
      clearInterval(timer)
      window.removeEventListener("focus", focus)
      props.onSnapshot?.(undefined)
    })
  })

  function closeConfirmation() {
    setConfirmation(undefined)
    if (focus.discard?.isConnected) focus.discard.focus()
    focus.discard = undefined
  }

  async function act(action: "retry" | "finish" | "export" | "discard", id: string) {
    const owner = operations.current
    if (!owner?.active || busy()) return
    setBusy(true)
    setActionFailed(false)
    const result = await Promise.resolve().then(() => owner.active ? owner.port[action](id) : undefined)
      .catch(() => undefined)
    if (!owner.active || operations.current !== owner) return
    setBusy(false)
    if (!result?.ok) {
      if (result?.reason !== "cancelled") setActionFailed(true)
      return
    }
    if (action === "discard") closeConfirmation()
    // A successful local action is not a delivery receipt; only a fresh snapshot can remove a record.
    await owner.refresh(true)
  }

  const actions = (item: { id: string; title: string }, active = false) => (
    <div class="fe-recovery-actions">
      <button type="button" class="mx-btn" disabled={busy()} onClick={() => void act("retry", item.id)}>{t("orchestra.flightEngineer.recovery.retry")}</button>
      <button type="button" class="mx-btn" disabled={busy() || active} onClick={() => void act("finish", item.id)}>{t("orchestra.flightEngineer.recovery.finish")}</button>
      <button type="button" class="mx-btn" disabled={busy()} onClick={() => void act("export", item.id)}>{t("orchestra.flightEngineer.recovery.export")}</button>
      <button type="button" class="mx-btn danger" disabled={busy() || active} onClick={(event) => {
        focus.discard = event.currentTarget
        setConfirmation({ id: item.id, title: item.title })
      }}>{t("orchestra.flightEngineer.recovery.discard")}</button>
    </div>
  )
  const incomplete = (item: LiveRecoveryItem) => item.unsaved !== "none" || item.reason === "storage" || item.reason === "quota"

  return (
    <section class="mx-card fe-recovery" aria-labelledby={titleID}>
      <h2 id={titleID}>{t("orchestra.flightEngineer.recovery.title")}</h2>
      <Show when={readFailed() || actionFailed()}>
        <p class="fe-recovery-warning" role="alert">{t("common.requestFailed")}</p>
      </Show>
      <Show when={!snapshot() && !readFailed()}>
        <p role="status">{t("orchestra.flightEngineer.recovery.loading")}</p>
      </Show>
      <Show when={snapshot()?.state === "storage-error"}>
        <p class="fe-recovery-warning">{t("orchestra.flightEngineer.recovery.storage")}</p>
      </Show>
      <Show when={snapshot()?.state === "closed"}>
        <p class="fe-recovery-warning">{t("orchestra.flightEngineer.recovery.closed")}</p>
      </Show>
      <Show when={readFailed() || (snapshot()?.state === "ready" && snapshot()?.canStart === false)}>
        <p class="fe-recovery-warning">{t("orchestra.flightEngineer.recovery.unavailable")}</p>
      </Show>
      <For each={snapshot()?.items}>
        {(item) => (
          <article class="fe-recovery-item">
            <h3>{item.title}</h3>
            <p><time dateTime={new Date(item.timeStarted).toISOString()}>{new Intl.DateTimeFormat(language.intl(), {
              dateStyle: "medium", timeStyle: "short",
            }).format(item.timeStarted)}</time></p>
            <p role="status">{item.activeProducer ? t("orchestra.flightEngineer.recording") : t("orchestra.flightEngineer.recovery.pending")}</p>
            <p>{t(statusKeys[item.status])}</p>
            <p>{t("orchestra.flightEngineer.recovery.count", { count: item.pendingCount, bytes: item.pendingBytes })}</p>
            <Show when={item.closeRequested}><p>{t("orchestra.flightEngineer.recovery.finishRequested")}</p></Show>
            <Show when={incomplete(item)}>
              <p class="fe-recovery-warning">{t(item.unsaved === "retained"
                ? "orchestra.flightEngineer.recovery.retained" : "orchestra.flightEngineer.recovery.incomplete")}</p>
            </Show>
            {actions(item, item.activeProducer)}
          </article>
        )}
      </For>
      <For each={snapshot()?.unconfirmedStarts}>
        {(item) => (
          <article class="fe-recovery-item">
            <h3>{item.title}</h3>
            <p role="status">{t("orchestra.flightEngineer.recovery.unconfirmed")}</p>
            {actions(item)}
          </article>
        )}
      </For>
      <Show when={snapshot()?.state === "ready" && !readFailed() && snapshot()?.items.length === 0 && snapshot()?.unconfirmedStarts.length === 0}>
        <p>{t("orchestra.flightEngineer.recovery.empty")}</p>
      </Show>
      <Show when={confirmation()}>
        {(item) => (
          <section class="fe-recovery-confirm" role="alertdialog" aria-label={t("orchestra.flightEngineer.recovery.confirmTitle")}
            onKeyDown={(event) => { if (event.key === "Escape" && !busy()) closeConfirmation() }}>
            <h3>{t("orchestra.flightEngineer.recovery.confirmTitle")}</h3>
            <p>{item().title}</p>
            <p>{t("orchestra.flightEngineer.recovery.confirmBody")}</p>
            <div class="fe-recovery-actions">
              <button type="button" class="mx-btn" disabled={busy()} onClick={closeConfirmation}
                ref={(button) => queueMicrotask(() => { if (button.isConnected) button.focus() })}>{t("orchestra.flightEngineer.cancel")}</button>
              <button type="button" class="mx-btn danger" disabled={busy()} onClick={() => void act("discard", item().id)}>{t("orchestra.flightEngineer.recovery.discard")}</button>
            </div>
          </section>
        )}
      </Show>
    </section>
  )
}
