import { getFilename } from "@opencode-ai/core/util/path"
import {
  createMemo,
  createSignal,
  createUniqueId,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
  type JSX,
} from "solid-js"
import { createStore } from "solid-js/store"
import { useGlobal } from "@/context/global"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { ServerConnection } from "@/context/server"
import { useTabs } from "@/context/tabs"
import { displayName } from "@/pages/layout/helpers"
import { pathKey } from "@/utils/path-key"
import { Persist, persisted } from "@/utils/persist"
import type { ChapterPageProps } from "../chapter-route"
import { MxBadge, MxPage, MxToggle } from "./kit"
import {
  createDeviceSchedule,
  type DeviceStore,
  type ScheduleFields,
  type ScheduleItem,
  type ScheduleSource,
} from "./schedule-device"
import { CADENCES, localInput, readTasks, type ScheduleTask } from "./schedule-model"
import { createServerSchedule } from "./schedule-server"
import "./schedule.css"

type DialogInput = { type: "edit"; id?: string; resume?: boolean } | { type: "remove"; id: string }
type Dialog = DialogInput & { key: number }

// Servers that schedule tasks themselves own them; with an older server, tasks stay on this device and run
// from this page while it is open.
export default function SchedulePage(props: ChapterPageProps) {
  const sdk = useSDK()
  const target = Persist.serverWorkspace(sdk().scope, props.directory, "orchestra.schedule")
  const [saved, setSaved, , ready] = persisted(
    { ...target, migrate: readTasks },
    createStore({ tasks: [] as ScheduleTask[] }),
  )
  const store: DeviceStore = { saved, setSaved, ready, key: `${target.storage}:${target.key}` }
  const [mode, setMode] = createSignal<"server" | "device">("server")
  return (
    <Show when={mode()} keyed>
      {(current) => (
        <ScheduleScreen
          {...props}
          source={() =>
            current === "server"
              ? createServerSchedule({ directory: props.directory, store, onUnsupported: () => setMode("device") })
              : createDeviceSchedule({ directory: props.directory, store })
          }
          device={current === "device"}
        />
      )}
    </Show>
  )
}

function ScheduleScreen(props: ChapterPageProps & { source: () => ScheduleSource; device: boolean }) {
  const language = useLanguage()
  const global = useGlobal()
  const tabs = useTabs()
  // Created once per screen: a source owns its timers and requests for as long as the screen is mounted.
  const source = props.source()
  const [state, setState] = createStore({ search: "" })
  // A signal, not the store: a store merges a new dialog into the open one instead of replacing it.
  const [dialog, setDialog] = createSignal<Dialog>()
  const lifetime = { dialogs: 0, disposed: false }
  onCleanup(() => {
    lifetime.disposed = true
  })
  const profile = createMemo(() => {
    const project = global
      .ensureServerCtx(props.server)
      .projects.list()
      .find((item) => pathKey(item.worktree) === pathKey(props.directory))
    return project ? displayName(project) : getFilename(props.directory) || props.directory
  })
  const cadence = (task: ScheduleItem) => language.t(`orchestra.schedule.cadence.${task.cadence}`)
  const status = (task: ScheduleItem) =>
    language.t(task.enabled ? "orchestra.schedule.status.enabled" : "orchestra.schedule.status.paused")
  const visible = createMemo(() => {
    const query = state.search.trim().toLowerCase()
    if (!query) return source.tasks()
    return source
      .tasks()
      .filter((task) =>
        [task.name, task.prompt, cadence(task), status(task)].some((text) => text.toLowerCase().includes(query)),
      )
  })
  // Slots are shown in the task's own zone, the one that anchors its daily and weekly runs.
  const formats = createMemo(() => {
    const locale = language.intl()
    const cache = new Map<string, Intl.DateTimeFormat>()
    return (time: number, timeZone: string) => {
      const format =
        cache.get(timeZone) ?? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone })
      cache.set(timeZone, format)
      return format.format(time)
    }
  })
  const runs = (count: number) =>
    language.t(
      new Intl.PluralRules(language.intl()).select(count) === "one"
        ? "orchestra.schedule.runs.one"
        : "orchestra.schedule.runs.other",
      { count },
    )
  const show = (input: DialogInput) => setDialog({ ...input, key: ++lifetime.dialogs })
  // A replaced dialog still fires its close event later; only the current one may clear the state.
  const hide = (key: number) => {
    if (dialog()?.key === key) setDialog(undefined)
  }
  const openSession = (sessionID: string) =>
    tabs.select(tabs.addSessionTab({ server: ServerConnection.key(props.server), sessionId: sessionID }))
  const note = () => {
    if (props.device) return language.t("orchestra.schedule.noteDevice")
    if (source.status() === "ready") return language.t("orchestra.schedule.note")
  }

  const save = (edit: Extract<Dialog, { type: "edit" }>, form: FormData) => {
    const fields: ScheduleFields = {
      name: String(form.get("name") ?? "").trim(),
      prompt: String(form.get("prompt") ?? "").trim(),
      next: new Date(String(form.get("date") ?? "")).getTime(),
      cadence: CADENCES.find((item) => item === form.get("cadence")) ?? "once",
    }
    if (!fields.name) return Promise.resolve(language.t("orchestra.schedule.error.name"))
    if (!fields.prompt) return Promise.resolve(language.t("orchestra.schedule.error.prompt"))
    if (!Number.isFinite(fields.next)) return Promise.resolve(language.t("orchestra.schedule.error.date"))
    if (fields.next <= Date.now()) return Promise.resolve(language.t("orchestra.schedule.error.past"))
    return source.save(edit.id, fields, !!edit.resume)
  }

  return (
    <MxPage
      id="orchestra-schedule"
      eyebrow={language.t("orchestra.schedule.eyebrow", { profile: profile() })}
      title={language.t("orchestra.nav.schedule")}
      description={language.t("orchestra.schedule.description")}
      action={
        // Until the server answers it is unknown where tasks are saved, and a switch to device storage would
        // drop an open dialog.
        <button
          type="button"
          class="mx-btn primary"
          disabled={source.status() === "loading"}
          onClick={() => show({ type: "edit" })}
        >
          {language.t("orchestra.schedule.add")}
        </button>
      }
    >
      <div class="mx-toolbar">
        <input
          class="mx-search"
          value={state.search}
          placeholder={language.t("orchestra.schedule.search")}
          aria-label={language.t("orchestra.schedule.search")}
          onInput={(event) => setState("search", event.currentTarget.value)}
        />
        <MxBadge>
          <bdi>{profile()}</bdi>
        </MxBadge>
      </div>
      <Show when={source.error()}>
        <p class="mx-error" role="alert">
          {source.error()}
        </p>
      </Show>
      <Switch>
        <Match when={source.status() === "loading"}>
          <div class="mx-empty">{language.t("orchestra.schedule.loading")}</div>
        </Match>
        <Match when={source.status() === "error"}>
          <div class="mx-empty">{language.t("orchestra.schedule.loadError")}</div>
        </Match>
        <Match when={source.tasks().length === 0}>
          <div class="mx-empty">
            {language.t("orchestra.schedule.empty")}
            <br />
            {language.t("orchestra.schedule.emptyHint")}
          </div>
        </Match>
        <Match when={visible().length === 0}>
          <div class="mx-empty">{language.t("orchestra.schedule.noMatches")}</div>
        </Match>
        <Match when={true}>
          <div class="mx-grid">
            <For each={visible()}>
              {(task) => (
                <article class="mx-card" aria-labelledby={`schedule-${task.id}`}>
                  <div class="mx-card-top">
                    <span class="mx-mark">
                      <ClockIcon />
                    </span>
                    <h3 id={`schedule-${task.id}`}>
                      <bdi>{task.name}</bdi>
                    </h3>
                  </div>
                  <p>{task.prompt}</p>
                  <div class="mx-meta">
                    <MxBadge>{cadence(task)}</MxBadge>
                    <MxBadge tone={task.enabled ? "good" : undefined}>{status(task)}</MxBadge>
                  </div>
                  <p>
                    {language.t("orchestra.schedule.next", { date: formats()(task.next, task.timezone) })}
                    <br />
                    <small>
                      {task.timezone} · {runs(task.runs)}
                    </small>
                  </p>
                  <footer class="mx-card-foot">
                    <div>
                      <button
                        type="button"
                        class="mx-btn"
                        disabled={source.running(task.id)}
                        onClick={() =>
                          void source.run(task.id).then((sessionID) => {
                            if (sessionID && !lifetime.disposed) openSession(sessionID)
                          })
                        }
                      >
                        {language.t("orchestra.schedule.run")}
                      </button>{" "}
                      <button type="button" class="mx-btn" onClick={() => show({ type: "edit", id: task.id })}>
                        {language.t("orchestra.schedule.edit")}
                      </button>
                    </div>
                    <MxToggle
                      checked={task.enabled}
                      label={language.t("orchestra.schedule.enable", { name: task.name })}
                      onChange={(enabled) => {
                        // A one-off whose time passed needs a new time; resuming opens the editor.
                        if (enabled && task.cadence === "once" && task.next <= Date.now())
                          return show({ type: "edit", id: task.id, resume: true })
                        void source.setEnabled(task.id, enabled)
                      }}
                    />
                  </footer>
                  <Show when={task.missed}>
                    {(missed) => (
                      <p class="mx-note schedule-missed">
                        {language.t("orchestra.schedule.missed", { date: formats()(missed(), task.timezone) })}
                      </p>
                    )}
                  </Show>
                  <Show when={task.last?.outcome === "failed" && task.last}>
                    {(last) => (
                      <p class="mx-note schedule-missed">
                        {language.t("orchestra.schedule.failed", {
                          date: new Date(last().time).toLocaleString(language.intl()),
                          detail: last().error,
                        })}
                      </p>
                    )}
                  </Show>
                  <Show when={task.last?.outcome === "started" && task.last}>
                    {(last) => (
                      <p class="mx-note">
                        {language.t("orchestra.schedule.last", {
                          date: new Date(last().time).toLocaleString(language.intl()),
                        })}{" "}
                        ·{" "}
                        <button type="button" class="mx-link" onClick={() => openSession(last().sessionID)}>
                          {language.t("orchestra.schedule.openSession")}
                        </button>
                      </p>
                    )}
                  </Show>
                </article>
              )}
            </For>
          </div>
        </Match>
      </Switch>
      <Show when={note()}>{(text) => <p class="mx-note">{text()}</p>}</Show>
      <Show when={dialog()} keyed>
        {(current) => (
          <Switch>
            <Match when={current.type === "edit" && current}>
              {(edit) => {
                const task = source.tasks().find((item) => item.id === edit().id)
                return (
                  <ScheduleDialog
                    title={
                      task
                        ? language.t("orchestra.schedule.dialog.edit", { name: task.name })
                        : language.t("orchestra.schedule.dialog.new")
                    }
                    subtitle={language.t("orchestra.schedule.dialog.subtitle")}
                    closeLabel={language.t("orchestra.schedule.dialog.close")}
                    cancel={language.t("orchestra.schedule.cancel")}
                    submit={language.t("orchestra.schedule.save")}
                    onSubmit={(form) => save(edit(), form)}
                    onClose={() => hide(current.key)}
                  >
                    <label class="mx-field">
                      <span>{language.t("orchestra.schedule.field.name")}</span>
                      <input name="name" type="text" value={task?.name ?? ""} required />
                    </label>
                    <label class="mx-field">
                      <span>{language.t("orchestra.schedule.field.prompt")}</span>
                      <textarea name="prompt" value={task?.prompt ?? ""} />
                    </label>
                    <div class="mx-fields">
                      <label class="mx-field">
                        <span>{language.t("orchestra.schedule.field.cadence")}</span>
                        <select name="cadence">
                          <For each={CADENCES}>
                            {(item) => (
                              <option value={item} selected={item === (task?.cadence ?? "once")}>
                                {language.t(`orchestra.schedule.cadence.${item}`)}
                              </option>
                            )}
                          </For>
                        </select>
                      </label>
                      <label class="mx-field">
                        <span>{language.t("orchestra.schedule.field.date")}</span>
                        <input
                          name="date"
                          type="datetime-local"
                          value={localInput(task?.next ?? Date.now() + 3_600_000)}
                          required
                        />
                      </label>
                    </div>
                    <Show when={task}>
                      {(existing) => (
                        <button
                          type="button"
                          class="mx-btn"
                          onClick={() => show({ type: "remove", id: existing().id })}
                        >
                          {language.t("orchestra.schedule.remove")}
                        </button>
                      )}
                    </Show>
                  </ScheduleDialog>
                )
              }}
            </Match>
            <Match when={current.type === "remove" && current}>
              {(remove) => (
                <ScheduleDialog
                  title={language.t("orchestra.schedule.confirm.title")}
                  subtitle={language.t("orchestra.schedule.confirm.subtitle")}
                  closeLabel={language.t("orchestra.schedule.dialog.close")}
                  cancel={language.t("orchestra.schedule.cancel")}
                  submit={language.t("orchestra.schedule.confirm.submit")}
                  onSubmit={() => source.remove(remove().id).then(() => undefined)}
                  onClose={() => hide(current.key)}
                >
                  <p class="mx-note">{language.t("orchestra.schedule.confirm.detail", { profile: profile() })}</p>
                </ScheduleDialog>
              )}
            </Match>
          </Switch>
        )}
      </Show>
    </MxPage>
  )
}

// Native modal dialog, as in the mock: top layer, focus trap, Escape and backdrop click close it.
function ScheduleDialog(props: {
  title: string
  subtitle: string
  closeLabel: string
  cancel: string
  submit: string
  // Resolves with a message to show, or nothing to close the dialog.
  onSubmit: (form: FormData) => Promise<string | undefined>
  onClose: () => void
  children: JSX.Element
}) {
  const [error, setError] = createSignal("")
  const [pending, setPending] = createSignal(false)
  const id = createUniqueId()
  let dialog!: HTMLDialogElement
  onMount(() => dialog.showModal())
  return (
    <dialog
      ref={dialog}
      class="mx-dialog schedule-dialog"
      aria-labelledby={id}
      // A Kobalte layer behind this modal (a navigation tooltip still open or animating out) takes Escape on the
      // document and cancels the native close. The modal is the top layer, so it takes Escape first.
      on:keydown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return
        event.preventDefault()
        dialog.close()
      }}
      onClose={() => props.onClose()}
      onClick={(event) => {
        if (event.target !== dialog) return
        const rect = dialog.getBoundingClientRect()
        const inside =
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom
        if (!inside) dialog.close()
      }}
    >
      <form
        autocomplete="off"
        onSubmit={(event) => {
          event.preventDefault()
          if (pending()) return
          setPending(true)
          void props
            .onSubmit(new FormData(event.currentTarget))
            .then((message) => {
              if (message) return setError(message)
              dialog.close()
            })
            .finally(() => setPending(false))
        }}
      >
        <header class="mx-dialog-head">
          <div>
            <h2 id={id}>{props.title}</h2>
            <p>{props.subtitle}</p>
          </div>
          <button type="button" class="mx-link" aria-label={props.closeLabel} onClick={() => dialog.close()}>
            <svg class="schedule-ic" viewBox="0 0 16 16" aria-hidden="true">
              <path d="m4 4 8 8m0-8-8 8" />
            </svg>
          </button>
        </header>
        <div class="mx-dialog-body">
          <p class="mx-error" role="alert" hidden={!error()}>
            {error()}
          </p>
          {props.children}
        </div>
        <footer class="mx-dialog-foot">
          <button type="button" class="mx-btn" onClick={() => dialog.close()}>
            {props.cancel}
          </button>
          <button type="submit" class="mx-btn primary" disabled={pending()}>
            {props.submit}
          </button>
        </footer>
      </form>
    </dialog>
  )
}

function ClockIcon() {
  return (
    <svg class="schedule-ic" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4v4l3 2" />
    </svg>
  )
}
