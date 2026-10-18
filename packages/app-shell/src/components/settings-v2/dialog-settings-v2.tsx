import { type Accessor, Component, createMemo, createSignal, type JSX, Show, startTransition } from "solid-js"
import { ButtonV2 } from "@orchestra/ui/v2/button-v2"
import { Dialog } from "@orchestra/ui/v2/dialog-v2"
import { TabsV2 } from "@orchestra/ui/v2/tabs-v2"
import { Icon } from "@orchestra/ui/icon"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { SettingsGeneralV2 } from "./general"
import { SettingsKeybinds } from "../settings-keybinds"
import { SettingsProvidersV2 } from "./providers"
import { SettingsModelsV2 } from "./models"
import "./settings-v2.css"
import { SettingsServersV2 } from "./servers"
import { useDialog } from "@orchestra/ui/context/dialog"
import { useLayout } from "@/context/layout"
import { useTabs } from "@/context/tabs"
import { ServerSyncProvider } from "@/context/server-sync"
import { ServerSDKProvider, useServerSDK } from "@/context/server-sdk"
import { ServerConnection, serverName } from "@/context/server"
import { useGlobal } from "@/context/global"
import { ModelsProvider } from "@/context/models"
import { settingsProviderOwner } from "@/hooks/provider-catalog"

export const DialogSettings: Component<{
  sessionID?: string
  defaultValue?: string
}> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const dialog = useDialog()
  const layout = useLayout()
  const tabs = useTabs()
  const sdk = useServerSDK()
  const global = useGlobal()
  const [tab, setTab] = createSignal(props.defaultValue ?? "general")
  const owner = createMemo(
    () => {
      const target = settingsProviderOwner(layout.route(), {
        current: ServerConnection.key(sdk().server),
        draft: (id) => {
          const draft = tabs.store.find((item) => item.type === "draft" && item.draftID === id)
          return draft?.type === "draft" ? { server: draft.server, directory: draft.directory } : undefined
        },
        session: (server, id) => {
          const connection = global.servers.list().find((item) => ServerConnection.key(item) === server)
          return connection ? global.ensureServerCtx(connection).sync.session.get(id)?.directory : undefined
        },
        home: layout.home.selection(),
      })
      const server = global.servers.list().find((item) => ServerConnection.key(item) === target.server)
      return server ? { server, directory: target.directory } : undefined
    },
    undefined,
    { equals: (a, b) => a?.server === b?.server && a?.directory === b?.directory },
  )

  function ProviderScope(props: { children: (directory: Accessor<string | null | undefined>) => JSX.Element }) {
    return (
      <Show when={owner()} keyed fallback={<p role="status">{language.t("orchestra.providers.loading")}</p>}>
        {(target) => (
          <>
            <p class="settings-v2-scope-note">
              {language.t("orchestra.settings.scope.server", { server: serverName(target.server) })}
            </p>
            <ServerSDKProvider server={() => target.server}>
              <ServerSyncProvider server={() => target.server}>
                <ModelsProvider directory={() => target.directory}>
                  {props.children(() => target.directory)}
                </ModelsProvider>
              </ServerSyncProvider>
            </ServerSDKProvider>
          </>
        )}
      </Show>
    )
  }

  const showProviders = () => {
    void dialog.show(() => <DialogSettings sessionID={props.sessionID} defaultValue="providers" />)
  }

  return (
    <Dialog size="x-large" variant="settings" class="settings-v2-dialog">
      <TabsV2
        orientation="vertical"
        variant="settings"
        value={tab()}
        onChange={(value) => void startTransition(() => setTab(value))}
        class="settings-v2"
      >
        <TabsV2.List>
          <div class="flex flex-col justify-between h-full w-full">
            <div class="flex flex-col gap-3 w-full">
              <div class="flex flex-col gap-3">
                <div class="flex flex-col gap-1.5">
                  <TabsV2.SectionTitle>{language.t("settings.section.desktop")}</TabsV2.SectionTitle>
                  <div class="flex flex-col gap-1.5 w-full">
                    <TabsV2.Trigger value="general">
                      <Icon name="sliders" />
                      {language.t("settings.tab.general")}
                    </TabsV2.Trigger>
                    <TabsV2.Trigger value="shortcuts">
                      <Icon name="keyboard" />
                      {language.t("settings.tab.shortcuts")}
                    </TabsV2.Trigger>
                  </div>
                </div>

                <div class="flex flex-col gap-1.5">
                  <TabsV2.SectionTitle>{language.t("settings.section.server")}</TabsV2.SectionTitle>
                  <div class="flex flex-col gap-1.5 w-full">
                    <TabsV2.Trigger value="servers">
                      <Icon name="server" />
                      {language.t("status.popover.tab.servers")}
                    </TabsV2.Trigger>
                    <TabsV2.Trigger value="providers">
                      <Icon name="providers" />
                      {language.t("settings.providers.title")}
                    </TabsV2.Trigger>
                    <TabsV2.Trigger value="models">
                      <Icon name="models" />
                      {language.t("settings.models.title")}
                    </TabsV2.Trigger>
                  </div>
                </div>
              </div>
            </div>
            <div class="settings-v2-nav-footer">
              <ButtonV2 variant="neutral" size="small" onClick={() => dialog.close()}>
                {language.t("common.close")}
              </ButtonV2>
              <span>{language.t("app.name.desktop")}</span>
              <span>v{platform.version}</span>
            </div>
          </div>
        </TabsV2.List>
        <TabsV2.Content value="general" class="settings-v2-panel">
          <SettingsGeneralV2 sessionID={props.sessionID} />
        </TabsV2.Content>
        <TabsV2.Content value="shortcuts" class="settings-v2-panel">
          <SettingsKeybinds v2 />
        </TabsV2.Content>
        <TabsV2.Content value="servers" class="settings-v2-panel">
          <SettingsServersV2 />
        </TabsV2.Content>
        <TabsV2.Content value="providers" class="settings-v2-panel">
          <ProviderScope>
            {(directory) => <SettingsProvidersV2 directory={directory} onBack={showProviders} />}
          </ProviderScope>
        </TabsV2.Content>
        <TabsV2.Content value="models" class="settings-v2-panel">
          <ProviderScope>
            {(directory) => (
              <SettingsModelsV2
                directory={directory}
                onConnect={() => void startTransition(() => setTab("providers"))}
              />
            )}
          </ProviderScope>
        </TabsV2.Content>
      </TabsV2>
    </Dialog>
  )
}
