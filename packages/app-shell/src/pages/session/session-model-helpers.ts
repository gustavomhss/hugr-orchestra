import { createEffect, on } from "solid-js"
import type { ModelKey, useLocal } from "@/context/local"
import type { PromptSession } from "@/context/prompt-state"
import type { UserMessage } from "@/v2-wire"

type Local = {
  session: {
    reset(): void
    restore(msg: UserMessage): void
  }
}

type LocalModel = ReturnType<typeof useLocal>["model"]
type Intent = { model: Pick<LocalModel, "current" | "intent"> }
type Restore = { session: { restoreModel(model: ModelKey, variant: string | null | undefined): void } }
type PromptState = Pick<PromptSession, "model">

export const resetSessionModel = (local: Local) => {
  local.session.reset()
}

export const syncSessionModel = (local: Local, msg: UserMessage) => {
  local.session.restore(msg)
}

/**
 * The composer follows the Session: the model of its last user message when it has no choice of its own, and a model
 * the server switched the Session to (a command's own model, another client). Only a change of the Session's recorded
 * model moves it, never a pick in the composer.
 */
export const followSessionModel = (
  local: Local & { model: Pick<LocalModel, "current" | "set"> },
  session: {
    lastUserMessage: () => UserMessage | undefined
    model: () => { providerID: string; id: string } | undefined
    sessionID: () => string | undefined
  },
) => {
  createEffect(
    on(
      () => session.lastUserMessage()?.id,
      () => {
        const msg = session.lastUserMessage()
        if (!msg) return
        syncSessionModel(local, msg)
      },
    ),
  )
  createEffect(
    on(
      () => {
        const model = session.model()
        return model ? { sessionID: session.sessionID(), providerID: model.providerID, id: model.id } : undefined
      },
      (next, previous) => {
        if (!next || !previous || next.sessionID !== previous.sessionID) return
        if (next.providerID === previous.providerID && next.id === previous.id) return
        const current = local.model.current()
        if (current?.provider.id === next.providerID && current.id === next.id) return
        local.model.set({ providerID: next.providerID, modelID: next.id })
      },
      { defer: true },
    ),
  )
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

export const restorePromptModel = (local: { model: Pick<LocalModel, "intent"> } & Restore, prompt: PromptState) => {
  const model = prompt.model.current()
  if (!model) return false
  const current = local.model.intent()
  if (
    current.model?.providerID === model.providerID &&
    current.model.modelID === model.modelID &&
    current.variant === model.variant
  )
    return true
  local.session.restoreModel({ providerID: model.providerID, modelID: model.modelID }, model.variant)
  return true
}
