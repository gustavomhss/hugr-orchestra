import { ButtonV2 } from "@orchestra/ui/v2/button-v2"
import { Show } from "solid-js"
import { useLanguage } from "@/context/language"
import type { ServerConnection } from "@/context/server"
import { createHomeController } from "@/pages/home/home-controller"

// A chapter that belongs to a project renders this when none is selected. It is its own module (loaded
// lazily by chapter-route) so the route does not pull in the project picker until it is needed.
export default function ChapterEmpty(props: { server: ServerConnection.Any | undefined }) {
  const language = useLanguage()
  const home = createHomeController()

  return (
    <div
      data-slot="orchestra-chapter-empty"
      class="m-auto flex max-w-[320px] flex-col items-center gap-3 rounded-[10px] border border-v2-border-border-base p-6 text-center"
    >
      <p class="text-v2-text-text-muted">{language.t("orchestra.profile.empty")}</p>
      <Show when={props.server}>
        {(conn) => (
          <ButtonV2 variant="contrast" icon="plus" onClick={() => home.project.choose(conn())}>
            {language.t("command.project.open")}
          </ButtonV2>
        )}
      </Show>
    </div>
  )
}
