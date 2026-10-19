export const destroyedWindowURL = "<destroyed>"

type WebContentsURLState = {
  isDestroyed(): boolean
  getURL(): string
}

type WindowURLState = {
  isDestroyed(): boolean
  readonly webContents: WebContentsURLState
}

export function safeWebContentsURL(webContents: WebContentsURLState) {
  try {
    if (webContents.isDestroyed()) return destroyedWindowURL
    return webContents.getURL()
  } catch {
    return destroyedWindowURL
  }
}

export function safeWindowURL(win: WindowURLState) {
  try {
    if (win.isDestroyed()) return destroyedWindowURL
    return safeWebContentsURL(win.webContents)
  } catch {
    return destroyedWindowURL
  }
}

type RevealableWindow = {
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
}

// show() does not un-minimize a window on every platform, so restore it first.
export function revealWindow(win: RevealableWindow) {
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}
