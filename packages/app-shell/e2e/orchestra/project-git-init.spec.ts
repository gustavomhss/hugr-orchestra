import { expect, test, type Page } from "@playwright/test"
import { mockOrchestraServer } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"

const directory = "C:\\Orchestra\\NewProject"
const serverPort = process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"
const project = {
  id: "proj_git_init",
  worktree: directory,
  vcs: "git",
  name: "NewProject",
  time: { created: 1_700_000_000_000, updated: 1_700_000_000_000 },
  sandboxes: [],
}
const readme = { name: "README.md", path: "README.md", absolute: `${directory}\\README.md`, type: "file", ignored: false }

// Adding a folder lists its root ("."). An empty root asks whether to set up git before the project is read back;
// a root with files never asks. `root` is what the mocked server answers for that listing.
async function openMockedApp(page: Page, root: unknown[]) {
  const requests: { method: string; path: string; directory: string | null }[] = []
  page.on("request", (request) => {
    const url = new URL(request.url())
    if (url.port !== serverPort) return
    requests.push({ method: request.method(), path: url.pathname, directory: url.searchParams.get("directory") })
  })
  await mockOrchestraServer(page, {
    directory,
    project,
    provider: { all: [], connected: [], default: {} },
    sessions: [],
    pageMessages: () => ({ items: [] }),
    fileList: (path) => {
      if (path === ".") return root
      return path
        ? []
        : [{ name: "NewProject", path: "NewProject", absolute: directory, type: "directory", ignored: false }]
    },
    findFiles: () => ["NewProject"],
  })
  // The shared mock has no git init route; the real one answers with the refreshed project. Registered after the
  // mock so it runs first for this one URL.
  await page.route(
    (url) => url.port === serverPort && url.pathname === "/project/git/init",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(project),
      }),
  )
  await page.addInitScript(() => {
    localStorage.setItem("language.v1", JSON.stringify({ locale: "en" }))
    localStorage.setItem("settings.v3", JSON.stringify({ general: { shouldDisplayTabsToast: false } }))
    localStorage.setItem("orchestra.global.dat:server", JSON.stringify({ projects: { local: [] } }))
  })
  await page.goto("/")
  return {
    // Every git init the page sent, whatever folder it named.
    initialized: () =>
      requests
        .filter((request) => request.method === "POST" && request.path === "/project/git/init")
        .map((request) => request.directory),
    // Reads of the folder's existing project: the step an unconfirmed folder takes instead of initializing.
    lookups: () =>
      requests.filter(
        (request) =>
          request.method === "GET" && request.path === "/project/current" && request.directory === directory,
      ).length,
  }
}

function profileButton(page: Page) {
  return page.getByRole("button", { name: "Choose repository profile", exact: true })
}

async function chooseFolder(page: Page) {
  const profile = profileButton(page)
  await expect(profile).toHaveCount(1)
  await expectAppVisible(profile)
  await expect(profile).toContainText("Choose a project")
  await profile.click()
  const addProject = page
    .locator('[data-component="orchestra-profile-picker"]')
    .getByRole("menuitem", { name: "Add project", exact: true })
  await expect(addProject).toHaveCount(1)
  await expectAppVisible(addProject)
  await addProject.click()
  const folder = page.getByRole("dialog").locator(`[data-directory-path=${JSON.stringify(directory)}]`)
  await expect(folder).toHaveCount(1)
  await folder.click()
}

function gitDialog(page: Page) {
  return page.getByRole("dialog", { name: "Set up git for this folder?", exact: true })
}

async function expectProjectAdded(page: Page) {
  const profile = profileButton(page)
  await expect(profile).toContainText("NewProject")
  await expect(profile.locator("small")).toHaveAttribute("title", directory)
  await expect(page.getByText("Could not add the project", { exact: true })).toHaveCount(0)
}

test("an empty folder is initialized as a git repository when the person agrees", async ({ page }) => {
  const app = await openMockedApp(page, [])
  await chooseFolder(page)

  const dialog = gitDialog(page)
  await expectAppVisible(dialog)
  await expect(dialog.locator('[data-slot="dialog-description"]')).toHaveText(
    `${directory} is empty. Initialize a git repository with an empty first commit so Orchestra can track changes in it.`,
  )
  // Nothing is initialized until the person chooses.
  expect(app.initialized()).toEqual([])
  await dialog.getByRole("button", { name: "Initialize git", exact: true }).click()

  await expect.poll(() => app.initialized()).toEqual([directory])
  await expect(dialog).toHaveCount(0)
  await expectProjectAdded(page)
  expect(app.initialized()).toEqual([directory])
})

test("an empty folder is added without git when the person skips", async ({ page }) => {
  const app = await openMockedApp(page, [])
  await chooseFolder(page)

  const dialog = gitDialog(page)
  await expectAppVisible(dialog)
  expect(app.initialized()).toEqual([])
  const lookups = app.lookups()
  await dialog.getByRole("button", { name: "Add without git", exact: true }).click()

  // Declining reads the folder's project instead of creating a repository.
  await expect.poll(() => app.lookups()).toBeGreaterThan(lookups)
  await expect(dialog).toHaveCount(0)
  await expectProjectAdded(page)
  expect(app.initialized()).toEqual([])
})

test("a folder with files is added without asking about git", async ({ page }) => {
  const app = await openMockedApp(page, [readme])
  const lookups = app.lookups()
  await chooseFolder(page)

  await expect.poll(() => app.lookups()).toBeGreaterThan(lookups)
  await expect(gitDialog(page)).toHaveCount(0)
  await expectProjectAdded(page)
  expect(app.initialized()).toEqual([])
})
