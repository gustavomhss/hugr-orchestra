import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Tag } from "@opencode-ai/ui/v2/badge-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { type Accessor, type Component, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { DialogCustomProvider } from "../dialog-custom-provider"
import { createProviderSettingsController, providerIdentity } from "./provider-controller"
import { SettingsListV2 } from "./parts/list"
import "./settings-v2.css"

const PROVIDER_ICON_SIZE = 16

export const SettingsProvidersV2: Component<{
  directory: Accessor<string | undefined>
  onBack?: () => void
}> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()
  const controller = createProviderSettingsController({ directory: props.directory, onBack: props.onBack })

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">{language.t("settings.providers.title")}</h2>
      </div>

      <div class="settings-v2-tab-body settings-v2-providers">
        <div class="settings-v2-section" data-component="connected-providers-section">
          <h3 class="settings-v2-section-title">{language.t("settings.providers.section.connected")}</h3>
          <SettingsListV2>
            <Show
              when={controller.connected().length > 0}
              fallback={
                <div class="settings-v2-provider-empty">{language.t("settings.providers.connected.empty")}</div>
              }
            >
              <For each={controller.connected()}>
                {(item) => {
                  const identity = providerIdentity(item.id)
                  return (
                    <div class="settings-v2-provider-row group">
                      <div class="settings-v2-provider-lead">
                        <ProviderIcon
                          id={identity.baseID}
                          width={PROVIDER_ICON_SIZE}
                          height={PROVIDER_ICON_SIZE}
                          class="settings-v2-provider-icon shrink-0"
                        />
                        <div class="settings-v2-provider-main">
                          <span class="settings-v2-provider-name truncate">{item.name}</span>
                          <Tag>{controller.type(item)}</Tag>
                        </div>
                      </div>
                      <div class="flex items-center gap-2">
                        <Show
                          when={identity.credentialID}
                          fallback={
                            <Show
                              when={controller.canDisconnect(item)}
                              fallback={
                                <span class="settings-v2-provider-env-hint">
                                  {language.t("settings.providers.connected.environmentDescription")}
                                </span>
                              }
                            >
                              <ButtonV2
                                size="normal"
                                variant="ghost-muted"
                                onClick={() => void controller.disconnect(item.id, item.name)}
                              >
                                {language.t("common.disconnect")}
                              </ButtonV2>
                            </Show>
                          }
                        >
                          {(id) => (
                            <ButtonV2
                              size="normal"
                              variant="ghost-muted"
                              onClick={() => void controller.removeKey(id(), item.name)}
                            >
                              {language.t("common.remove")}
                            </ButtonV2>
                          )}
                        </Show>
                        <ButtonV2
                          size="normal"
                          variant="neutral"
                          icon="plus"
                          onClick={() => controller.connect(identity.baseID)}
                        >
                          {language.t("settings.providers.addKey")}
                        </ButtonV2>
                      </div>
                    </div>
                  )
                }}
              </For>
            </Show>
          </SettingsListV2>
        </div>

        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.providers.section.popular")}</h3>
          <SettingsListV2>
            <For each={controller.popular()}>
              {(item) => (
                <div class="settings-v2-provider-row">
                  <div class="settings-v2-provider-lead">
                    <ProviderIcon
                      id={item.id}
                      width={PROVIDER_ICON_SIZE}
                      height={PROVIDER_ICON_SIZE}
                      class="settings-v2-provider-icon shrink-0"
                    />
                    <div class="settings-v2-provider-copy">
                      <div class="settings-v2-provider-main">
                        <span class="settings-v2-provider-name">{item.name}</span>
                        <Show when={item.id === "opencode" || item.id === "opencode-go"}>
                          <Tag>{language.t("dialog.provider.tag.recommended")}</Tag>
                        </Show>
                      </div>
                      <Show when={controller.note(item.id)}>
                        {(key) => <p class="settings-v2-provider-description">{language.t(key())}</p>}
                      </Show>
                    </div>
                  </div>
                  <ButtonV2 size="normal" variant="neutral" icon="plus" onClick={() => controller.connect(item.id)}>
                    {language.t("common.connect")}
                  </ButtonV2>
                </div>
              )}
            </For>

            <Show when={controller.protocol() === "v1"}>
              <div class="settings-v2-provider-row" data-component="custom-provider-section">
                <div class="settings-v2-provider-lead">
                  <ProviderIcon
                    id="synthetic"
                    width={PROVIDER_ICON_SIZE}
                    height={PROVIDER_ICON_SIZE}
                    class="settings-v2-provider-icon shrink-0"
                  />
                  <div class="settings-v2-provider-copy">
                    <div class="settings-v2-provider-main">
                      <span class="settings-v2-provider-name">{language.t("provider.custom.title")}</span>
                      <Tag>{language.t("settings.providers.tag.custom")}</Tag>
                    </div>
                    <p class="settings-v2-provider-description">
                      {language.t("settings.providers.custom.description")}
                    </p>
                  </div>
                </div>
                <ButtonV2
                  size="normal"
                  variant="neutral"
                  icon="plus"
                  onClick={() => {
                    dialog.show(() => <DialogCustomProvider onBack={dialog.close} />)
                  }}
                >
                  {language.t("common.connect")}
                </ButtonV2>
              </div>
            </Show>
          </SettingsListV2>

          <button type="button" class="settings-v2-providers-view-all" onClick={() => controller.connect()}>
            {language.t("dialog.provider.viewAll")}
          </button>
        </div>
      </div>
    </>
  )
}
