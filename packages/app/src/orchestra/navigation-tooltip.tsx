import { Tooltip } from "@kobalte/core/tooltip"
import { createEffect, createSignal, type JSX } from "solid-js"
import { useLanguage } from "@/context/language"
import "@opencode-ai/ui/v2/tooltip-v2.css"

// Compose the primitive with the actual button so it owns focus, hover and Escape
// together, and its accessible description reaches the keyboard target. Expanded
// navigation shows every label, so only icon-only (compact) triggers get a tooltip.
export function OrchestraNavigationTooltip(props: {
  compact: boolean
  value: string
  children: (trigger: typeof Tooltip.Trigger) => JSX.Element
}) {
  const language = useLanguage()
  const [open, setOpen] = createSignal(false)
  // `disabled` only stops opening; also close a tooltip that was open when the rail expanded.
  createEffect(() => {
    if (!props.compact) setOpen(false)
  })
  return (
    <Tooltip
      open={open()}
      onOpenChange={setOpen}
      disabled={!props.compact}
      placement={language.direction() === "rtl" ? "left" : "right"}
      gutter={4}
      openDelay={400}
      closeDelay={0}
      ignoreSafeArea
    >
      {props.children(Tooltip.Trigger)}
      <Tooltip.Portal>
        <Tooltip.Content data-component="tooltip-v2">
          <bdi>{props.value}</bdi>
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip>
  )
}
