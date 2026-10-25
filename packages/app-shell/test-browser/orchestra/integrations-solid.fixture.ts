import { createRequire } from "node:module"
import path from "node:path"

// Bun compiles JSX for React, and test files share one module registry: earlier files already loaded @orchestra/ui's
// helper.tsx that way, and a loaded module never reaches a plugin registered later. Load the Integrations graph under
// its own ?<suffix> specifier, compiling .tsx with Solid's Babel preset, following relay-policy.test.ts. Dynamic
// imports join too, so chapter-route's lazy registration resolves to the same isolated chapter module.
export function isolatedSolid(suffix: string) {
  const solid = createRequire(Bun.resolveSync("vite-plugin-solid", import.meta.dir))
  const tag = `?${suffix}`
  Bun.plugin({
    name: `solid-${suffix}`,
    setup(build) {
      build.onLoad({ filter: new RegExp(`\\.tsx?\\?${suffix}$`) }, async (args) => {
        const file = args.path.slice(0, -tag.length)
        const source = await Bun.file(file).text()
        const code = file.endsWith(".tsx")
          ? (
              await solid("@babel/core").transformAsync(source, {
                filename: file,
                presets: [[solid("babel-preset-solid"), { generate: "dom" }]],
                parserOpts: { plugins: ["jsx", "typescript"] },
                configFile: false,
                babelrc: false,
              })
            ).code
          : source
        const contents = code.replace(
          /(from\s+|import\(\s*)(["'])([^"']+)\2/g,
          (match: string, lead: string, _quote: string, spec: string) => {
            const resolved = Bun.resolveSync(spec, path.dirname(file))
            // JSON-quote the path: Windows paths carry backslashes that a raw string literal would read as escapes.
            return /\.tsx?$/.test(resolved) && !resolved.includes("node_modules")
              ? `${lead}${JSON.stringify(`${resolved}${tag}`)}`
              : match
          },
        )
        return { contents, loader: "ts" }
      })
    },
  })
  return (specifier: string) => import(`${Bun.resolveSync(specifier, import.meta.dir)}${tag}`)
}
