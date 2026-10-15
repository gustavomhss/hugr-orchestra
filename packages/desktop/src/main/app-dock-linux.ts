export * as AppDockLinux from "./app-dock-linux"

import type { LinuxTab } from "@orchestra/app/app-dock-linux"
import { session, WebContentsView } from "electron"
import type { BrowserWindow, Session, WebContents } from "electron"
import { randomUUID, X509Certificate } from "node:crypto"
import type { AppDockAPI } from "./app-dock-api"
import type { AppDockEvent, AppDockIdentity, AppDockTab, DockBounds, ProfileStorage } from "./app-dock"
import { AppDockLinuxDisplay } from "./app-dock-linux-display"
import { AppDockRuntime, RuntimeError } from "./app-dock-runtime"
import { AppDockURLBridge } from "./app-dock-url-bridge"

const alias = "appdock://linux"
type View = {
  senderID: number
  storageKey: string
  win: BrowserWindow
  tabID: string
  generation?: number
  contents?: WebContents
  admission?: Promise<AppDockTab>
  announced: boolean
  session: Session
  origin: string
  hostname: string
  fingerprint: string
  intent: symbol
  visible: boolean
  ready: boolean
  placement: Readonly<{ runtimeID: string; runtimeEpoch: string }>
  displayed?: boolean
  crashed: boolean
  dispose?: () => void
  bridgeKey?: string
}

type DisplayWindow = { id: number; title: string; classes: string[]; minimized: boolean; focused: boolean }

export function create(options: {
  dock: AppDockAPI
  runtime: ReturnType<typeof AppDockRuntime.create>
  notify: (senderID: number, event: AppDockEvent) => void
}) {
  const views = new Map<string, View>()
  const intents = new Map<number, symbol>()
  const pins = new Map<Session, Set<View>>()
  const authTabs = new Map<string, { view: View; generation: number; expires: number }>()
  const bridge = { pending: undefined as Promise<Awaited<ReturnType<typeof AppDockURLBridge.create>>> | undefined, owner: undefined as View | undefined }
  const claim = (view: View, tab: AppDockTab) => {
    if (!current(view) || !view.bridgeKey || !URL.canParse(tab.url) || new URL(tab.url).protocol !== "https:") return
    for (const [key, flow] of authTabs) if (flow.expires < Date.now() || !current(flow.view)) authTabs.delete(key)
    authTabs.set(`${view.senderID}:${tab.tabID}`, { view, generation: tab.generation, expires: Date.now() + 15 * 60_000 })
  }
  const openURL = async (url: string) => {
    const view = bridge.owner
    if (!view || !view.ready || !view.visible || !current(view)) throw new RuntimeError("failed")
    if (new URL(url).origin === view.origin) throw new RuntimeError("failed")
    const child = view.win.contentView.children.find(child => child instanceof WebContentsView && child.webContents === view.contents)
    if (!child) throw new RuntimeError("failed")
    const queued: AppDockEvent[] = []
    const state = { admitted: false }
    const tab = await options.dock.open(view.senderID, view.win, url, child.getBounds(), event => {
      if (!state.admitted) { queued.push(event); return }
      options.notify(view.senderID, event)
    }, { storageKey: view.storageKey })
    claim(view, tab)
    state.admitted = true
    options.notify(view.senderID, { type: "tab-opened", payload: tab })
    queued.forEach(event => options.notify(view.senderID, event))
  }
  const invalidate = (senderID: number) => {
    intents.set(senderID, Symbol())
  }
  const owns = (senderID: number, identity: AppDockIdentity) =>
    [...views.values()].find(
      (view) => view.senderID === senderID && view.tabID === identity.tabID && view.generation === identity.generation,
    )
  const current = (view: View) =>
    views.get(`${view.senderID}:${view.storageKey}`) === view &&
    !view.win.isDestroyed() &&
    !view.win.webContents.isDestroyed() &&
    !view.crashed &&
    !!view.contents &&
    !view.contents.isDestroyed() &&
    !view.contents.isCrashed() &&
    options.dock.list(view.senderID).some((tab) => tab.tabID === view.tabID && tab.generation === view.generation)
  const discard = (view: View, close = false) => {
    if (views.get(`${view.senderID}:${view.storageKey}`) !== view) return
    views.delete(`${view.senderID}:${view.storageKey}`)
    for (const [key, flow] of authTabs) if (flow.view === view) authTabs.delete(key)
    if (bridge.owner === view) bridge.owner = undefined
    if (views.size === 0) { void bridge.pending?.then(server => server.close()); bridge.pending = undefined }
    view.dispose?.()
    pins.get(view.session)?.delete(view)
    if (
      close &&
      !view.win.isDestroyed() &&
      options.dock.list(view.senderID).some((tab) => tab.tabID === view.tabID && tab.generation === view.generation)
    ) {
      options.dock.close(view.senderID, view.win, view.tabID)
    }
  }
  const visibility = (senderID: number, identity: AppDockIdentity, visible: boolean) => {
    const view = owns(senderID, identity)
    if (!view) return
    view.visible = visible
    if (!current(view)) return
    // A selected native view can remain attached when its owner is minimized or
    // hidden. Throttling=false also masks Chromium's document visibility signal.
    const displayed = visible && view.win.isVisible() && !view.win.isMinimized()
    const throttle = view.ready ? !displayed : false
    if (view.contents!.getBackgroundThrottling() !== throttle) view.contents!.setBackgroundThrottling(throttle)
    if (!view.ready) return
    const origin = JSON.stringify(view.origin)
    if (!URL.canParse(view.contents!.getURL()) || new URL(view.contents!.getURL()).origin !== view.origin) return
    if (view.displayed === displayed) return
    view.displayed = displayed
    void view
      .contents!.executeJavaScript(
        `(() => {
       if (location.origin !== ${origin} || location.pathname !== "/index.html" || typeof client === "undefined" || !client.connected) return false;
       // The HTML5 client also applies per-window batching. The bare protocol
       // signal alone does not stop window painting on Xpra 6.5.
       client[${JSON.stringify(displayed ? "resume" : "suspend")}]();
       if (!${JSON.stringify(displayed)}) {
         client.send_control_refresh(1, {batch: {reset: true, delay: 60000, max_delay: 60000, timeout_delay: 60000, locked: true, always: true}});
       }
       client.send([${JSON.stringify(displayed ? "resume" : "suspend")}]);
      return true;
    })()`,
      )
      .then(applied => {
        if (!applied && view.displayed === displayed) view.displayed = undefined
      })
      .catch(() => {
        if (view.displayed === displayed) view.displayed = undefined
      })
  }
  const present = <T extends { tabID: string; generation: number; url: string }>(senderID: number, tab: T): T =>
    owns(senderID, tab)
      ? {
          ...tab,
          url: alias,
          ...("title" in tab ? { title: alias } : {}),
           ...("favicon" in tab ? { favicon: undefined } : {}),
           ...("canGoBack" in tab ? { canGoBack: false, canGoForward: false } : {}),
        }
      : tab
  const has = (senderID: number, tabID: string) =>
    [...views.values()].some((view) => view.senderID === senderID && view.tabID === tabID)
  const browserTab = (senderID: number, tabID: string) => {
    if (has(senderID, tabID)) throw new RuntimeError("failed")
    invalidate(senderID)
    return tabID
  }
  const windows = async (view: View): Promise<DisplayWindow[]> => {
    if (!view.ready || !current(view) || view.contents!.isLoadingMainFrame() ||
      !URL.canParse(view.contents!.getURL()) || new URL(view.contents!.getURL()).origin !== view.origin ||
      new URL(view.contents!.getURL()).pathname !== "/index.html") throw new RuntimeError("failed")
    const result: unknown = await bounded(view.contents!.executeJavaScript(`(() => {
      if(location.origin!==${JSON.stringify(view.origin)}||location.pathname!=="/index.html"||typeof client==="undefined"||!client.connected)throw new Error("Disconnected Linux display");
      return Object.values(client.id_to_window).filter(w=>!w.tray&&!w.override_redirect).map(w=>({id:w.wid,title:w.title||"",classes:w.metadata["class-instance"]||[],minimized:!!w.minimized,focused:client.focused_wid===w.wid}));
    })()`), Date.now() + 5_000, "Linux windows")
    if (!current(view) || !Array.isArray(result) || !result.every((item): item is DisplayWindow =>
      !!item && typeof item === "object" && Number.isSafeInteger(item.id) && item.id > 0 &&
      typeof item.title === "string" && item.title.length <= 4096 &&
      Array.isArray(item.classes) && item.classes.every((value: unknown) => typeof value === "string" && value.length <= 512) &&
      typeof item.minimized === "boolean" && typeof item.focused === "boolean"
    )) throw new RuntimeError("failed")
    return result
  }
  const focus = async (view: View, windowID: number) => {
    if (!view.visible || !view.ready || !current(view) || !Number.isSafeInteger(windowID) || windowID <= 0)
      throw new RuntimeError("failed")
    const applied = await bounded(view.contents!.executeJavaScript(`(() => {
      if(location.origin!==${JSON.stringify(view.origin)}||location.pathname!=="/index.html"||typeof client==="undefined"||!client.connected)return false;
      const win=client.id_to_window[${windowID}];if(!win||win.tray||win.override_redirect)return false;
      if(win.minimized)win.toggle_minimized();
      win.set_maximized(true);win.focus();return client.focused_wid===win.wid;
    })()`), Date.now() + 5_000, "Linux window activation")
    if (!applied || !current(view)) throw new RuntimeError("failed")
    view.contents!.focus()
  }
  // Renderer controls and the RPC bridge must share this browser-facing boundary.
  const browser: AppDockAPI = {
    ...options.dock,
    nativeWorkspace(senderID, tabID) {
      const view = [...views.values()].find((view) => view.senderID === senderID && view.tabID === tabID)
      if (!view) return undefined
      return { ...view.placement, ready: view.ready && current(view) }
    },
    contents(senderID, tabID) {
      if (has(senderID, tabID)) throw new RuntimeError("failed")
      return options.dock.contents(senderID, tabID)
    },
    async execute(senderID, tabID, script) {
      if (has(senderID, tabID)) throw new RuntimeError("failed")
      return options.dock.execute(senderID, tabID, script)
    },
    async read(senderID, tabID, budget, maxText) {
      if (has(senderID, tabID)) throw new RuntimeError("failed")
      return options.dock.read(senderID, tabID, budget, maxText)
    },
    find(...args) {
      if (has(args[0], args[1])) throw new RuntimeError("failed")
      return options.dock.find(...args)
    },
    stopFind(...args) {
      if (has(args[0], args[1])) throw new RuntimeError("failed")
      return options.dock.stopFind(...args)
    },
    zoom(...args) {
      if (has(args[0], args[1])) throw new RuntimeError("failed")
      return options.dock.zoom(...args)
    },
    open(...args) {
      invalidate(args[0])
      return options.dock.open(...args)
    },
    select(...args) {
      invalidate(args[0])
      return options.dock.select(...args)
    },
    activate(...args) {
      invalidate(args[0])
      return options.dock.activate(...args)
    },
    hide(...args) {
      invalidate(args[0])
      return options.dock.hide(...args)
    },
    close(...args) {
      invalidate(args[0])
      return options.dock.close(...args)
    },
    closeAll(...args) {
      invalidate(args[0])
      return options.dock.closeAll(...args)
    },
    closeTabs(...args) {
      invalidate(args[0])
      return options.dock.closeTabs(...args)
    },
    navigate(senderID, tabID, address) {
      authTabs.delete(`${senderID}:${tabID}`)
      return options.dock.navigate(senderID, browserTab(senderID, tabID), address)
    },
    command(senderID, tabID, command) {
      return options.dock.command(senderID, browserTab(senderID, tabID), command)
    },
    recover(senderID, tabID) {
      authTabs.delete(`${senderID}:${tabID}`)
      return options.dock.recover(senderID, browserTab(senderID, tabID))
    },
    list(senderID) {
      return options.dock.list(senderID).map((tab) => present(senderID, tab))
    },
  }

  return {
    browser,
    async open(
      senderID: number,
      win: BrowserWindow,
      bounds: DockBounds,
      profileStorage: ProfileStorage,
    ): Promise<LinuxTab> {
      invalidate(senderID)
      const intent = intents.get(senderID)!
      const requireIntent = () => {
        if (
          intents.get(senderID) !== intent ||
          win.isDestroyed() ||
          win.webContents.isDestroyed() ||
          win.webContents.id !== senderID
        ) {
          throw new RuntimeError("failed")
        }
      }
      requireIntent()
      // Warm the native helper in the background so the agent's first dock call skips its cold start.
      const prewarm = (tab: LinuxTab) => {
        void options.runtime.native().catch(() => undefined)
        return tab
      }
      if (!/^[A-Za-z0-9_-]{16,128}$/.test(profileStorage.storageKey)) throw new RuntimeError("failed")
      const key = `${senderID}:${profileStorage.storageKey}`
      const connected = views.get(key)
      // Showing an already authenticated view is not another provisioning operation.
      if (
        connected?.ready &&
        current(connected) &&
        URL.canParse(connected.contents!.getURL()) &&
        new URL(connected.contents!.getURL()).origin === connected.origin &&
        new URL(connected.contents!.getURL()).pathname === "/index.html"
      ) {
        connected.intent = intent
        const alive = await bounded(
          connected.contents!.executeJavaScript(`location.origin === ${JSON.stringify(connected.origin)} &&
          location.pathname === "/index.html" && typeof client !== "undefined" && client.connected`),
          Date.now() + 10_000,
          "Linux client connection",
        ).catch(() => false)
        requireIntent()
        if (alive && current(connected)) {
          bridge.owner = connected
          options.dock.select(senderID, win, { tabID: connected.tabID, generation: connected.generation! }, bounds)
          connected.contents!.focus()
          return prewarm({ tabID: connected.tabID, generation: connected.generation!, url: alias })
        }
      }
      // Provisioning belongs to the persistent workspace, not this sender's display admission.
      const runtime = await options.runtime.start().catch(failure)
      requireIntent()
      const deadline = Date.now() + 60_000
      if (!URL.canParse(runtime.url)) throw new RuntimeError("failed")
      const endpoint = new URL(runtime.url)
      if (
        endpoint.protocol !== "https:" ||
        endpoint.hostname !== "127.0.0.1" ||
        endpoint.username ||
        endpoint.password
      ) {
        throw new RuntimeError("failed")
      }
      const previous = views.get(key)
      if (previous?.contents && !current(previous)) discard(previous, true)
      const view: View = views.get(key) ?? {
        senderID,
        storageKey: profileStorage.storageKey,
        win,
        tabID: previous?.tabID ?? randomUUID(),
        session: session.fromPartition(`persist:app-dock-${profileStorage.storageKey}`),
        origin: endpoint.origin,
        hostname: endpoint.hostname,
        fingerprint: runtime.fingerprint.toLowerCase(),
        intent,
        visible: false,
        ready: false,
        placement: { ...runtime.placement },
        crashed: false,
        announced: false,
      }
      const wasReady = view.ready
      view.intent = intent
      view.placement = { ...runtime.placement }
      views.set(key, view)
      bridge.pending ??= AppDockURLBridge.create(openURL)
      const connection = await bridge.pending
      view.bridgeKey = await options.runtime.configureBrowser(connection)
      bridge.owner = view
      if (!view.dispose) {
        const update = () => queueMicrotask(() => {
          if (view.generation !== undefined) visibility(senderID, { tabID: view.tabID, generation: view.generation }, view.visible)
        })
        const resize = () => {
          if (!view.visible || !current(view)) return
          // Occluded renderer documents can miss native resize events and stop
          // ResizeObserver. Ask the trusted owner to resample its panel geometry.
          void win.webContents
            .executeJavaScript(`window.dispatchEvent(new Event("resize"));`)
            .catch(() => undefined)
        }
        win.on("show", update)
        win.on("hide", update)
        win.on("minimize", update)
        win.on("restore", update)
        win.on("resize", resize)
        win.on("restore", resize)
        view.dispose = () => {
          win.removeListener("show", update)
          win.removeListener("hide", update)
          win.removeListener("minimize", update)
          win.removeListener("restore", update)
          win.removeListener("resize", resize)
          win.removeListener("restore", resize)
        }
      }
      const trustedPins = pins.get(view.session) ?? new Set<View>()
      if (!pins.has(view.session)) {
        pins.set(view.session, trustedPins)
        view.session.setCertificateVerifyProc((request, callback) => {
          const owned = [...trustedPins].filter((pin) => pin.hostname === request.hostname)
          if (!owned.length) return callback(-3)
          try {
            const fingerprint = new X509Certificate(request.certificate.data).fingerprint256.toLowerCase()
            callback(owned.some((pin) => pin.fingerprint === fingerprint) ? 0 : -2)
          } catch {
            callback(-2)
          }
        })
      }
      trustedPins.add(view)
      const requireView = () => {
        requireIntent()
        if (!current(view) || options.dock.contents(senderID, view.tabID) !== view.contents)
          throw new RuntimeError("failed")
      }
      const execute = async (script: string, phase: string, pathname: string) => {
        requireView()
        if (!URL.canParse(view.contents!.getURL())) throw new RuntimeError("failed")
        const url = new URL(view.contents!.getURL())
        if (url.origin !== view.origin || url.pathname !== pathname) throw new RuntimeError("failed")
        const result = await bounded(
          view.contents!.executeJavaScript(`(() => {
          if (location.origin !== ${JSON.stringify(view.origin)} || location.pathname !== ${JSON.stringify(pathname)}) return false;
          ${script}
        })()`),
          deadline,
          phase,
        )
        requireView()
        return result
      }
      const wait = async (script: string, phase: string, pathname: string) => {
        while (true) {
          requireView()
          const url = view.contents!.getURL()
          if (
            URL.canParse(url) &&
            new URL(url).origin === view.origin &&
            !view.contents!.isLoadingMainFrame() &&
            (await execute(script, phase, pathname))
          )
            return
          if (url && url !== "about:blank" && (!URL.canParse(url) || new URL(url).origin !== view.origin))
            throw new RuntimeError("failed")
          requireView()
          await bounded(new Promise((resolve) => setTimeout(resolve, 100)), deadline, phase)
        }
      }
      return (async (): Promise<LinuxTab> => {
        if (
          view.ready &&
          view.origin === endpoint.origin &&
          view.fingerprint === runtime.fingerprint.toLowerCase() &&
          current(view)
        ) {
          const url = new URL(view.contents!.getURL())
          if (url.origin !== view.origin || !["/index.html", "/connect.html"].includes(url.pathname))
            throw new RuntimeError("failed")
          // The stock client can return to its trusted connect page after losing
          // transport. Reauthenticate that view instead of treating it as index.
          if (
            url.pathname === "/index.html" &&
            (await execute(
              'return typeof client !== "undefined" && client.connected;',
              "Linux client connection",
              "/index.html",
            ))
          ) {
            requireView()
            options.dock.select(senderID, win, { tabID: view.tabID, generation: view.generation! }, bounds)
            view.contents!.focus()
            return { tabID: view.tabID, generation: view.generation!, url: alias }
          }
        }
        view.ready = false
        view.displayed = undefined
        view.origin = endpoint.origin
        view.hostname = endpoint.hostname
        view.fingerprint = runtime.fingerprint.toLowerCase()
        const connect = new URL("/connect.html", view.origin).href
        const initialNavigation = !view.contents
        if (initialNavigation) {
          requireIntent()
          view.admission ??= options.dock.open(
            senderID,
            win,
            connect,
            bounds,
            (event) => {
              const identity = "identity" in event.payload ? event.payload.identity : event.payload
              if (win.isDestroyed() || win.webContents.isDestroyed()) return
              if (
                !options.dock
                  .list(senderID)
                  .some((tab) => tab.tabID === identity.tabID && tab.generation === identity.generation)
              )
                return
              // HTTPS popups are independent browser tabs, including after their Linux parent closes.
              if (identity.tabID !== view.tabID) {
                if (event.type === "tab-opened") invalidate(senderID)
                options.notify(senderID, event)
                return
              }
              if (views.get(key) !== view) return
              view.generation ??= identity.generation
              if (identity.generation !== view.generation) return
              // Clipboard forwarding is disabled; stock Xpra may probe it during hello.
              if (
                event.type === "permission" &&
                (event.payload.permission === "clipboard-read" ||
                  event.payload.permission === "clipboard-sanitized-write")
              )
                return
              if (event.type === "tab-crashed") view.crashed = true
              if (event.type === "state")
                return options.notify(senderID, {
                  ...event,
                  payload: { ...event.payload, url: alias, title: alias, favicon: undefined, canGoBack: false, canGoForward: false },
                })
              if (event.type === "navigation-error")
                return options.notify(senderID, { ...event, payload: { ...event.payload, url: alias } })
              if (event.type === "tab-opened" || event.type === "tab-recovered")
                return options.notify(senderID, { ...event, payload: present(senderID, event.payload) })
              options.notify(senderID, event)
            },
            profileStorage,
            { tabID: view.tabID, selected: false },
          )
          // A timed-out admission may still finish; only retire that exact generation.
          void view.admission.then(
            (tab) => {
              if (
                views.get(key) !== view &&
                !win.isDestroyed() &&
                options.dock
                  .list(senderID)
                  .some((item) => item.tabID === tab.tabID && item.generation === tab.generation)
              ) {
                options.dock.close(senderID, win, tab.tabID)
              }
            },
            () => undefined,
          )
          const tab = await bounded(view.admission, deadline, "Linux display admission")
          requireIntent()
          view.generation = tab.generation
          view.contents = options.dock.contents(senderID, view.tabID)
          requireView()
          if (!view.announced) {
            view.announced = true
            options.notify(senderID, { type: "tab-opened", payload: present(senderID, tab) })
          }
        }
        requireView()
        // Keep the view inactive, but let the stock client's worker/auth timers run normally.
        view.contents!.setBackgroundThrottling(false)
        if (!initialNavigation && (view.contents!.getURL() !== connect || view.contents!.isLoadingMainFrame()))
          await bounded(view.contents!.loadURL(connect), deadline, "Linux connection page")
        // The stock connect page clears saved parameters after its settings XHR finishes.
        await wait(
          `return document.readyState === "complete" &&
          performance.getEntriesByType("resource").some(entry => entry.name === new URL("./default-settings.txt", location.href).href && entry.responseEnd > 0) &&
          typeof Utilities !== "undefined" && typeof Utilities.setSessionStorageValue === "function";`,
          "Trusted Linux connection page",
          "/connect.html",
        )
        if (
          !(await execute(
            `Utilities.setSessionStorageValue("password", ${JSON.stringify(runtime.password)}); return Utilities.getSessionStorageValue("password") === ${JSON.stringify(runtime.password)};`,
            "Linux client authentication",
            "/connect.html",
          ))
        ) {
          throw new RuntimeError("failed")
        }
        requireView()
        const index = new URL("/index.html", view.origin)
        // Xpra 6.5 counts the incoming connection in its no-steal guard; sharing
        // still keeps other clients connected when takeover admission is enabled.
        index.search = new URLSearchParams({
          username: "dock",
          floating_menu: "false",
          sharing: "true",
          steal: "true",
          clipboard: "false",
          clipboard_poll: "false",
          printing: "false",
          file_transfer: "false",
        }).toString()
        // Install the display floor before the stock client announces its
        // viewport; a hidden or thumbnail-sized view must not shrink the display.
        const floor = () =>
          void view.contents!.executeJavaScript(`(() => {
            if (location.origin !== ${JSON.stringify(view.origin)} || location.pathname !== "/index.html") return false;
            ${AppDockLinuxDisplay.script}
          })()`).catch(() => undefined)
        view.contents!.once("dom-ready", floor)
        await bounded(view.contents!.loadURL(index.href), deadline, "Linux display page").finally(() =>
          view.contents?.removeListener("dom-ready", floor),
        )
        await wait(
          'return typeof client !== "undefined" && client.connected;',
          "Authenticated Linux display",
          "/index.html",
        )
        requireView()
        if (!(await execute(AppDockLinuxDisplay.script, "Linux display size", "/index.html")))
          throw new RuntimeError("failed")
        // Xpra HTML5 21 overwrites its clipboard setting from the server hello.
        // Restore the disabled capability on this connection and future reconnects.
        await execute(
          `const connected = client.on_connect;
          client.on_connect = function(...args) {
            this.clipboard_enabled = false;
            this.clipboard_poll = false;
            this.send(["set-clipboard-enabled", false]);
            return connected.apply(this, args);
          };
          client.clipboard_enabled = false;
          client.clipboard_poll = false;
          client.send(["set-clipboard-enabled", false]);
          return true;`,
          "Linux client capabilities",
          "/index.html",
        )
        // The stock client already includes borders in its outer geometry.
        await bounded(
          view.contents!.insertCSS(".window, .undecorated { box-sizing: border-box; }"),
          deadline,
          "Linux window geometry",
        )
        requireView()
        view.ready = true
        visibility(senderID, { tabID: view.tabID, generation: view.generation! }, view.visible)
        requireView()
        options.dock.select(senderID, win, { tabID: view.tabID, generation: view.generation! }, bounds)
        view.contents!.focus()
        return { tabID: view.tabID, generation: view.generation!, url: alias }
      })().then(prewarm).catch((error: unknown) => {
        if (view.intent === intent && (!wasReady || !view.ready || intents.get(senderID) === intent || !current(view)))
          discard(view, true)
        return failure(error)
      })
    },
    async windows(senderID: number, identity: AppDockIdentity) {
      const view = owns(senderID, identity)
      if (!view) throw new RuntimeError("failed")
      return (await windows(view)).map(window => ({ id: window.id, title: window.title, minimized: window.minimized, focused: window.focused }))
    },
    async focus(senderID: number, identity: AppDockIdentity, windowID: number) {
      const view = owns(senderID, identity)
      if (!view) throw new RuntimeError("failed")
      await focus(view, windowID)
    },
    async launch(senderID: number, appID: string) {
      const view = [...views.values()].find(view => view.senderID === senderID && view.visible && current(view))
      if (!view) throw new RuntimeError("failed")
      const app = await options.runtime.application(appID)
      if (!view.visible || !current(view)) throw new RuntimeError("failed")
      const before = await windows(view)
      const matches = (window: DisplayWindow) => window.classes.some(value => app.classes.some(name => name.toLowerCase() === value.toLowerCase())) || window.title.toLowerCase().includes(app.name.toLowerCase())
      const existing = before.find(window => matches(window) && window.focused) ?? before.find(matches)
      if (existing) return focus(view, existing.id)
      if (!view.visible || !current(view)) throw new RuntimeError("failed")
      await options.runtime.launch(appID)
      const deadline = Date.now() + 15_000
      while (Date.now() < deadline) {
        if (!view.visible || !current(view)) throw new RuntimeError("failed")
        const next = await windows(view)
        const target = next.find(matches) ?? next.find(window => !before.some(previous => previous.id === window.id))
        if (target) return focus(view, target.id)
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      throw new RuntimeError("failed")
    },
    visibility,
    popupOpened(senderID: number, parent: AppDockIdentity, tab: AppDockTab) {
      const inherited = authTabs.get(`${senderID}:${parent.tabID}`)
      const view = owns(senderID, parent) ?? (inherited?.generation === parent.generation && inherited.expires > Date.now() ? inherited.view : undefined)
      if (view) claim(view, tab)
    },
    externalURL(senderID: number, identity: AppDockIdentity, url: string) {
      if (!URL.canParse(url) || new URL(url).protocol !== "slack:") return undefined
      const flow = authTabs.get(`${senderID}:${identity.tabID}`)
      const bridgeKey = flow?.view.bridgeKey
      if (!flow || flow.generation !== identity.generation || flow.expires < Date.now() || !bridgeKey || !current(flow.view) ||
        !options.dock.list(senderID).some(tab => tab.tabID === identity.tabID && tab.generation === identity.generation && URL.canParse(tab.url) && new URL(tab.url).protocol === "https:")) return false
      for (const [key, item] of authTabs) if (item.view === flow.view) authTabs.delete(key)
      const view = flow.view
      void options.runtime.callback(url, bridgeKey).then(() => {
        if (!current(view)) return
        options.dock.activate(senderID, view.win, view.tabID)
        view.contents!.focus()
      }).catch(() => {
        if (current(view)) options.notify(senderID, { type: "navigation-error", payload: { identity, code: "failed", url: "slack://callback" } })
      })
      return true
    },
    allowPopup(senderID: number, identity: AppDockIdentity, url: string) {
      const view = owns(senderID, identity)
      // The privileged client origin must never become an ordinary browser tab.
      return (
        !view ||
        (view.ready && view.visible && current(view) && view.win.isVisible() && !view.win.isMinimized() && URL.canParse(url) && new URL(url).origin !== view.origin)
      )
    },
    closed(senderID: number, identity: AppDockIdentity) {
      authTabs.delete(`${senderID}:${identity.tabID}`)
      const view = owns(senderID, identity)
      if (!view) return
      if (intents.get(senderID) === view.intent) invalidate(senderID)
      discard(view)
    },
    invalidate,
    has,
    present,
    closeSender(senderID: number) {
      invalidate(senderID)
      ;[...views.values()].filter((view) => view.senderID === senderID).forEach((view) => discard(view, true))
      intents.delete(senderID)
    },
  }
}

function bounded<T>(operation: Promise<T>, deadline: number, phase: string): Promise<T> {
  const timeout = Promise.withResolvers<never>()
  const timer = setTimeout(
    () =>
      timeout.reject(
        Object.assign(new RuntimeError("failed"), {
          cause: new Error(`Timed out waiting for ${phase}`),
        }),
      ),
    Math.max(0, deadline - Date.now()),
  )
  return Promise.race([operation, timeout.promise]).finally(() => clearTimeout(timer))
}

function failure(error: unknown): never {
  throw error instanceof RuntimeError ? error : Object.assign(new RuntimeError("failed"), { cause: error })
}
