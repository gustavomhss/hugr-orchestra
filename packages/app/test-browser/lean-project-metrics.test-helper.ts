import { createRequire } from "node:module"
import type { LeanMetrics } from "@orchestra/schema/lean-metrics"
import type { ToolPart } from "@orchestra/sdk/v2/client"

// Browser-lane only: compile JSX using the app's own Solid preset.
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

export const { createRoot, createComponent, createMemo }: typeof import("solid-js") = await import("solid-js")
export const { createStore }: typeof import("solid-js/store") = await import("solid-js/store")
export const { render }: typeof import("solid-js/web") = await import("solid-js/web")
// Saved wire objects are mutable Solid state even though decoded Decisions are readonly.
type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> }
export function decision(callID: string, patch: Partial<LeanMetrics.Decision> = {}): Mutable<LeanMetrics.Decision> {
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

export function savedLeanPart<T>(messageID: string, sessionID: string, callID: string, lean: T) {
  return {
    id: `part-${messageID}-${callID}`, messageID, sessionID, callID, type: "tool" as const, tool: "bash",
    state: {
      status: "completed" as const, input: {}, output: "", title: "",
      metadata: { lean }, time: { start: 1, end: 2 },
    },
  } satisfies ToolPart
}
