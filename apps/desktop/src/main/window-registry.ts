// Tracks open windows and the persisted window id list used to restore
// windows (and their per-window persisted state) across app launches.
export function createWindowRegistry<W>(persistence: {
  read: () => unknown
  write: (ids: string[]) => void
  cleanup: (id: string) => void
}) {
  const windows = new Map<string, W>()
  let quitting = false
  let lastFocusedID: string | undefined

  const persisted = () => {
    const value = persistence.read()
    if (!Array.isArray(value)) return []
    return value.filter((id): id is string => typeof id === "string" && id.length > 0)
  }

  return {
    persisted,
    setQuitting(value = true) {
      quitting = value
    },
    register(id: string, window: W) {
      const ids = persisted()
      // A new window opened while none is open (macOS keeps running after the
      // last close) replaces the ids kept for restore. Keeping them would
      // reopen those closed windows next launch and never clean their files.
      const stale = windows.size === 0 && !ids.includes(id) ? ids : []
      windows.set(id, window)
      if (!ids.includes(id)) persistence.write(stale.length ? [id] : [...ids, id])
      stale.forEach((item) => persistence.cleanup(item))
    },
    focused(id: string) {
      lastFocusedID = id
    },
    lastFocused() {
      if (!lastFocusedID) return
      return windows.get(lastFocusedID)
    },
    closed(id: string) {
      windows.delete(id)
      if (lastFocusedID === id) lastFocusedID = windows.keys().next().value
      // Only a deliberate close (app keeps running with other windows open)
      // forgets a window. Closing the last window quits the app and fires
      // `closed` before `before-quit`, so treat it as a quit and keep the id
      // for restore on next launch.
      if (quitting || windows.size === 0) return
      persistence.write(persisted().filter((item) => item !== id))
      persistence.cleanup(id)
    },
  }
}
