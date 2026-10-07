import { makeEventListener } from "@solid-primitives/event-listener"
import { getFilename } from "@orchestra/core/util/path"
import { Option, Schema } from "effect"
import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  Match,
  on,
  onCleanup,
  onMount,
  Show,
  Switch,
  type JSX,
} from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { useGlobal } from "@/context/global"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { ServerConnection } from "@/context/server"
import { useSync } from "@/context/sync"
import { useTabs } from "@/context/tabs"
import { displayName, errorMessage } from "@/pages/layout/helpers"
import { Identifier } from "@/utils/id"
import { pathKey } from "@/utils/path-key"
import { Persist, persisted } from "@/utils/persist"
import { normalizeSessionInfo } from "@/utils/session"
import type { ChapterPageProps } from "../chapter-route"
import { MxBadge, MxPage, MxToggle } from "./kit"
import { claimStorage, createClaims } from "./schedule-claims"
import {
  CADENCES,
  canResume,
  localInput,
  localMinute,
  plan,
  readTasks,
  recordRun,
  resume,
  skipRun,
  slotIDs,
  type ScheduleTask,
} from "./schedule-model"
import "./schedule.css"

// Due tasks are checked once the saved list is ready and then on this cadence while the page is mounted.
const TICK = 15_000
// One hung request must not stall the scheduler; the slot claim outlives this (CLAIM_TTL).
const TIMEOUT = 60_000
// The user talks only to Maestro, so every scheduled run is a Maestro session, like every chat.
const AGENT = "maestro"
const decode = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)

type DialogInput = { type: "edit"; id?: string; resume?: boolean } | { type: "remove"; id: string }
type Dialog = DialogInput & { key: number }

export default function SchedulePage(props: ChapterPageProps) {
  const language = useLanguage()
  const sdk = useSDK()
  const sync = useSync()
  const global = useGlobal()
  const tabs = useTabs()
  const target = Persist.serverWorkspace(sdk().scope, props.directory, "orchestra.schedule")
  const [saved, setSaved, , ready] = persisted(
    { ...target, migrate: readTasks },
    createStore({ tasks: [] as ScheduleTask[] }),
  )
  const [state, setState] = createStore({
    search: "",
    running: {} as Record<string, boolean>,
    error: "",
  })
  // A signal, not the store: a store merges a new dialog into the open one instead of replacing it.
  const [dialog, setDialog] = createSignal<Dialog>()
  const lifetime = { disposed: false, dialogs: 0, ticking: false }
  const claims = createClaims(claimStorage(), typeof navigator === "undefined" ? undefined : navigator.locks)
  const profile = createMemo(() => {
    const project = global
      .ensureServerCtx(props.server)
      .projects.list()
      .find((item) => pathKey(item.worktree) === pathKey(props.directory))
    return project ? displayName(project) : getFilename(props.directory) || props.directory
  })
  const cadence = (task: ScheduleTask) => language.t(`orchestra.schedule.cadence.${task.cadence}`)
  const status = (task: ScheduleTask) =>
    language.t(task.enabled ? "orchestra.schedule.status.enabled" : "orchestra.schedule.status.paused")
  const visible = createMemo(() => {
    const query = state.search.trim().toLowerCase()
    if (!query) return saved.tasks
    return saved.tasks.filter((task) =>
      [task.name, task.prompt, cadence(task), status(task)].some((text) => text.toLowerCase().includes(query)),
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
  const find = (id: string) => saved.tasks.find((task) => task.id === id)
  const update = (id: string, next: (task: ScheduleTask) => ScheduleTask) =>
    setSaved("tasks", (task) => task.id === id, next)
  const show = (input: DialogInput) => setDialog({ ...input, key: ++lifetime.dialogs })
  // A replaced dialog still fires its close event later; only the current one may clear the state.
  const hide = (key: number) => {
    if (dialog()?.key === key) setDialog(undefined)
  }

  // Other tabs and windows save the same list; adopt their writes so this page plans from fresh data.
  // The key mirrors the persisted web storage layout (`<storage>:<key>`); desktop storage has no events.
  makeEventListener(window, "storage", (event) => {
    if (event.key !== `${target.storage}:${target.key}`) return
    setSaved(reconcile(readTasks(Option.getOrUndefined(decode(event.newValue ?? "")))))
  })

  // Starts a real session on this profile. The scheduler only serves a due slot it could claim; Run now
  // (`forced`) serves the due slot when it can claim it and otherwise starts an extra run.
  const dispatch = async (id: string, forced: boolean) => {
    const task = find(id)
    if (!task || state.running[id]) return
    // Mark the task busy before any await so a Run now and a tick in this page cannot both start it.
    setState("running", id, true)
    try {
      const now = Date.now()
      const due = plan(task, now)
      if (!forced && due.type !== "run") return
      const claimed = due.type === "run" ? await claims.take(id, due.slot, now, forced).catch(() => false) : false
      const slot = due.type === "run" && claimed ? due.slot : undefined
      // Re-check live after the claim: the task may have been removed, paused or rescheduled meanwhile.
      const live = find(id)
      const recheck = live ? plan(live, Date.now()) : undefined
      if (!live || (!forced && (slot === undefined || recheck?.type !== "run" || recheck.slot !== slot))) {
        if (slot !== undefined) claims.settle(id, slot, undefined)
        return
      }
      setState("error", "")
      const ids = slot === undefined ? undefined : slotIDs(id, slot)
      const signal = AbortSignal.timeout(TIMEOUT)
      const v2 = (await sdk().protocol) !== "v1"
      const result = await abortable(
        sdk().api.session.create(
          { id: ids?.session, agent: AGENT, location: { directory: props.directory } },
          { signal },
        ),
        signal,
      )
        .then(normalizeSessionInfo)
        .then((session) => {
          sync().session.remember(session)
          return abortable(
            sdk().api.session.prompt({
              sessionID: session.id,
              id: ids?.message ?? Identifier.ascending("message"),
              text: live.prompt,
              agent: AGENT,
            }),
            signal,
          ).then(
            () => ({ sessionID: session.id, error: undefined }),
            async (error: unknown) => {
              // An unprompted session is noise. Keep it only when Run now released the slot on V2,
              // where a retry of the slot adopts it through the same deterministic IDs.
              if (!(v2 && ids && forced))
                await sdk()
                  .api.session.remove({ sessionID: session.id, directory: props.directory })
                  .catch(() => undefined)
              throw error
            },
          )
        })
        .catch((error: unknown) => ({ sessionID: "", error: error ?? new Error() }))
      if (!result.sessionID) {
        // Only the scheduler marks a slot failed; a failed Run now leaves it for the scheduler or a retry.
        if (slot !== undefined) claims.settle(id, slot, forced ? undefined : "failed")
        if (lifetime.disposed) return
        // V2 rejects with the parsed error body, V1 with its legacy body; both may carry only `message`.
        const error = result.error
        const message =
          error && typeof error === "object" && "message" in error && typeof error.message === "string"
            ? error.message
            : language.t("common.requestFailed")
        setState(
          "error",
          language.t("orchestra.schedule.runError", { name: live.name, detail: errorMessage(error, message) }),
        )
        return
      }
      if (slot !== undefined) claims.settle(id, slot, "done")
      const time = Date.now()
      update(id, (current) =>
        recordRun(
          current,
          // A task rescheduled during the run keeps its new time; the run counts as an extra run.
          slot !== undefined && current.next === live.next
            ? { time, sessionID: result.sessionID, slot, missed: due.type === "run" ? due.missed : undefined }
            : { time, sessionID: result.sessionID },
        ),
      )
      return result.sessionID
    } finally {
      setState("running", id, false)
    }
  }
  const openSession = (sessionID: string) =>
    tabs.select(tabs.addSessionTab({ server: ServerConnection.key(props.server), sessionId: sessionID }))

  const tick = async () => {
    if (!ready() || lifetime.ticking || lifetime.disposed) return
    lifetime.ticking = true
    try {
      const now = Date.now()
      const work = saved.tasks.map((task) => ({ id: task.id, next: plan(task, now) }))
      // Too late to run: mark the slot missed and move on. Writing the same result twice is harmless.
      work.forEach((item) => {
        if (item.next.type !== "skip") return
        update(item.id, (task) => {
          const live = plan(task, now)
          return live.type === "skip" ? skipRun(task, live.slot, now) : task
        })
      })
      for (const item of work) {
        if (lifetime.disposed) return
        if (item.next.type === "run") await dispatch(item.id, false)
      }
    } finally {
      lifetime.ticking = false
    }
  }
  createEffect(on(ready, (value) => value && void tick()))
  onMount(() => {
    const timer = setInterval(() => void tick(), TICK)
    onCleanup(() => clearInterval(timer))
  })
  onCleanup(() => {
    lifetime.disposed = true
  })

  const save = (edit: Extract<Dialog, { type: "edit" }>, form: FormData) => {
    const name = String(form.get("name") ?? "").trim()
    const prompt = String(form.get("prompt") ?? "").trim()
    const next = new Date(String(form.get("date") ?? "")).getTime()
    if (!name) return language.t("orchestra.schedule.error.name")
    if (!prompt) return language.t("orchestra.schedule.error.prompt")
    if (!Number.isFinite(next)) return language.t("orchestra.schedule.error.date")
    if (next <= Date.now()) return language.t("orchestra.schedule.error.past")
    const fields = {
      name,
      prompt,
      next,
      minute: localMinute(next),
      cadence: CADENCES.find((item) => item === form.get("cadence")) ?? "once",
      missed: undefined,
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
                          void dispatch(task.id, true).then((sessionID) => {
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
                  <Show when={task.missed}>
                    {(missed) => (
                      <p class="mx-note schedule-missed">
                        {language.t("orchestra.schedule.missed", { date: nextFormat().format(missed()) })}
                      </p>
                    )}
                  </Show>
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
                  onSubmit={() => {
                    setSaved("tasks", (tasks) => tasks.filter((task) => task.id !== remove().id))
                    claims.forget(remove().id)
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

function abortable<T>(promise: Promise<T>, signal: AbortSignal) {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason)
    signal.addEventListener("abort", () => reject(signal.reason), { once: true })
    promise.then(resolve, reject)
  })
}
