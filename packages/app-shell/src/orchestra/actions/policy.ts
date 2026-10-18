import { Schema } from "effect"
import { ActionsRequestError, type ActionsScope, type createActionsAPI } from "./api"

/** Keep provider policy evidence separate from the local binding policy being edited. */
export async function readPolicy(api: ReturnType<typeof createActionsAPI>, target: ActionsScope, signal: AbortSignal) {
  const values = await Promise.all([api.resources(target, { kind: "policy" }, signal), api.policy(target, signal)])
  if (values[1].binding.id !== target.bindingID || values[1].binding.revision !== target.revision) throw new ActionsRequestError("binding_stale")
  return { ...values[0], items: values[0].items.map((item) => {
    if (item.bindingID !== target.bindingID || item.kind !== "policy") throw new ActionsRequestError("binding_stale")
    const data = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Json))(item.data)
    return { ...item, data: { ...data, ...(data.policy === undefined ? {} : { nativePolicy: data.policy }), policy: { ...values[1].policy } } }
  }) }
}
