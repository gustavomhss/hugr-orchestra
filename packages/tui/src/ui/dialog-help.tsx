import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "./dialog"
import { useTuiConfig } from "../config"
import { useBindings, useCommandShortcut } from "../keymap"

export function DialogHelp() {
  const dialog = useDialog()
  const { theme } = useTheme()
  const commandShortcut = useCommandShortcut("command.palette.show")
  const config = useTuiConfig()
  // These commands are only registered in some contexts, so read their configured bindings.
  const shortcut = (command: string) => config.keybinds
      .get(command)
      .map((binding) => String(binding.key))
      .join(", ")

  useBindings(() => ({
    bindings: [
      { key: "return", desc: "Close help", group: "Dialog", cmd: () => dialog.clear() },
      { key: "escape", desc: "Close help", group: "Dialog", cmd: () => dialog.clear() },
    ],
  }))

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          Help
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc/enter
        </text>
      </box>
      <box paddingBottom={1}>
        <text fg={theme.textMuted}>
          Press {commandShortcut()} to see all available actions and commands in any context.
        </text>
      </box>
      <box paddingBottom={1} gap={1}>
        <text fg={theme.textMuted}>
          Type /connect to add an AI provider. Ctrl+C clears the prompt when it has text and exits when it is empty.
        </text>
      </box>
      <box paddingBottom={1} gap={1}>
        <text fg={theme.textMuted}>
          Escape closes the open dialog first. With no dialog open it leaves autocomplete or shell mode, and otherwise
          press {shortcut("session.interrupt")} twice to interrupt a running session. Ctrl+D deletes a character in the prompt and
          exits when it is empty; delete a session from the session list with {shortcut("session.delete")}.
        </text>
        <text fg={theme.textMuted}>
          Shortcuts: {shortcut("diff.open")} diff viewer, {shortcut("mcp.list")} MCP servers, {shortcut("provider.connect")} connect provider,{" "}
          {shortcut("variant.list")} model variants, {shortcut("tips.next")} next tip on the home screen. Run "Show getting
          started" from the command palette to bring back the getting started box.
        </text>
      </box>
      <box flexDirection="row" justifyContent="flex-end" paddingBottom={1}>
        <box paddingLeft={3} paddingRight={3} backgroundColor={theme.primary} onMouseUp={() => dialog.clear()}>
          <text fg={theme.selectedListItemText}>ok</text>
        </box>
      </box>
    </box>
  )
}
