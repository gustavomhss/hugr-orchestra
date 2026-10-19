import { createEffect, onCleanup } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { useGlobal } from "@/context/global"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { ServerConnection } from "@/context/server"
import { useTabs } from "@/context/tabs"
import {
  collectNewSessionDeepLinks,
  collectOpenProjectDeepLinks,
  listenDeepLinks,
  parseDeepLink,
  parseNewSessionDeepLink,
} from "@/pages/layout/deep-links"
import { showToast } from "@/utils/toast"

export function NewShellIngress() {
  const global = useGlobal()
  const language = useLanguage()
  const layout = useLayout()
  const tabs = useTabs()
  const navigate = useNavigate()
  createEffect(() => {
    if (!tabs.ready() || !layout.ready()) return
    onCleanup(
      listenDeepLinks(window, (urls: string[]) => {
        urls
          .filter((url) => !parseDeepLink(url) && !parseNewSessionDeepLink(url))
          .forEach(() =>
            showToast({
              variant: "error",
              title: language.t("orchestra.shell.link.failed"),
              description: language.t("orchestra.shell.link.unsupported"),
            }),
          )
        // Native paths belong to the local server, never a selected remote profile.
        const conn =
          global.servers.list().find(ServerConnection.builtin) ?? global.servers.list().find(ServerConnection.local)
        if (!conn) return
        const key = ServerConnection.key(conn)
        const ctx = global.ensureServerCtx(conn)
        // A link can name any path, so only a folder the server can read becomes a project.
        const exists = (directory: string) =>
          ctx.sdk.api.file.list({ path: ".", location: { directory } }).then(
            () => true,
            () => {
              showToast({
                variant: "error",
                title: language.t("orchestra.shell.link.failed"),
                description: language.t("orchestra.shell.link.missingDirectory", { directory }),
              })
              return false
            },
          )
        collectOpenProjectDeepLinks(urls).forEach((directory) => {
          void exists(directory).then((found) => {
            if (!found) return
            ctx.projects.open(directory)
            ctx.projects.touch(directory)
            layout.home.setSelection({ server: key, directory })
            navigate("/")
          })
        })
        collectNewSessionDeepLinks(urls).forEach((link) => {
          void exists(link.directory).then((found) => {
            if (!found) return
            ctx.projects.open(link.directory)
            ctx.projects.touch(link.directory)
            layout.home.setSelection({ server: key, directory: link.directory })
            void tabs.newDraft({ server: key, directory: link.directory }, link.prompt)
          })
        })
      }),
    )
  })
  return null
}
