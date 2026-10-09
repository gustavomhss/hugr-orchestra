import { createRequire } from "node:module"

// Run this DOM test with --conditions=browser. Compile JSX using the app's own Solid preset.
const compiler = createRequire(Bun.resolveSync("vite-plugin-solid", import.meta.dir))
Bun.plugin({
  name: "lean-solid-dom",
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async (args) => {
      const result = await compiler("@babel/core").transformAsync(await Bun.file(args.path).text(), {
        filename: args.path,
        presets: [[compiler("babel-preset-solid"), { generate: "dom" }]],
        parserOpts: { plugins: ["jsx", "typescript"] },
        configFile: false,
        babelrc: false,
      })
      return { contents: result.code, loader: "ts" }
    })
  },
})

export const { createRoot, createComponent }: typeof import("solid-js") = await import("solid-js")
export const { createStore }: typeof import("solid-js/store") = await import("solid-js/store")
export const { render }: typeof import("solid-js/web") = await import("solid-js/web")
