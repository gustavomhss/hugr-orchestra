import { useQuery } from "@tanstack/solid-query"
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
import { useServerSync } from "@/context/server-sync"
import { useSync } from "@/context/sync"
import { useTabs } from "@/context/tabs"
import { displayName } from "@/pages/layout/helpers"
import { Identifier } from "@/utils/id"
import { pathKey } from "@/utils/path-key"
import { Persist, persisted } from "@/utils/persist"
import { normalizeSessionInfo } from "@/utils/session"
import type { ChapterPageProps } from "../chapter-route"
import { MxBadge, MxPage, MxToggle } from "./kit"
import {
  CADENCES,
  canResume,
  dueTasks,
  localInput,
  readTasks,
  recordRun,
  resume,
  type ScheduleTask,
} from "./schedule-model"
import "./schedule.css"

// Due tasks are checked on open and on this cadence while the page stays mounted.
const TICK = 15_000

type DialogInput = { type: "edit"; id?: string; resume?: boolean } | { type: "remove"; id: string }
type Dialog = DialogInput & { key: number }

export default function SchedulePage(props: ChapterPageProps) {
  const language = useLanguage()
  const sdk = useSDK()
  const sync = useSync()
  const serverSync = useServerSync()
  const global = useGlobal()
  const tabs = useTabs()
  const agents = useQuery(() => serverSync().queryOptions.agents(pathKey(props.directory)))
  const [saved, setSaved, , ready] = persisted(
    { ...Persist.serverWorkspace(sdk().scope, props.directory, "orchestra.schedule"), migrate: readTasks },
    createStore({ tasks: [] as ScheduleTask[] }),
  )
  const [state, setState] = createStore({
    search: "",
    running: {} as Record<string, boolean>,
    error: "",
    now: Date.now(),
  })
  // A signal, not the store: a store merges a new dialog into the open one instead of replacing it.
  const [dialog, setDialog] = createSignal<Dialog>()
  const lifetime = { disposed: false, dialogs: 0, ticking: false, failed: new Set<string>() }
  const profile = createMemo(() => {
    const project = global
      .ensureServerCtx(props.server)
      .projects.list()
      .find((item) => pathKey(item.worktree) === pathKey(props.directory))
    return project ? displayName(project) : getFilename(props.directory) || props.directory
  })
  const choices = createMemo(() => (agents.data ?? []).filter((agent) => agent.mode !== "subagent" && !agent.hidden))
  const cadence = (task: ScheduleTask) => language.t(`orchestra.schedule.cadence.${task.cadence}`)
  const status = (task: ScheduleTask) =>
    language.t(task.enabled ? "orchestra.schedule.status.enabled" : "orchestra.schedule.status.paused")
  const visible = createMemo(() => {
    const query = state.search.trim().toLowerCase()
    if (!query) return saved.tasks
    return saved.tasks.filter((task) =>
      [task.name, task.prompt, task.agent, cadence(task), status(task)].some((text) =>
        text.toLowerCase().includes(query),
      ),
    )
  })
  const nextFormat = createMemo(
    () => new Intl.DateTimeFormat(language.intl(), { dateStyle: "medium", timeStyle: "short" }),
  )
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const runs = (count: number) =>
    language.t(
      new Intl.PluralRules(language.intl()).select(count) === "one"
        ? "orchestra.schedule.runs.one"
        : "orchestra.schedule.runs.other",
      { count },
    )
  const update = (id: string, next: (task: ScheduleTask) => ScheduleTask) =>
    setSaved("tasks", (task) => task.id === id, next)
  const show = (input: DialogInput) => setDialog({ ...input, key: ++lifetime.dialogs })
  // A replaced dialog still fires its close event later; only the current one may clear the state.
  const hide = (key: number) => {
    if (dialog()?.key === key) setDialog(undefined)
  }

  const start = async (task: ScheduleTask) => {
    const session = normalizeSessionInfo(
      await sdk().api.session.create({ agent: task.agent, location: { directory: props.directory } }),
    )
    sync().session.remember(session)
    await sdk().api.session.prompt({
      sessionID: session.id,
      id: Identifier.ascending("message"),
      text: task.prompt,
      agent: task.agent,
    })
    return session.id
  }

  // Creates a real session on this profile, then records the run against the slot it served.
  const dispatch = async (task: ScheduleTask) => {
    const now = Date.now()
    setState({ running: { ...state.running, [task.id]: true }, error: "" })
    const result = await start(task).then(
      (sessionID) => ({ sessionID, detail: "" }),
      (error: unknown) => ({ sessionID: "", detail: error instanceof Error ? error.message : String(error) }),
    )
    setState("running", task.id, false)
    if (!result.sessionID) {
      lifetime.failed.add(`${task.id}:${task.next}`)
      if (!lifetime.disposed)
        setState("error", language.t("orchestra.schedule.runError", { name: task.name, detail: result.detail }))
      return
    }
    update(task.id, (current) => recordRun(current, now, result.sessionID))
    return result.sessionID
  }

  const openSession = (sessionID: string) =>
    tabs.select(tabs.addSessionTab({ server: ServerConnection.key(props.server), sessionId: sessionID }))

  const tick = async () => {
    setState("now", Date.now())
    if (!ready() || lifetime.ticking || lifetime.disposed) return
    lifetime.ticking = true
    const due = dueTasks(saved.tasks, Date.now()).filter(
      (task) => !state.running[task.id] && !lifetime.failed.has(`${task.id}:${task.next}`),
    )
    for (const task of due) {
      if (lifetime.disposed) break
      await dispatch(task)
    }
    lifetime.ticking = false
  }
  onMount(() => {
    void ready.promise?.then(tick)
    if (ready()) void tick()
    const timer = setInterval(() => void tick(), TICK)
    onCleanup(() => clearInterval(timer))
  })
  onCleanup(() => {
    lifetime.disposed = true
  })

  const save = (edit: Extract<Dialog, { type: "edit" }>, form: FormData) => {
    const name = String(form.get("name") ?? "").trim()
    const prompt = String(form.get("prompt") ?? "").trim()
    const agent = String(form.get("agent") ?? "")
    const next = new Date(String(form.get("date") ?? "")).getTime()
    if (!name) return language.t("orchestra.schedule.error.name")
    if (!prompt) return language.t("orchestra.schedule.error.prompt")
    if (!agent) return language.t("orchestra.schedule.error.agent")
    if (!Number.isFinite(next)) return language.t("orchestra.schedule.error.date")
    if (next <= Date.now()) return language.t("orchestra.schedule.error.past")
    const fields = {
      name,
      prompt,
      agent,
      next,
      cadence: CADENCES.find((item) => item === form.get("cadence")) ?? "once",
    }
    if (edit.id) {
      update(edit.id, (task) => ({ ...task, ...fields, enabled: edit.resume ? true : task.enabled }))
      return
    }
    setSaved("tasks", saved.tasks.length, { id: crypto.randomUUID(), ...fields, enabled: true, runs: 0 })
  }

  return (
    <MxPage
      id="orchestra-schedule"
      eyebrow={language.t("orchestra.schedule.eyebrow", { profile: profile() })}
      title={language.t("orchestra.nav.schedule")}
      description={language.t("orchestra.schedule.description")}
      action={
        <button type="button" class="mx-btn primary" onClick={() => show({ type: "edit" })}>
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
      <Show when={state.error}>
        <p class="mx-error" role="alert">
          {state.error}
        </p>
      </Show>
      <Show
        when={saved.tasks.length > 0}
        fallback={
          <div class="mx-empty">
            {language.t("orchestra.schedule.empty")}
            <br />
            {language.t("orchestra.schedule.emptyHint")}
          </div>
        }
      >
        <Show
          when={visible().length > 0}
          fallback={<div class="mx-empty">{language.t("orchestra.schedule.noMatches")}</div>}
        >
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
                    <MxBadge>
                      <bdi>{task.agent}</bdi>
                    </MxBadge>
                    <MxBadge tone={task.enabled ? "good" : undefined}>{status(task)}</MxBadge>
                  </div>
                  <p>
                    {language.t("orchestra.schedule.next", { date: nextFormat().format(task.next) })}
                    <br />
                    <small>
                      {timezone} · {runs(task.runs)}
                    </small>
                  </p>
                  <footer class="mx-card-foot">
                    <div>
                      <button
                        type="button"
                        class="mx-btn"
                        disabled={!!state.running[task.id]}
                        onClick={() =>
                          void dispatch(task).then((sessionID) => {
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
                        if (!enabled) return update(task.id, (current) => ({ ...current, enabled: false }))
                        // A one-off whose time passed needs a new time; resuming opens the editor.
                        if (!canResume(task, Date.now())) return show({ type: "edit", id: task.id, resume: true })
                        update(task.id, (current) => resume(current, Date.now()))
                      }}
                    />
                  </footer>
                  <Show when={task.last}>
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
        </Show>
      </Show>
      <p class="mx-note">{language.t("orchestra.schedule.note")}</p>
      <Show when={dialog()} keyed>
        {(current) => (
          <Switch>
            <Match when={current.type === "edit" && current}>
              {(edit) => {
                const task = saved.tasks.find((item) => item.id === edit().id)
                // Keep a saved agent selectable even when the profile no longer lists it.
                const options = () => {
                  const names = choices().map((agent) => agent.name)
                  if (!task || names.includes(task.agent)) return names.map((name) => ({ value: name, label: name }))
                  return [
                    ...names.map((name) => ({ value: name, label: name })),
                    {
                      value: task.agent,
                      label: agents.isSuccess
                        ? language.t("orchestra.schedule.agentMissing", { name: task.agent })
                        : task.agent,
                    },
                  ]
                }
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
                        <span>{language.t("orchestra.schedule.field.agent")}</span>
                        <select name="agent">
                          <Show when={agents.isPending}>
                            <option value="">{language.t("orchestra.schedule.agentsLoading")}</option>
                          </Show>
                          <Show when={agents.isError}>
                            <option value="">{language.t("orchestra.schedule.agentsError")}</option>
                          </Show>
                          <For each={options()}>
                            {(option) => (
                              <option value={option.value} selected={option.value === task?.agent}>
                                {option.label}
                              </option>
                            )}
                          </For>
                        </select>
                      </label>
                    </div>
                    <label class="mx-field">
                      <span>{language.t("orchestra.schedule.field.date")}</span>
                      <input
                        name="date"
                        type="datetime-local"
                        value={localInput(task?.next ?? Date.now() + 3_600_000)}
                        required
                      />
                    </label>
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
                  onSubmit={() => {
                    setSaved("tasks", (tasks) => tasks.filter((task) => task.id !== remove().id))
                    return undefined
                  }}
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
  onSubmit: (form: FormData) => string | undefined
  onClose: () => void
  children: JSX.Element
}) {
  const [error, setError] = createSignal("")
  const id = createUniqueId()
  let dialog!: HTMLDialogElement
  onMount(() => dialog.showModal())
  return (
    <dialog
      ref={dialog}
      class="mx-dialog schedule-dialog"
      aria-labelledby={id}
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
          const message = props.onSubmit(new FormData(event.currentTarget))
          if (message) return setError(message)
          dialog.close()
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
          <button type="submit" class="mx-btn primary">
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
