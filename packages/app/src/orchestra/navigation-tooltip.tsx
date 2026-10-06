import { Tooltip, useTooltipContext } from "@kobalte/core/tooltip"
import { createEffect, createSignal, onCleanup, type JSX } from "solid-js"
import { useLanguage } from "@/context/language"
import "@opencode-ai/ui/v2/tooltip-v2.css"

// Compose the primitive with the actual button so it owns focus, hover and Escape
// together, and its accessible description reaches the keyboard target. Expanded
// navigation shows every label, so only icon-only (compact) triggers and the WIP marks get one.
export function OrchestraNavigationTooltip(props: {
  enabled: boolean
  value: string
  children: (trigger: typeof Tooltip.Trigger) => JSX.Element
}) {
  const language = useLanguage()
  const [open, setOpen] = createSignal(false)
  // `disabled` only stops opening; also close a tooltip that was open when the rail expanded.
  createEffect(() => {
    if (!props.enabled) setOpen(false)
  })
  return (
    <Tooltip
      open={open()}
      onOpenChange={setOpen}
      disabled={!props.enabled}
      placement={language.direction() === "rtl" ? "left" : "right"}
      gutter={4}
      openDelay={400}
      closeDelay={0}
      ignoreSafeArea
    >
      <PressCancelsOpening />
      {props.children(Tooltip.Trigger)}
      <Tooltip.Portal>
        <Tooltip.Content data-component="tooltip-v2">
          <bdi>{props.value}</bdi>
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip>
  )
}

// Kobalte keeps a hover's pending open running through a click, so a pressed item showed its tooltip after the
// press, behind any modal dialog the click opened, where the closing tooltip's layer took that dialog's first Escape.
// A press cancels the pending open; the tooltip returns on the next hover or keyboard focus.
function PressCancelsOpening() {
  const context = useTooltipContext()
  const press = (event: PointerEvent) => {
    if (event.target instanceof Node && context.isTargetOnTooltip(event.target)) context.cancelOpening()
  }
  document.addEventListener("pointerdown", press, true)
  onCleanup(() => document.removeEventListener("pointerdown", press, true))
  return null
}
