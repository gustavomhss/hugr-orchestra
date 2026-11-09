import type { ServerSDK } from "@/context/server-sdk"

type Api = Pick<ServerSDK["orchestra"]["server.inbox"], "slackScope" | "slackDiscover" | "slackSelect" | "slackSync">
export type SlackScope = Awaited<ReturnType<Api["slackScope"]>>["data"]
export type SlackScopeState = { scope?: SlackScope; selected: string[]; busy: boolean; failed: boolean; dirty: boolean }

export function createSlackScope(input: {
  api: Api
  directory: string
  change: (state: SlackScopeState) => void
  synced: () => void
}) {
  const controller = new AbortController()
  const location = { directory: input.directory }
  const state: { value: SlackScopeState; disposed: boolean } = {
    value: { selected: [], busy: false, failed: false, dirty: false },
    disposed: false,
  }
  const change = (patch: Partial<SlackScopeState>) => {
    if (state.disposed) return
    state.value = { ...state.value, ...patch }
    input.change(state.value)
  }
  const accept = (scope: SlackScope) => change({ scope, selected: [...scope.selected], dirty: false })
  const run = async (body: () => Promise<void>) => {
    if (state.disposed || state.value.busy) return
    change({ busy: true, failed: false })
    await body().catch(() => change({ failed: true }))
    change({ busy: false })
  }
  return {
    load: () => run(async () => accept((await input.api.slackScope({ location }, { signal: controller.signal })).data)),
    discover: () =>
      run(async () => {
        const scope = state.value.scope
        if (!scope || state.value.dirty) return
        accept(
          (
            await input.api.slackDiscover(
              { location, generation: scope.generation, cursor: scope.cursor },
              { signal: controller.signal },
            )
          ).data,
        )
      }),
    toggle: (id: string, checked: boolean) => {
      if (state.disposed || state.value.busy || !state.value.scope?.conversations.some((item) => item.id === id)) return
      change({
        selected: checked
          ? [...new Set([...state.value.selected, id])]
          : state.value.selected.filter((item) => item !== id),
        dirty: true,
      })
    },
    clear: () => {
      if (!state.disposed && !state.value.busy) change({ selected: [], dirty: true })
    },
    save: () =>
      run(async () => {
        const scope = state.value.scope
        if (!scope) return
        accept(
          (
            await input.api.slackSelect(
              { location, generation: scope.generation, selected: state.value.selected },
              { signal: controller.signal },
            )
          ).data,
        )
      }),
    sync: () =>
      run(async () => {
        const scope = state.value.scope
        if (!scope || state.value.dirty || !scope.selected.length) return
        // User-started bounded batch only. Pending pages survive closing this dialog; another click resumes.
        for (const _ of Array.from({ length: 20 })) {
          if (state.disposed) return
          const next = (
            await input.api.slackSync({ location, generation: scope.generation }, { signal: controller.signal })
          ).data
          if (state.disposed) return
          accept(next)
          if (next.state !== "pending") break
        }
      }).finally(() => {
        if (!state.disposed) input.synced()
      }),
    dispose: () => {
      state.disposed = true
      controller.abort()
    },
  }
}
