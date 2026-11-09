import type { ServerSDK } from "@/context/server-sdk"

type Api = Pick<ServerSDK["orchestra"]["server.inbox"], "slackStart" | "slackStatus" | "slackCancel" | "slackDisconnect">
type Account = Awaited<ReturnType<Api["slackStatus"]>>["data"]
type Authorization = Awaited<ReturnType<Api["slackStart"]>>["data"]
export type SlackConnectionState = {
  account?: Account
  authorization?: Authorization
  loading: boolean
  busy: boolean
  failed: boolean
}

export function createSlackConnection(input: {
  api: Api
  directory: string
  enabled: boolean
  open: (url: string) => void
  change: (state: SlackConnectionState) => void
  connected: () => void
  pollMs?: number
}) {
  const controller = new AbortController()
  const location = { directory: input.directory }
  const state: { value: SlackConnectionState; disposed: boolean; starting: boolean; timer?: ReturnType<typeof setTimeout> } = {
    value: { loading: false, busy: false, failed: false }, disposed: false, starting: false,
  }
  const change = (patch: Partial<SlackConnectionState>) => {
    if (state.disposed) return
    state.value = { ...state.value, ...patch }
    input.change(state.value)
  }
  const cancel = (id: string) => input.api.slackCancel({ location, id }).catch(() => undefined)
  const poll = async () => {
    const authorization = state.value.authorization
    if (state.disposed || !authorization) return
    if (Date.now() >= authorization.expiresAt) {
      await cancel(authorization.id)
      change({ authorization: undefined, busy: false, failed: true })
      return
    }
    const result = await input.api.slackStatus({ location, id: authorization.id }, { signal: controller.signal })
      .catch(() => undefined)
    if (state.disposed || state.value.authorization?.id !== authorization.id) return
    if (!result || result.data.state !== "pending") {
      const connected = result?.data.state === "connected" && result.data.connected
      if (!connected) await cancel(authorization.id)
      change({ account: result?.data, authorization: undefined, busy: false, failed: !connected })
      if (connected) input.connected()
      return
    }
    state.timer = setTimeout(() => void poll(), input.pollMs ?? 1500)
  }
  return {
    load: async () => {
      if (!input.enabled || state.disposed) return
      change({ loading: true, failed: false })
      const result = await input.api.slackStatus({ location }, { signal: controller.signal }).catch(() => undefined)
      change({ account: result?.data, loading: false, failed: !result })
    },
    start: async () => {
      if (!input.enabled || state.disposed || state.value.busy || state.value.loading) return
      state.starting = true
      change({ busy: true, failed: false })
      const result = await input.api.slackStart({ location }, { signal: controller.signal }).catch(() => undefined)
      state.starting = false
      if (state.disposed) {
        if (result) await cancel(result.data.id)
        controller.abort()
        return
      }
      if (!result) return change({ busy: false, failed: true })
      // Only the fixed provider authorize URL may be opened, even if a server response is malformed.
      const url = URL.canParse(result.data.url) ? new URL(result.data.url) : undefined
      if (url?.origin !== "https://slack.com" || url.pathname !== "/oauth/v2/authorize" || url.username || url.password) {
        await cancel(result.data.id)
        change({ busy: false, failed: true })
        return
      }
      change({ authorization: result.data })
      const opened = await Promise.resolve().then(() => input.open(result.data.url)).then(() => true, () => false)
      if (!opened) {
        await cancel(result.data.id)
        change({ authorization: undefined, busy: false, failed: true })
        return
      }
      void poll()
    },
    cancel: async () => {
      const authorization = state.value.authorization
      if (!authorization) return
      if (state.timer) clearTimeout(state.timer)
      change({ authorization: undefined, busy: false, failed: false })
      await cancel(authorization.id)
    },
    disconnect: async () => {
      if (!input.enabled || state.disposed || state.value.busy) return
      change({ busy: true, failed: false })
      const done = await input.api.slackDisconnect({ location }, { signal: controller.signal }).then(() => true, () => false)
      change({ account: done ? { connected: false, state: "idle" } : state.value.account, busy: false, failed: !done })
      if (done) input.connected()
    },
    dispose: () => {
      if (state.disposed) return
      state.disposed = true
      if (state.timer) clearTimeout(state.timer)
      const authorization = state.value.authorization
      // Let an in-flight start return its attempt id so the late-response branch can cancel it.
      if (authorization) {
        void cancel(authorization.id)
      }
      if (!state.starting) controller.abort()
    },
  }
}
