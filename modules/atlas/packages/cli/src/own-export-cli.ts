// @atlas/cli — src/own-export-cli.ts  (R7 / D21: `atlas own-export <unit...> --out <file>`)
//
// Writes the reviewed-snapshot input of `scripts/materialize-own-snapshot.mjs` from the live store (adapter-io
// `buildOwnExport` over the composed `own` leg). It never writes OWN-SNAPSHOT.json itself: a person reviews the file,
// then the materializer checks it against git and writes the snapshot and the static Own skills.

import { writeFileSync } from "node:fs"
import { resolve, sep } from "node:path"
import { buildOwnExport } from "@atlas/adapter-io"
import type { OwnExport } from "@atlas/adapter-io"
import type { CliDeps } from "./cli.js"
import type { CliVerdict } from "./render.js"
import { flagValue, NOT_COMPOSED, opsOutcome, opsRefusal, opsUsage } from "./ops-common.js"

export const OWN_EXPORT_INVARIANT =
  "OWN-EXPORT (D21): a reviewed Own snapshot is built from the live store's own briefings and HEAD's blobs and is refused while any fact in it is not FRESH; the materializer, never this command, writes OWN-SNAPSHOT.json"

/** What the runner reads through — injected so a test needs no composed runtime. */
export interface OwnExportPorts {
  readonly repoPath: string
  /** Absent when the runtime is not composed (no `own` leg). */
  readonly exportUnits: ((units: readonly string[]) => OwnExport) | undefined
}

/** The production ports: the repository at cwd and the composed `own` leg. */
export function ownExportPorts(deps: CliDeps): OwnExportPorts {
  const repoPath = process.cwd()
  const own = deps.own
  return { repoPath, exportUnits: own === undefined ? undefined : (units) => buildOwnExport(repoPath, own, units) }
}

export function runOwnExport(
  ports: OwnExportPorts,
  positionals: readonly string[],
  flags: Readonly<Record<string, string>>,
): CliVerdict {
  if (positionals.length === 0) return opsUsage("own-export requires at least one <unit>: a repository path such as packages/cli")
  const out = flagValue(flags, "out")
  if (out === undefined) return opsUsage("own-export requires --out <file>: where the reviewed snapshot is written")
  const target = resolve(ports.repoPath, out)
  if (target.split(sep).includes(".atlas")) {
    return opsUsage("own-export: --out may not be inside .atlas — the materializer refuses input from there")
  }
  if (ports.exportUnits === undefined) return opsUsage(NOT_COMPOSED)
  const exported = ports.exportUnits(positionals)
  if (!exported.ok) return opsRefusal(`own-export: ${exported.reason}`)
  writeFileSync(target, `${JSON.stringify(exported.snapshot, null, 2)}\n`)
  return opsOutcome(
    OWN_EXPORT_INVARIANT,
    `review ${out}, then \`npm run own-snapshot-materialize -- ${out}\` writes OWN-SNAPSHOT.json and the static Own skills`,
    [
      `snapshot: ${exported.snapshot.snapshot} (${exported.snapshot.units.length} unit(s))`,
      ...exported.rebuilt.map((unit) => `rebuilt ${unit}`),
      ...exported.carried.map((unit) => `carried ${unit} — unchanged from the committed OWN-SNAPSHOT.json`),
    ],
  )
}
