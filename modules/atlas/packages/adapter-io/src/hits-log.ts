// @atlas/adapter-io — src/hits-log.ts  (the durable KNOW-17 hits ledger and the decay pass `atlas decay` runs)
//
// KNOW-17 / GEN-16: a served fact accrues a `hit` each time it is served; a served fact with ZERO hits across
// the decay window leaves the served set (archived to CAS, never deleted — KNOW-12) and re-enters on a later
// hit. `@atlas/knowledge`'s `bindHits` implements that over an IN-MEMORY ledger, which is why no production
// path could run `decay`: every CLI invocation started from zero hits, so a decay pass would have archived
// every advisory fact the moment it ran. This module gives the ledger a durable home and runs the SAME
// `bindHits.decay` over it.
//
// ── THE LOG ──────────────────────────────────────────────────────────────────────────────────────────────
// `.atlas/hits.jsonl`, one event per line, appended with a single `O_APPEND` write (the `durable-log.ts`
// concurrency argument: two writers appending produce both lines). Two event kinds:
//   • `hit`   — the serve path delivered an advisory node in a pack (`projection-query-index.ts`).
//   • `decay` — a decay pass closed a window: the nodes it decayed, and the ELIGIBLE snapshot it opened the
//               next window with.
// Not `durable-log.ts` itself: that log is content-keyed and dedups identical events, and two hits on one
// node ARE identical events. A line that does not parse is COUNTED (`rejected`), never served as a hit.
//
// The log is LOCAL derived state, like the projection and the CAS: `.atlas/*` is deny-by-default in
// `.gitignore` and this path is not re-included, so the ledger is per clone and never travels.
//
// ── THE WINDOW ───────────────────────────────────────────────────────────────────────────────────────────
// KNOW-17 pins the window as a logical ledger event-count, never wall-clock. A pass decays a node only when
// it was ELIGIBLE (advisory, current, not retired, not decayed) for the WHOLE window: the first pass records
// the eligible snapshot and decays nothing (a cold ledger proves nothing about use); every later pass waits
// until `window` hit events have accrued since the last one, then decays the nodes eligible at both ends
// that collected zero of them. A node emitted mid-window is therefore never decayed by the pass that closes
// it — it had no full window to be used in.
//
// ── BOUNDS, STATED ───────────────────────────────────────────────────────────────────────────────────────
// A hit is logged per advisory node per pack served, not per governed decision (the RETR-8 `hit` flag); the
// serve path has no decision signal to offer. The log grows without compaction. A long-running process
// re-reads the log only when its size differs from what it last saw, so a pass run by another process is
// seen on that process's next serve.

import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import type { Hash, NodeKey } from "@atlas/contracts"
import { asNodeKey } from "@atlas/kernel"
import { bindHits, currentNodes, isRetired } from "@atlas/knowledge"
import type { BoundHits, GroundedFact, HitsDeps } from "@atlas/knowledge"
import { isAdvisory } from "@atlas/tools"
import { CAS_REL } from "./okf-store.js"
import { factToInvariant } from "./pack-shape.js"
import { headSha } from "./run-git.js"
import type { DiskStore } from "./store.js"
import { createDiskStore, rehydrateProjection } from "./store.js"
import { gitSidecarTrust } from "./store-provenance.js"

/** Where the ledger lives, relative to the repository root. */
export const HITS_REL = join(".atlas", "hits.jsonl")

/**
 * [OPEN DEFINE — one tunable place] The default decay window, in hit events. KNOW-17 pins the unit (a
 * logical ledger event-count) and leaves the value open; 200 is several dozen packs on a small store. A
 * caller passes its own with `atlas decay --window <n>`.
 */
export const DECAY_WINDOW = 200

export type HitsEvent =
  | { readonly kind: "hit"; readonly node: string }
  | { readonly kind: "decay"; readonly decayed: readonly string[]; readonly eligible: readonly string[] }

/** What a read found. `rejected` counts lines that did not parse as a hits event. */
export interface HitsRead {
  readonly events: readonly HitsEvent[]
  readonly rejected: number
}

/**
 * One decay pass's outcome. `baseline`: the first pass, which only opened the window. `open`: the window has
 * not accrued `window` hit events yet (`seen` of them so far). `decayed`: the window closed.
 */
export type DecayPass = {
  readonly kind: "baseline" | "open" | "decayed"
  readonly decayed: readonly NodeKey[]
  readonly retained: readonly NodeKey[]
  readonly seen: number
  readonly window: number
}

/** The serve-side ledger: `bindHits`' surface plus the two things only a durable ledger can answer. */
export interface ServedHits extends BoundHits {
  /** True when a decay pass archived this node and no later hit brought it back. */
  isDecayed(nodeId: NodeKey): boolean
  /** Run one decay pass over `window` hit events (see the header) and record it in the log. */
  decayPass(window: number): DecayPass
}

/** Read the hits log. A missing file is an empty ledger. */
export function readHitsLog(path: string): HitsRead {
  if (!existsSync(path)) return { events: [], rejected: 0 }
  const lines = readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
  const events = lines.map(parseEvent).filter((event): event is HitsEvent => event !== undefined)
  return { events, rejected: lines.length - events.length }
}

/**
 * The current advisory nodes of `store` that a decay pass may judge: current, CAS bytes present, not retired,
 * and in the advisory band — the same rows the serve path logs hits for.
 */
export function advisoryNodes(store: DiskStore): NodeKey[] {
  return currentNodes(rehydrateProjection(store)).flatMap((node) => {
    const fact = store.get(node.contentHash as Hash) as GroundedFact | undefined
    if (fact === undefined || isRetired(fact)) return []
    // The band reads only the tier, so the freshness argument plays no part in the answer.
    return isAdvisory(factToInvariant(node, fact, "DRIFTED")) ? [asNodeKey(node.nodeKey)] : []
  })
}

/**
 * The ledger the composition root and `atlas decay` both bind over a disk store: the served set is
 * `advisoryNodes(store)`, the archive re-asserts a node's fact bytes into the CAS (content-addressed and
 * idempotent, so it never deletes and never lies about having archived), and the door-2 calibration is the
 * pass-through `observed → observed` (ADR-0012: usefulness is never an admission veto).
 */
export function storeHits(store: DiskStore, path: string): ServedHits {
  return durableHits(path, {
    servedSet: () => advisoryNodes(store),
    archive: (nodeId) => {
      const node = currentNodes(rehydrateProjection(store)).find((n) => n.nodeKey === nodeId)
      if (node === undefined) return
      const fact = store.get(node.contentHash as Hash) as GroundedFact | undefined
      if (fact !== undefined) store.put(fact)
    },
    calibrate: (observedHits) => observedHits,
  })
}

/** `storeHits` over the repository's own CAS store and ledger — what `atlas decay` runs on. */
export function openHits(repoPath: string): ServedHits {
  const store = createDiskStore(join(repoPath, CAS_REL), () => headSha(repoPath), gitSidecarTrust(repoPath))
  return storeHits(store, join(repoPath, HITS_REL))
}

/** Bind a `bindHits` ledger whose hits and decay passes persist in the JSONL log at `path`. */
export function durableHits(path: string, deps: HitsDeps): ServedHits {
  const sealed = new Set<NodeKey>() // a seal is evidence the caller attests per process, not a log event
  const state = { size: -1, events: [] as readonly HitsEvent[], ledger: bindHits(deps), decayed: new Set<NodeKey>() }

  // Rebuild from the log when another writer changed it. Our own appends advance `size` by their own length,
  // so a concurrent append from elsewhere still shows up as a mismatch on the next call.
  const refresh = () => {
    const size = existsSync(path) ? statSync(path).size : 0
    if (size === state.size) return
    const read = readHitsLog(path)
    state.ledger = bindHits(deps)
    state.decayed = new Set()
    read.events.forEach((event) => {
      if (event.kind === "hit") {
        state.ledger.logHit(asNodeKey(event.node))
        state.decayed.delete(asNodeKey(event.node))
        return
      }
      event.decayed.forEach((node) => state.decayed.add(asNodeKey(node)))
    })
    sealed.forEach((node) => state.ledger.seal(node))
    state.events = read.events
    state.size = size
  }

  const append = (event: HitsEvent) => {
    const line = `${JSON.stringify(event)}\n`
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, line)
    state.size += Buffer.byteLength(line)
    state.events = [...state.events, event]
  }

  const decayPass = (window: number): DecayPass => {
    if (!Number.isInteger(window) || window < 1) throw new TypeError("hits.decayPass: malformed decay window")
    refresh()
    const eligible = Array.from(deps.servedSet()).filter((node) => !state.decayed.has(node))
    const last = state.events.reduce((found, event, index) => (event.kind === "decay" ? index : found), -1)
    if (last < 0) {
      append({ kind: "decay", decayed: [], eligible })
      return { kind: "baseline", decayed: [], retained: eligible, seen: 0, window }
    }
    const opened = state.events[last] as Extract<HitsEvent, { kind: "decay" }>
    const hits = state.events.slice(last + 1).filter((event) => event.kind === "hit")
    if (hits.length < window) return { kind: "open", decayed: [], retained: eligible, seen: hits.length, window }
    // The window closed: judge the nodes eligible at both ends with `bindHits.decay` itself, fed only this
    // window's hits. `decay` reads the zero-hit floor; the door-2 threshold plays no part in it.
    const before = new Set(opened.eligible)
    const pass = bindHits({ ...deps, servedSet: () => eligible.filter((node) => before.has(node)) })
    hits.forEach((event) => pass.logHit(asNodeKey(event.node)))
    const decayed = pass.decay({ window, threshold: 0 }).decayed
    const gone = new Set(decayed)
    const retained = eligible.filter((node) => !gone.has(node))
    append({ kind: "decay", decayed, eligible: retained })
    decayed.forEach((node) => state.decayed.add(node))
    return { kind: "decayed", decayed, retained, seen: hits.length, window }
  }

  return {
    logHit(nodeId) {
      refresh()
      const entry = state.ledger.logHit(nodeId) // validates the node-id before anything is written
      append({ kind: "hit", node: nodeId })
      state.decayed.delete(nodeId) // KNOW-17d: a later hit brings a decayed node back
      return entry
    },
    decay(cfg) {
      const pass = decayPass(cfg.window)
      return { decayed: pass.decayed, retained: pass.retained }
    },
    decayPass,
    door2Threshold(nodeId) {
      refresh()
      return state.ledger.door2Threshold(nodeId)
    },
    seal(nodeId) {
      refresh()
      state.ledger.seal(nodeId)
      sealed.add(nodeId)
    },
    servedClass(nodeId) {
      refresh()
      return state.ledger.servedClass(nodeId)
    },
    isDecayed(nodeId) {
      refresh()
      return state.decayed.has(nodeId)
    },
  }
}

function parseEvent(line: string): HitsEvent | undefined {
  const value = parseJson(line)
  if (typeof value !== "object" || value === null) return undefined
  const event = value as Record<string, unknown>
  if (event.kind === "hit" && typeof event.node === "string" && event.node !== "") {
    return { kind: "hit", node: event.node }
  }
  if (event.kind === "decay" && isStrings(event.decayed) && isStrings(event.eligible)) {
    return { kind: "decay", decayed: event.decayed, eligible: event.eligible }
  }
  return undefined
}

function parseJson(line: string): unknown {
  try {
    return JSON.parse(line)
  } catch {
    return undefined // a torn or edited line is counted as rejected by the caller, never thrown
  }
}

function isStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}
