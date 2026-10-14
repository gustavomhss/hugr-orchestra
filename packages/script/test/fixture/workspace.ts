import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { WorkspacePaths } from "../../src/workspace-paths.ts"

export function workspaceFixture(root: string, options: { version?: string; bootstrap?: boolean } = {}) {
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
    const file = path.join(root, path.relative(source.root, source.module("orchestra")), "package.json")
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
