import { createRequire } from "node:module"
import type { LeanMetrics } from "@orchestra/schema/lean-metrics"

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
export function decision(callID: string, patch: Partial<LeanMetrics.Decision> = {}): LeanMetrics.Decision {
  return {
    version: 1, scope: "standard-registry", engine: "hugr-lean@0.2.0:4e46ae0534937bdf",
    owner: { projectID: "native-repo", location: "/repo", sessionID: "one", callID },
    model: { provider: "provider", id: "model" }, producer: "native-shell",
    eligible: true, status: "applied", reason: "reduced", filterProfile: "cargo", orchestraProfile: "native",
    bytes: { before: 12, after: 4, saved: 8 },
    tokens: { kind: "estimated", counter: "chars-per-token-4", before: 3, after: 1, saved: 2 },
    durationMs: 1, ...patch,
  }
}
