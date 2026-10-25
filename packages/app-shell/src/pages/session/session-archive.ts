import { useLocation, useNavigate } from "@solidjs/router"
import { createStore, produce } from "solid-js/store"
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
import { ScopedKey } from "@/utils/server-scope"
import { sessionManagementUnsupported } from "@/utils/session-management-errors"
import type { AppSession } from "@/utils/session"
import type { ServerSDK } from "@/context/server-sdk"

const [operations, setOperations] = createStore<Record<string, boolean>>({})
const [unsupported, setUnsupported] = createStore<Record<string, boolean>>({})

export function useSessionArchive(input?: { server: ServerSDK; directory: string }) {
  const language = sessionRecoveryLanguage(useLanguage())
  const location = useLocation()
  const navigate = useNavigate()
  const sdk = useSDK()
  const sync = useSync()
  const serverSync = useServerSync()
  const serverSDK = useServerSDK()
  const tabs = useTabs()
  const { params } = useSessionKey()
  const frozen = input ? { source: sdk(), state: sync(), serverState: serverSync() } : undefined
  const origin = () => input?.server ?? serverSDK()
  // Restore needs the session archive routes. Offer Archive nowhere it could not be undone.
  const restorable = () => archiveRouted(origin()) && !unsupported[origin().scope]
  const available = restorable
  const busy = (sessionID: string) => operations[ScopedKey.from(origin().scope, sessionID)] ?? false

  const navigateAfterRemoval = (sessionID: string, parentID?: string, nextSessionID?: string, target = {
    serverKey: params.serverKey,
    dir: params.dir,
    directory: sdk().directory,
  }) => {
    if (params.id !== sessionID) return
    const href = (id: string) =>
      target.serverKey ? sessionHref(requireServerKey(target.serverKey), id) : legacySessionHref(target.directory, id)
    if (parentID) {
      navigate(href(parentID))
      return
    }
    if (nextSessionID) {
      navigate(href(nextSessionID))
      return
    }
    if (target.serverKey) {
      tabs.newDraft({ server: requireServerKey(target.serverKey), directory: target.directory })
      return
    }
    navigate(`/${target.dir}/session`)
  }

  const archive = async (sessionID: string) => {
    const source = frozen?.source ?? sdk()
    const pathname = location.pathname
    const state = frozen?.state ?? sync()
    const serverState = frozen?.serverState ?? serverSync()
    const serverSDK = origin()
    const server = ServerConnection.key(serverSDK.server)
    const key = ScopedKey.from(serverSDK.scope, sessionID)
    const target = { serverKey: params.serverKey, dir: params.dir, directory: source.directory }
    const session = state.session.get(sessionID)
    if (!session || operations[key]) return
    const revision = session.archiveRevision
    const timestamp = session.archiveChangedAt
    if (!archiveRouted(serverSDK) || unsupported[serverSDK.scope]) {
      showToast({ title: language.t("session.archive.unavailable") })
      return
    }

    const sessions = state.data.session ?? []
    const index = sessions.findIndex((s) => s.id === sessionID)
    const nextSession = index === -1 ? undefined : (sessions[index + 1] ?? sessions[index - 1])

    setOperations(key, true)
    await serverSDK.sessionManagement
      .archive(sessionID, true)
      .then(() => {
        const current = state.session.get(sessionID)
        if (
          current && current.time.archived === undefined &&
          ((current.archiveRevision ?? -1) > (revision ?? -1) || (current.archiveChangedAt ?? 0) > (timestamp ?? 0))
        ) return
        state.set(
          produce((draft) => {
            const index = draft.session.findIndex((s) => s.id === sessionID)
            if (index !== -1) draft.session.splice(index, 1)
          }),
        )
        state.session.evict(sessionID)
        serverState.homeSessions.remove(sessionID)
        if (location.pathname === pathname) navigateAfterRemoval(sessionID, session.parentID, nextSession?.id, target)
        notifySessionTabsRemoved({ server, directory: source.directory, sessionIDs: [sessionID] })
      })
      .catch((err: unknown) => {
        if (sessionManagementUnsupported(err)) setUnsupported(serverSDK.scope, true)
        showToast({
          title: language.t(sessionManagementUnsupported(err) ? "session.archive.unavailable" : "common.requestFailed"),
          description: errorMessage(err, language.t("common.requestFailed")),
        })
      })
      .finally(() => setOperations(produce((draft) => { delete draft[key] })))
  }

  const restore = async (sessionID: string, info?: AppSession) => {
    const serverSDK = origin()
    const state = frozen?.state ?? sync()
    const serverState = frozen?.serverState ?? serverSync()
    const key = ScopedKey.from(serverSDK.scope, sessionID)
    const session = info ?? state.session.get(sessionID)
    if (!session || operations[key]) return false
    const initial = serverState.session.get(sessionID) ?? session
    const revision = initial.archiveRevision
    const timestamp = initial.archiveChangedAt ?? initial.time.updated
    if (!archiveRouted(serverSDK) || unsupported[serverSDK.scope]) {
      showToast({ title: language.t("session.restore.unavailable") })
      return false
    }
    setOperations(key, true)
    return serverSDK.sessionManagement.archive(sessionID, false)
      .then(async () => {
        const current = serverState.session.get(sessionID)
        if (current?.time.archived !== undefined &&
          ((current.archiveRevision ?? -1) > (revision ?? -1) || (current.archiveChangedAt ?? current.time.updated) > timestamp)) return false
        // A void ACK carries no archive revision. Read before projecting and respect remember's event fence.
        const restored = serverState.session.remember(await serverState.session.resolve(sessionID, { force: true }))
        if (restored.time.archived !== undefined) return false
        serverState.homeSessions.apply({ type: "session.updated", properties: { sessionID, info: restored } })
        state.set("session", (sessions) =>
          [...sessions.filter((item) => item.id !== sessionID), restored].sort((a, b) => a.id.localeCompare(b.id)),
        )
        return true
      })
      .catch((err: unknown) => {
        if (sessionManagementUnsupported(err)) setUnsupported(serverSDK.scope, true)
        showToast({
          title: language.t(sessionManagementUnsupported(err) ? "session.restore.unavailable" : "common.requestFailed"),
          description: errorMessage(err, language.t("common.requestFailed")),
        })
        return false
      })
      .finally(() => setOperations(produce((draft) => { delete draft[key] })))
  }

  return { archive, restore, available, restorable, busy, navigateAfterRemoval }
}

// Archive routes exist once the server is ready; session management reports that before the SDK flag is read.
function archiveRouted(server: ServerSDK) {
  return !!server.isReady() || server.sessionManagement.hasArchiveRoutes()
}
