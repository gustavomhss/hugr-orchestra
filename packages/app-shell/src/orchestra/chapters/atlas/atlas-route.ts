// Every Atlas view has its own URL under the chapter (D7), so back, forward and reload keep the place.
//   /orchestra/atlas                          overview
//   /orchestra/atlas/<view>                   overview explore review activity genesis architecture ownership how
//   /orchestra/atlas/unit/<path>              a unit (the path is one encoded segment)
//   /orchestra/atlas/fact/<key>               a fact page
//   /orchestra/atlas/memory/<seat>[/...]      a memory seat page; the views split the rest themselves
//   ?fact=<key> opens the inspector over any view but the fact page; the views own the other query keys.

export const ATLAS_VIEWS = [
  "overview",
  "explore",
  "unit",
  "fact",
  "review",
  "activity",
  "genesis",
  "architecture",
  "ownership",
  "how",
  "memory",
] as const
export type AtlasViewId = (typeof ATLAS_VIEWS)[number]
export type AtlasRoute = { view: AtlasViewId; param: string; query: Record<string, string> }
export type AtlasQueryPatch = Record<string, string | undefined>

export const ATLAS_BASE = "/orchestra/atlas"

export function parseAtlasRoute(pathname: string, search: string): AtlasRoute {
  const rest = pathname.startsWith(ATLAS_BASE) ? pathname.slice(ATLAS_BASE.length) : ""
  const parts = rest.split("/").filter(Boolean).map(decode)
  const view = ATLAS_VIEWS.find((item) => item === parts[0]) ?? "overview"
  return {
    view,
    param: view === parts[0] ? parts.slice(1).join("/") : "",
    query: Object.fromEntries(new URLSearchParams(search)),
  }
}

// The href of a view. Empty query values are dropped, so a patch can clear a key with "" or undefined.
export function atlasHref(view: AtlasViewId, param = "", query: AtlasQueryPatch = {}) {
  const entries = Object.entries(query).filter((entry): entry is [string, string] => !!entry[1])
  const search = entries.length ? `?${new URLSearchParams(entries)}` : ""
  return `${ATLAS_BASE}/${view}${param ? `/${encodeURIComponent(param)}` : ""}${search}`
}

// The current route's href with some query keys changed (the mock's withQuery).
export function withQuery(route: AtlasRoute, patch: AtlasQueryPatch) {
  return atlasHref(route.view, route.param, { ...route.query, ...patch })
}

function decode(part: string) {
  try {
    return decodeURIComponent(part)
  } catch {
    return part
  }
}
