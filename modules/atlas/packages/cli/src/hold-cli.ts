// @atlas/cli — src/hold-cli.ts  (R2: `atlas hold <nodeKey> --by <actor>` / `atlas release <nodeKey> --by <actor>`)
//
// A curator keeps a staged candidate OUT of every `atlas promote` by holding it, and lets it back in by releasing
// it. Each is one appended record in the review log (D14); staging is never edited (it has no delete, and its wire
// format is frozen), so "held" is a fold over the log that `dispatchPromote` reads before each pass. The latest
// hold/release per nodeKey wins. A hold is checked against the staged keys; a release only against the held set.

import { appendReview, stagedNodeKeys } from "@atlas/adapter-io"
import type { CliVerdict } from "./render.js"
import { foldOrRefuse, governedRefusal, requireBy, reviewOutcome, usageError } from "./review-common.js"

/** What hold/release read and write through — injected so a test needs no composed runtime. */
export interface HoldPorts {
  readonly repoPath: string
  readonly now: () => string
  /** The staged nodeKeys, or `undefined` when the staging sidecar cannot be read. */
  readonly staged: () => ReadonlySet<string> | undefined
}

/** The production ports: the repository at cwd, the wall clock, the real staging sidecar. */
export function holdPorts(): HoldPorts {
  const repoPath = process.cwd()
  return { repoPath, now: () => new Date().toISOString(), staged: () => stagedNodeKeys(repoPath) }
}

export function runHold(ports: HoldPorts, positionals: readonly string[], flags: Readonly<Record<string, string>>): CliVerdict {
  const by = requireBy(flags)
  if (by === undefined) return usageError("hold requires --by <actor>: the curator the hold is attributed to")
  const nodeKey = positionals[0] ?? ""
  const read = foldOrRefuse(ports.repoPath)
  if ("refusal" in read) return read.refusal
  if (read.fold.held.has(nodeKey)) return reviewOutcome(`'${nodeKey}' is already held — nothing was written`, [])
  const staged = ports.staged()
  if (staged === undefined) {
    return governedRefusal("hold: the staging sidecar could not be read, so the nodeKey cannot be checked against it; nothing was written")
  }
  if (!staged.has(nodeKey)) {
    return usageError(`hold: no staged candidate has nodeKey '${nodeKey}' — \`atlas promote\` prints each staged row's nodeKey`)
  }
  const record = appendReview(ports.repoPath, { kind: "hold", nodeKey, at: ports.now(), by })
  return reviewOutcome(`'${nodeKey}' is held: every \`atlas promote\` skips it until \`atlas release ${nodeKey} --by <you>\``, [
    `hold: ${record.id} ${nodeKey} by ${by}`,
  ])
}

export function runRelease(ports: HoldPorts, positionals: readonly string[], flags: Readonly<Record<string, string>>): CliVerdict {
  const by = requireBy(flags)
  if (by === undefined) return usageError("release requires --by <actor>: the curator the release is attributed to")
  const nodeKey = positionals[0] ?? ""
  const read = foldOrRefuse(ports.repoPath)
  if ("refusal" in read) return read.refusal
  if (!read.fold.held.has(nodeKey)) return usageError(`release: '${nodeKey}' is not held — \`atlas hold\` holds a staged candidate`)
  const record = appendReview(ports.repoPath, { kind: "release", nodeKey, at: ports.now(), by })
  return reviewOutcome(`'${nodeKey}' is released: the next \`atlas promote\` presents it again`, [`release: ${record.id} ${nodeKey} by ${by}`])
}
