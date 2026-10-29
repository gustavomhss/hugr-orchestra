// @atlas/adapter-io — src/respawn-brief.ts  (the brief a re-spawned run starts from)
//
// Re-spawn starts a new run of a card from the committed record (repo-layout design §3, Attempt; §8 step 6). It never
// replays the old run's model calls. From `.atlas/` alone it gathers:
//
// - the attempt file, which names the card, seat, session, engine and model;
// - the seat's own closing fold for the card, read from its memory folder by `makeRespawn` (MEM-13);
// - the session's context archive, so `context_recall` can quote the prior run;
// - whether the transcript blob is committed.
//
// Starting the new V2 Session with this brief is the host's step: Atlas has no Orchestra dependency.

import { existsSync } from "node:fs"
import type { Hash } from "@atlas/contracts"
import type { ClosingFold } from "@atlas/memory"
import type { AttemptMetering } from "@atlas/persist"
import { readAttempt } from "./card-log.js"
import { readContext } from "./context-log.js"
import type { ContextReference } from "./context-log.js"
import { blobPath } from "./layout.js"
import { createMemoryRead } from "./memory-read.js"
import { createDurableMemory } from "./memory-store.js"
import { createRepoTranscriptStore } from "./transcript-blobs.js"

export interface RespawnBrief {
  readonly card: string
  readonly attempt: number
  readonly metering: AttemptMetering
  /** The seat's own closing fold for the card; absent when the seat archived none. */
  readonly fold?: ClosingFold
  readonly context: readonly ContextReference[]
  /** True when the transcript blob is committed and still matches its hash. False on a public clone. */
  readonly transcript: boolean
  /** The brief text the new run is prompted with. */
  readonly text: string
}

/** The brief for re-spawning attempt `n` of `card`, or undefined when that attempt was never recorded. */
export function respawnBrief(repoPath: string, card: string, n: number): RespawnBrief | undefined {
  const entry = readAttempt(repoPath, card, n).entry
  if (entry === undefined) return undefined
  const m = entry.metering
  const spawned = createMemoryRead({ store: createDurableMemory(repoPath), actor: m.seat }).spawnFold({ kind: "task", id: card })
  const fold = spawned.ok ? spawned.fold : undefined
  const context = readContext(repoPath, m.seat, m.session).references
  const transcript = transcriptCommitted(repoPath, m.transcriptSha)
  return {
    card,
    attempt: n,
    metering: m,
    ...(fold === undefined ? {} : { fold }),
    context,
    transcript,
    text: renderBrief(card, n, m, fold, context, transcript),
  }
}

function transcriptCommitted(repoPath: string, sha: Hash): boolean {
  if (sha === "" || !existsSync(blobPath(repoPath, sha))) return false
  try {
    createRepoTranscriptStore(repoPath, { commit: false }).fetch({ store: "cas", sha })
    return true
  } catch {
    return false
  }
}

function renderBrief(
  card: string,
  n: number,
  m: AttemptMetering,
  fold: ClosingFold | undefined,
  context: readonly ContextReference[],
  transcript: boolean,
): string {
  const lines = [
    `Re-spawn of ${card}, attempt a${n}. Start a new run of this card from the record below; the old run's model calls are not replayed.`,
    "",
    `Prior run: seat ${m.seat}, session ${m.session}, engine ${m.engine}, model ${m.model}, verdict ${m.verdict}, gates ${m.gates.join(", ") || "none"}.`,
  ]
  const recall = fold === undefined
    ? ["", "No closing fold of this card is archived in the seat's memory."]
    : [
        "",
        "Closing fold of the prior run:",
        ...fold.attempted.map((line) => `- attempted: ${line}`),
        ...fold.failedWith.map((line) => `- failed with: ${line}`),
        `- stopped at: ${fold.stoppedAt}`,
        `- lesson: ${fold.lesson}`,
      ]
  const archive = context.length === 0
    ? ["", "The prior session archived no context."]
    : [
        "",
        "Context the prior session archived (recall a chunk with `context_recall` and its id):",
        ...context.map((ref) => `- ${ref.id.slice(0, 12)} ${ref.title} (${ref.bytes} bytes)`),
      ]
  const trail = transcript
    ? ["", `The prior transcript is committed at .atlas/blobs/ as ${m.transcriptSha}.`]
    : ["", "The prior transcript is not committed in this clone."]
  return [...lines, ...recall, ...archive, ...trail].join("\n")
}
