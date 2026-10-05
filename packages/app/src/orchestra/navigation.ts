import type { LayoutRoute } from "../context/layout-route"

// Sidebar destinations. Chapter IDs mark Orchestra rework proposals; a chapter opens a page
// only once it registers one in chapterPages.
export const navigation = [
  { id: "home", label: "home.title", chapter: undefined },
  { id: "chat", label: "orchestra.nav.chat", chapter: undefined },
  { id: "agents", label: "orchestra.nav.agents", chapter: "C11" },
  // Session-relative governance (S20), opened as a dialog over the current session; not a route.
  { id: "maestro", label: "orchestra.nav.maestro", chapter: undefined },
  { id: "mcp", label: "orchestra.nav.mcp", chapter: "C01" },
  { id: "skills", label: "orchestra.nav.skills", chapter: "C02" },
  { id: "plugins", label: "orchestra.nav.plugins", chapter: "C03" },
  { id: "hooks", label: "orchestra.nav.hooks", chapter: "C04" },
  { id: "cicd", label: "orchestra.nav.cicd", chapter: "C07" },
  { id: "schedule", label: "orchestra.nav.schedule", chapter: "C08" },
  { id: "env", label: "orchestra.nav.env", chapter: "C09" },
  { id: "dock", label: "orchestra.nav.dock", chapter: "C13" },
  { id: "search", label: "orchestra.nav.search", chapter: undefined },
  { id: "workspaces", label: "orchestra.nav.workspaces", chapter: "C12" },
  { id: "providers", label: "settings.providers.title", chapter: "C05" },
  { id: "shortcuts", label: "settings.tab.shortcuts", chapter: "C06" },
  { id: "settings", label: "sidebar.settings", chapter: undefined },
  { id: "help", label: "sidebar.help", chapter: undefined },
] as const

export function breadcrumbLabel(route: LayoutRoute) {
  if (route.type === "home") return "home.title"
  if (route.type !== "chapter") return "orchestra.nav.chat"
  return navigation.find((item) => item.id === route.chapter)?.label ?? "home.title"
}
