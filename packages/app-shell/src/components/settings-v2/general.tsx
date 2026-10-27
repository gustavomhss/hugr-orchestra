import { Component, Show, createMemo, createResource, createSignal } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { ButtonV2 } from "@orchestra/ui/v2/button-v2"
import { SelectV2 } from "@orchestra/ui/v2/select-v2"
import { Switch } from "@orchestra/ui/v2/switch-v2"
import { TextInputV2 } from "@orchestra/ui/v2/text-input-v2"
import { useLanguage } from "@/context/language"
import { usePlatform, type LiveSeatPlatform } from "@/context/platform"
import { useFlight } from "@/orchestra/chapters/flight-engineer/run"
import { showToast } from "@/utils/toast"
import { useUpdaterAction } from "../updater-action"
import { useSettings } from "@/context/settings"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import { PalettePicker } from "@/orchestra/palette/picker"
import { WallpaperDim, WallpaperPicker } from "@/orchestra/wallpaper/picker"
import {
  createAppearanceSettingsController,
  createPermissionScopeController,
  createShellOptions,
  createShellSettingsController,
  createSoundSettingsController,
  soundOptions,
  type AppearanceSettingsController,
  type PermissionScopeController,
  type ShellSettingsController,
  type SoundSettingsController,
} from "./general-controllers"
import "./settings-v2.css"

const fontSettings = {
  ui: {
    action: "settings-ui-font",
    title: "settings.general.row.uiFont.title",
    description: "settings.general.row.uiFont.description",
    font: "ui",
    input: "setUI",
  },
  code: {
    action: "settings-code-font",
    title: "settings.general.row.font.title",
    description: "settings.general.row.font.description",
    font: "code",
    input: "setCode",
  },
  terminal: {
    action: "settings-terminal-font",
    title: "settings.general.row.terminalFont.title",
    description: "settings.general.row.terminalFont.description",
    font: "terminal",
    input: "setTerminal",
  },
} as const
const soundSettings = {
  agent: {
    action: "settings-sounds-agent",
    title: "settings.general.sounds.agent.title",
    description: "settings.general.sounds.agent.description",
  },
  permissions: {
    action: "settings-sounds-permissions",
    title: "settings.general.sounds.permissions.title",
    description: "settings.general.sounds.permissions.description",
  },
  errors: {
    action: "settings-sounds-errors",
    title: "settings.general.sounds.errors.title",
    description: "settings.general.sounds.errors.description",
  },
} as const

const PermissionScopeSetting: Component<{ controller: PermissionScopeController }> = (props) => {
  const language = useLanguage()
  return (
    <SettingsRowV2
      title={language.t("command.permissions.autoaccept.enable")}
      description={language.t(
        props.controller.enabled()
          ? "orchestra.settings.general.autoAccept.description"
          : "orchestra.settings.general.autoAccept.unavailable",
      )}
    >
      <div data-action="settings-auto-accept-permissions">
        <Switch
          hideLabel
          checked={props.controller.accepting()}
          disabled={!props.controller.enabled()}
          onChange={props.controller.set}
        >
          {language.t("command.permissions.autoaccept.enable")}
        </Switch>
      </div>
    </SettingsRowV2>
  )
}

const ShellSetting: Component<{ controller: ShellSettingsController }> = (props) => {
  const language = useLanguage()
  const options = createMemo(() =>
    createShellOptions({
      shells: props.controller.shells(),
      current: props.controller.current(),
    }),
  )
  return (
    <SettingsRowV2
      title={language.t("settings.general.row.shell.title")}
      description={language.t("settings.general.row.shell.description")}
    >
      <Show
        when={!props.controller.failed()}
        fallback={
          <div class="flex items-center gap-3" role="alert" data-action="settings-shell-error">
            <span class="text-text-weak">{language.t("orchestra.settings.general.shellError")}</span>
            <ButtonV2 size="small" variant="neutral" onClick={props.controller.retry}>
              {language.t("orchestra.settings.general.shellRetry")}
            </ButtonV2>
          </div>
        }
      >
        <SelectV2
          appearance="inline"
          data-action="settings-shell"
          options={options()}
          current={options().find((option) => option.value === props.controller.current()) ?? options()[0]}
          placement="bottom-end"
          gutter={6}
          value={(option) => option.id}
          label={(option) => {
            if (option.id === "auto") return language.t("settings.general.row.shell.autoDefault")
            if (!option.terminalOnly) return option.name
            return `${option.name} (${language.t("settings.general.row.shell.terminalOnly")})`
          }}
          onSelect={(option) => option && props.controller.select(option.value)}
        />
      </Show>
    </SettingsRowV2>
  )
}

const AppearanceSection: Component<{ controller: AppearanceSettingsController }> = (props) => {
  const language = useLanguage()
  return (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{language.t("settings.general.section.appearance")}</h3>
      <SettingsListV2>
        <div data-component="settings-v2-row" data-slot="orchestra-palette-row">
          <div data-slot="settings-v2-row-copy">
            <div data-slot="settings-v2-row-title">{language.t("orchestra.settings.palette.title")}</div>
            <div data-slot="settings-v2-row-description">{language.t("orchestra.settings.palette.description")}</div>
          </div>
          <PalettePicker label={language.t("orchestra.settings.palette.title")} />
        </div>

        <div data-component="settings-v2-row" data-slot="orchestra-wallpaper-row">
          <div data-slot="settings-v2-row-copy">
            <div data-slot="settings-v2-row-title">{language.t("orchestra.settings.wallpaper.title")}</div>
            <div data-slot="settings-v2-row-description">{language.t("orchestra.settings.wallpaper.description")}</div>
          </div>
          <WallpaperPicker label={language.t("orchestra.settings.wallpaper.title")} />
          <WallpaperDim />
        </div>

        <FontSetting kind="ui" fonts={props.controller.fonts} />
        <FontSetting kind="code" fonts={props.controller.fonts} />
        <FontSetting kind="terminal" fonts={props.controller.fonts} />
      </SettingsListV2>
    </div>
  )
}

const FontSetting: Component<{
  kind: "ui" | "code" | "terminal"
  fonts: AppearanceSettingsController["fonts"]
}> = (props) => {
  const language = useLanguage()
  const config = () => fontSettings[props.kind]
  return (
    <SettingsRowV2 title={language.t(config().title)} description={language.t(config().description)}>
      <div class="w-full sm:w-[220px]">
        <TextInputV2
          data-action={config().action}
          type="text"
          appearance="base"
          value={props.fonts[config().font]().value}
          onInput={(event) => props.fonts[config().input](event.currentTarget.value)}
          placeholder={props.fonts[config().font]().placeholder}
          spellcheck={false}
          autocorrect="off"
          autocomplete="off"
          autocapitalize="off"
          aria-label={language.t(config().title)}
          style={{ "font-family": props.fonts[config().font]().family }}
        />
      </div>
    </SettingsRowV2>
  )
}

const SoundsSection: Component<{ controller: SoundSettingsController }> = (props) => {
  const language = useLanguage()
  return (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{language.t("settings.general.section.sounds")}</h3>
      <SettingsListV2>
        <SoundSetting kind="agent" channel={props.controller.agent} />
        <SoundSetting kind="permissions" channel={props.controller.permissions} />
        <SoundSetting kind="errors" channel={props.controller.errors} />
      </SettingsListV2>
    </div>
  )
}

const SoundSetting: Component<{
  kind: "agent" | "permissions" | "errors"
  channel: SoundSettingsController["agent"]
}> = (props) => {
  const language = useLanguage()
  const config = () => soundSettings[props.kind]
  return (
    <SettingsRowV2 title={language.t(config().title)} description={language.t(config().description)}>
      <SelectV2
        appearance="inline"
        data-action={config().action}
        options={soundOptions}
        current={props.channel.current()}
        value={(option) => option.id}
        label={(option) => language.t(option.label)}
        onHighlight={props.channel.highlight}
        onSelect={props.channel.select}
        placement="bottom-end"
        gutter={6}
      />
    </SettingsRowV2>
  )
}

const LanguageSetting = () => {
  const language = useLanguage()
  const options = createMemo(() =>
    language.locales.map((locale) => ({
      value: locale,
      label: language.label(locale),
    })),
  )
  return (
    <SettingsRowV2
      title={language.t("settings.general.row.language.title")}
      description={language.t("settings.general.row.language.description")}
    >
      <SelectV2
        appearance="inline"
        data-action="settings-language"
        options={options()}
        placement="bottom-end"
        gutter={6}
        current={options().find((option) => option.value === language.locale())}
        value={(option) => option.value}
        label={(option) => option.label}
        onSelect={(option) => option && language.setLocale(option.value)}
      />
    </SettingsRowV2>
  )
}

export const SettingsGeneralV2: Component<{
  sessionID?: string
}> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const settings = useSettings()
  const mobile = createMediaQuery("(max-width: 767px)")
  const updater = useUpdaterAction()
  const permissionScope = createPermissionScopeController(() => props.sessionID)
  const shell = createShellSettingsController()
  const appearance = createAppearanceSettingsController()
  const sounds = createSoundSettingsController()
  const desktop = createMemo(() => platform.platform === "desktop")

  const [pinchZoom, { mutate: setPinchZoom }] = createResource(
    () => desktop() && "getPinchZoomEnabled" in platform,
    () => Promise.resolve(platform.getPinchZoomEnabled?.() ?? false).catch(() => false),
    { initialValue: false },
  )

  const onPinchZoomChange = (checked: boolean) => {
    setPinchZoom(checked)
    const update = platform.setPinchZoomEnabled?.(checked)
    if (!update) return
    void update.catch(() => setPinchZoom(!checked))
  }

  const GeneralSection = () => (
    <div class="settings-v2-section">
      <SettingsListV2>
        <LanguageSetting />

        <PermissionScopeSetting controller={permissionScope} />

        <ShellSetting controller={shell} />

        <SettingsRowV2
          title={language.t("settings.general.row.janitor.title")}
          description={language.t("settings.general.row.janitor.description")}
        >
          <div data-action="settings-janitor">
            <Switch hideLabel checked={settings.general.janitorEnabled()} onChange={settings.general.setJanitorEnabled}>
              {language.t("settings.general.row.janitor.title")}
            </Switch>
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.row.reasoningSummaries.title")}
          description={language.t("settings.general.row.reasoningSummaries.description")}
        >
          <div data-action="settings-feed-reasoning-summaries">
            <Switch
              hideLabel
              checked={settings.general.showReasoningSummaries()}
              onChange={(checked) => settings.general.setShowReasoningSummaries(checked)}
            >
              {language.t("settings.general.row.reasoningSummaries.title")}
            </Switch>
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.row.shellToolPartsExpanded.title")}
          description={language.t("settings.general.row.shellToolPartsExpanded.description")}
        >
          <div data-action="settings-feed-shell-tool-parts-expanded">
            <Switch
              hideLabel
              checked={settings.general.shellToolPartsExpanded()}
              onChange={(checked) => settings.general.setShellToolPartsExpanded(checked)}
            >
              {language.t("settings.general.row.shellToolPartsExpanded.title")}
            </Switch>
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.row.editToolPartsExpanded.title")}
          description={language.t("settings.general.row.editToolPartsExpanded.description")}
        >
          <div data-action="settings-feed-edit-tool-parts-expanded">
            <Switch
              hideLabel
              checked={settings.general.editToolPartsExpanded()}
              onChange={(checked) => settings.general.setEditToolPartsExpanded(checked)}
            >
              {language.t("settings.general.row.editToolPartsExpanded.title")}
            </Switch>
          </div>
        </SettingsRowV2>

        <Show when={mobile() && import.meta.env.VITE_ORCHESTRA_CHANNEL !== "prod"}>
          <SettingsRowV2
            title={language.t("settings.general.row.mobileTitlebarBottom.title")}
            description={language.t("settings.general.row.mobileTitlebarBottom.description")}
          >
            <div data-action="settings-mobile-titlebar-bottom">
              <Switch
                hideLabel
                checked={settings.general.mobileTitlebarPosition() === "bottom"}
                onChange={(checked) => settings.general.setMobileTitlebarPosition(checked ? "bottom" : "top")}
              >
                {language.t("settings.general.row.mobileTitlebarBottom.title")}
              </Switch>
            </div>
          </SettingsRowV2>
        </Show>
      </SettingsListV2>
    </div>
  )

  const AdvancedSection = () => (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{language.t("settings.general.section.advanced")}</h3>

      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.general.row.showFileTree.title")}
          description={language.t("settings.general.row.showFileTree.description")}
        >
          <div data-action="settings-show-file-tree">
            <Switch
              hideLabel
              checked={settings.general.showFileTree()}
              onChange={(checked) => settings.general.setShowFileTree(checked)}
            >
              {language.t("settings.general.row.showFileTree.title")}
            </Switch>
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.row.showSearch.title")}
          description={language.t("settings.general.row.showSearch.description")}
        >
          <div data-action="settings-show-search">
            <Switch
              hideLabel
              checked={settings.general.showSearch()}
              onChange={(checked) => settings.general.setShowSearch(checked)}
            >
              {language.t("settings.general.row.showSearch.title")}
            </Switch>
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.row.showStatus.title")}
          description={language.t("settings.general.row.showStatus.description")}
        >
          <div data-action="settings-show-status">
            <Switch
              hideLabel
              checked={settings.general.showStatus()}
              onChange={(checked) => settings.general.setShowStatus(checked)}
            >
              {language.t("settings.general.row.showStatus.title")}
            </Switch>
          </div>
        </SettingsRowV2>
      </SettingsListV2>
    </div>
  )

  const NotificationsSection = () => (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{language.t("settings.general.section.notifications")}</h3>

      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.general.notifications.agent.title")}
          description={language.t("settings.general.notifications.agent.description")}
        >
          <div data-action="settings-notifications-agent">
            <Switch
              hideLabel
              checked={settings.notifications.agent()}
              onChange={(checked) => settings.notifications.setAgent(checked)}
            >
              {language.t("settings.general.notifications.agent.title")}
            </Switch>
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.notifications.permissions.title")}
          description={language.t("settings.general.notifications.permissions.description")}
        >
          <div data-action="settings-notifications-permissions">
            <Switch
              hideLabel
              checked={settings.notifications.permissions()}
              onChange={(checked) => settings.notifications.setPermissions(checked)}
            >
              {language.t("settings.general.notifications.permissions.title")}
            </Switch>
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.notifications.errors.title")}
          description={language.t("settings.general.notifications.errors.description")}
        >
          <div data-action="settings-notifications-errors">
            <Switch
              hideLabel
              checked={settings.notifications.errors()}
              onChange={(checked) => settings.notifications.setErrors(checked)}
            >
              {language.t("settings.general.notifications.errors.title")}
            </Switch>
          </div>
        </SettingsRowV2>
      </SettingsListV2>
    </div>
  )

  const UpdatesSection = () => (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{language.t("settings.general.section.updates")}</h3>

      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.updates.row.check.title")}
          description={language.t(
            updater.action().description ?? "settings.updates.row.check.description",
            updater.action().params,
          )}
        >
          <ButtonV2 size="normal" variant="neutral" disabled={!updater.action().run} onClick={() => updater.run()}>
            {language.t(updater.action().label, updater.action().params)}
          </ButtonV2>
        </SettingsRowV2>
      </SettingsListV2>
    </div>
  )

  const DisplaySection = () => (
    <Show when={desktop()}>
      <div class="settings-v2-section">
        <h3 class="settings-v2-section-title">{language.t("settings.general.section.display")}</h3>

        <SettingsListV2>
          <SettingsRowV2
            title={language.t("settings.general.row.pinchZoom.title")}
            description={language.t("settings.general.row.pinchZoom.description")}
          >
            <div data-action="settings-pinch-zoom">
              <Switch hideLabel checked={pinchZoom.latest} onChange={onPinchZoomChange}>
                {language.t("settings.general.row.pinchZoom.title")}
              </Switch>
            </div>
          </SettingsRowV2>
        </SettingsListV2>
      </div>
    </Show>
  )

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">{language.t("settings.tab.general")}</h2>
      </div>

      <div class="settings-v2-tab-body">
        <GeneralSection />

        <AppearanceSection controller={appearance} />

        <NotificationsSection />

        <SoundsSection controller={sounds} />

        <Show when={desktop() && updater.visible()}>
          <UpdatesSection />
        </Show>

        <DisplaySection />

        <Show when={desktop() && platform.liveSeat}>{(seat) => <LiveSeatSection seat={seat()} />}</Show>

        <AdvancedSection />
      </div>
    </>
  )
}

function LiveSeatSection(props: { seat: LiveSeatPlatform }) {
  const language = useLanguage()
  const [state, { mutate, refetch }] = createResource(() =>
    Promise.all([props.seat.running(), props.seat.hasTranscriptionKey(), props.seat.getContentProtection()])
      .then(([running, key, protection]) => ({ running, key, protection }))
      .catch(() => ({ running: false, key: false, protection: true })),
  )
  const [key, setKey] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const run = (work: Promise<void>) => {
    setBusy(true)
    void work.finally(() => {
      setBusy(false)
      void refetch()
    })
  }
  const flight = useFlight()
  const toggleMeeting = () => (state.latest?.running ? run(props.seat.stop()) : flight.requestStart())
  const saveKey = (value: string) =>
    run(
      props.seat
        .setTranscriptionKey(value)
        .then(() => void setKey(""))
        .catch(
          () =>
            void showToast({
              variant: "error",
              title: language.t("settings.live.key.failed"),
              description: language.t("settings.live.key.keychain"),
            }),
        ),
    )
  const setProtection = (enabled: boolean) => {
    mutate((current) => current && { ...current, protection: enabled })
    void props.seat.setContentProtection(enabled).catch(() => refetch())
  }

  return (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{language.t("settings.general.section.live")}</h3>

      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.live.meeting.title")}
          description={language.t(
            state.latest?.running ? "settings.live.meeting.running" : "settings.live.meeting.description",
          )}
        >
          <ButtonV2 size="normal" variant="neutral" disabled={busy() || !state.latest} onClick={toggleMeeting}>
            {language.t(state.latest?.running ? "live.command.stop" : "live.command.start")}
          </ButtonV2>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.live.key.title")}
          description={language.t(state.latest?.key ? "settings.live.key.saved" : "settings.live.key.missing")}
        >
          <form
            class="flex w-80 items-center gap-2"
            data-action="settings-live-key"
            onSubmit={(event) => {
              event.preventDefault()
              if (key().trim()) saveKey(key().trim())
            }}
          >
            <div class="min-w-0 flex-1">
              <TextInputV2
                type="password"
                appearance="base"
                value={key()}
                onInput={(event) => setKey(event.currentTarget.value)}
                placeholder={language.t("settings.live.key.placeholder")}
                spellcheck={false}
                autocorrect="off"
                autocomplete="off"
                autocapitalize="off"
                aria-label={language.t("settings.live.key.title")}
              />
            </div>
            <ButtonV2 type="submit" size="normal" variant="neutral" disabled={busy() || !key().trim()}>
              {language.t("settings.live.key.save")}
            </ButtonV2>
            <Show when={state.latest?.key}>
              <ButtonV2 size="normal" variant="ghost" disabled={busy()} onClick={() => saveKey("")}>
                {language.t("settings.live.key.remove")}
              </ButtonV2>
            </Show>
          </form>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.live.protection.title")}
          description={language.t("settings.live.protection.description")}
        >
          <div data-action="settings-live-protection">
            <Switch hideLabel checked={state.latest?.protection ?? true} onChange={setProtection}>
              {language.t("settings.live.protection.title")}
            </Switch>
          </div>
        </SettingsRowV2>
      </SettingsListV2>
    </div>
  )
}
