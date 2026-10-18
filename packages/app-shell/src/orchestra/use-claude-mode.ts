import { useNavigate } from "@solidjs/router"
import { useDialog } from "@orchestra/ui/context/dialog"
import { ServerConnection } from "@/context/server"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { showToast } from "@/utils/toast"
import { enableClaudeMode } from "./claude-mode-entry"

// Handler for the "Use your Claude subscription (Claude mode)" option on the no-provider surfaces.
export function useClaudeMode(directory: () => string | null | undefined) {
  const dialog = useDialog()
  const language = useLanguage()
  const layout = useLayout()
  const navigate = useNavigate()
  const serverSDK = useServerSDK()
  const sync = useServerSync()

  return () =>
    enableClaudeMode({
      sync: sync(),
      home: layout.home,
      server: ServerConnection.key(serverSDK().server),
      directory: directory(),
      close: () => dialog.close(),
      navigate,
    }).catch(() => showToast({ title: language.t("common.requestFailed") }))
}
