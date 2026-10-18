import { Component, createSignal, onCleanup, onMount, Show, startTransition } from "solid-js"
import { Dialog } from "@orchestra/ui/dialog"
import { Tabs } from "@orchestra/ui/tabs"
import { Icon } from "@orchestra/ui/icon"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { ProviderList } from "@/orchestra/chapters/providers-list"
import { useDialog } from "@orchestra/ui/context/dialog"
import { SettingsGeneral } from "./settings-general"
import { SettingsModels } from "./settings-models"
import { SettingsServers } from "./settings-servers"
import { SettingsSec } from "./settings-v2/view/settings-sec"
import { ShortcutsSection } from "./settings-v2/view/shortcuts-section"
import "./settings-v2/settings-v2.css"

// Open legacy dialogs; Back to Providers mounts the next one before the old one cleans up.
let kitHosts = 0

export const DialogSettings: Component<{ defaultValue?: string }> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const dialog = useDialog()
  const server = useServer()
  const [tab, setTab] = createSignal(props.defaultValue ?? "general")

  // The Providers and Shortcuts tabs render the chapter list and editor, whose kit tokens body carries
  // only in the new layout; data-mx-kit lends them to this dialog and the dialogs it stacks.
  onMount(() => {
    kitHosts++
    document.body.dataset.mxKit = ""
  })
  onCleanup(() => {
    kitHosts--
    if (kitHosts === 0) delete document.body.dataset.mxKit
  })

  const showProviders = () => {
    void dialog.show(() => <DialogSettings defaultValue="providers" />)
  }

  return (
    <Dialog size="x-large" transition>
      <Tabs
        orientation="vertical"
        variant="settings"
        value={tab()}
        onChange={(value) => void startTransition(() => setTab(value))}
        class="h-full settings-dialog"
      >
        <Tabs.List>
          <div class="flex flex-col justify-between h-full w-full gap-4">
            <div class="flex flex-col gap-3 w-full pt-3">
              <div class="flex flex-col gap-3">
                <div class="flex flex-col gap-1.5">
                  <Tabs.SectionTitle>{language.t("settings.section.desktop")}</Tabs.SectionTitle>
                  <div class="flex flex-col gap-1.5 w-full">
                    <Tabs.Trigger value="general">
                      <Icon name="sliders" />
                      {language.t("settings.tab.general")}
                    </Tabs.Trigger>
                    <Tabs.Trigger value="shortcuts">
                      <Icon name="keyboard" />
                      {language.t("settings.tab.shortcuts")}
                    </Tabs.Trigger>
                    <Tabs.Trigger value="servers">
                      <Icon name="server" />
                      {language.t("status.popover.tab.servers")}
                    </Tabs.Trigger>
                  </div>
                </div>

                <div class="flex flex-col gap-1.5">
                  <Tabs.SectionTitle>{language.t("settings.section.server")}</Tabs.SectionTitle>
                  <div class="flex flex-col gap-1.5 w-full">
                    <Tabs.Trigger value="providers">
                      <Icon name="providers" />
                      {language.t("settings.providers.title")}
                    </Tabs.Trigger>
                    <Tabs.Trigger value="models">
                      <Icon name="models" />
                      {language.t("settings.models.title")}
                    </Tabs.Trigger>
                  </div>
                </div>
              </div>
            </div>
            <div class="flex flex-col gap-1 pl-1 py-1 text-12-medium text-text-weak">
              <span>{language.t("app.name.desktop")}</span>
              <span class="text-11-regular">v{platform.version}</span>
            </div>
          </div>
        </Tabs.List>
        <Tabs.Content value="general" class="no-scrollbar">
          <SettingsGeneral />
        </Tabs.Content>
        <Tabs.Content value="shortcuts" class="no-scrollbar">
          <div class="settings-v2-tab-body settings-v2-kit">
            <ShortcutsSection />
          </div>
        </Tabs.Content>
        <Tabs.Content value="servers" class="no-scrollbar">
          <SettingsServers />
        </Tabs.Content>
        <Tabs.Content value="providers" class="no-scrollbar">
          {/* The same provider list as the Providers chapter, server-wide like this dialog. */}
          <Show when={server.current}>
            {(current) => (
              <ProviderList server={current()} directory="" onBack={showProviders}>
                {(list) => (
                  <div class="settings-v2-tab-body settings-v2-kit">
                    <SettingsSec title={language.t("settings.providers.title")} action={list.connect}>
                      {list.body}
                    </SettingsSec>
                  </div>
                )}
              </ProviderList>
            )}
          </Show>
        </Tabs.Content>
        <Tabs.Content value="models" class="no-scrollbar">
          <SettingsModels />
        </Tabs.Content>
      </Tabs>
    </Dialog>
  )
}
