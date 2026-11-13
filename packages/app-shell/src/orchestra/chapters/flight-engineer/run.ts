import { createEffect, createMemo, createRoot, createSignal, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import type { LiveHotkey, LiveReadiness, LiveRunState, LiveSeatPlatform, LiveSource } from "@/context/platform"
import { usePlatform } from "@/context/platform"
import { useLanguage } from "@/context/language"
import { showToast } from "@/utils/toast"
import { devSeat } from "./dev"
import type { StartOptions } from "./model"
import { settleHotkeyRead } from "./hotkey"
import { settleRename } from "./rename"
import { settleProtectionRead } from "./protection"
import { refreshReadiness, settlePermissionAsk } from "./readiness"
import { settleRunRead, settleRunStop } from "./run-state"

// What the bridge's start() takes once it carries the consent answer. The frozen LiveSeatPlatform type declares only
// the title, so the answer is handed over through this wider signature (a function with fewer parameters is assignable).
type StartWith = (title: string | undefined, options: StartOptions) => ReturnType<LiveSeatPlatform["start"]>

type Dialog = "none" | "consent" | "permission"

// One run-state for every window surface: the sidebar, the Home card and the chapter read it, none of them owns it.
function create(seat: () => LiveSeatPlatform | undefined, t: ReturnType<typeof useLanguage>["t"]) {
  const [store, setStore] = createStore({
    run: { running: false } as LiveRunState,
    readiness: undefined as LiveReadiness | undefined,
    hotkeys: [] as LiveHotkey[],
    protection: undefined as boolean | undefined,
    dialog: "none" as Dialog,
    starting: false,
    waiting: false,
    readinessFailed: false,
    protectionFailed: false,
    hotkeysFailed: false,
    renameFailed: false,
    runKnown: false,
    runFailed: false,
    stopFailed: false,
    stopBusy: false,
  })
  const [now, setNow] = createSignal(Date.now())
  let protectionRead = 0
  let hotkeyRead = 0
  let renameWrite = 0
  let runRead = 0
  let stopWrite = 0

  const reportProtection = (error: unknown) => {
    console.error(error)
    if (!store.protectionFailed) showToast({ variant: "error", title: t("common.requestFailed") })
    setStore("protectionFailed", true)
  }
  const loadProtection = () => {
    const started = ++protectionRead
    const current = seat()
    return settleProtectionRead({
      read: current?.getContentProtection(),
      current: () => started === protectionRead && seat() !== undefined,
      apply: (value) => setStore({ protection: value, protectionFailed: false }),
      report: reportProtection,
    })
  }

  const reportRun = (error: unknown) => {
    console.error(error)
    if (!store.runFailed) showToast({ variant: "error", title: t("common.requestFailed") })
    setStore("runFailed", true)
  }
  const reportStop = (error: unknown) => {
    console.error(error)
    if (!store.stopFailed) showToast({ variant: "error", title: t("common.requestFailed") })
    setStore("stopFailed", true)
  }
  createEffect(() => {
    const current = seat()
    const started = ++runRead
    if (!current) return setStore({ run: { running: false }, runKnown: false, runFailed: false, stopFailed: false, stopBusy: false })
    setStore({ runKnown: false, runFailed: false, stopFailed: false, stopBusy: false })
    void settleRunRead({
      read: Promise.resolve().then(() => current.runState()),
      current: () => started === runRead && seat() === current,
      apply: (state) => setStore({ run: state, runKnown: true, runFailed: false }),
      report: reportRun,
    })
    const off = current.onRunState((state) => {
      if (seat() !== current) return
      runRead++
      setStore({ run: state, runKnown: true, runFailed: false })
    })
    onCleanup(off)
    void readiness()
    void hotkeys()
    void loadProtection()
  })

  // The note belongs to the meeting on screen. Stopping ends it; the toast already reported the failed rename.
  createEffect(() => {
    if (store.run.running) return
    setStore({ renameFailed: false, stopFailed: false })
  })

  createEffect(() => {
    if (!store.runKnown || !store.run.running) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    onCleanup(() => clearInterval(timer))
  })

  // The window regains focus when the owner comes back from System Settings.
  createEffect(() => {
    if (!seat()) return
    const refresh = () => void readiness()
    window.addEventListener("focus", refresh)
    onCleanup(() => window.removeEventListener("focus", refresh))
  })

  const reportReadiness = (error: unknown) => {
    console.error(error)
    if (!store.readinessFailed) showToast({ variant: "error", title: t("common.requestFailed") })
    setStore("readinessFailed", true)
  }
  const readiness = () =>
    refreshReadiness({
      read: seat()?.readiness(),
      apply: (value) => setStore({ readiness: value, readinessFailed: false }),
      report: reportReadiness,
      finish: () => setStore("waiting", false),
    })

  const reportHotkeys = (error: unknown) => {
    console.error(error)
    if (!store.hotkeysFailed) showToast({ variant: "error", title: t("common.requestFailed") })
    setStore("hotkeysFailed", true)
  }
  const hotkeys = () => {
    const started = ++hotkeyRead
    const current = seat()
    return settleHotkeyRead({
      read: current?.getHotkeys(),
      current: () => started === hotkeyRead && seat() !== undefined,
      apply: (value) => setStore({ hotkeys: value, hotkeysFailed: false }),
      report: reportHotkeys,
    })
  }

  const elapsed = createMemo(() => (store.run.running ? Math.max(0, now() - store.run.startedAt) : 0))

  const showPermissions = () => {
    setStore("dialog", "permission")
    void readiness()
  }

  const fail = (reason: string) =>
    showToast({
      variant: "error",
      title: t("live.start.failed"),
      description: t(`live.start.reason.${reason}` as "live.start.reason.server"),
    })

  return {
    store,
    elapsed,
    available: () => seat() !== undefined,
    seat,
    readiness,
    hotkeys,
    setProtection: (value: boolean) => setStore("protection", value),
    // Consent is asked at every start, with no remembered answer.
    requestStart: () => setStore("dialog", "consent"),
    showPermissions,
    closeDialog: () => setStore({ dialog: "none", waiting: false }),
    async start(options: StartOptions) {
      const current = seat()
      if (!current || store.starting) return
      setStore("starting", true)
      const start: StartWith = current.start.bind(current)
      const result = await start(undefined, options).catch(() => ({ ok: false, reason: "server" }) as const)
      setStore("starting", false)
      if (result.ok) return setStore("dialog", "none")
      if (result.reason === "permission") return showPermissions()
      setStore("dialog", "none")
      fail(result.reason)
    },
    stop: () => {
      if (store.stopBusy) return
      const current = seat()
      if (!current) return
      const started = ++stopWrite
      setStore("stopBusy", true)
      return settleRunStop({
        write: Promise.resolve().then(() => current.stop()),
        current: () => started === stopWrite && seat() === current,
        clear: () => setStore("stopFailed", false),
        report: reportStop,
      }).then((saved) => {
        if (started === stopWrite) setStore("stopBusy", false)
        return saved
      })
    },
    async rename(title: string) {
      const run = store.run
      if (!run.running) return
      const current = seat()
      if (!current) return
      const started = ++renameWrite
      const meetingID = run.meetingID
      await settleRename({
        write: current.rename(meetingID, title),
        current: () => started === renameWrite && seat() === current,
        clear: () => setStore("renameFailed", false),
        report: (error) => {
          console.error(error)
          if (store.run.running && store.run.meetingID === meetingID) setStore("renameFailed", true)
          showToast({ variant: "error", title: t("orchestra.flightEngineer.settings.failed") })
        },
      })
    },
    async ask(source: LiveSource) {
      setStore("waiting", true)
      const opened = await settlePermissionAsk({
        request: Promise.resolve().then(() => seat()?.requestPermission(source)),
        report: reportReadiness,
      })
      if (!opened) setStore("waiting", false)
      if (opened) await readiness()
    },
  }
}

// The dev fixture registers itself here; a production build drops this branch and the file with it.
if (import.meta.env?.DEV) void import("./fixture")

let shared: ReturnType<typeof create> | undefined
// The words follow the current locale without rebuilding the shared state.
let words: ReturnType<typeof useLanguage>["t"] | undefined

export function useFlight() {
  const platform = usePlatform()
  const language = useLanguage()
  words = language.t
  shared ??= createRoot(() =>
    create(
      () => devSeat() ?? platform.liveSeat,
      ((key: Parameters<typeof language.t>[0]) => words?.(key) ?? key) as typeof language.t,
    ),
  )
  return shared
}
