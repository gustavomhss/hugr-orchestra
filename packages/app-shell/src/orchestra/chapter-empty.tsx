import { Show } from "solid-js"
import { useLanguage } from "@/context/language"
import type { ServerConnection } from "@/context/server"
import { createHomeController } from "@/pages/home/home-controller"
import "./chapters/kit.css"

// A chapter that belongs to a project renders this when none is selected. It is its own module (loaded
// lazily by chapter-route) so the route does not pull in the project picker until it is needed.
export default function ChapterEmpty(props: { server: ServerConnection.Any | undefined }) {
  const language = useLanguage()
  const home = createHomeController()

  return (
    <div data-slot="orchestra-chapter-empty" class="mx-empty m-auto max-w-[360px]" role="status">
      <strong>{language.t("orchestra.profile.empty")}</strong>
      <p>{language.t("orchestra.profile.emptyHint")}</p>
      <Show when={props.server}>
        {(conn) => (
          <button type="button" class="mx-btn primary" onClick={() => home.project.choose(conn())}>
            {language.t("command.project.open")}
          </button>
        )}
      </Show>
    </div>
  )
}
