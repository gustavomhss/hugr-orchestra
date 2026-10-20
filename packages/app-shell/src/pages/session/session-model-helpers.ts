import { createEffect, on } from "solid-js"
import type { UserMessage } from "@/v2-types"

type Local = {
  session: {
    reset(): void
    restore(msg: UserMessage): void
  }
}

type ModelSelection = {
  model: {
    current(): { id: string; provider: { id: string } } | undefined
    list?(): readonly { id: string; provider: { id: string } }[]
    set(model: { providerID: string; modelID: string }): void
    variant: {
      current(): string | undefined
      set(variant: string | undefined): void
    }
  }
}

type PromptState = {
  model: {
    current(): { providerID: string; modelID: string; variant?: string | null } | undefined
    set(model: { providerID: string; modelID: string; variant?: string | null }): void
  }
}

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
  local: Local & ModelSelection,
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

export const syncPromptModel = (local: ModelSelection, prompt: PromptState) => {
  const model = local.model.current()
  if (!model) return
  const next = {
    providerID: model.provider.id,
    modelID: model.id,
    variant: local.model.variant.current(),
  }
  const current = prompt.model.current()
  if (current?.providerID === next.providerID && current.modelID === next.modelID && current.variant === next.variant)
    return
  prompt.model.set(next)
}

export const restorePromptModel = (local: ModelSelection, prompt: PromptState) => {
  const model = prompt.model.current()
  if (!model) return false
  const choices = local.model.list?.()
  if (choices && !choices.some((item) => item.provider.id === model.providerID && item.id === model.modelID))
    return false
  const current = local.model.current()
  if (
    current?.provider.id === model.providerID &&
    current.id === model.modelID &&
    local.model.variant.current() === (model.variant ?? undefined)
  )
    return true
  local.model.set({ providerID: model.providerID, modelID: model.modelID })
  local.model.variant.set(model.variant ?? undefined)
  return true
}
