import { createStore } from "solid-js/store"
import { Persist, persisted } from "@/utils/persist"
import type { ServerScope } from "@/utils/server-scope"

// One repository is one profile: entries are keyed by server scope, then by the path key of the
// repository root (`active`) or of the workspace directory (`names`). New drafts read `active`.
export function persistedWorkspaces(scope: ServerScope) {
  return persisted(
    Persist.serverGlobal(scope, "orchestra.workspaces"),
    createStore({ active: {} as Record<string, string | undefined>, names: {} as Record<string, string | undefined> }),
  )
}
