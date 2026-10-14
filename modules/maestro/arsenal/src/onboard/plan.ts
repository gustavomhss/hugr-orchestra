// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
import { AcquisitionError } from "../engine/acquisition.ts";
export interface FileLoc { path: string; loc: number }
export interface ReadingSlice { id: number; files: FileLoc[]; loc: number; oversized: boolean }
export interface ReadingPlan { slices: ReadingSlice[]; agentCount: number; fileCount: number; totalLoc: number; budgetLoc: number; maxAgents: number; capped: boolean; rationale: string }
export interface PlanOpts { budgetLoc?: number; maxAgents?: number }
function pack(files: FileLoc[], budget: number): ReadingSlice[] {
  return files.reduce<ReadingSlice[]>((slices, file) => {
    const last = slices.at(-1);
    if (!last || last.oversized || file.loc > budget || last.loc + file.loc > budget) {
      slices.push({ id: slices.length, files: [file], loc: file.loc, oversized: file.loc > budget });
      return slices;
    }
    last.files.push(file);
    last.loc += file.loc;
    return slices;
  }, []);
}
export function planReadingSlices(files: FileLoc[], opts: PlanOpts = {}): ReadingPlan {
  const budget = opts.budgetLoc ?? 2000;
  const maxAgents = opts.maxAgents ?? 12;
  if (!Number.isInteger(budget) || budget < 1 || !Number.isInteger(maxAgents) || maxAgents < 1 || maxAgents > 100 || files.some((file) => !Number.isFinite(file.loc) || file.loc < 0))
    throw new AcquisitionError("READING_LIMIT_INVALID", "finite LOC and positive bounded budget/count required");
  const usable = files.filter((file) => file.loc > 0).slice().sort((a, b) => a.path.localeCompare(b.path));
  const totalLoc = usable.reduce((sum, file) => sum + file.loc, 0);
  const initial = pack(usable, budget);
  const capped = initial.length > maxAgents;
  const state = { budgetLoc: capped ? Math.max(budget, Math.ceil(totalLoc / maxAgents)) : budget, slices: initial };
  if (capped) {
    state.slices = pack(usable, state.budgetLoc);
    while (state.slices.length > maxAgents) {
      state.budgetLoc = Math.ceil(state.budgetLoc * 1.15) + 1;
      state.slices = pack(usable, state.budgetLoc);
    }
  }
  return { ...state, agentCount: state.slices.length, fileCount: usable.length, totalLoc, maxAgents, capped,
    rationale: `${totalLoc} LOC over ${usable.length} files → ${state.slices.length} disjoint reading slices${capped ? "; CAPPED: skim structure/hotspots" : ""}; advisory only, no automatic dispatch` };
}
