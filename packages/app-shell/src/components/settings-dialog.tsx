import { onCleanup } from "solid-js"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useDialog } from "@orchestra/ui/context/dialog"

export function useSettingsDialog(defaultValue?: string) {
  const dialog = useDialog()
  const layout = useLayout()
  let run = 0
  let dead = false

  onCleanup(() => {
    dead = true
  })

  return () => {
    const current = ++run
    // The route, not router params: the shell registers this command above every route, where params are empty.
    const route = layout.route()
    const sessionID = route.type === "session" ? route.sessionId : undefined
    void import("@/components/settings-v2").then((module) => {
      if (dead || run !== current) return
      void dialog.show(() => <module.DialogSettings sessionID={sessionID} defaultValue={defaultValue} />)
    })
  }
}

export function useSettingsCommand() {
  const command = useCommand()
  const language = useLanguage()
  const show = useSettingsDialog()

  command.register("settings", () => [
    {
      id: "settings.open",
      title: language.t("command.settings.open"),
      category: language.t("command.category.settings"),
      keybind: "mod+comma",
      onSelect: show,
    },
  ])

  return show
}
