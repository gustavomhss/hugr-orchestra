type ZoomWindow = {
  isDestroyed(): boolean
  webContents: {
    isDestroyed(): boolean
    setZoomFactor(factor: number): void
    getZoomFactor(): number
    send(channel: string, factor: number): void
  }
}

export function setWindowZoom(win: ZoomWindow | null, factor: number, updateTitlebar: () => void) {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return
  if (!Number.isFinite(factor)) throw new Error("Invalid zoom factor")
  win.webContents.setZoomFactor(Math.min(10, Math.max(0.2, factor)))
  updateTitlebar()
  win.webContents.send("zoom-factor-changed", win.webContents.getZoomFactor())
}
