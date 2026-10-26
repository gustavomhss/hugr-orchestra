import { useLanguage } from "@/context/language"
import type { ServerConnection } from "@/context/server"
import { createHomeController } from "@/pages/home/home-controller"
import { Icon } from "../actions/components"
import "./kit.css"

// A chapter that needs a git repository renders this when the open folder has none. The one next step the app
// offers today is opening another folder; there is no action that initializes a repository.
export function NoRepository(props: { server: ServerConnection.Any; title: string; hint: string }) {
  const language = useLanguage()
  const home = createHomeController()

  return (
    <div class="mx-empty" role="status" data-slot="orchestra-no-repository">
      <span class="mx-mark" aria-hidden="true">
        <Icon name="branch" />
      </span>
      <strong>{props.title}</strong>
      <p>{props.hint}</p>
      <button type="button" class="mx-btn primary" onClick={() => home.project.choose(props.server)}>
        {language.t("command.project.open")}
      </button>
    </div>
  )
}
