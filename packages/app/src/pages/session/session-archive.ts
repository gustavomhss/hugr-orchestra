import { useLocation, useNavigate } from "@solidjs/router"
import { produce } from "solid-js/store"
import { notifySessionTabsRemoved } from "@/components/titlebar-session-events"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useServerSync } from "@/context/server-sync"
import { useSync } from "@/context/sync"
import { useTabs } from "@/context/tabs"
import { errorMessage } from "@/pages/layout/helpers"
import { useSessionKey } from "@/pages/session/session-layout"
import { legacySessionHref, requireServerKey, sessionHref } from "@/utils/session-route"
import { showToast } from "@/utils/toast"
import { useServerSDK } from "@/context/server-sdk"
import { ServerConnection } from "@/context/server"
import { sessionRecoveryLanguage } from "@/i18n/session-recovery"

export function useSessionArchive() {
  const language = sessionRecoveryLanguage(useLanguage())
  const location = useLocation()
  const navigate = useNavigate()
  const sdk = useSDK()
  const sync = useSync()
  const serverSync = useServerSync()
  const serverSDK = useServerSDK()
  const tabs = useTabs()
  const { params } = useSessionKey()
  const available = () => serverSDK().protocolKind() === "v1"

  const navigateAfterRemoval = (sessionID: string, parentID?: string, nextSessionID?: string) => {
    if (params.id !== sessionID) return
    const href = (id: string) =>
      params.serverKey ? sessionHref(requireServerKey(params.serverKey), id) : legacySessionHref(sdk().directory, id)
    if (parentID) {
      navigate(href(parentID))
      return
    }
    if (nextSessionID) {
      navigate(href(nextSessionID))
      return
    }
    if (params.serverKey) {
      tabs.newDraft({ server: requireServerKey(params.serverKey), directory: sdk().directory })
      return
    }
    navigate(`/${params.dir}/session`)
  }

  const archive = async (sessionID: string) => {
    const source = sdk()
    const pathname = location.pathname
    const state = sync()
    const serverState = serverSync()
    const server = ServerConnection.key(serverSDK().server)
    const session = state.session.get(sessionID)
    if (!session) return
    if ((await source.protocol) !== "v1") {
      showToast({ title: language.t("session.archive.unavailable") })
      return
    }

    const sessions = state.data.session ?? []
    const index = sessions.findIndex((s) => s.id === sessionID)
    const nextSession = index === -1 ? undefined : (sessions[index + 1] ?? sessions[index - 1])

    await source.client.session
      .update({ sessionID, directory: source.directory, time: { archived: Date.now() } })
      .then(() => {
        state.set(
          produce((draft) => {
            const index = draft.session.findIndex((s) => s.id === sessionID)
            if (index !== -1) draft.session.splice(index, 1)
          }),
        )
        state.session.evict(sessionID)
        serverState.homeSessions.remove(sessionID)
        if (location.pathname === pathname) navigateAfterRemoval(sessionID, session.parentID, nextSession?.id)
        notifySessionTabsRemoved({ server, directory: source.directory, sessionIDs: [sessionID] })
      })
      .catch((err) => {
        showToast({
          title: language.t("common.requestFailed"),
          description: errorMessage(err, language.t("common.requestFailed")),
        })
      })
  }

  return { archive, available, navigateAfterRemoval }
}
