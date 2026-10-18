import { Effect } from "effect"
import { Probe } from "@orchestra/core/research-toolkit/probe/types"
import { Tool } from "./tool"

// F0 stub (J4): P3 implements it and E1 registers it. No seat sees it before it enters ResearchSeatTools.OWN (JD-2).
export const ProbeRunTool = Tool.define("probe_run", Effect.succeed({
  description: "Not implemented.",
  parameters: Probe.ProbeInput,
  execute: (): Effect.Effect<Tool.ExecuteResult> => Effect.die("not implemented"),
}))
