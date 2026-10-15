// @atlas/cli — src/mine-arms.ts  (SOUND-DEFAULT-MINE: genesis ships SOUND-by-default)
//
// The DRIVER-LEVEL multi-arm loop. The FROZEN genesis run-controller stays a single per-arm pass
// (`driveMinePass`, mine.ts); THIS file drives it ONCE PER RESOLVED ARM and unions the outcome. A DEFAULT run
// (unset `ATLAS_MINE_SLOT`) mines the whole SOUND-by-default set — advisory PROSE + dependency + count —
// so a plain `atlas mine` emits the proven facts alongside the prose instead of hiding them behind an env var.
// An EXPLICIT `ATLAS_MINE_SLOT` resolves to a SINGLETON, so the benchmark's per-axis measurement harness (one
// arm per invocation) is preserved EXACTLY — a single-arm run renders byte-identical to the frozen fold.
//
// THE MERGED TOTAL MIRRORS THE DURABLE STORE'S UNION, it is not read back FROM it: each pass writes CANDIDATES
// to the SAME staging sidecar, which unions on `nodeKey` across passes, so the sound facts and the advisory
// prose coexist. This file recomputes that union in memory from the per-arm reports — the number agrees with
// the store because the report's dedup key (`Fact.id`) IS `nodeKey` and distinct arms carry distinct slots, so
// no cross-arm collision. It is a faithful parallel recompute of proposed candidates, not the store's own read.

import type { GenesisReport } from "@atlas/genesis"
import { driveMinePass, type MineDeps } from "./mine.js"
import type { MinePass } from "./mine-render.js"
import { foldVerdict, ledgerSeededIds, passBodyLines, seededCount } from "./mine-render.js"
import { resolveMineSlots, type MineSlot } from "./mine-proposer.js"
import type { CliVerdict } from "./render.js"

/** One resolved arm's finished pass — the slot it ran and the `MinePass` it produced. */
export interface ArmPass {
  readonly slot: MineSlot
  readonly pass: MinePass
}

/** The per-arm pass runner seam — `driveMinePass` in production; a test injects a spy to prove the loop drives
 *  the pass ONCE per resolved arm with the right `slot` (the bench-isolation teeth, AC-B3). */
export type PassRunner = (repoPath: string, deps?: Partial<MineDeps>) => MinePass

/**
 * Drive the FROZEN single per-arm pass ONCE per resolved arm (SEQUENTIALLY — the durable store unions across
 * passes). Unset env ⇒ all three arms; an explicit `ATLAS_MINE_SLOT` ⇒ exactly one. The resolved slot is
 * THREADED on `deps.slot` (never `process.env`), so `resolveProposer` drives the specific arm without a global.
 */
export function driveMineArms(
  repoPath: string,
  deps?: Partial<MineDeps>,
  runPass: PassRunner = driveMinePass,
): readonly ArmPass[] {
  const slots = resolveMineSlots(deps?.env ?? process.env)
  return slots.map((slot) => ({ slot, pass: runPass(repoPath, { ...deps, slot }) }))
}

/** The union SIZE of every arm's seeded facts, deduped by fact id — the durable store's cross-pass union.
 *  #237: reads each arm's LEDGER-derived id set (`ledgerSeededIds`, mine-render.ts) when the arm's report
 *  carries a coverage ledger, falling back to the raw `report.seeded` ids only for a pre-ledger report —
 *  the SAME source `seededCount` (below, per-arm) reads, so the union total and the per-arm line it sits
 *  beside can never disagree the way `report.seeded.length` alone did (#237's measured defect). */
function unionSeededCount(arms: readonly ArmPass[]): number {
  const ids = new Set<string>()
  for (const a of arms) {
    const ledger = ledgerSeededIds(a.pass.report)
    if (ledger !== undefined) for (const factId of ledger) ids.add(factId)
    else for (const f of a.pass.report.seeded) ids.add(f.id as unknown as string)
  }
  return ids.size
}

/**
 * Fold the per-arm passes to ONE `CliVerdict`.
 *
 * A single-arm run (an explicit `ATLAS_MINE_SLOT`, or a set that resolved to one) renders BYTE-IDENTICAL to the
 * frozen single-pass fold — the bench harness reads the same shape it always has. A multi-arm DEFAULT run
 * renders the UNION total, an explicit PER-ARM line (what each arm produced), and each arm's FULL body under its
 * slot heading — the same why-empty cause (the #129/#163 `atlas doctor index` next-step), prompt provenance and
 * coverage ledger a single-arm run gets. `passBodyLines` is the shared source, so no arm's honesty leg is elided.
 */
export function foldArms(arms: readonly ArmPass[], ceiling?: number): CliVerdict {
  if (arms.length === 1) return foldVerdict(arms[0]!.pass, ceiling)
  const unionCount = unionSeededCount(arms)
  const sum = (pick: (r: GenesisReport) => number): number => arms.reduce((n, a) => n + pick(a.pass.report), 0)
  const failed = arms.some((a) => a.pass.report.resumeToken !== undefined || a.pass.refusal !== undefined)
  const perArm = `mine: arms — ${arms.map((a) => `${a.slot} ${seededCount(a.pass.report)}`).join(" · ")}`
  const ratified = arms.reduce((n, a) => n + a.pass.report.ratified.length, 0) // sum, never hardcode 0 — mirrors single-arm foldVerdict so a ratifying pass would not go silent in the default (bobby note; today always 0, mine is candidate-only)
  const lines = [
    `genesis: seeded ${unionCount} candidate fact(s) [union]; ratified ${ratified}`,
    `cost: llmCalls ${sum((r) => r.llmCalls)} · budgetSpent ${sum((r) => r.budgetSpent)}`,
    perArm,
    ...arms.flatMap((a) => [`arm: ${a.slot}`, ...passBodyLines(a.pass, ceiling)]),
  ]
  return { exitCode: failed ? 1 : 0, stdout: `${lines.join("\n")}\n` }
}

/**
 * Run the SOUND-by-default genesis bootstrap over a repo, projecting the MERGED outcome to a `CliVerdict`.
 * This is the CLI entry `atlas mine` calls: unset env unions advisory prose + the two sound arms; an explicit
 * `ATLAS_MINE_SLOT` isolates a single arm (the bench harness). It THROWS the same one class `runMine` does — a
 * `ModelCommandError` a pass captured — which `cli.ts` renders as the governed refusal it is (try/catch unchanged).
 *
 * NOT ATOMIC across arms (bobby note): a later arm throwing after an earlier arm already staged candidates
 * leaves those candidates durable while the verdict renders a refusal — the same partial-run semantics a
 * single arm has, and an idempotent re-run reconciles (the store unions on nodeKey), so it is not corruption.
 */
export async function runMineArms(repoPath: string, deps?: Partial<MineDeps>): Promise<CliVerdict> {
  const arms = driveMineArms(repoPath, deps)
  return foldArms(arms, deps?.budget?.ceiling)
}
