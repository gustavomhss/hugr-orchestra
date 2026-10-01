import { createMemo, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { Dynamic } from "solid-js/web"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { FileComponentProvider, useFileComponent } from "@opencode-ai/ui/context/file"
import type { FileProps } from "@opencode-ai/session-ui/file"
import { useSettings } from "@/context/settings"
import { ReviewPanelV2, type ReviewPanelV2Props } from "@/pages/session/v2/review-panel-v2"

export function createOrchestraReviewPanel() {
  const settings = useSettings()
  // Preserve explicit toolbar choices across rail tab switches without new persisted state.
  const [store, setStore] = createStore({ width: 600, selected: false })

  return function OrchestraReviewPanel(props: ReviewPanelV2Props) {
    const fileComponent = useFileComponent()
    let root!: HTMLDivElement
    const compact = createMemo(() => settings.general.newLayoutDesigns() && store.width < 600)
    const sidebarVisible = () => props.state.sidebarOpened() && (!compact() || props.state.sidebarWidth() > 0)

    onMount(() => {
      const rail = root.closest<HTMLElement>("#review-panel") ?? root
      setStore("width", rail.getBoundingClientRect().width)
      createResizeObserver(rail, ({ width }) => setStore("width", width))
    })

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
        class="h-full min-h-0"
      >
        <FileComponentProvider component={ReviewFile}>
          <ReviewPanelV2
            {...props}
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
    )
  }
}
