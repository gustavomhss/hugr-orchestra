// Source: TechLead mcp/src/tools/wave-scheduler.ts. Pure scheduling advice.
// Adapted from TechLead a68e7af. Copyright 2026 HuGR Labs. Apache-2.0.
import { schedule, type SchedulerWp, type WaveEvent } from "../engine/scheduler.ts"
import { text } from "../governance/contracts.ts"
import type { ToolDef } from "../contract.ts"
import { waveSchedulerToolDescriptor } from "../governance/descriptors.ts"
export { waveSchedulerToolDescriptor } from "../governance/descriptors.ts"
const tool: ToolDef<{ wps: SchedulerWp[]; events: WaveEvent[]; cap?: number }> = {
  ...waveSchedulerToolDescriptor,
  handler(input: { wps: SchedulerWp[]; events: WaveEvent[]; cap?: number }) {
    return text({ ...schedule(input.wps, input.events, input.cap), advice: true, sealRequires: "host-observed verification and independent review" })
  },
}
export default tool
