import { expect, test } from "bun:test"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { electronInstallScript } from "./install-electron"

test("Electron bootstrap resolves installer from declared installed dependency", async () => {
  const directory = dirname(createRequire(import.meta.url).resolve("electron/package.json"))
  expect(await electronInstallScript(directory)).toBe(join(directory, "install.js"))
  expect(await Bun.file(join(directory, "package.json")).json()).toMatchObject({ name: "electron", version: "42.3.3" })
})

test("Electron bootstrap fails closed when dependency installer is absent", async () => {
  await expect(electronInstallScript(join(import.meta.dir, "missing-electron"))).rejects.toThrow()
})
