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
  const config = await Bun.file(new URL("../../electron-builder.config.ts", import.meta.url)).text()
  expect(config).toContain("...packagedFileExclusions")
  expect(config).toContain("electronLanguages: packagedElectronLanguages")
})
