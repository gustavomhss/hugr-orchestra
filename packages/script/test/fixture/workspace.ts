import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

/** A source workspace owns its markers, declared modules and native domains. */
export function workspaceFixture(prefix: string) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), `${prefix} source-`)))
  const modules = [
    { alias: "maestro-arsenal", kind: "bun", scope: ".", name: "@orchestra/maestro-arsenal", path: "tools/parser source" },
  ]
  const domains = {
    omni: { path: "native/omni", manifest: "Cargo.toml" },
    atlas: { path: "domains/atlas", manifest: "package.json" },
  }
  const files = {
    "package.json": JSON.stringify({ name: "parser-fixture", private: true, type: "module", workspaces: ["tools/*"] }),
    "script/module-registry.json": JSON.stringify({ format: 1, modules }),
    "script/toolchain-registry.json": JSON.stringify({ format: 1, roots: domains }),
    ...Object.fromEntries(modules.map((entry) => [`${entry.path}/package.json`, JSON.stringify({ name: entry.name })])),
    ...Object.fromEntries(Object.values(domains).map((entry) => [`${entry.path}/${entry.manifest}`,
      entry.manifest === "Cargo.toml" ? "[workspace]\n" : JSON.stringify({ name: "atlas", private: true })])),
  }
  Object.entries(files).forEach(([file, content]) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), content)
  })
  return root
}
