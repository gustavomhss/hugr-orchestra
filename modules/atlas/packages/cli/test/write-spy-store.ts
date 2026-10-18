// @atlas/cli — test/write-spy-store.ts  (WP-10.A1.CLI — the reusable planner write-freedom harness)
//
// THE deliverable EPIC-A2 (draft/slots) and EPIC-A3 (check) reuse: a `DiskStore` whose EVERY write door
// (`put`, `persistProjection`, `commitProjection`, `commitStaging`) RECORDS the call and then THROWS, wrapped
// around a REAL disk store so reads still resolve. It realizes the two teeth of PROP-AUTH-2 / SCN-AUTH-2a /
// SCN-AUTH-2d at once:
//
//   (1) THE SPY ARM — a planner that reaches ANY store write door records a call AND crashes, so "the spy
//       records zero calls after the planner ran" is a real assertion, not a tautology: if a future draft/check
//       leg is composed over `spy` and it writes, the test that drives it goes RED loudly.
//
//   (2) THE CENSUS ARM — `census()` walks the WHOLE store root (the `cas/` tree AND the sidecar files AND any
//       `.atlas/cache` memo a planner might drop beside them) and returns a byte map. A `store.byteCensus`
//       before/after a planner run that is deep-equal is the CAS-∧-projection-∧-cache conjunct of the law —
//       the arm a CAS-only assertion misses (the SCN-AUTH-2d "disk memo as a cache" teeth).
//
// SEEDING: arrange durable fixtures through `seed` (the REAL inner store, which BYPASSES the spy) so a census
// is taken over a NON-EMPTY store — an all-empty census would pass a planner that only ever writes to a
// populated store. `spy` is what the planner-under-test is driven over.
//
// This is a test SUPPORT module (no `.test.ts` suffix — vitest does not collect it); the later epics import
// `createWriteSpyStore` from here rather than re-deriving the harness.

import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import type { Dirent } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import { createDiskStore } from "@atlas/adapter-io"
import type { DiskStore } from "@atlas/adapter-io"
import type { Hash } from "@atlas/contracts"
import type { CasObject } from "@atlas/kernel"
import type { StoreProjection } from "@atlas/knowledge"

/** One recorded write attempt: the door name and the argument the planner tried to persist (for legibility in
 *  a failure message — a planner that DID write names exactly which door it reached). */
export interface WriteCall {
  readonly door: "put" | "persistProjection" | "commitProjection" | "commitStaging"
}

/** The reusable write-spy harness (WP-10.A1.CLI). `spy` is the store to drive a planner over; `seed` arranges
 *  durable fixtures (bypasses the spy); `calls` are the recorded write attempts; `census` is the byte map of
 *  the WHOLE store root (CAS ∧ sidecars ∧ any cache memo). `dispose` removes the temp root. */
export interface WriteSpyHarness {
  readonly spy: DiskStore
  readonly seed: DiskStore
  readonly root: string
  calls(): readonly WriteCall[]
  census(): ReadonlyMap<string, string>
  dispose(): void
}

/** The error a spied write door throws — a planner that trips it is the failure PROP-AUTH-2 forbids, so the
 *  message is written to be found in a stack when a later leg regresses. */
class PlannerWroteError extends Error {
  constructor(door: WriteCall["door"]) {
    super(
      `write-spy: a planner reached the '${door}' write door — a planner MUST persist NOTHING (AUTHOR-2 / PROP-AUTH-2, ADR-0004). This store throws on every write so the violation is loud, not silent.`,
    )
    this.name = "PlannerWroteError"
  }
}

/** Recursively read every file under `dir` into a `relative-path → bytes` map (sorted keys are irrelevant to a
 *  deep-equal, but the walk is deterministic). A missing dir yields an empty map. */
function censusOf(dir: string): Map<string, string> {
  const out = new Map<string, string>()
  const walk = (abs: string): void => {
    let entries: Dirent[]
    try {
      entries = readdirSync(abs, { withFileTypes: true })
    } catch {
      return // a not-yet-created dir contributes nothing (an honest empty census leg)
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const child = join(abs, e.name)
      if (e.isDirectory()) walk(child)
      else out.set(relative(dir, child), readFileSync(child, "utf8"))
    }
  }
  walk(dir)
  return out
}

/**
 * Build a write-spy harness rooted in a fresh temp directory. The inner store is a REAL `createDiskStore`; the
 * `spy` wraps it so reads delegate but EVERY write door records + throws. Total — the temp root is created here
 * and torn down by `dispose`.
 */
export function createWriteSpyStore(): WriteSpyHarness {
  const root = mkdtempSync(join(tmpdir(), "atlas-write-spy-"))
  const casPath = join(root, "cas")
  const inner = createDiskStore(casPath)
  const calls: WriteCall[] = []

  const record = (door: WriteCall["door"]): never => {
    calls.push({ door })
    throw new PlannerWroteError(door)
  }

  const spy: DiskStore = {
    // READS delegate to the real inner store — a seeded fixture reads back through the spy unchanged.
    get: (h: Hash): CasObject | undefined => inner.get(h),
    loadProjection: (): StoreProjection | undefined => inner.loadProjection(),
    // WRITES record the attempt and throw — a planner MUST reach none of these (AUTHOR-2 / PROP-AUTH-2).
    put: (_obj: CasObject): Hash => record("put"),
    persistProjection: (_p: StoreProjection): void => record("persistProjection"),
    commitProjection: (_d: (p: StoreProjection) => unknown): never => record("commitProjection"),
    commitStaging: (_d: (p: StoreProjection) => unknown): never => record("commitStaging"),
  } as DiskStore

  return {
    spy,
    seed: inner,
    root,
    calls: () => calls,
    census: () => censusOf(root),
    dispose: () => rmSync(root, { recursive: true, force: true }),
  }
}

/** A minimal, well-formed `CasObject` to seed durable bytes with (the census must run over a NON-EMPTY store, or
 *  it would pass a planner that only ever writes to a populated one). Kept structural — the harness proves
 *  write-FREEDOM, so the seed's meaning does not matter, only that it lands real bytes on disk. */
export function seedSomeBytes(seed: DiskStore): Hash {
  return seed.put({ kind: "seed", note: "a durable fixture object for the census baseline" } as unknown as CasObject)
}
