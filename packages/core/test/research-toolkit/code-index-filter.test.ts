import { describe, expect, test } from "bun:test"
import path from "path"
import { CodeIndexFilter } from "../../src/research-toolkit/code-index/filter"

// T-X9: the language filter runs before every skip and there is no file cap (P0-3).

describe("code-index filter", () => {
  test("only supported languages enter; skips keep a reason", () => {
    const result = CodeIndexFilter.select([
      "README.md",
      "docs/guide.md",
      "assets/logo.png",
      "src/a.ts",
      "src/view.tsx",
      "src/legacy.js",
      "src/types.d.ts",
      "packages/client/src/generated/client.ts",
      "vendor/lib/x.ts",
      "node_modules/pkg/index.js",
      "tool/main.py",
      "dist.min.js",
    ])
    expect(result.files).toEqual([
      { path: "src/a.ts", grammar: "typescript" },
      { path: "src/view.tsx", grammar: "tsx" },
      { path: "src/legacy.js", grammar: "tsx" },
      { path: "tool/main.py", grammar: "python" },
    ])
    expect(result.skipped).toEqual([
      { path: "src/types.d.ts", reason: "generated" },
      { path: "packages/client/src/generated/client.ts", reason: "generated" },
      { path: "vendor/lib/x.ts", reason: "vendored-or-build" },
      { path: "node_modules/pkg/index.js", reason: "vendored-or-build" },
      { path: "dist.min.js", reason: "generated" },
    ])
  })

  test("shouldRead keeps the transplanted lockfile and binary skips", () => {
    expect(["bun.lock", "a/logo.png", "a/README.md"].map(CodeIndexFilter.shouldRead)).toEqual([false, false, true])
  })

  test("a grammar set narrows the selection", () => {
    expect(CodeIndexFilter.select(["a.ts", "b.py"], new Set(["python"])).files).toEqual([{ path: "b.py", grammar: "python" }])
  })

  test("every source file of packages/core/src is selected or skipped with a reason, past any 200 cap", async () => {
    const root = path.resolve(import.meta.dirname, "../../../..")
    const all = await Array.fromAsync(new Bun.Glob("packages/core/src/**/*").scan({ cwd: root, onlyFiles: true }))
    const paths = all.map((item) => item.replaceAll("\\", "/"))
    const source = paths.filter((item) => /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|pyi)$/.test(item))
    const result = CodeIndexFilter.select(paths)
    expect(source.length).toBeGreaterThan(200)
    expect(result.files.length + result.skipped.length).toBe(source.length)
    expect(result.files.length).toBeGreaterThan(200)
    expect(result.files.some((item) => item.path.endsWith(".md"))).toBe(false)
  })
})
