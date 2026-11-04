import { createPromptProjectController } from "@/components/prompt-project-selector"
import { useTitlebarRightMount } from "@/components/titlebar"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { ServerConnection, useServer } from "@/context/server"
import { useSettings } from "@/context/settings"
import { SessionCrumbs } from "@/orchestra/crumbs"
import { displayName } from "@/pages/layout/helpers"
import { useNavigate } from "@solidjs/router"
import { createEffect, createResource } from "solid-js"
import { createNewSessionDraftController } from "./new-session/new-session-draft-controller"
import { settleNewSessionReady } from "./new-session/new-session-ready"
import { NewSessionStatus, NewSessionView } from "./new-session/new-session-view"
import { createNewSessionWorkspaceController } from "./new-session/new-session-workspace-controller"
import { useNewSessionCommands } from "./new-session/use-new-session-commands"

/** The draft-only V2 session page. Submitting promotes the draft into a real session. */
export default function NewSessionPage() {
  const settings = useSettings()
  const language = useLanguage()
  const layout = useLayout()
  const server = useServer()
  const navigate = useNavigate()
  const rightMount = useTitlebarRightMount()
  const workspace = createNewSessionWorkspaceController()
  const draft = createNewSessionDraftController({
    worktree: workspace.selection.value,
    resetWorktree: workspace.selection.reset,
  })
  const project = createPromptProjectController({
    controls: draft.project.controls,
    onDone: draft.input.restoreFocus,
  })
  // The titlebar's breadcrumb links the project back to Home with that project selected.
  const crumbProject = () => {
    const selected = project.selected()
    if (!selected) return
    return {
      label: displayName(selected),
      onSelect: () => {
        layout.home.setSelection({
          server: selected.server ? ServerConnection.Key.make(selected.server.key) : server.key,
          directory: selected.worktree,
        })
        navigate("/")
      },
    }
  }
  useNewSessionCommands({
    restoreFocus: draft.input.restoreFocus,
    project: {
      empty: project.empty,
      open: () => project.setOpen(true),
    },
  })
  createEffect(() => {
    if (!draft.prompt.ready()) return
    draft.input.restoreFocus()
  })
  const ready = Promise.resolve()
  const [suspendUntilPromptReady] = createResource(
    () => Promise.all([draft.prompt.readyPromise() ?? ready, workspace.ready.promise ?? ready]),
    (promise) =>
      settleNewSessionReady(promise, (error) => console.error("Failed to load the new session's stored state", error)),
  )

  return (
    <div data-session-layout="surface" data-session-kind="new" class="relative size-full overflow-hidden flex flex-col">
      {suspendUntilPromptReady()}
      <SessionCrumbs project={crumbProject()} title={language.t("command.session.new")} />
      <NewSessionStatus mount={rightMount} visible={settings.general.showStatus} />
      <div data-session-layout="panel-row" class="flex-1 min-h-0 flex flex-col gap-2 p-2">
        <NewSessionView input={draft.input} project={project} workspace={workspace} />
      </div>
    </div>
  )
}
