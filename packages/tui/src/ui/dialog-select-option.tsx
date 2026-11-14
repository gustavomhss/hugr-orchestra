import { TextAttributes } from "@opentui/core"
import { createMemo, Show, type JSX } from "solid-js"
import { useTheme, selectedForeground } from "../context/theme"
import { Locale } from "../util/locale"

export function Option(props: {
  title: string
  titleView?: JSX.Element
  description?: string
  active?: boolean
  current?: boolean
  muted?: boolean
  footer?: JSX.Element | string
  titleWidth?: number
  truncateTitle?: boolean | "left"
  gutter?: () => JSX.Element
  disabled?: boolean
  onMouseOver?: () => void
}) {
  const { theme } = useTheme()
  const fg = selectedForeground(theme)
  const text = createMemo(() => {
    if (props.disabled) return theme.textMuted
    if (props.active && !props.muted) return fg
    if (props.muted && (props.active || props.current)) return theme.textMuted
    if (props.current) return theme.primary
    return theme.text
  })

  return (
    <>
      <Show when={props.current && !props.gutter}>
        <text flexShrink={0} fg={text()} marginRight={0}>
          ●
        </text>
      </Show>
      <Show when={props.gutter}>
        <box flexShrink={0} marginRight={0}>
          {props.gutter?.()}
        </box>
      </Show>
      <text
        flexGrow={1}
        fg={text()}
        attributes={props.active && !props.muted ? TextAttributes.BOLD : undefined}
        overflow="hidden"
        wrapMode="none"
        paddingLeft={3}
      >
        {props.titleView ??
          (props.truncateTitle === false
            ? props.title
            : props.truncateTitle === "left"
              ? Locale.truncateLeft(props.title, props.titleWidth ?? 61)
              : Locale.truncate(props.title, props.titleWidth ?? 61))}
        <Show when={props.description}>
          <span style={{ fg: props.active && !props.muted ? fg : theme.textMuted }}> {props.description}</span>
        </Show>
      </text>
      <Show when={props.footer}>
        <box flexShrink={0}>
          <text fg={props.active && !props.muted ? fg : theme.textMuted}>{props.footer}</text>
        </box>
      </Show>
    </>
  )
}
