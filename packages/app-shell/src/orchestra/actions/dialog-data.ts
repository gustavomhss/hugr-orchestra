import type { Actions } from "@orchestra/schema/actions"
import { ActionsRequestError, type ActionsScope, type createActionsAPI } from "./api"
import type { Dialog } from "./contract"
import { readPolicy } from "./policy"

export async function readDialog(api: ReturnType<typeof createActionsAPI>, scope: ActionsScope, dialog: Dialog, prior: Actions.ResourcePage | undefined, signal: AbortSignal) {
  if (dialog.kind === "project-settings") return readPolicy(api, scope, signal)
  if (dialog.kind === "approval") return api.resources(scope, { kind: "environments", runID: dialog.runID }, signal)
  if (dialog.kind !== "edit-environment") throw new ActionsRequestError("invalid_input")
  const target = prior?.items.find((item) => item.bindingID === scope.bindingID && item.kind === "environments" && item.id === dialog.id && item.scope === dialog.scope)
  if (!target) throw new ActionsRequestError("binding_stale")
  const page = await api.resources(scope, { kind: "environments", resourceID: target.name }, signal)
  if (page.items.length !== 1 || page.items[0].bindingID !== scope.bindingID || page.items[0].id !== target.id || page.items[0].scope !== target.scope)
    throw new ActionsRequestError("binding_stale")
  return { ...prior, capturedAt: page.capturedAt, items: (prior?.items ?? []).map((item) => item === target ? page.items[0] : item) }
}
