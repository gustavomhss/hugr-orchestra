import { Navigate, useParams } from "@solidjs/router"
import { createMemo, lazy, Show, type Component } from "solid-js"
import { Dynamic } from "solid-js/web"
import { useGlobal } from "@/context/global"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { SDKProvider } from "@/context/sdk"
import { ServerConnection } from "@/context/server"
import { ServerSDKProvider } from "@/context/server-sdk"
import { ServerSyncProvider } from "@/context/server-sync"
import { isWip } from "@/orchestra/navigation"

export type ChapterPageProps = { server: ServerConnection.Any; directory: string }

// Implemented chapters register their page here (lazy). Navigation opens a page only for
// registered chapters; every other chapter keeps its pending-rework dialog.
export const chapterPages: Partial<Record<string, Component<ChapterPageProps>>> = {
  mcp: lazy(() => import("./chapters/mcp")),
  skills: lazy(() => import("./chapters/skills")),
  cicd: lazy(() => import("./chapters/cicd")),
  env: lazy(() => import("./chapters/env")),
  agents: lazy(() => import("./chapters/agents")),
  workspaces: lazy(() => import("./chapters/workspaces")),
  dock: lazy(() => import("./chapters/dock")),
  plugins: lazy(() => import("./chapters/plugins")),
  providers: lazy(() => import("./chapters/providers")),
  shortcuts: lazy(() => import("./chapters/shortcuts")),
  schedule: lazy(() => import("./chapters/schedule")),
  settings: lazy(() => import("./chapters/settings")),
}

export function OrchestraChapterRoute() {
  const params = useParams<{ chapter: string }>()
  const layout = useLayout()
  const global = useGlobal()
  const language = useLanguage()
  // Pages are owned by the selected repository profile. Remount only when that owner changes.
  const owner = createMemo(
    () => {
      const selection = layout.home.selection()
      const server = global.servers.list().find((item) => ServerConnection.key(item) === selection.server)
      if (!server || !selection.directory) return
      return { key: `${selection.server}\0${selection.directory}`, server, directory: selection.directory }
    },
    undefined,
    { equals: (a, b) => a?.key === b?.key },
  )

  return (
    <Show when={chapterPages[params.chapter]} fallback={<Navigate href="/" />}>
      {(page) => (
        <div
          data-component="orchestra-chapter"
          data-chapter={params.chapter}
          class="orchestra-chapter orchestra-glass flex min-h-0 flex-1 flex-col self-stretch overflow-hidden max-md:m-2 max-md:rounded-[10px] max-md:bg-v2-background-bg-base max-md:shadow-[var(--v2-elevation-raised)]"
        >
          <Show when={isWip(params.chapter)}>
            <p class="orchestra-wip-mark" data-slot="orchestra-wip">
              {language.t("orchestra.shell.wip.page")}
            </p>
          </Show>
          <Show
            when={owner()}
            keyed
            fallback={<p data-slot="orchestra-chapter-empty">{language.t("orchestra.profile.empty")}</p>}
          >
            {(owner) => (
              <ServerSDKProvider server={() => owner.server}>
                <ServerSyncProvider server={() => owner.server}>
                  <SDKProvider directory={owner.directory}>
                    <Dynamic component={page()} server={owner.server} directory={owner.directory} />
                  </SDKProvider>
                </ServerSyncProvider>
              </ServerSDKProvider>
            )}
          </Show>
        </div>
      )}
    </Show>
  )
}
