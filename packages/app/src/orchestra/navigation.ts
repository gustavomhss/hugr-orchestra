import type { LayoutRoute } from "../context/layout-route"

// Sidebar destinations. Chapter IDs mark Orchestra rework proposals; a chapter opens a page
// only once it registers one in chapterPages. `wip` marks screens the owner approved as they are
// but wants revisited before production.
export const navigation = [
  { id: "home", label: "home.title", chapter: undefined },
  { id: "chat", label: "orchestra.nav.chat", chapter: undefined },
  { id: "agents", label: "orchestra.nav.agents", chapter: "C11", wip: true },
  // Session-relative governance (S20), opened as a dialog over the current session; not a route.
  { id: "maestro", label: "orchestra.nav.maestro", chapter: undefined },
  // Relay workflows sit next to Maestro, which runs them (owner decision, 2026-10-06).
  { id: "workflows", label: "orchestra.nav.workflows", chapter: "C14" },
  { id: "mcp", label: "orchestra.nav.mcp", chapter: "C01", wip: true },
  { id: "skills", label: "orchestra.nav.skills", chapter: "C02" },
  { id: "plugins", label: "orchestra.nav.plugins", chapter: "C03" },
  { id: "hooks", label: "orchestra.nav.hooks", chapter: "C04" },
  { id: "cicd", label: "orchestra.nav.cicd", chapter: "C07", wip: true },
  { id: "schedule", label: "orchestra.nav.schedule", chapter: "C08" },
  { id: "env", label: "orchestra.nav.env", chapter: "C09" },
  { id: "dock", label: "orchestra.nav.dock", chapter: "C13" },
  { id: "search", label: "orchestra.nav.search", chapter: undefined },
  { id: "workspaces", label: "orchestra.nav.workspaces", chapter: "C12", wip: true },
  { id: "providers", label: "settings.providers.title", chapter: "C05" },
  { id: "shortcuts", label: "settings.tab.shortcuts", chapter: "C06" },
  { id: "settings", label: "sidebar.settings", chapter: undefined },
] as const

// Capability pages without an entry here use their navigation label, as the reference does.
const crumbs = {
  agents: "orchestra.shell.crumb.agents",
  dock: "orchestra.shell.crumb.dock",
  workspaces: "orchestra.shell.crumb.workspaces",
  plugins: "orchestra.shell.crumb.plugins",
  settings: "orchestra.shell.crumb.settings",
} as const

export function isWip(id: string) {
  return navigation.some((item) => item.id === id && "wip" in item && item.wip)
}

export function breadcrumbLabel(route: LayoutRoute) {
  if (route.type === "home") return "orchestra.shell.crumb.home"
  if (route.type !== "chapter") return "orchestra.shell.crumb.session"
  if (Object.hasOwn(crumbs, route.chapter)) return crumbs[route.chapter as keyof typeof crumbs]
  return navigation.find((item) => item.id === route.chapter)?.label ?? "orchestra.shell.crumb.home"
}
