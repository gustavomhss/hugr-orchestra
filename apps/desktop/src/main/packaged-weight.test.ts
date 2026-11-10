import { expect, test } from "bun:test"
import { packagedElectronLanguages, packagedFileExclusions } from "./packaged-weight"

test("the installer drops maps, TypeScript sources and the unused asar tree-sitter, and keeps English and Portuguese", async () => {
  expect(packagedFileExclusions).toContain("!**/*.map")
  expect(packagedFileExclusions).toContain("!**/node_modules/**/*.ts")
  expect(packagedFileExclusions).toContain("!**/node_modules/**/*.tsx")
  expect(packagedFileExclusions).toContain("!**/node_modules/tree-sitter*/**")
  expect(packagedFileExclusions).toContain("!**/node_modules/**/tree-sitter*/**")
  expect(packagedFileExclusions).toContain("!**/node_modules/web-tree-sitter/**")
  expect(packagedElectronLanguages).toEqual(["en", "en-US", "pt-BR", "pt-PT"])
  expect(packagedElectronLanguages).not.toContain("fr")
  const config = await Bun.file(new URL("../../electron-builder.config.ts", import.meta.url)).text()
  expect(config).toContain("...packagedFileExclusions")
  expect(config).toContain("electronLanguages: packagedElectronLanguages")
  expect(config).toContain('{ from: "resources/cli", to: "cli" }')
})

test("beforePack does not fail the pack on the discarded node_modules tree-sitter", async () => {
  const config = await Bun.file(new URL("../../electron-builder.config.ts", import.meta.url)).text()
  expect(config).not.toContain("prepareTreeSitterPrebuilds")
  expect(config).toContain("verifyPackagedCli")
  expect(config).toContain('{ from: "resources/cli", to: "cli" }')
  expect(config).toContain("...packagedFileExclusions")
  expect(packagedFileExclusions).toContain("!**/node_modules/tree-sitter*/**")
  expect(packagedFileExclusions).toContain("!**/node_modules/**/tree-sitter*/**")
  expect(packagedFileExclusions).toContain("!**/node_modules/web-tree-sitter/**")
})
