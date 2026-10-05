import { createMemo, For } from "solid-js"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { createKeybindSettingsController } from "../../settings-keybinds"
import { SettingsSec } from "./settings-sec"

const groupLabels = {
  General: "settings.shortcuts.group.general",
  Session: "settings.shortcuts.group.session",
  Navigation: "settings.shortcuts.group.navigation",
  "Model and agent": "settings.shortcuts.group.modelAndAgent",
  Terminal: "settings.shortcuts.group.terminal",
  Prompt: "settings.shortcuts.group.prompt",
} as const

// Every real shortcut in one table, in group order. Edit captures the next key combination;
// Escape cancels and Backspace clears, as in the Shortcuts settings panel.
export function ShortcutsSection() {
  const language = useLanguage()
  const controller = createKeybindSettingsController({ command: useCommand(), settings: useSettings() })
  const rows = createMemo(() => {
    const grouped = controller.catalog.filtered("")
    return controller.catalog.groups.flatMap((group) => (grouped.get(group) ?? []).map((id) => ({ id, group })))
  })

  return (
    <SettingsSec
      title={language.t("settings.shortcuts.title")}
      description={language.t("orchestra.settings.shortcuts.description")}
      action={
        <button type="button" class="mx-btn" onClick={controller.settings.reset}>
          {language.t("settings.shortcuts.reset.button")}
        </button>
      }
    >
      <div class="mx-table">
        <For each={rows()}>
          {(row) => (
            <div class="mx-row" data-mx-card data-keybind-row={row.id}>
              <div class="mx-grow">
                <strong>{controller.catalog.title(row.id)}</strong>
                <small>{language.t(groupLabels[row.group])}</small>
              </div>
              <kbd class="mx-badge" data-active={controller.capture.active() === row.id ? "" : undefined}>
                {controller.capture.active() === row.id
                  ? language.t("settings.shortcuts.pressKeys")
                  : controller.catalog.keybind(row.id) || language.t("settings.shortcuts.unassigned")}
              </kbd>
              <button
                type="button"
                class="mx-btn"
                data-keybind-id={row.id}
                aria-pressed={controller.capture.active() === row.id}
                aria-label={language.t("orchestra.settings.shortcuts.edit", { name: controller.catalog.title(row.id) })}
                onClick={() => controller.capture.toggle(row.id)}
              >
                {language.t("common.edit")}
              </button>
            </div>
          )}
        </For>
      </div>
    </SettingsSec>
  )
}
