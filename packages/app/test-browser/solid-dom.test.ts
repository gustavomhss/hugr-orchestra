import { expect, test } from "bun:test"
import path from "node:path"
import { rewriteImports } from "./solid-dom"

const packages = path.resolve(import.meta.dir, "../..")
const compiled = (...segments: string[]) => JSON.stringify(`${path.join(packages, ...segments)}?solid-dom`)

test("workspace packages resolve to their sources and are rewritten; node_modules stays shared", () => {
  const code = [
    `import { DialogProvider } from "@orchestra/ui/context/dialog"`,
    `import { LeanDashboard } from "@orchestra/schema/lean-dashboard"`,
    `import { Part } from "@orchestra/session-ui/message-part"`,
    `export { useLanguage } from "@/context/language"`,
    `import { createSignal } from "solid-js"`,
  ].join("\n")
  const rewritten = rewriteImports(code, path.join(packages, "app/src/context/platform.tsx"))
  expect(rewritten).toContain(`from ${compiled("ui", "src", "context", "dialog.tsx")}`)
  expect(rewritten).toContain(`from ${compiled("schema", "src", "lean-dashboard.ts")}`)
  expect(rewritten).toContain(`from ${compiled("session-ui", "src", "components", "message-part.tsx")}`)
  expect(rewritten).toContain(`from ${compiled("app", "src", "context", "language.tsx")}`)
  expect(rewritten).not.toContain("node_modules")
  expect(rewritten).toContain(`import { createSignal } from "solid-js"`)
})

test("query, unresolvable and computed specifiers and look-alikes stay as written", () => {
  const code = [
    `import MarkdownWorkerUrl from "./markdown.worker.ts?worker&url"`,
    `import ShikiWorkerUrl from "@pierre/diffs/worker/worker.js?worker&url"`,
    `import { missing } from "./does-not-exist"`,
    `export const load = (name: string) => import(name)`,
    `export const lazy = () => import("../context/data")`,
    `// import "./markdown.worker"`,
    `export const text = 'from "./markdown.worker"'`,
    `console.log(MarkdownWorkerUrl, ShikiWorkerUrl, missing)`,
  ].join("\n")
  const rewritten = rewriteImports(code, path.join(packages, "session-ui/src/components/markdown-worker.ts"))
  expect(rewritten.split("\n")).toEqual([
    `import MarkdownWorkerUrl from "./markdown.worker.ts?worker&url"`,
    `import ShikiWorkerUrl from "@pierre/diffs/worker/worker.js?worker&url"`,
    `import { missing } from "./does-not-exist"`,
    `export const load = (name: string) => import(name)`,
    `export const lazy = () => import(${compiled("session-ui", "src", "context", "data.tsx")})`,
    `// import "./markdown.worker"`,
    `export const text = 'from "./markdown.worker"'`,
    `console.log(MarkdownWorkerUrl, ShikiWorkerUrl, missing)`,
  ])
})
