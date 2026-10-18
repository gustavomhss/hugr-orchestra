import { Effect } from "effect"
import { CodeIndex } from "@orchestra/core/research-toolkit/code-index/types"
import { Tool } from "./tool"

// F0 stub (J3.4-J3.8): L2 implements it and E1 registers it. No seat sees it before it enters ResearchSeatTools.OWN (JD-2).
export const CodeLocateTool = Tool.define("code_locate", Effect.succeed({
  description: "Not implemented.",
  parameters: CodeIndex.LocateInput,
  execute: (): Effect.Effect<Tool.ExecuteResult> => Effect.die("not implemented"),
}))
