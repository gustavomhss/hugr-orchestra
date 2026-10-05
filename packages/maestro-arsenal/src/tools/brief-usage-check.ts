// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
import { type Tool, text } from "../contract.ts";
import { acquisitionDescriptors } from "../engine/descriptors.ts";
import { detectBriefUsage, type BriefUsageOptions } from "../engine/brief-usage.ts";
const tool: Tool<BriefUsageOptions> = {
  ...acquisitionDescriptors["brief-usage-check"],
  async handler(input, context) { return text(await detectBriefUsage(input, context), { next: "trim brief to actual symbol needs", invariant: "compiler acquisition failure never becomes empty over-spec evidence" }); },
};
export default tool;
