import { For, Match, Show, Switch, createEffect, createMemo, createSignal } from "solid-js"
import type { FileNode } from "@opencode-ai/sdk/v2"
import { Icon } from "@opencode-ai/ui/icon"
import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { Markdown } from "@opencode-ai/session-ui/markdown"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { documentationRoots, isDocument, resolveDocumentLink } from "./orchestra-evidence-docs-path"
import { useSessionLayout } from "./session-layout"

// The Dock's Docs pane: the workspace's own documentation, not a site or a search. It looks only at
// README.md and AGENTS.md at the root and lists docs/ one folder at a time, on demand. Text comes from
// the shared file reader; a document is parsed only while it is on screen.
export function OrchestraEvidenceDocs(props: {
  path?: string
  onPathChange: (path: string | undefined) => void
  onOpenFiles: (path?: string) => void
}) {
  const file = useFile()
  const language = useLanguage()
  const root = () => file.tree.state("")
  const entries = createMemo(() => documentationRoots(file.tree.children("")))

  createEffect(() => {
    const path = props.path
    if (path) void file.load(path)
    else void file.tree.list("")
  })

  return (
    <div class="orchestra-dock-local" data-pane="docs">
      <Show
        when={props.path}
        fallback={
          <Switch
            fallback={
              <ScrollView class="orchestra-dock-scroll">
                <ul class="orchestra-docs-list">
                  <For each={entries().files}>
                    {(node) => <DocumentEntry node={node} onOpen={props.onPathChange} />}
                  </For>
                  <Show when={entries().folder}>
                    {(folder) => <DocumentFolder node={folder()} onOpen={props.onPathChange} />}
                  </Show>
                </ul>
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
            <Match when={!root()?.loaded}>
              <p class="orchestra-dock-note" role="status">
                {language.t("common.loading")}
                {language.t("common.loading.ellipsis")}
              </p>
            </Match>
            <Match when={entries().files.length === 0 && !entries().folder}>
              <div class="orchestra-dock-state" role="status">
                <strong>{language.t("orchestra.dock.docs.empty")}</strong>
                <button type="button" onClick={() => props.onOpenFiles()}>
                  {language.t("orchestra.dock.openInFiles")}
                </button>
              </div>
            </Match>
          </Switch>
        }
      >
        {(path) => (
          <>
            <div class="orchestra-dock-bar">
              <button type="button" class="orchestra-dock-back" onClick={() => props.onPathChange(undefined)}>
                <Icon name="chevron-left" size="small" />
                {language.t("orchestra.dock.docs")}
              </button>
              <bdi dir="ltr" class="orchestra-dock-path" title={path()}>
                {path()}
              </bdi>
              <button type="button" class="orchestra-dock-link" onClick={() => props.onOpenFiles(path())}>
                {language.t("orchestra.dock.openInFiles")}
              </button>
            </div>
            <DocumentView path={path()} onOpen={props.onPathChange} />
          </>
        )}
      </Show>
    </div>
  )
}

function DocumentEntry(props: { node: FileNode; onOpen: (path: string) => void }) {
  return (
    <li>
      <button type="button" class="orchestra-docs-entry" onClick={() => props.onOpen(props.node.path)}>
        <Icon name="open-file" size="small" />
        <bdi dir="ltr">{props.node.name}</bdi>
      </button>
    </li>
  )
}

// A folder lists its children only once it is opened, and keeps only documents and subfolders.
function DocumentFolder(props: { node: FileNode; onOpen: (path: string) => void }) {
  const file = useFile()
  const language = useLanguage()
  const [open, setOpen] = createSignal(false)
  const children = createMemo(() =>
    file.tree.children(props.node.path).filter((node) => node.type === "directory" || isDocument(node.name)),
  )
  createEffect(() => {
    if (open()) void file.tree.list(props.node.path)
  })
  return (
    <li>
      <button type="button" class="orchestra-docs-entry" aria-expanded={open()} onClick={() => setOpen(!open())}>
        <Icon name={open() ? "chevron-down" : "chevron-right"} size="small" />
        <span>{props.node.name}</span>
      </button>
      <Show when={open()}>
        <Show when={file.tree.state(props.node.path)?.error}>
          {(error) => (
            <div class="orchestra-dock-note" role="alert">
              <span>{error()}</span>
              <button type="button" onClick={() => void file.tree.refresh(props.node.path)}>
                {language.t("orchestra.dock.retry")}
              </button>
            </div>
          )}
        </Show>
        <Show when={file.tree.state(props.node.path)?.loading}>
          <p class="orchestra-dock-note" role="status">
            {language.t("common.loading")}
          </p>
        </Show>
        <ul class="orchestra-docs-list">
          <For each={children()}>
            {(node) =>
              node.type === "directory" ? (
                <DocumentFolder node={node} onOpen={props.onOpen} />
              ) : (
                <DocumentEntry node={node} onOpen={props.onOpen} />
              )
            }
          </For>
        </ul>
      </Show>
    </li>
  )
}

function DocumentView(props: { path: string; onOpen: (path: string) => void }) {
  const file = useFile()
  const language = useLanguage()
  const platform = usePlatform()
  const { workspaceKey } = useSessionLayout()
  const state = () => file.get(props.path)
  const markdown = () => /\.md$/i.test(props.path)

  // Rendered documents never navigate the app: web links open outside, relative document links open
  // here, and everything else stays inert.
  const click = (event: MouseEvent) => {
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null
    if (!anchor) return
    event.preventDefault()
    const link = resolveDocumentLink(props.path, anchor.getAttribute("href") ?? "")
    if (link.type === "external") platform.openExternal(link.url)
    if (link.type === "document") props.onOpen(link.path)
  }

  return (
    <ScrollView class="orchestra-dock-scroll">
      <div class="orchestra-docs-document" onClick={click}>
        <Switch>
          <Match when={state()?.error}>
            {(error) => (
              <div class="orchestra-dock-note" role="alert">
                <span>{error()}</span>
                <button type="button" onClick={() => void file.load(props.path, { force: true })}>
                  {language.t("orchestra.dock.retry")}
                </button>
              </div>
            )}
          </Match>
          <Match when={state()?.content?.type === "binary"}>
            <p class="orchestra-dock-note">{language.t("session.files.binaryContent")}</p>
          </Match>
          <Match when={state()?.loaded && markdown()}>
            <Markdown text={state()?.content?.content ?? ""} cacheKey={`${workspaceKey()}:dock-doc:${props.path}`} />
          </Match>
          <Match when={state()?.loaded}>
            <pre dir="ltr">{state()?.content?.content ?? ""}</pre>
          </Match>
          <Match when={true}>
            <p class="orchestra-dock-note" role="status">
              {language.t("common.loading")}
              {language.t("common.loading.ellipsis")}
            </p>
          </Match>
        </Switch>
      </div>
    </ScrollView>
  )
}
