// @atlas/adapter-io — src/review-store.ts  (the store reads the review commands need)
//
// The review commands (`atlas hold`, `propose`, `decide`, …) check what they act on against the durable store at the
// repository root. They are not legs of the composed runtime (`compose.ts` has no room under the godfile ceiling),
// so each read here opens the store the way `awareness-store.ts` does: the CAS root under `.atlas/`, the HEAD
// watermark seam, and the git provenance seam — a store that arrived by commit reads as empty, never as data.

import { join } from "node:path"
import type { StoreProjection } from "@atlas/knowledge"
import { CAS_REL } from "./okf-store.js"
import { headSha } from "./run-git.js"
import { createDiskStore } from "./store.js"
import type { DiskStore } from "./store.js"
import { gitSidecarTrust } from "./store-provenance.js"

/** The staged candidates' nodeKeys, or `undefined` when the staging sidecar refuses (unreadable, untrusted, contended). */
export function stagedNodeKeys(repoPath: string): ReadonlySet<string> | undefined {
  // The store's own documented read-only decision: no `next`, so nothing is published.
  const read = openStore(repoPath).commitStaging<StoreProjection>((p) => ({ out: p }))
  return read.settled ? new Set(read.out.current.keys()) : undefined
}

function openStore(repoPath: string): DiskStore {
  return createDiskStore(join(repoPath, CAS_REL), () => headSha(repoPath), gitSidecarTrust(repoPath))
}
