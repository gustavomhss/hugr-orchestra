import { useLocation, useNavigate } from "@solidjs/router"
import { useDialog } from "@orchestra/ui/context/dialog"
import { ServerConnection } from "@/context/server"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { showToast } from "@/utils/toast"
import { enableClaudeMode } from "./claude-mode-entry"

// Handler for the "Use your Claude subscription (Claude mode)" option on the no-provider surfaces. The current page is
// remembered so the Providers page can send the person back to the task they started.
export function useClaudeMode(directory: () => string | null | undefined) {
  const dialog = useDialog()
  const language = useLanguage()
  const layout = useLayout()
  const navigate = useNavigate()
  const location = useLocation()
  const serverSDK = useServerSDK()
  const sync = useServerSync()

  return () =>
    enableClaudeMode({
      sync: sync(),
      providers: serverSDK().orchestra.providers,
      home: layout.home,
      server: ServerConnection.key(serverSDK().server),
      directory: directory(),
      returnTo: location.pathname,
      close: () => dialog.close(),
      navigate: (path, intent) => navigate(path, { state: intent }),
    })
      .then((enabled) => {
        if (!enabled) return
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("orchestra.providers.claudeMode.enabled"),
          description: language.t("orchestra.providers.claudeMode.enabled.description"),
        })
      })
      .catch(() => showToast({ title: language.t("common.requestFailed") }))
}
