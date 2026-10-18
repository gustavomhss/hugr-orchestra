import { getFilename } from "@orchestra/core/util/path"
import { createMemo } from "solid-js"
import { useGlobal } from "@/context/global"
import { useLanguage } from "@/context/language"
import { serverName } from "@/context/server"
import { displayName } from "@/pages/layout/helpers"
import { pathKey } from "@/utils/path-key"
import type { ChapterPageProps } from "../chapter-route"
import { MxPage } from "./kit"
import { ShortcutsEditor, ShortcutsReset } from "./shortcuts-editor"

export default function ShortcutsPage(props: ChapterPageProps) {
  const language = useLanguage()
  const global = useGlobal()
  const profile = createMemo(() => {
    // Shortcuts are server-wide; without a project the page names the server.
    if (!props.directory) return serverName(props.server)
    const directory = pathKey(props.directory)
    const project = global
      .ensureServerCtx(props.server)
      .projects.list()
      .find(
        (item) =>
          pathKey(item.worktree) === directory || item.sandboxes?.some((sandbox) => pathKey(sandbox) === directory),
      )
    return project ? displayName(project) : getFilename(props.directory) || props.directory
  })

  return (
    <MxPage
      id="orchestra-shortcuts"
      // The kit's eyebrow is text; FSI/PDI isolate the profile name exactly as <bdi> does.
      eyebrow={language.t("orchestra.shortcuts.eyebrow", { profile: `⁨${profile()}⁩` })}
      title={language.t("orchestra.shortcuts.title")}
      description={language.t("orchestra.shortcuts.description")}
      action={<ShortcutsReset />}
    >
      <ShortcutsEditor
        badge={
          <span class="mx-badge">
            <bdi>{profile()}</bdi>
          </span>
        }
      />
    </MxPage>
  )
}
