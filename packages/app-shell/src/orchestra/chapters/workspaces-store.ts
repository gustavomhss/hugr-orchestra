import { createStore } from "solid-js/store"
import { Persist, persisted } from "@/utils/persist"
import type { ServerScope } from "@/utils/server-scope"

// One repository is one profile: entries are keyed by server scope, then by the path key of the repository root
// (`active`, `known`) or of the workspace directory (`names`). `known` holds the non-root workspaces the server listed
// on the last Workspaces load: V2 copies live outside `project.sandboxes`, and new drafts must still accept them.
export function persistedWorkspaces(scope: ServerScope) {
  return persisted(
    Persist.serverGlobal(scope, "orchestra.workspaces"),
    createStore({
      active: {} as Record<string, string | undefined>,
      known: {} as Record<string, string[] | undefined>,
      names: {} as Record<string, string | undefined>,
    }),
  )
}
