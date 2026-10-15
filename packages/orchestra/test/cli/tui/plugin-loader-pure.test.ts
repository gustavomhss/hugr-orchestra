import { expect, spyOn, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { pathToFileURL } from "url"
import { tmpdir } from "../../fixture/fixture"
import { createTuiPluginApi } from "../../fixture/tui-plugin"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { TuiConfig } from "../../../src/config/tui"
import { rethrow } from "../../lib/rejection"

const { TuiPluginRuntime } = await import("../../../src/plugin/tui/runtime")

test("skips external tui plugins in pure mode", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      const file = path.join(dir, "plugin.ts")
      const spec = pathToFileURL(file).href
      const marker = path.join(dir, "called.txt")
      const meta = path.join(dir, "plugin-meta.json")

      await Bun.write(
        file,
        `export default {
  id: "demo.pure",
  tui: async (_api, options) => {
    if (!options?.marker) return
    await Bun.write(options.marker, "called")
  },
}
`,
      )

      return { spec, marker, meta }
    },
  })

  const pure = process.env.ORCHESTRA_PURE
  const meta = process.env.ORCHESTRA_PLUGIN_META_FILE
  process.env.ORCHESTRA_PURE = "1"
  process.env.ORCHESTRA_PLUGIN_META_FILE = tmp.extra.meta

  const config = createTuiResolvedConfig({
    plugin: [[tmp.extra.spec, { marker: tmp.extra.marker }]],
    plugin_origins: [
      {
        spec: [tmp.extra.spec, { marker: tmp.extra.marker }],
        scope: "local",
        source: path.join(tmp.path, "tui.json"),
      },
    ],
  })
  const wait = spyOn(TuiConfig, "waitForDependencies").mockResolvedValue()
  const cwd = spyOn(process, "cwd").mockImplementation(() => tmp.path)

  try {
    await TuiPluginRuntime.init({ api: createTuiPluginApi(), config })
    expect(await rethrow(fs.readFile(tmp.extra.marker, "utf8"))).toThrow()
  } finally {
    await TuiPluginRuntime.dispose()
    cwd.mockRestore()
    wait.mockRestore()
    if (pure === undefined) {
      delete process.env.ORCHESTRA_PURE
    } else {
      process.env.ORCHESTRA_PURE = pure
    }
    if (meta === undefined) {
      delete process.env.ORCHESTRA_PLUGIN_META_FILE
    } else {
      process.env.ORCHESTRA_PLUGIN_META_FILE = meta
    }
  }
})
