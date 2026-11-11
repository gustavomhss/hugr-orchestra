import { afterEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { cliServicesInactive, cliStateHomes, pruneCliCache } from "./cli-cache"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "orchestra-cli-cache-"))
  roots.push(root)
  const state = join(root, "state")
  await mkdir(join(state, "orchestra"), { recursive: true })
  return { root, state, registration: join(state, "orchestra", "server.json") }
}

async function install(cache: string, version: string) {
  const target = "linux-x64-baseline"
  const bytes = `CLI ${version}`
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  const directory = join(cache, `${version}-${target}-${sha256}`)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, "orchestra"), bytes)
  await writeFile(
    join(directory, "manifest.json"),
    JSON.stringify({
      schema: 1,
      version,
      artifacts: [{ target, file: "orchestra", sha256 }],
    }),
  )
  return directory
}

test("an old live daemon retains its CLI even when health/version discovery would reject it", async () => {
  const ctx = await fixture()
  const keep = await install(ctx.root, "2.0.0")
  const old = await install(ctx.root, "1.0.0")
  await writeFile(ctx.registration, JSON.stringify({ pid: process.pid, version: "old", url: "http://127.0.0.1:1" }))
  const inactive = await cliServicesInactive([ctx.state])
  expect(inactive).toBe(false)
  await pruneCliCache(ctx.root, keep, inactive)
  expect(await readFile(join(old, "orchestra"), "utf8")).toBe("CLI 1.0.0")
})

test("explicit desktop and shell state homes cannot hide the default or an inaccessible root", async () => {
  const ctx = await fixture()
  const desktop = join(ctx.root, "desktop")
  const shell = join(ctx.root, "shell")
  await writeFile(ctx.registration, JSON.stringify({ pid: process.pid }))
  expect(await cliServicesInactive(cliStateHomes(ctx.state, [desktop, shell]))).toBe(false)
  await rm(ctx.registration)
  // A known path that cannot be traversed must not be filtered out as if it did not exist.
  await writeFile(shell, "not a directory")
  const homes = cliStateHomes(ctx.state, [desktop, shell])
  expect(homes).toEqual([ctx.state, desktop, shell])
  expect(await cliServicesInactive(homes)).toBe(false)
})

test("dead registrations allow cleanup of verified installs but preserve current, unrelated and symlink directories", async () => {
  const ctx = await fixture()
  const keep = await install(ctx.root, "2.0.0")
  const old = await install(ctx.root, "1.0.0")
  await writeFile(ctx.registration, JSON.stringify({ pid: 2147483647 }))
  const inactive = await cliServicesInactive([ctx.state])
  expect(inactive).toBe(true)
  const unrelated = `notes-${"ab".repeat(32)}`
  await mkdir(join(ctx.root, unrelated))
  const linked = join(ctx.root, `linked-${"cd".repeat(32)}`)
  await symlink(keep, linked, process.platform === "win32" ? "junction" : "dir")
  await pruneCliCache(ctx.root, keep, inactive)
  expect(await readdir(ctx.root)).not.toContain(basename(old))
  expect(await readdir(ctx.root)).toContain(unrelated)
  expect(await readdir(ctx.root)).toContain(basename(linked))
  expect(await readFile(join(keep, "orchestra"), "utf8")).toBe("CLI 2.0.0")
})

test("malformed, unreadable and mixed-live registration sets block cleanup", async () => {
  const ctx = await fixture()
  expect(await cliServicesInactive([])).toBe(false)
  expect(await cliServicesInactive([ctx.state])).toBe(true)
  for (const value of ["{", "null", '{"pid":-1}', '{"pid":"42"}']) {
    await writeFile(ctx.registration, value)
    expect(await cliServicesInactive([ctx.state])).toBe(false)
  }
  await rm(ctx.registration)
  await mkdir(ctx.registration)
  expect(await cliServicesInactive([ctx.state])).toBe(false)
  await rm(ctx.registration, { recursive: true })
  await writeFile(ctx.registration, JSON.stringify({ pid: process.pid }))
  expect(await cliServicesInactive([join(ctx.root, "absent"), ctx.state])).toBe(false)
})

test("an invalid old binary is retained instead of being treated as a verified installation", async () => {
  const ctx = await fixture()
  const keep = await install(ctx.root, "2.0.0")
  const old = await install(ctx.root, "1.0.0")
  await writeFile(join(old, "orchestra"), "changed")
  await pruneCliCache(ctx.root, keep, true)
  expect(await readdir(ctx.root)).toContain(basename(old))
})

test.skipIf(process.platform === "win32")(
  "an undeletable stale installation never prevents using the verified current CLI",
  async () => {
    const ctx = await fixture()
    const keep = await install(ctx.root, "2.0.0")
    const old = await install(ctx.root, "1.0.0")
    await chmod(ctx.root, 0o555)
    try {
      await pruneCliCache(ctx.root, keep, true)
      expect(await readFile(join(keep, "orchestra"), "utf8")).toBe("CLI 2.0.0")
      expect(await readdir(ctx.root)).toContain(basename(old))
    } finally {
      await chmod(ctx.root, 0o755)
    }
  },
)
