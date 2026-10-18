import { Match, Show, Switch, createMemo } from "solid-js"
import { Tabs } from "@orchestra/ui/tabs"
import { ResizeHandle } from "@orchestra/ui/resize-handle"
import FileTree, { type Kind } from "@/components/file-tree"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useSettings } from "@/context/settings"
import type { Sizing } from "@/pages/session/helpers"

export const FILE_TREE_WIDTH_MIN = 240

export function LegacyFileTreePanel(props: {
  fileOpen: () => boolean
  treeWidth: () => string
  fileTreeWidth: () => number
  reviewOpen: () => boolean
  size: Sizing
  reviewCount: () => number
  hasReview: () => boolean
  diffsReady: () => boolean
  diffFiles: () => string[]
  kinds: () => ReadonlyMap<string, Kind>
  activeDiff?: string
  focusReviewDiff: (path: string) => void
  openTab: (tab: string) => void
}) {
  const layout = useLayout()
  const settings = useSettings()
  const file = useFile()
  const language = useLanguage()

  const empty = (msg: string) => (
    <div class="h-full flex flex-col">
      <div class="h-6 shrink-0" aria-hidden />
      <div class="flex-1 pb-64 flex items-center justify-center text-center">
        <div class="text-12-regular text-text-weak">{msg}</div>
      </div>
    </div>
  )

  const nofiles = createMemo(() => {
    const state = file.tree.state("")
    if (!state?.loaded) return false
    return file.tree.children("").length === 0
  })

  const setFileTreeTabValue = (value: string) => {
    if (value !== "changes" && value !== "all") return
    layout.fileTree.setTab(value)
  }

  return (
    <div
      id="file-tree-panel"
      class="relative min-w-0 h-full shrink-0 overflow-hidden"
      classList={{
        "transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] motion-reduce:transition-none":
          !props.size.active(),
      }}
      style={{ width: props.treeWidth() }}
    >
      <div
        class="h-full flex flex-col overflow-hidden group/filetree"
        classList={{ "border-l border-border-weaker-base": props.reviewOpen() }}
      >
        <Tabs
          variant="pill"
          value={layout.fileTree.tab()}
          onChange={setFileTreeTabValue}
          class="h-full"
          data-scope="filetree"
        >
          <Tabs.List>
            <Tabs.Trigger value="changes" class="flex-1" classes={{ button: "w-full" }}>
              <Show
                when={settings.general.newLayoutDesigns()}
                fallback={
                  <>
                    {props.reviewCount()}{" "}
                    {language.t(
                      props.reviewCount() === 1 ? "session.review.change.one" : "session.review.change.other",
                    )}
                  </>
                }
              >
                {language.t("session.review.filesChanged", { count: props.reviewCount() })}
              </Show>
            </Tabs.Trigger>
            <Tabs.Trigger value="all" class="flex-1" classes={{ button: "w-full" }}>
              {language.t("session.files.all")}
            </Tabs.Trigger>
          </Tabs.List>
          <Show when={layout.fileTree.tab() === "changes"}>
            <Tabs.Content value="changes" class="bg-background-stronger px-3 py-0">
              <Switch>
                <Match when={props.hasReview() || !props.diffsReady()}>
                  <Show
                    when={props.diffsReady()}
                    fallback={
                      <div class="px-2 py-2 text-12-regular text-text-weak">
                        {language.t("common.loading")}
                        {language.t("common.loading.ellipsis")}
                      </div>
                    }
                  >
                    <FileTree
                      path=""
                      class="pt-3"
                      allowed={props.diffFiles()}
                      kinds={props.kinds()}
                      draggable={false}
                      active={props.activeDiff}
                      onFileClick={(node) => props.focusReviewDiff(node.path)}
                    />
                  </Show>
                </Match>
              </Switch>
            </Tabs.Content>
          </Show>
          <Show when={layout.fileTree.tab() === "all"}>
            <Tabs.Content value="all" class="bg-background-stronger px-3 py-0">
              <Switch>
                <Match when={nofiles()}>{empty(language.t("session.files.empty"))}</Match>
                <Match when={true}>
                  <FileTree
                    path=""
                    class="pt-3"
                    modified={props.diffFiles()}
                    kinds={props.kinds()}
                    onFileClick={(node) => props.openTab(file.tab(node.path))}
                  />
                </Match>
              </Switch>
            </Tabs.Content>
          </Show>
        </Tabs>
      </div>
      <Show when={props.fileOpen()}>
        <div onPointerDown={() => props.size.start()}>
          <ResizeHandle
            direction="horizontal"
            edge="start"
            size={props.fileTreeWidth()}
            min={FILE_TREE_WIDTH_MIN}
            max={480}
            onResize={(width) => {
              props.size.touch()
              layout.fileTree.resize(width)
            }}
          />
        </div>
      </Show>
    </div>
  )
}
