import { Match, Show, Switch, createEffect } from "solid-js"
import { getFilename } from "@opencode-ai/core/util/path"
import { Icon } from "@opencode-ai/ui/icon"
import { ScrollView } from "@opencode-ai/ui/scroll-view"
import FileTreeV2 from "@/components/file-tree-v2"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { SessionFileView } from "@/pages/session/file-tabs"
import { useSessionLayout } from "./session-layout"

// The Dock's Files pane: the current workspace's tree and one file, both read through the shared
// file context, so contents and listings are the same cached copies the side panel tabs use. A failed
// listing or read keeps its error; there is no placeholder tree.
export function OrchestraEvidenceFiles(props: { path?: string; onPathChange: (path: string | undefined) => void }) {
  const file = useFile()
  const language = useLanguage()
  const sdk = useSDK()
  const { tabs } = useSessionLayout()
  const root = () => file.tree.state("")

  createEffect(() => {
    const path = props.path
    if (!path) return
    const tab = file.tab(path)
    if (!tabs().all().includes(tab)) tabs().setAll([...tabs().all(), tab])
    void file.load(path)
  })

  return (
    <div class="orchestra-dock-local" data-pane="files">
      <Show
        when={props.path}
        fallback={
          <>
            <div class="orchestra-dock-bar">
              <bdi class="orchestra-dock-path" title={sdk().directory}>
                {getFilename(sdk().directory) || sdk().directory}
              </bdi>
            </div>
            <Switch
              fallback={
                <ScrollView class="orchestra-dock-scroll">
                  <FileTreeV2 onFileClick={(node) => props.onPathChange(node.path)} />
                </ScrollView>
              }
            >
              <Match when={root()?.error}>
                {(error) => (
                  <div class="orchestra-dock-note" role="alert">
                    <span>{error()}</span>
                    <button type="button" onClick={() => void file.tree.refresh("")}>
                      {language.t("orchestra.dock.retry")}
                    </button>
                  </div>
                )}
              </Match>
              <Match when={root()?.loaded && file.tree.children("").length === 0}>
                <p class="orchestra-dock-note" role="status">
                  {language.t("orchestra.dock.files.empty")}
                </p>
              </Match>
            </Switch>
          </>
        }
      >
        {(path) => (
          <>
            <div class="orchestra-dock-bar">
              <button type="button" class="orchestra-dock-back" onClick={() => props.onPathChange(undefined)}>
                <Icon name="chevron-left" size="small" />
                {language.t("session.files.all")}
              </button>
              <bdi dir="ltr" class="orchestra-dock-path" title={path()}>
                {path()}
              </bdi>
            </div>
            <div class="orchestra-dock-viewer">
              <SessionFileView tab={file.tab(path())} />
            </div>
          </>
        )}
      </Show>
    </div>
  )
}
