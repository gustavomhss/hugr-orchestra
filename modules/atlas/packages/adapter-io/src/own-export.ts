// @atlas/adapter-io — src/own-export.ts  (R7 / D21: the reviewed Own snapshot, built from the live store)
//
// `scripts/materialize-own-snapshot.mjs` writes OWN-SNAPSHOT.json and the static Own skills from a REVIEWED snapshot
// file, and refuses input from `.atlas/`. This module builds that input from the live store: each named unit's pack is
// the composed `own` leg's briefing (the one `atlas own` serves), anchored to every regular file git tracks under the
// unit at HEAD — conservative whole-file freshness (own-protocol, "CI Freshness Path"). The materializer replaces the
// WHOLE snapshot, so every committed unit that is not named is carried unchanged. `exportOwnSnapshot`
// (@atlas/retrieval) judges the result and names every fact that is not FRESH.

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { exportOwnSnapshot, OWN_SNAPSHOT_PATH, parseOwnSnapshot } from "@atlas/retrieval"
import type { OwnSnapshot, OwnSnapshotUnit } from "@atlas/retrieval"
import type { OwnLeg } from "./own-source.js"
import { headSha, runGit } from "./run-git.js"

export type OwnExport =
  | {
      readonly ok: true
      readonly snapshot: OwnSnapshot
      readonly rebuilt: readonly string[]
      readonly carried: readonly string[]
    }
  | { readonly ok: false; readonly reason: string }

/** Build the reviewed snapshot for `units` (repository paths relative to `repoPath`). Writes nothing. */
export function buildOwnExport(repoPath: string, own: OwnLeg, units: readonly string[]): OwnExport {
  const head = headSha(repoPath)
  if (head === undefined) return { ok: false, reason: `'${repoPath}' has no readable HEAD commit` }
  const committed = committedSnapshot(repoPath)
  if (committed === "malformed") {
    return { ok: false, reason: `${OWN_SNAPSHOT_PATH} exists and does not parse; fix or remove it before exporting` }
  }
  const named = [...new Set(units)].sort()
  const rebuilt = named.map(
    (unit): OwnSnapshotUnit => ({
      unit: { level: "module", id: unit, grounding: treeAt(repoPath, head, unit) },
      sourceBlobs: blobsAt(repoPath, head, unit),
      pack: own(unit).pack,
    }),
  )
  const empty = rebuilt.filter((entry) => Object.keys(entry.sourceBlobs).length === 0).map((entry) => entry.unit.id)
  if (empty.length > 0) {
    return { ok: false, reason: `no tracked file at HEAD under: ${empty.join(", ")} — a unit is a repository path` }
  }
  const carried = (committed?.units ?? []).filter((entry) => !named.includes(entry.unit.id))
  const all = [...rebuilt, ...carried].sort((a, b) => (a.unit.id < b.unit.id ? -1 : a.unit.id > b.unit.id ? 1 : 0))
  try {
    const snapshot = exportOwnSnapshot({ snapshot: `atlas-own-export:${head}`, sourceRevision: head, units: all })
    return { ok: true, snapshot, rebuilt: named, carried: carried.map((entry) => entry.unit.id) }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

/** The committed snapshot at the repository root, none when absent, or "malformed". */
function committedSnapshot(repoPath: string): OwnSnapshot | undefined | "malformed" {
  const path = join(repoPath, OWN_SNAPSHOT_PATH)
  if (!existsSync(path)) return undefined
  return parseOwnSnapshot(readFileSync(path, "utf8")) ?? "malformed"
}

/** Every regular file git tracks under `unit` at `head`: path (relative to `repoPath`) → blob id. Symlinks, submodules
 *  and `.atlas/` paths are left out — the materializer refuses all three as anchors. */
function blobsAt(repoPath: string, head: string, unit: string): Record<string, string> {
  const entries = runGit(repoPath, ["ls-tree", "-r", "-z", head, "--", unit])
    .split("\0")
    .filter((line) => line !== "")
    .map((line) => {
      const tab = line.indexOf("\t")
      const meta = line.slice(0, tab).split(" ")
      return { mode: meta[0] ?? "", type: meta[1] ?? "", blob: meta[2] ?? "", path: line.slice(tab + 1) }
    })
  return Object.fromEntries(
    entries
      .filter((entry) => entry.type === "blob" && entry.mode !== "120000" && !entry.path.split("/").includes(".atlas"))
      .map((entry) => [entry.path, entry.blob]),
  )
}

/** The unit's git tree id at `head` — its structural identity — or null when git has none. */
function treeAt(repoPath: string, head: string, unit: string): string | null {
  try {
    return runGit(repoPath, ["rev-parse", `${head}:./${unit === "." ? "" : unit}`]).trim()
  } catch {
    return null
  }
}
