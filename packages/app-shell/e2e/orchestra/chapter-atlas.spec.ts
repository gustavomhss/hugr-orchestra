import { expect, test, type Page, type Route } from "@playwright/test"

// The Atlas chapter against a fake server. On v1 the legacy `atlas` httpapi group (D4) answers one small store,
// the one of src/orchestra/chapters/atlas/atlas-model.fixture.ts; v2 has no Atlas routes, so the chapter says so.
const server = "http://127.0.0.1:4096"
const directory = "/repo/atlas"

const fact = (
  key: string,
  file: string,
  tier: string,
  scope: string,
  claim: string,
  extra: Record<string, unknown> = {},
) => ({
  key,
  hash: `h-${key}`,
  claim,
  file,
  family: "advisory",
  tier,
  scope,
  derivedAt: "927f47e8",
  subtree: "df4a6c0c0cd1900b",
  obvious: null,
  promoted: true,
  why: null,
  kind: "advisory",
  authoring: "ADVISORY",
  storedFreshness: "FRESH",
  obviousBy: null,
  anchor: { kind: "file", qualifiedPath: file },
  slot: null,
  seal: null,
  supersededBy: null,
  sameAs: null,
  provenance: null,
  ...extra,
})

const snapshot = {
  state: "ok",
  project: "demo",
  head: "abc12345",
  builtAt: "927f47e8",
  gen: 3,
  stagingGen: 5,
  identity: "demo-identity",
  casObjects: 5,
  policy: { packages: ["seat:orchestrator"], "atlas:mined": ["seat:orchestrator"] },
  t0Keywords: ["invariant"],
  scip: true,
  tracked: { projection: false, cas: 0, staging: false, policy: true, memory: false },
  sealed: 0,
  casAudit: { objects: 5, referenced: 4, missing: 0, orphan: 1 },
  generations: ["projection.json", "staging.json"],
  abstained: 0,
  langs: { ts: 3, mjs: 1, py: 2, sh: 1 },
  facts: [
    fact("k1", "packages/a/src/x.ts", "T1", "packages", "Writes are atomic.", { slot: "invariant" }),
    fact("k2", "packages/a/src/x.ts", "T2", "packages", "Reads are cached per call.", {
      drift: {
        hunks: [{ at: "-1,2 +1,3", lines: ["+const a = 1"] }],
        stat: "1 file changed, 1 insertion(+)",
        commits: [["c0ffee1", "fix x"]],
      },
    }),
    fact("k3", "packages/b/src/y.ts", "T0", "packages", "Never call y twice.", { slot: "gotcha", authoring: "SUPERSEDED" }),
    fact("k4", "README.md", "T2", "atlas:mined", "The readme explains setup."),
  ],
  candidates: [fact("k5", "packages/a/src/w.ts", "T2", "atlas:mined", "w exports one helper.", { promoted: false })],
  dependents: { "packages/a/src/x.ts": ["packages/b/src/y.ts"], "packages/b/src/y.ts": ["packages/c/src/z.ts"] },
  dependentCount: { "packages/a/src/x.ts": 1, "packages/b/src/y.ts": 1 },
  children: { ".": ["README.md", "packages"], packages: ["a", "b", "c"], "packages/a": ["src"] },
  own: null,
  memory: {},
  orientation: [],
  territories: [],
}

const health = {
  state: "ok",
  actor: "you@example.com",
  provenance: "trusted",
  readRefusal: null,
  readAdvisory: null,
  cas: { objects: 5, corrupt: [], unreadable: [], missing: [], orphan: 1, referenced: 4, sound: true },
  proofs: { sealedProven: 0, reProven: 0, broken: 0, unverifiable: 0, dangling: 0 },
  index: { scipRel: ".atlas/index.scip", scip: { kind: "present", documents: 6 }, configured: [], holes: [] },
  hotSet: 4,
}

test("v1: every Atlas view renders the store", async ({ page }) => {
  const requests: string[] = []
  await setup(page, { protocol: "v1", requests })
  await openAtlas(page)
  const main = page.locator(".atlas-main")
  const rail = page.locator(".atlas-context")
  const pending = "This view is not built yet."

  await expect(rail).toContainText("project demo")
  await expect(main).not.toContainText(pending)
  const first = new URL(requests[0])
  expect(first.pathname).toBe("/atlas/snapshot")
  expect(first.searchParams.get("directory")).toBe(directory)

  await rail.getByRole("link", { name: "Explore" }).click()
  await expect(page).toHaveURL(/\/orchestra\/atlas\/explore$/)
  await expect(main).not.toContainText(pending)

  await rail.getByRole("link", { name: "Review" }).click()
  await expect(page).toHaveURL(/\/orchestra\/atlas\/review$/)
  await expect(main.locator("h1")).toHaveText("Review")
  await expect(main).toContainText("2 things wait for a decision.")
  await expect(main).toContainText("Reads are cached per call.")
  await expect(main).toContainText("1 commit")
  await main.getByRole("tab", { name: /Mined/ }).click()
  await expect(main).toContainText("w exports one helper.")
  await main.getByRole("tab", { name: /To ratify/ }).click()
  await expect(main).toContainText("Nothing proposed")
  await main.getByRole("tab", { name: /Changed code/ }).click()
  await main.getByRole("button", { name: "Merge check…" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.locator("h2")).toHaveText("Merge check")
  await expect(dialog).toContainText("Would block the merge: 1 fact lost its code")
  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)

  await rail.getByRole("link", { name: "Activity" }).click()
  await expect(main).toContainText("What agents read from Atlas, what they saved, and when they were held.")
  await expect(main).toContainText("Nothing recorded yet.")
  await main.getByRole("button", { name: /^Code/ }).click()
  await expect(main).toContainText("Commit c0ffee1 changed 1 fact")

  await rail.getByRole("link", { name: "Genesis" }).click()
  await expect(main.locator("h1")).toHaveText("Genesis")
  await expect(main).toContainText("The ratification interview")
  await expect(main).toContainText("New capability · R11")
  await main.getByRole("button", { name: "Delegate…" }).click()
  await expect(page.locator(".at-toast")).toHaveText("Select one or more questions first.")

  await rail.getByRole("link", { name: "Architecture" }).click()
  await expect(main.locator("h1")).toHaveText("How Atlas keeps knowledge")
  await main.locator(".at-chapters").getByRole("link", { name: /Store/ }).click()
  await expect(page).toHaveURL(/ch=store/)
  await expect(main).toContainText("5 objects")

  await rail.getByRole("link", { name: "Ownership" }).click()
  await expect(main.locator("h1")).toHaveText("Ownership, packaged as skills")
  await expect(main).toContainText("own_a")

  await rail.getByRole("link", { name: "Follow one fact" }).click()
  await expect(main.locator("h1")).toHaveText("Follow one fact")
  await expect(main).toContainText("“Writes are atomic.”")
  await main.getByRole("button", { name: "Next: Checked" }).click()
  await expect(main).toContainText("Well-formed")

  await rail.getByRole("link", { name: "Backend" }).click()
  await expect(page).toHaveURL(/\/orchestra\/atlas\/memory\/backend$/)
  await expect(main.locator("h1")).toHaveText("Backend")
  await expect(main).toContainText("Memory on")
  await rail.getByRole("link", { name: /Maestro/ }).click()
  await expect(main).toContainText("Not bound yet")

  await main.click({ position: { x: 4, y: 4 } })
  await page.keyboard.press("g")
  await page.keyboard.press("r")
  await expect(page).toHaveURL(/\/orchestra\/atlas\/review$/)

  await page.goto("/orchestra/atlas/unit/packages%2Fa", { waitUntil: "domcontentloaded" })
  await expect(main).toContainText("Writes are atomic.")
  await expect(main).not.toContainText(pending)
  await page.goto("/orchestra/atlas/fact/k1", { waitUntil: "domcontentloaded" })
  await expect(main).toContainText("Writes are atomic.")
  await expect(main).not.toContainText(pending)
})

test("v2: a server without the atlas routes says so", async ({ page }) => {
  const requests: string[] = []
  await setup(page, { protocol: "v2", requests })
  await openAtlas(page)
  await expect(page.locator(".atlas-main")).toContainText("This server does not provide Atlas.")
  expect(requests).toEqual([])
})

async function openAtlas(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await page.locator(".orchestra-sidebar").getByRole("button", { name: "Atlas", exact: true }).click()
  await expect(page).toHaveURL(/\/orchestra\/atlas$/)
}

async function setup(page: Page, input: { protocol: "v1" | "v2"; requests: string[] }) {
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.addInitScript(
    ({ server, directory }) => {
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }),
      )
      localStorage.setItem("language.v1", JSON.stringify({ locale: "en" }))
      localStorage.setItem("orchestra-theme-id", "oc-2")
      localStorage.setItem("orchestra-color-scheme", "dark")
      localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.18.27" }))
      localStorage.setItem(
        "orchestra.global.dat:server",
        JSON.stringify({ list: [], projects: { local: [{ worktree: directory }] } }),
      )
      localStorage.setItem("orchestra.global.dat:layout", JSON.stringify({ home: { selection: { server, directory } } }))
    },
    { server, directory },
  )
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== server) return route.fallback()
    const path = url.pathname
    const project = {
      id: "project-a",
      name: "Atlas project",
      worktree: directory,
      vcs: "git",
      time: { created: 1, updated: 1 },
      sandboxes: [],
    }
    const location = { directory, project: { id: project.id, directory } }
    if (path.startsWith("/atlas/")) {
      input.requests.push(url.toString())
      return atlas(route, path.split("/")[2] ?? "", path.split("/")[3] ?? "")
    }
    if (path === "/global/event" || path === "/event" || path === "/api/event")
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: ": ok\n\n" })
    if (path === "/global/health") return json(route, { healthy: true }, input.protocol === "v1" ? 200 : 404)
    if (path === "/api/health") return json(route, { healthy: true, version: "2", pid: 1 })
    if (path === "/project" || path === "/api/project") return json(route, [project])
    if (path === "/project/current") return json(route, project)
    if (path === "/api/project/current") return json(route, { id: project.id, directory })
    if (path === "/path" || path === "/api/path")
      return json(route, { state: directory, config: directory, worktree: directory, directory, home: "/home/user" })
    if (path === "/provider") return json(route, { all: [], connected: [], default: {} })
    if (path === "/api/session") return json(route, { data: [], cursor: {} })
    if (path === "/api/session/active") return json(route, { data: {} })
    if (path === "/api/vcs") return json(route, { location, data: { branch: "dev" } })
    if (path === "/api/mcp/resource") return json(route, { location, data: { resources: [], templates: [] } })
    if (["/session", "/agent", "/command", "/lsp", "/formatter", "/permission", "/question", "/skill"].includes(path))
      return json(route, [])
    if (path.startsWith("/api/")) return json(route, { location, data: [] })
    return json(route, {})
  })
}

// The legacy `atlas` group: the snapshot, a missing reasoning entry, health; every other call answers empty.
function atlas(route: Route, call: string, id: string) {
  if (call === "snapshot") return json(route, snapshot)
  if (call === "reasoning") return json(route, { state: "missing", id })
  if (call === "health") return json(route, health)
  return json(route, { state: "empty" })
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  })
}
