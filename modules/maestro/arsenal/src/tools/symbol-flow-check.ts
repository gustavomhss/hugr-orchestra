// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
import { type Tool, text } from "../contract.ts";
import { acquisitionDescriptors } from "../engine/descriptors.ts";
import { detectSymbolFlow, type SymbolFlowOptions } from "../engine/symbol-flow.ts";
const tool: Tool<SymbolFlowOptions> = {
  ...acquisitionDescriptors["symbol-flow-check"],
  async handler(input, context) { return text(await detectSymbolFlow(input, context), { next: "declare cross-WP seams and fix compiler diagnostics", invariant: "compiler oracle sees actual union; unknowns never pass" }); },
};
export default tool;
