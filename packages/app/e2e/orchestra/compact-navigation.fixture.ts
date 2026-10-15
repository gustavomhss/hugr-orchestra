import type { Page } from "@playwright/test"
import { mockOrchestraServer } from "../utils/mock-server"

export async function setupCompactNavigation(
  page: Page,
  input: {
    locale?: "en" | "ar"
    scheme?: "dark" | "light"
    projectName?: string
    protocol?: "v1" | "v2"
    // Home shows no profile until one is chosen; a returning user has the repository chosen and persisted.
    selected?: boolean
  } = {},
) {
  const directory = "/work/compact-navigation"
  const server = "http://127.0.0.1:4096"
  const project = {
    id: "compact-project",
    name: input.projectName ?? "Compact project",
    worktree: directory,
    vcs: "git",
    time: { created: 1, updated: 1 },
    sandboxes: [],
  }
  await mockOrchestraServer(page, {
    protocol: input.protocol,
    directory,
    project,
    provider: { all: [], connected: [], default: {} },
    sessions: [],
    pageMessages: () => ({ items: [] }),
  })
  await page.addInitScript(
    ({ directory, server, locale, scheme, selected }) => {
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }),
      )
      localStorage.setItem(
        "orchestra.global.dat:server",
        JSON.stringify({
          list: [server],
          projects: {
            local: [{ worktree: directory, expanded: true }],
            [server]: [{ worktree: directory, expanded: true }],
          },
          lastProject: { local: directory, [server]: directory },
        }),
      )
      localStorage.setItem("orchestra-theme-id", "oc-2")
      localStorage.setItem("orchestra-color-scheme", scheme)
      localStorage.setItem("orchestra.global.dat:language", JSON.stringify({ locale }))
      // Seed once per tab: a reload must keep what the app itself persisted since.
      if (!selected || sessionStorage.getItem("compact-navigation-selected")) return
      sessionStorage.setItem("compact-navigation-selected", "1")
      localStorage.setItem("orchestra.global.dat:layout", JSON.stringify({ home: { selection: { server, directory } } }))
    },
    { directory, server, locale: input.locale ?? "en", scheme: input.scheme ?? "dark", selected: !!input.selected },
  )
  return {
    renameProject(name: string) {
      project.name = name
    },
  }
}
