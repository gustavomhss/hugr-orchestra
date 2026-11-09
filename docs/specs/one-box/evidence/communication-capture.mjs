import { createRequire } from "node:module"
import { resolve } from "node:path"

// Task-owned isolated web/backend only; all Inbox credentials and acquisition are synthetic HTTP fixtures.
const require = createRequire(`${process.cwd()}/package.json`)
const { chromium } = require("@playwright/test")
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
})
try {
  const page = await browser.newPage({
    viewport: { width: 1512, height: 982 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    reducedMotion: "reduce",
  })
  const errors = []
  const requests = []
  page.on("pageerror", (error) => errors.push(String(error)))
  page.on("requestfailed", (request) =>
    console.log("request failed", request.url().split("?")[0], request.failure()?.errorText),
  )
  await page.route("**/api/inbox**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    requests.push(`${request.method()} ${url.pathname}`)
    const payload = request.method() === "POST" || request.method() === "PUT" ? request.postDataJSON() : undefined
    const data =
      url.pathname === "/api/inbox/accounts"
        ? ["mail", "teams", "discord"].map((source) => ({
            source,
            connected: true,
            generation: "fixture-1",
            state: "idle",
          }))
        : url.pathname === "/api/inbox/communication/choices"
          ? {
              generation: "fixture-1",
              choices:
                payload.source === "mail"
                  ? [
                      { id: "INBOX", name: "Inbox" },
                      { id: "work", name: "Work" },
                    ]
                  : payload.source === "teams"
                    ? [
                        { id: "chat-1", name: "Product · Release review" },
                        { id: "chat-2", name: "Engineering" },
                      ]
                    : [
                        { id: "20", name: "Orchestra · #engineering" },
                        { id: "21", name: "Orchestra · #announcements" },
                      ],
            }
          : url.pathname === "/api/inbox/communication"
            ? (payload ?? {
                source: url.searchParams.get("source"),
                generation: "fixture-1",
                selected: url.searchParams.get("source") === "mail" ? ["INBOX"] : [],
                unreadOnly: false,
              })
            : url.pathname === "/api/inbox/slack"
              ? { connected: false, state: "idle" }
              : url.pathname === "/api/inbox/account/sync"
                ? { source: payload.source, generation: "fixture-1", connected: true, state: "synced" }
                : []
    await route.fulfill({ json: { data }, headers: { "access-control-allow-origin": "*" } })
  })
  const fixture = resolve("../../docs/specs/one-box/evidence/communication.fixture.html")
  await page.goto(`http://127.0.0.1:3003/@fs/${fixture.replace(/^\//, "")}`, { waitUntil: "commit", timeout: 20000 })
  await page.getByRole("button", { name: "Sources", exact: true }).waitFor({ timeout: 60000 })
  await page.getByRole("button", { name: "Sources", exact: true }).click()
  const dialog = page.getByRole("dialog")
  for (const source of ["mail", "teams", "discord"]) {
    const names = { mail: "Mail", teams: "Teams", discord: "Discord" }
    await dialog.locator(".inbox-account-list button").filter({ hasText: names[source] }).click()
    await dialog.getByRole("button", { name: "Load available labels, folders or chats", exact: true }).click()
    await dialog
      .getByRole("checkbox", {
        name: source === "mail" ? "Work" : source === "teams" ? "Product · Release review" : "Orchestra · #engineering",
        exact: true,
      })
      .check()
    await dialog.getByRole("button", { name: "Save collection settings", exact: true }).click()
    await dialog.getByRole("button", { name: "Synchronize this source", exact: true }).click()
    await dialog.getByText("Source snapshot synchronized.", { exact: true }).waitFor()
    for (const scheme of ["dark", "light"]) {
      await page.evaluate((value) => {
        document.documentElement.dataset.colorScheme = value
      }, scheme)
      await page.screenshot({
        path: resolve("../../docs/specs/one-box/evidence", `communication-${source}-${scheme}.png`),
      })
    }
  }
  if (errors.length) throw new Error(JSON.stringify(errors))
  console.log(
    JSON.stringify({
      requests,
      errors,
      note: "Real Sources components; synthetic Inbox HTTP only; no provider credentials or sending.",
    }),
  )
} catch (error) {
  for (const page of browser.contexts().flatMap((context) => context.pages()))
    console.log({ url: page.url(), body: (await page.locator("body").innerText()).slice(0, 2200) })
  throw error
} finally {
  await browser.close()
}
