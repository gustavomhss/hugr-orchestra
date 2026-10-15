import { createSignal } from "solid-js"

const model = {
  id: "claude-3-7-sonnet",
  name: "Claude 3.7 Sonnet",
  provider: { id: "anthropic" },
  variants: { fast: {}, thinking: {} },
}

// Like the real Local context, every draft and session runs on Maestro.
const agent = { name: "maestro" }

const [variant, setVariant] = createSignal<string | undefined>(undefined)

export function useLocal() {
  return {
    slug: () => "c3Rvcnk=",
    agent: {
      current: () => agent,
    },
    model: {
      current: () => model,
      variant: {
        list: () => Object.keys(model.variants),
        current: () => variant(),
        set(next?: string) {
          setVariant(next)
        },
      },
    },
  }
}

export function LocalProvider(props: { children?: unknown }) {
  return props.children
}
