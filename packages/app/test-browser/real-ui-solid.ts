import { createRequire } from "node:module"

// Compile the real components with the same Solid preset as Vite, rather than Bun's React JSX transform.
const solid = createRequire(Bun.resolveSync("vite-plugin-solid", import.meta.dir))
Bun.plugin({
  name: "real-ui-solid",
  setup(build) {
    // Match Vite's URL-only worker import; these Edit tests never start the markdown worker.
    build.onLoad({ filter: /\?worker&url$/ }, (args) => ({
      contents: `export default ${JSON.stringify(args.path.replace(/\?worker&url$/, ""))}`,
      loader: "js",
    }))
    build.onLoad({ filter: /\.tsx$/ }, async (args) => {
      const result = await solid("@babel/core").transformAsync(await Bun.file(args.path).text(), {
        filename: args.path,
        presets: [[solid("babel-preset-solid"), { generate: "dom" }]],
        parserOpts: { plugins: ["jsx", "typescript"] },
        configFile: false,
        babelrc: false,
      })
      return { contents: result.code, loader: "ts" }
    })
  },
})
