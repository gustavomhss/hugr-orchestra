import { createMemo, createSignal, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { Dynamic } from "solid-js/web"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { FileComponentProvider, useFileComponent } from "@orchestra/ui/context/file"
import type { FileProps } from "@orchestra/session-ui/file"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { SESSION_OPEN_FILE_TAB } from "@/pages/session/helpers"
import { useSessionLayout } from "@/pages/session/session-layout"
import { ReviewPanelV2, type ReviewPanelV2Props } from "@/pages/session/v2/review-panel-v2"
import { filterRenderableDiff, reviewDiffNeedsLoad } from "@/pages/session/v2/review-diff-kinds"
import { showToast } from "@/utils/toast"
import { OrchestraPullRequest } from "@/pages/session/orchestra-pull-request"
import { downloadText } from "@/utils/download"
import { collectPatches, joinPatches } from "@/pages/session/review-export"
import "@/orchestra/chapters/kit.css"

export function createOrchestraReviewPanel() {
  const settings = useSettings()
  // Preserve explicit toolbar choices across rail tab switches without new persisted state.
  const [store, setStore] = createStore({ width: 600, selected: false })

  return function OrchestraReviewPanel(props: ReviewPanelV2Props) {
    const fileComponent = useFileComponent()
    const language = useLanguage()
    const layout = useSessionLayout()
    let root!: HTMLDivElement
    const compact = createMemo(() => settings.general.newLayoutDesigns() && store.width < 600)
    const sidebarVisible = () => props.state.sidebarOpened() && (!compact() || props.state.sidebarWidth() > 0)
    const diffs = createMemo(() => props.diffs().filter(filterRenderableDiff))
    const [exporting, setExporting] = createSignal(false)

    onMount(() => {
      const rail = root.closest<HTMLElement>("#review-panel") ?? root
      setStore("width", rail.getBoundingClientRect().width)
      createResizeObserver(rail, ({ width }) => setStore("width", width))
    })

    const showAllFiles = () => {
      layout.tabs().previewTab(SESSION_OPEN_FILE_TAB)
      queueMicrotask(() => layout.tabs().setActive(SESSION_OPEN_FILE_TAB))
    }

    // Writes the changes this view lists as one unified diff, loading any patch the list only summarizes.
    const exportDiff = async () => {
      setExporting(true)
      const result = await collectPatches({
        diffs: diffs(),
        needsLoad: reviewDiffNeedsLoad,
        load: async (diff) => (await props.loadDiff?.(diff.file, props.diffVersion))?.patch,
      }).finally(() => setExporting(false))
      if (result.skipped.length > 0)
        showToast({ title: language.t("orchestra.chat.exportDiffSkipped", { count: result.skipped.length }) })
      if (result.patches.length === 0) return
      downloadText(`${layout.params.id ?? "changes"}.diff`, joinPatches(result.patches), "text/x-diff")
    }

    const ReviewFile = (fileProps: FileProps) => (
      <Dynamic
        component={fileComponent}
        {...fileProps}
        overflow={compact() ? "scroll" : (fileProps.overflow ?? "wrap")}
      />
    )

    return (
      <div
        ref={root}
        data-component="orchestra-review"
        data-compact={compact() ? "" : undefined}
        data-sidebar-visible={sidebarVisible() ? "" : undefined}
        data-empty={diffs().length === 0 ? "" : undefined}
        class="h-full min-h-0 flex flex-col"
      >
        <div data-slot="orchestra-review-head">
          <OrchestraReviewViews
            view="changed"
            count={diffs().length}
            onChanged={() => undefined}
            onAll={showAllFiles}
          />
          <div data-slot="orchestra-review-actions">
            <OrchestraPullRequest sessionID={layout.params.id} files={diffs} />
            <button
              type="button"
              class="mx-btn"
              data-action="review-export-diff"
              disabled={diffs().length === 0 || exporting()}
              onClick={() => void exportDiff()}
            >
              {language.t("orchestra.chat.exportDiff")}
            </button>
            <div data-slot="orchestra-review-mode">{props.title}</div>
          </div>
        </div>
        <div class="min-h-0 flex-1">
          <FileComponentProvider component={ReviewFile}>
            <ReviewPanelV2
              {...props}
              title={null}
              state={{ ...props.state, sidebarOpened: sidebarVisible }}
              diffStyle={compact() && !store.selected ? "unified" : props.diffStyle}
              onDiffStyleChange={
                props.onDiffStyleChange
                  ? (style) => {
                      setStore("selected", true)
                      props.onDiffStyleChange?.(style)
                    }
                  : undefined
              }
            />
          </FileComponentProvider>
        </div>
      </div>
    )
  }
}

// The rail's Files Changed / All files switch. Review shows the changed files; All files is the
// session's file browser, and both views carry the switch so either can lead back to the other.
export function OrchestraReviewViews(props: {
  view: "changed" | "all"
  count: number
  onChanged: () => void
  onAll: () => void
}) {
  const language = useLanguage()
  return (
    <div data-slot="orchestra-review-views">
      <button
        type="button"
        aria-current={props.view === "changed" ? "page" : undefined}
        data-active={props.view === "changed" ? "" : undefined}
        onClick={() => props.onChanged()}
      >
        {language.t("orchestra.chat.filesChanged", { count: props.count })}
      </button>
      <button
        type="button"
        aria-current={props.view === "all" ? "page" : undefined}
        data-active={props.view === "all" ? "" : undefined}
        onClick={() => props.onAll()}
      >
        {language.t("orchestra.chat.allFiles")}
      </button>
    </div>
  )
}
