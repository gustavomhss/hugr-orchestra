import { DropdownMenu } from "@kobalte/core/dropdown-menu"
import { useDialog } from "@orchestra/ui/context/dialog"
import { Dialog, DialogBody, DialogHeader, DialogTitle, DialogTitleGroup } from "@orchestra/ui/v2/dialog-v2"
import { Icon } from "@orchestra/ui/v2/icon"
import { ProjectAvatar } from "@orchestra/ui/v2/project-avatar-v2"
import { useNavigate } from "@solidjs/router"
import { skipToken, useQuery } from "@tanstack/solid-query"
import {
  createEffect,
  createMemo,
  createRoot,
  For,
  getOwner,
  onCleanup,
  Show,
  startTransition,
  type JSX,
} from "solid-js"
import { createStore } from "solid-js/store"
import { useDirectoryPicker } from "@/components/directory-picker"
import { useCommand } from "@/context/command"
import { useGlobal } from "@/context/global"
import { directoryKey } from "@/context/global-sync/utils"
import { getProjectAvatarVariant, type LocalProject, useLayout } from "@/context/layout"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { ServerConnection, serverName, useServer } from "@/context/server"
import { tabKey, type SessionTab, type Tab, useTabs } from "@/context/tabs"
import { HugrBrand } from "@/orchestra/brand"
import { chapterPages } from "@/orchestra/chapter-route"
import { isWip, navigation } from "@/orchestra/navigation"
import { OrchestraNavigationToggle } from "@/orchestra/navigation-toggle"
import { OrchestraNavigationTooltip } from "@/orchestra/navigation-tooltip"
import { useAwaitingRuns } from "@/orchestra/relay/source"
import { createHomeController } from "@/pages/home/home-controller"
import {
  displayName,
  errorMessage,
  getProjectAvatarSource,
  homeProjectDirectories,
  projectForSession,
} from "@/pages/layout/helpers"
import { createMenuDismissController } from "@/utils/menu-dismiss-controller"
import { pathKey } from "@/utils/path-key"
import { isLocalSessionNotFoundError, isSessionNotFoundError } from "@/utils/server-errors"
import { showToast } from "@/utils/toast"

// Navigation marks copied from the approved Orchestra reference.
const icons = {
  home: '<path d="M2.8 6.6 8 2.6l5.2 4v6a1 1 0 0 1-1 1h-2.7v-3.8H6.5v3.8H3.8a1 1 0 0 1-1-1z"/>',
  chat: '<path d="M2.6 3.6h10.8v6.9H6.9l-3.1 2.3v-2.3H2.6z"/>',
  agents:
    '<circle cx="5.4" cy="4.6" r="2.1"/><circle cx="11.4" cy="5" r="1.7"/><path d="M1.6 13.2c.3-2.2 1.9-3.4 3.8-3.4s3.5 1.2 3.8 3.4M9.9 9.9c2.2-.3 3.9 1 4.3 3.3"/>',
  // Official design icon (design/icons/maestro.svg) drawn on a 20-unit grid.
  // Relay workflows: three linked steps (the approved Relay mock's mark).
  workflows:
    '<rect x="1.8" y="2.6" width="4" height="4" rx="1"/><rect x="10.2" y="2.6" width="4" height="4" rx="1"/><rect x="6" y="9.6" width="4" height="4" rx="1"/><path d="M5.8 4.6h4.4M12.2 6.6v1.6a1.2 1.2 0 0 1-1.2 1.2H10"/>',
  maestro:
    '<g transform="scale(.8)" stroke-width="1.75"><path d="M13.332 8.7487C11.4911 8.7487 9.9987 7.25631 9.9987 5.41536M6.66536 11.2487C8.50631 11.2487 9.9987 12.7411 9.9987 14.582M9.9987 2.78209L9.9987 17.0658M16.004 15.0475C17.1255 14.5876 17.9154 13.4849 17.9154 12.1978C17.9154 11.3363 17.5615 10.5575 16.9913 9.9987C17.5615 9.43991 17.9154 8.66108 17.9154 7.79962C17.9154 6.21199 16.7136 4.90504 15.1702 4.73878C14.7858 3.21216 13.4039 2.08203 11.758 2.08203C11.1171 2.08203 10.5162 2.25337 9.9987 2.55275C9.48117 2.25337 8.88032 2.08203 8.23944 2.08203C6.59353 2.08203 5.21157 3.21216 4.82722 4.73878C3.28377 4.90504 2.08203 6.21199 2.08203 7.79962C2.08203 8.66108 2.43585 9.43991 3.00609 9.9987C2.43585 10.5575 2.08203 11.3363 2.08203 12.1978C2.08203 13.4849 2.87191 14.5876 3.99339 15.0475C4.46688 16.7033 5.9917 17.9154 7.79962 17.9154C8.61335 17.9154 9.36972 17.6698 9.9987 17.2488C10.6277 17.6698 11.384 17.9154 12.1978 17.9154C14.0057 17.9154 15.5305 16.7033 16.004 15.0475Z"/></g>',
  mcp: '<path d="M5 2v3M11 2v3M3 5h10v3a5 5 0 0 1-10 0V5ZM8 13v2"/>',
  skills: '<path d="m8 1 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z"/>',
  plugins: '<path d="M2 3h4a2 2 0 1 1 4 0h4v4a2 2 0 1 0 0 4v3h-4a2 2 0 1 0-4 0H2V3Z"/>',
  hooks: '<path d="M4 2v7a4 4 0 0 0 8 0V7M9 9l3-3 3 3"/><circle cx="4" cy="2" r="1"/>',
  cicd: '<circle cx="3" cy="8" r="2"/><circle cx="13" cy="4" r="2"/><circle cx="13" cy="12" r="2"/><path d="M5 8h3V4h3M8 8v4h3"/>',
  schedule: '<circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 2"/>',
  env: '<rect x="2" y="3" width="12" height="10" rx="2"/><path d="m5 6 2 2-2 2M9 10h2"/>',
  dock: '<path d="M2.6 3.4h10.8v7.4H2.6zM2.6 5.8h10.8M5 12.6h6"/>',
  search: '<circle cx="7.1" cy="7.1" r="4.2"/><path d="m10.3 10.3 2.6 2.6"/>',
  workspaces: '<path d="M2.6 4.2h4.2l1.3 1.6h5.3v6.4H2.6z"/>',
  providers: '<path d="M3 6a5 5 0 0 1 10 0M2 6h12v6H2V6ZM6 9h4"/>',
  shortcuts: '<rect x="1" y="3" width="14" height="10" rx="2"/><path d="M4 6h.1M7 6h.1M10 6h.1M12 6h.1M4 9h.1M7 9h5"/>',
  settings:
    '<circle cx="8" cy="8" r="2.3"/><path d="M8 1.9v1.6M8 12.5v1.6M14.1 8h-1.6M3.5 8H1.9M12.3 3.7l-1.1 1.1M4.8 11.2l-1.1 1.1M12.3 12.3l-1.1-1.1M4.8 4.8 3.7 3.7"/>',
  help: '<circle cx="8" cy="8" r="6.2"/><path d="M6.3 6.2a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.6-.7 1.1M8 11.6v.1"/>',
}

export function OrchestraSidebar(props: { compact: boolean; constrained: boolean; onToggle: () => void }) {
  const layout = useLayout()
  const global = useGlobal()
  const server = useServer()
  const tabs = useTabs()
  const language = useLanguage()
  const platform = usePlatform()
  const command = useCommand()
  const navigate = useNavigate()
  const dialog = useDialog()
  const pickDirectory = useDirectoryPicker()
  const home = createHomeController()
  const [state, setState] = createStore({
    profileOpen: false,
    settings: undefined as (() => JSX.Element) | undefined,
  })
  let menuRef: HTMLDivElement | undefined
  const dismiss = createMenuDismissController(() => menuRef)
  const requests = { settings: 0, profile: 0, disposed: false }
  onCleanup(() => {
    requests.disposed = true
  })
  const groups = createMemo(() =>
    global.servers.list().map((conn) => ({
      conn,
      key: ServerConnection.key(conn),
      projects: global.ensureServerCtx(conn).projects.list,
    })),
  )
  const profile = createMemo(() => {
    const route = layout.route()
    const target = (() => {
      if (route.type === "home" || route.type === "chapter") return layout.home.selection()
      if (route.type === "dir-new-sesssion") return { server: route.server ?? server.key, directory: route.dir }
      if (route.type === "draft") {
        const draft = tabs.store.find((tab) => tab.type === "draft" && tab.draftID === route.draftID)
        if (draft?.type === "draft") return { server: draft.server, directory: draft.directory }
        return layout.home.selection()
      }
      const key = route.server ?? server.key
      const conn = global.servers.list().find((item) => ServerConnection.key(item) === key)
      const session = conn ? global.ensureServerCtx(conn).sync.session.peek(route.sessionId) : undefined
      return {
        server: key,
        directory:
          session?.directory ??
          tabs.info[tabKey({ type: "session", server: key, sessionId: route.sessionId })]?.directory,
      }
    })()
    const group = groups().find((item) => item.key === target.server)
    const directory = target.directory ? pathKey(target.directory) : undefined
    const session =
      route.type === "session" && group
        ? global.ensureServerCtx(group.conn).sync.session.peek(route.sessionId)
        : undefined
    return {
      ...target,
      conn: group?.conn,
      project:
        (session ? projectForSession(session, group?.projects() ?? []) : undefined) ??
        group
          ?.projects()
          .find(
            (project) =>
              !!directory &&
              (pathKey(project.worktree) === directory ||
                project.sandboxes?.some((sandbox) => pathKey(sandbox) === directory)),
          ) ??
        (group && target.directory ? copyOwner(group.conn, group.projects(), target.directory) : undefined),
    }
  })

  // A V2 project copy (a workspace) never appears in `sandboxes`, but its directory's bootstrap already asked the
  // server which project owns it. Reading that answer passively keeps a draft in a copy on its repository profile,
  // so chapters opened from it get the repository root.
  function copyOwner(conn: ServerConnection.Any, projects: LocalProject[], directory: string) {
    const id = global.ensureServerCtx(conn).sync.peek(directory, { bootstrap: false })[0].project
    if (!id || id === "global") return
    return projects.find((project) => project.id === id)
  }

  // The profile card only reads: passive reads must not initialize (bootstrap) the selected directory.
  // The agent list shares the bootstrap's query cache.
  const agents = useQuery(() => {
    const target = profile()
    if (!target.conn || !target.project || !target.directory)
      return { queryKey: ["orchestra-profile-agents"], queryFn: skipToken }
    return global.ensureServerCtx(target.conn).sync.queryOptions.agents(directoryKey(target.directory))
  })
  // Legacy servers answer GET /vcs; a server that does not (V2) leaves the branch off the card.
  const branch = useQuery(() => {
    const target = profile()
    const conn = target.conn
    const directory = target.directory
    return {
      queryKey: ["orchestra-profile-branch", target.server, directory],
      queryFn:
        conn && target.project && directory
          ? () =>
              global
                .ensureServerCtx(conn)
                .sdk.createClient({ directory, throwOnError: true })
                .vcs.get()
                .then((result) => result.data?.branch ?? null)
          : skipToken,
      retry: false,
    }
  })
  // Runs waiting for a human in this profile; the server reports none when it has no Relay routes.
  const awaiting = useAwaitingRuns(() => {
    const target = profile()
    const directory = target.project?.worktree ?? target.directory
    return target.conn && directory ? { server: target.conn, directory } : undefined
  })
  const meta = () => {
    const count = agents.data?.filter((agent) => !agent.hidden).length
    return [
      count === undefined
        ? undefined
        : language.t(count === 1 ? "orchestra.shell.profile.agents.one" : "orchestra.shell.profile.agents.other", {
            count,
          }),
      branch.data,
    ]
      .filter(Boolean)
      .join(" · ")
  }

  // Chapter pages register no palette of their own; Home and sessions register theirs over this one.
  command.register("orchestra.palette", () =>
    layout.route().type === "chapter"
      ? [{ id: "command.palette", title: language.t("command.palette"), hidden: true, onSelect: openPalette }]
      : [],
  )

  async function openPalette() {
    const conn = profile().conn ?? home.server.focused()
    if (!conn) return
    const ctx = global.ensureServerCtx(conn)
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
          void startTransition(() => tabs.select(tabs.addSessionTab({ server, sessionId: sessionID })))
        }}
      />
    ))
  }

  async function projectTab(conn: ServerConnection.Any, project: LocalProject) {
    const key = ServerConnection.key(conn)
    const ctx = global.ensureServerCtx(conn)
    const directories = new Set([project.worktree, ...(project.sandboxes ?? [])].map(pathKey))
    const matches = (tab: Tab) => {
      if (tab.server !== key) return false
      if (tab.type === "draft") return directories.has(pathKey(tab.directory))
      const session = ctx.sync.session.peek(tab.sessionId)
      if (session) return !!projectForSession(session, [project])
      const directory = tabs.info[tabKey(tab)]?.directory
      return !!directory && directories.has(pathKey(directory))
    }
    const current = tabs.store.find(matches)
    if (current) return current
    // Restored tabs may not have directory metadata yet. Join the sync store's
    // existing info request before deciding that this repository needs a draft.
    await Promise.all(
      tabs.store
        .filter(
          (tab): tab is SessionTab =>
            tab.type === "session" &&
            tab.server === key &&
            !ctx.sync.session.peek(tab.sessionId) &&
            !tabs.info[tabKey(tab)]?.directory,
        )
        .map((tab) =>
          ctx.sync.session.resolve(tab.sessionId).catch((cause: unknown) => {
            if (isLocalSessionNotFoundError(cause, tab.sessionId) || isSessionNotFoundError(cause, tab.sessionId))
              return
            throw cause
          }),
        ),
    )
    return tabs.store.find(matches)
  }

  async function selectProject(conn: ServerConnection.Any, project: LocalProject, draft = false) {
    if (global.servers.health[ServerConnection.key(conn)]?.healthy === false) return
    const current = ++requests.profile
    const route = layout.route()
    const ctx = global.ensureServerCtx(conn)
    layout.home.setSelection({ server: ServerConnection.key(conn), directory: project.worktree })
    ctx.projects.open(project.worktree)
    ctx.projects.touch(project.worktree)
    setState("profileOpen", false)
    const result = await projectTab(conn, project).then(
      (tab) => ({ tab }),
      (cause: unknown) => ({ cause }),
    )
    if (requests.disposed || requests.profile !== current || layout.route() !== route) return
    if ("cause" in result) {
      showToast({
        title: language.t("common.requestFailed"),
        description: errorMessage(result.cause, language.t("common.requestFailed")),
      })
      return
    }
    if (result.tab) {
      tabs.select(result.tab)
      return
    }
    if ((route.type === "home" || route.type === "chapter") && !draft) return
    home.project.openProjectNewSession(conn, project.worktree)
  }

  function chooseProject(conn: ServerConnection.Any, draft = false) {
    if (global.servers.health[ServerConnection.key(conn)]?.healthy === false) return
    const current = ++requests.profile
    const route = layout.route()
    const target = profile()
    setState("profileOpen", false)
    pickDirectory({
      server: conn,
      title: language.t("command.project.open"),
      multiple: true,
      onSelect: (result) => {
        if (requests.disposed || requests.profile !== current || layout.route() !== route) return
        if (profile().server !== target.server || profile().directory !== target.directory) return
        const directories = homeProjectDirectories(result)
        if (!directories[0]) return
        home.project.add(conn, directories)
        const project = global
          .ensureServerCtx(conn)
          .projects.list()
          .find((item) => item.worktree === directories[0])
        if (requests.disposed || requests.profile !== current || layout.route() !== route) return
        if (project) selectProject(conn, project, draft)
      },
    })
  }

  function openChapter(id: string, view = "") {
    // Chapter pages read the Home selection; carry the profile the user is looking at.
    const target = profile()
    const directory = target.project?.worktree ?? target.directory
    if (directory) layout.home.setSelection({ server: target.server, directory })
    navigate(`/orchestra/${id}${view}`)
  }

  // Workflows and Hooks in the command palette, from every page.
  command.register("orchestra.relay", () => {
    const category = language.t("orchestra.palette.relay")
    return [
      {
        id: "relay.workflows.open",
        title: language.t("orchestra.nav.workflows"),
        description: language.t("orchestra.palette.goTo"),
        category,
        onSelect: () => openChapter("workflows"),
      },
      {
        id: "relay.hooks.open",
        title: language.t("orchestra.nav.hooks"),
        description: language.t("orchestra.palette.goTo"),
        category,
        onSelect: () => openChapter("hooks"),
      },
      {
        id: "relay.executions.open",
        title: language.t("orchestra.palette.executions"),
        description: language.t("orchestra.palette.goTo"),
        category,
        onSelect: () => openChapter("workflows", "/executions"),
      },
      {
        id: "relay.workflow.new",
        title: language.t("orchestra.workflows.new"),
        category,
        onSelect: () => openChapter("workflows", "/new"),
      },
      {
        id: "relay.hook.new",
        title: language.t("orchestra.hooks.new"),
        category,
        onSelect: () => openChapter("hooks", "/new"),
      },
    ]
  })

  function current(id: string) {
    const route = layout.route()
    if (route.type === "chapter") return route.chapter === id
    if (id === "home") return route.type === "home"
    if (id === "chat") return route.type === "session" || route.type === "draft"
    return false
  }

  function openChat() {
    const route = layout.route()
    if (route.type === "session" || route.type === "draft") return
    const conn = profile().conn ?? home.server.focused()
    if (!conn) {
      command.trigger("settings.open")
      return
    }
    const ctx = global.ensureServerCtx(conn)
    const project =
      profile().project ??
      ctx.projects.list().find((item) => item.worktree === ctx.projects.last()) ??
      ctx.projects.list()[0]
    if (project) {
      selectProject(conn, project, true)
      return
    }
    chooseProject(conn, true)
  }

  async function openSettingsPanel(panel: "providers" | "shortcuts") {
    const current = ++requests.settings
    const target = profile()
    const route = layout.route()
    const conn = target.conn ?? server.current
    if (!conn) return
    const [{ DialogSettings }, { ServerSDKProvider }, { ServerSyncProvider }, { ModelsProvider }] = await Promise.all([
      import("@/components/settings-v2"),
      import("@/context/server-sdk"),
      import("@/context/server-sync"),
      import("@/context/models"),
    ])
    if (requests.disposed || requests.settings !== current || layout.route() !== route) return
    if (profile().server !== target.server || profile().directory !== target.directory) return
    // Dialog replacements inherit the opening owner, not the replaced content's providers.
    const launch = () => (
      <ServerSDKProvider server={() => conn}>
        <ServerSyncProvider server={() => conn}>
          <ModelsProvider directory={() => target.directory}>
            <SettingsLauncher
              valid={
                layout.route() === route &&
                profile().server === target.server &&
                profile().directory === target.directory
              }
              content={() => (
                <DialogSettings
                  sessionID={route.type === "session" ? route.sessionId : undefined}
                  defaultValue={panel}
                />
              )}
              onClose={() => {
                if (state.settings === launch) setState("settings", undefined)
              }}
            />
          </ModelsProvider>
        </ServerSyncProvider>
      </ServerSDKProvider>
    )
    setState("settings", () => launch)
  }

  function openPending(title: string, chapter: string) {
    void dialog.show(() => (
      <Dialog class="orchestra-pending-dialog">
        <DialogHeader>
          <DialogTitle>{language.t("orchestra.rework.title", { title })}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p class="orchestra-chapter-label">
            <bdi>{chapter}</bdi> · {language.t("orchestra.rework.pending")}
          </p>
          <DialogTitleGroup description={language.t("orchestra.rework.body", { title, chapter })} />
        </DialogBody>
      </Dialog>
    ))
  }

  function openMaestro() {
    // Governance belongs to the open session; the session page registers its command.
    if (
      layout.route().type === "session" &&
      command.options.some((option) => option.id === "maestro.governance" && !option.disabled)
    )
      return command.trigger("maestro.governance")
    void dialog.show(() => (
      <Dialog class="orchestra-pending-dialog">
        <DialogHeader>
          <DialogTitle>{language.t("orchestra.governance.title")}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogTitleGroup description={language.t("orchestra.governance.noSession")} />
        </DialogBody>
      </Dialog>
    ))
  }

  function afterProfileClose(action: () => void) {
    dismiss.preventTriggerRestore()
    setState("profileOpen", false)
    dismiss.afterClose(() => {
      if (requests.disposed) return
      action()
    })
  }

  return (
    <aside data-component="orchestra-sidebar" class="orchestra-sidebar" aria-label={language.t("home.projects")}>
      <HugrBrand compact={props.compact} />
      <OrchestraNavigationToggle
        compact={props.compact}
        constrained={props.constrained}
        iconOnly
        onToggle={props.onToggle}
      />
      <Show when={state.settings} keyed>
        {(launch) => launch()}
      </Show>
      <div class="orchestra-navigation">
        <nav id="orchestra-navigation" class="orchestra-nav">
          <For each={navigation}>
            {(item) => (
              <>
                <Show when={item.id === "search"}>
                  <div class="orchestra-nav-rule" />
                </Show>
                {/* Expanded, a WIP row's tooltip carries the mark's meaning; the compact rail keeps names. */}
                <OrchestraNavigationTooltip
                  enabled={props.compact || isWip(item.id)}
                  value={
                    !props.compact && isWip(item.id)
                      ? language.t("orchestra.shell.wip.description")
                      : item.chapter && !chapterPages[item.id]
                        ? `${language.t(item.label)} · ${language.t("orchestra.rework.pending")}`
                        : language.t(item.label)
                  }
                >
                  {(Trigger) => (
                    <Trigger
                      type="button"
                      class="orchestra-nav-button"
                      aria-label={language.t(item.label)}
                      aria-description={
                        isWip(item.id)
                          ? language.t("orchestra.shell.wip.description")
                          : item.chapter && !chapterPages[item.id]
                            ? language.t("orchestra.rework.pending")
                            : undefined
                      }
                      disabled={
                        (item.id === "search" && !command.options.some((option) => option.id === "command.palette")) ||
                        (item.id === "chat" &&
                          (!layout.ready() ||
                            !tabs.ready() ||
                            global.servers.health[profile().server]?.healthy === false))
                      }
                      aria-current={current(item.id) ? "page" : undefined}
                      onClick={() => {
                        if (item.id === "home") return navigate("/")
                        if (item.id === "chat") return openChat()
                        if (item.id === "maestro") return openMaestro()
                        if (item.id === "search") return command.show()
                        if (item.id === "help") return platform.openExternal("https://opencode.ai/desktop-feedback")
                        if (chapterPages[item.id]) return openChapter(item.id)
                        if (item.id === "providers" || item.id === "shortcuts") return void openSettingsPanel(item.id)
                        if (item.chapter) openPending(language.t(item.label), item.chapter)
                      }}
                    >
                      <svg
                        class="orchestra-nav-icon"
                        viewBox="0 0 16 16"
                        aria-hidden="true"
                        innerHTML={icons[item.id]}
                      />
                      <span class="orchestra-nav-label">{language.t(item.label)}</span>
                      <Show when={item.id === "search"}>
                        <kbd>{command.keybind("command.palette")}</kbd>
                      </Show>
                      <Show when={item.id === "workflows" && awaiting() > 0}>
                        <span
                          class="orchestra-attention-chip"
                          data-slot="orchestra-nav-attention"
                          title={language.t("orchestra.nav.workflows.awaiting", { count: awaiting() })}
                        >
                          <span aria-hidden="true">{awaiting()}</span>
                          <span class="orchestra-sr-only">
                            {language.t("orchestra.nav.workflows.awaiting", { count: awaiting() })}
                          </span>
                        </span>
                      </Show>
                      {/* The WIP mark replaces the pending dot; an unbuilt WIP chapter keeps its pending dialog. */}
                      <Show when={isWip(item.id)}>
                        <span class="orchestra-wip-chip" data-slot="orchestra-nav-wip">
                          <span aria-hidden="true">{language.t("orchestra.shell.wip.chip")}</span>
                        </span>
                      </Show>
                      <Show when={!isWip(item.id) && item.chapter && !chapterPages[item.id]}>
                        <span class="orchestra-pending-dot" aria-hidden="true" />
                        <span class="orchestra-sr-only">{language.t("orchestra.rework.pending")}</span>
                      </Show>
                    </Trigger>
                  )}
                </OrchestraNavigationTooltip>
              </>
            )}
          </For>
        </nav>
      </div>
      <div class="orchestra-sidebar-foot">
        <DropdownMenu
          placement="top-start"
          gutter={8}
          modal={false}
          open={state.profileOpen}
          onOpenChange={(open) => {
            if (open) dismiss.allowTriggerRestore()
            setState("profileOpen", open)
          }}
        >
          <OrchestraNavigationTooltip enabled={props.compact} value={language.t("orchestra.profile.choose")}>
            {(Trigger) => (
              <Trigger
                as={DropdownMenu.Trigger}
                class="orchestra-profile"
                data-slot="orchestra-profile"
                aria-label={language.t("orchestra.profile.choose")}
                aria-describedby="orchestra-profile-name"
              >
                <ProjectAvatar
                  class="orchestra-profile-avatar"
                  data-unset={
                    !getProjectAvatarSource(profile().project?.id, profile().project?.icon) &&
                    !profile().project?.icon?.color
                      ? ""
                      : undefined
                  }
                  fallback={profile().project ? displayName(profile().project!) : ""}
                  src={getProjectAvatarSource(profile().project?.id, profile().project?.icon)}
                  variant={getProjectAvatarVariant(profile().project?.icon?.color)}
                  aria-hidden="true"
                />
                <span class="orchestra-profile-text">
                  <strong id="orchestra-profile-name">
                    <bdi>
                      {profile().project ? displayName(profile().project!) : language.t("orchestra.profile.empty")}
                    </bdi>
                  </strong>
                  <small dir={profile().project ? "ltr" : "auto"} title={profile().project?.worktree}>
                    {profile().project ? meta() : serverName(profile().conn)}
                  </small>
                </span>
                <span class="orchestra-profile-chevron" aria-hidden="true">
                  ⌄
                </span>
              </Trigger>
            )}
          </OrchestraNavigationTooltip>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              ref={menuRef}
              class="orchestra-profile-menu"
              data-component="orchestra-profile-picker"
              onCloseAutoFocus={dismiss.onCloseAutoFocus}
              onPointerDownOutside={dismiss.preventTriggerRestore}
              onFocusOutside={dismiss.preventTriggerRestore}
            >
              <DropdownMenu.RadioGroup
                value={profile().project ? `${profile().server}\n${profile().project!.worktree}` : ""}
              >
                <For each={groups()}>
                  {(group) => (
                    <DropdownMenu.Group>
                      <DropdownMenu.GroupLabel class="orchestra-profile-group">
                        <bdi>{serverName(group.conn)}</bdi>
                      </DropdownMenu.GroupLabel>
                      {/* Enrichment replaces project objects on refresh; keep keyboard targets keyed by worktree. */}
                      <For each={group.projects().map((project) => project.worktree)}>
                        {(worktree) => {
                          const project = createMemo(
                            () => group.projects().find((project) => project.worktree === worktree)!,
                          )
                          return (
                            <DropdownMenu.RadioItem
                              class="orchestra-profile-item"
                              value={`${group.key}\n${worktree}`}
                              disabled={
                                !layout.ready() || !tabs.ready() || global.servers.health[group.key]?.healthy === false
                              }
                              onSelect={() => afterProfileClose(() => selectProject(group.conn, project()))}
                            >
                              <DropdownMenu.ItemLabel class="orchestra-profile-item-name">
                                <bdi>{displayName(project())}</bdi>
                              </DropdownMenu.ItemLabel>
                              <DropdownMenu.ItemIndicator>
                                <Icon name="check" />
                              </DropdownMenu.ItemIndicator>
                            </DropdownMenu.RadioItem>
                          )
                        }}
                      </For>
                      <DropdownMenu.Item
                        class="orchestra-profile-item orchestra-profile-add"
                        disabled={
                          !layout.ready() || !tabs.ready() || global.servers.health[group.key]?.healthy === false
                        }
                        onSelect={() => afterProfileClose(() => chooseProject(group.conn))}
                      >
                        <Icon name="plus" />
                        <DropdownMenu.ItemLabel>{language.t("home.project.add")}</DropdownMenu.ItemLabel>
                      </DropdownMenu.Item>
                    </DropdownMenu.Group>
                  )}
                </For>
              </DropdownMenu.RadioGroup>
              <Show when={!groups().some((group) => group.projects().length > 0)}>
                <p class="orchestra-profile-empty">{language.t("orchestra.profile.empty")}</p>
              </Show>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu>
        <p class="orchestra-sidebar-footer">{language.t("orchestra.sidebar.footer")}</p>
      </div>
    </aside>
  )
}

function SettingsLauncher(props: { valid: boolean; content: () => JSX.Element; onClose: () => void }) {
  const dialog = useDialog()
  const owner = getOwner()
  const lifetime = { opened: false, disposed: false }
  const close = () => {
    if (dialog.active?.owner === owner) dialog.close()
  }

  createEffect(() => {
    if (!props.valid) return props.onClose()
    const active = dialog.active
    if (lifetime.opened) {
      if (active?.owner !== owner) props.onClose()
      return
    }
    // show() adopts an active owner; defer stack closure until the previous close releases its lock.
    if (active) {
      queueMicrotask(() => {
        if (!lifetime.disposed && dialog.active === active) dialog.close()
      })
      return
    }
    lifetime.opened = true
    void dialog
      .show(
        () => (lifetime.disposed ? undefined : props.content()),
        () => {
          if (!lifetime.disposed) props.onClose()
        },
      )
      .then(() => {
        if (lifetime.disposed) close()
      })
  })
  onCleanup(() => {
    lifetime.disposed = true
    // Nested settings dialogs share this owner; drain its stack after the launcher is gone.
    createRoot((dispose) => {
      createEffect(() => {
        const active = dialog.active
        if (active?.owner !== owner) return dispose()
        queueMicrotask(() => {
          if (dialog.active === active) dialog.close()
        })
      })
    })
  })
  return null
}
