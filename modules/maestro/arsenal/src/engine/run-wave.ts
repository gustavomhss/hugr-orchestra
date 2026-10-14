// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
import { buildPlan } from "../plan.ts";
import { type ArsenalContext } from "../contract.ts";
import { proposePartition } from "./propose-partition.ts";
import { extractEdges } from "./extract-edges.ts";
import { applyPlan } from "./apply-plan.ts";
import { ownerUsedHelpers } from "./owner-usage.ts";
import { computeBaseline, verifyInProject } from "./verify-in-project.ts";

export interface RunWaveOptions { source: string; k: number; target: string; externalImports?: Record<string, string>; baselineSha?: string; barrelName?: string }
export async function runWave(opts: RunWaveOptions, context: ArsenalContext) {
  const partition = proposePartition(opts.source, opts.k);
  const soundEdges = await extractEdges({ source: opts.source, assignment: partition.assignment, targetPath: opts.target }, context);
  const plan = buildPlan({ ...partition, soundEdges, ownerUsedHelpers: ownerUsedHelpers(opts.source, partition.symbols, partition.assignment), baselineSha: opts.baselineSha ?? "0", target: opts.target });
  const files = applyPlan({ source: opts.source, plan, externalImports: opts.externalImports, barrelName: opts.barrelName });
  const baseline = await computeBaseline(opts.target, context);
  const result = await verifyInProject({ godfilePath: opts.target, files, barrelName: opts.barrelName ?? "barrel", baseline: baseline.diagnostics }, context);
  return { plan, files, verified: plan.ok && result.ok, tscErrors: result.errors, baseline, verification: result };
}
