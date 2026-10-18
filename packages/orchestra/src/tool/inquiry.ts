import { Effect } from "effect"
import { Research } from "@orchestra/schema/research"
import { Tool } from "./tool"

// F0 stub (J5.4): I1 implements it and E1 registers it. No seat sees it before it enters ResearchSeatTools.OWN (JD-2).
export const InquiryTool = Tool.define("inquiry", Effect.succeed({
  description: "Not implemented.",
  parameters: Research.InquiryInput,
  execute: (): Effect.Effect<Tool.ExecuteResult> => Effect.die("not implemented"),
}))
