import { useDirectoryPicker } from "@/components/directory-picker"
import { useLanguage } from "@/context/language"
import { ServerConnection } from "@/context/server"
import { useServerSync } from "@/context/server-sync"
import { useTabs } from "@/context/tabs"
import { useProviders } from "@/hooks/use-providers"
import type { HomeController } from "@/pages/home/home-controller"
import { homeProjectDirectories } from "@/pages/layout/helpers"
import { CLAUDE_MODE_PATH } from "@/orchestra/claude-mode-entry"
import { useClaudeMode } from "@/orchestra/use-claude-mode"
import { Persist, persisted } from "@/utils/persist"
import { showToast } from "@/utils/toast"
import { ButtonV2 } from "@orchestra/ui/v2/button-v2"
import { useLocation, useNavigate } from "@solidjs/router"
import { createSignal, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { HOME_EXAMPLE_KEYS, needsModel } from "./home-start-state"

// First run, folder step. The person picks a folder and it is trusted before it becomes a project; nothing is
// created on their behalf.
export function HomeFolderStart(props: { home: HomeController }) {
  const language = useLanguage()
  const navigate = useNavigate()
  const pickDirectory = useDirectoryPicker()

  const trustAndAdd = async (conn: ServerConnection.Any, directory: string) => {
    const trusted = await props.home.server
      .context(conn)
      .sdk.orchestra["server.trust"].approve({ directory })
      .then(
        () => true,
        () => {
          showToast({ variant: "error", title: language.t("orchestra.home.start.trustFailed") })
          return false
        },
      )
    if (trusted) await props.home.project.add(conn, [directory])
  }

  const choose = () => {
    const conn = props.home.server.focused()
    if (!conn) return
    pickDirectory({
      server: conn,
      title: language.t("command.project.open"),
      multiple: false,
      onSelect: (result) => {
        const directory = homeProjectDirectories(result)[0]
        if (directory) void trustAndAdd(conn, directory)
      },
    })
  }

  return (
    <section data-component="home-start" data-step="folder" class="mx-auto flex w-full max-w-[640px] flex-col gap-4 p-8">
      <h1 class="text-2xl font-medium">{language.t("orchestra.home.start.folderTitle")}</h1>
      <p class="text-[14px] leading-relaxed text-v2-text-text-muted">{language.t("orchestra.home.start.trust")}</p>
      <div class="flex flex-wrap items-center gap-3">
        <ButtonV2 variant="contrast" icon="plus" onClick={choose}>
          {language.t("orchestra.home.start.chooseFolder")}
        </ButtonV2>
        <button
          type="button"
          class="text-[13px] text-v2-text-text-faint hover:text-v2-text-text-muted"
          onClick={() => navigate(CLAUDE_MODE_PATH)}
        >
          {language.t("orchestra.home.start.providers")}
        </button>
      </div>
    </section>
  )
}

// A selected project: the model step while no model is connected (and not skipped), then the composer.
// The KPIs are the caller's concern and show only once the project has sessions.
export function HomeProjectStart(props: { home: HomeController; directory: string; conn: ServerConnection.Any }) {
  const sync = useServerSync()
  const providers = useProviders(() => props.directory)
  const [skip, setSkip] = persisted(Persist.global("home.start"), createStore({ skipped: false }))
  const child = () => sync().child(props.directory, { bootstrap: false })[0]
  // Claude mode counts as a connected model: its engine is set only after its account is signed in.
  const connect = () =>
    needsModel({
      providersReady: child().provider_ready,
      connected: providers.paid().length > 0 || sync().data.config.agent?.maestro?.engine === "claude-code",
      skipped: skip.skipped,
    })

  return (
    <Show
      when={connect()}
      fallback={<HomeComposer home={props.home} directory={props.directory} conn={props.conn} />}
    >
      <HomeConnectStart directory={props.directory} onSkip={() => setSkip("skipped", true)} />
    </Show>
  )
}

// First run, model step: a Claude subscription or an API key. Connecting returns the person here; skipping moves on.
function HomeConnectStart(props: { directory: string; onSkip: () => void }) {
  const language = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const claudeMode = useClaudeMode(() => props.directory)

  return (
    <section data-component="home-start" data-step="connect" class="mx-auto flex w-full max-w-[640px] flex-col gap-4 p-8">
      <h1 class="text-2xl font-medium">{language.t("orchestra.home.start.connectTitle")}</h1>
      <p class="text-[14px] leading-relaxed text-v2-text-text-muted">
        {language.t("orchestra.home.start.connectDescription")}
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <ButtonV2 variant="contrast" onClick={() => void claudeMode()}>
          {language.t("orchestra.home.start.useClaude")}
        </ButtonV2>
        <ButtonV2 onClick={() => navigate(CLAUDE_MODE_PATH, { state: { returnTo: location.pathname } })}>
          {language.t("orchestra.home.start.connect")}
        </ButtonV2>
      </div>
      <div class="flex flex-wrap items-center gap-4 text-[13px] text-v2-text-text-faint">
        <button type="button" class="hover:text-v2-text-text-muted" onClick={props.onSkip}>
          {language.t("orchestra.home.start.skip")}
        </button>
        <button type="button" class="hover:text-v2-text-text-muted" onClick={() => navigate(CLAUDE_MODE_PATH)}>
          {language.t("orchestra.home.start.providers")}
        </button>
      </div>
    </section>
  )
}

// The Home composer: a prompt that opens a Maestro chat in this project. The examples fill it; the person sends.
function HomeComposer(props: { home: HomeController; directory: string; conn: ServerConnection.Any }) {
  const language = useLanguage()
  const tabs = useTabs()
  const [text, setText] = createSignal("")

  const start = () => {
    const prompt = text().trim()
    if (!prompt) return
    const ctx = props.home.server.context(props.conn)
    ctx.projects.open(props.directory)
    ctx.projects.touch(props.directory)
    void tabs.newDraft({ server: ServerConnection.key(props.conn), directory: props.directory }, prompt)
    setText("")
  }

  return (
    <section data-component="home-composer" class="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-8 pt-8">
      <h1 class="text-2xl font-medium">{language.t("orchestra.home.start.title")}</h1>
      <form
        class="flex flex-col gap-3 rounded-[10px] bg-v2-background-bg-deep p-3"
        onSubmit={(event) => {
          event.preventDefault()
          start()
        }}
      >
        <textarea
          aria-label={language.t("orchestra.home.start.placeholder")}
          placeholder={language.t("orchestra.home.start.placeholder")}
          rows={3}
          class="min-h-[72px] w-full resize-none bg-transparent text-[15px] outline-none"
          value={text()}
          onInput={(event) => setText(event.currentTarget.value)}
        />
        <div class="flex justify-end">
          <ButtonV2 type="submit" variant="contrast" disabled={!text().trim()}>
            {language.t("orchestra.home.start.send")}
          </ButtonV2>
        </div>
      </form>
      <div class="flex flex-col gap-2">
        <span class="text-[12px] text-v2-text-text-faint">{language.t("orchestra.home.start.examples")}</span>
        <div class="flex flex-wrap gap-2">
          <For each={HOME_EXAMPLE_KEYS}>
            {(key) => (
              <button
                type="button"
                class="rounded-full px-3 py-1.5 text-left text-[13px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover"
                onClick={() => setText(language.t(key))}
              >
                {language.t(key)}
              </button>
            )}
          </For>
        </div>
      </div>
    </section>
  )
}
