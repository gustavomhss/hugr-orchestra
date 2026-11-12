import type { ModelsExecutionInput, ModelsExecutionOutput } from "./generated/types"

export type ModelExecutionState =
  | { readonly status: "idle" | "loading" | "error" }
  | { readonly status: "ready"; readonly response: ModelsExecutionOutput }

/** A response belongs to one live caller generation, even when an aborted transport still resolves. */
export function makeModelExecutionQuery(options: {
  execute: (input: ModelsExecutionInput, options: { signal: AbortSignal }) => Promise<ModelsExecutionOutput>
  changed?: (state: ModelExecutionState) => void
}) {
  const lifetime = { generation: 0, disposed: false, owner: undefined as object | undefined, abort: undefined as AbortController | undefined }
  let state: ModelExecutionState = { status: "idle" }
  const publish = (next: ModelExecutionState) => { state = next; options.changed?.(next) }
  return {
    async load(owner: object, input: ModelsExecutionInput) {
      if (lifetime.disposed) return
      const generation = ++lifetime.generation
      lifetime.abort?.abort()
      const abort = new AbortController()
      lifetime.abort = abort
      lifetime.owner = owner
      const current = () => !lifetime.disposed && lifetime.generation === generation && lifetime.owner === owner
      publish({ status: "loading" })
      try {
        const response = await options.execute(input, { signal: abort.signal })
        if (!current()) return
        publish({ status: "ready", response })
        return response
      } catch {
        if (current()) publish({ status: "error" })
      }
    },
    invalidate() {
      if (lifetime.disposed) return
      lifetime.generation++
      lifetime.abort?.abort()
      lifetime.abort = undefined
      lifetime.owner = undefined
      publish({ status: "idle" })
    },
    read: () => state,
    dispose() {
      if (lifetime.disposed) return
      lifetime.disposed = true
      lifetime.generation++
      lifetime.abort?.abort()
      lifetime.abort = undefined
      lifetime.owner = undefined
      state = { status: "idle" }
    },
  }
}
