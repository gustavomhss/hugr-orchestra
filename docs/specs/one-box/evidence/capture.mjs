import { createRequire } from "node:module"
// Run from packages/app-shell against an explicitly isolated task preview on 3001/4097.
// This captures synthetic fixtures only. It does not launch or restart services.
import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
const require = createRequire(`${process.cwd()}/package.json`)
const { chromium } = require("@playwright/test")
const output = resolve(process.cwd(), "../../docs/specs/one-box/evidence")
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1512, height: 982 }, deviceScaleFactor: 1, colorScheme: "dark", reducedMotion: "reduce" })
  const errors = []
  page.on("pageerror", error => errors.push(String(error)))
  page.on("requestfailed", request => console.log("request failed:", request.url().split("?")[0], request.failure()?.errorText))
  await page.goto(`http://127.0.0.1:3001/orchestra/inbox?preview=inbox&auth_token=${btoa("orchestra:preview-local")}`, { waitUntil: "commit", timeout: 20000 })
  await page.getByRole("heading", { name: "Choose the recovery strategy", exact: true }).waitFor({ timeout: 45000 })
  await page.evaluate(() => document.documentElement.dataset.colorScheme = "dark")
  await page.screenshot({ path: `${output}/recovered-inbox-dark.png` })
  await page.getByRole("button", { name: "Sources", exact: true }).click()
  await page.getByRole("dialog").getByRole("button", { name: /^Discord/ }).hover()
  await page.screenshot({ path: `${output}/recovered-sources-dark.png` })
  await page.locator(".inbox-dialog .mx-dialog-foot").getByRole("button", { name: "Close", exact: true }).click()
  await page.evaluate(() => document.documentElement.dataset.colorScheme = "light")
  await page.screenshot({ path: `${output}/recovered-inbox-light.png` })
  console.log(JSON.stringify({ sourceBatch: "38a23676fa5964ebc7a6baba5ce1f1b8df811f19144cd76272e4710b297918bd", output, captures: ["recovered-inbox-dark.png", "recovered-sources-dark.png", "recovered-inbox-light.png"], errors, note: "Synthetic fixtures; isolated preview DB; no send/triage/draft exercised again. No injected CSS." }))
} catch (error) {
  for (const page of browser.contexts().flatMap(context => context.pages())) {
    console.log("capture failure:", { url: page.url().split("?")[0], title: await page.title(), body: (await page.locator("body").innerText({ timeout: 3000 }).catch(() => "unavailable")).slice(0, 1600) })
  }
  throw error
} finally { await browser.close() }
