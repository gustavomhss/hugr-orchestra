// @atlas/cli — src/mine-pool.ts  (WP-FIX-CONCURRENCY — the bounded proposer pool)
//
// The `POOL_WIDTH`-wide worker pool behind `ControllerDeps.visitAll`. It parallelizes exactly ONE thing:
// `SiteProposer.propose`, the network-bound S2 model call that costs ~18s per site and made a 200-site
// genesis run take 54 minutes. Admission, ranking and every durable write stay on the main thread.
//
// THE MAIN THREAD BLOCKS, AND THAT IS DELIBERATE. `GenesisApi.genesis` is synchronous and must stay so —
// its only production caller is `mine.ts`, but ~40 call sites across the frozen test suites read
// `api.genesis(...).seeded` directly, so turning the surface into a `Promise` is not a change this seam is
// allowed to make. So the pool dispatches a batch to the workers, blocks on `Atomics.wait` until all of
// them have answered, and returns the answers in SLOT order. Concurrency stays entirely inside one
// synchronous call, which is precisely what lets the run controller remain unaware of it.
//
// REASSEMBLY IS BY SLOT, NEVER BY ARRIVAL. Every answer carries the index of the job that produced it and
// is written to `out[slot]`. Completion order is therefore not merely ignored — it is never represented
// anywhere, so there is no ordering for a later edit to accidentally start honouring.

import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { MessageChannel, receiveMessageOnPort, Worker } from "node:worker_threads"
import type { MessagePort } from "node:worker_threads"
import { POOL_WIDTH } from "@atlas/genesis"
import type { Candidate, ExtractResult, SeedProposal, SiteProposer, VisitAttempt } from "@atlas/genesis"
import type { PoolAnswer } from "./mine-worker.js"

/** The compiled worker entry, resolved RELATIVE TO THIS MODULE so it is correct from `dist/` without any
 *  knowledge of the install layout. */
const WORKER_ENTRY = new URL("./mine-worker.js", import.meta.url)

/**
 * Is the pool actually usable here? A worker thread loads a FILE, so this capability exists only where the
 * package has been COMPILED — beside `mine-pool.js` in `dist/`. Anything running this module straight from
 * TypeScript source (the test runner) sits next to `mine-worker.ts`, and `./mine-worker.js` is simply not
 * there.
 *
 * ASKED, NOT ASSUMED, AND THAT IS THE POINT. Constructing a `Worker` over a missing entry does not fail
 * usefully: the thread never answers, the pool waits out its liveness bound, every site in the batch faults,
 * and the process is left holding handles it cannot join. That is a hang, and it is one this seam CAUSED
 * rather than found — the pre-change suite exited cleanly and the first build of this pool made it stop
 * exiting. So availability is a question with an answer, and when the answer is no the caller keeps the
 * sequential path, which is not a degraded mode but the exact behaviour that shipped before.
 */
export function proposerPoolAvailable(): boolean {
  return existsSync(fileURLToPath(WORKER_ENTRY))
}

/** How long a single `Atomics.wait` slice may block before re-checking the counter. A bound rather than an
 *  infinite wait so a worker that dies without answering cannot wedge the pass forever — the loop re-reads
 *  liveness each slice and gives up if a worker has gone. */
const WAIT_SLICE_MS = 250

/** The pool's answer for one site — the proposer's seed, or the fault that stopped it. */
export type PoolResult =
  // [#195c] `{ abstain }` rides alongside `SeedProposal | null` (see `PoolAnswer`, mine-worker.ts): a
  // malformed-answer abstention must reach the main-thread admit loop DISTINCT from a plain model-abstain.
  | { readonly ok: true; readonly seed: SeedProposal | { readonly abstain: string } | null }
  | { readonly ok: false; readonly error: Error }

export interface ProposerPool {
  /** Propose at every candidate, in parallel, returning one result per candidate POSITIONALLY ALIGNED with
   *  the input. Never throws: a fault is an `ok: false` result for the site it belongs to. */
  proposeAll(cands: readonly Candidate[]): readonly PoolResult[]
  /** Terminate every worker. Idempotent. Must be called or the process will not exit. */
  close(): void
}

/** Rebuild an Error carrying the worker's ORIGINAL `name`. The name is what `mine.ts` classifies on
 *  (`ModelCommandError` ⇒ a wiring fault, not a mining outcome), and it does not survive a structured clone
 *  of a custom subclass — so it is carried as a field and reattached here. */
function rehydrate(a: Extract<PoolAnswer, { ok: false }>): Error {
  const e = new Error(a.message)
  e.name = a.name
  return e
}

interface Seat {
  readonly worker: Worker
  readonly port: MessagePort
}

/**
 * Start a pool of `width` workers, each able to rebuild the operator's proposer from `(repoPath, env)`.
 *
 * Workers are started EAGERLY (one thread each, ~2.5s of module loading) but resolve their proposer LAZILY,
 * so the startup cost is paid once, in parallel, rather than once per site.
 */
export function createProposerPool(repoPath: string, env: NodeJS.ProcessEnv, width: number = POOL_WIDTH): ProposerPool {
  const sab = new SharedArrayBuffer(4)
  const done = new Int32Array(sab)
  const seats: Seat[] = []
  for (let k = 0; k < width; k++) {
    const { port1, port2 } = new MessageChannel()
    const worker = new Worker(WORKER_ENTRY, {
      workerData: { sab, port: port2, repoPath, env },
      transferList: [port2],
    })
    // Neither the thread nor the channel may keep the CLI alive; `close()` is what ends them.
    worker.unref()
    port1.unref()
    seats.push({ worker, port: port1 })
  }
  let closed = false
  let died = 0
  // BOTH events count as death. Without the `error` leg a worker that fails to load is never counted, the
  // wait bound is never short-circuited, and an unhandled `error` on a Worker is thrown into the parent.
  for (const s of seats) {
    s.worker.on("exit", () => void (died += 1))
    s.worker.on("error", () => void (died += 1))
  }

  const proposeAll = (cands: readonly Candidate[]): readonly PoolResult[] => {
    const n = cands.length
    const out = new Array<PoolResult | undefined>(n)
    if (n === 0) return []
    if (closed) return cands.map(() => ({ ok: false, error: new Error("the proposer pool is closed") }))

    Atomics.store(done, 0, 0)
    cands.forEach((cand, slot) => seats[slot % seats.length]!.port.postMessage({ slot, cand }))

    // BLOCK until every job has answered. `Atomics.wait` is the only primitive that lets a synchronous
    // function wait on work happening on other threads; the timeout slice is what keeps a dead worker from
    // turning a pass into a hang.
    let landed = 0
    while (landed < n) {
      const seen = Atomics.load(done, 0)
      if (seen >= n) break
      Atomics.wait(done, 0, seen, WAIT_SLICE_MS)
      landed = Atomics.load(done, 0)
      if (landed < n && died > 0) break // a worker exited without answering — stop waiting, fault below
    }

    // Drain every port. A message names its own slot, so this is order-insensitive by construction.
    for (const s of seats) {
      let m: { message: { slot: number; answer: PoolAnswer } } | undefined
      while ((m = receiveMessageOnPort(s.port) as typeof m) !== undefined) {
        const { slot, answer } = m.message
        out[slot] = answer.ok ? { ok: true, seed: answer.seed } : { ok: false, error: rehydrate(answer) }
      }
    }
    // A slot with no answer is a fault for THAT SITE — never a silently dropped site, and never an
    // abstention: "the model said nothing" and "the worker never answered" are different claims and only
    // one of them is a fact about the repository.
    return out.map((r) => r ?? { ok: false, error: new Error("the proposer pool returned no answer for this site") })
  }

  return {
    proposeAll,
    close: (): void => {
      if (closed) return
      closed = true
      for (const s of seats) {
        s.port.close()
        void s.worker.terminate()
      }
    },
  }
}

/**
 * The one per-site expression, supplied by the driver: extract at `cand` using `proposer`.
 *
 * It is a PARAMETER rather than something this file assembles, and that is the whole trick behind the
 * byte-identity contract. The sequential path calls it with the real proposer; the batched path calls it
 * with a proposer holding the already-fetched claim. There is therefore only ONE admission expression, one
 * budget and one gate in the process — so the two paths cannot drift apart while both stay green, which is
 * exactly what would happen if this file rebuilt the call itself from the same ingredients.
 */
export type SiteVisit = (cand: Candidate, proposer: SiteProposer) => ExtractResult

/**
 * Build the `ControllerDeps.visitAll` port over a pool.
 *
 * THE SHAPE OF THE WORK IS SPLIT, NOT MOVED: the model calls for the whole batch happen first and in
 * parallel (`proposeAll`), then each site is admitted on THIS thread, in the order the batch was handed
 * over. Admission is mechanical and local, so it costs nothing to keep here — and keeping it here is what
 * lets the gate, the index and the store remain single-threaded.
 *
 * FAULTS ARE REPORTED IN RANK ORDER. `onFault` fires as the loop walks ascending rank, so the fault an
 * operator is shown is the FIRST BY RANK — never the first by wall-clock, which with several calls in
 * flight is an arbitrary choice among them and would make the reported cause of a failed run depend on
 * which thread happened to finish first. Sites past the first fault are still reported here; the caller's
 * first-write-wins capture is what keeps only the lowest-ranked one, matching a sequential run exactly.
 */
export function makeVisitAll(
  pool: ProposerPool,
  visitWith: SiteVisit,
  onFault?: (e: Error) => void,
): (cands: readonly Candidate[]) => readonly VisitAttempt[] {
  return (cands) => {
    const seeds = pool.proposeAll(cands)
    const attempts: VisitAttempt[] = []
    cands.forEach((cand, k) => {
      const r = seeds[k]
      if (r === undefined || !r.ok) {
        const error = r?.error ?? new Error("the proposer pool returned no answer for this site")
        if (error.name === "ModelCommandError") onFault?.(error)
        attempts.push({ ok: false, error })
        return
      }
      // The seed is rebuilt around the LOCAL `cand`. A structured clone is value-equal but not
      // identity-equal, and the gate receives both the seed and the candidate — so handing it a cloned
      // `seed.cand` would put two different objects for one site into a seam that has every right to
      // expect one.
      // A `{ abstain }` seed carries no candidate, so it is passed THROUGH untouched; only a real
      // `SeedProposal` is rebuilt around the LOCAL `cand` (the identity-equality reason above).
      const held: SiteProposer = {
        propose: () => (r.seed === null || "abstain" in r.seed ? r.seed : { ...r.seed, cand }),
      }
      try {
        attempts.push({ ok: true, value: visitWith(cand, held) })
      } catch (error) {
        attempts.push({ ok: false, error })
      }
    })
    return attempts
  }
}
