import { createEffect, onCleanup } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { useGlobal } from "@/context/global"
import { useLayout } from "@/context/layout"
import { ServerConnection } from "@/context/server"
import { useTabs } from "@/context/tabs"
import { collectNewSessionDeepLinks, collectOpenProjectDeepLinks, listenDeepLinks } from "@/pages/layout/deep-links"

export function NewShellIngress() {
  const global = useGlobal()
  const layout = useLayout()
  const tabs = useTabs()
  const navigate = useNavigate()
  createEffect(() => {
    if (!tabs.ready() || !layout.ready()) return
    onCleanup(
      listenDeepLinks(window, (urls: string[]) => {
        // Native paths belong to the local server, never a selected remote profile.
        const conn =
          global.servers.list().find(ServerConnection.builtin) ?? global.servers.list().find(ServerConnection.local)
        if (!conn) return
        const key = ServerConnection.key(conn)
        const ctx = global.ensureServerCtx(conn)
        collectOpenProjectDeepLinks(urls).forEach((directory) => {
          ctx.projects.open(directory)
          ctx.projects.touch(directory)
          layout.home.setSelection({ server: key, directory })
          navigate("/")
        })
        collectNewSessionDeepLinks(urls).forEach((link) => {
          ctx.projects.open(link.directory)
          ctx.projects.touch(link.directory)
          layout.home.setSelection({ server: key, directory: link.directory })
          void tabs.newDraft({ server: key, directory: link.directory }, link.prompt)
        })
      }),
    )
  })
  return null
}
