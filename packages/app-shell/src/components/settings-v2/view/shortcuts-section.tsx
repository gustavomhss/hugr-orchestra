import { useLanguage } from "@/context/language"
import { ShortcutsEditor, ShortcutsReset } from "@/orchestra/chapters/shortcuts-editor"
import { SettingsSec } from "./settings-sec"

// The Shortcuts chapter's editor in the routed Settings view, with and without a repository.
export function ShortcutsSection() {
  const language = useLanguage()
  return (
    <SettingsSec
      title={language.t("settings.shortcuts.title")}
      description={language.t("orchestra.settings.shortcuts.description")}
      action={<ShortcutsReset />}
    >
      <ShortcutsEditor />
    </SettingsSec>
  )
}
