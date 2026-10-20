// @atlas/adapter-io — src/surface/install.ts  (the Atlas UI surface: set Atlas up in a repository — D37)
//
// `install` is the one surface method that runs when `.atlas/` is absent. It creates the store directory, writes the
// admin policy that lets the acting person write every scope a drafted or mined fact can carry, and installs the
// ignore rule `atlas init` installs, so a `git add -A` cannot commit the store. It indexes nothing: the host runs the
// indexer the returned plan names (D38).
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { gitUserEmail } from "../compose.js"
import { ensureAtlasIgnored } from "../gitignore.js"
import { reportIndexPlan } from "../indexer-report.js"
import { trackedFiles } from "./read-git.js"
import type { AtlasInstallResult } from "./types.js"

/** The scope `atlas mine` stages its candidates under (cli/src/mine-staging.ts `MINED_SCOPE`). */
const MINED_SCOPE = "atlas:mined"

export function install(repoPath: string): AtlasInstallResult {
  const actor = process.env.ATLAS_ACTOR ?? gitUserEmail(repoPath) ?? ""
  if (existsSync(join(repoPath, ".atlas"))) return refused("already-installed", actor)
  if (!existsSync(join(repoPath, ".git"))) return refused("no-git", actor)
  if (actor === "") return refused("no-actor", actor)
  const scopes = [...new Set([...trackedFiles(repoPath).map(scopeOf), MINED_SCOPE])].sort()
  mkdirSync(join(repoPath, ".atlas"), { recursive: true })
  writeFileSync(
    join(repoPath, ".atlas", "policy.json"),
    `${JSON.stringify(
      { t0Heuristic: { keywords: [] }, authz: { scopes: Object.fromEntries(scopes.map((scope) => [scope, [actor]])) } },
      null,
      2,
    )}\n`,
  )
  return {
    state: "ok",
    installed: true,
    refusal: null,
    actor,
    scopes,
    gitignore: ensureAtlasIgnored(repoPath).outcome,
    index: reportIndexPlan(repoPath),
  }
}

/** The scope `atlas draft` gives a fact at this path: its first segment, or the whole name of a top-level file
 *  (tools/src/draft.ts `scopeOf`). */
function scopeOf(path: string): string {
  const slash = path.indexOf("/")
  return slash < 0 ? path : path.slice(0, slash)
}

function refused(refusal: "already-installed" | "no-git" | "no-actor", actor: string): AtlasInstallResult {
  return { state: "ok", installed: false, refusal, actor, scopes: [], gitignore: null, index: null }
}
