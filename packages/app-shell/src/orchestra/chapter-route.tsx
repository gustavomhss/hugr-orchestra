import { Navigate, useParams } from "@solidjs/router"
import { createMemo, lazy, Show, Suspense, type Component, type ParentProps } from "solid-js"
import { Dynamic } from "solid-js/web"
import { useGlobal } from "@/context/global"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { SDKProvider } from "@/context/sdk"
import { ServerConnection, useServer } from "@/context/server"
import { ServerSDKProvider } from "@/context/server-sdk"
import { ServerSyncProvider } from "@/context/server-sync"
import { ModelsProvider } from "@/context/models"
import { showWip } from "@/orchestra/navigation"
import { pathKey } from "@/utils/path-key"

export type ChapterPageProps = { server: ServerConnection.Any; directory: string }

// Lazy pages carry `preload`, so the sidebar can fetch a chapter's chunk before it is opened.
type ChapterPage = Component<ChapterPageProps> & { preload?: () => Promise<unknown> }

// Implemented chapters register their page here (lazy). Navigation opens a page only for
// registered chapters.
export const chapterPages: Partial<Record<string, ChapterPage>> = {
  "flight-engineer": lazy(() => import("./chapters/flight-engineer/flight-engineer")),
  lean: lazy(() => import("./chapters/lean")),
  mcp: lazy(() => import("./chapters/mcp")),
  skills: lazy(() => import("./chapters/skills")),
  cicd: lazy(() => import("./chapters/actions")),
  actions: lazy(() => import("./chapters/actions")),
  env: lazy(() => import("./chapters/env")),
  agents: lazy(() => import("./chapters/agents")),
  workspaces: lazy(() => import("./chapters/workspaces")),
  dock: lazy(() => import("./chapters/dock")),
  plugins: lazy(() => import("./chapters/plugins")),
  providers: lazy(() => import("./chapters/providers")),
  integrations: lazy(() => import("./chapters/integrations")),
  shortcuts: lazy(() => import("./chapters/shortcuts")),
  schedule: lazy(() => import("./chapters/schedule")),
  settings: lazy(() => import("./chapters/settings")),
  workflows: lazy(() => import("./chapters/workflows")),
  hooks: lazy(() => import("./chapters/hooks")),
  atlas: lazy(() => import("./chapters/atlas/atlas")),
  board: lazy(() => import("./chapters/board/board")),
}

// These chapters span the whole server, so they render without a project (with an empty directory).
const serverWideChapters = ["settings", "providers", "shortcuts", "board", "flight-engineer"]

const ChapterEmpty = lazy(() => import("./chapter-empty"))

// Each chapter suspends in its own boundary, so a chunk or a pending read inside one chapter leaves the shell and the
// sidebar usable. The boundary is keyed by chapter: a fresh one shows its fallback at once, while a boundary that
// already resolved would hold the route transition (and the URL) on the previous chapter until the new one is ready.
// The fallback is an empty area, so a fast chapter does not flash a spinner.
function ChapterBoundary(props: ParentProps<{ chapter: string }>) {
  return (
    <Show when={props.chapter} keyed>
      {() => <Suspense fallback={<div class="flex-1" data-slot="orchestra-chapter-loading" />}>{props.children}</Suspense>}
    </Show>
  )
}

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
          <Show when={showWip(params.chapter)}>
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
                  fallback={
                    <ChapterBoundary chapter={params.chapter}>
                      <ChapterEmpty server={selectedServer()} />
                    </ChapterBoundary>
                  }
                >
                  {(conn) => (
                    <ServerSDKProvider server={() => conn}>
                      <ServerSyncProvider server={() => conn}>
                        <ChapterBoundary chapter={params.chapter}>
                          <Dynamic component={page()} server={conn} directory="" />
                        </ChapterBoundary>
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
                        <ChapterBoundary chapter={params.chapter}>
                          <Dynamic component={page()} server={owner.server} directory={owner.directory} />
                        </ChapterBoundary>
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
