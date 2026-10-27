export * as ConfigTrust from "./trust"

import path from "path"
import { Effect, Schema } from "effect"
import { Config } from "../config"
import { FSUtil } from "../fs-util"

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

export class DirectoryError extends Schema.TaggedErrorClass<DirectoryError>()("ConfigTrust.DirectoryError", {
  message: Schema.String,
}) {}

/** The approved project folders in the user's global config, as written. A project's own `trusted_projects` never counts. */
export const list = Effect.fn("ConfigTrust.list")(function* () {
  return (yield* Config.readGlobal()).trustedProjects
})

/** Approves a project folder in the user's global config. A folder already trusted, directly or through a parent, changes nothing. */
export const approve = Effect.fn("ConfigTrust.approve")(function* (directory: string) {
  const root = yield* canonical(directory)
  const trusted = yield* list()
  if (trusted.some((item) => within(item, root))) return
  yield* Config.updateGlobal({ trustedProjects: [...trusted, root] })
})

/** Removes a folder's own entry from the user's global config. A folder trusted only through a parent stays trusted. */
export const revoke = Effect.fn("ConfigTrust.revoke")(function* (directory: string) {
  const fs = yield* FSUtil.Service
  const root = yield* fs.resolve(directory)
  const trusted = yield* list()
  const resolved = yield* Effect.forEach(trusted, (item) => fs.resolve(item))
  const kept = trusted.filter((_, index) => resolved[index] !== root)
  if (kept.length === trusted.length) return
  yield* Config.updateGlobal({ trustedProjects: kept })
})

export function approveHint(directory: string) {
  return `Add "${directory}" to trusted_projects in your user config to approve it.`
}

// The real path of an existing absolute folder, so a symlink and its target store as one entry.
const canonical = Effect.fnUntraced(function* (directory: string) {
  const fs = yield* FSUtil.Service
  if (!path.isAbsolute(directory))
    return yield* new DirectoryError({ message: `Project folder must be an absolute path: ${directory}` })
  if (!(yield* fs.isDir(directory)))
    return yield* new DirectoryError({ message: `Project folder does not exist: ${directory}` })
  const real = yield* fs.realPath(directory).pipe(Effect.orDie)
  if (path.parse(real).root === real)
    return yield* new DirectoryError({
      message: "The filesystem root cannot be trusted: it would approve every project on this machine.",
    })
  return real
})

// Whether `target` is `root` or inside it.
export function within(root: string, target: string) {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative.split(path.sep)[0] !== ".." && !path.isAbsolute(relative)
}
