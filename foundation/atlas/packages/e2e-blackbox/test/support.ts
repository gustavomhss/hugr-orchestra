// @atlas/e2e-blackbox — test/support.ts  (story plumbing over the black-box harness — no product logic)
//
// Thin conveniences the stories share: the scoped admin policy that authorizes the KNOW-11 write actor, the
// deterministic actor id, and an `emitFact` that writes a fact JSON to disk and drives the REAL `atlas emit`
// subprocess. NOTE the CLI arg convention: the hand-rolled parser only accepts `--at=<sha>` (the `=` form) —
// a bare `--at <sha>` folds the flag to `'true'` and drops the sha to a positional (a real CLI-usability
// quirk, surfaced in the findings). All calls go through `runAtlas` (subprocess) — pure black-box execution.

import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { runAtlas } from "../src/harness.js"
import type { AtlasRun, FixtureRepo } from "../src/harness.js"
import { anchorsOf } from "./author8-subprocess.js"
import type { GroundedFact } from "@atlas/knowledge"
import type { Tier } from "@atlas/contracts"

/** The deterministic KNOW-11 write actor — set as `ATLAS_ACTOR` (env wins in `composeRuntime`), so authz is
 *  stable regardless of the host's `git config user.email`. */
export const ACTOR = "e2e@atlas.local"

/** The deterministic KNOW-8 ratifier — set as `ATLAS_RATIFY_TOKEN` (env-sourced by `composeRuntime`, never
 *  the fact payload). The stories emit `tier≥T1` facts (visible in the bounded read pack, TOOLS-6), which
 *  route to KNOW-18 full-ratify — so the operator driving `atlas emit` carries a ratifier signature, exactly
 *  as a lead would. Any non-empty ratifier commits a NON-T0 fact; a T0 fact would still require `billy`. */
export const RATIFIER = "lead"

/** The KNOW-8 security ratifier a `T0` commit REQUIRES (the `billy` gate — @atlas/knowledge ratify.ts). Set
 *  as `ATLAS_RATIFY_TOKEN`, it commits a T0 fact; ANY other token (incl. {@link RATIFIER}) leaves T0 refused.
 *  A non-T0 full-ratify fact (T1) commits under any non-empty token, so this also commits a T1. */
export const BILLY = "billy"

/** An admin policy that AUTHORIZES {@link ACTOR} to write `scope` (KNOW-11). Empty near-dup τ=1 + no T0
 *  keywords (the conservative floor). Absent this, every scoped write is fail-closed denied. */
export function scopedPolicy(scope = "src"): string {
  return JSON.stringify({
    nearDup: { claimNormThreshold: 1 },
    t0Heuristic: { keywords: [] },
    authz: { scopes: { [scope]: [ACTOR] } },
  })
}

let seq = 0

/** Write `fact` to a fresh JSON file in the repo and drive `atlas emit <file> --at=<HEAD>` (real subprocess).
 *  The `at` sha is vestigial for grounding (the gate re-derives against the built index), but the CLI
 *  requires a non-empty `--at`. Returns the real `{stdout, stderr, exitCode}`. */
export function emitFact(repo: FixtureRepo, fact: GroundedFact): AtlasRun {
  const path = join(repo.repoPath, `emit-${seq++}.json`)
  writeFileSync(path, JSON.stringify(fact))
  return runAtlas(repo.repoPath, ["emit", path, `--at=${repo.sha()}`])
}

// ── the happy-path fact AUTHOR — the product `atlas draft` door (peer of `emitFact`) ─────────────────────────
// Lives here, NOT in author8-subprocess.ts: that file is a product-type-FREE pure-plumbing helper, guarded to
// import no `@atlas/*` (s-author8-round-trip's black-box law). `draftFact` returns a typed `GroundedFact`, so
// like `emitFact` it belongs in this product-type-aware story-plumbing module.

/** The structurally-relevant fields of the `DraftOut` envelope `atlas draft --json` prints (the product
 *  `DraftOut` — @atlas/tools types.ts — carries `operation`/`route`/`requires` too; a black-box author needs
 *  only the composed `fact` and the `rev` the emit wire requires). Parsed off the wire. */
interface DraftEnvelope {
  readonly fact: GroundedFact
  readonly rev: string
}

/**
 * Author a happy-path GROUNDED fact through the PRODUCT `atlas draft <anchor> <slot> <claim> --json` door —
 * a READ-ONLY composition planner that persists NOTHING (cli.ts) — and return the `GroundedFact` it composes
 * off the runtime's OWN index. The product-door replacement for the former in-process fabricators: the
 * grounding, the real `subtreeHash`, and the `nodeKey` identity are all PRODUCT-computed, exactly as a user
 * typing `atlas draft` receives them.
 *
 * `tier` is APPLIED here (default `T1`). `atlas draft` hard-defaults `T2` "by construction" (KNOW-6 move-in,
 * draft.ts `DRAFT_TIER`), but the visible-fact stories need `tier≥T1` (TOOLS-6 bounds `T2` OUT of the read
 * pack) — the SAME `T1` the retired `groundedAdvisoryFact` defaulted to. `tier` is NOT in the identity
 * formula (draft.ts), so this never shifts the drafted `id`; only the declared governance class is set — the
 * emit truth-gate still re-derives the product grounding untouched.
 *
 * Emit is DELIBERATELY separate — callers drive `emitFact` themselves. The ordered dedup / drift / supersede
 * stories interleave `query` assertions BETWEEN emits, so folding emit into authoring would corrupt their
 * sequence. Returns `{fact, draft}`; `draft` is the read-only subprocess run. Throws on a non-zero draft
 * (a TEST-SETUP fault — a silent empty fact would make every downstream assertion pass VACUOUSLY). */
export function draftFact(
  repo: FixtureRepo,
  anchor: string,
  slot: string,
  claim: string,
  tier: Tier = "T1",
): { readonly fact: GroundedFact; readonly draft: AtlasRun } {
  const run = runAtlas(repo.repoPath, ["draft", anchor, slot, claim, "--json"])
  if (run.exitCode !== 0) {
    throw new Error(
      `support: 'atlas draft ${anchor} ${slot} … --json' exited ${run.exitCode}:\n${run.stdout}${run.stderr}`,
    )
  }
  const env = JSON.parse(run.stdout) as DraftEnvelope
  if (env.fact === undefined || typeof env.rev !== "string") {
    throw new Error(`support: 'draft --json' printed no {fact, rev}:\n${run.stdout}`)
  }
  return { fact: { ...env.fact, tier }, draft: run }
}

/** The declared NAME of a folded unit key — the trailing `:`-field of its last `::` segment
 *  (`file::<start>:<kind>:<name>` ⇒ `<name>`, cf. adapter-io/src/ast.ts `unitPath`). */
function unitLeafName(key: string): string {
  const seg = key.split("::").at(-1) ?? ""
  return seg.slice(seg.lastIndexOf(":") + 1)
}

/** Resolve a top-level SYMBOL name inside `filePath` to the folded `::` unit qualifiedPath `atlas draft`
 *  expects as a symbol anchor — by reading the product `atlas anchors <file>` census (the discovery door),
 *  never re-folding the index in process. Throws if no such symbol unit exists (a TEST-SETUP fault). */
export function symbolAnchorKey(repo: FixtureRepo, filePath: string, symbolName: string): string {
  const { units } = anchorsOf(repo.repoPath, filePath)
  const hit = units.find((u) => u.kind === "symbol" && unitLeafName(u.qualifiedPath) === symbolName)
  if (hit === undefined) {
    throw new Error(
      `support: no symbol unit '${symbolName}' under '${filePath}' (anchors census has no such '::' node)`,
    )
  }
  return hit.qualifiedPath
}

/** The rendered `  inv <tier> <nodeId>: <claim>` lines of a query verdict (the observable fact rows). */
export function invLines(stdout: string): string[] {
  return stdout.split("\n").filter((l) => l.trimStart().startsWith("inv "))
}

/** The rendered `  subsumes <broader> ⊃ <narrower>` lines of a query verdict. */
export function subsumesLines(stdout: string): string[] {
  return stdout.split("\n").filter((l) => l.includes("subsumes "))
}
