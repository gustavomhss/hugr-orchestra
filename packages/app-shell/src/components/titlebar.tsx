import { createEffect, createMemo, createResource, createSignal, on, onMount, Show, untrack, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { Portal } from "solid-js/web"
import { useLocation, useNavigate } from "@solidjs/router"
import { IconButtonV2 } from "@orchestra/ui/v2/icon-button-v2"
import { Icon as IconV2 } from "@orchestra/ui/v2/icon"
import { KeybindV2 } from "@orchestra/ui/v2/keybind-v2"
import { TooltipV2 } from "@orchestra/ui/v2/tooltip-v2"
import { useTheme } from "@orchestra/ui/theme/context"

import { LayoutRoute, useLayout, type HomeProjectSelection } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { WindowsAppMenu } from "./windows-app-menu"
import { applyPath, backPath, forwardPath } from "./titlebar-history"
import { TitlebarTabStrip } from "@/components/titlebar-tab-strip"
import { useDraftCloseGuard } from "@/components/titlebar-draft-close"
import { makeEventListener } from "@solid-primitives/event-listener"
import { createMediaQuery } from "@solid-primitives/media"
import { readSessionTabsRemovedDetail, SESSION_TABS_REMOVED_EVENT } from "@/components/titlebar-session-events"
import { useGlobal } from "@/context/global"
import { ServerConnection, useServer } from "@/context/server"
import { tabKey, useTabs, type Tab } from "@/context/tabs"
import { closeProfileTab } from "./titlebar-tab-order"
import type { PromptSession } from "@/context/prompt"
import "./titlebar.css"
import { newTabTooltipKeybind } from "./command-tooltip-keybind"
import { normalizeSessionInfo } from "@/utils/session"
import { profileProject, projectForSession } from "@/pages/layout/helpers"
import { createNativeTitlebarFrame } from "./orchestra/native-frame"
import { breadcrumbLabel } from "../orchestra/navigation"
import { CrumbTrail } from "../orchestra/crumbs"

const v2TitlebarHeight = 36
const desktopTitlebarHeight = 45
const minTitlebarZoom = 0.25
const windowsControlsBaseWidth = 138 // 3 native Windows caption buttons at 46px each.
const macTrafficLightsBaseWidth = 84

export type TitlebarUpdate = {
  version: () => string | undefined
  installing: () => boolean
  ariaLabel: () => string
  install: () => void
}

export function useTitlebarRightMount() {
  const language = useLanguage()
  const [mount, setMount] = createSignal<HTMLElement | null>(null)
  const sync = () => setMount(document.getElementById("orchestra-titlebar-right"))
  onMount(sync)
  createEffect(on(language.direction, sync, { defer: true }))
  return mount
}

export function Titlebar(props: {
  update?: TitlebarUpdate
  debugTools?: { visible: boolean; toggle: () => void }
  tabsMount?: HTMLElement
  navigation?: JSX.Element
}) {
  const layout = useLayout()
  const platform = usePlatform()
  const command = useCommand()
  const language = useLanguage()
  const settings = useSettings()
  const theme = useTheme()
  const server = useServer()
  const navigate = useNavigate()
  const location = useLocation()
  const desktop = createMediaQuery("(min-width: 768px)")
  const mobile = () => !desktop()
  const tabsMount = createMemo(() => (desktop() ? props.tabsMount : undefined))
  const bottom = createMemo(() => mobile() && settings.general.mobileTitlebarPosition() === "bottom")

  const mac = createMemo(() => platform.platform === "desktop" && platform.os === "macos")
  const windows = createMemo(() => platform.platform === "desktop" && platform.os === "windows")
  const linux = createMemo(() => platform.platform === "desktop" && platform.os === "linux")
  const macTrafficLights = createMemo(() => mac() && !platform.windowFullscreen?.())
  const zoom = () => platform.webviewZoom?.() ?? 1
  const titlebarZoom = () => (windows() ? Math.max(zoom(), minTitlebarZoom) : zoom())
  const minHeight = () => {
    const height = mobile() ? v2TitlebarHeight : desktopTitlebarHeight
    if (mac()) return `${height / zoom()}px`
    if (windows()) return `${height / Math.min(titlebarZoom(), 1)}px`
    return undefined
  }
  const windowsControlsWidth = () => `${windowsControlsBaseWidth / Math.max(titlebarZoom(), 1)}px`

  let header!: HTMLElement
  createNativeTitlebarFrame({
    platform,
    header: () => header,
    isDesktop: desktop,
  })

  const [history, setHistory] = createStore({
    stack: [] as string[],
    index: 0,
    action: undefined as "back" | "forward" | undefined,
  })

  const path = () => `${location.pathname}${location.search}${location.hash}`

  createEffect(() => {
    const current = path()

    untrack(() => {
      const next = applyPath(history, current)
      if (next === history) return
      setHistory(next)
    })
  })

  const updateState = createMemo<TitlebarUpdatePillState>(() => {
    const installing = props.update?.installing() ?? false
    const version = props.update?.version()
    return {
      visible: version !== undefined || installing,
      installing,
      label: language.t("titlebar.update"),
      ariaLabel: props.update?.ariaLabel() ?? language.t("toast.update.action.installRestart"),
      title: version ? language.t("titlebar.updateVersion", { version }) : undefined,
      onInstall: () => props.update?.install(),
    }
  })
  const v2RightState = createMemo<TitlebarV2RightState>(() => ({
    update: updateState(),
  }))

  const back = () => {
    const next = backPath(history)
    if (!next) return
    setHistory(next.state)
    navigate(next.to)
  }

  const forward = () => {
    const next = forwardPath(history)
    if (!next) return
    setHistory(next.state)
    navigate(next.to)
  }

  command.register(() => [
    {
      id: "common.goBack",
      title: language.t("common.goBack"),
      category: language.t("command.category.view"),
      keybind: "mod+[",
      onSelect: back,
    },
    {
      id: "common.goForward",
      title: language.t("common.goForward"),
      category: language.t("command.category.view"),
      keybind: "mod+]",
      onSelect: forward,
    },
  ])

  const global = useGlobal()

  const tabs = useTabs()
  const guardDraftClose = useDraftCloseGuard()
  const tabsStore = tabs.store
  const tabsStoreActions = tabs
  const [session] = createResource(
    () => {
      const route = layout.route()
      if (route.type !== "session") return undefined
      const conn = global.servers.list().find((item) => ServerConnection.key(item) === (route.server ?? server.key))
      return conn ? { route, sdk: global.ensureServerCtx(conn).sdk } : undefined
    },
    ({ route, sdk }) =>
      sdk.api.session
        .get({ sessionID: route.sessionId })
        .then(normalizeSessionInfo)
        .catch(() => {}),
  )

  const matchRoute = (route: LayoutRoute) => {
    if (route.type === "home") return
    if (route.type === "draft") {
      return tabsStore.find((item) => item.type === "draft" && item.draftID === route.draftID)
    }
    if (route.type === "session") {
      const main = tabsStore.find(
        (item) => item.type === "session" && item.server === route.server && item.sessionId === route.sessionId,
      )
      if (main) return main
      const s = session()
      if (s?.parentID) {
        const parentID = s.parentID
        const parent = tabsStore.find(
          (item) => item.type === "session" && item.server === route.server && item.sessionId === parentID,
        )
        if (parent) return parent
      }
    }
  }

  const currentTab = () => matchRoute(layout.route())
  const profile = createMemo<HomeProjectSelection | undefined>(() => {
    if (!tabsMount()) return
    const route = layout.route()
    const current = currentTab()
    const key =
      route.type === "home" || route.type === "chapter" ? layout.home.selection().server : (route.server ?? server.key)
    const conn = global.servers.list().find((item) => ServerConnection.key(item) === key)
    const ctx = conn ? global.ensureServerCtx(conn) : undefined
    const value =
      route.type === "session"
        ? (ctx?.sync.session.peek(route.sessionId) ?? (session()?.id === route.sessionId ? session() : undefined))
        : undefined
    const directory =
      value?.directory ??
      (current?.type === "draft"
        ? current.directory
        : route.type === "dir-new-sesssion"
          ? route.dir
          : route.type === "session"
            ? tabs.info[tabKey({ type: "session", server: key, sessionId: route.sessionId })]?.directory
            : layout.home.selection().directory)
    // The sidebar's lookup: a draft in a V2 copy belongs to its repository, whose saved workspace choice
    // then steers the new draft.
    const project = value
      ? projectForSession(value, ctx?.projects.list() ?? [])
      : ctx && directory
        ? profileProject(ctx, directory)
        : undefined
    return { server: key, directory: project?.worktree ?? directory }
  })

  createEffect(() => {
    const route = layout.route()
    if (!tabs.ready()) return
    const tab = currentTab()
    if (tab) {
      tabs.remember(tab)
      return
    }

    if (route.type === "session") {
      const s = session()
      if (!s) return
      const sessionId = s.parentID ?? s.id
      const next = { server: route.server ?? server.key, sessionId }
      tabsStoreActions.addSessionTab(next)
    }
  })

  makeEventListener(window, SESSION_TABS_REMOVED_EVENT, (event) => {
    const detail = readSessionTabsRemovedDetail(event)
    if (!detail) return
    tabsStoreActions.removeSessions(detail)
  })

  const openNewTab = () => {
    const route = layout.route()
    const activeSession = session()
    const selected = profile()
    if (selected?.directory) {
      const active = currentTab()
      const model =
        active?.server === selected.server
          ? tabs.stateValue<PromptSession>(active, "prompt")?.model.current()
          : undefined
      tabs.newDraft({ server: selected.server, directory: selected.directory }, "", model)
      return
    }
    if (route.type === "session" && activeSession) {
      const sessionTab = {
        type: "session" as const,
        server: route.server ?? server.key,
        sessionId: activeSession.id,
      }
      const model = tabs.stateValue<PromptSession>(sessionTab, "prompt")?.model.current()
      tabs.newDraft({ server: sessionTab.server, directory: activeSession.directory }, "", model)
      return
    }

    const activeTab = currentTab()
    if (activeTab?.type === "draft") {
      const model = tabs.stateValue<PromptSession>(activeTab, "prompt")?.model.current()
      tabs.newDraft({ server: activeTab.server, directory: activeTab.directory }, "", model)
      return
    }

    if (route.type === "home") {
      const selection = layout.home.selection()
      const conn = global.servers.list().find((item) => ServerConnection.key(item) === selection.server)
      const project = conn
        ? global
            .ensureServerCtx(conn)
            .projects.list()
            .find((item) => item.worktree === selection.directory)
        : undefined
      if (conn && project) {
        tabs.newDraft({ server: ServerConnection.key(conn), directory: project.worktree }, "")
        return
      }
    }

    const current = layout.projects.list()[0]
    if (current) {
      tabs.newDraft({ server: server.key, directory: current.worktree }, "")
      return
    }

    const fallback = global.servers.list().flatMap((conn) => {
      const project = global.ensureServerCtx(conn).projects.list()[0]
      return project ? [{ server: ServerConnection.key(conn), project }] : []
    })[0]
    if (!fallback) return command.trigger("project.open")

    tabs.newDraft({ server: fallback.server, directory: fallback.project.worktree }, "")
  }
  const toggleHome = () => tabs.toggleHome({ home: layout.route().type === "home", current: currentTab() })
  const [visible, setVisible] = createStore({ tabs: [] as Tab[] })
  const closeNow = (tab: Tab) =>
    closeProfileTab({
      tabs,
      visible: profile() ? visible.tabs : undefined,
      current: currentTab(),
      tab,
      home: () => navigate("/"),
    })
  const closeTab = (tab: Tab) => guardDraftClose(tab, () => closeNow(tab))

  command.register("titlebar-home", () => [
    {
      id: "home.toggle",
      title: language.t("home.title"),
      category: language.t("command.category.view"),
      keybind: "mod+b",
      hidden: true,
      onSelect: toggleHome,
    },
  ])

  command.register("tabs", () => {
    const current = currentTab()

    return [
      {
        id: "tab.new",
        category: "tab",
        title: language.t("command.session.new"),
        keybind: "mod+t,mod+n",
        hidden: true,
        onSelect: openNewTab,
      },
      current && {
        id: "tab.close",
        category: "tab",
        title: language.t("command.tab.close"),
        keybind: "mod+w",
        hidden: true,
        onSelect: () => closeTab(current),
      },
      {
        id: "tab.reopenClosed",
        category: language.t("command.category.file"),
        title: language.t("command.tab.reopenClosed"),
        keybind: "mod+shift+t",
        onSelect: () => tabsStoreActions.reopenClosedTab(),
      },
    ].filter((v) => v !== undefined)
  })

  const [tabsAreOverflowing, setTabsAreOverflowing] = createSignal(false)

  // Construct once under the persistent shell owner. Moving this DOM through
  // the portal must not recreate tab commands, history sync or prompt memory.
  const tabControls = (
    <div data-slot="orchestra-tab-controls" class="flex min-w-0 items-center gap-1.5">
      <TitlebarTabStrip
        tabs={tabsStore}
        profile={profile()}
        workspace={!!tabsMount()}
        currentTab={currentTab}
        forceTruncate={tabsAreOverflowing()}
        onOverflowChange={setTabsAreOverflowing}
        onVisibleTabsChange={(tabs) => setVisible("tabs", tabs)}
        onNavigate={(tab, el) => {
          tabs.select(tab)
          el?.scrollIntoView({ behavior: "instant", block: "nearest", inline: "nearest" })
        }}
        onClose={closeTab}
        onReorder={(keys) => tabsStoreActions.reorder(keys)}
      />
      <TooltipV2
        placement="bottom"
        value={
          <>
            {language.t("command.session.new")}
            <KeybindV2 keys={newTabTooltipKeybind(command)} variant="neutral" />
          </>
        }
      >
        <IconButtonV2
          type="button"
          variant="ghost-muted"
          size="large"
          class="shrink-0"
          icon={<IconV2 name="plus" />}
          onClick={openNewTab}
          aria-label={language.t("command.session.new")}
        />
      </TooltipV2>
    </div>
  )

  return (
    <header
      ref={header}
      data-slot="titlebar-v2"
      classList={{
        "shrink-0 relative flex flex-row bg-v2-background-bg-deep overflow-visible": true,
        "h-9": mobile(),
        "h-[45px]": !mobile(),
        "order-last": bottom(),
      }}
      style={{
        "min-height": minHeight(),
        // Keep native macOS traffic lights clear even when the desktop window is narrow.
        "padding-left": macTrafficLights() ? `${macTrafficLightsBaseWidth / zoom()}px` : 0,
        width: windows()
          ? `calc(env(titlebar-area-width, calc(100vw - ${windowsControlsWidth()})) - ${props.tabsMount && !mobile() ? 13 : 0}px)`
          : undefined,
        "max-width": windows()
          ? `calc(env(titlebar-area-width, calc(100vw - ${windowsControlsWidth()})) - ${props.tabsMount && !mobile() ? 13 : 0}px)`
          : undefined,
        // Native Windows caption controls remain on the physical right in both writing directions.
        "margin-right": windows() ? "auto" : undefined,
      }}
      data-tauri-drag-region
    >
      <div
        class="h-full flex-1 overflow-hidden flex flex-row items-center gap-1.5 px-2 md:pr-3"
        classList={{
          "pt-2": mobile() && !bottom(),
          "pb-2": mobile() && bottom(),
          "md:pl-2": macTrafficLights(),
          "md:pl-4": !macTrafficLights(),
        }}
      >
        <ChannelIndicator debugTools={props.debugTools} />
        {props.navigation}
        <Show when={windows() || linux()}>
          <WindowsAppMenu command={command} platform={platform} variant="v2" />
        </Show>
        <Show when={mobile()}>
          <TooltipV2
            placement="bottom"
            value={
              <>
                {language.t("home.title")}
                <KeybindV2 keys={command.keybindParts("home.toggle")} variant="neutral" />
              </>
            }
            class="shrink-0"
          >
            <IconButtonV2
              type="button"
              variant="ghost-muted"
              size="large"
              class="!w-9 shrink-0"
              icon={<IconV2 name="grid-plus" />}
              state={layout.route().type === "home" ? "pressed" : undefined}
              onClick={toggleHome}
              aria-label={language.t("home.title")}
              aria-pressed={layout.route().type === "home"}
            />
          </TooltipV2>
        </Show>
        <Show when={!mobile()}>
          <div
            data-slot="orchestra-titlebar-breadcrumb"
            class="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-xs"
          >
            <span>{language.t("orchestra.brand.name")}</span>
            <span aria-hidden="true">/</span>
            <CrumbTrail label={language.t(breadcrumbLabel(layout.route()))} />
          </div>
        </Show>
        <Show when={tabsMount()} keyed fallback={tabControls}>
          {(mount) => <Portal mount={mount}>{tabControls}</Portal>}
        </Show>
        <div class="flex-1" />
        <Show when={!mobile() && platform.caffeinate}>
          {(awake) => (
            <button
              type="button"
              role="switch"
              data-slot="orchestra-caffeinate-toggle"
              aria-checked={awake()()}
              aria-label={language.t("orchestra.shell.caffeinate.on")}
              title={language.t(awake()() ? "orchestra.shell.caffeinate.off" : "orchestra.shell.caffeinate.on")}
              onClick={() => void platform.setCaffeinate?.(!awake()())}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M2.5 7.5h8.5v2.8a3.2 3.2 0 0 1-3.2 3.2H5.7a3.2 3.2 0 0 1-3.2-3.2zM11 8.5h.9a1.7 1.7 0 0 1 0 3.4H11" />
                <path data-steam d="M5.2 1.8c-.7.8.7 1.5 0 2.4M8.3 1.8c-.7.8.7 1.5 0 2.4" />
              </svg>
            </button>
          )}
        </Show>
        <Show when={!mobile()}>
          <button
            type="button"
            data-slot="orchestra-theme-toggle"
            aria-label={language.t(theme.mode() === "dark" ? "theme.scheme.light" : "theme.scheme.dark")}
            title={language.t(theme.mode() === "dark" ? "theme.scheme.light" : "theme.scheme.dark")}
            onClick={() => theme.setColorScheme(theme.mode() === "dark" ? "light" : "dark")}
          >
            {/* Icon, label and click all name the scheme it switches to, also while the scheme follows the system. The moon is Lucide's (ISC) on this 16-unit grid. */}
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <Show
                when={theme.mode() === "dark"}
                fallback={<path d="M8 2a4 4 0 0 0 6 6 6 6 0 1 1-6-6z" />}
              >
                <path d="M8 10.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6zM8 1.5v1.4M8 13.1v1.4M1.5 8h1.4M13.1 8h1.4M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
              </Show>
            </svg>
          </button>
        </Show>
        <TitlebarV2Right state={v2RightState()} />
      </div>
    </header>
  )
}

type TitlebarUpdatePillState = {
  visible: boolean
  installing: boolean
  label: string
  ariaLabel: string
  title?: string
  onInstall: () => void
}

type TitlebarV2RightState = {
  update: TitlebarUpdatePillState
}

function TitlebarV2Right(props: { state: TitlebarV2RightState }) {
  return (
    <div class="relative z-20 flex shrink-0 items-center justify-end gap-0 overflow-visible">
      <Show when={props.state.update.visible}>
        <TitlebarUpdateIconButton state={props.state.update} />
      </Show>
      <div id="orchestra-titlebar-right" class="flex shrink-0 items-center justify-end gap-0" />
    </div>
  )
}

function TitlebarUpdateIconButton(props: { state: TitlebarUpdatePillState }) {
  return (
    <div class="group relative mr-3 h-5 w-5 shrink-0 rounded-full bg-v2-background-bg-deep transition-[width] duration-150 ease-out hover:z-30 hover:w-[68px] focus-within:z-30 focus-within:w-[68px] motion-reduce:transition-none">
      <button
        type="button"
        class="absolute right-0 top-0 z-10 flex h-5 w-5 items-center justify-end overflow-hidden rounded-full bg-v2-icon-icon-accent/20 text-v2-icon-icon-accent transition-[width,background-color] duration-150 ease-out group-hover:w-[68px] group-hover:bg-[color-mix(in_srgb,var(--v2-icon-icon-accent)_20%,var(--v2-background-bg-deep))] group-focus-within:w-[68px] group-focus-within:bg-[color-mix(in_srgb,var(--v2-icon-icon-accent)_20%,var(--v2-background-bg-deep))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--orchestra-accent)] disabled:opacity-60 motion-reduce:transition-none"
        onClick={props.state.onInstall}
        disabled={props.state.installing}
        aria-busy={props.state.installing}
        aria-label={props.state.ariaLabel}
      >
        <span class="shrink-0 ml-[8px] mr-px text-[length:var(--orchestra-font-size-xs)] text-v2-text-text-accent [font-weight:530] opacity-0 translate-x-2 motion-safe:transition-all duration-150 ease-out group-hover:opacity-100 group-hover:translate-x-0 group-focus-within:opacity-100 group-focus-within:translate-x-0 motion-reduce:translate-x-0">
          {props.state.label}
        </span>
        <span class="flex size-5 shrink-0 items-center justify-center">
          <Show
            when={!props.state.installing}
            fallback={<span data-slot="titlebar-update-loader" aria-hidden="true" />}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 11V3M3.5 7.63128L7 11L10.5 7.63128" stroke="currentColor" />
            </svg>
          </Show>
        </span>
      </button>
    </div>
  )
}

function ChannelIndicator(props: { debugTools?: { visible: boolean; toggle: () => void } }) {
  const channel = import.meta.env.VITE_ORCHESTRA_CHANNEL
  if (channel === "dev" && props.debugTools) {
    return (
      <button
        type="button"
        class="bg-icon-interactive-base text-[#FFF] font-medium px-2 rounded-sm uppercase font-mono cursor-pointer"
        onClick={props.debugTools.toggle}
        aria-label="Toggle debug tools"
        aria-pressed={props.debugTools.visible}
      >
        DEV
      </button>
    )
  }

  return (
    <>
      {["beta", "dev"].includes(channel) && (
        <div class="bg-icon-interactive-base text-[#FFF] font-medium px-2 rounded-sm uppercase font-mono">
          {channel.toUpperCase()}
        </div>
      )}
    </>
  )
}
