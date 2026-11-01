// @refresh reload

import {
  ACCEPTED_FILE_EXTENSIONS,
  AppBaseProviders,
  AppInterface,
  loadLocaleDict,
  normalizeLocale,
  type Locale,
  type Platform,
  PlatformProvider,
  createDraftStore,
  ServerConnection,
  useCommand,
  useWslServers,
  useLanguage,
} from "@orchestra/app"
import type { UpdaterState } from "@orchestra/app/updater"
import * as Sentry from "@sentry/solid"
import type { AsyncStorage } from "@solid-primitives/storage"
import { createMemoryHistory, MemoryRouter, type BaseRouterProps } from "@solidjs/router"
import { createEffect, createMemo, createResource, createSignal, onCleanup, Show } from "solid-js"
import { render } from "solid-js/web"
import pkg from "../../package.json"
import { t } from "./i18n"
import { dict } from "../../../../packages/app-shell/src/i18n/en"
import { openRendererPath } from "./open-path"
import { listenForDeepLinks } from "./deep-links"
import { checkedLocalServer, initializationData, recoverRemoteServer } from "./initialization"
import { DesktopFirstLaunchOnboarding } from "./onboarding"
import { resetZoom, setPinchZoomEnabled, webviewZoom, zoomIn, zoomOut } from "./webview-zoom"
import { windowFullscreen } from "./window-fullscreen"
import { caffeinate, setCaffeinate } from "./caffeinate"
import { createResponseDownloader } from "./response-download"
import { availableStartupServer, readyWslConnections } from "./wsl/connections"
import "./styles.css"
import { useTheme } from "@orchestra/ui/theme/context"

const root = document.getElementById("root")
if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(t("desktop.error.dev.rootNotFound"))
}

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE ?? `desktop@${pkg.version}`,
    initialScope: {
      tags: {
        platform: "desktop",
      },
    },
    integrations: (integrations) => {
      return integrations.filter(
        (i) =>
          i.name !== "Breadcrumbs" &&
          !(
            import.meta.env.ORCHESTRA_CHANNEL === "prod" &&
            (i.name === "GlobalHandlers" || i.name === "BrowserApiErrors")
          ),
      )
    },
  })
}

const [updaterState, setUpdaterState] = createSignal<UpdaterState>({ status: "disabled" })
let requestFailed = () => dict["common.requestFailed"]
void window.api.updater.subscribe(setUpdaterState)

type DesktopWindowState = {
  id?: string
}

function windowLastActiveUrlKey(windowID: string) {
  return `orchestra.desktop.window.${windowID}.last-active-url`
}

function getLastActiveUrl(windowID: string) {
  if (typeof localStorage !== "object") return "/"
  try {
    const value = localStorage.getItem(windowLastActiveUrlKey(windowID))
    if (value?.startsWith("/") && !value.startsWith("//")) return value
  } catch {}
  return "/"
}

function setLastActiveUrl(windowID: string, value: string) {
  if (typeof localStorage !== "object") return
  try {
    localStorage.setItem(windowLastActiveUrlKey(windowID), value)
  } catch {}
}

function DesktopMemoryRouter(props: BaseRouterProps & { windowID: string }) {
  const history = createMemoryHistory()
  const initialUrl = getLastActiveUrl(props.windowID)
  if (initialUrl !== "/") history.set({ value: initialUrl, replace: true, scroll: false })
  onCleanup(history.listen((value) => setLastActiveUrl(props.windowID, value)))
  return <MemoryRouter {...props} history={history} />
}

const createPlatform = (windowState: DesktopWindowState): Platform => {
  const attachmentPaths = new WeakMap<File, string>()
  const downloads = createResponseDownloader(window.api.responseDownload)
  const cancelDownloads = () => downloads.dispose()
  window.addEventListener("pagehide", cancelDownloads)
  onCleanup(() => {
    window.removeEventListener("pagehide", cancelDownloads)
    downloads.dispose()
  })
  const os = (() => {
    const ua = navigator.userAgent
    if (ua.includes("Mac")) return "macos"
    if (ua.includes("Windows")) return "windows"
    if (ua.includes("Linux")) return "linux"
    return undefined
  })()

  const runDesktopMenuAction: Platform["runDesktopMenuAction"] = (action) => {
    switch (action) {
      case "view.resetZoom":
        resetZoom()
        return
      case "view.zoomIn":
        zoomIn()
        return
      case "view.zoomOut":
        zoomOut()
        return
    }

    return window.api.runDesktopMenuAction(action)
  }

  const storage = (() => {
    const cache = new Map<string, AsyncStorage>()

    const createStorage = (name: string) => {
      const api: AsyncStorage = {
        getItem: (key: string) => window.api.storeGet(name, key),
        setItem: (key: string, value: string) => window.api.storeSet(name, key, value),
        removeItem: (key: string) => window.api.storeDelete(name, key),
        clear: () => window.api.storeClear(name),
        key: async (index: number) => (await window.api.storeKeys(name))[index],
        getLength: () => window.api.storeLength(name),
        get length() {
          return api.getLength()
        },
      }
      return api
    }

    return (name = "default.dat") => {
      const cached = cache.get(name)
      if (cached) return cached
      const api = createStorage(name)
      cache.set(name, api)
      return api
    }
  })()

  const wslServersApi = os === "windows" ? window.api.wslServers : undefined

  return {
    platform: "desktop",
    os,
    version: pkg.version,
    windowID: windowState.id,

    async openDirectoryPickerDialog(opts) {
      return window.api.openDirectoryPicker({
        multiple: opts?.multiple ?? false,
        title: opts?.title,
      })
    },

    async openAttachmentPickerDialog(opts, onFile) {
      const result = await window.api.openFilePicker({
        multiple: opts?.multiple ?? false,
        title: opts?.title,
        defaultPath: opts?.defaultPath,
        extensions: opts?.extensions ?? ACCEPTED_FILE_EXTENSIONS,
      })
      if (!result) return
      try {
        for (const file of result.files) {
          const selected = new File([await window.api.readPickedFile(result.token, file.path)], file.name)
          attachmentPaths.set(selected, file.path)
          await onFile(selected)
        }
      } finally {
        await window.api.releasePickedFiles(result.token)
      }
    },

    getPathForFile(file) {
      return attachmentPaths.get(file) ?? window.api.getPathForFile(file)
    },

    async saveFilePickerDialog(opts) {
      return window.api.saveFilePicker({
        title: opts?.title,
        defaultPath: opts?.defaultPath,
      })
    },

    downloadResponse: downloads.downloadResponse,

    openExternal(url: string) {
      window.api.openExternal(url)
    },
    openLocalFile(url: string) {
      window.api.openLocalFile(url)
    },
    async openPath(path: string, app?: string) {
      return openRendererPath({
        path, app, open: window.api.openPath,
        message: async () => requestFailed(),
      })
    },
    async revealPath(path: string) {
      return window.api.revealPath(path)
    },

    storage,
    draftStore: createDraftStore({
      get: window.api.draftGet,
      set: window.api.draftSet,
      remove: window.api.draftDelete,
      putBlob: (blob) => blob.arrayBuffer().then(window.api.draftBlobPut),
      getBlob: (id) => window.api.draftBlobGet(id).then((data) => data && new Blob([data])),
    }),

    updater: {
      state: updaterState,
      check: () => window.api.updater.check(),
      install: () => window.api.updater.install(),
    },

    exportDebugLogs: () => window.api.exportDebugLogs(),

    setForceFocus: (enabled) => window.api.setForceFocus(enabled),

    // Only ErrorPage records through the platform. Restart must not reopen the URL that crashed into it.
    recordFatalRendererError: (error) => {
      setLastActiveUrl(windowState.id ?? "browser", "/")
      return window.api.recordFatalRendererError(error)
    },

    restart: async () => {
      await window.api.killSidecar().catch(() => undefined)
      window.api.relaunch()
    },

    onBeforeUnload: (handler) => window.api.onBeforeUnload(handler),

    notify: async (title, description, onClick) => {
      const focused = await window.api.getWindowFocused().catch(() => document.hasFocus())
      if (focused) return

      const notification = new Notification(title, {
        body: description ?? "",
        icon: "./orchestra/hugr-symbol-primary.svg",
      })
      notification.onclick = () => {
        void window.api.showWindow()
        void window.api.setWindowFocus()
        onClick?.()
        notification.close()
      }
    },

    fetch: (input, init) => {
      if (input instanceof Request) return fetch(input)
      return fetch(input, init)
    },

    getDefaultServer: async () => {
      const url = await window.api.getDefaultServerUrl().catch(() => null)
      if (!url) return null
      return ServerConnection.Key.make(url)
    },

    setDefaultServer: async (url: string | null) => {
      await window.api.setDefaultServerUrl(url)
    },

    wslServers: wslServersApi,

    webviewZoom,

    windowFullscreen,

    caffeinate,

    setCaffeinate,
    setTitlebarFrame: (frame) => window.api.setTitlebarFrame(frame),

    getPinchZoomEnabled: () => window.api.getPinchZoomEnabled(),

    liveSeat: {
      start: (title) => window.api.startLiveMeeting(title),
      stop: () => window.api.stopLiveMeeting(),
      running: () => window.api.getLiveMeetingRunning(),
      hasTranscriptionKey: () => window.api.hasLiveTranscriptionKey(),
      setTranscriptionKey: (key) => window.api.setLiveTranscriptionKey(key),
      getContentProtection: () => window.api.getLiveOverlayContentProtection(),
      setContentProtection: (enabled) => window.api.setLiveOverlayContentProtection(enabled),
      readiness: () => window.api.getLiveReadiness(),
      requestPermission: (source) => window.api.requestLivePermission(source),
      onLevels: (listener) => window.api.onLiveLevels(listener),
      runState: () => window.api.getLiveRunState(),
      onRunState: (listener) => window.api.onLiveRunState(listener),
      rename: (meetingID, title) => window.api.renameLiveMeeting(meetingID, title),
      getSettings: () => window.api.getLiveSettings(),
      setSettings: (patch) => window.api.setLiveSettings(patch),
      getHotkeys: () => window.api.getLiveHotkeys(),
      setHotkey: (action, accelerator) => window.api.setLiveHotkey(action, accelerator),
      resetHotkeys: () => window.api.resetLiveHotkeys(),
    },

    setPinchZoomEnabled,

    runDesktopMenuAction,

    checkAppExists: async (appName: string) => {
      return window.api.checkAppExists(appName)
    },

    async readClipboardImage() {
      const image = await window.api.readClipboardImage().catch(() => null)
      if (!image) return null
      const blob = new Blob([image.buffer], { type: "image/png" })
      return new File([blob], `pasted-image-${Date.now()}.png`, {
        type: "image/png",
      })
    },
  }
}

let menuTrigger = null as null | ((id: string) => void)
window.api.onMenuCommand((id) => {
  menuTrigger?.(id)
})
listenForDeepLinks(window, window.api)

// A plain surface: the comet splash covers loading in the windows that open with the app and leaves once this is gone.
function LoadingSplash() {
  return <div class="h-dvh w-screen bg-background-base" data-app-loading />
}

function DesktopRoot(props: { windowState: DesktopWindowState }) {
  const platform = createPlatform(props.windowState)
  const loadLocale = async () => {
    const current = await platform.storage?.("orchestra.global.dat").getItem("language")
    const legacy = current ? undefined : await platform.storage?.().getItem("language.v1")
    const raw = current ?? legacy
    if (!raw) return
    const locale = raw.match(/"locale"\s*:\s*"([^"]+)"/)?.[1]
    if (!locale) return
    const next = normalizeLocale(locale)
    if (next !== "en") await loadLocaleDict(next)
    return next satisfies Locale
  }

  // Fetch sidecar credentials (available immediately, before health check)
  const [sidecar] = createResource(() => window.api.awaitInitialization())

  const [defaultServer] = createResource(() => platform.getDefaultServer?.())
  const [recovery] = createResource(
    () => !sidecar.loading && !defaultServer.loading && sidecar.error !== undefined,
    async () => {
      const { checkServerHealth } = await import("../../../../packages/app-shell/src/utils/server-health")
      const remote = await recoverRemoteServer(
        await platform.storage?.("orchestra.global.dat").getItem("server") ?? null,
        defaultServer.latest,
        (http) => checkServerHealth(http, platform.fetch ?? fetch).then((result) => result.healthy),
      )
      if (remote) {
        void window.api.recordFatalRendererError({
          error: sidecar.error instanceof Error ? sidecar.error.stack ?? sidecar.error.message : String(sidecar.error),
          url: location.href, platform: "desktop", os: platform.os, version: pkg.version,
        })
      }
      return remote ?? null
    },
  )
  const [locale] = createResource(loadLocale)
  const router = (props: BaseRouterProps) => (
    <DesktopMemoryRouter {...props} windowID={platform.windowID ?? "browser"} />
  )
  const onboarding = Promise.withResolvers<void>()

  function Inner() {
    const language = useLanguage()
    requestFailed = () => language.t("common.requestFailed")
    const cmd = useCommand()
    menuTrigger = (id) => cmd.trigger(id)

    // The native macOS menu is built once, so tell it which commands can currently run (registered and not disabled).
    createEffect(() => {
      const available = [
        ...new Set(cmd.options.filter((option) => !option.disabled && !option.id.startsWith("suggested.")).map((option) => option.id)),
      ]
      const timer = setTimeout(() => window.api.setMenuAvailability(available), 150)
      onCleanup(() => clearTimeout(timer))
    })

    const theme = useTheme()

    createEffect(() => {
      theme.themeId()
      theme.mode()
      const bg = getComputedStyle(document.documentElement).getPropertyValue("--background-base").trim()
      if (bg) {
        void window.api.setBackgroundColor(bg)
      }
    })

    return null
  }

  function App() {
    const wslServers = useWslServers()
    const language = useLanguage()
    const ready = createMemo(
      () => !defaultServer.loading && !sidecar.loading && !recovery.loading && !locale.loading && !wslServers.isLoading,
    )
    const servers = createMemo(() => {
      if (!ready()) return []
      const remote = recovery()
      const data = initializationData(sidecar, !!remote)
      const list: ServerConnection.Any[] = []
      if (remote) list.push(remote)
      if (data) {
        list.push({
          displayName: language.t("desktop.server.local"),
          type: "sidecar",
          variant: "base",
          http: {
            url: data.url,
            username: data.username ?? undefined,
            password: data.password ?? undefined,
          },
        })
      }
      list.push(...readyWslConnections(wslServers.data, language.t("wsl.server.label")))
      return list
    })
    const effectiveDefaultServer = createMemo(() =>
      ServerConnection.Key.make((recovery.loading ? undefined : recovery()?.http.url) ?? availableStartupServer(defaultServer.latest, wslServers.data)),
    )
    return (
      <Show when={ready()} fallback={<LoadingSplash />}>
        <Show when={effectiveDefaultServer()} keyed>
          {(key) => (
            <AppInterface
              defaultServer={key}
              servers={servers()}
              checkedServer={checkedLocalServer(initializationData(sidecar, !!recovery()), !!recovery())}
              router={router}
              startup={onboarding.promise}
              serverScoped={
                <DesktopFirstLaunchOnboarding
                  initialUrl={getLastActiveUrl(platform.windowID ?? "browser")}
                  onLoaded={onboarding.resolve}
                />
              }
            >
              <Inner />
            </AppInterface>
          )}
        </Show>
      </Show>
    )
  }

  return (
    <PlatformProvider value={platform}>
      <AppBaseProviders
        locale={locale.latest}
        onNativeTranslations={(bundle) => void window.api.setNativeTranslations(bundle).catch(() => undefined)}
      >
        <Show when={true}>{(_) => <App />}</Show>
      </AppBaseProviders>
    </PlatformProvider>
  )
}

render(() => {
  const [windowState] = createResource(async () => {
    const api = window.api as typeof window.api & {
      getWindowID?: () => Promise<string>
    }
    return { id: await api.getWindowID?.() }
  })

  return (
    <Show when={windowState.latest} fallback={<LoadingSplash />} keyed>
      {(state) => <DesktopRoot windowState={state} />}
    </Show>
  )
}, root!)
