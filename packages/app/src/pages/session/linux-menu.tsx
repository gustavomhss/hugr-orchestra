import { createEffect, For, on, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { AppDockLinuxAPI, LinuxApp, LinuxError, LinuxOpenResult } from "../../app-dock-linux"
import { useLanguage } from "../../context/language"
import "./linux-menu.css"

type LinuxMenuOptions = {
  api: Partial<AppDockLinuxAPI> | undefined
  profile: string
  generation: () => number
  disabled: boolean
  open: () => Promise<LinuxOpenResult | undefined>
  onLaunched?: () => void | Promise<void>
}
type LinuxAction = { type: "open" | "install" } | { type: "launch"; appID: string }

export function LinuxMenu(props: { controller: ReturnType<typeof createLinuxMenuController>; collapsed: boolean }) {
  const language = useLanguage()
  const menu = props.controller
  const errorText = () => {
    if (menu.store.error === "unavailable") return language.t("appDock.linux.unavailable")
    if (menu.store.error === "invalid-package") return language.t("appDock.linux.invalidPackage")
    if (menu.store.error === "architecture-mismatch") return language.t("appDock.linux.architectureMismatch")
    return language.t("common.requestFailed")
  }

  return (
    <section class="zen-linux" aria-label={language.t("appDock.linux.apps")} aria-busy={!!menu.store.busy}>
      <div class="zen-linux-heading">
        <button
          class="zen-linux-open"
          type="button"
          aria-label={language.t("appDock.linux.open")}
          title={menu.store.error ? errorText() : language.t("appDock.linux.shared")}
          disabled={menu.blocked() || !menu.capability("appDockLinuxOpen")}
          onClick={() => void menu.run({ type: "open" })}
        >
          <bdi dir="ltr">{language.t("appDock.linux.title")}</bdi>
          <span class="zen-linux-detail">{language.t("common.open")}</span>
        </button>
        <Show when={!props.collapsed}>
          <button
            type="button"
            aria-label={language.t("appDock.linux.installPackage")}
            title={language.t("appDock.linux.installPackage")}
            disabled={menu.blocked() || !menu.capability("appDockLinuxInstall")}
            onClick={() => void menu.run({ type: "install" })}
          >
            {language.t("wsl.onboarding.install")}
          </button>
        </Show>
      </div>
        <Show when={menu.capability("appDockLinuxList")}>
          <ul class="zen-linux-apps" aria-label={language.t("appDock.linux.apps")}>
            <For each={menu.store.apps}>
              {(app) => (
                <li>
                  <button
                    type="button"
                    aria-label={language.t("session.header.open.action", { app: app.name })}
                    title={language.t("session.header.open.action", { app: app.name })}
                    disabled={
                      menu.blocked() || !menu.capability("appDockLinuxOpen") || !menu.capability("appDockLinuxLaunch")
                    }
                    onClick={() => void menu.run({ type: "launch", appID: app.id })}
                  >
                    <bdi dir="auto">{props.collapsed ? app.name.slice(0, 1) : app.name}</bdi>
                  </button>
                </li>
              )}
            </For>
          </ul>
          <Show when={!menu.store.loading && !menu.store.busy && !menu.store.error && menu.store.apps.length === 0}>
            <p>{language.t("appDock.linux.empty")}</p>
          </Show>
        </Show>
        <Show when={menu.store.loading || menu.store.busy}>
          <p role="status" aria-live="polite">
            {menu.store.busyApp
              ? language.t("appDock.linux.openingApp", { app: menu.store.apps.find(app => app.id === menu.store.busyApp)?.name ?? "" })
              : language.t(menu.store.busy === "install" ? "wsl.onboarding.installing" : "common.loading")}
          </p>
        </Show>
        <Show when={menu.store.error}>
          <p role="alert">{errorText()}</p>
        </Show>
    </section>
  )
}

// Async ownership stays with the mounted profile. The runtime itself is shared.
export function createLinuxMenuController(props: LinuxMenuOptions) {
  const [store, setStore] = createStore<{
    apps: LinuxApp[]
    loading: boolean
    busy?: LinuxAction["type"]
    busyApp?: string
    error?: LinuxError
  }>({ apps: [], loading: false })
  let request = 0
  let listing = 0
  let disposed = false
  const capability = (name: keyof AppDockLinuxAPI) => typeof props.api?.[name] === "function"
  const blocked = () => props.disabled || !!store.busy
  const guard = () => {
    const id = request
    const generation = props.generation()
    const profile = props.profile
    return () =>
      !disposed && !props.disabled && id === request && generation === props.generation() && profile === props.profile
  }
  const refresh = () => {
    if (disposed || props.disabled || !capability("appDockLinuxList")) return Promise.resolve()
    const current = guard()
    const id = ++listing
    setStore("loading", true)
    return props.api!.appDockLinuxList!()
      .then((state) => {
        if (current() && id === listing) setStore({ apps: state.apps, error: state.error })
      })
      .catch(() => {
        if (current() && id === listing) setStore("error", "failed")
      })
      .finally(() => {
        if (current() && id === listing) setStore("loading", false)
      })
  }
  const run = async (action: LinuxAction) => {
    if (disposed || blocked()) return
    if (action.type === "install" && !capability("appDockLinuxInstall")) return
    if (action.type !== "install" && !capability("appDockLinuxOpen")) return
    if (action.type === "launch" && !capability("appDockLinuxLaunch")) return
    ++request
    ++listing
    const current = action.type === "install" ? () => !disposed : guard()
    const dock = props.api!
    setStore({ busy: action.type, busyApp: action.type === "launch" ? action.appID : undefined, loading: false, error: undefined })
    await (async () => {
      if (action.type === "install") {
        // Main owns the file picker; the renderer never receives a host path.
        const result = await dock.appDockLinuxInstall!()
        if (!current()) return
        if (result.status === "cancelled") return
        if (result.status === "failed") {
          setStore("error", result.code)
          return
        }
        setStore("apps", result.apps)
        await refresh()
        return
      }
      const opened = await props.open()
      if (!current() || !opened) return
      if (opened.status === "failed") {
        setStore("error", opened.code)
        return
      }
      if (action.type === "launch") {
        const result = await dock.appDockLinuxLaunch!(action.appID)
        if (!current()) return
        if (result.status === "failed") {
          await refresh()
          if (current()) setStore("error", result.code)
        }
        if (result.status === "launched") await props.onLaunched?.()
        return
      }
      await refresh()
    })()
      .catch(() => {
        if (current()) setStore("error", "failed")
      })
      .finally(() => {
        if (current()) setStore({ busy: undefined, busyApp: undefined })
      })
  }
  createEffect(
    on(
      () => [props.profile, props.generation(), props.disabled, props.api],
      () => {
        ++request
        ++listing
        setStore({ busy: store.busy === "install" ? "install" : undefined, busyApp: undefined, loading: false, error: undefined })
        void refresh()
      },
    ),
  )
  onCleanup(() => {
    disposed = true
  })
  return { store, blocked, capability, refresh, run }
}
