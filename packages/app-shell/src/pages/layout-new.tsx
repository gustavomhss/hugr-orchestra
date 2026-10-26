import { createMediaQuery } from "@solid-primitives/media"
import { useLocation, useNavigate } from "@solidjs/router"
import { ButtonV2 } from "@orchestra/ui/v2/button-v2"
import { createEffect, ErrorBoundary, on, onCleanup, Show, Suspense, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { DebugBar } from "@/components/debug-bar"
import { Titlebar } from "@/components/titlebar"
import { useTitlebarUpdate } from "@/components/updater-action"
import { useGlobal } from "@/context/global"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { ServerConnection, useServer } from "@/context/server"
import { OrchestraSidebar } from "@/orchestra/sidebar"
import { createOrchestraNavigation } from "@/orchestra/compact-navigation"
import { OrchestraNavigationToggle } from "@/orchestra/navigation-toggle"
import { ShellNavigationCommands } from "@/orchestra/shell/navigation-commands"
import { LiveSeatCommands } from "@/orchestra/live/commands"
import { MobileNavigation } from "@/orchestra/shell/mobile-navigation"
import { NewShellIngress } from "@/orchestra/shell/ingress"
import { formatError } from "@/pages/error"
import { errorDescriptionKey } from "@/pages/error-description"
import { useCheckServerHealth } from "@/utils/server-health"
import { setV2Toast, ToastRegion } from "@/utils/toast"

export default function NewLayout(props: ParentProps) {
  const platform = usePlatform()
  const layout = useLayout()
  const language = useLanguage()
  const location = useLocation()
  const navigate = useNavigate()
  const desktop = createMediaQuery("(min-width: 768px)")
  const constrained = createMediaQuery("(max-width: 1279px)")
  const narrow = createMediaQuery("(max-width: 1023px)")
  const navigation = createOrchestraNavigation({ platform, constrained })
  const [state, setState] = createStore({
    debugTools: true,
    railRequested: false,
    tabsMount: undefined as HTMLElement | undefined,
  })

  createEffect(() => setV2Toast(true))

  const update = useTitlebarUpdate()

  return (
    <>
      <ShellNavigationCommands />
      <LiveSeatCommands />
      <NewShellIngress />
      {/* Desktop preferences load over IPC; wait so a collapsed window never paints expanded first. */}
      <Show when={navigation.ready()}>
        <div
          class="relative bg-v2-background-bg-deep flex-1 min-h-0 min-w-0 flex flex-col select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text"
          classList={{ "orchestra-shell": desktop() }}
          style={{
            "padding-top": "env(safe-area-inset-top, 0px)",
            "padding-bottom": "env(safe-area-inset-bottom, 0px)",
          }}
        >
          <Show when={desktop()}>
            {/* The toolbar's drop shadow; see the glass plates in orchestra/theme.css. */}
            <div class="orchestra-toolbar-shadow" aria-hidden="true">
              <div />
            </div>
          </Show>
          <Titlebar
            navigation={
              <Show when={desktop()} fallback={<MobileNavigation />}>
                <Show when={narrow()}>
                  <OrchestraNavigationToggle
                    compact={!state.railRequested}
                    constrained={false}
                    iconOnly
                    onToggle={() => setState("railRequested", (value) => !value)}
                  />
                </Show>
              </Show>
            }
            update={update}
            tabsMount={desktop() ? state.tabsMount : undefined}
            debugTools={
              import.meta.env.DEV
                ? { visible: state.debugTools, toggle: () => setState("debugTools", (value) => !value) }
                : undefined
            }
          />
          <div
            class="flex-1 min-h-0 min-w-0 flex flex-col"
            classList={{ "orchestra-workspace": desktop() }}
            data-navigation={
              desktop()
                ? narrow() && !state.railRequested
                  ? "hidden"
                  : navigation.compact()
                    ? "compact"
                    : "expanded"
                : undefined
            }
          >
            <Show when={desktop()}>
              {/* The session panels' blur; see the glass layer in orchestra/session.css. */}
              <div class="orchestra-glass-layer" aria-hidden="true">
                <div data-orchestra-glass="session-body">
                  <div>
                    <div />
                  </div>
                </div>
                <div data-orchestra-glass="session-side-panel">
                  <div>
                    <div />
                  </div>
                </div>
                <div data-orchestra-glass="session-new-design">
                  <div>
                    <div />
                  </div>
                </div>
              </div>
              {/* The sidebar's blur; see the glass plates in orchestra/theme.css. */}
              <div data-glass-plate="sidebar" aria-hidden="true" />
              <OrchestraSidebar
                compact={navigation.compact()}
                constrained={constrained()}
                onToggle={navigation.toggle}
              />
            </Show>
            <div class="flex-1 min-h-0 min-w-0 flex flex-col" classList={{ "orchestra-content": desktop() }}>
              <ServerConnectionBanner />
              <Show when={desktop()}>
                <div
                  class="orchestra-session-tabs-frame"
                  hidden={layout.route().type !== "session" && layout.route().type !== "draft"}
                >
                  <div data-glass-plate="session-tabs" aria-hidden="true" />
                  <div
                    id="orchestra-session-tabs"
                    class="orchestra-session-tabs"
                    ref={(element) => setState("tabsMount", element)}
                  />
                </div>
              </Show>
              <main class="flex-1 min-h-0 min-w-0 overflow-x-hidden flex flex-col items-start contain-strict">
                <Suspense>
                  {/* A page error stays in the content area so the sidebar and titlebar can still navigate away. */}
                  <ErrorBoundary
                    fallback={(error, reset) => {
                      createEffect(on(() => location.pathname + location.search, () => reset(), { defer: true }))
                      return (
                        <div
                          role="alert"
                          class="flex-1 self-stretch min-h-0 overflow-auto flex flex-col items-center justify-center gap-4 p-6 text-center"
                        >
                          <div class="flex flex-col items-center gap-1 max-w-md">
                            <div class="text-16-medium text-v2-text-text-base">{language.t("error.page.title")}</div>
                            <div class="text-13-regular text-v2-text-text-muted">
                              {language.t(errorDescriptionKey(error))}
                            </div>
                          </div>
                          <pre class="w-full max-w-2xl max-h-40 overflow-auto rounded-md p-3 text-left font-mono text-xs whitespace-pre-wrap break-words select-text text-v2-text-text-muted bg-v2-background-bg-layer-01">
                            {formatError(error, language.t)}
                          </pre>
                          <div class="flex flex-wrap justify-center gap-2">
                            <ButtonV2 variant="neutral" onClick={() => reset()}>
                              {language.t("orchestra.shell.error.retry")}
                            </ButtonV2>
                            <ButtonV2
                              variant="contrast"
                              onClick={() => (location.pathname === "/" ? reset() : navigate("/"))}
                            >
                              {language.t("orchestra.shell.error.home")}
                            </ButtonV2>
                          </div>
                        </div>
                      )
                    }}
                  >
                    {props.children}
                  </ErrorBoundary>
                </Suspense>
              </main>
            </div>
          </div>
          {import.meta.env.DEV && state.debugTools && <DebugBar inline />}
          <ToastRegion v2 />
        </div>
      </Show>
    </>
  )
}

// The global health poll reports the selected server; a single failed poll during a quick restart is not shown.
function ServerConnectionBanner() {
  const global = useGlobal()
  const server = useServer()
  const platform = usePlatform()
  const language = useLanguage()
  const check = useCheckServerHealth()
  const [state, setState] = createStore({ lost: false, checking: false })

  createEffect(() => {
    setState("lost", false)
    if (global.servers.health[server.key]?.healthy !== false) return
    const timer = setTimeout(() => setState("lost", true), 3000)
    onCleanup(() => clearTimeout(timer))
  })

  const retry = async () => {
    const conn = server.current
    if (!conn || state.checking) return
    setState("checking", true)
    const health = await check(conn.http).catch(() => ({ healthy: false }))
    setState({ checking: false, lost: !health.healthy })
  }

  return (
    <Show when={state.lost}>
      <div
        role="status"
        class="flex-none flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[9px] border border-v2-state-border-warning bg-v2-state-bg-warning px-3 py-2 text-13-regular text-v2-state-fg-warning"
      >
        <span class="flex-1 min-w-0">{language.t("orchestra.shell.server.lost")}</span>
        <ButtonV2 size="small" variant="neutral" disabled={state.checking} onClick={() => void retry()}>
          {language.t("orchestra.shell.server.retry")}
        </ButtonV2>
        <Show when={server.current && ServerConnection.builtin(server.current)}>
          <ButtonV2 size="small" variant="neutral" onClick={() => void platform.restart()}>
            {language.t("orchestra.shell.server.restart")}
          </ButtonV2>
        </Show>
      </div>
    </Show>
  )
}
