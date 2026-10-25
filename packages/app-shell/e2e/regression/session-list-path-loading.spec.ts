import { test } from "@playwright/test"
import { fixture, pageMessages } from "../smoke/session-timeline.fixture"
import { mockOrchestraServer, sessionActivity } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"

test("shows loaded sessions before the directory path request resolves", async ({ page }) => {
  await mockOrchestraServer(page, {
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
  await page.route("**/api/location/paths?*", async (route) => {
    if (!new URL(route.request().url()).searchParams.has("location[directory]")) return route.fallback()
    await pathBlocked
    return route.fallback()
  })
  // The shared mock still answers the V1 activity route; V2 reads it from `/api/activity/session`, wrapped with its location.
  await page.route("**/api/activity/session?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        location: { directory: fixture.directory, project: { id: fixture.project.id, directory: fixture.directory } },
        data: sessionActivity(fixture.sessions, new URL(route.request().url()).searchParams.get("period") ?? "30d"),
      }),
    }),
  )

  await page.addInitScript(
    ({ directory, server }) => {
      localStorage.setItem(
        "orchestra.global.dat:server",
        JSON.stringify({
          projects: { local: [{ worktree: directory, expanded: true }] },
          lastProject: { local: directory },
        }),
      )
      localStorage.setItem("orchestra.global.dat:layout", JSON.stringify({ home: { selection: { server, directory } } }))
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
