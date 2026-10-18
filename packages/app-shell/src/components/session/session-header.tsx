import { Button } from "@orchestra/ui/button"
import { Icon } from "@orchestra/ui/icon"
import { Keybind } from "@orchestra/ui/keybind"
import { Tooltip } from "@orchestra/ui/tooltip"
import { getFilename } from "@orchestra/core/util/path"
import { createMemo, createSignal, onMount, Show } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { createMediaQuery } from "@solid-primitives/media"
import { Portal } from "solid-js/web"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useServer } from "@/context/server"
import { useSettings } from "@/context/settings"
import { useSync } from "@/context/sync"
import { useTerminal } from "@/context/terminal"
import { focusTerminalById } from "@/pages/session/helpers"
import { useSessionLayout } from "@/pages/session/session-layout"
import { SessionCrumbs } from "@/orchestra/crumbs"
import { decode64 } from "@/utils/base64"
import { requireServerKey } from "@/utils/session-route"
import { StatusPopover, StatusPopoverV2 } from "../status-popover"
import { IconButtonV2 } from "@orchestra/ui/v2/icon-button-v2"
import { Icon as IconV2 } from "@orchestra/ui/v2/icon"
import { KeybindV2 } from "@orchestra/ui/v2/keybind-v2"
import { TooltipV2 } from "@orchestra/ui/v2/tooltip-v2"
import { reviewTooltipKeybind } from "../command-tooltip-keybind"
import { useTitlebarRightMount } from "../titlebar"

export function SessionHeader() {
  const layout = useLayout()
  const command = useCommand()
  const language = useLanguage()
  const settings = useSettings()
  const terminal = useTerminal()
  const server = useServer()
  const sync = useSync()
  const navigate = useNavigate()
  const { params, view } = useSessionLayout()

  const projectDirectory = createMemo(() => decode64(params.dir) || sync().project?.worktree || "")
  const project = createMemo(() => {
    const directory = projectDirectory()
    if (!directory) return
    return layout.projects.list().find((p) => p.worktree === directory || p.sandboxes?.includes(directory))
  })
  const name = createMemo(() => {
    const current = project()
    if (current) return current.name || getFilename(current.worktree)
    return getFilename(projectDirectory())
  })
  const title = createMemo(
    () => (params.id ? sync().session.get(params.id)?.title : undefined) || language.t("command.session.new"),
  )
  // The titlebar's breadcrumb links the project back to Home with that project selected.
  const openProject = () => {
    const current = project()
    if (current)
      layout.home.setSelection({
        server: params.serverKey ? requireServerKey(params.serverKey) : server.key,
        directory: current.worktree,
      })
    navigate("/")
  }
  const hotkey = createMemo(() => command.keybind("file.open"))
  const search = settings.visibility.search
  const status = settings.visibility.status
  const isDesktop = createMediaQuery("(min-width: 768px)")

  const toggleTerminal = () => {
    const next = !view().terminal.opened()
    view().terminal.toggle()
    if (!next) return

    const id = terminal.active()
    if (!id) return
    focusTerminalById(id)
  }

  const v2ActionsState = createMemo<SessionHeaderV2ActionsState>(() => ({
    statusVisible: status(),
    statusLabel: language.t("status.popover.trigger"),
    reviewLabel: language.t("command.review.toggle"),
    reviewKeybind: reviewTooltipKeybind(command),
    reviewVisible: isDesktop(),
    reviewOpened: view().reviewPanel.opened(),
    onReviewToggle: () => view().reviewPanel.toggle(),
    terminalLabel: language.t("command.terminal.toggle"),
    terminalKeybind: command.keybindParts("terminal.toggle"),
    terminalOpened: view().terminal.opened(),
    onTerminalToggle: toggleTerminal,
  }))

  const [centerMount, setCenterMount] = createSignal<HTMLElement | null>(null)
  const rightMount = useTitlebarRightMount()
  onMount(() => {
    setCenterMount(document.getElementById("orchestra-titlebar-center"))
  })

  return (
    <>
      <SessionCrumbs project={name() ? { label: name(), onSelect: openProject } : undefined} title={title()} />
      <Show when={centerMount()} keyed>
        {(mount) => (
          <Portal mount={mount}>
            <Show when={!search() && name()}>
              <span class="min-w-0 truncate text-12-regular text-text-weak" data-component="session-project-name">
                {name()}
              </span>
            </Show>
            <Show when={search()}>
              <Button
                type="button"
                variant="ghost"
                size="small"
                class="hidden md:flex w-[240px] max-w-full min-w-0 items-center gap-2 justify-between rounded-md border border-border-weak-base bg-surface-panel shadow-none cursor-default"
                onClick={() => command.trigger("file.open")}
                aria-label={language.t("session.header.searchFiles")}
              >
                <div class="flex min-w-0 flex-1 items-center overflow-visible">
                  <span class="flex-1 min-w-0 text-12-regular text-text-weak truncate text-left">
                    {language.t("session.header.search.placeholder", {
                      project: name(),
                    })}
                  </span>
                </div>

                <Show when={hotkey()} keyed>
                  {(keybind) => (
                    <Keybind class="shrink-0 !border-0 !bg-transparent !shadow-none px-0 text-text-weaker">
                      {keybind}
                    </Keybind>
                  )}
                </Show>
              </Button>
            </Show>
          </Portal>
        )}
      </Show>
      <Show when={rightMount()} keyed>
        {(mount) => (
          <Portal mount={mount}>
            <SessionHeaderV2Actions state={v2ActionsState()} />
          </Portal>
        )}
      </Show>
    </>
  )
}

type SessionHeaderV2ActionsState = {
  statusVisible: boolean
  statusLabel: string
  reviewLabel: string
  reviewKeybind: string[]
  reviewVisible: boolean
  reviewOpened: boolean
  onReviewToggle: () => void
  terminalLabel: string
  terminalKeybind: string[]
  terminalOpened: boolean
  onTerminalToggle: () => void
}

function SessionHeaderV2Actions(props: { state: SessionHeaderV2ActionsState }) {
  const language = useLanguage()

  return (
    <div class="flex items-center gap-2">
      <Show when={props.state.statusVisible}>
        <Tooltip placement="bottom" value={props.state.statusLabel}>
          <StatusPopoverV2 />
        </Tooltip>
      </Show>
      <TooltipV2
        class="shrink-0"
        placement="bottom"
        value={
          <>
            {props.state.terminalLabel}
            <Show when={props.state.terminalKeybind.length > 0}>
              <KeybindV2 keys={props.state.terminalKeybind} variant="neutral" />
            </Show>
          </>
        }
      >
        <IconButtonV2
          type="button"
          variant="ghost-muted"
          size="large"
          class="!w-9 shrink-0"
          state={props.state.terminalOpened ? "pressed" : undefined}
          onClick={props.state.onTerminalToggle}
          aria-label={props.state.terminalLabel}
          aria-expanded={props.state.terminalOpened}
          aria-controls="terminal-panel"
          icon={<Icon name={props.state.terminalOpened ? "terminal-active" : "terminal"} size="small" />}
        />
      </TooltipV2>
      <Show when={props.state.reviewVisible}>
        <TooltipV2
          class="shrink-0"
          placement="bottom"
          value={
            <>
              {props.state.reviewLabel}
              <Show when={props.state.reviewKeybind.length > 0}>
                <KeybindV2 keys={props.state.reviewKeybind} variant="neutral" />
              </Show>
            </>
          }
        >
          <IconButtonV2
            type="button"
            variant="ghost-muted"
            size="large"
            class="!w-9 shrink-0"
            state={props.state.reviewOpened ? "pressed" : undefined}
            onClick={props.state.onReviewToggle}
            aria-label={props.state.reviewLabel}
            aria-expanded={props.state.reviewOpened}
            aria-controls="review-panel"
            icon={<IconV2 name="sidebar-right" />}
          />
        </TooltipV2>
      </Show>
    </div>
  )
}
