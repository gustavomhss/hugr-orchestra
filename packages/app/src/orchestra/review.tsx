import { createMemo, createSignal, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { Dynamic } from "solid-js/web"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { FileComponentProvider, useFileComponent } from "@opencode-ai/ui/context/file"
import type { FileProps } from "@opencode-ai/session-ui/file"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { SESSION_OPEN_FILE_TAB } from "@/pages/session/helpers"
import { useSessionLayout } from "@/pages/session/session-layout"
import { ReviewPanelV2, type ReviewPanelV2Props } from "@/pages/session/v2/review-panel-v2"
import { filterRenderableDiff, reviewDiffNeedsLoad } from "@/pages/session/v2/review-diff-kinds"
import { showToast } from "@/utils/toast"
import { OrchestraPullRequest } from "@/pages/session/orchestra-pull-request"
import { downloadText } from "@/pages/session/orchestra-pull-request-data"
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
      const patches = await Promise.all(
        diffs().map(async (diff) => {
          if (!reviewDiffNeedsLoad(diff)) return diff.patch ?? ""
          const loaded = await props.loadDiff?.(diff.file, props.diffVersion).catch(() => undefined)
          return loaded?.patch ?? diff.patch ?? ""
        }),
      ).finally(() => setExporting(false))
      const text = patches.filter((patch) => patch.trim()).join("\n")
      if (!text) {
        showToast({ title: language.t("orchestra.chat.exportDiffEmpty") })
        return
      }
      downloadText(`${layout.params.id ?? "changes"}.diff`, text.endsWith("\n") ? text : text + "\n", "text/x-diff")
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
          <div data-slot="orchestra-review-views">
            <button type="button" aria-current="page" data-active="">
              {language.t("orchestra.chat.filesChanged", { count: diffs().length })}
            </button>
            <button type="button" onClick={showAllFiles}>
              {language.t("orchestra.chat.allFiles")}
            </button>
          </div>
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
