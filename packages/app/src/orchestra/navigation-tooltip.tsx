import { Tooltip } from "@kobalte/core/tooltip"
import type { JSX } from "solid-js"
import { useLanguage } from "@/context/language"
import "@opencode-ai/ui/v2/tooltip-v2.css"

// Compose the primitive with the actual button so it owns focus, hover and Escape
// together, and its accessible description reaches the keyboard target.
export function OrchestraNavigationTooltip(props: {
  value: string
  children: (trigger: typeof Tooltip.Trigger) => JSX.Element
}) {
  const language = useLanguage()
  return (
    <Tooltip
      placement={language.direction() === "rtl" ? "left" : "right"}
      gutter={4}
      openDelay={400}
      closeDelay={0}
      ignoreSafeArea
    >
      {props.children(Tooltip.Trigger)}
      <Tooltip.Portal>
        <Tooltip.Content data-component="tooltip-v2">{props.value}</Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip>
  )
}
