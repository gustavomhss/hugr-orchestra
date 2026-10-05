export type DockBounds = { x: number; y: number; width: number; height: number }

const validBounds = (bounds: DockBounds) =>
  [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isSafeInteger) && bounds.width > 0 && bounds.height > 0

export function panelBoundsToContent(bounds: DockBounds, zoom: number): DockBounds {
  if (!Number.isFinite(zoom) || zoom <= 0 || !validBounds(bounds)) throw new Error("Invalid App Dock bounds")
  const result = {
    x: Math.round(bounds.x / zoom),
    y: Math.round(bounds.y / zoom),
    width: Math.round(bounds.width / zoom),
    height: Math.round(bounds.height / zoom),
  }
  if (!validBounds(result)) throw new Error("Invalid App Dock bounds")
  return result
}

export function appDockURL(value: string) {
  const input = value.trim()
  if (!input) throw new Error("App Dock address is required")
  if (!/^[a-z][a-z\d+.-]*:/i.test(input) && (/\s/.test(input) || !input.includes("."))) {
    return `https://www.google.com/search?q=${encodeURIComponent(input)}`
  }
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`
  const parsed = new URL(candidate)
  if (parsed.protocol !== "https:") throw new Error("App Dock only supports HTTPS URLs")
  return parsed.toString()
}

export function appDockZoom(value: number) {
  if (!Number.isFinite(value)) throw new Error("Invalid App Dock zoom")
  return Math.min(3, Math.max(0.5, value))
}

// Resize and Hide name the tab they were sent for. Only the tab attached to the window now, at that
// generation, takes one: anything else was sent before another tab, a recovery or a new owner took
// the window's place, and must not move or hide the view shown now.
export function appDockAttached<T extends { generation: number }>(
  tabs: ReadonlyMap<string, T> | undefined,
  active: string | undefined,
  tab: Readonly<{ tabID: string; generation: number }>,
) {
  const record = tabs?.get(tab.tabID)
  return active === tab.tabID && record?.generation === tab.generation ? record : undefined
}

// Show may attach any open tab, except an earlier generation of one recovered in place under its ID.
export function appDockShown<T extends { generation: number }>(
  tabs: ReadonlyMap<string, T> | undefined,
  tab: Readonly<{ tabID: string; generation: number }>,
) {
  const record = tabs?.get(tab.tabID)
  if (!record) throw new Error("Unknown App Dock tab")
  return record.generation === tab.generation ? record : undefined
}
