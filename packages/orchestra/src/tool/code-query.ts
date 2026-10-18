import { Effect } from "effect"
import { CodeIndex } from "@orchestra/core/research-toolkit/code-index/types"
import { Tool } from "./tool"

// F0 stub (J2.9): X4 implements it and E1 registers it. No seat sees it before it enters ResearchSeatTools.OWN (JD-2).
export const CodeQueryTool = Tool.define("code_query", Effect.succeed({
  description: "Not implemented.",
  parameters: CodeIndex.CodeQuery,
  execute: (): Effect.Effect<Tool.ExecuteResult> => Effect.die("not implemented"),
}))
