import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Effect } from "effect"
import { CodeIndexResolve } from "../../src/research-toolkit/code-index/resolve"
import { tmpdir } from "../fixture/tmpdir"

// T-X6: relative, alias (tsconfig paths and baseUrl through an extends chain), workspace (root workspaces and the
// exports map, with no node_modules installed), package and unresolved; Python by package roots.

const FILES: Record<string, string> = {
  "package.json": JSON.stringify({ name: "root", workspaces: { packages: ["packages/*"] } }),
  "tsconfig.base.json": JSON.stringify({ compilerOptions: { moduleResolution: "bundler", module: "esnext", paths: { "~/*": ["./shared/*"] } } }),
  "shared/util.ts": "export const u = 1\n",
  "packages/core/package.json": JSON.stringify({ name: "@fx/core", exports: { "./tool": "./src/tool/index.ts", "./*": "./src/*.ts" } }),
  "packages/core/src/session.ts": "export const s = 1\n",
  "packages/core/src/tool/index.ts": "export const t = 1\n",
  "packages/app/package.json": JSON.stringify({ name: "@fx/app" }),
  // A comment and a trailing comma: tsconfig is JSONC.
  "packages/app/tsconfig.json": `{ // app\n "extends": "../../tsconfig.base.json", "compilerOptions": { "baseUrl": "." , "paths": { "@/*": ["./src/*"] } }, }\n`,
  "packages/app/src/main.ts": "",
  "packages/app/src/helper.ts": "",
  "packages/app/src/dir/index.ts": "",
  "packages/app/src/view.tsx": "",
  "py/pyproject.toml": "",
  "py/src/pkg/__init__.py": "",
  "py/src/pkg/mod.py": "",
  "py/src/pkg/sub/leaf.py": "",
}

const fixture = async () => {
  const dir = await tmpdir()
  await Promise.all(Object.entries(FILES).map(async ([file, text]) => {
    await fs.mkdir(path.join(dir.path, path.dirname(file)), { recursive: true })
    await Bun.write(path.join(dir.path, file), text)
  }))
  return dir
}

describe("code-index resolve", () => {
  test("TypeScript specifiers resolve to every kind, none dropped", async () => {
    await using dir = await fixture()
    const resolver = await Effect.runPromise(CodeIndexResolve.make(dir.path))
    const from = "packages/app/src/main.ts"
    const cases: Record<string, CodeIndexResolve.Resolution> = {
      "./helper.js": { kind: "relative", to: "packages/app/src/helper.ts" },
      "./dir": { kind: "relative", to: "packages/app/src/dir/index.ts" },
      "./view": { kind: "relative", to: "packages/app/src/view.tsx" },
      "./missing": { kind: "unresolved" },
      "@/helper": { kind: "alias", to: "packages/app/src/helper.ts" },
      "src/helper": { kind: "alias", to: "packages/app/src/helper.ts" },
      "@fx/core/session": { kind: "workspace", to: "packages/core/src/session.ts" },
      "@fx/core/tool": { kind: "workspace", to: "packages/core/src/tool/index.ts" },
      "@fx/core/absent": { kind: "unresolved" },
      "@/absent": { kind: "unresolved" },
      effect: { kind: "package" },
      "node:fs": { kind: "package" },
    }
    expect(Object.fromEntries(Object.keys(cases).map((specifier) => [specifier, resolver.resolve(from, specifier)]))).toEqual(cases)
  })

  test("paths come from the nearest tsconfig's extends chain", async () => {
    await using dir = await fixture()
    await fs.writeFile(path.join(dir.path, "packages/app/tsconfig.json"), JSON.stringify({ extends: "../../tsconfig.base.json" }))
    const resolver = await Effect.runPromise(CodeIndexResolve.make(dir.path))
    expect(resolver.resolve("packages/app/src/main.ts", "~/util")).toEqual({ kind: "alias", to: "shared/util.ts" })
  })

  test("Python resolves by package roots, src layout first, and relative dots", async () => {
    await using dir = await fixture()
    const resolver = await Effect.runPromise(CodeIndexResolve.make(dir.path))
    const from = "py/src/pkg/sub/leaf.py"
    expect(resolver.resolve(from, "pkg.mod")).toEqual({ kind: "alias", to: "py/src/pkg/mod.py" })
    expect(resolver.resolve(from, "pkg")).toEqual({ kind: "alias", to: "py/src/pkg/__init__.py" })
    expect(resolver.resolve(from, "..mod")).toEqual({ kind: "relative", to: "py/src/pkg/mod.py" })
    expect(resolver.resolve(from, ".")).toEqual({ kind: "unresolved" })
    expect(resolver.resolve(from, ".nope")).toEqual({ kind: "unresolved" })
    expect(resolver.resolve(from, "requests")).toEqual({ kind: "package" })
  })

  test("this repository's own aliases and workspace exports resolve", async () => {
    const root = path.resolve(import.meta.dirname, "../../../..")
    const resolver = await Effect.runPromise(CodeIndexResolve.make(root))
    const from = "apps/orchestra/src/tool/shell/scan.ts"
    expect(resolver.resolve(from, "@/util/lazy")).toEqual({ kind: "alias", to: "apps/orchestra/src/util/lazy.ts" })
    expect(resolver.resolve(from, "@orchestra/core/research-toolkit/code-index/types")).toEqual({
      kind: "workspace",
      to: "packages/core/src/research-toolkit/code-index/types.ts",
    })
    expect(resolver.resolve("packages/core/src/database/index.ts", "#sqlite")).toEqual({
      kind: "alias",
      to: "packages/core/src/database/sqlite.bun.ts",
    })
  })
})
