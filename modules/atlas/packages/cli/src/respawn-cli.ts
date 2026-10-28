// @atlas/cli — src/respawn-cli.ts  (`atlas respawn <CARD> a<n>`)
//
// Builds the brief that re-spawns attempt `n` of a card from the committed `.atlas/` record (adapter-io
// `respawnBrief`). It reads files only. Starting the new V2 Session with the brief is the host's step, like committing
// is the caller's step after `migrate-layout`.

import { respawnBrief } from "@atlas/adapter-io"
import type { CliVerdict } from "./render.js"
import { opsOutcome, opsRefusal, opsUsage } from "./ops-common.js"

export const RESPAWN_INVARIANT =
  "RESPAWN: the brief is built from the committed record alone and never replays the old run's model calls"

export function runRespawn(repoPath: string, positionals: readonly string[]): CliVerdict {
  const card = positionals[0] ?? ""
  const match = /^a([1-9][0-9]*)$/.exec(positionals[1] ?? "")
  if (card === "" || match === null) return opsUsage("usage: atlas respawn <CARD> a<n>")
  const n = Number(match[1])
  const brief = respawnBrief(repoPath, card, n)
  if (brief === undefined) return opsRefusal(`attempt a${n} of ${card} is not recorded in .atlas/cards/`)
  return opsOutcome(RESPAWN_INVARIANT, `start a new ${brief.metering.engine} Session for ${card} as seat ${brief.metering.seat} with the brief below`, [
    `seat: ${brief.metering.seat}`,
    `session: ${brief.metering.session}`,
    `fold: ${brief.fold === undefined ? "none" : "recalled"}`,
    `context: ${brief.context.length} reference(s)`,
    `transcript: ${brief.transcript ? "committed" : "not committed"}`,
    "brief:",
    brief.text,
  ])
}
