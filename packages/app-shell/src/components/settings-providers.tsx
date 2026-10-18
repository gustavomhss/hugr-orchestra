import { Button } from "@orchestra/ui/button"
import { ProviderIcon } from "@orchestra/ui/provider-icon"
import { Tag } from "@orchestra/ui/tag"
import { type Component, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { ProviderDiscoveryStatus } from "./dialog-connect-provider"
import { createProviderSettingsController } from "./settings-v2/provider-controller"
import { SettingsList } from "./settings-list"
import { SettingsServerPicker, SettingsServerScope } from "./settings-server-picker"

export const SettingsProviders: Component<{ onBack?: () => void }> = (props) => {
  return (
    <SettingsServerScope>
      <SettingsProvidersContent onBack={props.onBack} />
    </SettingsServerScope>
  )
}

const SettingsProvidersContent: Component<{ onBack?: () => void }> = (props) => {
  const language = useLanguage()
  const controller = createProviderSettingsController({ directory: () => null, onBack: props.onBack })

  return (
    <div class="flex flex-col h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex items-center justify-between gap-4 pt-6 pb-8 max-w-[720px]">
          <h2 class="text-16-medium text-text-strong">{language.t("settings.providers.title")}</h2>
          <SettingsServerPicker />
        </div>
      </div>

      <div class="flex flex-col gap-8 max-w-[720px]">
        <div class="flex flex-col gap-1" data-component="connected-providers-section">
          <h3 class="text-14-medium text-text-strong pb-2">{language.t("settings.providers.section.connected")}</h3>
          <SettingsList>
            <Show
              when={controller.connected().length > 0}
              fallback={
                <div class="py-4 text-14-regular text-text-weak">
                  {language.t("settings.providers.connected.empty")}
                </div>
              }
            >
              <For each={controller.connected()}>
                {(item) => (
                  <div class="group flex flex-wrap items-center justify-between gap-4 min-h-16 py-3 border-b border-border-weak-base last:border-none">
                    <div class="flex items-center gap-3 min-w-0">
                      <ProviderIcon id={item.id} class="size-5 shrink-0 icon-strong-base" />
                      <span class="text-14-medium text-text-strong truncate">{item.name}</span>
                      <Tag>{controller.type(item)}</Tag>
                    </div>
                    <Show
                      when={controller.canDisconnect(item)}
                      fallback={
                        <span class="text-14-regular text-text-base opacity-0 group-hover:opacity-100 transition-opacity duration-200 pr-3 cursor-default">
                          {controller.disconnectHint(item)}
                        </span>
                      }
                    >
                      <Button
                        size="large"
                        variant="ghost"
                        onClick={() => void controller.disconnect(item.id, item.name)}
                      >
                        {language.t("common.disconnect")}
                      </Button>
                    </Show>
                  </div>
                )}
              </For>
            </Show>
          </SettingsList>
        </div>

        <div class="flex flex-col gap-1">
          <h3 class="text-14-medium text-text-strong pb-2">{language.t("settings.providers.section.popular")}</h3>
          <ProviderDiscoveryStatus source={controller.discovery} />
          <SettingsList>
            <For each={controller.popular()}>
              {(item) => (
                <div class="flex flex-wrap items-center justify-between gap-4 min-h-16 py-3 border-b border-border-weak-base last:border-none">
                  <div class="flex flex-col min-w-0">
                    <div class="flex items-center gap-x-3">
                      <ProviderIcon id={item.id} class="size-5 shrink-0 icon-strong-base" />
                      <span class="text-14-medium text-text-strong">{item.name}</span>
                    </div>
                    <Show when={controller.note(item.id)}>
                      {(key) => <span class="text-12-regular text-text-weak pl-8">{language.t(key())}</span>}
                    </Show>
                  </div>
                  <Button
                    size="large"
                    variant="secondary"
                    icon="plus-small"
                    onClick={() => controller.connect(item.id)}
                  >
                    {language.t("common.connect")}
                  </Button>
                </div>
              )}
            </For>

            <Show when={controller.protocol() === "v1"}>
              <div
                class="flex items-center justify-between gap-4 min-h-16 border-b border-border-weak-base last:border-none flex-wrap py-3"
                data-component="custom-provider-section"
              >
                <div class="flex flex-col min-w-0">
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <ProviderIcon id="synthetic" class="size-5 shrink-0 icon-strong-base" />
                    <span class="text-14-medium text-text-strong">{language.t("provider.custom.title")}</span>
                    <Tag>{language.t("settings.providers.tag.custom")}</Tag>
                  </div>
                  <span class="text-12-regular text-text-weak pl-8">
                    {language.t("settings.providers.custom.description")}
                  </span>
                </div>
                <Button
                  size="large"
                  variant="secondary"
                  icon="plus-small"
                  onClick={controller.connectCustom}
                >
                  {language.t("common.connect")}
                </Button>
              </div>
            </Show>
          </SettingsList>

          <Button
            variant="ghost"
            class="px-0 py-0 mt-5 text-14-medium text-text-interactive-base text-left justify-start hover:bg-transparent active:bg-transparent"
            onClick={() => controller.connect()}
          >
            {language.t("dialog.provider.viewAll")}
          </Button>
        </div>
      </div>
    </div>
  )
}
