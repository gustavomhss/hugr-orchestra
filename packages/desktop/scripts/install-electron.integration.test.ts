import { expect, test } from "bun:test"
import { copyFile, lstat, mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { installElectron } from "./install-electron"

test("fresh Electron bootstrap installs actual declared dependency with no existing executable", async () => {
  if (!process.env.RUNNER_OS) throw new Error("Fresh Electron bootstrap requires Actions")
  const require = createRequire(import.meta.url)
  const source = dirname(require.resolve("electron/package.json"))
  const dependency = createRequire(join(source, "package.json"))
  const root = await mkdtemp(join(tmpdir(), "orchestra-electron-bootstrap-"))
  await mkdir(join(root, "node_modules/@electron"), { recursive: true })
  await Promise.all(
    ["install.js", "package.json", "checksums.json"].map((file) => copyFile(join(source, file), join(root, file))),
  )
  await Promise.all(
    ["@electron/get", "extract-zip"].map(async (name) => {
      await symlink(
        dirname(dependency.resolve(`${name}/package.json`)),
        join(root, "node_modules", name),
        process.platform === "win32" ? "junction" : "dir",
      )
    }),
  )
  expect(await Bun.file(join(root, "path.txt")).exists()).toBe(false)
  return installElectron(root)
    .then(async () => {
      const file = (await readFile(join(root, "path.txt"), "utf8")).trim()
      expect((await lstat(join(root, "dist", file))).isFile()).toBe(true)
      expect((await readFile(join(root, "dist/version"), "utf8")).trim()).toBe("42.3.3")
      await installElectron(root)
    })
    .finally(() => rm(root, { recursive: true, force: true }))
}, 180_000)
