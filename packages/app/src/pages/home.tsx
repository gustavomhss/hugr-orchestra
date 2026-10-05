import { useDialog } from "@opencode-ai/ui/context/dialog"
import { startTransition } from "solid-js"
import { useSettingsCommand } from "@/components/settings-dialog"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useTabs } from "@/context/tabs"
import { OrchestraHome } from "@/orchestra/chapters/kpis-home"
import { createHomeController } from "./home/home-controller"

export function NewHome() {
  const home = createHomeController()
  const command = useCommand()
  const dialog = useDialog()
  const language = useLanguage()
  const tabs = useTabs()
  // Home owns the palette and settings commands the sidebar's Search and Settings entries trigger.
  useSettingsCommand()
  command.register("home.palette", () => [
    {
      id: "command.palette",
      title: language.t("command.palette"),
      hidden: true,
      onSelect: async () => {
        const conn = home.server.focused()
        const ctx = home.server.focusedContext()
        if (!conn || !ctx) return
        const { DialogHomeCommandPaletteV2 } = await import("@/components/dialog-command-palette-v2")
        void dialog.show(() => (
          <DialogHomeCommandPaletteV2
            server={conn}
            onSelectSession={(entry) => {
              if (!entry.sessionID || !entry.directory || !entry.server) return
              const sessionID = entry.sessionID
              const server = entry.server
              const directory = entry.project?.worktree ?? entry.directory
              ctx.projects.open(directory)
              ctx.projects.touch(directory)
              void startTransition(() => {
                const tab = tabs.addSessionTab({ server, sessionId: sessionID })
                tabs.select(tab)
              })
            }}
          />
        ))
      },
    },
  ])
  return (
    <div
      data-component="orchestra-home"
      class={`
        m-2 flex min-h-0 flex-1 flex-col self-stretch overflow-hidden rounded-[10px]
        bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]
      `}
    >
      <OrchestraHome home={home} />
    </div>
  )
}
