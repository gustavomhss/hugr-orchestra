export * as PromptGuard from "./prompt-guard"

import { Context, Effect } from "effect"

export type Guard = { sessionID: string; check: Effect.Effect<void, unknown>; checked: boolean }

export const Current = Context.Reference<Guard | undefined>("~orchestra/PromptExecutionGuard", {
  defaultValue: () => undefined,
})

export function provide<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  sessionID: string,
  beforeModel?: Effect.Effect<void, unknown>,
) {
  return beforeModel
    ? effect.pipe(Effect.provideService(Current, { sessionID, check: beforeModel, checked: false }))
    : effect
}

export function wrap<Input extends { sessionID: string }, A, E, R>(prompt: (input: Input) => Effect.Effect<A, E, R>) {
  return (input: Input, options?: { beforeModel: Effect.Effect<void, unknown> }) =>
    provide(prompt(input), input.sessionID, options?.beforeModel).pipe(Effect.catch(Effect.die))
}

export const check = Effect.fn("PromptExecutionGuard.check")(function* (sessionID: string, consume = true) {
  const guard = yield* Current
  if (!guard || guard.sessionID !== sessionID || guard.checked) return
  yield* guard.check
  if (consume) guard.checked = true
})
