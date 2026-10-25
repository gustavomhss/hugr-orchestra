import type { ScheduledTaskInfo } from "@/v2-types"
import { createEffect, createSignal, onCleanup } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { ClientError } from "@orchestra/client"
import { errorStatus } from "./agents-roster"
import { claimStorage, createClaims } from "./schedule-claims"
import { runError, TICK, type DeviceStore, type ScheduleSource } from "./schedule-device"

// Answers of servers that predate scheduled tasks.
const UNSUPPORTED = new Set([404, 405, 501])

// The server owns the tasks and runs their due slots itself; this page lists, edits and starts them, and
// shows only what the server recorded. Tasks saved on this device before are moved to the server once.
export function createServerSchedule(props: {
  directory: string
  store: DeviceStore
  onUnsupported: () => void
}): ScheduleSource {
  const language = useLanguage()
  const sdk = useSDK()
  return createServerScheduleSource(props, {
    language,
    api: () => sdk().orchestra.schedules,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  })
}

export function createServerScheduleSource(
  props: { directory: string; store: DeviceStore; onUnsupported: () => void },
  input: {
    language: Pick<ReturnType<typeof useLanguage>, "t">
    api: () => ReturnType<ReturnType<typeof useSDK>>["orchestra"]["schedules"]
    timezone: string
    poll?: (refresh: () => void) => () => void
  },
): ScheduleSource {
  const language = input.language
  const api = input.api
  const location = { directory: props.directory }
  const timezone = input.timezone
  const [state, setState] = createStore({
    status: "loading" as "loading" | "ready" | "error",
    tasks: [] as ScheduledTaskInfo[],
    running: {} as Record<string, boolean>,
    error: "",
  })
  const lifetime = { disposed: false, migrating: false, supported: false }
  const [moved, setMoved] = createSignal<"pending" | "failed">("pending")
  const failure = (error: unknown) =>
    !(error instanceof ClientError) && error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message
      : language.t("common.requestFailed")
  const name = (id: string) => state.tasks.find((task) => task.id === id)?.name ?? ""

  // Polled while the page is open, so runs the server starts on its own show up here.
  const load = async () => {
    const result = await api()
      .list({ location })
      .then(
        (body: unknown) => ({ body, status: 200 }),
        (error: unknown) => ({ body: undefined, status: answerStatus(error) }),
      )
    if (lifetime.disposed) return
    const body = result.body
    if (body && typeof body === "object" && "data" in body && Array.isArray(body.data)) {
      lifetime.supported = true
      setState("tasks", reconcile(body.data as ScheduledTaskInfo[], { key: "id" }))
      setState("status", "ready")
      // A move that failed is retried on every refresh until the device list is empty.
      if (moved() === "failed") void migrate()
      return
    }
    // An older server answers 404, or a page from its UI fallback instead of the list.
    if (!lifetime.supported && result.status !== undefined && (result.status === 200 || UNSUPPORTED.has(result.status)))
      return props.onUnsupported()
    setState("status", "error")
  }

  // Creating with the device task's ID adopts a task another window already moved, so a retry is safe.
  const migrate = async () => {
    const tasks = props.store.saved.tasks.slice()
    if (lifetime.migrating || tasks.length === 0) return
    lifetime.migrating = true
    try {
      for (const task of tasks) {
        const error = await api()
          .create({
            location,
            id: task.id,
            name: task.name,
            prompt: task.prompt,
            cadence: task.cadence,
            next: task.next,
            timezone,
            minute: task.minute,
            enabled: task.enabled,
            history: { runs: task.runs, missed: task.missed, last: task.last },
          })
          .then(
            () => undefined,
            (error: unknown) => ({ error }),
          )
        if (lifetime.disposed) return
        if (error) {
          setMoved("failed")
          return setState("error", language.t("orchestra.schedule.migrateError", { detail: failure(error.error) }))
        }
      }
      const ids = new Set(tasks.map((task) => task.id))
      const claims = createClaims(claimStorage(), undefined)
      ids.forEach((id) => claims.forget(id))
      props.store.setSaved("tasks", (current) => current.filter((task) => !ids.has(task.id)))
      setMoved("pending")
      setState("error", "")
      await load()
    } finally {
      lifetime.migrating = false
    }
  }
  createEffect(() => {
    if (state.status === "ready" && props.store.ready() && props.store.saved.tasks.length > 0) void migrate()
  })
  // The server list alone would hide tasks still on this device, so it shows once they moved or could not.
  const status = () => {
    if (state.status !== "ready") return state.status
    if (!props.store.ready()) return "loading"
    if (props.store.saved.tasks.length > 0 && moved() === "pending") return "loading"
    return "ready"
  }

  void load()
  const stopPolling = (
    input.poll ??
    ((refresh) => {
      const timer = setInterval(refresh, TICK)
      return () => clearInterval(timer)
    })
  )(() => void load())
  onCleanup(() => {
    lifetime.disposed = true
    stopPolling()
  })

  const update = async (id: string, input: { enabled: boolean }) => {
    await api()
      .update({ scheduleID: id, location, ...input })
      .catch((error: unknown) =>
        setState("error", language.t("orchestra.schedule.updateError", { name: name(id), detail: failure(error) })),
      )
    await load()
  }

  return {
    status,
    tasks: () => state.tasks,
    error: () => state.error,
    running: (id) => !!state.running[id],
    save: async (id, fields, resumed) => {
      const task = state.tasks.find((task) => task.id === id)
      // Core re-anchors recurrence when any timing field is sent. Metadata-only edits omit all
      // three; a changed time/cadence is entered in this browser's zone and explicitly re-anchors it.
      const timed = !task || task.next !== fields.next || task.cadence !== fields.cadence
      const error = await (
        id
          ? api().update({
              scheduleID: id,
              location,
              name: fields.name,
              prompt: fields.prompt,
              ...(timed ? { next: fields.next, cadence: fields.cadence, timezone } : {}),
              ...(resumed ? { enabled: true } : {}),
            })
          : api().create({ location, ...fields, timezone })
      ).then(
        () => undefined,
        (error: unknown) => ({ error }),
      )
      if (error) return failure(error.error)
      await load()
      return undefined
    },
    setEnabled: (id, enabled) => update(id, { enabled }),
    refresh: load,
    remove: async (id) => {
      const task = name(id)
      const error = await api()
        .remove({ scheduleID: id, location })
        .then(
          () => undefined,
          (error: unknown) => ({ error }),
        )
      // A task another window already removed counts as removed.
      if (error && !notFound(error.error))
        return language.t("orchestra.schedule.removeError", { name: task, detail: failure(error.error) })
      await load()
      return undefined
    },
    run: async (id) => {
      if (state.running[id]) return
      const task = name(id)
      setState("running", id, true)
      setState("error", "")
      try {
        const result = await api()
          .run({ scheduleID: id, location })
          .then(
            (data) => ({ data, error: undefined }),
            (error: unknown) => ({ data: undefined, error }),
          )
        const sessionID = result.data?.data.sessionID
        if (!sessionID && !lifetime.disposed) setState("error", runError(language, task, result.error))
        return sessionID
      } finally {
        setState("running", id, false)
        void load()
      }
    },
  }
}

// An undeclared answer throws a ClientError carrying its status. A 200 that is not JSON, such as an older server's
// UI fallback page, throws one without a status and counts as the 200 it was.
function answerStatus(error: unknown) {
  if (error instanceof ClientError && (error.reason === "UnsupportedContentType" || error.reason === "MalformedResponse"))
    return 200
  return errorStatus(error)
}

function notFound(error: unknown) {
  if (error instanceof ClientError) return errorStatus(error) === 404
  return !!error && typeof error === "object" && "_tag" in error && error._tag === "ScheduleNotFoundError"
}
