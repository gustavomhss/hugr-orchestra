import { createMediaQuery } from "@solid-primitives/media"
import { batch, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import type { Platform } from "@/context/platform"
import {
  clampSessionPanelWidth,
  SESSION_PANEL_WIDTH_MIN,
  sessionPanelWidthMax,
} from "@/pages/session/session-panel-width"
import { Persist, persisted } from "@/utils/persist"
import type { ServerScope } from "@/utils/server-scope"

export function createOrchestraPanelSizing(input: {
  scope: ServerScope
  platform: Platform
  newSessionDesign: () => boolean
  isDesktop: () => boolean
  reviewOpen: () => boolean
  sidePanelOpen: () => boolean
  resizeOpen: () => boolean
  splitReview: () => boolean
  rowWidth: () => number | undefined
  width: () => number
  fileTreeWidth: () => number
  resize: (width: number) => void
}) {
  const compactReview = createMediaQuery("(max-width: 1180px)")
  const orchestraDesktop = createMemo(() => input.newSessionDesign() && input.isDesktop())
  const [panelSizing, setPanelSizing] = persisted(
    Persist.serverGlobal(input.scope, "orchestra-session-panel"),
    createStore({ resized: false }),
    input.platform,
  )
  // The observer reports the content-box width, which already excludes the row
  // padding; only the flex gap between the panels remains to subtract.
  const available = createMemo(() => {
    const width = input.rowWidth()
    if (width === undefined) return undefined
    return width - (orchestraDesktop() ? 6 : input.newSessionDesign() ? 8 : 0)
  })
  const max = createMemo(() => {
    const width = available()
    if (width === undefined) return 1000
    if (input.reviewOpen()) return Math.max(SESSION_PANEL_WIDTH_MIN, width - (compactReview() ? 360 : 430))
    return sessionPanelWidthMax({ available: width, split: input.splitReview() })
  })
  // Clamp at render time so window or sidebar resizes squeeze the chat panel
  // instead of the review pane, without overwriting the persisted width.
  const resizedWidth = createMemo(() => {
    const width = input.width()
    const measured = available()
    if (!input.reviewOpen()) return clampSessionPanelWidth({ width, available: measured, split: input.splitReview() })
    if (measured === undefined) return width
    // Legacy layout stored 600px for both the default and an explicit resize.
    // Keep custom widths; the marker also preserves future explicit 600px resizes.
    const selected = panelSizing.resized || width !== 600 ? width : measured - (compactReview() ? 360 : 430)
    return Math.max(SESSION_PANEL_WIDTH_MIN, Math.min(selected, max()))
  })
  const width = createMemo(() => {
    if (!input.sidePanelOpen()) return "100%"
    if (input.resizeOpen()) return `${resizedWidth()}px`
    if (orchestraDesktop()) return `calc(100% - ${Math.max(240, input.fileTreeWidth()) + 6}px)`
    return `calc(100% - ${input.fileTreeWidth()}px)`
  })

  return {
    desktop: orchestraDesktop,
    max,
    resizedWidth,
    width,
    resize: (width: number) => {
      batch(() => {
        if (input.reviewOpen()) setPanelSizing("resized", true)
        input.resize(width)
      })
    },
  }
}
