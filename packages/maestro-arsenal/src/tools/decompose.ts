// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
import { type Tool, text } from "../contract.ts";
import { acquisitionDescriptors } from "../engine/descriptors.ts";
import { runDecompose, type RunDecomposeOptions } from "../engine/run-decompose.ts";
const tool: Tool<RunDecomposeOptions> = {
  ...acquisitionDescriptors["decompose"],
  async handler(input, context) { return text(await runDecompose(input, context), { next: "review artifacts, then project Plan into briefs/dag/gates", invariant: "artifact verification grants no write authority; no automatic in-place rewrite" }); },
};
export default tool;
