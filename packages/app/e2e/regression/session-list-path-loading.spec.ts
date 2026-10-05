import { test } from "@playwright/test"
import { fixture, pageMessages } from "../smoke/session-timeline.fixture"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"

test("shows loaded sessions before the directory path request resolves", async ({ page }) => {
  await mockOpenCodeServer(page, {
    sessions: fixture.sessions,
    provider: fixture.provider,
    directory: fixture.directory,
    project: fixture.project,
    pageMessages,
  })

  let releasePath!: () => void
  const pathBlocked = new Promise<void>((resolve) => {
    releasePath = resolve
  })
  await page.route("**/api/path?*", async (route) => {
    if (!new URL(route.request().url()).searchParams.has("location[directory]")) return route.fallback()
    await pathBlocked
    return route.fallback()
  })

  await page.addInitScript(
    ({ directory, server }) => {
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          projects: { local: [{ worktree: directory, expanded: true }] },
          lastProject: { local: directory },
        }),
      )
      localStorage.setItem("opencode.global.dat:layout", JSON.stringify({ home: { selection: { server, directory } } }))
    },
    {
      directory: fixture.directory,
      server: `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`,
    },
  )

  await page.goto("/")
  try {
    // Home's session rows come from the activity read, which does not wait for the directory path.
    await expectAppVisible(
      page.locator('[data-component="home-impact-row"]').filter({ hasText: fixture.expected.sourceTitle }).first(),
    )
  } finally {
    releasePath()
  }
})
