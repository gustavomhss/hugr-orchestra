// @atlas/cli — src/decay-cli.ts  (`atlas decay [--window <n>] [--restore <nodeKey>]`)
//
// The KNOW-17 decay pass over the local hits ledger (adapter-io `openHits`, `.atlas/hits.jsonl`). The serve path
// logs a hit per advisory node it delivers; this command closes a window of `--window` hit events and archives the
// advisory nodes that collected none, so `atlas query` stops serving them. Their bytes stay in CAS and their rows
// stay in the projection. `--restore <nodeKey>` logs one hit for a node instead, which brings it back (KNOW-17d).

import { DECAY_WINDOW, openHits } from "@atlas/adapter-io"
import { asNodeKey } from "@atlas/kernel"
import type { CliVerdict } from "./render.js"
import { flagValue, opsOutcome, opsUsage } from "./ops-common.js"

export const DECAY_INVARIANT =
  "DECAY: an advisory node leaves the served set only after a whole window of hits passed it by; it is archived, never deleted, and one later hit brings it back"

export function runDecay(repoPath: string, flags: Readonly<Record<string, string>>): CliVerdict {
  const restore = flagValue(flags, "restore")
  if (restore !== undefined) {
    const entry = openHits(repoPath).logHit(asNodeKey(restore))
    return opsOutcome(DECAY_INVARIANT, `${restore} is served again by atlas query`, [`hits: ${entry.hits}`])
  }
  const text = flagValue(flags, "window")
  const window = text === undefined ? DECAY_WINDOW : Number(text)
  if (!Number.isInteger(window) || window < 1) return opsUsage("usage: atlas decay [--window <n>] [--restore <nodeKey>]")
  const pass = openHits(repoPath).decayPass(window)
  if (pass.kind === "baseline") {
    return opsOutcome(DECAY_INVARIANT, `run atlas decay again after ${window} hit(s) to close the first window`, [
      `opened: ${pass.retained.length} advisory node(s) eligible`,
    ])
  }
  if (pass.kind === "open") {
    return opsOutcome(DECAY_INVARIANT, `the window is open: ${pass.seen} of ${window} hit(s) so far`, [
      `eligible: ${pass.retained.length} advisory node(s)`,
    ])
  }
  return opsOutcome(
    DECAY_INVARIANT,
    pass.decayed.length === 0 ? "nothing decayed: every eligible node was served" : "atlas query no longer serves the decayed node(s)",
    [
      `decayed: ${pass.decayed.length} node(s)`,
      `retained: ${pass.retained.length} node(s)`,
      ...pass.decayed.map((node) => `  ${node}`),
    ],
  )
}
