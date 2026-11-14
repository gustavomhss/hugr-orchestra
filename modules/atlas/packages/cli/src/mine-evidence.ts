import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Candidate, GenesisReport } from "@atlas/genesis"
import type { MineSlot } from "./mine-proposer.js"

/** Operator-selected receipts, not a serialized candidate/report: never read signals or export model text. */
export function createMineEvidence(env: NodeJS.ProcessEnv, slot: MineSlot | undefined, revisionSelector: string) {
  const directory = env.ATLAS_MINE_EVIDENCE_DIR
  if (!directory) return { plan: (_sites: readonly Candidate[]) => {}, report: (_report: GenesisReport) => {} }
  const arm = slot ?? "advisory"
  if (!["advisory", "dependency", "count", "definition", "semantic"].includes(arm)) {
    throw new Error("mine evidence requires a known mining arm")
  }
  const write = (kind: "plan" | "report", value: unknown) => {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    // Exclusive creation preserves earlier evidence rather than silently replacing another attempt.
    writeFileSync(join(directory, `${kind}-${arm}.json`), JSON.stringify(value) + "\n", { flag: "wx", mode: 0o600 })
  }
  return {
    plan: (sites: readonly Candidate[]) => write("plan", {
      schemaVersion: 1, arm, revisionSelector,
      sites: sites.map((cand) => ({ rank: cand.rank, ppr: cand.ppr, kind: cand.site.kind,
        path: cand.site.qualifiedPath, subtreeHash: cand.site.subtreeHash })),
    }),
    report: (report: GenesisReport) => write("report", {
      schemaVersion: 1, arm, llmCalls: report.llmCalls, modelCalls: report.modelCalls ?? null,
      budgetSpent: report.budgetSpent, answersStored: report.answersStored ?? null,
      admittedClaims: report.admittedClaims ?? null, stagedRows: report.seeded.length,
      seededFactIdentity: "reported-id",
      seededFactIds: report.seeded.map((fact) => fact.id), interrupted: report.resumeToken !== undefined,
      coverage: report.coverage === undefined ? null : { planned: report.coverage.planned,
        sites: report.coverage.sites.map((row) => ({ rank: row.rank, kind: row.site.kind,
          path: row.site.qualifiedPath, outcome: row.outcome, facts: row.outcome === "seeded" ? row.facts : [],
          factIdentity: row.outcome === "seeded" ? row.factIdentity ?? "reported-id" : null,
          cause: row.outcome === "unvisited" ? row.cause : null })),
      },
    }),
  }
}
