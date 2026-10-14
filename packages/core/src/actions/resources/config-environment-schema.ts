export * as ActionsEnvironmentSchema from "./config-environment-schema"

import { Schema } from "effect"
import { ActionsConfigCommon } from "./config-common"

const C = ActionsConfigCommon
// Native contracts: https://docs.github.com/en/rest/deployments/environments
// https://docs.gitlab.com/api/environments/ and /api/protected_environments/.
const Reviewer = Schema.Struct({ type: Schema.Literals(["User", "Team"]), reviewer: Schema.Struct({
  id: C.ID, login: Schema.optionalKey(C.Text), slug: Schema.optionalKey(C.Text),
}) })
export const GitHub = Schema.Struct({ id: C.ID, name: C.Text, created_at: Schema.String, updated_at: Schema.String,
  protection_rules: Schema.Array(Schema.Struct({ type: C.Text, id: Schema.optionalKey(C.ID),
    wait_timer: Schema.optionalKey(Schema.Int), prevent_self_review: Schema.optionalKey(Schema.Boolean),
    reviewers: Schema.optionalKey(Schema.Array(Reviewer)) })),
  deployment_branch_policy: Schema.NullOr(Schema.Struct({ protected_branches: Schema.Boolean, custom_branch_policies: Schema.Boolean })),
})
export const BranchPolicy = Schema.Struct({ id: C.ID, name: C.Text, type: Schema.Literals(["branch", "tag"]) })
export const BranchPolicies = Schema.Struct({ total_count: Schema.Int, branch_policies: Schema.Array(BranchPolicy) })
export const GitLab = Schema.Struct({ id: C.ID, name: C.Text, state: C.Text,
  description: Schema.optionalKey(Schema.NullOr(Schema.String)), tier: Schema.optionalKey(Schema.NullOr(Schema.String)),
  updated_at: Schema.optionalKey(Schema.String),
})
export const Access = Schema.Struct({ id: C.ID, user_id: Schema.optionalKey(Schema.NullOr(C.ID)),
  group_id: Schema.optionalKey(Schema.NullOr(C.ID)), access_level: Schema.optionalKey(Schema.NullOr(Schema.Int)),
  access_level_description: Schema.optionalKey(Schema.String), required_approvals: Schema.optionalKey(Schema.Int) })
export const Protected = Schema.Struct({ name: C.Text, deploy_access_levels: Schema.Array(Access),
  required_approval_count: Schema.optionalKey(Schema.Int), approval_rules: Schema.optionalKey(Schema.Array(Access)) })
export const Delete = Schema.Struct({ provider: C.Provider, name: C.Text })
export const Form = Schema.Struct({ provider: C.Provider, name: C.Text, reviewers: Schema.String, refs: C.Text,
  timer: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 43_200 }))), preventSelfReview: Schema.Boolean,
  description: Schema.optionalKey(Schema.String), tier: Schema.optionalKey(Schema.Literals(["production", "staging", "testing", "development", "other"])) })
export const Review = Schema.Struct({ provider: C.Provider, decision: Schema.Literals(["Approve", "Reject"]), comment: C.Value })

export function patterns(refs: string) {
  return Array.from(new Set(refs.split(",").map((ref) => ref.trim()).filter(Boolean)))
}
