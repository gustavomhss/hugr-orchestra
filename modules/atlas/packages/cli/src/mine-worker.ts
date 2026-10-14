// @atlas/cli — src/mine-worker.ts  (WP-FIX-CONCURRENCY — the pool's worker entry)
//
// ONE worker thread of the `mine` proposer pool (mine-pool.ts). It answers exactly one question, over and
// over: "what does the operator's model propose at this site?" — `SiteProposer.propose`, nothing else.
//
// WHY A THREAD AND NOT A PROMISE. The S2 model call bottoms out in `execFileSync` (adapter-io/src/llm.ts):
// a BLOCKING subprocess. A bounded pool of async tasks over a blocking call is not concurrent at all — it
// runs strictly one at a time while looking exactly like a pool in the source. Measured on this box, width
// 8 over 8×1s of `execFileSync` takes 8.09s (a 0.99× "speedup"); the same width over a genuinely parallel
// primitive takes 1.06s. A worker thread has its own event loop, so its `execFileSync` blocks only itself —
// which is what makes the parallelism real rather than notional.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO. It does not rank, does not build a skeleton, does not admit, and
// does not write. The gate is mechanical and local (no network) and the store must stay single-writer, so
// both stay on the main thread; only the network-bound leg is moved. That is also what keeps a worker cheap
// to start: `resolveProposer` reads the operator config and builds a prompt factory, where an index build
// would cost ~9s PER WORKER and hand most of the winnings straight back.

import { parentPort, workerData } from "node:worker_threads"
import type { MessagePort } from "node:worker_threads"
import { initAst } from "@atlas/adapter-io"
import type { Candidate, SeedProposal, SiteProposer } from "@atlas/genesis"
import { resolveProposer } from "./mine-proposer.js"

/** What the pool hands a worker: the site to propose at, plus the slot to answer in (the pool reassembles
 *  by SLOT, never by arrival — see mine-pool.ts). */
interface PoolJob {
  readonly slot: number
  readonly cand: Candidate
}

/** A worker's answer. An error is DATA, never a throw across the boundary: `name` is carried separately
 *  because it is load-bearing downstream (`mine.ts` reports only `ModelCommandError` as a wiring fault) and
 *  a structured clone of a custom Error subclass is not guaranteed to preserve the subclass. */
export type PoolAnswer =
  // [#195c] `{ abstain }` rides alongside `SeedProposal | null` so a MALFORMED-answer abstention survives the
  // worker boundary too — the concurrent path is the production path the 2026-08-04 splice went invisible on,
  // so dropping the tag here would re-open exactly the hole #195 closes. A plain string structured-clones fine.
  | { readonly ok: true; readonly seed: SeedProposal | { readonly abstain: string } | null }
  | { readonly ok: false; readonly name: string; readonly message: string }

/** The immutable context a worker rebuilds its proposer from. `resolveProposer(repoPath, env)` is a pure
 *  function of these two, which is the entire reason the proposer can be reconstructed thread-side at all —
 *  a closure could not have been sent. */
interface WorkerContext {
  readonly sab: SharedArrayBuffer
  readonly port: MessagePort
  readonly repoPath: string
  readonly env: NodeJS.ProcessEnv
}

/** Resolve ONCE per worker, on first use, then reuse for every later job — the config read and the prompt
 *  factory are per-repo, not per-site, and re-resolving each time would re-read the operator's config on
 *  every model call. Lazy rather than eager so a worker that is started and never used costs nothing. */
function proposerFor(ctx: WorkerContext, cache: { p?: SiteProposer }): SiteProposer {
  cache.p ??= resolveProposer(ctx.repoPath, ctx.env).proposer
  return cache.p
}

/**
 * Serve jobs until the pool closes the port.
 *
 * The completion COUNTER is bumped and notified after the answer is posted, in that order — the main thread
 * wakes on the counter and only then drains the port, so posting second would let it observe a completion
 * whose message has not landed yet.
 */
function serve(ctx: WorkerContext): void {
  const done = new Int32Array(ctx.sab)
  const cache: { p?: SiteProposer } = {}
  ctx.port.on("message", (job: PoolJob) => {
    let answer: PoolAnswer
    try {
      // A throw here is a real outcome, not a crash: a missing model binary, a non-zero exit, a timeout, or
      // a malformed operator config. Each must reach the main thread as a fault it can classify — swallowed,
      // a broken configuration would present itself as "this site had nothing to say", which is the one
      // failure shape that invalidates a whole genesis run invisibly.
      answer = { ok: true, seed: proposerFor(ctx, cache).propose(job.cand) }
    } catch (e) {
      const err = e as { name?: unknown; message?: unknown } | null
      answer = {
        ok: false,
        name: typeof err?.name === "string" ? err.name : "Error",
        message: typeof err?.message === "string" ? err.message : String(e),
      }
    }
    ctx.port.postMessage({ slot: job.slot, answer })
    Atomics.add(done, 0, 1)
    Atomics.notify(done, 0)
  })
}

// The module is loaded ONLY as a worker entry; `workerData` is absent if anything else imports it, and in
// that case it must do nothing rather than throw on a missing port.
//
// THE GRAMMAR IS WARMED HERE, AND WITHOUT THIS LINE #182 WOULD HAVE SHIPPED BROKEN IN THE ONE
// CONFIGURATION PRODUCTION ACTUALLY USES. `bin.ts` awaits `initAst()` on the MAIN thread, but a worker
// thread has its own module registry and its own null grammar singletons — and every model call goes
// through a worker whenever the proposer came from operator config (`usePool`, mine.ts). The S2 reader
// folds the site's file to slice the unit out; with no grammar the fold is a total no-op, no unit key
// resolves, and EVERY sub-file site would have taken the `source-unreadable` refusal while the unit suite
// (main-thread, warmed) stayed green. Awaited BEFORE `serve` attaches the listener: a `MessagePort` queues
// messages until one is attached, so no job is lost by starting late.
if (parentPort !== null && (workerData as WorkerContext | null)?.port !== undefined) {
  await initAst()
  serve(workerData as WorkerContext)
}
