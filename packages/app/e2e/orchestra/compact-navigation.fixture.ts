import type { Page } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"

export async function setupCompactNavigation(
  page: Page,
  input: { locale?: "en" | "ar"; scheme?: "dark" | "light"; projectName?: string } = {},
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
  await mockOpenCodeServer(page, {
    directory,
    project,
    provider: { all: [], connected: [], default: {} },
    sessions: [],
    pageMessages: () => ({ items: [] }),
  })
  await page.addInitScript(
    ({ directory, server, locale, scheme }) => {
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }),
      )
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          list: [server],
          projects: {
            local: [{ worktree: directory, expanded: true }],
            [server]: [{ worktree: directory, expanded: true }],
          },
          lastProject: { local: directory, [server]: directory },
        }),
      )
      localStorage.setItem("opencode-theme-id", "oc-2")
      localStorage.setItem("opencode-color-scheme", scheme)
      localStorage.setItem("opencode.global.dat:language", JSON.stringify({ locale }))
    },
    { directory, server, locale: input.locale ?? "en", scheme: input.scheme ?? "dark" },
  )
  return {
    renameProject(name: string) {
      project.name = name
    },
  }
}
