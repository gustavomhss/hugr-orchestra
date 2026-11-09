import type { ServerSDK } from "@/context/server-sdk"

type Api = Pick<
  ServerSDK["orchestra"]["server.inbox"],
  | "accounts"
  | "syncWork"
  | "githubPreferences"
  | "githubConfigure"
  | "disconnectAccount"
  | "communicationConfiguration"
  | "communicationConfigure"
  | "communicationDiscover"
  | "gitlabConfiguration"
  | "gitlabConfigure"
  | "notificationConfiguration"
  | "notificationConfigure"
  | "calendarConfiguration"
  | "calendarConfigure"
  | "calendarDiscover"
>
export type WorkAccount = Awaited<ReturnType<Api["syncWork"]>>["data"]
export type GithubPreferences = Awaited<ReturnType<Api["githubPreferences"]>>["data"]
export type WorkSource = Parameters<Api["syncWork"]>[0]["source"]
export type WorkState = {
  calendar?: Awaited<ReturnType<Api["calendarConfiguration"]>>["data"]
  calendars?: Awaited<ReturnType<Api["calendarDiscover"]>>["data"]
  account?: WorkAccount
  preferences?: GithubPreferences
  gitlab?: Awaited<ReturnType<Api["gitlabConfiguration"]>>["data"]
  notification?: Awaited<ReturnType<Api["notificationConfiguration"]>>["data"]
  communication?: Awaited<ReturnType<Api["communicationConfiguration"]>>["data"]
  choices?: Awaited<ReturnType<Api["communicationDiscover"]>>["data"]["choices"]
  repositories: string
  busy: boolean
  failed: boolean
  dirty: boolean
}

export function createWorkSource(input: {
  api: Api
  directory: string
  source: WorkSource
  change: (state: WorkState) => void
  synced: () => void
}) {
  const controller = new AbortController()
  const location = { directory: input.directory }
  const state: { value: WorkState; disposed: boolean } = {
    value: { repositories: "", busy: false, failed: false, dirty: false },
    disposed: false,
  }
  const change = (patch: Partial<WorkState>) => {
    if (state.disposed) return
    state.value = { ...state.value, ...patch }
    input.change(state.value)
  }
  const run = async (body: () => Promise<void>) => {
    if (state.disposed || state.value.busy) return
    change({ busy: true, failed: false })
    await body().catch(() => change({ failed: true }))
    change({ busy: false })
  }
  return {
    load: () =>
      run(async () => {
        const accounts = await input.api.accounts({ location }, { signal: controller.signal })
        if (state.disposed) return
        change({ account: accounts.data.find((account) => account.source === input.source) })
        if (input.source === "calendar") {
          const configuration = (await input.api.calendarConfiguration({ location }, { signal: controller.signal }))
            .data
          if (configuration.generation !== state.value.account?.generation) throw new Error("Connection changed")
          change({ calendar: configuration, calendars: undefined, dirty: false })
          return
        }
        if (input.source === "sentry" || input.source === "trello" || input.source === "pagerduty") {
          const configuration = (
            await input.api.notificationConfiguration({ location, source: input.source }, { signal: controller.signal })
          ).data
          if (configuration.generation !== state.value.account?.generation) throw new Error("Connection changed")
          change({ notification: configuration, repositories: configuration.selected.join("\n"), dirty: false })
          return
        }
        if (input.source === "gitlab") {
          const configuration = (await input.api.gitlabConfiguration({ location }, { signal: controller.signal })).data
          if (configuration.generation !== state.value.account?.generation) throw new Error("Connection changed")
          change({ gitlab: configuration, repositories: configuration.projects.join("\n"), dirty: false })
          return
        }
        if (input.source === "mail" || input.source === "teams" || input.source === "discord") {
          const configuration = (
            await input.api.communicationConfiguration(
              { location, source: input.source },
              { signal: controller.signal },
            )
          ).data
          if (configuration.generation !== state.value.account?.generation) throw new Error("Connection changed")
          change({ communication: configuration, choices: undefined, dirty: false })
          return
        }
        if (input.source !== "github") return
        const preferences = (await input.api.githubPreferences({ location }, { signal: controller.signal })).data
        if (preferences.generation !== state.value.account?.generation) throw new Error("Connection changed")
        change({ preferences, repositories: preferences.repositories.join("\n"), dirty: false })
      }),
    repositories: (text: string) => {
      if (!state.disposed && !state.value.busy) change({ repositories: text, dirty: true })
    },
    toggle: (key: "reviews" | "mentions" | "assignments" | "ownCi", checked: boolean) => {
      if (state.disposed || state.value.busy || !state.value.preferences) return
      change({ preferences: { ...state.value.preferences, [key]: checked }, dirty: true })
    },
    save: () =>
      run(async () => {
        if (state.value.calendar) {
          const result = await input.api.calendarConfigure(
            { location, ...state.value.calendar },
            { signal: controller.signal },
          )
          change({
            calendar: result.data,
            dirty: false,
            account: state.value.account
              ? {
                  ...state.value.account,
                  state:
                    state.value.account.retryAt && state.value.account.retryAt > Date.now() ? "rate_limited" : "idle",
                }
              : undefined,
          })
          return
        }
        if (state.value.notification) {
          const result = await input.api.notificationConfigure(
            {
              location,
              ...state.value.notification,
              selected: [...new Set(state.value.repositories.split(/[\s,]+/).filter(Boolean))],
            },
            { signal: controller.signal },
          )
          change({
            notification: result.data,
            repositories: result.data.selected.join("\n"),
            dirty: false,
            account: state.value.account
              ? {
                  ...state.value.account,
                  state:
                    state.value.account.retryAt && state.value.account.retryAt > Date.now() ? "rate_limited" : "idle",
                }
              : undefined,
          })
          return
        }
        if (state.value.gitlab) {
          const result = await input.api.gitlabConfigure(
            {
              location,
              generation: state.value.gitlab.generation,
              projects: [...new Set(state.value.repositories.split(/[\s,]+/).filter(Boolean))],
            },
            { signal: controller.signal },
          )
          change({
            gitlab: result.data,
            repositories: result.data.projects.join("\n"),
            dirty: false,
            account: state.value.account
              ? {
                  ...state.value.account,
                  state:
                    state.value.account.retryAt && state.value.account.retryAt > Date.now() ? "rate_limited" : "idle",
                }
              : undefined,
          })
          return
        }
        if (state.value.communication) {
          const result = await input.api.communicationConfigure(
            { location, ...state.value.communication },
            { signal: controller.signal },
          )
          change({
            communication: result.data,
            dirty: false,
            account: state.value.account
              ? {
                  ...state.value.account,
                  state:
                    state.value.account.retryAt && state.value.account.retryAt > Date.now() ? "rate_limited" : "idle",
                }
              : undefined,
          })
          return
        }
        if (input.source !== "github" || !state.value.preferences) return
        const repositories = [...new Set(state.value.repositories.split(/[\s,]+/).filter(Boolean))]
        const result = await input.api.githubConfigure(
          { location, ...state.value.preferences, repositories },
          { signal: controller.signal },
        )
        const account = state.value.account
        change({
          preferences: result.data,
          repositories: result.data.repositories.join("\n"),
          dirty: false,
          account: account
            ? { ...account, state: account.retryAt && account.retryAt > Date.now() ? "rate_limited" : "idle" }
            : undefined,
        })
      }),
    discoverCalendars: () =>
      run(async () => {
        if (!state.value.calendar) return
        const result = await input.api.calendarDiscover(
          { location, generation: state.value.calendar.generation },
          { signal: controller.signal },
        )
        change({ calendars: result.data })
      }),
    selectCalendar: (id: string, checked: boolean) => {
      if (state.disposed || state.value.busy || !state.value.calendar) return
      change({
        calendar: {
          ...state.value.calendar,
          selected: checked
            ? [...new Set([...state.value.calendar.selected, id])]
            : state.value.calendar.selected.filter((calendar) => calendar !== id),
        },
        dirty: true,
      })
    },
    sentry: (field: "organization" | "environment", value: string) => {
      if (state.disposed || state.value.busy || state.value.notification?.source !== "sentry") return
      change({ notification: { ...state.value.notification, [field]: value || undefined }, dirty: true })
    },
    relevance: (value: "review" | "assigned") => {
      if (state.disposed || state.value.busy || state.value.notification?.source !== "sentry") return
      change({ notification: { ...state.value.notification, relevance: value }, dirty: true })
    },
    discover: () =>
      run(async () => {
        if (
          !state.value.communication ||
          (input.source !== "mail" && input.source !== "teams" && input.source !== "discord")
        )
          return
        const result = (
          await input.api.communicationDiscover(
            { location, source: input.source, generation: state.value.communication.generation },
            { signal: controller.signal },
          )
        ).data
        if (result.generation !== state.value.communication.generation) throw new Error("Connection changed")
        change({ choices: result.choices })
      }),
    select: (id: string, checked: boolean) => {
      if (state.disposed || state.value.busy || !state.value.communication) return
      change({
        communication: {
          ...state.value.communication,
          selected: checked
            ? [...new Set([...state.value.communication.selected, id])]
            : state.value.communication.selected.filter((value) => value !== id),
        },
        dirty: true,
      })
    },
    unread: (checked: boolean) => {
      if (state.disposed || state.value.busy || !state.value.communication || input.source !== "mail") return
      change({ communication: { ...state.value.communication, unreadOnly: checked }, dirty: true })
    },
    sync: () =>
      run(async () => {
        if (state.value.dirty || !state.value.account?.connected || !state.value.account.generation) return
        const account = (
          await input.api.syncWork(
            { location, source: input.source, generation: state.value.account.generation },
            { signal: controller.signal },
          )
        ).data
        if (state.disposed) return
        change({ account })
        input.synced()
      }),
    disconnect: () =>
      run(async () => {
        if (!state.value.account?.generation) return
        await input.api.disconnectAccount(
          { location, source: input.source, generation: state.value.account.generation },
          { signal: controller.signal },
        )
        if (state.disposed) return
        change({
          account: { source: input.source, connected: false, state: "idle" },
          preferences: undefined,
          gitlab: undefined,
          notification: undefined,
          calendar: undefined,
          calendars: undefined,
          communication: undefined,
          choices: undefined,
          repositories: "",
          dirty: false,
        })
        input.synced()
      }),
    dispose: () => {
      state.disposed = true
      controller.abort()
    },
  }
}
