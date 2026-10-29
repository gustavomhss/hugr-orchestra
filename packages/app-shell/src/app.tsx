import "@/index.css"
import * as Sentry from "@sentry/solid"
import { I18nProvider } from "@orchestra/ui/context"
import { DialogProvider } from "@orchestra/ui/context/dialog"
import { FileComponentProvider } from "@orchestra/ui/context/file"
import { File } from "@orchestra/session-ui/file"
import { Font } from "@orchestra/ui/font"
import { ThemeProvider, syncThemeBackground } from "@orchestra/ui/theme/context"
import { OrchestraPaletteProvider } from "@/orchestra/palette/context"
import { MetaProvider } from "@solidjs/meta"
import { type BaseRouterProps, Navigate, Route, Router, useLocation, useParams, useSearchParams } from "@solidjs/router"
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query"
import { Effect } from "effect"
import {
  type Component,
  createEffect,
  createMemo,
  createRenderEffect,
  createResource,
  createSignal,
  ErrorBoundary,
  type JSX,
  lazy,
  type ParentProps,
  Show,
} from "solid-js"
import { Dynamic } from "solid-js/web"
import { makeEventListener } from "@solid-primitives/event-listener"
import { CommandProvider, useCommand, type CommandOption } from "@/context/command"
import { CommentsProvider } from "@/context/comments"
import { FileProvider } from "@/context/file"
import { ServerSDKProvider } from "@/context/server-sdk"
import { ServerSyncProvider } from "@/context/server-sync"
import { GlobalProvider, useGlobal } from "@/context/global"
import { LanguageProvider, type Locale, useLanguage } from "@/context/language"
import { LayoutProvider, useLayout } from "@/context/layout"
import { ModelPreferencesProvider, ModelsProvider } from "@/context/models"
import { ConnectionError } from "@/orchestra/shell/connection-error"
import { NotificationProvider } from "@/context/notification"
import { PermissionProvider } from "@/context/permission"
import { usePlatform } from "@/context/platform"
import { PromptProvider } from "@/context/prompt"
import { ServerConnection, ServerProvider, useServer } from "@/context/server"
import { JanitorProvider } from "@/context/janitor"
import { JanitorWidget } from "@/components/janitor-widget"
import { SettingsProvider, useSettings } from "@/context/settings"
import { TabsProvider, useTabs, type DraftTab } from "@/context/tabs"
import { SDKProvider, useSDK } from "@/context/sdk"
import { WslServersProvider } from "@/wsl/context"
import DirectoryLayout, { DirectoryDataProvider } from "@/pages/directory-layout"
import NewLayout from "@/pages/layout-new"
import { ErrorPage } from "./pages/error"
import { useCheckServerHealth } from "./utils/server-health"
import { legacySessionServer, parseServerKey, sessionHref } from "./utils/session-route"
import { showToast } from "./utils/toast"
import { errorMessage } from "@/pages/layout/helpers"

import { SessionPage, SessionRouteErrorBoundary, TargetSessionRouteContent } from "@/pages/session"
import { NewHome } from "@/pages/home"
import { OrchestraChapterRoute } from "@/orchestra/chapter-route"

const NewSession = lazy(() => import("@/pages/new-session"))

const SessionRoute = () => {
  const params = useParams()
  const [search] = useSearchParams<{ draftId?: string; prompt?: string }>()
  const sdk = useSDK()
  const server = useServer()
  const tabs = useTabs()

  if (params.id) {
    const sessionID = params.id
    return (
      <Show when={tabs.ready()}>
        {(_) => {
          const persisted = tabs.store.filter((item) => item.type === "session")
          return <Navigate href={sessionHref(legacySessionServer(persisted, sessionID, server.key), sessionID)} />
        }}
      </Show>
    )
  }

  // The old new-session route (/:dir/session with no id) is replaced by a draft at /new-session?draftId=…
  createEffect(() => {
    if (params.id || search.draftId) return
    if (!tabs.ready() || !sdk().directory) return
    tabs.newDraft({ server: server.key, directory: sdk().directory }, search.prompt)
  })

  return (
    <SessionRouteErrorBoundary sessionID={params.id}>
      <SessionPage />
    </SessionRouteErrorBoundary>
  )
}

function TargetServerRoute(props: ParentProps) {
  const params = useParams<{ serverKey: string; id: string }>()
  const global = useGlobal()
  const server = useServer()
  const key = createMemo(() => parseServerKey(params.serverKey))
  const conn = createMemo(() => global.servers.list().find((item) => ServerConnection.key(item) === key()))

  return (
    // Owns the server-identity remount. Session changes must NOT remount this
    // subtree (SessionRouteErrorBoundary resets and createSessionLineage
    // re-resolves reactively instead); both rely on this key for server changes.
    // A malformed key or a removed server leaves instead of loading against the selected server, which only
    // resolves its own key.
    <Show when={(conn() || key() === server.key) && key()} keyed fallback={<Navigate href="/" />}>
      <ServerSDKProvider server={conn}>
        <ServerSyncProvider server={conn}>{props.children}</ServerSyncProvider>
      </ServerSDKProvider>
    </Show>
  )
}

const TargetSessionRoute = () => (
  <TargetServerRoute>
    <TargetSessionRouteContent />
  </TargetServerRoute>
)

// Wraps the non-draft routes. They are gated on (and keyed to) the globally selected
// server via ServerKey, then provide the server-scoped shell for that server.
function SelectedServerProviders(props: ParentProps) {
  return (
    <ServerKey>
      <ServerSDKProvider>
        <ServerSyncProvider>{props.children}</ServerSyncProvider>
      </ServerSDKProvider>
    </ServerKey>
  )
}

function DraftRoute() {
  const [search] = useSearchParams<{ draftId?: string }>()
  const tabs = useTabs()
  return (
    <Show when={tabs.ready()}>
      <Show
        when={tabs.store.find((tab): tab is DraftTab => tab.type === "draft" && tab.draftID === search.draftId)}
        keyed
        fallback={<Navigate href="/" />}
      >
        {(draft) => <ResolvedDraftRoute draft={draft} />}
      </Show>
    </Show>
  )
}

function ResolvedDraftRoute(props: { draft: DraftTab }) {
  const global = useGlobal()
  const conn = createMemo(() => global.servers.list().find((item) => ServerConnection.key(item) === props.draft.server))
  const directory = () => props.draft.directory
  const serverKey = () => props.draft.server

  return (
    <Show when={conn() && `${props.draft.server}\0${props.draft.directory}`} keyed fallback={<Navigate href="/" />}>
      <ServerSDKProvider server={conn}>
        <ServerSyncProvider server={conn}>
          <ModelsProvider directory={directory}>
            <SDKProvider directory={directory}>
              <DirectoryDataProvider directory={directory} server={serverKey}>
                <DraftProviders>
                  <NewSession />
                </DraftProviders>
              </DirectoryDataProvider>
            </SDKProvider>
          </ModelsProvider>
        </ServerSyncProvider>
      </ServerSDKProvider>
    </Show>
  )
}

function UiI18nBridge(props: ParentProps) {
  const language = useLanguage()
  return (
    <I18nProvider
      value={{ locale: language.intl, layoutLocale: language.layoutLocale, t: language.t, plural: language.plural }}
    >
      {props.children}
    </I18nProvider>
  )
}

declare global {
  interface Window {
    __ORCHESTRA__?: {
      deepLinks?: string[]
    }
    api?: Partial<import("./app-dock-linux").AppDockLinuxAPI> & {
      appDockOpen?: (
        url: string,
        bounds: { x: number; y: number; width: number; height: number },
        profile?: string,
      ) => Promise<{ id: string; tabID: string; generation: number; url: string }>
      appDockDeleteProfile?: (profileID: string) => Promise<void>
      appDockResize?: (
        tab: { tabID: string; generation: number },
        bounds: { x: number; y: number; width: number; height: number },
      ) => Promise<void>
      appDockHide?: (tab: { tabID: string; generation: number }) => Promise<void>
      appDockOcclude?: (occluded: boolean) => Promise<void>
      appDockClose?: () => Promise<void>
      appDockCloseTab?: (id: string) => Promise<void>
      appDockSelect?: (
        tab: { tabID: string; generation: number },
        bounds: { x: number; y: number; width: number; height: number },
      ) => Promise<void>
      appDockNavigate?: (id: string, url: string) => Promise<{ ok: boolean; url?: string }>
      appDockCommand?: (id: string, command: "back" | "forward" | "reload") => Promise<void>
      appDockEvent?: (
        callback: (
          event:
            | {
                type: "state"
                payload: {
                  tabID: string
                  generation: number
                  url: string
                  title: string
                  favicon?: string
                  loading: boolean
                  audible: boolean
                }
              }
            | {
                type: "download"
                payload: {
                  id: string
                  tabID: string
                  generation: number
                  filename: string
                  receivedBytes: number
                  totalBytes: number
                  state: "progressing" | "paused" | "completed" | "cancelled" | "interrupted"
                }
              }
            | { type: "fullscreen"; payload: { identity: { tabID: string; generation: number }; enabled: boolean } }
            | {
                type: "navigation-error"
                payload: { identity: { tabID: string; generation: number }; code: "blocked" | "failed"; url: string }
              },
        ) => void,
      ) => () => void
      appDockFind?: (id: string, text: string, forward: boolean) => Promise<number>
      appDockStopFind?: (id: string) => Promise<void>
      appDockFindResult?: (
        callback: (result: {
          tabID: string
          requestID: number
          activeMatchOrdinal: number
          matches: number
          finalUpdate: boolean
        }) => void,
      ) => () => void
      appDockZoom?: (id: string, factor?: number) => Promise<number>
      appDockCancelDownload?: (id: string) => Promise<void>
      appDockOpenDownload?: (id: string) => Promise<void>
      appDockFullscreen?: (id: string, enabled: boolean) => Promise<void>
      setTitlebar?: (theme: { mode: "light" | "dark"; scheme?: "system" | "light" | "dark" }) => Promise<void>
      exportDebugLogs?: () => Promise<string>
      janitor?: {
        getReport: () => Promise<{ report: string; source: string | null } | null>
        publish: (report: string, notify?: boolean, source?: string | null) => Promise<boolean>
        snooze: (minutes: number, source?: string | null) => Promise<boolean>
        dismiss: (source?: string | null) => Promise<boolean>
        onReport: (cb: (event: { report: string; notify: boolean; source: string | null }) => void) => () => void
      }
    }
  }
}

function QueryProvider(props: ParentProps) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnReconnect: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
      },
    },
  })
  return <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
}

function BodyDesignClass() {
  createRenderEffect(() => {
    if (typeof document === "undefined") return

    document.documentElement.toggleAttribute("data-new-layout", true)
    document.body.toggleAttribute("data-new-layout", true)
    syncThemeBackground()
    // The HTML shells ship the body with the pre-JS text class; the app font replaces it.
    document.body.classList.remove("text-12-regular")
    document.body.classList.add("font-(family-name:--font-family-text)", "text-[13px]", "font-[440]")
  })

  return null
}

// Server-agnostic providers shared across every route. These live in the shared
// shell (router root) so they stay mounted regardless of the active server/route.
function SharedProviders(props: ParentProps) {
  return (
    <>
      <BodyDesignClass />
      <CommandProvider>
        <DesktopCommands />
        {props.children}
      </CommandProvider>
    </>
  )
}

function DesktopCommands() {
  const command = useCommand()
  const language = useLanguage()
  const platform = usePlatform()

  command.register("desktop", () => {
    const commands: CommandOption[] = []
    if (platform.platform === "desktop" && platform.exportDebugLogs) {
      commands.push({
        id: "logs.export",
        title: language.t("command.logs.export"),
        category: language.t("command.category.settings"),
        onSelect: () => {
          void platform.exportDebugLogs?.().catch((error: unknown) =>
            showToast({
              variant: "error",
              title: language.t("orchestra.shell.logs.exportFailed"),
              description: errorMessage(error, language.t("common.requestFailed")),
            }),
          )
        },
      })
    }
    return commands
  })

  return null
}

function NewAppLayout(props: ParentProps<{ serverScoped?: JSX.Element }>) {
  return (
    <SelectedServerProviders>
      <LayoutProvider>
        {props.serverScoped}
        <ModelsProvider>
          <NewLayout>{props.children}</NewLayout>
        </ModelsProvider>
      </LayoutProvider>
    </SelectedServerProviders>
  )
}

function HomeServerProviders() {
  const layout = useLayout()
  const global = useGlobal()
  const server = useServer()
  const owner = createMemo(
    () => {
      const selection = layout.home.selection()
      const conn =
        global.servers.list().find((item) => ServerConnection.key(item) === selection.server) ?? server.current
      if (!conn) return
      const directory = ServerConnection.key(conn) === selection.server ? selection.directory : undefined
      return { key: `${ServerConnection.key(conn)}\0${directory ?? ""}`, conn, directory }
    },
    undefined,
    { equals: (a, b) => a?.key === b?.key },
  )
  return (
    <Show when={owner()} keyed>
      {(owner) => (
        <ServerSDKProvider server={() => owner.conn}>
          <ServerSyncProvider server={() => owner.conn}>
            <ModelsProvider directory={() => owner.directory}>
              <NewHome />
            </ModelsProvider>
          </ServerSyncProvider>
        </ServerSDKProvider>
      )}
    </Show>
  )
}

// The draft page only renders the prompt composer, so it drops TerminalProvider.
// FileProvider and CommentsProvider stay because PromptInput uses file search and comment context.
function DraftProviders(props: ParentProps) {
  return (
    <FileProvider>
      <PromptProvider>
        <CommentsProvider>{props.children}</CommentsProvider>
      </PromptProvider>
    </FileProvider>
  )
}

export function AppBaseProviders(
  props: ParentProps<{
    locale?: Locale
    onNativeTranslations?: Parameters<typeof LanguageProvider>[0]["onNativeTranslations"]
  }>,
) {
  return (
    <MetaProvider>
      <Font />
      <ThemeProvider
        onThemeApplied={(_, mode, scheme) => {
          void window.api?.setTitlebar?.({ mode, scheme })
        }}
      >
        <OrchestraPaletteProvider>
          <LanguageProvider locale={props.locale} onNativeTranslations={props.onNativeTranslations}>
            <UiI18nBridge>
              <ErrorBoundary
                fallback={(error) => {
                  Sentry.captureException(error)
                  return <ErrorPage error={error} />
                }}
              >
                <QueryProvider>
                  <WslServersProvider>
                    <ModelPreferencesProvider>
                      <DialogProvider>
                        <FileComponentProvider component={File}>{props.children}</FileComponentProvider>
                      </DialogProvider>
                    </ModelPreferencesProvider>
                  </WslServersProvider>
                </QueryProvider>
              </ErrorBoundary>
            </UiI18nBridge>
          </LanguageProvider>
        </OrchestraPaletteProvider>
      </ThemeProvider>
    </MetaProvider>
  )
}

function ConnectionGate(props: ParentProps<{ disableHealthCheck?: boolean; startup?: Promise<void> }>) {
  const server = useServer()
  const checkServerHealth = useCheckServerHealth()

  const [checkMode, setCheckMode] = createSignal<"blocking" | "background">("blocking")

  // performs repeated health check with a grace period for
  // non-http connections, otherwise fails instantly
  const [startupHealthCheck, healthCheckActions] = createResource(() =>
    props.disableHealthCheck
      ? true
      : Effect.gen(function* () {
          if (!server.current) return true
          const { http, type } = server.current

          while (true) {
            const res = yield* Effect.promise(() => checkServerHealth(http))
            if (res.healthy) return true
            if (checkMode() === "background" || type === "http") return false
            // A sidecar that is still starting refuses at once; without a pause this loop asks it continuously.
            yield* Effect.sleep("500 millis")
          }
        }).pipe(
          Effect.timeoutOrElse({ duration: "10 seconds", orElse: () => Effect.succeed(false) }),
          Effect.ensuring(Effect.sync(() => setCheckMode("background"))),
          Effect.runPromise,
        ),
  )
  const checking = createMemo(
    () => checkMode() === "blocking" && ["unresolved", "pending"].includes(startupHealthCheck.state),
  )
  const [startup] = createResource(async () => {
    if (!props.startup) return true
    await props.startup.catch((error) => {
      console.error("[startup] startup gate failed", error)
    })
    return true
  })
  const startupChecking = createMemo(
    () => startupHealthCheck.latest === true && ["unresolved", "pending"].includes(startup.state),
  )
  const loading = createMemo(() => checking() || startupChecking())

  return (
    <>
      <Show when={!checking()}>
        <Show
          when={startupHealthCheck.latest}
          fallback={
            <ConnectionError
              onRetry={() => {
                if (checkMode() === "background") void healthCheckActions.refetch()
              }}
              onServerSelected={(key) => {
                setCheckMode("blocking")
                server.setActive(key)
                void healthCheckActions.refetch()
              }}
            />
          }
        >
          {props.children}
        </Show>
      </Show>
      <Show when={loading()}>
        <div class="fixed inset-0 z-[9999] bg-background-base" data-tauri-drag-region data-app-loading />
      </Show>
    </>
  )
}

function ServerKey(props: ParentProps) {
  const server = useServer()
  return (
    <Show when={server.key} keyed>
      {props.children}
    </Show>
  )
}

export function AppInterface(props: {
  children?: JSX.Element
  defaultServer: ServerConnection.Key
  canonicalLocalServer?: ServerConnection.Key
  servers?: Array<ServerConnection.Any>
  router?: Component<BaseRouterProps>
  disableHealthCheck?: boolean
  startup?: Promise<void>
  serverScoped?: JSX.Element
}) {
  // The visual new layout lives in the router root so it remains mounted across
  // route changes. Draft and session routes override only their server-bound data
  // providers beneath it.
  const ServerShell = (shellProps: ParentProps) => {
    const settings = useSettings()
    return (
      <SharedProviders>
        <JanitorProvider enabled={settings.general.janitorEnabled}>
          {props.children}
          {shellProps.children}
          <JanitorWidget />
        </JanitorProvider>
      </SharedProviders>
    )
  }

  return (
    <ServerProvider
      defaultServer={props.defaultServer}
      canonicalLocalServer={props.canonicalLocalServer}
      servers={props.servers}
    >
      <GlobalProvider>
        <SettingsProvider>
          <ConnectionGate disableHealthCheck={props.disableHealthCheck} startup={props.startup}>
            <Dynamic
              component={props.router ?? Router}
              root={(routerProps) => (
                <TabsProvider>
                  <PermissionProvider>
                    <NotificationProvider>
                      <ServerShell>
                        <NewAppLayout serverScoped={props.serverScoped}>{routerProps.children}</NewAppLayout>
                      </ServerShell>
                    </NotificationProvider>
                  </PermissionProvider>
                </TabsProvider>
              )}
            >
              <Routes />
            </Dynamic>
          </ConnectionGate>
        </SettingsProvider>
      </GlobalProvider>
    </ServerProvider>
  )
}

function Routes() {
  return (
    <>
      <Route component={(routeProps) => <SelectedServerProviders>{routeProps.children}</SelectedServerProviders>}>
        <Route path="/:dir" component={DirectoryLayout}>
          <Route path="/" component={() => <Navigate href="session" />} />
          <Route path="/session/:id?" component={SessionRoute} />
        </Route>
      </Route>
      <Route path="/" component={HomeServerProviders} />
      <Route path="/:dir/session/:id" component={NewLayoutLegacySessionRedirect} />
      <Route path="/server/:serverKey/session/:id" component={TargetSessionRoute} />
      <Route path="/orchestra/:chapter/*rest" component={OrchestraChapterRoute} />
      <Route path="/new-session" component={DraftRoute} />
    </>
  )
}

function NewLayoutLegacySessionRedirect() {
  const server = useServer()
  const tabs = useTabs()
  const params = useParams<{ id: string }>()

  return (
    <Show when={tabs.ready()}>
      <Navigate
        href={sessionHref(
          legacySessionServer(
            tabs.store.filter((item) => item.type === "session"),
            params.id,
            server.key,
          ),
          params.id,
        )}
      />
    </Show>
  )
}
