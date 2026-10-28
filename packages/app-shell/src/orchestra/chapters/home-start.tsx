import { useDirectoryPicker } from "@/components/directory-picker"
import { useLanguage } from "@/context/language"
import type { ServerConnection } from "@/context/server"
import type { HomeController } from "@/pages/home/home-controller"
import { homeProjectDirectories } from "@/pages/layout/helpers"
import { CLAUDE_MODE_PATH } from "@/orchestra/claude-mode-entry"
import { showToast } from "@/utils/toast"
import { ButtonV2 } from "@orchestra/ui/v2/button-v2"
import { useNavigate } from "@solidjs/router"

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
