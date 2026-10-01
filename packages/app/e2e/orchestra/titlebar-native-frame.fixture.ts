import { fileURLToPath } from "node:url"
import type { InlineConfig } from "vite"
import solid from "vite-plugin-solid"
import type { NativeTitlebarFrame } from "../../src/native-titlebar"

export type NativeFrameFixture = {
  snapshot(): {
    frames: (NativeTitlebarFrame | null)[]
    reads: number
    requests: number
    completed: number
    cancelled: number
    pending: number
    observers: number
    disconnected: number
    targets: string[]
  }
  update(value: { zoom?: number; fullscreen?: boolean; newLayout?: boolean }): void
  move(left: number, top: number, height: number): void
  stream(): Promise<void>
  dispose(): void
  late(): Promise<void>
  settled(): Promise<void>
}

// Compile the real component. Providers and unrelated UI are fixtures; Solid
// ownership, media queries, layout, ResizeObserver and reporter RAF remain real.
const titlebar = fileURLToPath(new URL("../../src/components/titlebar.tsx", import.meta.url))
const stateModule = `
import { createStore } from "solid-js/store"
export const [state, setState] = createStore({ zoom: 1, fullscreen: false, newLayout: true })
export const records = { frames: [], reads: 0, requests: 0, completed: 0, cancelled: 0, observers: 0, disconnected: 0, targets: [] }
export const callbacks = { raf: [], observers: [] }
const params = new URLSearchParams(location.search)
export const platform = {
  platform: params.get("platform") ?? "desktop",
  os: params.get("os") ?? "macos",
  webviewZoom: () => state.zoom,
  windowFullscreen: () => state.fullscreen,
  setTitlebarFrame: params.has("missing") ? undefined : async (frame) => {
    records.frames.push(frame ?? null)
    if (params.has("reject")) throw new Error("closed window")
  },
}
`
const providersModule = `
import { state, platform } from "frame:state"
export const usePlatform = () => platform
export const useSettings = () => ({ general: {
  newLayoutDesigns: () => state.newLayout,
  mobileTitlebarPosition: () => "top",
  showNavigation: () => true,
} })
export const useLayout = () => ({
  route: () => ({ type: "home" }),
  projects: { list: () => [] },
  home: { selection: () => ({ server: "local" }) },
  sidebar: { opened: () => false },
  mobileSidebar: { opened: () => false },
})
export const useCommand = () => ({ register: () => {}, keybind: () => "", keybindParts: () => [] })
export const useLanguage = () => ({ direction: () => "ltr", t: (key) => key })
export const useTheme = () => ({ mode: () => "dark", setColorScheme: () => {} })
export const useGlobal = () => ({ servers: { list: () => [] } })
export const useServer = () => ({ key: "local" })
export const ServerConnection = { key: (value) => value.key }
export const useTabs = () => ({ store: [], info: {}, ready: () => false })
export const tabKey = () => ""
export const closeProfileTab = () => {}
export const newTabTooltipKeybind = () => []
export const normalizeSessionInfo = (value) => value
export const projectForSession = () => undefined
export const pathKey = (value) => value
export const useNavigate = () => () => {}
export const useLocation = () => ({ pathname: "/", search: "", hash: "" })
export const useParams = () => ({})
export const IconButton = () => null
export const Icon = () => null
export const Button = () => null
export const Tooltip = (props) => props.children
export const TooltipKeybind = Tooltip
export const IconButtonV2 = IconButton
export const KeybindV2 = Icon
export const TooltipV2 = Tooltip
export const WindowsAppMenu = () => null
export const TitlebarTabStrip = () => null
`
const entryModule = `
import { createComponent, render } from "solid-js/web"
import { Titlebar } from ${JSON.stringify(titlebar)}
import { setState, records, callbacks } from "frame:state"
const nativeRAF = window.requestAnimationFrame.bind(window)
const nativeCancel = window.cancelAnimationFrame.bind(window)
const pending = new Set()
const reportWaiters = new Set()
const reportCompleted = () => {
  if (pending.size) return
  reportWaiters.forEach((resolve) => resolve())
  reportWaiters.clear()
}
window.requestAnimationFrame = (callback) => {
  records.requests++
  callbacks.raf.push(callback)
  const id = nativeRAF((time) => {
    pending.delete(id)
    callback(time)
    records.completed++
    reportCompleted()
  })
  pending.add(id)
  return id
}
window.cancelAnimationFrame = (id) => {
  records.cancelled++
  nativeCancel(id)
  pending.delete(id)
  reportCompleted()
}
const reportsDone = () => new Promise((resolve) => {
  reportWaiters.add(resolve)
  reportCompleted()
})
const NativeObserver = window.ResizeObserver
window.ResizeObserver = class extends NativeObserver {
  constructor(callback) {
    super(callback)
    records.observers++
    callbacks.observers.push(() => callback([], this))
  }
  observe(target, options) {
    records.targets.push(target.tagName === "HEADER" ? "header" : target.className)
    super.observe(target, options)
  }
  disconnect() { records.disconnected++; super.disconnect() }
}
const shell = document.querySelector(".orchestra-shell")
if (!shell) throw new Error("Native titlebar fixture shell is missing")
const dispose = render(() => createComponent(Titlebar, {}), shell)
const header = shell.querySelector("header")
if (!header) throw new Error("Titlebar did not render its header")
header.setAttribute("aria-label", "Native titlebar fixture")
const measure = header.getBoundingClientRect.bind(header)
header.getBoundingClientRect = () => { records.reads++; return measure() }
const observed = new Map()
const layoutWaiters = new Set()
// This independent observer acknowledges browser layout delivery. It bypasses
// reporter instrumentation and never schedules a frame or guesses frame counts.
const layoutProbe = new NativeObserver((entries) => {
  entries.forEach((entry) => observed.set(entry.target, {
    width: entry.borderBoxSize[0].inlineSize,
    height: entry.borderBoxSize[0].blockSize,
  }))
  layoutWaiters.forEach((check) => check())
})
layoutProbe.observe(header, { box: "border-box" })
layoutProbe.observe(shell, { box: "border-box" })
const layoutDone = () => {
  if (!header.isConnected) return Promise.resolve()
  const targets = [[header, measure()], [shell, shell.getBoundingClientRect()]]
  return new Promise((resolve) => {
    const check = () => {
      if (!targets.every(([target, rect]) => {
        const size = observed.get(target)
        // Zero is a settled size for a connected header hidden with display:none.
        return size?.width === rect.width && size?.height === rect.height
      })) return
      layoutWaiters.delete(check)
      resolve()
    }
    layoutWaiters.add(check)
    check()
  })
}
const settled = async () => { await layoutDone(); await reportsDone() }
const stream = document.createElement("main")
stream.setAttribute("aria-label", "Chat stream fixture")
stream.style.cssText = "flex:1;min-height:0;overflow:hidden"
shell.append(stream)
window.nativeFrameFixture = {
  snapshot: () => ({ ...structuredClone(records), pending: pending.size }),
  update: (value) => setState(value),
  move: (left, top, height) => {
    shell.style.marginLeft = left + "px"
    shell.style.marginTop = top + "px"
    header.style.height = height + "px"
    window.dispatchEvent(new Event("resize"))
  },
  stream: async () => {
    const delivered = new Promise((resolve) => {
      const observer = new MutationObserver(() => { observer.disconnect(); resolve() })
      observer.observe(stream, { subtree: true, childList: true, characterData: true })
    })
    for (let i = 0; i < 200; i++) {
      stream.textContent += "token "
      stream.append(document.createElement("span"))
    }
    await delivered
    await settled()
  },
  dispose: () => {
    setState("zoom", 0.75)
    window.dispatchEvent(new Event("resize"))
    dispose()
    layoutProbe.disconnect()
  },
  late: async () => {
    callbacks.raf.forEach((callback) => callback(performance.now()))
    callbacks.observers.forEach((callback) => callback())
    window.dispatchEvent(new Event("resize"))
    setState({ zoom: 1.5, newLayout: false, fullscreen: true })
    await reportsDone()
  },
  settled,
}
`

export function nativeFrameViteConfig(cache: string) {
  const mutation = process.env.OPENCODE_NATIVE_FRAME_MUTATION
  const mutations = {
    "wrong-coordinate": {
      from: "send({ left: rect.left, top: rect.top, height: rect.height })",
      to: "send({ left: rect.left + 1, top: rect.top, height: rect.height })",
    },
    cleanup: { from: "state.disposed = true", to: "state.disposed = false" },
    "zero-size-guard": {
      from: `          if (rect.width <= 0 || rect.height <= 0) {
            send()
            return
          }
`,
      to: "",
    },
    "global-mutation-observer": {
      from: "const observer = new ResizeObserver(request)",
      to: `const mutations = new MutationObserver(request)
      mutations.observe(document.body, { subtree: true, childList: true, characterData: true })
      const observer = new ResizeObserver(request)`,
    },
  }
  if (mutation && !Object.hasOwn(mutations, mutation)) throw new Error(`Unknown native frame mutation: ${mutation}`)
  return {
    configFile: false,
    root: fileURLToPath(new URL("../..", import.meta.url)),
    cacheDir: cache,
    plugins: [
      {
        name: "native-frame-fixture",
        enforce: "pre",
        resolveId(source, importer) {
          if (source.startsWith("frame:")) return `\0${source}`
          if (importer !== titlebar) return
          if (source === "@/components/titlebar-session-events")
            return fileURLToPath(new URL("../../src/components/titlebar-session-events.ts", import.meta.url))
          if (
            source.startsWith("@/context/") ||
            source.startsWith("@opencode-ai/ui/") ||
            source === "@solidjs/router" ||
            source === "@/components/titlebar-tab-strip" ||
            source === "./windows-app-menu" ||
            source === "./titlebar-tab-order" ||
            source === "./command-tooltip-keybind" ||
            source === "@/utils/session" ||
            source === "@/pages/layout/helpers" ||
            source === "@/utils/path-key"
          )
            return "\0frame:providers"
          if (source === "./titlebar.css") return "\0frame:empty"
        },
        load(id) {
          if (id === "\0frame:state") return stateModule
          if (id === "\0frame:providers") return providersModule
          if (id === "\0frame:entry") return entryModule
          if (id === "\0frame:empty") return ""
        },
        transform(source, id) {
          if (id !== titlebar || !mutation) return
          const patch = mutations[mutation as keyof typeof mutations]
          if (source.split(patch.from).length !== 2)
            throw new Error(`Native frame mutation ${mutation} requires exactly one source anchor`)
          return source.replace(patch.from, patch.to)
        },
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (!req.url?.startsWith("/native-titlebar-fixture")) return next()
            res.setHeader("Content-Type", "text/html")
            res.end(`<!doctype html><html><head><style>
              * { box-sizing: border-box } body { margin: 0 }
              .orchestra-shell { display: flex; flex-direction: column; width: calc(100% - 24px);
                height: calc(100vh - 24px); margin: 12px; border: 1px solid; overflow: hidden }
              header { position: relative; display: flex; height: 45px; flex-shrink: 0 }
            </style></head><body><div class="orchestra-shell"></div>
            <script type="module" src="/@id/__x00__frame:entry"></script></body></html>`)
          })
        },
      },
      solid({ hot: false }),
    ],
    optimizeDeps: { include: ["solid-js", "solid-js/web", "solid-js/store"], noDiscovery: true },
    server: { host: "127.0.0.1", port: 0, hmr: false },
  } satisfies InlineConfig
}
