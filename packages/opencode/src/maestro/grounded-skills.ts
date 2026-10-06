import { Effect } from "effect"
import { readAuthorization } from "./authorization"
import { readContext } from "./context-record"
import { readValidation } from "./validation-record"

// The skill content a GROUNDED context record bound to a dispatch authorization, as synthetic prompt parts for the
// child. Any other mode, or a missing authorization, validation or context record, contributes nothing.
export const parts = Effect.fn("GroundedSkills.parts")(function* (authorizationID: string) {
  const authorization = yield* readAuthorization(authorizationID)
  const validation = authorization ? yield* readValidation(authorization.validationRecordID) : undefined
  const context = validation?.contextRecordID ? yield* readContext(validation.contextRecordID) : undefined
  return context?.mode === "GROUNDED"
    ? context.skills.map((skill) => ({
        type: "text" as const,
        synthetic: true,
        text: `<skill_content name="${skill.name}">\n${skill.content}\n</skill_content>`,
      }))
    : []
})

export * as GroundedSkills from "./grounded-skills"
