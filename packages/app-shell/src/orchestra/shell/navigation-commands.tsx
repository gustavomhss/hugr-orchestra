import { useNavigate } from "@solidjs/router"
import { useDialog } from "@orchestra/ui/context/dialog"
import { useCommand } from "@/context/command"
import { useGlobal } from "@/context/global"
import { useLayout } from "@/context/layout"
import { useLanguage } from "@/context/language"
import { ServerConnection, useServer } from "@/context/server"
import { tabKey, useTabs } from "@/context/tabs"
import { projectForSession } from "@/pages/layout/helpers"

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
  const open = (chapter: string, view = "") => {
    layout.home.setSelection(target())
    navigate(`/orchestra/${chapter}${view}`)
  }
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
        id: "relay.executions.open",
        title: language.t("orchestra.palette.executions"),
        description: language.t("orchestra.palette.goTo"),
        onSelect: () => open("workflows", "/executions"),
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
              const conn =
                global.servers.list().find((item) => ServerConnection.key(item) === target().server) ?? server.current
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
