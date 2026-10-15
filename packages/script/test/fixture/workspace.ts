import { copyFileSync, mkdirSync } from "node:fs"
import path from "node:path"
import { WorkspacePaths } from "../../src/workspace-paths.ts"

// Copy the real source contract and Script's owned import closure, retaining registered paths and identities.
export function copyWorkspace(root: string) {
  const workspace = WorkspacePaths.make(import.meta.dir)
  const files = [
    ...["package.json", "script/module-registry.json", "script/toolchain-registry.json", ".github/TEAM_MEMBERS"].map((file) =>
      path.join(workspace.root, file),
    ),
    ...workspace.entries.map((entry) => path.join(entry.path, "package.json")),
    path.join(workspace.domain("omni"), "Cargo.toml"),
    path.join(workspace.domain("atlas"), "package.json"),
    ...["index.ts", "workspace-paths.ts", "module-catalog.ts", "module-resolver.ts"].map((file) =>
      path.join(workspace.module("script"), "src", file),
    ),
  ]
  files.forEach((file) => {
    const destination = path.join(root, path.relative(workspace.root, file))
    mkdirSync(path.dirname(destination), { recursive: true })
    copyFileSync(file, destination)
  })
  return WorkspacePaths.make(root)
}
