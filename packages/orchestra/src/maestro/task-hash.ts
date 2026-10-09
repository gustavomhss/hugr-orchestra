import { createHash } from "node:crypto"
import type { RelayArm } from "@orchestra/schema/relay-arm"

export type TaskIntent = {
  subagentType: string
  prompt: string
  model?: string
}

export type TaskHashBinding = TaskIntent & {
  planRevisionID: string
  revisionHash: string
  validationRecordID: string
  validationHash: string
  contextHash: string
  policyHash: string
  workflowBinding?: RelayArm.WorkflowDefinition
  writePaths?: readonly string[]
}

export function taskHash(input: TaskHashBinding) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        subagent_type: input.subagentType,
        prompt: input.prompt,
        model: input.model ?? null,
        planRevisionID: input.planRevisionID,
        revisionHash: input.revisionHash,
        validationRecordID: input.validationRecordID,
        validationHash: input.validationHash,
        contextHash: input.contextHash,
        policyHash: input.policyHash,
        ...(input.workflowBinding ? { bindingVersion: "workflow-v1", workflowBinding: canonical(input.workflowBinding),
          writePaths: input.writePaths ?? [] } : {}),
      }),
    )
    .digest("hex")
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonical(item)]))
  return value
}
