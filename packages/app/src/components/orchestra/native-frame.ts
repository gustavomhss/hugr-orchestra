import { createEffect, onCleanup, onMount } from "solid-js"
import type { NativeTitlebarFrame } from "../../native-titlebar"

export function createNativeTitlebarFrame(input: {
  platform: {
    platform: string
    os?: string
    webviewZoom?: () => number
    windowFullscreen?: () => boolean
    setTitlebarFrame?: (frame?: NativeTitlebarFrame) => Promise<void>
  }
  isDesktop: () => boolean
  useV2Titlebar: () => boolean
  header: () => HTMLElement | undefined
}) {
  const platform = input.platform
  if (platform.platform !== "desktop" || platform.os !== "macos" || !platform.setTitlebarFrame) return
  const setTitlebarFrame = platform.setTitlebarFrame
  onMount(() => {
    const state = {
      raf: undefined as number | undefined,
      frame: undefined as NativeTitlebarFrame | undefined,
      sent: false,
      disposed: false,
    }
    const send = (frame?: NativeTitlebarFrame) => {
      if (
        state.sent &&
        state.frame?.left === frame?.left &&
        state.frame?.top === frame?.top &&
        state.frame?.height === frame?.height
      )
        return
      state.sent = true
      state.frame = frame
      void setTitlebarFrame(frame).catch(() => undefined)
    }
    const request = () => {
      if (state.disposed || state.raf !== undefined) return
      state.raf = window.requestAnimationFrame(() => {
        state.raf = undefined
        if (state.disposed) return
        const header = input.header()
        if (!input.isDesktop() || !input.useV2Titlebar() || platform.windowFullscreen?.() || !header?.isConnected) {
          send()
          return
        }
        // Measure settled CSS geometry; the main process owns native zoom conversion.
        const rect = header.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) {
          send()
          return
        }
        send({ left: rect.left, top: rect.top, height: rect.height })
      })
    }
    const observer = new ResizeObserver(request)
    const header = input.header()
    if (header) {
      observer.observe(header)
      if (header.parentElement) observer.observe(header.parentElement)
    }
    window.addEventListener("resize", request)
    createEffect(() => {
      platform.webviewZoom?.()
      platform.windowFullscreen?.()
      input.useV2Titlebar()
      input.isDesktop()
      request()
    })
    onCleanup(() => {
      state.disposed = true
      if (state.raf !== undefined) window.cancelAnimationFrame(state.raf)
      observer.disconnect()
      window.removeEventListener("resize", request)
      void setTitlebarFrame().catch(() => undefined)
    })
  })
}
