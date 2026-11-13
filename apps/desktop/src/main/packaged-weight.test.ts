import { expect, test } from "bun:test"
import { packagedElectronLanguages } from "./packaged-weight"

test("the installer keeps English and Portuguese Chromium packs", async () => {
  expect(packagedElectronLanguages).toEqual(["en", "en-US", "pt-BR", "pt-PT"])
  expect(packagedElectronLanguages).not.toContain("fr")
  const config = await Bun.file(new URL("../../electron-builder.config.ts", import.meta.url)).text()
  expect(config).toContain("...packagedDebugMapExclusions")
  expect(config).toContain("electronLanguages: packagedElectronLanguages")
  expect(config).toContain('{ from: "resources/cli", to: "cli" }')
})

test("beforePack preserves CLI verification and the CLI extra resource", async () => {
  const config = await Bun.file(new URL("../../electron-builder.config.ts", import.meta.url)).text()
  expect(config).not.toContain("prepareTreeSitterPrebuilds")
  expect(config).toContain("verifyPackagedCli")
  expect(config).toContain('{ from: "resources/cli", to: "cli" }')
  expect(config).toContain("...packagedDebugMapExclusions")
})
