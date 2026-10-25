import { useNavigate } from "@solidjs/router"
import { useDialog } from "@orchestra/ui/context/dialog"
import { useDirectoryPicker } from "@/components/directory-picker"
import { useSettingsCommand } from "@/components/settings-dialog"
import { useCommand } from "@/context/command"
import { useGlobal } from "@/context/global"
import { useLayout } from "@/context/layout"
import { useLanguage } from "@/context/language"
import { SDKProvider } from "@/context/sdk"
import { ServerConnection, useServer } from "@/context/server"
import { ServerSDKProvider } from "@/context/server-sdk"
import { ServerSyncProvider } from "@/context/server-sync"
import { tabKey, useTabs } from "@/context/tabs"
import { sessionRecoveryLanguage } from "@/i18n/session-recovery"
import { createHomeController } from "@/pages/home/home-controller"
import { homeProjectDirectories, profileProject, projectForSession } from "@/pages/layout/helpers"

// Commands belong to the shell lifetime, not either responsive sidebar mount.
export function ShellNavigationCommands() {
  const command = useCommand()
  const language = useLanguage()
  const layout = useLayout()
  const global = useGlobal()
  const server = useServer()
  const tabs = useTabs()
  const navigate = useNavigate()
  const dialog = useDialog()
  const pickDirectory = useDirectoryPicker()
  const home = createHomeController()
  const target = () => {
    const route = layout.route()
    if (route.type === "home" || route.type === "chapter") return layout.home.selection()
    if (route.type === "draft") {
      const draft = tabs.store.find((tab) => tab.type === "draft" && tab.draftID === route.draftID)
      return draft?.type === "draft" ? { server: draft.server, directory: draft.directory } : layout.home.selection()
    }
    if (route.type === "dir-new-sesssion") return { server: route.server ?? server.key, directory: route.dir }
    const key = route.server ?? server.key
    const conn = global.servers.list().find((item) => ServerConnection.key(item) === key)
    const ctx = conn && global.ensureServerCtx(conn)
    const session = ctx?.sync.session.peek(route.sessionId)
    return {
      server: key,
      directory:
        (session && ctx && projectForSession(session, ctx.projects.list())?.worktree) ??
        session?.directory ??
        tabs.info[tabKey({ type: "session", server: key, sessionId: route.sessionId })]?.directory,
    }
  }
  const connection = () =>
    global.servers.list().find((item) => ServerConnection.key(item) === target().server) ?? server.current
  const open = (chapter: string, view = "") => {
    layout.home.setSelection(target())
    navigate(`/orchestra/${chapter}${view}`)
  }
  // The macOS menu sends these ids; the retired legacy layout was their only registrant.
  const showProject = (conn: ServerConnection.Any, worktree: string) => {
    const key = ServerConnection.key(conn)
    const ctx = global.ensureServerCtx(conn)
    layout.home.setSelection({ server: key, directory: worktree })
    ctx.projects.open(worktree)
    ctx.projects.touch(worktree)
    const route = layout.route()
    if (route.type === "home" || route.type === "chapter") return
    // Same landing as the sidebar's project menu: the project's existing tab, else a fresh draft.
    const tab = tabs.store.find((item) => {
      if (item.server !== key) return false
      const directory =
        item.type === "draft"
          ? item.directory
          : (ctx.sync.session.peek(item.sessionId)?.directory ?? tabs.info[tabKey(item)]?.directory)
      return !!directory && profileProject(ctx, directory)?.worktree === worktree
    })
    if (tab) {
      tabs.select(tab)
      return
    }
    home.project.openProjectNewSession(conn, worktree)
  }
  const openProject = () => {
    const conn = connection()
    if (!conn || global.servers.health[ServerConnection.key(conn)]?.healthy === false) return
    pickDirectory({
      server: conn,
      title: language.t("command.project.open"),
      multiple: true,
      onSelect: (result) => {
        const directories = homeProjectDirectories(result)
        if (!directories[0]) return
        void home.project.add(conn, directories)?.then(() => showProject(conn, directories[0]))
      },
    })
  }
  // Projects cycle in the order the sidebar's profile menu lists them: server by server.
  const cycleProject = (offset: -1 | 1) => {
    const entries = global.servers.list().flatMap((conn) => {
      if (global.servers.health[ServerConnection.key(conn)]?.healthy === false) return []
      return global
        .ensureServerCtx(conn)
        .projects.list()
        .map((project) => ({ conn, project }))
    })
    const here = target()
    const conn = connection()
    const worktree =
      conn && here.directory ? profileProject(global.ensureServerCtx(conn), here.directory)?.worktree : undefined
    const index = entries.findIndex(
      (entry) => ServerConnection.key(entry.conn) === here.server && entry.project.worktree === worktree,
    )
    const next =
      index === -1 ? entries.at(offset > 0 ? 0 : -1) : entries[(index + offset + entries.length) % entries.length]
    if (next) showProject(next.conn, next.project.worktree)
  }
  // Shell fallback for routes without their own server context. Session and draft routes register the same keyed
  // command inside their server providers; the newest registration wins while it is mounted.
  useSettingsCommand()
  command.register("orchestra.navigation", () => [
    {
      id: "project.open",
      title: language.t("command.project.open"),
      category: language.t("command.category.project"),
      keybind: "mod+o",
      onSelect: openProject,
    },
    {
      id: "project.previous",
      title: language.t("command.project.previous"),
      category: language.t("command.category.project"),
      keybind: "mod+alt+arrowup",
      onSelect: () => cycleProject(-1),
    },
    {
      id: "project.next",
      title: language.t("command.project.next"),
      category: language.t("command.category.project"),
      keybind: "mod+alt+arrowdown",
      onSelect: () => cycleProject(1),
    },
    {
      id: "home.go",
      title: language.t("orchestra.shell.goHome"),
      category: language.t("command.category.view"),
      keybind: "mod+shift+h",
      onSelect: () => {
        if (layout.route().type !== "home") tabs.toggleHome({ home: false })
      },
    },
    {
      id: "session.new",
      title: language.t("command.session.new"),
      category: language.t("command.category.session"),
      keybind: "mod+shift+s",
      onSelect: () => {
        const conn = connection()
        const directory = target().directory
        if (!conn || !directory) return
        home.project.openProjectNewSession(conn, directory)
      },
    },
    // The titlebar tab strip owns the tab order and registers the cyclers.
    {
      id: "session.previous",
      title: language.t("command.session.previous"),
      category: language.t("command.category.session"),
      keybind: "alt+arrowup",
      onSelect: () => command.trigger("tab.prev"),
    },
    {
      id: "session.next",
      title: language.t("command.session.next"),
      category: language.t("command.category.session"),
      keybind: "alt+arrowdown",
      onSelect: () => command.trigger("tab.next"),
    },
  ])
  // The session page registers its own copy for the open session; the shell offers it on every other page.
  command.register("orchestra.archived", () => {
    if (layout.route().type === "session") return []
    const conn = connection()
    const directory = target().directory
    const sdk = conn && global.ensureServerCtx(conn).sdk
    // Same condition as the session page: only servers that can restore can list archived sessions.
    const routed = !!sdk && (!!sdk.protocolKind() || sdk.sessionManagement.hasArchiveRoutes())
    return [
      {
        id: "session.archived",
        title: sessionRecoveryLanguage(language).t("session.archived.title"),
        category: language.t("command.category.session"),
        disabled: !conn || !directory || !routed,
        onSelect: async () => {
          if (!conn || !directory) return
          const { DialogArchivedSessions } = await import("@/components/dialog-archived-sessions")
          void dialog.show(() => (
            <ServerSDKProvider server={() => conn}>
              <ServerSyncProvider server={() => conn}>
                <SDKProvider directory={directory}>
                  <DialogArchivedSessions directory={directory} />
                </SDKProvider>
              </ServerSyncProvider>
            </ServerSDKProvider>
          ))
        },
      },
    ]
  })
  command.register("orchestra.relay", () =>
    [
      {
        id: "relay.workflows.open",
        title: language.t("orchestra.nav.workflows"),
        description: language.t("orchestra.palette.goTo"),
        onSelect: () => open("workflows"),
      },
      {
        id: "relay.hooks.open",
        title: language.t("orchestra.nav.hooks"),
        description: language.t("orchestra.palette.goTo"),
        onSelect: () => open("hooks"),
      },
      {
        id: "relay.workflow.new",
        title: language.t("orchestra.workflows.new"),
        onSelect: () => open("workflows", "/new"),
      },
      { id: "relay.hook.new", title: language.t("orchestra.hooks.new"), onSelect: () => open("hooks", "/new") },
    ].map((item) => ({ ...item, category: language.t("orchestra.palette.relay") })),
  )
  command.register("orchestra.palette", () =>
    layout.route().type === "chapter"
      ? [
          {
            id: "command.palette",
            title: language.t("command.palette"),
            hidden: true,
            onSelect: async () => {
              const conn = connection()
              if (!conn) return
              const { DialogHomeCommandPaletteV2 } = await import("@/components/dialog-command-palette-v2")
              void dialog.show(() => (
                <DialogHomeCommandPaletteV2
                  server={conn}
                  onSelectSession={(entry) => {
                    if (!entry.sessionID || !entry.directory || !entry.server) return
                    const selected = global.servers.list().find((item) => ServerConnection.key(item) === entry.server)
                    if (!selected) return
                    const ctx = global.ensureServerCtx(selected)
                    const directory = entry.project?.worktree ?? entry.directory
                    ctx.projects.open(directory)
                    ctx.projects.touch(directory)
                    tabs.select(tabs.addSessionTab({ server: entry.server, sessionId: entry.sessionID }))
                  }}
                />
              ))
            },
          },
        ]
      : [],
  )
  return null
}
