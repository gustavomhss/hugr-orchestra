import { expect, test } from "bun:test"
import type { BunPlugin } from "bun"
import { createRuntimePlugin, runtimeModuleIdForSpecifier } from "@opentui/core/runtime-plugin"
import { readFileSync } from "node:fs"
import path from "node:path"
import { tmpdir } from "../../fixture/fixture"

type Builder = Parameters<BunPlugin["setup"]>[0]

// Capture public plugin hooks, not a copy of its collector or rewriter. Tests
// invoke production onResolve/onLoad; the integration test uses registered Bun.
function hooks() {
  const load: Parameters<Builder["onLoad"]>[] = []
  const resolve: Parameters<Builder["onResolve"]>[] = []
  createRuntimePlugin().setup({
    config: { entrypoints: [], plugins: [] },
    module() {
      return this
    },
    onStart() {
      throw new Error("Unexpected runtime plugin onStart hook")
    },
    onEnd() {
      throw new Error("Unexpected runtime plugin onEnd hook")
    },
    onBeforeParse() {
      throw new Error("Unexpected runtime plugin onBeforeParse hook")
    },
    onLoad(...args: Parameters<Builder["onLoad"]>) {
      load.push(args)
      return this
    },
    onResolve(...args: Parameters<Builder["onResolve"]>) {
      resolve.push(args)
      return this
    },
  } satisfies Builder)
  return {
    load,
    resolve(file: string) {
      const callback = resolve.at(-1)![1]
      return callback({
        path: file,
        importer: import.meta.path,
        namespace: "file",
        resolveDir: import.meta.dir,
        kind: "import-statement",
      })
    },
    async contents(file: string) {
      this.resolve(file)
      const callback = load.find(([options]) => options.filter.test(file))?.[1]
      expect(callback).toBeDefined()
      const output = await callback!({
        path: file,
        namespace: "file",
        loader: file.endsWith(".tsx") ? "tsx" : "ts",
        defer: async () => {
          throw new Error("Unexpected runtime loader defer call")
        },
      })
      if (!output || !("contents" in output) || typeof output.contents !== "string") {
        throw new Error("Production runtime loader did not return source text")
      }
      return output.contents
    },
  }
}

test("production dependency rewrites syntax ranges, preserving identical import-shaped TS/TSX data", async () => {
  const plugin = hooks()
  for (const extension of ["ts", "tsx"]) {
    const file = path.join(import.meta.dir, `runtime-import-syntax.fixture.${extension}`)
    const input = readFileSync(file, "utf8")
    const output = await plugin.contents(file)
    const start = input.indexOf("// Data starts here.")
    const end = input.indexOf("// Data ends here.") + "// Data ends here.".length
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    expect(
      output.slice(output.indexOf("// Data starts here."), output.indexOf("// Data ends here.") + "// Data ends here.".length),
    ).toBe(input.slice(start, end))
    expect(output).toContain(`import { RGBA } from ${JSON.stringify(runtimeModuleIdForSpecifier("@opentui/core"))}`)
    expect(plugin.load.every(([options]) => !options.filter.test(path.join(import.meta.dir, "unrelated.ts")))).toBe(true)
  }
})

test("production dependency handles escapes, trivia, CRLF and all string-literal module positions", async () => {
  await using tmp = await tmpdir()
  const target = JSON.stringify(runtimeModuleIdForSpecifier("@opentui/core"))
  const cases = [
    ['import { RGBA } from "@opentui/core"', `import { RGBA } from ${target}`],
    ['import type { KeyEvent } from "@opentui/core"', `import type { KeyEvent } from ${target}`],
    ['import "@opentui/core"', `import ${target}`],
    ['export * from "@opentui/core"', `export * from ${target}`],
    ['export { RGBA } from "@opentui/core"', `export { RGBA } from ${target}`],
    ['export type { KeyEvent } from "@opentui/core"', `export type { KeyEvent } from ${target}`],
    ['import Core = require("@opentui/core")', `import Core = require(${target})`],
    ['type Core = typeof import("@opentui/core")', `type Core = typeof import(${target})`],
    ['const lazy = import /* trivia */ ("@opentui/core")', `const lazy = import /* trivia */ (${target})`],
    ['const required = require /* trivia */ ("@opentui/core")', `const required = require /* trivia */ (${target})`],
    [String.raw`import { RGBA as escaped } from "@opentui\u002fcore"`, `import { RGBA as escaped } from ${target}`],
    [String.raw`const hex = require('@opentui\x2fcore')`, `const hex = require(${target})`],
  ]
  const data = [
    'const unicode = "🦣 café 日本語"',
    '// import { RGBA } from "@opentui/core"',
    '/* export * from "@opentui/core" */',
    'const prose = \'require("@opentui/core")\'',
    'const template = `import("@opentui/core")`',
    'const interpolation = `from "@opentui/core" ${"🦣"}`',
    'const computed = import("@opentui/" + name)',
    'const templateImport = import(`@opentui/core`)',
    'const wrapped = loader.require("@opentui/core")',
    'import "./relative.ts"',
    'import "node:path"',
    'import "https://example.test/module.js"',
  ].join("\r\n")
  const file = path.join(tmp.path, "syntax.ts")
  await Bun.write(file, [data, ...cases.map((item) => item[0])].join("\r\n"))
  expect(await hooks().contents(file)).toBe([data, ...cases.map((item) => item[1])].join("\r\n"))
})

test("production prescan sees escaped real runtime imports, ignores node_modules prose and unrelated CJS", async () => {
  await using tmp = await tmpdir()
  const root = path.join(tmp.path, "node_modules", "syntax-probe")
  await Bun.write(path.join(root, "package.json"), JSON.stringify({ type: "module" }))
  const prose = path.join(root, "prose.js")
  const cjs = path.join(root, "helper.cjs")
  const actual = path.join(root, "actual.ts")
  const entry = path.join(root, "entry.js")
  await Bun.write(prose, 'export const text = \'import { RGBA } from "@opentui/core"\'')
  await Bun.write(cjs, '// require("@opentui/core")\nmodule.exports = require("node:path")')
  await Bun.write(actual, String.raw`export { RGBA } from "@opentui\u002fcore"`)
  await Bun.write(entry, 'export { RGBA } from "./actual.ts"')
  const plugin = hooks()
  plugin.resolve(prose)
  plugin.resolve(cjs)
  expect(plugin.load).toHaveLength(0)
  plugin.resolve(entry)
  expect(plugin.load.some(([options]) => options.filter.test(actual))).toBe(true)
  expect(await plugin.contents(actual)).toBe(`export { RGBA } from ${JSON.stringify(runtimeModuleIdForSpecifier("@opentui/core"))}`)
})

test("production loader leaves unrelated CommonJS workspace helpers native-loaded", async () => {
  await using tmp = await tmpdir()
  await Bun.write(path.join(tmp.path, "package.json"), JSON.stringify({ type: "commonjs" }))
  const plugin = hooks()
  for (const extension of ["js", "cjs", "cts"]) {
    const file = path.join(tmp.path, `helper.${extension}`)
    await Bun.write(file, 'const fs = require("node:fs"); module.exports = { run: fs.existsSync }')
    plugin.resolve(file)
  }
  expect(plugin.load).toHaveLength(0)
  const runtime = path.join(tmp.path, "runtime.js")
  await Bun.write(runtime, 'export { RGBA } from "@opentui/core"')
  expect(await plugin.contents(runtime)).toBe(`export { RGBA } from ${JSON.stringify(runtimeModuleIdForSpecifier("@opentui/core"))}`)
})

test("production TUI bootstrap then late import preserves fixed data and host runtime identities", async () => {
  // Same registration entry used by plugin-loader.test.ts. Do not isolate the
  // boundary guard: run predecessor + this test + mode-boundary in one process.
  await import("../../../src/plugin/tui/runtime")
  const { RGBA } = await import("@opentui/core")
  const { Filesystem } = await import("@/util/filesystem")
  const fixture = await import("./runtime-import-syntax.fixture.ts")
  const jsx = await import("./runtime-import-syntax.fixture.tsx")
  expect(fixture.unicode).toBe("🦣 café 日本語")
  expect(fixture.data).toEqual([
    'import { RGBA } from "@opentui/core"',
    'import { Filesystem } from "@/util/filesystem"',
    'export * from "@opentui/core"',
    'import "@opentui/core"',
    'import("@opentui/core")',
    'require("@/util/filesystem")',
    'from "@opentui/core"',
    '🦣 import("@/util/filesystem")',
  ])
  expect(fixture.staticRGBA).toBe(RGBA)
  expect(fixture.reexportedRGBA).toBe(RGBA)
  // Runtime modules are async virtual modules. Rewriting require's literal is
  // covered above; synchronous execution retains Bun's existing rejection.
  expect(() => fixture.requireRGBA()).toThrow(
    `require() async module "${runtimeModuleIdForSpecifier("@opentui/core")}" is unsupported. use "await import()" instead.`,
  )
  expect(await fixture.dynamicRGBA()).toBe(RGBA)
  expect(fixture.filesystem).toBe(Filesystem)
  expect(await fixture.dynamicFilesystem()).toBe(Filesystem)
  expect(jsx.color).toBe(RGBA)
  expect(jsx.data).toEqual(['import("@opentui/core") require("@opentui/core")', 'from "@opentui/core"'])
})
