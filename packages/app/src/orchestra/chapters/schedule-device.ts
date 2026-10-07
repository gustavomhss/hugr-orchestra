import { makeEventListener } from "@solid-primitives/event-listener"
import { Option, Schema } from "effect"
import { createEffect, on, onCleanup, onMount } from "solid-js"
import { createStore, reconcile, type SetStoreFunction } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { errorMessage } from "@/pages/layout/helpers"
import { Identifier } from "@/utils/id"
import { normalizeSessionInfo } from "@/utils/session"
import { claimStorage, createClaims } from "./schedule-claims"
import {
  localMinute,
  plan,
  readTasks,
  recordRun,
  resume,
  skipRun,
  slotIDs,
  type Cadence,
  type ScheduleTask,
} from "./schedule-model"

// What the schedule page shows and does, whether the server runs the tasks or this page does.
export type ScheduleRun =
  | { outcome: "started"; time: number; sessionID: string }
  | { outcome: "failed"; time: number; error: string }
export type ScheduleItem = {
  id: string
  name: string
  prompt: string
  cadence: Cadence
  // Zone that anchors daily and weekly slots and in which the next run is shown.
  timezone: string
  next: number
  enabled: boolean
  runs: number
  missed?: number
  last?: ScheduleRun
}
export type ScheduleFields = Pick<ScheduleItem, "name" | "prompt" | "cadence" | "next">
export type ScheduleSource = {
  status: () => "loading" | "ready" | "error"
  tasks: () => ScheduleItem[]
  error: () => string
  running: (id: string) => boolean
  // Resolves with a message for the dialog when the save was refused.
  save: (id: string | undefined, fields: ScheduleFields, resume: boolean) => Promise<string | undefined>
  setEnabled: (id: string, enabled: boolean) => Promise<void>
  remove: (id: string) => Promise<void>
  // Resolves with the run's Session, or nothing when it did not start (`error` says why).
  run: (id: string) => Promise<string | undefined>
}
export type DeviceStore = {
  saved: { tasks: ScheduleTask[] }
  setSaved: SetStoreFunction<{ tasks: ScheduleTask[] }>
  ready: () => boolean
  // `<storage>:<key>` of the persisted list, as other tabs announce it in storage events.
  key: string
}

// Due tasks are checked once the saved list is ready and then on this cadence while the page is mounted.
export const TICK = 15_000
// One hung request must not stall the scheduler; the slot claim outlives this (CLAIM_TTL).
const TIMEOUT = 60_000
// The user talks only to Maestro, so every scheduled run is a Maestro session, like every chat.
const AGENT = "maestro"
const decode = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)

// Servers without scheduled tasks: tasks are saved on this device and run from this page while it is open.
export function createDeviceSchedule(props: { directory: string; store: DeviceStore }): ScheduleSource {
  const language = useLanguage()
  const sdk = useSDK()
  const sync = useSync()
  const store = props.store
  const [state, setState] = createStore({ running: {} as Record<string, boolean>, error: "" })
  const lifetime = { disposed: false, ticking: false }
  const claims = createClaims(claimStorage(), typeof navigator === "undefined" ? undefined : navigator.locks)
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const find = (id: string) => store.saved.tasks.find((task) => task.id === id)
  const update = (id: string, next: (task: ScheduleTask) => ScheduleTask) =>
    store.setSaved("tasks", (task) => task.id === id, next)

  // Other tabs and windows save the same list; adopt their writes so this page plans from fresh data.
  // Desktop storage has no events.
  makeEventListener(window, "storage", (event) => {
    if (event.key !== store.key) return
    store.setSaved(reconcile(readTasks(Option.getOrUndefined(decode(event.newValue ?? "")))))
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
        setState("error", runError(language, live.name, result.error))
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

  const tick = async () => {
    if (!store.ready() || lifetime.ticking || lifetime.disposed) return
    lifetime.ticking = true
    try {
      const now = Date.now()
      const work = store.saved.tasks.map((task) => ({ id: task.id, next: plan(task, now) }))
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
  createEffect(on(store.ready, (value) => value && void tick()))
  onMount(() => {
    const timer = setInterval(() => void tick(), TICK)
    onCleanup(() => clearInterval(timer))
  })
  onCleanup(() => {
    lifetime.disposed = true
  })

  return {
    status: () => "ready",
    tasks: () =>
      store.saved.tasks.map((task) => ({
        ...task,
        timezone,
        last: task.last && { outcome: "started" as const, time: task.last.time, sessionID: task.last.sessionID },
      })),
    error: () => state.error,
    running: (id) => !!state.running[id],
    save: async (id, fields, resumed) => {
      const saved = { ...fields, minute: localMinute(fields.next), missed: undefined }
      if (id) update(id, (task) => ({ ...task, ...saved, enabled: resumed ? true : task.enabled }))
      if (!id)
        store.setSaved("tasks", store.saved.tasks.length, { id: crypto.randomUUID(), ...saved, enabled: true, runs: 0 })
      return undefined
    },
    setEnabled: async (id, enabled) =>
      update(id, (task) => (enabled ? resume(task, Date.now()) : { ...task, enabled: false })),
    remove: async (id) => {
      store.setSaved("tasks", (tasks) => tasks.filter((task) => task.id !== id))
      claims.forget(id)
    },
    run: (id) => dispatch(id, true),
  }
}

// V2 rejects with the parsed error body, V1 with its legacy body; both may carry only `message`.
export function runError(language: ReturnType<typeof useLanguage>, name: string, error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message
      : language.t("common.requestFailed")
  return language.t("orchestra.schedule.runError", { name, detail: errorMessage(error, message) })
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal) {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason)
    signal.addEventListener("abort", () => reject(signal.reason), { once: true })
    promise.then(resolve, reject)
  })
}
