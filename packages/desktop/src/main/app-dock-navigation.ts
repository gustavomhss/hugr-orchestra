import type { AppDockAPI } from "./app-dock-api"
import { identity, type AppDockContext } from "./app-dock-context"
import { appDockURL } from "./app-dock-utils"

// Navigations of one tab run one after another; each queued step re-checks that the tab generation
// it was requested for is still the current one.
export function createAppDockNavigation(ctx: AppDockContext): Pick<AppDockAPI, "navigate" | "command"> {
  const navigationQueues = new Map<string, Promise<unknown>>()
  return {
    async navigate(senderID: number, tabID: string, address: string): Promise<{ ok: boolean; url: string }> {
      const key = `${senderID}:${tabID}`
      const requested = ctx.tabs.get(senderID)?.get(tabID)
      if (!requested) throw new Error("Unknown App Dock tab")
      const requestedGeneration = requested.generation
      const previous = navigationQueues.get(key)
      const navigation = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(async () => {
        const record = ctx.tabs.get(senderID)?.get(tabID)
        if (!record || record.generation !== requestedGeneration) throw new Error("App Dock tab changed during navigation")
        ctx.refTargets.delete(key)
        let target: string
        try {
          target = appDockURL(address)
        } catch {
          if (ctx.isCurrent(senderID, tabID, record.generation)) {
            record.notify(
              Object.freeze({
                type: "navigation-error",
                payload: Object.freeze({ identity: identity(tabID, record.generation), code: "blocked", url: address }),
              }),
            )
          }
          throw new Error("App Dock only supports HTTPS URLs")
        }
        let navigationTimer: NodeJS.Timeout | undefined
        try {
          await Promise.race([
            record.view.webContents.loadURL(target),
            new Promise<never>((_, reject) => {
              navigationTimer = setTimeout(() => {
                if (!record.view.webContents.isDestroyed() && ctx.isCurrent(senderID, tabID, record.generation)) record.view.webContents.stop()
                reject(new Error("navigation timeout"))
              }, 10_000)
            }),
          ])
        } catch (error) {
          if (ctx.isCurrent(senderID, tabID, record.generation)) {
            record.notify(
              Object.freeze({
                type: "navigation-error",
                payload: Object.freeze({ identity: identity(tabID, record.generation), code: "failed", url: target }),
              }),
            )
          }
          throw new Error("Navigation failed: " + (error instanceof Error ? error.message : String(error)))
        } finally {
          if (navigationTimer) clearTimeout(navigationTimer)
        }
        if (!ctx.isCurrent(senderID, tabID, record.generation)) throw new Error("App Dock tab changed during navigation")
        ctx.refNamespaces.set(key, ctx.nextRefNamespace())
        return { ok: true, url: record.view.webContents.getURL() || target }
      })
      navigationQueues.set(key, navigation)
      try {
        return await navigation
      } finally {
        if (navigationQueues.get(key) === navigation) navigationQueues.delete(key)
      }
    },
    async command(senderID: number, tabID: string, command: "back" | "forward" | "reload"): Promise<{ ok: boolean; navigated: boolean }> {
      const key = `${senderID}:${tabID}`
      const requested = ctx.tabs.get(senderID)?.get(tabID)
      if (!requested) throw new Error("Unknown App Dock tab")
      const requestedGeneration = requested.generation
      const previous = navigationQueues.get(key)
      const queued = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(async () => {
        const record = ctx.tabs.get(senderID)?.get(tabID)
        if (!record || record.generation !== requestedGeneration) throw new Error("App Dock tab changed during navigation")
        ctx.refTargets.delete(key)
        let navigated = false
        if (command === "back" && record.view.webContents.canGoBack()) {
          await record.view.webContents.goBack()
          navigated = true
        } else if (command === "forward" && record.view.webContents.canGoForward()) {
          await record.view.webContents.goForward()
          navigated = true
        } else if (command === "reload") {
          await record.view.webContents.reload()
          navigated = true
        }
        if (!ctx.isCurrent(senderID, tabID, requestedGeneration)) throw new Error("App Dock tab changed during navigation")
        if (navigated) ctx.refNamespaces.set(key, ctx.nextRefNamespace())
        return { ok: true, navigated }
      })
      navigationQueues.set(key, queued)
      try {
        return await queued
      } finally {
        if (navigationQueues.get(key) === queued) navigationQueues.delete(key)
      }
    },
  }
}
