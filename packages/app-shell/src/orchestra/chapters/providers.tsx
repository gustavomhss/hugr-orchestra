import { useLocation, useNavigate } from "@solidjs/router"
import { Show } from "solid-js"
import { useSettingsDialog } from "@/components/settings-dialog"
import { useLanguage } from "@/context/language"
import { ModelsProvider } from "@/context/models"
import type { ChapterPageProps } from "@/orchestra/chapter-route"
import type { ClaudeModeIntent } from "@/orchestra/claude-mode-entry"
import { MxPage } from "./kit"
import { ProviderList } from "./providers-list"

export default function ProvidersPage(props: ChapterPageProps) {
  return (
    <ModelsProvider directory={() => props.directory || null}>
      <ProvidersScreen {...props} />
    </ModelsProvider>
  )
}

function ProvidersScreen(props: ChapterPageProps) {
  const language = useLanguage()
  const navigate = useNavigate()
  // Opened from a task (Home, a session): a way back to it once setup is done.
  const returnTo = (useLocation().state as ClaudeModeIntent | undefined)?.returnTo
  // The mock's Models action opens Settings › Models; this page's ModelsProvider backs that panel.
  const openModels = useSettingsDialog("models")
  // The Models panel is scoped to a project, so it needs one.
  return (
    <ProviderList
      server={props.server}
      directory={props.directory}
      onModels={props.directory ? openModels : undefined}
    >
      {(list) => (
        <MxPage
          id="orchestra-providers"
          eyebrow={language.t("orchestra.providers.eyebrow", { profile: list.profile() })}
          title={language.t("orchestra.nav.providers")}
          description={language.t("orchestra.providers.description")}
          action={
            <>
              {list.connect}
              <Show when={returnTo}>
                {(path) => (
                  <button type="button" class="mx-btn" onClick={() => navigate(path())}>
                    {language.t("orchestra.providers.back")}
                  </button>
                )}
              </Show>
            </>
          }
        >
          {list.body}
        </MxPage>
      )}
    </ProviderList>
  )
}
