export * as ConfigTrust from "./trust"

import path from "path"
import type { Config } from "../config"

// A repository's own config is not the user's: what it declares to run (MCP commands, plugins, formatter and LSP
// commands) is code the repository chose. Only documents and directories under the user's global config can approve a
// project, so a project file can never trust itself.

/** Whether a config entry is the user's own: under the global config folder, or a document with no file. */
export function isUser(globalConfig: string, entry: Config.Entry) {
  return entry.path === undefined || within(globalConfig, entry.path)
}

/** Whether `directory` is, or is inside, a path listed in `trusted_projects` of the user's own config. */
export function isTrusted(entries: readonly Config.Entry[], globalConfig: string, directory: string) {
  return entries
    .filter((entry): entry is Config.Document => entry.type === "document")
    .filter((entry) => isUser(globalConfig, entry))
    .flatMap((entry) => entry.info.trusted_projects ?? [])
    .some((root) => within(root, directory))
}

/** The entries whose declared commands may run: all of them for a trusted project, otherwise only the user's own. */
export function runnable(entries: readonly Config.Entry[], globalConfig: string, directory: string) {
  return isTrusted(entries, globalConfig, directory) ? entries : entries.filter((entry) => isUser(globalConfig, entry))
}

export function approveHint(directory: string) {
  return `Add "${directory}" to trusted_projects in your user config to approve it.`
}

// Whether `target` is `root` or inside it.
export function within(root: string, target: string) {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative.split(path.sep)[0] !== ".." && !path.isAbsolute(relative)
}
