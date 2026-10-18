import { createRequire } from "node:module"
import path from "node:path"

// Bun compiles .tsx with React's JSX transform, and every file in a `bun test` run shares one module registry. A
// Bun.plugin registered by a test therefore never sees a module that an earlier file already loaded: that copy stays
// React-compiled ("React is not defined"), and which modules are already loaded depends on the platform's file order.
// solidDom() names a module under a ?solid-dom specifier. The plugin below compiles it with the app's Solid preset and
// rewrites each static import, re-export and string-literal dynamic import of a repository .ts/.tsx file to the same
// specifier, so the local graph those imports reach is Solid-compiled whatever ran before. A dynamic import of a computed
// specifier is not rewritten and loads the plain module. Packages under node_modules (solid-js above all) stay single
// shared copies, as do specifiers that carry their own query (asset imports such as ?worker&url) or do not resolve.
const suffix = "?solid-dom"
const compiler = createRequire(Bun.resolveSync("vite-plugin-solid", import.meta.dir))
const scanner = new Bun.Transpiler({ loader: "ts" })
Bun.plugin({
  name: "solid-dom",
  setup(build) {
    build.onLoad({ filter: /\.tsx?\?solid-dom$/ }, async (args) => {
      const file = args.path.slice(0, -suffix.length)
      const source = await Bun.file(file).text()
      const code = file.endsWith(".tsx")
        ? (
            await compiler("@babel/core").transformAsync(source, {
              filename: file,
              presets: [[compiler("babel-preset-solid"), { generate: "dom" }]],
              parserOpts: { plugins: ["jsx", "typescript"] },
              configFile: false,
              babelrc: false,
            })
          ).code
        : source
      return { contents: rewriteImports(code, file), loader: "ts" }
    })
  },
})

// Only specifiers the transpiler reports as real imports are rewritten, never look-alikes in comments or strings.
export function rewriteImports(code: string, file: string) {
  const specs = new Set(scanner.scanImports(code).map((item) => item.path))
  return code.replace(/(\bfrom\s*|\bimport\s*\(?\s*)(["'])([^"']+)\2/g, (match: string, lead: string, _quote: string, spec: string) => {
    if (!specs.has(spec) || spec.includes("?")) return match
    // A specifier the test resolver cannot place stays as written, so Bun reports or loads it exactly as without this
    // plugin.
    const resolved = (() => {
      try {
        return Bun.resolveSync(spec, path.dirname(file))
      } catch {
        return undefined
      }
    })()
    if (!resolved || /[\\/]node_modules[\\/]/.test(resolved) || !/\.tsx?$/.test(resolved)) return match
    // JSON-quote the path: Windows paths carry backslashes that a raw string literal would read as escapes.
    return `${lead}${JSON.stringify(`${resolved}${suffix}`)}`
  })
}

export function solidDom(specifier: string, dir: string) {
  return `${Bun.resolveSync(specifier, dir)}${suffix}`
}
