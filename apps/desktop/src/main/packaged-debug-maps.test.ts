import { afterEach, expect, test } from "bun:test"
import { realpathSync } from "node:fs"
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import config from "../../electron-builder.config"

type Matcher = { createFilter(): (file: string, stat: { isDirectory(): boolean }) => boolean }
const require = createRequire(import.meta.url)
const builder = createRequire(realpathSync(require.resolve("electron-builder/package.json")))(
  "app-builder-lib/out/fileMatcher",
) as {
  FileMatcher: new (from: string, to: string, expand: (value: string) => string, patterns: unknown) => Matcher
  getNodeModuleFileMatcher: (
    from: string,
    to: string,
    expand: (value: string) => string,
    platform: object,
    packager: { config: typeof config; debugLogger: { isEnabled: boolean } },
  ) => Matcher
}
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

test("the actual packager excludes JS/CSS debug maps from the app and dependency copy paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestra-debug-maps-"))
  roots.push(root)
  const app = new builder.FileMatcher(root, join(root, "destination"), (value) => value, config.files).createFilter()
  const dependencies = builder
    .getNodeModuleFileMatcher(
      root,
      join(root, "destination"),
      (value) => value,
      {},
      {
        config,
        debugLogger: { isEnabled: false },
      },
    )
    .createFilter()
  const cases = [
    ["out/main/index.js", true, app],
    ["out/main/index.js.map", false, app],
    ["out/renderer/assets/main.css", true, app],
    ["out/renderer/assets/main.css.map", false, app],
    ["resources/wallpapers/space.png", true, app],
    ["node_modules/effect/dist/index.js", true, dependencies],
    ["node_modules/effect/dist/index.js.map", false, dependencies],
    ["node_modules/dep/index.mjs.map", false, dependencies],
    ["node_modules/dep/index.cjs.map", false, dependencies],
    ["node_modules/@ff-labs/fff-bun/src/index.ts", true, dependencies],
    ["node_modules/bun-pty/src/index.ts", true, dependencies],
    ["node_modules/@orchestra/client/src/effect.ts", true, dependencies],
    ["node_modules/@orchestra/client/package.json", true, dependencies],
    ["node_modules/tree-sitter/prebuilds/linux-x64/tree-sitter.node", true, dependencies],
    ["node_modules/web-tree-sitter/tree-sitter.wasm", true, dependencies],
    ["node_modules/dep/index.d.ts.map", true, dependencies],
    ["node_modules/dep/engine.wasm.map", true, dependencies],
    ["node_modules/dep/route.map", true, dependencies],
  ] as const
  for (const [relative, expected, filter] of cases) {
    const file = join(root, relative)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, "fixture")
    expect(filter(file, await stat(file)), relative).toBe(expected)
  }
  expect(config.electronLanguages).toEqual(["en", "en-US", "pt-BR", "pt-PT"])
  expect(config.extraResources).toContainEqual({ from: "resources/cli", to: "cli" })
})
