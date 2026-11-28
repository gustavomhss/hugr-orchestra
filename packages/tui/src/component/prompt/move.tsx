import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import path from "path"
import { useTuiPaths } from "../../context/runtime"
import { errorMessage } from "../../util/error"
import { useDialog } from "../../ui/dialog"
import { useSDK } from "../../context/sdk"
import { useSync } from "../../context/sync"
import { useToast } from "../../ui/toast"
import { DialogMoveSession, type MoveSessionSelection } from "../dialog-move-session"
import { DialogWorkspaceFileChanges } from "../dialog-workspace-file-changes"
import { useHomeSessionDestination, type HomeSessionDestination } from "../../routes/home/session-destination"
import { useProject } from "../../context/project"

function moveReminderText(directory: string) {
  return `<system-reminder>The user has changed the current working directory to "${directory}". This is still the same project but at a possibly new location; take this into account when working with any files from now on.</system-reminder>`
}

export function usePromptMove(input: { projectID: () => string | undefined; sessionID: () => string | undefined }) {
  const dialog = useDialog()
  const sdk = useSDK()
  const sync = useSync()
  const toast = useToast()
  const homeDestination = useHomeSessionDestination()
  const project = useProject()
  const paths = useTuiPaths()
  const [creating, setCreating] = createSignal(false)
  const [creatingDots, setCreatingDots] = createSignal(3)
  const [progress, setProgress] = createSignal<string>()
  let preparedCopy: { destination: HomeSessionDestination; directory: string } | undefined

  async function create(request: {
    context?: string
    location: { directory?: string; workspace?: string }
    destination?: HomeSessionDestination
    current?: () => boolean
  }) {
    const projectID = input.projectID()
    if (!projectID) return
    setCreating(true)
    setProgress("Creating copy")
    try {
      let directory = preparedCopy?.destination === request.destination ? preparedCopy?.directory : undefined
      if (!directory) {
        const generated = await sdk.api.projectCopies.generateName({
          projectID,
          location: request.location,
          context: request.context,
        })
        if (request.current && !request.current()) return
        const copy = await sdk.api.projectCopies.create({
          projectID,
          location: request.location,
          strategy: "git_worktree",
          directory: path.join(paths.worktree, projectID.slice(0, 6)),
          name: generated.name,
        })
        directory = copy.directory
        if (request.destination) preparedCopy = { destination: request.destination, directory }
      }
      if (request.current && !request.current()) return

      // Resolve the Location once so it is bootstrapped before moving on.
      const location = await sdk.api.location.get({ location: { directory } })

      setProgress("Creating session")
      return location.directory
    } catch (err) {
      setProgress(undefined)
      setCreating(false)
      if (!request.current || request.current())
        toast.show({ title: "Creating workspace failed", message: errorMessage(err), variant: "error" })
      return
    }
  }

  function open() {
    const projectID = input.projectID()
    if (!projectID) return
    const sessionID = input.sessionID()
    const session = sessionID ? sync.session.get(sessionID) : undefined
    dialog.replace(() => (
      <DialogMoveSession
        projectID={projectID}
        current={
          homeDestination?.destination() ??
          (session
            ? {
                type: "directory",
                directory: session.location.directory,
                subdirectory: !!session.subpath,
              }
            : {
                type: "directory",
                directory: project.instance.directory(),
                subdirectory: project.instance.directory() !== project.instance.path().worktree,
              })
        }
        onCurrentChange={(selection) => homeDestination?.setDestination(selection)}
        onSelect={(selection) => {
          const sessionID = input.sessionID()
          if (!sessionID) {
            homeDestination?.setDestination(selection)
            dialog.clear()
            return
          }
          void moveExistingSession(sessionID, selection)
        }}
      />
    ))
  }

  function sessionContext(sessionID: string) {
    const session = sync.session.get(sessionID)
    const messages = (sync.data.message[sessionID] ?? [])
      .slice(-6)
      .flatMap((message) => {
        if (message.type === "user") return [`user: ${message.text}`]
        if (message.type !== "assistant") return []
        return [
          ["assistant:", ...message.content.flatMap((part) => (part.type === "text" ? [part.text] : []))].join(" "),
        ]
      })
    return [session?.title, ...messages].filter(Boolean).join("\n") || undefined
  }

  async function moveExistingSession(sessionID: string, selection: MoveSessionSelection) {
    const session = sync.session.get(sessionID)
    const location = { directory: session?.location.directory ?? sdk.directory, workspace: session?.location.workspaceID }
    const status = session
      ? await sdk.api.vcs.status({ location }).catch(() => undefined)
      : undefined
    const choice = status?.data.length
      ? await DialogWorkspaceFileChanges.show(dialog, status.data, {
          message:
            "Copy these file changes if the Session moves to a different checkout? The originals will stay here.",
        })
      : "no"
    if (!choice) return
    dialog.clear()
    const directory = selection.type === "new" ? await create({ context: sessionContext(sessionID), location }) : selection.directory
    if (!directory) {
      setProgress(undefined)
      dialog.clear()
      return
    }
    setProgress("Moving session")
    try {
      await sdk.api.sessions.move({ sessionID, location: { directory }, moveChanges: choice === "yes" })
      await sdk.api.sessions
        .synthetic({ sessionID, text: moveReminderText(directory), resume: false })
        .catch(() => undefined)
      dialog.clear()
    } catch (error) {
      toast.error(error)
      dialog.clear()
    } finally {
      setProgress(undefined)
      setCreating(false)
    }
  }

  const destination = () => homeDestination?.destination()
  const pendingNew = createMemo(() => homeDestination?.destination()?.type === "new")

  function getDirectory(input: {
    destination?: HomeSessionDestination
    context: string
    location: { directory?: string; workspace?: string }
    current: () => boolean
  }) {
    if (input.destination?.type === "new") return create(input)
    return input.destination?.directory
  }

  function startSubmit() {
    if (progress()) setProgress("Submitting prompt")
  }

  function finishSubmit(selection: HomeSessionDestination, submitted: boolean) {
    if (submitted && destination() === selection) {
      preparedCopy = undefined
      homeDestination?.clear()
    }
    setProgress(undefined)
    setCreating(false)
  }

  createEffect(() => {
    if (!creating()) {
      setCreatingDots(3)
      return
    }
    const timer = setInterval(() => setCreatingDots((dots) => (dots % 3) + 1), 1000)
    onCleanup(() => clearInterval(timer))
  })

  return {
    creating,
    creatingDots,
    destination,
    finishSubmit,
    getDirectory,
    open,
    pendingNew,
    progress,
    startSubmit,
  }
}
