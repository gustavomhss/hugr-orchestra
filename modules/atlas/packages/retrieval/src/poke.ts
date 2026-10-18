// @atlas/retrieval — src/poke.ts  (poke debounce automaton + scope-tool projection — RETR-4 + RETR-5)
//
// Two frozen models bound as ONE facet over the navigator's scope stream. RETR-4: a debounced,
// once-per-scope poke that fires iff a single-file navigation signal SETTLES as the current scope across
// `N = 2` consecutive tool calls and was not already poked this session. RETR-5: location-scoped tool
// projection — only nodes covering the CURRENT scope are exposed, retracting on leave, never whole-graph
// (A-15). Seam consumer (pack/notice/covering supplied); owns only the automaton + projection law; NEVER
// hashes. Total (RETR-9): malformed call / missing knowledge ⇒ `null` / empty set, never a throw.
// X1 (owner decision): the announce unit is the pack `own_<unit>`; covering nodes are its in-pack drill.

import type { Pack } from "@atlas/contracts"
import type { NodeTool, Path, Poke } from "./types.js"

/**
 * Debounced, once-per-scope poke on scope-entry (RETR-4): fires iff a single-file navigation signal
 * SETTLES as the current scope across `N = 2` consecutive tool calls AND that scope was not already poked
 * this session. Total: no covering knowledge ⇒ `null`, never a throw (RETR-9). (atlas-retrieval:171)
 */
export interface PokeApi {
  /** Scope-entry push (RETR-4): returns the scope's `Poke` iff a single-file navigation signal settles
   *  across the `N = 2` debounce window and the scope was not already poked this session; else `null`.
   *  Pure + total (no covering knowledge / malformed scope ⇒ `null`, no throw — RETR-9).
   *  (atlas-retrieval:171) */
  poke(scope: Path): Poke | null
}

/**
 * Location-scoped tool projection (RETR-5): only nodes covering the CURRENT scope may be exposed as MCP
 * tools at once; on leaving the scope they retract; the whole graph is never projected simultaneously
 * (A-15). Total: a malformed scope yields an empty tool set, never a throw (RETR-9). (atlas-retrieval:172)
 */
export interface ProjectApi {
  /** Current scope → the covering nodes as MCP tools (RETR-5). MUST be called on scope-entry and its
   *  result retracted on scope-exit; MUST NOT accumulate across scopes / project the whole graph. Pure
   *  + total (miss ⇒ empty set, no throw — RETR-9). (atlas-retrieval:172) */
  projectTools(scope: Path): readonly NodeTool[]
}

// ── frozen constants ────────────────────────────────────────────────────────────────────────────────────
/** The settle window (RETR-4g): a scope must remain current across `N = 2` consecutive tool calls before its
 *  poke fires (atlas-retrieval:89; method-tags-ret:46). A COUNT of calls — not wall-clock, nothing real-time. */
export const SETTLE_WINDOW = 2
/** The poke sweet-spot cap (RETR-7): the compact push notice is `≤ ~150` tokens under the pinned cap measure.
 *  Enforcement of the measure is the RETR-7 seam; this facet carries a SUPPLIED notice and never tokenizes. */
export const POKE_CAP = 150

// ── the tool-call vocabulary (the harness hook event; the scope-signal classifier partitions it) ──────────
/** The navigation-relevant tool names observed on the tool-call hook (RETR-4b/4c/4d). */
export type ToolName = "Read" | "Edit" | "Write" | "Grep" | "Glob" | "Bash"

/** One observed tool call. `paths` are the RESOLVED scope keys the harness hook extracted from the call's
 *  path args (the index resolves a raw file path → its node scope; this facet consumes the resolved keys). */
export interface ToolCall {
  readonly tool: ToolName
  readonly paths: readonly Path[]
}

/** The scope-signal classification (RETR-4): a single-file Read/Edit/Write navigates; everything else
 *  (multi-file Grep/Glob, a Bash command's path-shaped arg, any multi-path call) is suppressed. */
export type Signal = { readonly kind: "navigate"; readonly scope: Path } | { readonly kind: "suppress" }

/** The result of feeding one tool call through the automaton (RETR-4 + RETR-5). */
export interface PokeStep {
  readonly signal: Signal
  readonly poke: Poke | null // fired iff the current scope just settled (N=2) unpoked; else null
  readonly tools: readonly NodeTool[] // the LIVE projection after this call (retract-on-leave, RETR-5)
}

/** The X1 pack-grain announce (OWNER DECISION): the single top-level unit is the pack `own_<leaf>`; the
 *  covering nodes are its IN-PACK drill surface — reached through the pack, never a top-level node swarm. */
export interface PackAnnounce {
  readonly scope: Path
  readonly pack: string // the `own_<leaf>` pack tool — the one unit that announces (never N node-tools)
  readonly drill: readonly NodeTool[] // covering nodes as in-pack drill-down (RETR-5 covering set)
}

/** The index-read seam this facet consumes. It owns none of these — it decides WHEN to fire + WHICH is live. */
export interface PokeSources {
  /** The scope's injected pack (RETR-2, EPIC-19) — SUPPLIED; this WP triggers its injection, never builds it. */
  readonly pack: (scope: Path) => Pack
  /** The compact `≤ POKE_CAP` push notice for a settled scope — SUPPLIED (rendering is a seam, not this WP). */
  readonly notice: (scope: Path, pack: Pack) => string
  /** The nodes covering a scope, already minted as MCP tools (index-supplied — no hashing here, RETR-5). */
  readonly covering: (scope: Path) => readonly NodeTool[]
}

/** The facet surface. `poke` narrows the frozen `PokeApi.poke`; `projectTools` binds the frozen `ProjectApi`. */
export interface PokeFacet extends PokeApi, ProjectApi {
  poke(scope: Path): Poke | null
  projectTools(scope: Path): readonly NodeTool[]
  /** Feed one tool call through the debounce automaton (RETR-4) + projection law (RETR-5). */
  feed(call: ToolCall): PokeStep
  /** X1 pack-grain exposure: the `own_<leaf>` pack + its covering nodes as in-pack drill. */
  announce(scope: Path): PackAnnounce
  /** The current live tool set (RETR-5: the covering set of the current scope, retracting on leave). */
  live(): readonly NodeTool[]
}

// ── pure helpers ────────────────────────────────────────────────────────────────────────────────────────
/** Scope-signal classifier (RETR-4b/4c/4d): a single-file Read/Edit/Write IS navigation (scope = that
 *  file's node); a multi-file Grep/Glob has no single scope; a Bash path-arg is a command, not a location.
 *  Total — never throws (RETR-9). */
export function classify(call: ToolCall): Signal {
  const isNav = call.tool === "Read" || call.tool === "Edit" || call.tool === "Write"
  const [only] = call.paths
  if (isNav && call.paths.length === 1 && only !== undefined) return { kind: "navigate", scope: only }
  return { kind: "suppress" } // multi-file span / Bash command / multi-path — no single scope
}

/** The `own_<leaf>` pack tool name (X1): `own_` + the scope's leaf segment (after the last `/` or `:`). */
export function packToolName(scope: Path): string {
  const parts = scope.split(/[/:]/).filter((s) => s.length > 0)
  const leaf = parts.length > 0 ? parts[parts.length - 1] : scope
  return `own_${leaf}`
}

// ── the automaton ───────────────────────────────────────────────────────────────────────────────────────
export function createPoke(sources: PokeSources): PokeFacet {
  let currentScope: Path | null = null // the scope the navigator is in RIGHT NOW
  let runLen = 0 // consecutive tool calls the current scope has stayed current (the settle counter)
  const poked = new Set<Path>() // per-session once-per-scope guard (RETR-4i)
  let liveSet: readonly NodeTool[] = [] // the current projection (RETR-5: retracts on scope-change)

  /** RETR-5 covering-set projection — PURE + total (miss ⇒ empty set, never a throw). */
  function projectTools(scope: Path): readonly NodeTool[] {
    try {
      return sources.covering(scope)
    } catch {
      return [] // RETR-9: total — a malformed scope yields an empty tool set, never a throw
    }
  }

  /** X1 pack-grain announce: the one `own_<leaf>` pack + its covering nodes as in-pack drill. */
  function announce(scope: Path): PackAnnounce {
    return { scope, pack: packToolName(scope), drill: projectTools(scope) }
  }

  /** RETR-4 fire primitive: the scope's `Poke` iff it is the CURRENT settled scope (`runLen ≥ N`) AND was
   *  not already poked this session; else `null`. Total (RETR-9). The `N = 2` debounce is enforced by the
   *  automaton (`feed` advances `runLen`); this method is the once-per-scope gate + pack build. */
  function poke(scope: Path): Poke | null {
    try {
      if (scope !== currentScope) return null // not the current scope — a stale / off-navigator request
      if (runLen < SETTLE_WINDOW) return null // not yet settled across N=2 consecutive calls (debounce)
      if (poked.has(scope)) return null // ≤1 poke / scope / session (RETR-4i)
      poked.add(scope)
      const pack = sources.pack(scope)
      return { scope, pack, notice: sources.notice(scope, pack) } // unasked push: notice + that scope's pack
    } catch {
      return null // RETR-9: total — never propagate a throw
    }
  }

  /** The debounce automaton (RETR-4) + projection law (RETR-5): consume one tool call, advance the settle
   *  counter, retract/re-project on a scope-change, and fire at most one poke on a fresh settle. */
  function feed(call: ToolCall): PokeStep {
    const signal = classify(call)
    if (signal.kind === "navigate") {
      if (signal.scope === currentScope) {
        runLen += 1 // the scope remains current — advance toward the settle window
      } else {
        currentScope = signal.scope // scope-change: the navigator moved
        runLen = 1
        liveSet = projectTools(signal.scope) // RETR-5b: retract the old covering set, project the new one
      }
    } else if (currentScope !== null) {
      runLen += 1 // a suppressed call moves nothing — the current scope stays current across this call
    }
    const fired = currentScope === null ? null : poke(currentScope)
    return { signal, poke: fired, tools: liveSet }
  }

  function live(): readonly NodeTool[] {
    return liveSet
  }

  return { poke, projectTools, feed, announce, live }
}
