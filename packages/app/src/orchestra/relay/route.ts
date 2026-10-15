import type { RelayKind } from "./client"

// Every view and layer has its own URL under its chapter, so back, forward and reload keep the place.
//   /orchestra/workflows                        library        /orchestra/hooks
//   /orchestra/workflows/executions             all runs       /orchestra/hooks/activity
//   /orchestra/workflows/new                    new dialog     /orchestra/hooks/new
//   /orchestra/workflows/<id>                   canvas         /orchestra/hooks/<id>
//   …/<id>/add                                  add panel
//   …/<id>/node/<node>                          node details
//   …/<id>/run/<run>[/node/<node>]              canvas and details showing one run (workflows)
//   …/<id>/executions[/<run>]                   executions and receipt   …/<id>/activity (hooks)
// Document IDs are server-made UUIDs, so they never collide with the reserved words.

export type RelayRoute =
  | { page: "library"; kind: RelayKind; tab: "list" | "runs"; create: boolean }
  | {
      page: "editor"
      kind: RelayKind
      id: string
      tab: "editor" | "runs"
      run?: string
      view?: string
      node?: string
      add: boolean
    }

const runsWord = (kind: RelayKind) => (kind === "workflow" ? "executions" : "activity")

export function chapterOf(kind: RelayKind) {
  return kind === "workflow" ? "workflows" : "hooks"
}

export function parseRelayRoute(kind: RelayKind, rest: string): RelayRoute {
  const parts = rest
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part)
      } catch {
        return part
      }
    })
  const first = parts[0]
  if (!first || first === runsWord(kind) || first === "new")
    return { page: "library", kind, tab: first === runsWord(kind) ? "runs" : "list", create: first === "new" }
  const route: Extract<RelayRoute, { page: "editor" }> = { page: "editor", kind, id: first, tab: "editor", add: false }
  const read = (index: number): Extract<RelayRoute, { page: "editor" }> => {
    const word = parts[index]
    if (word === undefined) return route
    if (word === runsWord(kind)) {
      route.tab = "runs"
      if (parts[index + 1] !== undefined) route.run = parts[index + 1]
      return route
    }
    if (word === "run" && kind === "workflow" && parts[index + 1] !== undefined) {
      route.view = parts[index + 1]
      return read(index + 2)
    }
    if (word === "node" && parts[index + 1] !== undefined) {
      route.node = parts[index + 1]
      return route
    }
    if (word === "add") route.add = true
    return route
  }
  return read(1)
}

const segment = (value: string) => encodeURIComponent(value)

export const relayPath = {
  library: (kind: RelayKind) => `/orchestra/${chapterOf(kind)}`,
  runs: (kind: RelayKind) => `/orchestra/${chapterOf(kind)}/${runsWord(kind)}`,
  create: (kind: RelayKind) => `/orchestra/${chapterOf(kind)}/new`,
  editor: (kind: RelayKind, id: string) => `/orchestra/${chapterOf(kind)}/${segment(id)}`,
  add: (kind: RelayKind, id: string) => `${relayPath.editor(kind, id)}/add`,
  node: (kind: RelayKind, id: string, node: string, view?: string) =>
    `${view ? relayPath.view(id, view) : relayPath.editor(kind, id)}/node/${segment(node)}`,
  view: (id: string, run: string) => `${relayPath.editor("workflow", id)}/run/${segment(run)}`,
  history: (kind: RelayKind, id: string, run?: string) =>
    `${relayPath.editor(kind, id)}/${runsWord(kind)}${run ? `/${segment(run)}` : ""}`,
}

// The canvas a layer sits on: closing details or the add panel returns here.
export function layerBase(route: Extract<RelayRoute, { page: "editor" }>) {
  return route.view ? relayPath.view(route.id, route.view) : relayPath.editor(route.kind, route.id)
}
