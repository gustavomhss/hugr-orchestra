import { Effect } from "effect"
import { CodeIndex } from "@orchestra/core/research-toolkit/code-index/types"
import { Tool } from "./tool"

// F0 stub (J3.1-J3.3): L1 implements it and E1 registers it. No seat sees it before it enters ResearchSeatTools.OWN (JD-2).
export const CodeSearchTool = Tool.define("code_search", Effect.succeed({
  description: "Not implemented.",
  parameters: CodeIndex.SearchInput,
  execute: (): Effect.Effect<Tool.ExecuteResult> => Effect.die("not implemented"),
}))
