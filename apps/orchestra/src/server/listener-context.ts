import { Context, Schema } from "effect"

export type Binding = { url?: URL }

// Undefined is the unbound CLI path; an empty cell is a listener that is not ready yet.
export const Current = Context.Reference<Binding | undefined>("@orchestra/ListenerContext", {
  defaultValue: () => undefined,
})

export class Unavailable extends Schema.TaggedErrorClass<Unavailable>()("ListenerBindingUnavailable", {
  message: Schema.String,
}) {}

export function requireURL(binding: Binding) {
  if (!binding.url) throw new Unavailable({ message: "Listener URL unavailable before listening" })
  return binding.url
}

export * as ListenerContext from "./listener-context"
