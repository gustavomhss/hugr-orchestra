import { useServerManagementController } from "@/components/dialog-select-server"
import { DialogServerV2 } from "@/components/settings-v2/dialog-server-v2"
import { type LocalProject } from "@/context/layout"
import { useLanguage } from "@/context/language"
import { useNotification } from "@/context/notification"
import { DialogRemoveServer } from "@/components/server/dialog-remove-server"
import { ServerConnection, serverName } from "@/context/server"
import { Persist, persisted } from "@/utils/persist"
import { useDialog } from "@orchestra/ui/context/dialog"
import { createResource } from "solid-js"
import { createStore } from "solid-js/store"
import type { HomeController } from "./home-controller"

export function createHomeProjectsController(home: HomeController) {
  const dialog = useDialog()
  const language = useLanguage()
  const notification = useNotification()
  const serverManagement = useServerManagementController({ navigateOnAdd: false })
  const [_state, setState, _, ready] = persisted(
    Persist.global("home.servers", ["home.servers.v1"]),
    createStore({ collapsed: {} as Record<string, boolean> }),
  )
  const [state] = createResource(
    () => ready.promise ?? Promise.resolve(),
    (promise) => promise.then(() => _state),
    { initialValue: _state },
  )
  function directories(project: LocalProject) {
    return [project.worktree, ...(project.sandboxes ?? [])]
  }

  return {
    copy: {
      language,
    },
    selection: {
      value: home.selection.value,
    },
    server: {
      list: home.server.list,
      health: home.server.health,
      projects: home.project.forServer,
      collapsed: (conn: ServerConnection.Any) => state().collapsed[ServerConnection.key(conn)] ?? false,
      toggleCollapsed: (conn: ServerConnection.Any) => {
        const key = ServerConnection.key(conn)
        setState("collapsed", key, !state().collapsed[key])
      },
      canDefault: serverManagement.canDefault,
      defaultKey: serverManagement.defaultKey,
      setDefault: (conn: ServerConnection.Any | undefined) =>
        serverManagement.setDefault(conn ? ServerConnection.key(conn) : null),
      remove: (conn: ServerConnection.Any) =>
        dialog.show(() => (
          <DialogRemoveServer
            name={serverName(conn)}
            onConfirm={() => serverManagement.handleRemove(ServerConnection.key(conn))}
          />
        )),
      edit: (conn: ServerConnection.Http) => dialog.show(() => <DialogServerV2 mode="edit" server={conn} />),
      focus: home.selection.focusServer,
    },
    project: {
      list: home.project.list,
      recentlyClosed: home.project.recentlyClosed,
      homedir: home.project.homedir,
      select: home.project.select,
      add: home.project.add,
      openNewSession: home.project.openProjectNewSession,
      edit: home.project.edit,
      unseenCount: (conn: ServerConnection.Any, project: LocalProject) => {
        const state = notification.ensureServerState(ServerConnection.key(conn))
        return directories(project).reduce((total, directory) => total + state.project.unseenCount(directory), 0)
      },
      clearNotifications: (conn: ServerConnection.Any, project: LocalProject) => {
        const state = notification.ensureServerState(ServerConnection.key(conn))
        directories(project)
          .filter((directory) => state.project.unseenCount(directory) > 0)
          .forEach((directory) => state.project.markViewed(directory))
      },
      choose: home.project.choose,
      close: home.project.close,
      move: (conn: ServerConnection.Any, worktree: string, index: number) => {
        home.server.context(conn).projects.move(worktree, index)
      },
      canReveal: home.project.canReveal,
      reveal: home.project.reveal,
    },
  }
}

export type HomeProjectsController = ReturnType<typeof createHomeProjectsController>
