import { useLanguage, useServer, useSettings, useTabs } from "@orchestra/app"
import { showToast } from "@orchestra/ui/toast"
import { onMount } from "solid-js"

export function DesktopFirstLaunchOnboarding(props: { initialUrl: string; onLoaded: () => void }) {
  const language = useLanguage()
  const server = useServer()
  const settings = useSettings()
  const tabs = useTabs()

  onMount(() => {
    void runFirstLaunchOnboarding().finally(props.onLoaded)
  })

  async function runFirstLaunchOnboarding() {
    try {
      await Promise.all(
        [server.ready.promise, tabs.ready.promise, tabs.recentReady.promise].map((p) => p ?? Promise.resolve()),
      )
      const existingInstall = await window.api.isOldLayoutEligible()
      settings.general.setOldLayoutEligible(existingInstall)
      if (!server.isLocal()) return

      const pending = await window.api.isFirstLaunchOnboardingPending()
      if (!pending) return

      // First launch no longer creates a "Default Project" folder or opens a draft. Home asks the person to choose
      // a folder, trust it and connect a model, so nothing lands on disk without their choice.
      console.info("[desktop-onboarding] first launch onboarding handed to Home", {
        existingInstall,
        initialUrl: props.initialUrl,
      })
      await window.api.confirmFirstLaunchOnboarding()
    } catch (error) {
      console.error("[desktop-onboarding] first launch onboarding failed", error)
      showToast({ variant: "error", title: language.t("orchestra.shell.onboarding.failed") })
    }
  }

  return null
}
