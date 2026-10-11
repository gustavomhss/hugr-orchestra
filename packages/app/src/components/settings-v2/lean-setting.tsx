import { Show } from "solid-js"
import { Switch } from "@orchestra/ui/v2/switch-v2"
import { useLanguage } from "@/context/language"
import { showToast } from "@/utils/toast"
import type { createLeanSettingsController } from "./general-controllers"
import { SettingsRowV2 } from "./parts/row"

type Props = { controller: ReturnType<typeof createLeanSettingsController> }

export function LeanSettingControl(props: Props) {
  const language = useLanguage()
  return (
    <div class="flex items-center gap-3" data-action="settings-lean">
      <Show when={props.controller.failed()}><span role="alert">{language.t("lean.settings.failed")}</span></Show>
      <Show when={props.controller.pending()}><span role="status">{language.t("lean.settings.saving")}</span></Show>
      <Show when={props.controller.editable()} fallback={<span role="status">{language.t("lean.settings.unavailable")}</span>}>
        <Switch checked={props.controller.enabled()} disabled={props.controller.pending()} hideLabel
          onChange={(checked) => void props.controller.set(checked).catch((error) => showToast({
            variant: "error", title: language.t("lean.settings.failed"),
            description: error instanceof Error ? error.message : language.t("lean.settings.failed"),
          }))}>
          {language.t("lean.settings.title")}
        </Switch>
      </Show>
    </div>
  )
}

export function LeanSetting(props: Props) {
  const language = useLanguage()
  return <SettingsRowV2 title={language.t("lean.settings.title")} description={language.t("lean.settings.description")}>
    <LeanSettingControl controller={props.controller} />
  </SettingsRowV2>
}
