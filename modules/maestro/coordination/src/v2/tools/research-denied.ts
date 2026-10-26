import { Effect } from "effect"
import { Tool } from "@orchestra/core/tool/tool"
import { Research } from "@orchestra/schema/research"

export function denied(error: Research.Error) {
  return Effect.fail(new Tool.Failure({ message: `Research denied: ${error.code}: ${error.message}` }))
}
