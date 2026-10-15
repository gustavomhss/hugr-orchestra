import type { AppDockAPI } from "./app-dock-api"
import { buildClickAtProbeScript, buildClickScript, buildElementPointScript, buildFocusScript, buildReadElementScript, buildTypeScript } from "./app-dock-browser"
import type { AppDockContext } from "./app-dock-context"

// Input methods dispatch page scripts through `this.execute` so a wrapper that spreads the dock
// (the Linux coordinator's browser facade) keeps its own execute guard.
export function createAppDockInput(ctx: AppDockContext): Pick<AppDockAPI, "click" | "type" | "clickAt"> & ThisType<AppDockAPI> {
  return {
    async click(senderID: number, tabID: string, ref: number) {
      const record = ctx.tabs.get(senderID)?.get(tabID)
      const view = record?.view
      const win = record?.win
      if (!view || !win) throw new Error("Unknown App Dock tab")
      const beforeURL = view.webContents.getURL()
      const key = `${senderID}:${tabID}`
      const refNamespaceAtStart = ctx.refNamespaces.get(key) ?? 0
      const blockedNavigationVersion = ctx.blockedNavigationVersions.get(key) ?? 0
      const point = await this.execute(senderID, tabID, buildElementPointScript(ref, refNamespaceAtStart))
      if (!point || typeof point !== "object" || !("ok" in point) || point.ok !== true) return point
      if (ctx.refNamespaces.get(key) !== refNamespaceAtStart)
        return { ok: false, ref, trusted: false, error: "Element ref became stale; re-read the page" }
      const target = point as { ok: true; x: number; y: number; tag: string; name?: string; href?: string }
      const isLinkControl = target.tag === "a" || Boolean(target.href)
      const pageFullscreen = await this.execute(senderID, tabID, "Boolean(document.fullscreenElement)").catch(() => false)
      const requiresUserGesture = pageFullscreen || /full\s*screen|fullscreen|tela inteira/i.test(target.name ?? "")
      let navigationBlocked = false
      const waitForNavigation = () => new Promise<void>((resolve) => {
            let timer: NodeJS.Timeout | undefined
            const finish = () => {
              view.webContents.removeListener("did-navigate", finish)
              view.webContents.removeListener("did-navigate-in-page", finish)
              view.webContents.removeListener("will-redirect", blockedRedirect)
              view.webContents.removeListener("will-navigate", blockedNavigate)
              if (timer) clearTimeout(timer)
              resolve()
            }
            const blockedRedirect = (_event: unknown, url: string) => {
              if (URL.canParse(url) && new URL(url).protocol === "https:") return
              navigationBlocked = true
              finish()
            }
            const blockedNavigate = (_event: unknown, url: string) => {
              if (URL.canParse(url) && new URL(url).protocol === "https:") return
              navigationBlocked = true
              finish()
            }
            view.webContents.once("did-navigate", finish)
            view.webContents.once("did-navigate-in-page", finish)
            view.webContents.on("will-redirect", blockedRedirect)
            view.webContents.on("will-navigate", blockedNavigate)
               timer = setTimeout(finish, isLinkControl ? 2_000 : 250)
            })
      const navigationDone = waitForNavigation()
      if (!win.isFocused()) win.focus()
      view.webContents.focus()
      const requiresNativeInput = isLinkControl || requiresUserGesture
      if (!requiresNativeInput) {
        const activated = await this.execute(senderID, tabID, buildClickScript(ref, refNamespaceAtStart))
        if (!activated || typeof activated !== "object" || !("ok" in activated) || activated.ok !== true) return activated
        await navigationDone
        const url = view.webContents.getURL() || beforeURL
        navigationBlocked ||= (ctx.blockedNavigationVersions.get(`${senderID}:${tabID}`) ?? 0) > blockedNavigationVersion
        if (navigationBlocked) return { ok: false, ref, trusted: false, url, navigation: "blocked", error: "Navigation blocked" }
        return {
          ...(activated && typeof activated === "object" ? activated : {}),
          ok: true,
          ref,
          trusted: false,
          url,
          navigated: url !== beforeURL,
          navigation: url !== beforeURL ? "completed" : isLinkControl ? "unchanged" : "not-applicable",
        }
      }
      const fullscreenBefore = requiresUserGesture
        ? await this.execute(senderID, tabID, "({ document: Boolean(document.fullscreenElement), window: window.outerWidth === screen.width && window.outerHeight === screen.height })")
            .catch(() => undefined)
        : undefined
      if (requiresUserGesture && !fullscreenBefore) {
        return { ok: false, ref, trusted: true, error: "Fullscreen state could not be observed before click" }
      }
      const viewport = await this.execute(senderID, tabID, "({ width: innerWidth, height: innerHeight })").catch(() => undefined)
      const viewBounds = view.getBounds()
      const viewportWidth = viewport && typeof viewport === "object" ? Number((viewport as { width?: unknown }).width) : 0
      const viewportHeight = viewport && typeof viewport === "object" ? Number((viewport as { height?: unknown }).height) : 0
      const scaleX = viewportWidth > 1 ? viewBounds.width / viewportWidth : 1
      const scaleY = viewportHeight > 1 ? viewBounds.height / viewportHeight : 1
      const inputX = target.x * scaleX
      const inputY = target.y * scaleY
      if (ctx.refNamespaces.get(key) !== refNamespaceAtStart)
        return { ok: false, ref, trusted: false, error: "Element target became stale; re-read the page" }
      view.webContents.sendInputEvent({ type: "mouseMove", x: inputX, y: inputY })
      view.webContents.sendInputEvent({ type: "mouseDown", x: inputX, y: inputY, button: "left", clickCount: 1 })
      view.webContents.sendInputEvent({ type: "mouseUp", x: inputX, y: inputY, button: "left", clickCount: 1 })
      if (fullscreenBefore && typeof fullscreenBefore === "object") {
        let escapeSent = false
        let domFallback: unknown
        let entryFallback: unknown
        let rawClickSent = false
        if ((fullscreenBefore as Record<string, unknown>).document === false) {
          let entered = await this.execute(senderID, tabID, "Boolean(document.fullscreenElement)").catch(() => false)
          if (!entered) {
            await new Promise((resolve) => setTimeout(resolve, 250))
            entered = await this.execute(senderID, tabID, "Boolean(document.fullscreenElement)").catch(() => false)
          }
          if (!entered) {
            rawClickSent = true
            view.webContents.sendInputEvent({ type: "mouseMove", x: target.x, y: target.y })
            view.webContents.sendInputEvent({ type: "mouseDown", x: target.x, y: target.y, button: "left", clickCount: 1 })
            view.webContents.sendInputEvent({ type: "mouseUp", x: target.x, y: target.y, button: "left", clickCount: 1 })
            await new Promise((resolve) => setTimeout(resolve, 250))
            entered = await this.execute(senderID, tabID, "Boolean(document.fullscreenElement)").catch(() => false)
          }
          if (!entered) {
            entryFallback = await view.webContents.executeJavaScript(buildClickScript(ref, refNamespaceAtStart), true).catch((error: unknown) => ({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }))
            await new Promise((resolve) => setTimeout(resolve, 100))
            entered = await this.execute(senderID, tabID, "Boolean(document.fullscreenElement)").catch(() => false)
          }
        }
        if ((fullscreenBefore as Record<string, unknown>).document === true) {
          let stillDocumentFullscreen = await this.execute(senderID, tabID, "Boolean(document.fullscreenElement)").catch(() => true)
          if (stillDocumentFullscreen) {
            escapeSent = true
            view.webContents.sendInputEvent({ type: "keyDown", keyCode: "ESC" })
            view.webContents.sendInputEvent({ type: "keyUp", keyCode: "ESC" })
            await new Promise((resolve) => setTimeout(resolve, 100))
            stillDocumentFullscreen = await this.execute(senderID, tabID, "Boolean(document.fullscreenElement)").catch(() => true)
          }
          if (stillDocumentFullscreen) {
            domFallback = await view.webContents.executeJavaScript(buildClickScript(ref, refNamespaceAtStart), true).catch((error: unknown) => ({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }))
            await new Promise((resolve) => setTimeout(resolve, 100))
            stillDocumentFullscreen = await this.execute(senderID, tabID, "Boolean(document.fullscreenElement)").catch(() => true)
          }
          if (stillDocumentFullscreen) await view.webContents.executeJavaScript("void document.exitFullscreen?.(); true", true).catch(() => undefined)
        }
        let fullscreenAfter: unknown = fullscreenBefore
        const deadline = Date.now() + 3_000
        while (Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 50))
          fullscreenAfter = await this.execute(
            senderID,
            tabID,
            "({ document: Boolean(document.fullscreenElement), window: window.outerWidth === screen.width && window.outerHeight === screen.height })",
          ).catch(() => fullscreenAfter)
          const beforeDoc = (fullscreenBefore as Record<string, unknown>).document
          const afterDoc = (fullscreenAfter as Record<string, unknown>)?.document
          if (afterDoc !== beforeDoc) break
        }
        const beforeDoc = (fullscreenBefore as Record<string, unknown>).document
        const afterDoc = (fullscreenAfter as Record<string, unknown>)?.document
        if (afterDoc === beforeDoc) {
          return {
            ok: false,
            ref,
            trusted: true,
            error: "Fullscreen transition was not observed",
            diagnostics: {
              before: fullscreenBefore,
              after: fullscreenAfter,
              escapeSent,
              domFallback,
              entryFallback,
              rawClickSent,
              viewBounds,
              inputPoint: { x: inputX, y: inputY },
              viewport,
              windowFullScreen: win.isFullScreen(),
              target: { x: target.x, y: target.y, tag: target.tag, name: target.name },
            },
          }
        }
        if (afterDoc === false && !win.isDestroyed()) win.setFullScreen(false)
      }
      await navigationDone
      let url = view.webContents.getURL() || beforeURL
      let trusted = true
      if (!navigationBlocked && isLinkControl && url === beforeURL) {
        const fallbackNavigation = waitForNavigation()
          const fallback = await this.execute(senderID, tabID, buildClickScript(ref, refNamespaceAtStart)).catch((error: unknown) => ({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }))
        if (!fallback || typeof fallback !== "object" || !("ok" in fallback) || fallback.ok !== true)
          return { ok: false, ref, trusted: false, url, navigation: "unchanged", error: (fallback as { error?: string })?.error ?? "Click failed" }
        await fallbackNavigation
        url = view.webContents.getURL() || beforeURL
        trusted = false
      }
      if (navigationBlocked) return { ok: false, ref, trusted, url, navigation: "blocked", error: "Navigation blocked" }
      return {
        ok: true,
        ref,
        x: target.x,
        y: target.y,
        tag: target.tag,
        trusted,
        url,
        navigated: url !== beforeURL,
        navigation: url !== beforeURL ? "completed" : target.href ? "unchanged" : "not-applicable",
      }
    },
    async type(senderID: number, tabID: string, ref: number, text: string) {
      const namespace = ctx.refNamespaces.get(`${senderID}:${tabID}`) ?? 0
      const focus = await this.execute(senderID, tabID, buildFocusScript(ref, namespace))
      if (!focus || typeof focus !== "object" || !("ok" in focus) || focus.ok !== true) return focus
      const view = ctx.tabs.get(senderID)?.get(tabID)?.view
      if (!view) throw new Error("Unknown App Dock tab")
      const domResult = await this.execute(senderID, tabID, buildTypeScript(ref, text, namespace))
      if (!domResult || typeof domResult !== "object" || !("ok" in domResult) || domResult.ok !== true) return domResult
      const observed = await this.execute(senderID, tabID, buildReadElementScript(ref, namespace))
      if (!observed || typeof observed !== "object" || !("ok" in observed) || observed.ok !== true)
        return { ok: false, ref, text, error: "Input value could not be verified" }
      const value = String((observed as { value?: unknown }).value ?? "")
      if (value !== text) return { ok: false, ref, text, value, error: "Input value did not match requested text" }
      return { ok: true, ref, text, value, trusted: true }
    },
    clickAt(senderID: number, tabID: string, x: number, y: number) {
      const record = ctx.tabs.get(senderID)?.get(tabID)
      if (!record) throw new Error("Unknown App Dock tab")
      const bounds = record.view.getBounds()
      if (bounds.width <= 1 || bounds.height <= 1)
        return Promise.resolve({ ok: false, error: "App Dock tab viewport is not ready; retry after layout", retryable: true })
      const beforeURL = record.view.webContents.getURL()
      const key = `${senderID}:${tabID}`
      const refNamespaceAtStart = ctx.refNamespaces.get(key) ?? 0
      const blockedNavigationVersion = ctx.blockedNavigationVersions.get(key) ?? 0
      return this.execute(senderID, tabID, buildClickAtProbeScript(x, y, refNamespaceAtStart)).then(async (result) => {
        if (!result || typeof result !== "object" || !("ok" in result) || result.ok !== true) return result
        const target = result as { ok: true; tag?: string; href?: string; ref?: number }
        if (ctx.refNamespaces.get(key) !== refNamespaceAtStart)
          return { ok: false, error: "Element target became stale; re-read the page" }
        let observedBlocked = false
        const waitForNavigation = () => new Promise<void>((resolve) => {
               let timer: NodeJS.Timeout | undefined
               const finish = () => {
                 record.view.webContents.removeListener("did-navigate", finish)
                 record.view.webContents.removeListener("did-navigate-in-page", finish)
                 record.view.webContents.removeListener("will-redirect", blockedRedirect)
                 record.view.webContents.removeListener("will-navigate", blockedNavigate)
                 if (timer) clearTimeout(timer)
                 resolve()
               }
               const blockedRedirect = (_event: unknown, url: string) => {
                 if (URL.canParse(url) && new URL(url).protocol === "https:") return
                 observedBlocked = true
                 finish()
               }
               const blockedNavigate = (_event: unknown, url: string) => {
                 if (URL.canParse(url) && new URL(url).protocol === "https:") return
                 observedBlocked = true
                 finish()
               }
               record.view.webContents.once("did-navigate", finish)
               record.view.webContents.once("did-navigate-in-page", finish)
               record.view.webContents.on("will-redirect", blockedRedirect)
               record.view.webContents.on("will-navigate", blockedNavigate)
               timer = setTimeout(finish, target.href ? 2_000 : 250)
             })
        const navigationDone = waitForNavigation()
        if (!record.win.isFocused()) record.win.focus()
        record.view.webContents.focus()
        const viewport = await this.execute(senderID, tabID, "({ width: innerWidth, height: innerHeight })").catch(() => undefined)
        const viewBounds = record.view.getBounds()
        const viewportWidth = viewport && typeof viewport === "object" ? Number((viewport as { width?: unknown }).width) : 0
        const viewportHeight = viewport && typeof viewport === "object" ? Number((viewport as { height?: unknown }).height) : 0
        const scaleX = viewportWidth > 1 ? viewBounds.width / viewportWidth : 1
        const scaleY = viewportHeight > 1 ? viewBounds.height / viewportHeight : 1
        const inputX = x * scaleX
        const inputY = y * scaleY
        if (ctx.refNamespaces.get(key) !== refNamespaceAtStart)
          return { ok: false, error: "Element target became stale; re-read the page" }
        record.view.webContents.sendInputEvent({ type: "mouseMove", x: inputX, y: inputY })
        record.view.webContents.sendInputEvent({ type: "mouseDown", x: inputX, y: inputY, button: "left", clickCount: 1 })
        record.view.webContents.sendInputEvent({ type: "mouseUp", x: inputX, y: inputY, button: "left", clickCount: 1 })
        await navigationDone
        await new Promise((resolve) => setTimeout(resolve, 50))
        const nativeClick = await this.execute(senderID, tabID, "(() => { const probe = window.__orchestraDockClickProbe; if (!probe) return false; const fired = probe.fired(); probe.cleanup(); delete window.__orchestraDockClickProbe; return fired })()")
        let url = record.view.webContents.getURL() || beforeURL
        let trusted = true
        let navigationBlocked = observedBlocked || (ctx.blockedNavigationVersions.get(`${senderID}:${tabID}`) ?? 0) > blockedNavigationVersion
        if (!navigationBlocked && url === beforeURL && !nativeClick && typeof target.ref === "number") {
          const fallbackNavigation = waitForNavigation()
          const fallback = await this.execute(senderID, tabID, buildClickScript(target.ref, refNamespaceAtStart)).catch((error: unknown) => ({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }))
          if (!fallback || typeof fallback !== "object" || !("ok" in fallback) || fallback.ok !== true)
            return { ok: false, ref: target.ref, trusted: false, url, navigation: "unchanged", error: (fallback as { error?: string })?.error ?? "Click failed" }
          await fallbackNavigation
          url = record.view.webContents.getURL() || beforeURL
          trusted = false
        }
        navigationBlocked ||= (ctx.blockedNavigationVersions.get(`${senderID}:${tabID}`) ?? 0) > blockedNavigationVersion
        if (navigationBlocked) return { ok: false, ref: target.ref, trusted, url, navigation: "blocked", error: "Navigation blocked" }
        return {
          ...result,
          trusted,
          url,
          navigated: url !== beforeURL,
          navigation: url !== beforeURL ? "completed" : target.href ? "unchanged" : "not-applicable",
        }
      })
    },
  }
}
