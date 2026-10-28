// @atlas/cli — src/migrate-layout-cli.ts  (`atlas migrate-layout`)
//
// The one-shot move of `.atlas/{memory,orientation,review}.jsonl` into the `.atlas/` tree (adapter-io
// `migrateLayout`). It changes files only; committing them is the caller's step, like any other source change.

import { migrateLayout } from "@atlas/adapter-io"
import type { CliVerdict } from "./render.js"
import { opsOutcome } from "./ops-common.js"

export const MIGRATE_LAYOUT_INVARIANT =
  "MIGRATE-LAYOUT: every legacy log line is copied byte for byte into the tree, so every event keeps its id; a memory line that names no owner and kind stays in .atlas/memory.jsonl"

export function runMigrateLayout(repoPath: string): CliVerdict {
  const moved = migrateLayout(repoPath)
  const next =
    moved.kept > 0
      ? `${moved.kept} memory line(s) name no owner and kind and stayed in .atlas/memory.jsonl; inspect them, then commit .atlas`
      : "commit .atlas: the legacy single-file logs are gone"
  return opsOutcome(MIGRATE_LAYOUT_INVARIANT, next, [
    `memory: ${moved.memory} line(s) moved to .atlas/members/<seat>/memory/`,
    `orientation: ${moved.orientation} line(s) moved to .atlas/project/orientation.jsonl`,
    `review: ${moved.review} line(s) moved to .atlas/project/review.jsonl`,
  ])
}
