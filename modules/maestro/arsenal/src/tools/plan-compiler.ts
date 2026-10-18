// Adapted from TechLead a68e7af92c7ed5aaf8b6574b7ad2f705fb38eeb5.
// Copyright 2026 HuGR Labs. Apache-2.0 (http://www.apache.org/licenses/LICENSE-2.0).
// Changed: distinguish supplied-edge computation from actual compiler acquisition.
import { text } from "../contract"
import type { Tool } from "../contract"
import { buildPlan } from "../plan"
import type { PartitionInput } from "../plan"
import { descriptor } from "../registry"
const tool: Tool<PartitionInput> = {
  ...descriptor("plan-compiler"),
  handler(input) {
    return text(buildPlan(input), { next: "verify supplied edge provenance, then project Plan into briefs/dag/policy/barrel", invariant: "pure assembly validates supplied partition; soundEdges are caller evidence, not diagnostics acquired by this tool" })
  },
}
export default tool
