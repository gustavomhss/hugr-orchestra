import type { Actions } from "@orchestra/schema/actions"
import { ActionsRequestError, type ActionsScope, type createActionsAPI } from "./api"

/** A local GitLab proposal is read at a proved branch head, never selected by CI settings. */
export async function readProposalSource(api: ReturnType<typeof createActionsAPI>, scope: ActionsScope,
  provider: Actions.ProviderKind, query: { path: string; ref: string }, signal: AbortSignal) {
  if (provider !== "gitlab" || /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(query.ref)) return api.source(scope, query, signal)
  const base = await api.sourceBase(scope, query.ref, signal)
  if (base.bindingID !== scope.bindingID || base.ref !== query.ref) throw new ActionsRequestError("source_conflict")
  const source = await api.source(scope, { path: query.path, ref: base.commit }, signal)
  if (source.bindingID !== scope.bindingID || source.path !== query.path || source.ref !== base.commit || source.commit !== base.commit)
    throw new ActionsRequestError("source_conflict")
  return { ...source, ref: base.ref }
}
