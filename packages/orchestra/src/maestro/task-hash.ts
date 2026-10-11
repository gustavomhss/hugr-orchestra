import { createHash } from "node:crypto"

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
      }),
    )
    .digest("hex")
}
