/** @jsxImportSource @opentui/solid */
import type { TuiPluginApi } from "@orchestra/plugin/tui"
import { Show } from "solid-js"
import { useCommandShortcut } from "../../keymap"
import { Panel } from "./diff-viewer-ui"

export function DiffViewerFooter(props: { theme: () => TuiPluginApi["theme"]["current"] }) {
  const theme = props.theme
  const switchFocusShortcut = useCommandShortcut("diff.switch_focus")
  const nextHunkShortcut = useCommandShortcut("diff.next_hunk")
  const previousHunkShortcut = useCommandShortcut("diff.previous_hunk")
  const nextFileShortcut = useCommandShortcut("diff.next_file")
  const previousFileShortcut = useCommandShortcut("diff.previous_file")
  const switchSourceShortcut = useCommandShortcut("diff.switch_source")
  const markReviewedShortcut = useCommandShortcut("diff.mark_reviewed")
  const helpShortcut = useCommandShortcut("diff.help")
  return (
    <Panel flexShrink={0} gap={2} paddingLeft={1} border="none">
      <Show when={switchFocusShortcut()}>
        {(shortcut) => (
          <text fg={theme().text}>
            {shortcut()} <span style={{ fg: theme().textMuted }}>focus file tree</span>
          </text>
        )}
      </Show>
      <Show when={nextFileShortcut()}>
        {(shortcut) => (
          <text fg={theme().text}>
            {shortcut()} <span style={{ fg: theme().textMuted }}>next file</span>
          </text>
        )}
      </Show>
      <Show when={nextHunkShortcut()}>
        {(shortcut) => (
          <text fg={theme().text}>
            {shortcut()} <span style={{ fg: theme().textMuted }}>next hunk</span>
          </text>
        )}
      </Show>
      <Show when={previousHunkShortcut()}>
        {(shortcut) => (
          <text fg={theme().text}>
            {shortcut()} <span style={{ fg: theme().textMuted }}>previous hunk</span>
          </text>
        )}
      </Show>
      <Show when={previousFileShortcut()}>
        {(shortcut) => (
          <text fg={theme().text}>
            {shortcut()} <span style={{ fg: theme().textMuted }}>previous file</span>
          </text>
        )}
      </Show>
      <Show when={switchSourceShortcut()}>
        {(shortcut) => (
          <text fg={theme().text}>
            {shortcut()} <span style={{ fg: theme().textMuted }}>switch source</span>
          </text>
        )}
      </Show>
      <Show when={markReviewedShortcut()}>
        {(shortcut) => (
          <text fg={theme().text}>
            {shortcut()} <span style={{ fg: theme().textMuted }}>mark reviewed</span>
          </text>
        )}
      </Show>
      <Show when={helpShortcut()}>
        {(shortcut) => (
          <text fg={theme().text}>
            {shortcut()} <span style={{ fg: theme().textMuted }}>all</span>
          </text>
        )}
      </Show>
    </Panel>
  )
}
