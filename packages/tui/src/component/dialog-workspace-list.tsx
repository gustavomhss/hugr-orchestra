import type { Workspace } from "../compat/schema"
import { useDialog } from "../ui/dialog"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { useProject } from "../context/project"
import { useTheme } from "../context/theme"
import { createMemo, createSignal, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { WORKSPACES_UNAVAILABLE } from "./dialog-workspace-create"
import { useToast } from "../ui/toast"

type WorkspaceOption = { workspace: Workspace }

export function DialogWorkspaceList() {
  const dialog = useDialog()
  const toast = useToast()
  const project = useProject()
  const { theme } = useTheme()
  const [deleting, setDeleting] = createSignal<string>()
  const [expanded, setExpanded] = createStore<Record<string, boolean>>({})

  const options = createMemo<DialogSelectOption<WorkspaceOption>[]>(() =>
    project.workspace
      .list()
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((workspace) => {
        const status = project.workspace.status(workspace.id)
        return {
          title: deleting() === workspace.id ? `Delete ${workspace.name}? Press delete again` : workspace.name,
          value: { workspace },
          footer: workspace.type,
          details: expanded[workspace.id] && workspace.directory ? [workspace.directory] : undefined,
          gutter: () => <text fg={status === "connected" ? theme.success : theme.error}>●</text>,
        }
      }),
  )

  function showDetails(workspace: Workspace) {
    setExpanded(workspace.id, (open) => !open)
  }

  function remove(workspace: Workspace) {
    if (deleting() !== workspace.id) {
      setDeleting(workspace.id)
      return
    }

    setDeleting(undefined)
    // V2 serves no workspace routes, so the workspace cannot be removed here.
    toast.show({ variant: "error", title: "Failed to delete workspace", message: WORKSPACES_UNAVAILABLE })
  }

  onMount(() => {
    dialog.setSize("large")
    void project.workspace.sync()
  })

  return (
    <DialogSelect
      title="Workspaces"
      options={options()}
      onMove={(option) => {
        setDeleting(undefined)
      }}
      onSelect={(option) => showDetails(option.value.workspace)}
      actions={[
        {
          command: "session.delete",
          title: "delete",
          onTrigger: (option) => void remove(option.value.workspace),
        },
      ]}
    />
  )
}
