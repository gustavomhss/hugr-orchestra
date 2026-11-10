import { expect, test } from "bun:test"
import { packagedElectronLanguages, packagedFileExclusions } from "./packaged-weight"

test("the installer drops maps and TypeScript sources, and keeps English and Portuguese", async () => {
  expect(packagedFileExclusions).toContain("!**/*.map")
  expect(packagedFileExclusions).toContain("!**/node_modules/**/*.ts")
  expect(packagedFileExclusions).toContain("!**/node_modules/**/*.tsx")
  expect(packagedElectronLanguages).toEqual(["en", "en-US", "pt-BR", "pt-PT"])
  const config = await Bun.file(new URL("../../electron-builder.config.ts", import.meta.url)).text()
  expect(config).toContain("...packagedFileExclusions")
  expect(config).toContain("electronLanguages: packagedElectronLanguages")
})
