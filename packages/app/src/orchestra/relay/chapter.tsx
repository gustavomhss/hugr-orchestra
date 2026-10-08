import { getFilename } from "@orchestra/core/util/path"
import { useLocation, useNavigate } from "@solidjs/router"
import { createEffect, createMemo, Match, on, onCleanup, Switch } from "solid-js"
import { useGlobal } from "@/context/global"
import { ServerConnection } from "@/context/server"
import { displayName } from "@/pages/layout/helpers"
import { pathKey } from "@/utils/path-key"
import { sessionHref } from "@/utils/session-route"
import type { ChapterPageProps } from "../chapter-route"
import { MxPage } from "../chapters/kit"
import "../chapters/kit.css"
import { setCrumbTrail } from "../crumbs"
import type { RelayKind } from "./client"
import { Editor } from "./editor"
import { HookLibrary } from "./hook-library"
import { WorkflowLibrary } from "./library"
import { chapterOf, parseRelayRoute } from "./route"
import { createRelaySource } from "./source"
import { useRelayCopy } from "./ui"
import "./relay.css"

// The Workflows and Hooks chapters: one library, one editor, every view and layer on its own URL.
export function RelayChapter(props: ChapterPageProps & { kind: RelayKind }) {
  const copy = useRelayCopy()
  const global = useGlobal()
  const location = useLocation()
  const navigate = useNavigate()
  const source = createRelaySource({ server: props.server, directory: props.directory, kind: props.kind })
  const prefix = `/orchestra/${chapterOf(props.kind)}`
  const route = createMemo(() =>
    parseRelayRoute(props.kind, location.pathname.startsWith(prefix) ? location.pathname.slice(prefix.length) : ""),
  )
  const profile = createMemo(() => {
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
  // Closing a layer goes back when the layer was opened from that view, and replaces the entry otherwise, so
  // Escape never leaves the page and back never reopens a closed layer.
  const history = { previous: "", current: location.pathname }
  createEffect(
    on(
      () => location.pathname,
      (path) => {
        history.previous = history.current
        history.current = path
      },
      { defer: true },
    ),
  )
  const go = (path: string, replace?: boolean) => navigate(path, { replace })
  const close = (path: string) => {
    if (history.previous === path) return window.history.back()
    navigate(path, { replace: true })
  }
  createEffect(() => {
    const current = route()
    if (current.page === "library")
      setCrumbTrail(
        current.tab === "runs"
          ? [copy.t(props.kind === "workflow" ? "orchestra.workflows.tab.runs" : "orchestra.hooks.tab.activity")]
          : [],
      )
  })
  onCleanup(() => setCrumbTrail([]))
  const unsupported = () => !source.supported()
  const library = () => {
    const current = route()
    return current.page === "library" ? current : undefined
  }
  const editor = () => {
    const current = route()
    return current.page === "editor" ? current : undefined
  }

  return (
    <div
      class="wf-scope"
      data-relay={props.kind}
      style={{ display: "flex", "flex-direction": "column", flex: "1", "min-height": "0" }}
    >
      <Switch>
        <Match when={unsupported()}>
          <MxPage
            id={`orchestra-${chapterOf(props.kind)}`}
            eyebrow={copy.t("orchestra.workflows.eyebrow", { profile: profile() })}
            title={copy.t(props.kind === "workflow" ? "orchestra.workflows.title" : "orchestra.hooks.title")}
            description={copy.t(
              props.kind === "workflow" ? "orchestra.workflows.description" : "orchestra.hooks.description",
            )}
          >
            <p class="mx-empty" role="status" data-slot="relay-unsupported">
              {copy.t(props.kind === "workflow" ? "orchestra.workflows.unsupported" : "orchestra.hooks.unsupported")}
            </p>
          </MxPage>
        </Match>
        <Match when={library()}>
          {(current) =>
            props.kind === "workflow" ? (
              <WorkflowLibrary source={source} route={current()} profile={profile()} go={go} close={close} />
            ) : (
              <HookLibrary source={source} route={current()} profile={profile()} go={go} close={close} />
            )
          }
        </Match>
        <Match when={editor()}>
          {(current) => (
            <Editor
              source={source}
              directory={props.directory}
              route={current()}
              profile={profile()}
              go={go}
              close={close}
              crumbs={setCrumbTrail}
              openSession={(sessionID) => navigate(sessionHref(ServerConnection.key(props.server), sessionID))}
            />
          )}
        </Match>
      </Switch>
    </div>
  )
}
