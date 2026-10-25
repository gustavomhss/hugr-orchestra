import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"
import { WorkspacePaths } from "../../src/workspace-paths.ts"

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

/** A copy of the real workspace manifests and registries, for consumers that resolve the live registry. */
export function copiedWorkspaceFixture(root: string, options: { version?: string; bootstrap?: boolean } = {}) {
  const source = WorkspacePaths.make(import.meta.dirname)
  const copy = (file: string) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    copyFileSync(path.join(source.root, file), path.join(root, file))
  }
  ;["package.json", ".github/TEAM_MEMBERS", "script/module-registry.json", "script/toolchain-registry.json"].forEach(copy)
  source.entries.forEach((entry) => copy(`${path.relative(source.root, entry.path)}/package.json`))
  copy(`${path.relative(source.root, source.domain("omni"))}/Cargo.toml`)
  copy(`${path.relative(source.root, source.domain("atlas"))}/package.json`)
  if (options.version !== undefined) {
    const file = path.join(root, path.relative(source.root, source.module("cli")), "package.json")
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), version: options.version }))
  }
  if (options.bootstrap) {
    // The real index's local dependency closure, including namespace self-reexports; no resolver implementations are replaced.
    ;["index.ts", "workspace-paths.ts", "module-catalog.ts", "module-resolver.ts"].forEach((file) =>
      copy(`${path.relative(source.root, source.module("script"))}/src/${file}`),
    )
    mkdirSync(path.join(root, "node_modules"))
    cpSync(path.dirname(createRequire(import.meta.url).resolve("semver/package.json")), path.join(root, "node_modules/semver"), { recursive: true, dereference: true })
  }
  return WorkspacePaths.make(root)
}
