import { createEffect, untrack } from "solid-js"
import type { ModelKey, useLocal } from "@/context/local"
import type { PromptSession } from "@/context/prompt-state"
import type { UserMessage } from "@/v2-wire"

type Local = {
  session: {
    reset(): void
    restore(msg: UserMessage, inherited?: true): void
  }
}

type LocalModel = ReturnType<typeof useLocal>["model"]
type Intent = { model: Pick<LocalModel, "current" | "intent"> }
type Restore = {
  session: {
    inherited(): boolean
    restoreModel(model: ModelKey, variant: string | null | undefined, inherited?: true): void
  }
}
type SessionModel = { providerID: string; id: string; variant?: string }
type PromptState = Pick<PromptSession, "model">

export const resetSessionModel = (local: Local) => {
  local.session.reset()
}

export const syncSessionModel = (local: Local, msg: UserMessage) => {
  local.session.restore(msg, true)
}

const sameSessionModel = (left: SessionModel | undefined, right: SessionModel) =>
  left?.providerID === right.providerID && left.id === right.id && left.variant === right.variant

export const followSessionModel = (
  local: Local & Restore & Intent & {
    model: Pick<LocalModel, "execution">
    session: { ready(): boolean }
  },
  session: {
    lastUserMessage: () => UserMessage | undefined
    info: () => { model?: SessionModel } | undefined
    editor: () => PromptState | undefined
    sessionID: () => string | undefined
  },
) => {
  let previous: { id: string; editor: PromptState; model?: SessionModel } | undefined
  createEffect(() => {
    const id = session.sessionID()
    const editor = session.editor()
    const info = session.info()
    if (previous?.id !== id) previous = undefined
    if (!id || !editor || !info || !local.session.ready()) return
    const model = info.model && { providerID: info.model.providerID, id: info.model.id, variant: info.model.variant }
    const message = model ? undefined : session.lastUserMessage()
    const initial = previous?.id !== id || previous.editor !== editor
    const lastModel = previous?.model
    previous = { id, editor, model }
    untrack(() => {
      if (initial) restorePromptModel(local, editor)
      if (model && initial) {
        restoreStoredSessionModel(local, model)
        return
      }
      // A selector sent by this composer can emit an event before the prompt POST.
      // The wire ref can match while the raw intent still uses inherited or model-default reasoning.
      if (model && !sameSessionModel(lastModel, model) && !sameSessionModel(local.model.execution.input().model, model)) {
        local.session.restoreModel({ providerID: model.providerID, modelID: model.id }, model.variant ?? null, true)
        if (editor.model.current()) editor.model.set(undefined)
      }
      if (message) syncSessionModel(local, message)
    })
    if (!local.session.inherited()) syncPromptModel(local, editor)
  })
}

export function restoreStoredSessionModel(
  local: { model: Pick<LocalModel, "intent"> } & Restore,
  model: SessionModel | undefined,
) {
  if (!model) return
  const intent = local.model.intent()
  if (!local.session.inherited() && (intent.model || intent.variant !== undefined)) return
  // Omission on an exact stored ref must bypass the agent and saved default variant.
  if (intent.model?.providerID === model.providerID && intent.model.modelID === model.id && intent.variant === (model.variant ?? null))
    return
  local.session.restoreModel({ providerID: model.providerID, modelID: model.id }, model.variant ?? null, true)
}

export const syncPromptModel = (local: Intent, prompt: PromptState) => {
  const intent = local.model.intent()
  const current = prompt.model.current()
  if (!intent.model && intent.variant === undefined) {
    if (current) prompt.model.set(undefined)
    return
  }
  const displayed = intent.model ? undefined : local.model.current()
  const model = intent.model ?? (displayed && { providerID: displayed.provider.id, modelID: displayed.id })
  if (!model) return
  const next = {
    providerID: model.providerID,
    modelID: model.modelID,
    variant: intent.variant,
  }
  if (current?.providerID === next.providerID && current.modelID === next.modelID && current.variant === next.variant)
    return
  prompt.model.set(next)
}

export const restorePromptModel = (
  local: { model: Pick<LocalModel, "intent">; session: Pick<Restore["session"], "restoreModel"> & Partial<Pick<Restore["session"], "inherited">> },
  prompt: PromptState,
) => {
  const model = prompt.model.current()
  if (!model) return false
  const current = local.model.intent()
  if (
    current.model?.providerID === model.providerID &&
    current.model.modelID === model.modelID &&
    current.variant === model.variant &&
    !local.session.inherited?.()
  )
    return true
  local.session.restoreModel({ providerID: model.providerID, modelID: model.modelID }, model.variant)
  return true
}
