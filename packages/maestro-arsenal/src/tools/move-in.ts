// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
import { type Tool, text } from "../contract.ts";
import { acquisitionDescriptors } from "../engine/descriptors.ts";
import { requireContext } from "../engine/acquisition.ts";
import { planMove, absorbMove, structuralMemory, persistMemory } from "../onboard/move-in.ts";
export interface MoveInInput { root?: string; budgetLoc?: number; maxAgents?: number; operation?: "plan" | "absorb" | "persist"; replies?: { slice: number; raw: string }[] }
const tool: Tool<MoveInInput> = {
  ...acquisitionDescriptors["move-in"],
  async handler(input, supplied) {
    const context = requireContext(supplied);
    const plan = await planMove(context, input, input.root);
    const memory = input.operation === "absorb" ? absorbMove(plan, input.replies ?? []) : structuralMemory(plan.mm);
    const memoryPath = input.operation === "persist" || input.operation === "absorb" ? await persistMemory(context, memory, plan.mm.coverage) : undefined;
    return text({ mode: plan.mode, memoryPath, memory, stats: plan.mm.stats, coverage: plan.mm.coverage, parserCoverage: plan.mm.files.map((file) => ({ path: file.path, ...file.coverage })), projectionOmissions: plan.mm.map.omitted,
      distillBrief: plan.mm.distillBrief, ...(plan.mode === "reader" ? { fallback: plan.fallback, plan: plan.plan, briefs: plan.briefs } : {}), authority: "advice" },
    { next: plan.mode === "reader" ? "resolve parser/acquisition gaps using scoped reader briefs; host decides any dispatch" : "inspect structural map; distill only on explicit demand", invariant: "reconnaissance never grants Own authority or triggers model/retrieval calls" });
  },
};
export default tool;
