import { useDialog } from "../ui/dialog"
import { useSync } from "../context/sync"
import { useProject } from "../context/project"
import { useSDK } from "../context/sdk"
import { useToast } from "../ui/toast"
import { DialogWorkspaceFileChanges } from "./dialog-workspace-file-changes"

export type WorkspaceSelection =
  | {
      type: "none"
    }
  | {
      type: "new"
      workspaceType: string
      workspaceName: string
    }
  | {
      type: "existing"
      workspaceID: string
      workspaceType: string
      workspaceName: string
    }

export function recentConnectedWorkspaces<WorkspaceInfo extends { id: string; timeUsed: number | string }>(input: {
  workspaces: readonly WorkspaceInfo[]
  status: (workspaceID: string) => string | undefined
  limit?: number
  omitWorkspaceID?: string
}) {
  const allWorkspaces = input.workspaces.filter((workspace) => input.status(workspace.id) === "connected")
  const workspaces = allWorkspaces.toSorted((a, b) => Number(b.timeUsed) - Number(a.timeUsed))
  const recent = workspaces.slice(0, input.limit ?? 3)

  return { recent, hasMore: recent.length < workspaces.length }
}

export function warpReminderText(dir: string) {
  return `<system-reminder>The user has changed the current working directory to "${dir}". This is still the same project but at a possibly new location; take this into account when working with any files from now on.</system-reminder>`
}

// V2 serves no workspace adapters, so the experimental workspace flow stops here with a notice.
function workspacesUnavailable(toast: ReturnType<typeof useToast>) {
  toast.show({ title: "Workspaces are not available", message: WORKSPACES_UNAVAILABLE, variant: "error" })
}

export const WORKSPACES_UNAVAILABLE = "The V2 server has no workspace routes."

export async function openWorkspaceSelect(input: {
  dialog: ReturnType<typeof useDialog>
  sdk: ReturnType<typeof useSDK>
  sync: ReturnType<typeof useSync>
  project: ReturnType<typeof useProject>
  toast: ReturnType<typeof useToast>
  onSelect: (selection: WorkspaceSelection) => Promise<void> | void
}) {
  input.dialog.clear()
  workspacesUnavailable(input.toast)
}

export async function warpWorkspaceSession(input: {
  dialog: ReturnType<typeof useDialog>
  sdk: ReturnType<typeof useSDK>
  sync: ReturnType<typeof useSync>
  project: ReturnType<typeof useProject>
  toast: ReturnType<typeof useToast>
  sourceWorkspaceID?: string
  workspaceID: string | null
  sessionID: string
  copyChanges: boolean
  done?: () => void
}): Promise<boolean> {
  workspacesUnavailable(input.toast)
  return false
}

export async function confirmWorkspaceFileChanges(input: {
  dialog: ReturnType<typeof useDialog>
  sdk: ReturnType<typeof useSDK>
  sourceWorkspaceID?: string
}) {
  const status = await input.sdk.api.vcs
    .status({ location: { directory: input.sdk.directory, workspace: input.sourceWorkspaceID } })
    .catch(() => undefined)
  const fileChangeChoice = status?.data?.length
    ? await DialogWorkspaceFileChanges.show(input.dialog, status.data)
    : "no"
  if (!fileChangeChoice) return
  return fileChangeChoice === "yes"
}
