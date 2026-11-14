export * as PromptSupport from "./support"

import { RGBA } from "@opentui/core"
import type { JSX } from "@opentui/solid"
import { fileURLToPath } from "url"
import type { EditorSelection } from "../../context/editor"
import type { PromptInfo } from "../../prompt/history"

export type PromptProps = {
  sessionID?: string
  visible?: boolean
  disabled?: boolean
  onSubmit?: () => void
  ref?: (ref: PromptRef | undefined) => void
  hint?: JSX.Element
  right?: JSX.Element
  showPlaceholder?: boolean
  placeholders?: {
    normal?: string[]
    shell?: string[]
  }
}

export function pastedFilepath(value: string, platform: string) {
  const raw = value.replace(/^['"]+|['"]+$/g, "")
  if (raw.startsWith("file://")) {
    try {
      return fileURLToPath(raw)
    } catch {}
  }
  if (platform === "win32") return raw
  return raw.replace(/\\(.)/g, "$1")
}

export type PromptRef = {
  focused: boolean
  current: PromptInfo
  set(prompt: PromptInfo): void
  reset(): void
  blur(): void
  focus(): void
  submit(): void
}

export const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

export const DRAFT_RETENTION_MIN_CHARS = 20

export function randomIndex(count: number) {
  if (count <= 0) return 0
  return Math.floor(Math.random() * count)
}

export function fadeColor(color: RGBA, alpha: number) {
  return RGBA.fromValues(color.r, color.g, color.b, color.a * alpha)
}

export function hasEditorRangeSelection(selection: EditorSelection["ranges"][number]) {
  return (
    selection.selection.start.line !== selection.selection.end.line ||
    selection.selection.start.character !== selection.selection.end.character
  )
}

export function getEditorRangeLabel(selection: EditorSelection["ranges"][number]) {
  if (!hasEditorRangeSelection(selection)) return
  if (selection.selection.start.line === selection.selection.end.line) return `#${selection.selection.start.line}`
  return `#${selection.selection.start.line}-${selection.selection.end.line}`
}

export function formatEditorContext(selection: EditorSelection) {
  const selected = selection.ranges.filter(hasEditorRangeSelection)
  if (selected.length === 0)
    return `<system-reminder>Note: The user opened the file "${selection.filePath}". This may or may not be relevant to the current task.</system-reminder>\n`

  const ranges = selected.map((range, index) => {
    const prefix = selected.length > 1 ? `Selection ${index + 1}: ` : ""
    return `Note: The user selected ${prefix}${getEditorRangeLabel(range)} from "${selection.filePath}". \`\`\`${range.text}\`\`\`\n\n`
  })

  return `<system-reminder>${ranges.join("\n")} This may or may not be relevant to the current task.</system-reminder>\n`
}
