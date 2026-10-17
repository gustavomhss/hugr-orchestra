import { createComponent, createEffect, ErrorBoundary, on, type JSX, type ParentProps } from "solid-js"

// Only an errored route watches identity for reset. Healthy session switches keep
// their directory providers, terminals and timeline subtree mounted.
export function SessionLineageBoundary(
  props: ParentProps<{ identity: () => string; fallback: (error: unknown) => JSX.Element }>,
) {
  return createComponent(ErrorBoundary, {
    fallback: (error, reset) => {
      createEffect(on(props.identity, () => reset(), { defer: true }))
      return props.fallback(error)
    },
    get children() {
      return props.children
    },
  })
}
