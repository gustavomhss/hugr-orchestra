import { createMemo } from "solid-js"
import type { UpdaterState } from "@/updater"
import type { TitlebarUpdate } from "@/components/titlebar"
import { usePlatform } from "@/context/platform"
import { useLanguage } from "@/context/language"
import { showToast } from "@/utils/toast"

export function updaterAction(state: UpdaterState | undefined) {
  if (!state) return { label: "settings.updates.action.checkNow" as const }
  switch (state.status) {
    case "checking":
      return { label: "settings.updates.action.checking" as const }
    case "downloading":
      if (state.percent === undefined) return { label: "settings.updates.action.downloading" as const }
      return { label: "orchestra.settings.general.updates.downloading" as const, params: { percent: state.percent } }
    case "ready":
      return { label: "toast.update.action.installRestart" as const, run: "install" as const }
    case "available":
      return {
        label: "orchestra.settings.general.updates.download" as const,
        run: "download" as const,
        description: "orchestra.settings.general.updates.available" as const,
        params: { version: state.version },
      }
    case "installing":
      return { label: "settings.updates.action.installing" as const }
    case "error":
      return {
        label: "orchestra.settings.general.updates.retry" as const,
        run: "check" as const,
        description: "orchestra.settings.general.updates.failed" as const,
      }
    case "disabled":
      return { label: "settings.updates.action.checkNow" as const }
    default:
      return { label: "settings.updates.action.checkNow" as const, run: "check" as const }
  }
}

// Dev and beta builds embed no update feed and a browser has no updater: neither shows an update control.
export function updaterVisible(state: UpdaterState | undefined) {
  return state !== undefined && state.status !== "disabled"
}

export function useUpdaterAction() {
  const platform = usePlatform()
  const language = useLanguage()
  const action = createMemo(() => updaterAction(platform.updater?.state()))

  return {
    action,
    visible: () => updaterVisible(platform.updater?.state()),
    async run() {
      const current = platform.updater?.state()
      if (current?.status === "available") return platform.openExternal(current.url)
      const run = action().run
      if (run === "install")
        return platform.updater?.install().catch((error: unknown) => installFailed(language, error))
      if (run !== "check") return

      const state = await platform.updater?.check()
      if (state?.status === "up-to-date") {
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("settings.updates.toast.latest.title"),
          description: language.t("settings.updates.toast.latest.description", { version: platform.version ?? "" }),
        })
      }
      if (state?.status === "error") {
        showToast({ title: language.t("common.requestFailed"), description: state.message })
      }
    },
  }
}

// The titlebar pill installs a downloaded update, or opens the release page of one this build cannot install.
export function useTitlebarUpdate(): TitlebarUpdate {
  const platform = usePlatform()
  const language = useLanguage()
  const state = () => platform.updater?.state()

  return {
    version: () => {
      const current = state()
      if (current?.status !== "ready" && current?.status !== "available") return
      return current.version
    },
    installing: () => state()?.status === "installing",
    ariaLabel: () => {
      const current = state()
      if (current?.status !== "available") return language.t("toast.update.action.installRestart")
      return language.t("orchestra.shell.update.download", { version: current.version })
    },
    install: () => {
      const current = state()
      if (current?.status === "available") return platform.openExternal(current.url)
      void platform.updater?.install().catch((error: unknown) => installFailed(language, error))
    },
  }
}

function installFailed(language: ReturnType<typeof useLanguage>, error: unknown) {
  showToast({
    title: language.t("common.requestFailed"),
    description: error instanceof Error ? error.message : String(error),
  })
}
