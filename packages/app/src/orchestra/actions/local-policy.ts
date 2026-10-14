import { Actions } from "@orchestra/schema/actions"
import { Option, Schema } from "effect"
import { actionsError, ActionsRequestError, type createActionsAPI } from "./api"
import type { State } from "./contract"

export function saveLocalPolicy(input: {
  api: ReturnType<typeof createActionsAPI>; state: () => State; update: (patch: Partial<State>) => void
  mutation: (key: string, work: (signal: AbortSignal) => Promise<void>) => Promise<void>
  refresh: () => Promise<void>
}, payload: unknown) {
  const provider = Schema.optional(Actions.ProviderKind)
  const retention = Schema.Int.check(Schema.isGreaterThan(0))
  const form = Schema.decodeUnknownOption(Schema.Union([Schema.Struct({ provider, retentionDays: retention, execution: Schema.NonEmptyString }),
    Schema.Struct({ provider, retention, policy: Schema.NonEmptyString })]), { onExcessProperty: "error" })(payload)
  const binding = input.state().binding
  if (!binding || Option.isNone(form) || form.value.provider && form.value.provider !== binding.provider.kind) {
    input.update({ commandError: actionsError(new ActionsRequestError("invalid_input")) }); return Promise.resolve()
  }
  const target = { bindingID: binding.id, revision: binding.revision }
  const value = "retentionDays" in form.value ? { retentionDays: form.value.retentionDays, execution: form.value.execution }
    : { retentionDays: form.value.retention, execution: form.value.policy }
  return input.mutation("policy", async (signal) => {
    const saved = await input.api.updatePolicy(target, value, signal)
    if (saved.binding.id !== target.bindingID || saved.binding.revision !== target.revision + 1) throw new ActionsRequestError("binding_stale")
    if (input.state().binding?.id === target.bindingID && input.state().binding?.revision === target.revision) {
      input.update({ dialog: undefined }); await input.refresh()
    }
  })
}
