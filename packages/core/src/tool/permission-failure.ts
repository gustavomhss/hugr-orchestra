export * as ToolPermissionFailure from "./permission-failure"

import { ToolFailure } from "@orchestra/llm"
import { PermissionV2 } from "../permission"
import { ToolSafety } from "../tool-safety"

const MAX_RULES = 5

/**
 * The failure a native tool reports when its permission check refuses, or undefined for any other error so the caller
 * keeps its own message. The model gets the owner's own words, or the deny rules that matched, and a next step: a bare
 * "Unable to ..." left it retrying the same call.
 */
export function of(error: unknown) {
  if (error instanceof PermissionV2.CorrectedError)
    return new ToolFailure({ message: `The owner declined this call and said: ${error.feedback}` })
  if (error instanceof PermissionV2.BlockedError)
    return new ToolFailure({
      message: `Orchestra's permission rules deny this call${rules(error.rules)}. Continue with the tools you are allowed to use, or say what you need.`,
    })
  // ToolSafety's refusal names its reason, so the model can act on it.
  if (error instanceof ToolSafety.Denied) return new ToolFailure({ message: error.message, error })
}

function rules(ruleset: PermissionV2.BlockedError["rules"]) {
  const denying = ruleset.filter((rule) => rule.effect === "deny")
  if (denying.length === 0) return ""
  const listed = denying.slice(0, MAX_RULES).map((rule) => `${rule.action} ${rule.resource}`)
  const more = denying.length > MAX_RULES ? `, and ${denying.length - MAX_RULES} more` : ""
  return ` (deny rules: ${listed.join("; ")}${more})`
}
