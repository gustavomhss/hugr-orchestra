import { For, Show, createEffect, createMemo, onCleanup, untrack, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { createMediaQuery } from "@solid-primitives/media"
import { DragDropProvider as DndKitProvider, PointerSensor } from "@dnd-kit/solid"
import { isSortable } from "@dnd-kit/solid/sortable"
import { Accessibility, AutoScroller, Feedback, PointerActivationConstraints } from "@dnd-kit/dom"
import { RestrictToHorizontalAxis } from "@dnd-kit/abstract/modifiers"
import { RestrictToElement } from "@dnd-kit/dom/modifiers"
import {
  DragDropProvider,
  DragDropSensors,
  DragOverlay,
  SortableProvider,
  closestCenter,
  type DragEvent,
} from "@thisbeyond/solid-dnd"
import { Tabs } from "@orchestra/ui/tabs"
import { IconButton } from "@orchestra/ui/icon-button"
import { Icon } from "@orchestra/ui/icon"
import { TooltipKeybind } from "@orchestra/ui/tooltip"
import { HugrMark } from "@/orchestra/brand"
import { IconButtonV2 } from "@orchestra/ui/v2/icon-button-v2"
import { KeybindV2 } from "@orchestra/ui/v2/keybind-v2"
import { TooltipV2 } from "@orchestra/ui/v2/tooltip-v2"
import type { SnapshotFileDiff, VcsFileDiff } from "@orchestra/sdk/v2"
import type { FileDiffInfo } from "@opencode-ai/client/promise"
import { ConstrainDragYAxis, getDraggableId } from "@/utils/solid-dnd"
import { useDialog } from "@orchestra/ui/context/dialog"

import { normalizeFileTreeV2Path } from "@/components/file-tree-v2-model"
import { SessionContextUsage } from "@/components/session-context-usage"

const reviewTabID = "session-side-panel-review-tab"
const reviewTabPanelID = "session-side-panel-review-tabpanel"
const fileBrowserTabPanelID = "session-side-panel-file-browser-tabpanel"
import { SessionContextTab, SortableTab, SortableTabV2, FileVisual } from "@/components/session"
import { OpenInAppV2 } from "@/components/session/open-in-app-v2"
import { useCommand } from "@/context/command"
import { useFile, type SelectedLineRange } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useSDK } from "@/context/sdk"
import { useSettings } from "@/context/settings"
import { createFileTabListSync } from "@/pages/session/file-tab-scroll"
import { FileTabContent } from "@/pages/session/file-tabs"
import {
  SESSION_OPEN_FILE_TAB,
  createOpenSessionFileTab,
  createSidePanelTabs,
  getTabReorderIndex,
  planTasksTab,
  shouldShowFileTree,
  type Sizing,
} from "@/pages/session/helpers"
import { setSessionHandoff } from "@/pages/session/handoff"
import { useSessionLayout } from "@/pages/session/session-layout"
import { SessionFileBrowserTab, type SessionFileBrowserState } from "@/pages/session/v2/session-file-browser-tab"
import { FILE_TREE_WIDTH_MIN, LegacyFileTreePanel } from "./legacy-file-tree-panel"
import { TasksPanel } from "./tasks-panel"
import { BackgroundProcessesPanel } from "./processes-panel"
import { AppsPanel } from "./apps-panel"
import { OrchestraCockpit, OrchestraTaskFeed } from "./orchestra-cockpit"
import { OrchestraReviewViews } from "@/orchestra/review"
import { createTasksData } from "./tasks-data"

type ReviewDiff = FileDiffInfo | SnapshotFileDiff | VcsFileDiff
type RenderDiff = FileDiffInfo | (SnapshotFileDiff & { file: string }) | VcsFileDiff

function renderDiff(value: ReviewDiff): value is RenderDiff {
  return typeof value.file === "string"
}

export function SessionSidePanel(props: {
  canReview: () => boolean
  diffs: () => ReviewDiff[]
  diffsReady: () => boolean
  empty: () => string
  hasReview: () => boolean
  reviewHasFocusableContent: () => boolean
  reviewCount: () => number
  reviewPanel: () => JSX.Element
  reviewSidebarToggle?: (disabled: boolean) => JSX.Element
  fileBrowserState?: SessionFileBrowserState
  activeDiff?: string
  focusReviewDiff: (path: string) => void
  reviewSnap: boolean
  size: Sizing
  stacked?: boolean
}) {
  const layout = useLayout()
  const settings = useSettings()
  const file = useFile()
  const language = useLanguage()
  const command = useCommand()
  const dialog = useDialog()
  const sdk = useSDK()
  const { sessionKey, tabs, view, params } = useSessionLayout()
  const projectDirectory = createMemo(() => sdk().directory)

  const isDesktop = createMediaQuery("(min-width: 768px)")
  const shown = settings.visibility.fileTree

  const reviewOpen = createMemo(() => isDesktop() && view().reviewPanel.opened())
  const fileOpen = createMemo(
    () =>
      isDesktop() &&
      shouldShowFileTree({
        visible: shown(),
        opened: layout.fileTree.opened(),
      }),
  )
  const open = createMemo(() => reviewOpen() || fileOpen())
  const fileTreeWidth = createMemo(() => Math.max(FILE_TREE_WIDTH_MIN, layout.fileTree.width()))
  const reviewTab = createMemo(() => isDesktop())
  const panelWidth = createMemo(() => {
    if (!open()) return "0px"
    if (reviewOpen()) return "auto"
    return `${fileTreeWidth()}px`
  })
  const treeWidth = createMemo(() => (fileOpen() ? `${fileTreeWidth()}px` : "0px"))

  const diffs = createMemo(() => props.diffs().filter(renderDiff))
  const diffFiles = createMemo(() => diffs().map((d) => d.file))
  const kinds = createMemo(() => {
    const merge = (a: "add" | "del" | "mix" | undefined, b: "add" | "del" | "mix") => {
      if (!a) return b
      if (a === b) return a
      return "mix" as const
    }

    const out = new Map<string, "add" | "del" | "mix">()
    for (const diff of diffs()) {
      const file = normalizeFileTreeV2Path(diff.file)
      const kind = diff.status === "added" ? "add" : diff.status === "deleted" ? "del" : "mix"

      out.set(file, kind)

      const parts = file.split("/")
      for (const [idx] of parts.slice(0, -1).entries()) {
        const dir = parts.slice(0, idx + 1).join("/")
        if (!dir) continue
        out.set(dir, merge(out.get(dir), kind))
      }
    }
    return out
  })

  const normalizeTab = (tab: string) => {
    if (!tab.startsWith("file://")) return tab
    return file.tab(tab)
  }

  const openReviewPanel = () => {
    if (!view().reviewPanel.opened()) view().reviewPanel.open()
  }

  const openTab = createOpenSessionFileTab({
    normalizeTab,
    openTab: tabs().open,
    pathFromTab: file.pathFromTab,
    loadFile: file.load,
    openReviewPanel,
    setActive: tabs().setActive,
  })

  const tabState = createSidePanelTabs({
    tabs,
    pathFromTab: file.pathFromTab,
    normalizeTab,
    review: reviewTab,
    hasReview: props.canReview,
    fileBrowser: () => !!props.fileBrowserState,
    // The approved rail gives Tasks its own tab beside Apps, which hosts only the Dock.
    cockpit: () => false,
    permanent: settings.general.newLayoutDesigns,
  })
  const contextOpen = tabState.contextOpen
  const tasksOpen = tabState.tasksOpen
  const tasksData = createTasksData()
  const openFileOpen = tabState.openFileOpen

  // Auto-open the Tasks tab while background work is live
  // (Claude tasks-pane parity). Lives here — not in TasksPanel — because the panel
  // only mounts once its tab is already active. Level-triggered (not edge-triggered)
  // so remounts and HMR can't miss it; leaving the tab snoozes until work drains.
  let wasOpen = false
  let snoozed = false
  createEffect(() => {
    const n = tasksData.liveCount()
    const active = tabState.activeTab()
    const open = active === "tasks"
    if (n === 0) {
      snoozed = false
      wasOpen = open
      return
    }
    if (wasOpen && !open) snoozed = true
    wasOpen = open
    if (!open && !snoozed) {
      // Read the tab state before changing it: open() always activates its tab,
      // which would detach an active App Dock and break the agent's dock tools.
      const plan = untrack(() => planTasksTab({ active: tabs().active(), all: tabs().all() }))
      // Live work may take Review's place, never Apps, Context or a file the user is reading;
      // there Tasks only joins the strip.
      const reading =
        active === "apps" || active === "context" || active === SESSION_OPEN_FILE_TAB || !!file.pathFromTab(active)
      if (reading || !plan.activate) {
        tabs().setAll(plan.all)
        return
      }
      // Panel first, then tab, then focus in a microtask so the freshly
      // mounted tab strip selects that tab instead of falling back to Review.
      view().reviewPanel.open()
      tabs().open("tasks")
      queueMicrotask(() => tabs().setActive("tasks"))
    }
  })
  const panelTabs = tabState.panelTabs
  const openedTabs = tabState.openedTabs
  const activeTab = tabState.activeTab
  const activeFileTab = tabState.activeFileTab

  const fileTreeTab = () => layout.fileTree.tab()

  const showAllFiles = () => {
    if (fileTreeTab() !== "changes") return
    layout.fileTree.setTab("all")
  }

  let fileFilter: HTMLInputElement | undefined
  let tabList: HTMLDivElement | undefined
  const temporaryTab = tabs().preview
  const previewTab = (value: string) => {
    const next = normalizeTab(value)
    tabs().previewTab(next)
    const path = file.pathFromTab(next)
    if (path) void file.load(path)
    openReviewPanel()
    queueMicrotask(() => tabs().setActive(next))
  }
  const openFileBrowser = () => {
    previewTab(SESSION_OPEN_FILE_TAB)
    queueMicrotask(() => fileFilter?.focus())
  }
  const activateTab = (value: string) => {
    const next = normalizeTab(value)
    if (next === "apps") tabs().open("apps")
    const path = file.pathFromTab(next)
    if (path) void file.load(path)
    openReviewPanel()
    tabs().setActive(next)
  }
  const browserTab = createMemo(() => {
    if (!props.fileBrowserState) return undefined
    const active = activeTab()
    if (active === SESSION_OPEN_FILE_TAB) return SESSION_OPEN_FILE_TAB
    if (active && file.pathFromTab(active)) return active
    return activeFileTab()
  })
  // Keep the file-browser shell mounted while any file tab exists. Kobalte briefly
  // selects Review while the tab For replaces a preview trigger, which would
  // otherwise dispose the sidebar and reset scroll.
  const fileBrowserMounted = createMemo(() => {
    if (!props.fileBrowserState) return false
    return openedTabs().length > 0 || openFileOpen() || !!browserTab()
  })
  const fileBrowserVisible = createMemo(() => {
    const active = activeTab()
    return active !== "review" && active !== "context" && active !== "apps" && active !== "empty"
  })
  const openFileKeybind = createMemo(() => command.keybindParts("file.open"))
  const closeTabKeybind = createMemo(() => command.keybindParts("tab.close"))
  const [store, setStore] = createStore({
    activeDraggable: undefined as string | undefined,
  })

  const handleDragStart = (event: unknown) => {
    const id = getDraggableId(event)
    if (!id) return
    setStore("activeDraggable", id)
  }

  const handleDragOver = (event: DragEvent) => {
    const { draggable, droppable } = event
    if (!draggable || !droppable) return

    const currentTabs = tabs().all()
    const toIndex = getTabReorderIndex(currentTabs, draggable.id.toString(), droppable.id.toString())
    if (toIndex === undefined) return
    tabs().move(draggable.id.toString(), toIndex)
  }

  const handleDragEnd = () => {
    setStore("activeDraggable", undefined)
  }

  createEffect(() => {
    if (!file.ready()) return

    setSessionHandoff(sessionKey(), {
      files: tabs()
        .all()
        .reduce<Record<string, SelectedLineRange | null>>((acc, tab) => {
          const path = file.pathFromTab(tab)
          if (!path) return acc

          const selected = file.selectedLines(path)
          acc[path] =
            selected && typeof selected === "object" && "start" in selected && "end" in selected
              ? (selected as SelectedLineRange)
              : null

          return acc
        }, {}),
    })
  })

  return (
    <Show when={isDesktop() && !(settings.general.newLayoutDesigns() && !params.id)}>
      <aside
        id="review-panel"
        data-component="session-side-panel"
        data-active-tab={activeTab()}
        aria-label={language.t("session.panel.reviewAndFiles")}
        aria-hidden={!open()}
        inert={!open()}
        class="relative min-w-0 flex overflow-hidden"
        classList={{
          "bg-v2-background-bg-base": settings.general.newLayoutDesigns(),
          "bg-background-base": !settings.general.newLayoutDesigns(),
          "h-full shrink-0": !props.stacked,
          "h-full min-h-0": props.stacked,
          "pointer-events-none": !open(),
          "transition-[width] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] motion-reduce:transition-none":
            !props.size.active() && !props.reviewSnap,
          "rounded-[10px] shadow-[var(--v2-elevation-raised)] overflow-hidden": settings.general.newLayoutDesigns(),
          "flex-1": reviewOpen(),
        }}
        style={{ width: panelWidth() }}
      >
        <Show when={open()}>
          <div
            data-slot="session-side-panel-content"
            class="size-full flex"
            classList={{
              "border-l border-border-weaker-base": !settings.general.newLayoutDesigns(),
            }}
          >
            <Show when={reviewOpen()}>
              <div
                data-slot="session-side-panel-main"
                class="relative min-w-0 h-full flex-1 overflow-hidden"
                classList={{
                  "bg-v2-background-bg-base": settings.general.newLayoutDesigns(),
                  "bg-background-base": !settings.general.newLayoutDesigns(),
                }}
              >
                <div
                  data-slot="session-side-panel-shell"
                  class="size-full min-w-0 h-full"
                  classList={{
                    "bg-v2-background-bg-base": settings.general.newLayoutDesigns(),
                    "bg-background-base": !settings.general.newLayoutDesigns(),
                  }}
                >
                  <Show
                    when={props.fileBrowserState}
                    fallback={
                      <DragDropProvider
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onDragOver={handleDragOver}
                        collisionDetector={closestCenter}
                      >
                        <DragDropSensors />
                        <ConstrainDragYAxis />
                        <Tabs data-scope="session-side-panel" value={activeTab()} onChange={activateTab}>
                          <div data-slot="session-side-panel-tab-bar" class="sticky top-0 shrink-0 flex">
                            <Tabs.List
                              ref={(el: HTMLDivElement) => {
                                const stop = createFileTabListSync({ el, contextOpen })
                                onCleanup(stop)
                              }}
                            >
                              <Show when={reviewTab() && props.canReview()}>
                                <Tabs.Trigger
                                  value="review"
                                  id={reviewTabID}
                                  aria-controls={activeTab() === "review" ? reviewTabPanelID : undefined}
                                >
                                  <div class="flex items-center gap-1.5">
                                    <div>{language.t("session.tab.review")}</div>
                                    <Show when={props.hasReview()}>
                                      <div data-slot="session-side-panel-tab-count">{props.reviewCount()}</div>
                                    </Show>
                                  </div>
                                </Tabs.Trigger>
                              </Show>
                              <Show when={contextOpen()}>
                                <Tabs.Trigger
                                  value="context"
                                  closeButton={
                                    <TooltipKeybind
                                      title={language.t("common.closeTab")}
                                      keybind={command.keybind("tab.close")}
                                      placement="bottom"
                                      gutter={10}
                                    >
                                      <IconButton
                                        icon="close-small"
                                        variant="ghost"
                                        class="h-5 w-5"
                                        onClick={() => tabs().close("context")}
                                        aria-label={language.t("common.closeTab")}
                                      />
                                    </TooltipKeybind>
                                  }
                                  hideCloseButton
                                  onMiddleClick={() => tabs().close("context")}
                                >
                                  <div class="flex items-center gap-2">
                                    <SessionContextUsage variant="indicator" />
                                    <div>{language.t("session.tab.context")}</div>
                                  </div>
                                </Tabs.Trigger>
                              </Show>
                              <Show when={tasksOpen()}>
                                <Tabs.Trigger
                                  value="tasks"
                                  closeButton={
                                    <TooltipKeybind
                                      title={language.t("common.closeTab")}
                                      keybind={command.keybind("tab.close")}
                                      placement="bottom"
                                      gutter={10}
                                    >
                                      <IconButton
                                        icon="close-small"
                                        variant="ghost"
                                        class="h-5 w-5"
                                        onClick={() => tabs().close("tasks")}
                                        aria-label={language.t("common.closeTab")}
                                      />
                                    </TooltipKeybind>
                                  }
                                  hideCloseButton
                                  onMiddleClick={() => tabs().close("tasks")}
                                >
                                  <div class="flex items-center gap-2">
                                    <div>{language.t("session.tab.tasks")}</div>
                                    <Show when={tasksData.liveCount() > 0}>
                                      <div data-slot="session-side-panel-tab-count">{tasksData.liveCount()}</div>
                                    </Show>
                                  </div>
                                </Tabs.Trigger>
                              </Show>
                              <Tabs.Trigger value="apps">
                                <div>Apps</div>
                              </Tabs.Trigger>
                              <SortableProvider ids={openedTabs()}>
                                <For each={panelTabs()}>
                                  {(tab) => (
                                    <Show
                                      when={tab === SESSION_OPEN_FILE_TAB}
                                      fallback={
                                        <SortableTab
                                          tab={tab}
                                          temporary={temporaryTab() === tab}
                                          onTabClose={tabs().close}
                                          onTabDoubleClick={temporaryTab() === tab ? openTab : undefined}
                                        />
                                      }
                                    >
                                      <Tabs.Trigger
                                        value={SESSION_OPEN_FILE_TAB}
                                        closeButton={
                                          <TooltipKeybind
                                            title={language.t("common.closeTab")}
                                            keybind={command.keybind("tab.close")}
                                            placement="bottom"
                                            gutter={10}
                                          >
                                            <IconButton
                                              icon="close-small"
                                              variant="ghost"
                                              class="h-5 w-5"
                                              onClick={() => tabs().close(SESSION_OPEN_FILE_TAB)}
                                              aria-label={language.t("common.closeTab")}
                                            />
                                          </TooltipKeybind>
                                        }
                                        hideCloseButton
                                        onMiddleClick={() => tabs().close(SESSION_OPEN_FILE_TAB)}
                                      >
                                        <div class="flex items-center gap-1.5 italic">
                                          <Icon name="open-file" size="small" />
                                          <span>{language.t("command.file.open")}</span>
                                        </div>
                                      </Tabs.Trigger>
                                    </Show>
                                  )}
                                </For>
                              </SortableProvider>
                              <div
                                class="h-full shrink-0 sticky right-0 z-10 flex items-center justify-center pr-3"
                                classList={{
                                  "bg-v2-background-bg-base": settings.general.newLayoutDesigns(),
                                  "bg-background-stronger": !settings.general.newLayoutDesigns(),
                                }}
                              >
                                <TooltipKeybind
                                  title={language.t("command.file.open")}
                                  keybind={command.keybind("file.open")}
                                  class="flex items-center"
                                >
                                  <IconButton
                                    icon="plus-small"
                                    variant="ghost"
                                    iconSize="large"
                                    class="!rounded-md"
                                    onClick={() => {
                                      void import("@/components/dialog-select-file").then((x) => {
                                        dialog.show(() => <x.DialogSelectFile mode="files" onOpenFile={showAllFiles} />)
                                      })
                                    }}
                                    aria-label={language.t("command.file.open")}
                                  />
                                </TooltipKeybind>
                              </div>
                            </Tabs.List>
                          </div>

                          <Show when={reviewTab() && props.canReview() && activeTab() === "review"}>
                            <div
                              id={reviewTabPanelID}
                              role="tabpanel"
                              aria-labelledby={reviewTabID}
                              tabIndex={props.reviewHasFocusableContent() ? undefined : 0}
                              data-slot="tabs-content"
                              data-session-tab="review"
                              class="flex flex-col h-full overflow-hidden contain-strict"
                            >
                              {props.reviewPanel()}
                            </div>
                          </Show>

                          <Show when={activeTab() === "empty"}>
                            <Tabs.Content
                              data-session-tab="empty"
                              value="empty"
                              class="flex flex-col h-full overflow-hidden contain-strict"
                            >
                              <div class="relative pt-2 flex-1 min-h-0 overflow-hidden">
                                <div class="h-full px-6 pb-42 -mt-4 flex flex-col items-center justify-center text-center gap-6">
                                  <HugrMark class="w-14 opacity-10" />
                                  <div class="text-14-regular text-text-weak max-w-56">
                                    {language.t("session.files.selectToOpen")}
                                  </div>
                                </div>
                              </div>
                            </Tabs.Content>
                          </Show>

                          <Show when={activeTab() === "context"}>
                            <Tabs.Content
                              data-session-tab="context"
                              value="context"
                              class="flex flex-col h-full overflow-hidden contain-strict"
                            >
                              <div class="relative pt-2 flex-1 min-h-0 overflow-hidden">
                                <SessionContextTab />
                              </div>
                            </Tabs.Content>
                          </Show>

                          <Show when={activeTab() === "tasks"}>
                            <Tabs.Content
                              data-session-tab="tasks"
                              value="tasks"
                              class="flex flex-col h-full overflow-hidden contain-strict"
                            >
                              <div class="relative pt-2 flex-1 min-h-0 overflow-hidden flex flex-col">
                                <div class="max-h-[50%] shrink-0 overflow-y-auto">
                                  <BackgroundProcessesPanel />
                                </div>
                                <div class="flex-1 min-h-0">
                                  <TasksPanel data={tasksData} />
                                </div>
                              </div>
                            </Tabs.Content>
                          </Show>
                          <Show when={activeTab() === "apps"}>
                            <Tabs.Content
                              data-session-tab="apps"
                              value="apps"
                              class="flex flex-col h-full overflow-hidden contain-strict"
                            >
                              <AppsPanel />
                            </Tabs.Content>
                          </Show>

                          <Show when={activeFileTab()} keyed>
                            {(tab) => <FileTabContent tab={tab} />}
                          </Show>
                        </Tabs>
                        <DragOverlay>
                          <Show when={store.activeDraggable} keyed>
                            {(tab) => {
                              const path = file.pathFromTab(tab)
                              return (
                                <div data-component="tabs-drag-preview">
                                  <Show when={path}>
                                    {(p) => <FileVisual active path={p()} temporary={temporaryTab() === tab} />}
                                  </Show>
                                </div>
                              )
                            }}
                          </Show>
                        </DragOverlay>
                      </DragDropProvider>
                    }
                  >
                    <DndKitProvider
                      sensors={[
                        PointerSensor.configure({
                          activationConstraints: [new PointerActivationConstraints.Distance({ value: 4 })],
                          preventActivation: (event) =>
                            event.target instanceof Element &&
                            (!!event.target.closest('[data-slot="tabs-trigger-close-button"]') ||
                              !!event.target.closest(".session-review-v2-open-in-app-slot")),
                        }),
                      ]}
                      modifiers={[
                        RestrictToHorizontalAxis,
                        RestrictToElement.configure({ element: () => tabList ?? null }),
                      ]}
                      plugins={(defaults) => [
                        ...defaults.filter((plugin) => plugin !== Accessibility),
                        AutoScroller.configure({ acceleration: 8, threshold: { x: 0.05, y: 0 } }),
                        Feedback.configure({ dropAnimation: null }),
                      ]}
                      onDragEnd={(event) => {
                        const source = event.operation.source
                        if (event.canceled || !isSortable(source) || source.initialIndex === source.index) return
                        tabs().move(source.id.toString(), source.index)
                      }}
                    >
                      <Tabs data-scope="session-side-panel" value={activeTab()} onChange={activateTab}>
                        <div
                          data-slot="session-side-panel-tab-bar"
                          class="session-review-v2-tabs-bar sticky top-0 shrink-0 flex items-center"
                        >
                          <Tabs.List
                            ref={(el: HTMLDivElement) => {
                              tabList = el
                              const stop = createFileTabListSync({ el, contextOpen })
                              onCleanup(stop)
                            }}
                          >
                            <Show when={props.reviewSidebarToggle}>
                              {(toggle) => (
                                <div class="session-review-v2-sidebar-toggle-slot h-full shrink-0 sticky left-0 z-10 flex items-center justify-center bg-v2-background-bg-base">
                                  {toggle()(activeTab() === SESSION_OPEN_FILE_TAB)}
                                </div>
                              )}
                            </Show>
                            {/* Always present, so the tab strip never mounts without Review and falls back to another tab. */}
                            <Show when={reviewTab()}>
                              <Tabs.Trigger
                                value="review"
                                id={reviewTabID}
                                aria-controls={activeTab() === "review" ? reviewTabPanelID : undefined}
                              >
                                <div class="flex items-center gap-1.5">
                                  <div>{language.t("session.tab.review")}</div>
                                  <div data-slot="session-side-panel-tab-count">{props.reviewCount()}</div>
                                </div>
                              </Tabs.Trigger>
                            </Show>
                            <Tabs.Trigger value="context">
                              <div>{language.t("session.tab.context")}</div>
                            </Tabs.Trigger>
                            <Tabs.Trigger value="tasks">
                              <div class="flex items-center gap-1.5">
                                <div>{language.t("session.tab.tasks")}</div>
                                <div data-slot="session-side-panel-tab-count">{tasksData.liveCount()}</div>
                              </div>
                            </Tabs.Trigger>
                            <Tabs.Trigger value="apps">
                              <div>{language.t("orchestra.chat.apps")}</div>
                            </Tabs.Trigger>
                            <For each={panelTabs()}>
                              {(tab) => (
                                <Show
                                  when={tab === SESSION_OPEN_FILE_TAB}
                                  fallback={
                                    <SortableTabV2
                                      tab={tab}
                                      index={() => tabs().all().indexOf(tab)}
                                      temporary={temporaryTab() === tab}
                                      onTabClose={tabs().close}
                                      onTabDoubleClick={temporaryTab() === tab ? openTab : undefined}
                                    />
                                  }
                                >
                                  <Tabs.Trigger
                                    value={SESSION_OPEN_FILE_TAB}
                                    closeButton={
                                      <TooltipV2
                                        value={
                                          <>
                                            {language.t("common.closeTab")}
                                            <Show when={closeTabKeybind().length > 0}>
                                              <KeybindV2 keys={closeTabKeybind()} variant="neutral" />
                                            </Show>
                                          </>
                                        }
                                        placement="bottom"
                                        gutter={10}
                                      >
                                        <IconButton
                                          icon="close-small"
                                          variant="ghost"
                                          class="h-5 w-5"
                                          onClick={() => tabs().close(SESSION_OPEN_FILE_TAB)}
                                          aria-label={language.t("common.closeTab")}
                                        />
                                      </TooltipV2>
                                    }
                                    hideCloseButton
                                    onMiddleClick={() => tabs().close(SESSION_OPEN_FILE_TAB)}
                                  >
                                    <div class="flex items-center gap-1.5 italic">
                                      <Icon name="open-file" size="small" />
                                      <span>{language.t("command.file.open")}</span>
                                    </div>
                                  </Tabs.Trigger>
                                </Show>
                              )}
                            </For>
                            <div
                              data-slot="session-side-panel-open-file"
                              class="h-full shrink-0 sticky right-0 z-10 flex items-center justify-center"
                              classList={{
                                "bg-v2-background-bg-base": settings.general.newLayoutDesigns(),
                                "bg-background-stronger": !settings.general.newLayoutDesigns(),
                              }}
                            >
                              <TooltipV2
                                value={
                                  <>
                                    {language.t("command.file.open")}
                                    <Show when={openFileKeybind().length > 0}>
                                      <KeybindV2 keys={openFileKeybind()} variant="neutral" />
                                    </Show>
                                  </>
                                }
                                placement="bottom"
                                class="flex items-center"
                              >
                                <IconButtonV2
                                  icon={<Icon name="plus-small" />}
                                  variant="ghost-muted"
                                  size="large"
                                  onClick={() => openFileBrowser()}
                                  aria-label={language.t("command.file.open")}
                                />
                              </TooltipV2>
                            </div>
                          </Tabs.List>
                          <div
                            class="session-review-v2-open-in-app-slot shrink-0 flex items-center pr-3"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <OpenInAppV2 directory={projectDirectory} />
                          </div>
                        </div>

                        <Show when={reviewTab() && props.canReview() && activeTab() === "review"}>
                          <div
                            id={reviewTabPanelID}
                            role="tabpanel"
                            aria-labelledby={reviewTabID}
                            tabIndex={props.reviewHasFocusableContent() ? undefined : 0}
                            data-slot="tabs-content"
                            data-session-tab="review"
                            class="flex flex-col h-full overflow-hidden contain-strict"
                          >
                            {props.reviewPanel()}
                          </div>
                        </Show>

                        <Show when={activeTab() === "empty"}>
                          <Tabs.Content
                            data-session-tab="empty"
                            value="empty"
                            class="flex flex-col h-full overflow-hidden contain-strict"
                          >
                            <div class="relative pt-2 flex-1 min-h-0 overflow-hidden">
                              <div class="h-full px-6 pb-42 -mt-4 flex flex-col items-center justify-center text-center gap-6">
                                <HugrMark class="w-14 opacity-10" />
                                <div class="text-14-regular text-text-weak max-w-56">
                                  {language.t("session.files.selectToOpen")}
                                </div>
                              </div>
                            </div>
                          </Tabs.Content>
                        </Show>

                        <Show when={activeTab() === "context"}>
                          <Tabs.Content
                            data-session-tab="context"
                            value="context"
                            class="flex flex-col h-full overflow-hidden contain-strict"
                          >
                            <div class="relative pt-2 flex-1 min-h-0 overflow-hidden">
                              <SessionContextTab />
                            </div>
                          </Tabs.Content>
                        </Show>

                        <Show when={activeTab() === "tasks"}>
                          <Tabs.Content
                            data-session-tab="tasks"
                            value="tasks"
                            class="flex flex-col h-full overflow-hidden contain-strict"
                          >
                            <OrchestraTaskFeed tasks={tasksData} onShowBrowser={() => activateTab("apps")} />
                          </Tabs.Content>
                        </Show>

                        <Show when={activeTab() === "apps"}>
                          <Tabs.Content
                            data-session-tab="apps"
                            value="apps"
                            class="flex flex-col h-full overflow-hidden contain-strict"
                          >
                            <OrchestraCockpit />
                          </Tabs.Content>
                        </Show>

                        <Show when={fileBrowserMounted()}>
                          <div
                            id={fileBrowserTabPanelID}
                            role="tabpanel"
                            data-slot="tabs-content"
                            data-session-tab="files"
                            class="h-full min-h-0 overflow-hidden flex flex-col"
                            classList={{ hidden: !fileBrowserVisible() }}
                            inert={!fileBrowserVisible() || undefined}
                          >
                            <Show
                              when={
                                (browserTab() ?? activeFileTab() ?? SESSION_OPEN_FILE_TAB) === SESSION_OPEN_FILE_TAB
                              }
                            >
                              <div data-slot="orchestra-files-head">
                                <OrchestraReviewViews
                                  view="all"
                                  count={props.reviewCount()}
                                  onChanged={() => activateTab("review")}
                                  onAll={() => undefined}
                                />
                              </div>
                            </Show>
                            <SessionFileBrowserTab
                              tab={browserTab() ?? activeFileTab() ?? SESSION_OPEN_FILE_TAB}
                              placeholder={
                                (browserTab() ?? activeFileTab() ?? SESSION_OPEN_FILE_TAB) === SESSION_OPEN_FILE_TAB
                              }
                              active={file.pathFromTab(browserTab() ?? activeFileTab() ?? "")}
                              kinds={kinds()}
                              state={props.fileBrowserState!}
                              onSelect={(path) => previewTab(file.tab(path))}
                              onSelectPermanent={(path) => openTab(file.tab(path))}
                              filterRef={(element) => (fileFilter = element)}
                            />
                          </div>
                        </Show>
                      </Tabs>
                    </DndKitProvider>
                  </Show>
                </div>
              </div>
            </Show>

            <Show when={fileOpen()}>
              <LegacyFileTreePanel
                fileOpen={fileOpen}
                treeWidth={treeWidth}
                fileTreeWidth={fileTreeWidth}
                reviewOpen={reviewOpen}
                size={props.size}
                reviewCount={props.reviewCount}
                hasReview={props.hasReview}
                diffsReady={props.diffsReady}
                diffFiles={diffFiles}
                kinds={kinds}
                activeDiff={props.activeDiff}
                focusReviewDiff={props.focusReviewDiff}
                openTab={openTab}
              />
            </Show>
          </div>
        </Show>
      </aside>
    </Show>
  )
}
