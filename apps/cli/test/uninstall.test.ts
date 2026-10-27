import { afterAll, expect, test } from "bun:test"
import { Effect } from "effect"
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

// The handler module loads Global, which creates its XDG directories on import, so the test points every XDG
// variable at its own tree before loading it. The removal under test only ever receives paths under that tree.
const home = await mkdtemp(join(tmpdir(), "orchestra-uninstall-"))
process.env.ORCHESTRA_TEST_HOME = home
process.env.XDG_DATA_HOME = join(home, "data")
process.env.XDG_CACHE_HOME = join(home, "cache")
process.env.XDG_CONFIG_HOME = join(home, "config")
process.env.XDG_STATE_HOME = join(home, "state")
const { removalTargets, removeDirectories } = await import("../src/commands/handlers/uninstall")

afterAll(async () => {
  await rm(home, { recursive: true, force: true })
})

async function install(name: string) {
  const root = await mkdtemp(join(home, `${name}-`))
  const paths = { data: join(root, "data"), cache: join(root, "cache"), config: join(root, "config"), state: join(root, "state") }
  for (const dir of Object.values(paths)) {
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, "install.json"), "{}")
  }
  // A file the uninstall never names, next to the install state, must survive every run.
  const bystander = join(root, "projects", "notes.txt")
  await mkdir(join(root, "projects"))
  await writeFile(bystander, "mine")
  return { paths, bystander }
}

const exists = (path: string) => access(path).then(() => true, () => false)

test("removes data, cache and state by default and keeps nothing", async () => {
  const { paths, bystander } = await install("default")
  const targets = removalTargets({ "keep-config": false, "keep-data": false }, "npm", paths)
  expect(targets.directories.map((target) => [target.label, target.keep])).toEqual([
    ["Data", false],
    ["Cache", false],
    ["Config", false],
    ["State", false],
  ])

  await Effect.runPromise(removeDirectories(targets.directories))

  expect(await exists(paths.data)).toBe(false)
  expect(await exists(paths.cache)).toBe(false)
  expect(await exists(paths.config)).toBe(false)
  expect(await exists(paths.state)).toBe(false)
  expect(await readFile(bystander, "utf8")).toBe("mine")
})

test("--keep-config leaves the config directory exactly as it was", async () => {
  const { paths, bystander } = await install("keep-config")
  const targets = removalTargets({ "keep-config": true, "keep-data": false }, "npm", paths)

  await Effect.runPromise(removeDirectories(targets.directories))

  expect(await readFile(join(paths.config, "install.json"), "utf8")).toBe("{}")
  expect(await exists(paths.data)).toBe(false)
  expect(await exists(paths.cache)).toBe(false)
  expect(await exists(paths.state)).toBe(false)
  expect(await readFile(bystander, "utf8")).toBe("mine")
})

test("--keep-data leaves the data directory exactly as it was", async () => {
  const { paths, bystander } = await install("keep-data")
  const targets = removalTargets({ "keep-config": false, "keep-data": true }, "npm", paths)

  await Effect.runPromise(removeDirectories(targets.directories))

  expect(await readFile(join(paths.data, "install.json"), "utf8")).toBe("{}")
  expect(await exists(paths.cache)).toBe(false)
  expect(await exists(paths.config)).toBe(false)
  expect(await exists(paths.state)).toBe(false)
  expect(await readFile(bystander, "utf8")).toBe("mine")
})

test("directories that were never created are skipped without error", async () => {
  const root = await mkdtemp(join(home, "absent-"))
  const paths = { data: join(root, "data"), cache: join(root, "cache"), config: join(root, "config"), state: join(root, "state") }
  const targets = removalTargets({ "keep-config": false, "keep-data": false }, "npm", paths)

  await Effect.runPromise(removeDirectories(targets.directories))

  expect(await exists(root)).toBe(true)
  expect(await exists(paths.data)).toBe(false)
})
