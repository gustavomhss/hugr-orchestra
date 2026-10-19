import type { IntegrationMethod, IntegrationOauthConnectOutput } from "../compat/vendored-client-promise"
import { createMemo, type Accessor } from "solid-js"
import { createStore, produce } from "solid-js/store"
import type { useLanguage } from "@/context/language"

export type ConnectMethod = Extract<IntegrationMethod, { type: "key" | "oauth" }>

export function createProviderConnectionState(
  methods: Accessor<ConnectMethod[]>,
  translate: ReturnType<typeof useLanguage>["t"],
) {
  const [store, setStore] = createStore({
    methodIndex: undefined as undefined | number,
    authorization: undefined as undefined | IntegrationOauthConnectOutput["data"],
    promptInputs: undefined as undefined | Record<string, string>,
    state: "pending" as undefined | "pending" | "complete" | "error" | "prompt",
    error: undefined as string | undefined,
    connected: false,
  })

  type Action =
    | { type: "method.select"; index: number }
    | { type: "method.reset" }
    | { type: "auth.prompt" }
    | { type: "auth.inputs"; inputs: Record<string, string> }
    | { type: "auth.pending" }
    | { type: "auth.complete"; authorization: IntegrationOauthConnectOutput["data"] }
    | { type: "auth.error"; error: string }

  function dispatch(action: Action) {
    setStore(
      produce((draft) => {
        if (action.type === "method.select") {
          draft.methodIndex = action.index
          draft.authorization = undefined
          draft.promptInputs = undefined
          draft.state = undefined
          draft.error = undefined
          draft.connected = false
          return
        }
        if (action.type === "method.reset") {
          draft.methodIndex = undefined
          draft.authorization = undefined
          draft.promptInputs = undefined
          draft.state = undefined
          draft.error = undefined
          draft.connected = false
          return
        }
        if (action.type === "auth.prompt") {
          draft.state = "prompt"
          draft.error = undefined
          return
        }
        if (action.type === "auth.inputs") {
          draft.promptInputs = action.inputs
          draft.state = undefined
          draft.error = undefined
          return
        }
        if (action.type === "auth.pending") {
          draft.state = "pending"
          draft.error = undefined
          return
        }
        if (action.type === "auth.complete") {
          draft.state = "complete"
          draft.authorization = action.authorization
          draft.error = undefined
          return
        }
        draft.state = "error"
        draft.error = action.error
      }),
    )
  }

  const method = createMemo(() => (store.methodIndex !== undefined ? methods().at(store.methodIndex!) : undefined))

  const methodLabel = (value?: { type?: string; label?: string }) => {
    if (!value) return ""
    if (value.type === "key") return translate("provider.connect.method.apiKey")
    return value.label ?? ""
  }

  const methodDetails = (value?: { type?: string; label?: string }) => {
    const label = methodLabel(value)
    const suffix = value?.label?.match(/\s+\((browser|headless)\)$/i)
    const hint = suffix?.[1]
    return {
      label: suffix ? label.slice(0, -suffix[0].length) : label,
      hint:
        hint?.toLowerCase() === "headless"
          ? translate("provider.connect.method.headless")
          : hint?.toLowerCase() === "browser" || (!hint && value?.type === "key")
            ? translate("provider.connect.method.browser")
            : undefined,
    }
  }

  return [store, setStore, dispatch, method, methodLabel, methodDetails] as const
}

export function formatError(value: unknown, fallback: string): string {
  if (value && typeof value === "object" && "data" in value) {
    const data = (value as { data?: { message?: unknown } }).data
    if (typeof data?.message === "string" && data.message) return data.message
  }
  if (value && typeof value === "object" && "error" in value) {
    const nested = formatError((value as { error?: unknown }).error, "")
    if (nested) return nested
  }
  if (value && typeof value === "object" && "message" in value) {
    const message = (value as { message?: unknown }).message
    if (typeof message === "string" && message) return message
  }
  if (value instanceof Error && value.message) return value.message
  if (typeof value === "string" && value) return value
  return fallback
}
