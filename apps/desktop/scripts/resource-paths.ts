export * as ResourcePaths from "./resource-paths.ts"

import path from "node:path"
import { WorkspacePaths } from "@orchestra/script/workspace-paths"

export function make(start: string) {
  const workspace = WorkspacePaths.make(start)
  const desktop = workspace.module("desktop")
  const cli = workspace.module("cli")
  return {
    root: workspace.root,
    desktop,
    cli,
    claudeCode: workspace.module("engine-claude-code"),
    app: workspace.module("app"),
    omni: workspace.domain("omni"),
    cliDist: path.join(cli, "dist"),
    cliResources: path.join(desktop, "resources/cli"),
    signWindows: path.join(workspace.root, "script/sign-windows.ps1"),
  }
}
