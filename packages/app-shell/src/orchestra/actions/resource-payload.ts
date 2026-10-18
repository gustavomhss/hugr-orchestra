import type { Actions } from "@orchestra/schema/actions"
import type { Dialog } from "./contract"
import { ActionsRequestError } from "./api"
import { Option, Schema } from "effect"
import { nativePolicyEvidence } from "./settings-evidence"

export function resourcePayload(data: FormData, input: { provider: Actions.ProviderKind; kind: Dialog["kind"]; target?: "local" | "native"; resource?: Actions.Resource }): Record<string, string | number | boolean | readonly string[]> {
  if (input.kind === "project-settings" && input.target === "native") {
    if (input.provider !== "github") throw new ActionsRequestError("capability_unavailable")
    const native = nativePolicyEvidence(input.resource)
    if (native.value === undefined || native.version === undefined) throw new ActionsRequestError("source_unresolved")
    const policy = data.get("policy")
    if (policy !== "Project default" && policy !== "Restricted to approved actions") throw new ActionsRequestError("invalid_input")
    return { provider: input.provider, policy }
  }
  const payload: Record<string, string | number | boolean | readonly string[]> = Object.fromEntries([...data.entries()].map(([name, value]): [string, string] => {
    if (typeof value !== "string") throw new ActionsRequestError("invalid_input")
    return [name, value]
  }))
  payload.provider = input.provider
  delete payload.replaceOverrides
  // GitLab hidden is create-only; an unobserved native flag is not false.
  const flags = ["protected", "masked", "hidden"]
  flags.forEach((name) => delete payload[name])
  if (input.provider === "gitlab" && (input.kind === "create-variable" || input.kind === "edit-variable")) {
    payload.protected = data.has("protected")
    payload.masked = data.has("masked")
  }
  if (input.provider === "gitlab" && input.kind === "create-variable") payload.hidden = data.has("hidden")
  delete payload.preventSelfReview
  if (input.kind === "create-environment" || input.kind === "edit-environment") {
    const metadata = input.resource?.data
    const observed = typeof metadata === "object" && metadata !== null && !Array.isArray(metadata) && "preventSelfReview" in metadata ? metadata.preventSelfReview : undefined
    payload.preventSelfReview = input.provider === "gitlab" && typeof observed === "boolean" ? observed : data.has("preventSelfReview")
    if (input.kind === "edit-environment" && input.provider === "gitlab" && (typeof metadata !== "object" || metadata === null || Array.isArray(metadata) || !("reviewers" in metadata) || typeof metadata.reviewers !== "string"))
      throw new ActionsRequestError("source_unresolved")
  }
  const numbers = ["timer", "retention", "runnerGroupID"]
  numbers.forEach((name) => {
    const value = payload[name]
    if (typeof value !== "string") return
    if (!value.trim()) { delete payload[name]; return }
    const number = Number(value)
    if (!Number.isFinite(number)) throw new ActionsRequestError("invalid_input")
    payload[name] = number
  })
  if ((input.kind === "create-runner" || input.kind === "edit-runner") && typeof payload.labels === "string" && payload.labels.trim().startsWith("[")) {
    const labels = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Array(Schema.NonEmptyString)))(payload.labels)
    if (Option.isNone(labels)) throw new ActionsRequestError("invalid_input")
    payload.labels = labels.value
  }
  if (input.kind === "create-schedule" || input.kind === "edit-schedule") {
    const value = payload.input
    // Omission preserves redacted overrides; explicit replacement permits clearing.
    delete payload.input
    if (data.has("replaceOverrides")) payload.input = typeof value === "string" ? value : ""
    if (input.kind === "create-schedule" && typeof value === "string" && value.trim()) payload.input = value
    if (payload.input === undefined) delete payload.inputMode
  }
  return payload
}
