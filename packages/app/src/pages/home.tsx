import { useDialog } from "@opencode-ai/ui/context/dialog"
import { createMediaQuery } from "@solid-primitives/media"
import { Show, startTransition } from "solid-js"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useTabs } from "@/context/tabs"
import { OrchestraHome } from "@/orchestra/chapters/kpis-home"
import { createHomeController } from "./home/home-controller"
import { createHomeProjectsController } from "./home/home-projects-controller"
import { HomeProjects } from "./home/home-projects"
import { HomeUtilityNav } from "./home/home-projects-view"

export function NewHome() {
  const desktop = createMediaQuery("(min-width: 768px)")
  const home = createHomeController()
  // Also registers the settings command the sidebar's Settings entry triggers.
  const projects = createHomeProjectsController(home)
  const command = useCommand()
  const dialog = useDialog()
  const language = useLanguage()
  const tabs = useTabs()
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
      <Show when={desktop()} fallback={<NarrowHome home={home} projects={projects} />}>
        <OrchestraHome home={home} />
      </Show>
    </div>
  )
}

// Narrow windows have no Orchestra sidebar, so Home keeps the project list above the dashboard.
function NarrowHome(props: {
  home: ReturnType<typeof createHomeController>
  projects: ReturnType<typeof createHomeProjectsController>
}) {
  return (
    <div data-slot="orchestra-home-narrow" class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 pt-3">
      <div class="shrink-0">
        <HomeProjects projects={props.projects} />
      </div>
      <div class="shrink-0">
        <OrchestraHome home={props.home} />
      </div>
      <HomeUtilityNav
        class="flex shrink-0 pb-3"
        onOpenSettings={props.projects.utility.settings}
        onOpenHelp={props.projects.utility.help}
        language={props.projects.copy.language}
      />
    </div>
  )
}
