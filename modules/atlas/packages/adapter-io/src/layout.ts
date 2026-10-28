// @atlas/adapter-io — src/layout.ts  (where every tracked Atlas log lives under `.atlas/`)
//
// The one place that turns a repo root and a record into a path. Every store asks here, so the tree in
// `docs/design/repo-layout.md` §8 is written down once:
//
//   .atlas/project/{orientation,review}.jsonl            shared, owned by nobody
//   .atlas/members/<seat>/memory/project.jsonl           one seat's project rules
//   .atlas/members/<seat>/memory/task/<taskId>.jsonl     one task's memory
//   .atlas/members/<seat>/memory/pr/<prId>.jsonl         one PR's memory
//   .atlas/members/<seat>/memory/logbook.jsonl           the logbook (only its author writes it)
//   .atlas/members/<seat>/knowledge/<nodeKey[0:2]>.jsonl applied knowledge outcomes, sharded by node key
//   .atlas/blobs/<h[0:2]>/<h>                            the CAS bytes each knowledge row names
//
// A file name is a SHARD HINT, never identity: every line still carries its own content id, and a read folds
// every file of a kind by that id. So two ids that sanitize to the same segment, or a case-insensitive
// filesystem that folds `A` and `a`, only put two records in one file — nothing is lost or merged wrongly.
//
// The single-file logs written before this tree (`.atlas/{memory,orientation,review}.jsonl`) are still read,
// first, so a store that has not run `atlas migrate-layout` keeps every record. Nothing appends to them.

import { join } from "node:path"
import type { MemoryRecord } from "@atlas/memory"

export type LegacyLog = "memory" | "orientation" | "review"
export type ProjectLog = "orientation" | "review"

export const atlasDir = (repoPath: string): string => join(repoPath, ".atlas")

/** A single-file log from before the tree. Read, never appended. */
export const legacyLogPath = (repoPath: string, log: LegacyLog): string => join(atlasDir(repoPath), `${log}.jsonl`)

export const projectLogPath = (repoPath: string, log: ProjectLog): string =>
  join(atlasDir(repoPath), "project", `${log}.jsonl`)

export const membersDir = (repoPath: string): string => join(atlasDir(repoPath), "members")

/** The file one memory record is appended to: its owner's seat, then its kind, then its subject. */
export function memberMemoryPath(repoPath: string, record: MemoryRecord): string {
  const dir = join(membersDir(repoPath), segment(record.owner), "memory")
  if (record.kind === "task") return join(dir, "task", `${segment((record.entry as { taskId: string }).taskId)}.jsonl`)
  if (record.kind === "pr") return join(dir, "pr", `${segment((record.entry as { prId: string }).prId)}.jsonl`)
  return join(dir, `${segment(record.kind)}.jsonl`)
}

/** The shard one seat's knowledge outcome for `nodeKey` is appended to. */
export const knowledgeShardPath = (repoPath: string, seat: string, nodeKey: string): string =>
  join(membersDir(repoPath), segment(seat), "knowledge", `${segment(nodeKey.slice(0, 2))}.jsonl`)

/** The committed copy of one CAS object a knowledge row names, so a fresh clone can rebuild the row's bytes. */
export const blobPath = (repoPath: string, contentHash: string): string =>
  join(atlasDir(repoPath), "blobs", segment(contentHash.slice(0, 2)), segment(contentHash))

/**
 * One safe path segment from an id the caller does not control. Percent-encoding removes `/` and `\`;
 * encoding `.` too means no segment is `.` or `..`; `*` is the one character `encodeURIComponent` keeps that
 * Windows refuses. Collisions are harmless (see the header).
 */
export function segment(id: string): string {
  if (id === "") return "_"
  return encodeURIComponent(id).replaceAll(".", "%2E").replaceAll("*", "%2A")
}
