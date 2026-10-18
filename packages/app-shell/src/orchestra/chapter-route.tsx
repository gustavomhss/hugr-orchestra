import { Navigate, useParams } from "@solidjs/router"
import { createMemo, lazy, Show, type Component } from "solid-js"
import { Dynamic } from "solid-js/web"
import { useGlobal } from "@/context/global"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { SDKProvider } from "@/context/sdk"
import { ServerConnection, useServer } from "@/context/server"
import { ServerSDKProvider } from "@/context/server-sdk"
import { ServerSyncProvider } from "@/context/server-sync"
import { ModelsProvider } from "@/context/models"
import { isWip } from "@/orchestra/navigation"
import { pathKey } from "@/utils/path-key"

export type ChapterPageProps = { server: ServerConnection.Any; directory: string }

// Implemented chapters register their page here (lazy). Navigation opens a page only for
// registered chapters; every other chapter keeps its pending-rework dialog.
export const chapterPages: Partial<Record<string, Component<ChapterPageProps>>> = {
  lean: lazy(() => import("./chapters/lean")),
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
  workflows: lazy(() => import("./chapters/workflows")),
  hooks: lazy(() => import("./chapters/hooks")),
}

// These chapters configure the whole server, so they render without a project (with an empty directory).
const serverWideChapters = ["settings", "providers", "shortcuts"]

const ChapterEmpty = lazy(() => import("./chapter-empty"))

export function OrchestraChapterRoute() {
  const params = useParams<{ chapter: string }>()
  const layout = useLayout()
  const global = useGlobal()
  const language = useLanguage()
  const server = useServer()
  const selectedServer = () =>
    global.servers.list().find((item) => ServerConnection.key(item) === layout.home.selection().server) ??
    server.current
  // Pages are owned by the selected repository profile. Remount only when that owner changes.
  const owner = createMemo(
    () => {
      const selection = layout.home.selection()
      const server = global.servers.list().find((item) => ServerConnection.key(item) === selection.server)
      if (!server || !selection.directory) return
      return { key: `${selection.server}\0${pathKey(selection.directory)}`, server, directory: selection.directory }
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
          {/* The selected profile comes from async storage. Until it has loaded, "no profile" is not yet true. */}
          <Show when={layout.ready()}>
            <Show
              when={owner()}
              keyed
              fallback={
                <Show
                  when={serverWideChapters.includes(params.chapter) && selectedServer()}
                  keyed
                  fallback={<ChapterEmpty server={selectedServer()} />}
                >
                  {(conn) => (
                    <ServerSDKProvider server={() => conn}>
                      <ServerSyncProvider server={() => conn}>
                        <Dynamic component={page()} server={conn} directory="" />
                      </ServerSyncProvider>
                    </ServerSDKProvider>
                  )}
                </Show>
              }
            >
              {(owner) => (
                <ServerSDKProvider server={() => owner.server}>
                  <ServerSyncProvider server={() => owner.server}>
                    <SDKProvider directory={owner.directory}>
                      <ModelsProvider directory={() => owner.directory}>
                        <Dynamic component={page()} server={owner.server} directory={owner.directory} />
                      </ModelsProvider>
                    </SDKProvider>
                  </ServerSyncProvider>
                </ServerSDKProvider>
              )}
            </Show>
          </Show>
        </div>
      )}
    </Show>
  )
}
