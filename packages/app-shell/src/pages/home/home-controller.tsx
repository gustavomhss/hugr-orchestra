import { DialogConfirmChoice } from "@/components/dialog-confirm-choice"
import { useDirectoryPicker } from "@/components/directory-picker"
import { useGlobal } from "@/context/global"
import { type HomeProjectSelection, type LocalProject, useLayout } from "@/context/layout"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { ServerConnection, useServer } from "@/context/server"
import { useServerSync } from "@/context/server-sync"
import { useTabs } from "@/context/tabs"
import { relayKey } from "@/orchestra/relay/source"
import {
  closeHomeProject,
  errorMessage,
  homeProjectDirectories,
  toggleHomeProjectSelection,
} from "@/pages/layout/helpers"
import { showToast } from "@/utils/toast"
import { useDialog } from "@orchestra/ui/context/dialog"
import { createEffect, createMemo } from "solid-js"

export function createHomeController() {
  const sync = useServerSync()
  const layout = useLayout()
  const server = useServer()
  const global = useGlobal()
  const tabs = useTabs()
  const platform = usePlatform()
  const pickDirectory = useDirectoryPicker()
  const dialog = useDialog()
  const language = useLanguage()
  const selection = layout.home.selection
  const focusedServer = createMemo(
    () => global.servers.list().find((conn) => ServerConnection.key(conn) === selection().server) ?? server.current,
  )
  const focusedServerCtx = createMemo(() => {
    const conn = focusedServer()
    if (!conn) return undefined
    return global.ensureServerCtx(conn)
  })
  const focusedSync = () => focusedServerCtx()?.sync ?? sync()
  const projects = createMemo(() => focusedServerCtx()?.projects.list() ?? layout.projects.list())
  const recentlyClosed = createMemo(
    () => focusedServerCtx()?.projects.recentlyClosed() ?? layout.projects.recentlyClosed(),
  )
  const homedir = createMemo(() => focusedSync().data.path.home ?? "")
  const selectedProject = createMemo(() => projects().find((project) => project.worktree === selection().directory))
  const newSessionProject = createMemo(
    () =>
      selectedProject() ??
      projects().find((project) => project.worktree === focusedServerCtx()?.projects.last()) ??
      projects()[0],
  )

  createEffect(() => {
    const list = global.servers.list()
    if (list.some((conn) => ServerConnection.key(conn) === selection().server)) return
    const conn = list.find((conn) => ServerConnection.key(conn) === server.key) ?? list[0]
    if (conn) setSelection({ server: ServerConnection.key(conn) })
  })

  function setSelection(next: HomeProjectSelection) {
    layout.home.setSelection(next)
  }

  // Several empty folders added together ask one at a time: showing a dialog replaces the one on screen.
  let initGitQueue = Promise.resolve(false)
  function confirmInitGit(directory: string) {
    initGitQueue = initGitQueue.then(
      () =>
        new Promise<boolean>((resolve) => {
          void dialog.show(
            () => (
              <DialogConfirmChoice
                title={language.t("orchestra.shell.project.initGit.title")}
                description={language.t("orchestra.shell.project.initGit.description", { directory })}
                confirm={language.t("orchestra.shell.project.initGit.confirm")}
                cancel={language.t("orchestra.shell.project.initGit.skip")}
                onConfirm={() => resolve(true)}
              />
            ),
            () => resolve(false),
          )
        }),
    )
    return initGitQueue
  }

  function addProjects(conn: ServerConnection.Any, directories: string[]) {
    const directory = directories[0]
    if (!directory) return
    const ctx = global.ensureServerCtx(conn)
    // Settles once every new folder is added, its git question included, so a caller can navigate afterwards: moving
    // away while the question is open would close it as a silent skip.
    const added = directories.map((item) => {
      if (ctx.projects.list().some((project) => project.worktree === item)) return Promise.resolve()
      const location = { directory: item }
      const settled = ctx.sdk.api.file
        .list({ path: ".", location })
        .then(async (files) => {
          // An empty folder only becomes a repository when the person agrees.
          if (files.data.length > 0 || !(await confirmInitGit(item))) return ctx.sdk.api.project.current({ location })
          const result =
            false
              ? await ctx.sdk.client.project.initGit({ directory: item })
              : await ctx.sdk.orchestra.projects.initGit({ location })
          // The chapters asked while the question was open and cached the shared "global" project; the folder has its own now.
          void ctx.queryClient.invalidateQueries({ queryKey: relayKey(ctx.sdk.scope, item) })
          return result.data ?? ctx.sdk.api.project.current({ location })
        })
        .then((project) => ctx.sync.child(item, { bootstrap: false })[1]("project", project.id))
        .catch((cause: unknown) =>
          showToast({
            variant: "error",
            title: language.t("orchestra.shell.project.addFailed"),
            description: errorMessage(cause, language.t("common.requestFailed")),
          }),
        )
      ctx.projects.open(item)
      return settled
    })
    ctx.projects.touch(directory)
    setSelection({ server: ServerConnection.key(conn), directory })
    return Promise.all(added).then(() => undefined)
  }

  function canRevealProject(conn: ServerConnection.Any) {
    return platform.platform === "desktop" && !!platform.openPath && ServerConnection.local(conn)
  }

  function openProjectNewSession(conn: ServerConnection.Any, directory: string) {
    const ctx = global.ensureServerCtx(conn)
    ctx.projects.open(directory)
    ctx.projects.touch(directory)
    void tabs.newDraft({ server: ServerConnection.key(conn), directory })
  }

  return {
    selection: {
      value: selection,
      set: setSelection,
      focusServer: (conn: ServerConnection.Any) => setSelection({ server: ServerConnection.key(conn) }),
    },
    server: {
      list: global.servers.list,
      health: (conn: ServerConnection.Any) => global.servers.health[ServerConnection.key(conn)],
      context: (conn: ServerConnection.Any) => global.ensureServerCtx(conn),
      focused: focusedServer,
      focusedContext: focusedServerCtx,
      focusedSync,
    },
    project: {
      list: projects,
      recentlyClosed,
      homedir,
      selected: selectedProject,
      newSession: newSessionProject,
      forServer: (conn: ServerConnection.Any) => global.ensureServerCtx(conn).projects.list(),
      select: (conn: ServerConnection.Any, directory: string) => {
        const key = ServerConnection.key(conn)
        if (global.servers.health[key]?.healthy === false) return
        if (
          !global
            .ensureServerCtx(conn)
            .projects.list()
            .some((project) => project.worktree === directory)
        )
          return
        setSelection(toggleHomeProjectSelection(selection(), key, directory))
      },
      add: addProjects,
      openNewSession: () => {
        const conn = focusedServer()
        const project = newSessionProject()
        if (!conn || !project) return
        openProjectNewSession(conn, project.worktree)
      },
      openProjectNewSession,
      choose: (conn: ServerConnection.Any) => {
        if (global.servers.health[ServerConnection.key(conn)]?.healthy === false) return
        pickDirectory({
          server: conn,
          title: language.t("command.project.open"),
          multiple: true,
          onSelect: (result) => addProjects(conn, homeProjectDirectories(result)),
        })
      },
      edit: (conn: ServerConnection.Any, project: LocalProject) => {
        void import("@/components/dialog-edit-project-v2").then(({ DialogEditProjectV2 }) => {
          void dialog.show(() => <DialogEditProjectV2 server={conn} project={project} />)
        })
      },
      close: (conn: ServerConnection.Any, directory: string) => {
        const next = closeHomeProject(
          selection(),
          ServerConnection.key(conn),
          global.ensureServerCtx(conn).projects,
          directory,
        )
        if (next) setSelection(next)
      },
      canReveal: canRevealProject,
      reveal: (conn: ServerConnection.Any, project: LocalProject) => {
        if (!platform.openPath || !canRevealProject(conn)) return
        platform.openPath(project.worktree).catch((cause: unknown) =>
          showToast({
            title: language.t("common.requestFailed"),
            description: errorMessage(cause, language.t("common.requestFailed")),
          }),
        )
      },
    },
  }
}

export type HomeController = ReturnType<typeof createHomeController>
