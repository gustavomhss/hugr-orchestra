import { expect, test } from "bun:test"
import { configSchemaFile, configSchemaText, themeSchemaFile, themeSchemaSource, tuiSchemaFile, tuiSchemaText } from "../../script/schema"

// Regenerate with `bun run script/schema.ts` from packages/orchestra.
test("schema/config.json matches the generated config schema", async () => {
  expect(await Bun.file(configSchemaFile).text()).toBe(configSchemaText())
})

test("schema/tui.json matches the generated TUI config schema", async () => {
  expect(await Bun.file(tuiSchemaFile).text()).toBe(tuiSchemaText())
})

test("schema/theme.json mirrors the desktop theme schema", async () => {
  expect(await Bun.file(themeSchemaFile).text()).toBe(await Bun.file(themeSchemaSource).text())
})
