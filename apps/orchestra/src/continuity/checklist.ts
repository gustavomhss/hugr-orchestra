import { guarded, scope, type Decoded, type Failure } from "./memory"
import type { Host, MemoryArtifact, MemorySnapshot } from "./memory-types"
import { sealChecklist } from "./checklist-seal"
import { fingerprint, ownedHistory, validSnapshot } from "./model"

export function protectedItems(previous?: MemoryArtifact) {
  if (!previous) return []
  return [...new Set([
    ...previous.items.filter((item) => guarded(item) || item.section === "values").map((item) => item.id),
    ...(previous.version === 5 ? previous.checklist?.critical ?? previous.review?.critical ?? [] : []),
  ])].sort()
}

/** Runs after the closed decoder; no paid review or claim of semantic entailment. */
export function check(decoded: Decoded, snapshot: MemorySnapshot, host: Host): Decoded | Failure {
  if (decoded.artifact.version !== 5) return decoded
  if (!snapshot.complete || !validSnapshot(snapshot) || !ownedHistory(snapshot.sessionID, host.history))
    return { check: "C18", detail: "Checklist requires an owned complete snapshot and host history." }
  const covered = snapshot.covered ?? []
  const positions = new Map(host.history.map((message, index) => [message.info.id, index]))
  if (covered.some((message, index) => {
    const position = positions.get(message.info.id)
    return position === undefined || fingerprint(message) !== fingerprint(host.history[position]) ||
      index > 0 && position <= (positions.get(covered[index - 1].info.id) ?? Infinity)
  }) || decoded.artifact.parentID !== snapshot.sessionID || decoded.artifact.boundary !== snapshot.boundary ||
    decoded.artifact.coveredThrough !== snapshot.boundary || decoded.artifact.covered.length !== covered.length ||
    decoded.artifact.covered.some((source, index) => source.id !== covered[index].info.id || source.digest !== fingerprint(covered[index])))
    return { check: "C18", detail: "Checklist source fingerprints must match the declared ordered active prefix." }
  const previous = snapshot.previous
  const protectedIDs = protectedItems(previous)
  const ctx = scope(snapshot, host)
  const declared = new Set(covered.map((message) => message.info.id))
  const eligible = new Set(ctx.covered.filter((source) => declared.has(source.message.info.id)).map((source) => source.alias))
  // Native compaction leaves displaced records in storage. Preserve their alias numbering,
  // but never let those records become evidence for the declared active-prefix memory.
  if ([...decoded.artifact.now.src, ...decoded.artifact.items.flatMap((item) => item.src)].some((alias) => !eligible.has(alias)))
    return { check: "C18", detail: "Checklist candidate cites a source outside its declared covered prefix." }
  const newlyCovered = new Set(snapshot.head.map((message) => message.info.id))
  const changes = new Set((previous?.version === 5
    ? ctx.span.filter((source) => newlyCovered.has(source.message.info.id)) : ctx.changes).map((source) => source.alias))
  const live = new Set(decoded.artifact.items.map((item) => item.id))
  for (const id of protectedIDs) {
    const op = decoded.ops.find((op) => op.op !== "add" && op.id === id)
    if (!op && live.has(id)) continue
    if (!op || op.op === "add" || op.op === "retire" && !op.reason.trim() ||
      previous?.version !== 5 && !ctx.changeProven || !op.src?.length || op.src.some((alias) => !changes.has(alias)))
      return { check: "C18", detail: `Protected ${id} requires an explicit change with newly covered sources; retirement also requires a reason.` }
  }
  const critical = [...protectedIDs.filter((id) => live.has(id)),
    ...decoded.artifact.items.filter((item) => guarded(item) || item.section === "values").map((item) => item.id)]
  return { ...decoded, artifact: { ...decoded.artifact, checklist: sealChecklist(decoded.artifact, critical) } }
}

export * as ContinuityChecklist from "./checklist"
