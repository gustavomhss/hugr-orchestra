import { createHash } from "node:crypto"
import type { AppDockFindResult } from "./app-dock"
import type { AppDockAPI } from "./app-dock-api"
import { buildDragScript, buildEvaluateScript, buildHoverScript, buildNetworkScript, buildScrollScript, buildScrollToScript, buildSnapshotScript, buildStorageScript } from "./app-dock-browser"
import type { SnapshotFormat, SnapshotMode } from "./app-dock-browser"
import { identity, type AppDockContext, type AppDockRefTarget } from "./app-dock-context"
import { appDockZoom } from "./app-dock-utils"

const APP_DOCK_EXECUTION_TIMEOUT_MS = 10_000

type AppDockPageMethods = Pick<
  AppDockAPI,
  | "execute"
  | "read"
  | "find"
  | "stopFind"
  | "zoom"
  | "scroll"
  | "hover"
  | "drag"
  | "storage"
  | "evaluate"
  | "network"
  | "wait"
  | "screenshot"
  | "scrollTo"
>

// Page methods dispatch through `this.execute` rather than a closure so a wrapper that spreads the
// dock (the Linux coordinator's browser facade) keeps its own execute guard for every page script.
export function createAppDockPage(ctx: AppDockContext): AppDockPageMethods & ThisType<AppDockAPI> {
  const readQueues = new Map<string, Promise<unknown>>()
  return {
    async execute(senderID: number, tabID: string, script: string) {
      const record = ctx.tabs.get(senderID)?.get(tabID)
      if (!record) throw new Error("Unknown App Dock tab")
      const generation = record.generation
      let executionTimer: NodeJS.Timeout | undefined
      const execution = record.view.webContents.executeJavaScript(script).catch((error: unknown) => {
        throw new Error(`App Dock page execution failed: ${error instanceof Error ? error.message : String(error)}`)
      })
      const value = await Promise.race([
        execution,
        new Promise<never>((_, reject) => {
          executionTimer = setTimeout(() => reject(new Error("App Dock page execution timed out")), APP_DOCK_EXECUTION_TIMEOUT_MS)
        }),
      ]).finally(() => {
        if (executionTimer) clearTimeout(executionTimer)
      })
      if (!ctx.isCurrent(senderID, tabID, generation)) throw new Error("App Dock tab changed during execution")
      return value
    },
    read(senderID: number, tabID: string, budget: number, maxText: number, shape?: { mode?: SnapshotMode; format?: SnapshotFormat; actionable?: boolean; visible?: boolean }) {
      const key = `${senderID}:${tabID}`
      const namespace = ctx.refNamespaces.get(key) ?? 1
      const flightKey = `${key}:${namespace}:${budget}:${maxText}:${JSON.stringify(shape ?? null)}`
      const pending = readQueues.get(flightKey)
      if (pending) return pending
      const snapshot = (attempt: number): Promise<unknown> => {
        const currentNamespace = ctx.refNamespaces.get(key) ?? 1
        return this.execute(senderID, tabID, buildSnapshotScript({ budget, maxText, namespace: currentNamespace, ...shape })).then((value) => {
          if (ctx.refNamespaces.get(key) !== currentNamespace) {
            if (attempt === 0) return snapshot(1)
            throw new Error("App Dock page changed during read")
          }
          if (value && typeof value === "object" && "items" in value && Array.isArray(value.items) && "url" in value) {
            const targets = new Map<number, AppDockRefTarget>()
            for (const item of value.items) {
              if (!item || typeof item !== "object") continue
              const candidate = item as Record<string, unknown>
              if (
                typeof candidate.ref === "number" &&
                typeof candidate.x === "number" &&
                typeof candidate.y === "number" &&
                typeof candidate.width === "number" &&
                typeof candidate.height === "number" &&
                typeof candidate.tag === "string"
              ) {
                targets.set(candidate.ref, {
                  x: candidate.x,
                  y: candidate.y,
                  width: candidate.width,
                  height: candidate.height,
                  tag: candidate.tag,
                  name: typeof candidate.name === "string" ? candidate.name : "",
                  href: typeof candidate.href === "string" ? candidate.href : undefined,
                  url: String(value.url),
                })
              }
            }
            ctx.refTargets.set(key, targets)
          }
          return value
        })
      }
      const current = snapshot(0)
      readQueues.set(flightKey, current)
      void current.then(
        () => {
          if (readQueues.get(flightKey) === current) readQueues.delete(flightKey)
        },
        () => {
          if (readQueues.get(flightKey) === current) readQueues.delete(flightKey)
        },
      )
      return current
    },
    find(senderID: number, tabID: string, text: string, forward: boolean, notify: (result: AppDockFindResult) => void) {
      const record = ctx.tabs.get(senderID)?.get(tabID)
      if (!record) throw new Error("Unknown App Dock tab")
      const query = text.trim()
      if (!query) throw new Error("Find text is required")
      let requestID = -1
      const listener = (_event: Electron.Event, result: Electron.FoundInPageResult) => {
        if (result.requestId !== requestID || !ctx.isCurrent(senderID, tabID, record.generation)) return
        notify(
          Object.freeze({
            ...identity(tabID, record.generation),
            requestID,
            activeMatchOrdinal: result.activeMatchOrdinal,
            matches: result.matches,
            finalUpdate: result.finalUpdate,
          }),
        )
        if (result.finalUpdate) record.view.webContents.removeListener("found-in-page", listener)
      }
      record.view.webContents.on("found-in-page", listener)
      record.cleanups.push(() => record.view.webContents.removeListener("found-in-page", listener))
      requestID = record.view.webContents.findInPage(query, { forward, findNext: true })
      return requestID
    },
    stopFind(senderID: number, tabID: string) {
      const record = ctx.tabs.get(senderID)?.get(tabID)
      if (!record) throw new Error("Unknown App Dock tab")
      record.view.webContents.stopFindInPage("clearSelection")
    },
    zoom(senderID: number, tabID: string, factor?: number) {
      const record = ctx.tabs.get(senderID)?.get(tabID)
      if (!record) throw new Error("Unknown App Dock tab")
      if (factor !== undefined) record.view.webContents.setZoomFactor(appDockZoom(factor))
      return record.view.webContents.getZoomFactor()
    },
    scroll(senderID: number, tabID: string, direction: "up" | "down" | "top" | "bottom", amount?: number) {
      const record = ctx.tabs.get(senderID)?.get(tabID)
      if (!record) throw new Error("Unknown App Dock tab")
      if (direction !== "up" && direction !== "down" && direction !== "top" && direction !== "bottom")
        throw new Error("Invalid App Dock direction")
      ctx.refTargets.delete(`${senderID}:${tabID}`)
      return this.execute(senderID, tabID, buildScrollScript(direction, amount)) as Promise<{ ok: boolean; direction: string; amount: number; before: { x: number; y: number }; after: { x: number; y: number } }>
    },
    hover(senderID: number, tabID: string, ref: number) {
      const record = ctx.tabs.get(senderID)?.get(tabID)
      if (!record) throw new Error("Unknown App Dock tab")
      return this.execute(senderID, tabID, buildHoverScript(ref, ctx.refNamespaces.get(`${senderID}:${tabID}`) ?? 0))
    },
    drag(senderID: number, tabID: string, fromRef: number, toRef: number) {
      const record = ctx.tabs.get(senderID)?.get(tabID)
      if (!record) throw new Error("Unknown App Dock tab")
      return this.execute(senderID, tabID, buildDragScript(fromRef, toRef, ctx.refNamespaces.get(`${senderID}:${tabID}`) ?? 0))
    },

  /**
   * Retrieves stored data from a dock tab.
   * @senderID - Electron sender identifier
   * @tabID - Target tab identifier
   * @storage - "local" or "session" storage type
   * @key - Storage key to retrieve
   * @returns Promise resolving to { ok, storage, key } or error
   */
    storage(senderID: number, tabID: string, storage: "local" | "session", key: string): Promise<{ ok: boolean; storage: "local" | "session"; key: string; value: string | null }> {
      const record = ctx.tabs.get(senderID)?.get(tabID)
      if (!record) throw new Error("Unknown App Dock tab")
      return this.execute(senderID, tabID, buildStorageScript(storage, key)) as Promise<{ ok: boolean; storage: "local" | "session"; key: string; value: string | null }>
    },
  /**
   * Executes custom JavaScript in a dock tab.
   * @senderID - Electron sender identifier
   * @tabID - Target tab identifier
   * @script - JavaScript string to evaluate
   * @returns Promise resolving to { ok, result } or error
   */
    evaluate(senderID: number, tabID: string, script: string): Promise<{ ok: boolean; result: string }> {
      const record = ctx.tabs.get(senderID)?.get(tabID)
      if (!record) throw new Error("Unknown App Dock tab")
      return this.execute(senderID, tabID, buildEvaluateScript(script)) as Promise<{ ok: boolean; result: string }>
    },
  /**
   * Intercepts network requests in a dock tab.
   * @senderID - Electron sender identifier
   * @tabID - Target tab identifier
   * @config - Configuration: blockUrls, allowedOrigins, blockMethods
   * @returns Promise resolving to { ok, blocked } or error
   */
    network(senderID: number, tabID: string, config: { blockUrls?: string[]; allowedOrigins?: string[]; blockMethods?: string[]; probeUrl?: string; probeMethod?: string }): Promise<{ ok: boolean; blocked: number; requests: number; interceptorReady: boolean }> {
      const record = ctx.tabs.get(senderID)?.get(tabID)
      if (!record) throw new Error("Unknown App Dock tab")
      return this.execute(senderID, tabID, buildNetworkScript(config)) as Promise<{ ok: boolean; blocked: number; requests: number; interceptorReady: boolean }>
    },
    async wait(senderID: number, tabID: string, milliseconds: number): Promise<{ ok: boolean; waitedMs: number }> {
      const record = ctx.tabs.get(senderID)?.get(tabID)
      if (!record) throw new Error("Unknown App Dock tab")
      await new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
      if (!ctx.isCurrent(senderID, tabID, record.generation)) throw new Error("App Dock tab changed during wait")
      return { ok: true, waitedMs: milliseconds }
    },
    async screenshot(senderID: number, tabID: string): Promise<{ mime: "image/png"; bytes: number; prefix: string; sha256: string; data: string }> {
      const record = ctx.tabs.get(senderID)?.get(tabID)
      if (!record) throw new Error("Unknown App Dock tab")
      if (record.win.isDestroyed()) throw new Error("App Dock screenshot unavailable: host window is destroyed")
      if (!record.win.isVisible()) record.win.showInactive()
      const bounds = record.view.getBounds()
      let image
      try {
        image = await record.view.webContents.capturePage({
          x: 0,
          y: 0,
          width: Math.max(1, bounds.width),
          height: Math.max(1, bounds.height),
        })
      } catch (error) {
        try {
          image = await record.win.capturePage()
        } catch (fallbackError) {
          throw new Error(
            `App Dock screenshot unavailable: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}. Keep dock window visible and retry.`,
          )
        }
      }
      const png = image.toPNG()
      if (png.length === 0) throw new Error("App Dock screenshot unavailable: capture returned empty PNG")
      return {
        mime: "image/png",
        bytes: png.length,
        prefix: png.subarray(0, 8).toString("base64"),
        sha256: createHash("sha256").update(png).digest("hex"),
        data: png.toString("base64"),
      }
    },
    scrollTo(senderID: number, tabID: string, x: number, y: number): Promise<{ ok: boolean; x: number; y: number }> {
      const record = ctx.tabs.get(senderID)?.get(tabID)
      if (!record) throw new Error("Unknown App Dock tab")
      ctx.refTargets.delete(`${senderID}:${tabID}`)
      return this.execute(senderID, tabID, buildScrollToScript(x, y)) as Promise<{ ok: boolean; x: number; y: number }>
    },
  }
}
