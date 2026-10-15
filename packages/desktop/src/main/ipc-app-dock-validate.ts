import type { AppDockEvent as CloneableAppDockEvent } from "../preload/types"
import type { DockBounds } from "./app-dock"

export const appDockProfileID = (value: unknown) => {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(value))
    throw new Error("Invalid App Dock profile ID")
  return value
}

export const appDockID = (value: unknown, name: "tab" | "download") => {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Invalid App Dock ${name} ID`)
  return value
}

export const appDockBounds = (value: unknown): DockBounds => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid App Dock bounds")
  const bounds = value as Record<string, unknown>
  if (
    ![bounds.x, bounds.y, bounds.width, bounds.height].every(
      (item) => typeof item === "number" && Number.isFinite(item),
    )
  ) {
    throw new Error("Invalid App Dock bounds")
  }
  return bounds as DockBounds
}

const appDockEventRecord = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid App Dock event")
  return value as Record<string, unknown>
}

const appDockEventString = (value: unknown) => {
  if (typeof value !== "string") throw new Error("Invalid App Dock event")
  return value
}

const appDockEventNumber = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Invalid App Dock event")
  return value
}

const appDockEventBoolean = (value: unknown) => {
  if (typeof value !== "boolean") throw new Error("Invalid App Dock event")
  return value
}

const appDockEventOptionalString = (value: unknown) => {
  if (value === undefined) return undefined
  return appDockEventString(value)
}

const hasExactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))

// Resize, Hide and Show name the tab and generation they target, so the desktop can drop stale ones.
export const appDockTab = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid App Dock tab")
  const tab = value as Record<string, unknown>
  if (
    !hasExactKeys(tab, ["tabID", "generation"]) ||
    typeof tab.tabID !== "string" ||
    tab.tabID.length === 0 ||
    typeof tab.generation !== "number" ||
    !Number.isSafeInteger(tab.generation) ||
    tab.generation < 1
  ) {
    throw new Error("Invalid App Dock tab")
  }
  return { tabID: tab.tabID, generation: tab.generation }
}

const appDockEventIdentity = (value: unknown) => {
  const identity = appDockEventRecord(value)
  if (
    typeof identity.tabID !== "string" ||
    identity.tabID.length === 0 ||
    !Number.isSafeInteger(identity.generation) ||
    appDockEventNumber(identity.generation) < 1
  ) {
    throw new Error("Invalid App Dock event")
  }
  return { tabID: identity.tabID, generation: appDockEventNumber(identity.generation) }
}

export const toCloneableAppDockEvent = (event: unknown): CloneableAppDockEvent => {
  const source = appDockEventRecord(event)
  const payload = appDockEventRecord(source.payload)
  if (!hasExactKeys(source, ["type", "payload"])) throw new Error("Invalid App Dock event")
  if (source.type === "state") {
    if (
      !(
        hasExactKeys(payload, ["tabID", "generation", "url", "title", "loading", "audible", "canGoBack", "canGoForward"]) ||
        hasExactKeys(payload, ["tabID", "generation", "url", "title", "favicon", "loading", "audible", "canGoBack", "canGoForward"])
      )
    ) {
      throw new Error("Invalid App Dock event")
    }
    const identity = appDockEventIdentity(payload)
    return {
      type: "state",
      payload: {
        ...identity,
        url: appDockEventString(payload.url),
        title: appDockEventString(payload.title),
        favicon: appDockEventOptionalString(payload.favicon),
        loading: appDockEventBoolean(payload.loading),
        audible: appDockEventBoolean(payload.audible),
        canGoBack: appDockEventBoolean(payload.canGoBack),
        canGoForward: appDockEventBoolean(payload.canGoForward),
      },
    }
  }
  if (source.type === "tab-opened" || source.type === "tab-opened-background") {
    if (
      !hasExactKeys(payload, ["tabID", "generation", "url"]) ||
      typeof payload.tabID !== "string" ||
      payload.tabID.length === 0 ||
      !Number.isSafeInteger(payload.generation) ||
      appDockEventNumber(payload.generation) < 1 ||
      typeof payload.url !== "string"
    ) {
      throw new Error("Invalid App Dock event")
    }
    return {
      type: source.type,
      payload: {
        tabID: payload.tabID,
        generation: appDockEventNumber(payload.generation),
        url: payload.url,
      },
    }
  }
  if (source.type === "tab-selected") {
    if (!hasExactKeys(payload, ["tabID", "generation"])) throw new Error("Invalid App Dock event")
    return { type: "tab-selected", payload: appDockEventIdentity(payload) }
  }
  if (source.type === "tab-crashed") {
    if (!hasExactKeys(payload, ["identity", "reason"])) throw new Error("Invalid App Dock event")
    const identity = appDockEventIdentity(payload.identity)
    const reason = appDockEventString(payload.reason)
    if (reason !== "crashed" && reason !== "killed" && reason !== "oom") throw new Error("Invalid App Dock event")
    return { type: "tab-crashed", payload: { identity: { ...identity }, reason } }
  }
  if (source.type === "tab-recovered") {
    if (!hasExactKeys(payload, ["tabID", "generation", "url"])) throw new Error("Invalid App Dock event")
    const identity = appDockEventIdentity(payload)
    return { type: "tab-recovered", payload: { ...identity, url: appDockEventString(payload.url) } }
  }
  if (source.type === "download") {
    if (!hasExactKeys(payload, ["id", "tabID", "generation", "filename", "receivedBytes", "totalBytes", "state"]))
      throw new Error("Invalid App Dock event")
    const state = appDockEventString(payload.state)
    if (
      state !== "progressing" &&
      state !== "paused" &&
      state !== "completed" &&
      state !== "cancelled" &&
      state !== "interrupted"
    ) {
      throw new Error("Invalid App Dock event")
    }
    const identity = appDockEventIdentity(payload)
    return {
      type: "download",
      payload: {
        id: appDockEventString(payload.id),
        ...identity,
        filename: appDockEventString(payload.filename),
        receivedBytes: appDockEventNumber(payload.receivedBytes),
        totalBytes: appDockEventNumber(payload.totalBytes),
        state,
      },
    }
  }
  if (source.type === "permission") {
    if (!hasExactKeys(payload, ["identity", "permission", "state"])) throw new Error("Invalid App Dock event")
    const identity = appDockEventIdentity(payload.identity)
    const permission = appDockEventString(payload.permission)
    if (!/^[a-z-]{1,64}$/.test(permission) || payload.state !== "denied") throw new Error("Invalid App Dock event")
    return { type: "permission", payload: { identity: { ...identity }, permission, state: "denied" } }
  }
  if (source.type === "fullscreen") {
    if (!hasExactKeys(payload, ["identity", "enabled"])) throw new Error("Invalid App Dock event")
    const identity = appDockEventIdentity(payload.identity)
    return {
      type: "fullscreen",
      payload: {
        identity: {
          ...identity,
        },
        enabled: appDockEventBoolean(payload.enabled),
      },
    }
  }
  if (source.type === "navigation-error") {
    if (!hasExactKeys(payload, ["identity", "code", "url"])) throw new Error("Invalid App Dock event")
    const identity = appDockEventIdentity(payload.identity)
    const code = appDockEventString(payload.code)
    if (code !== "blocked" && code !== "failed") throw new Error("Invalid App Dock event")
    return {
      type: "navigation-error",
      payload: {
        identity: {
          ...identity,
        },
        code,
        url: appDockEventString(payload.url),
      },
    }
  }
  throw new Error("Unknown App Dock event")
}
