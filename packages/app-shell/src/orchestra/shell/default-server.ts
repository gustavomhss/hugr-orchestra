import type { ServerConnection } from "@/context/server"

// The default server is what the app opens on launch, so it moves with the entry it pointed at.
export async function moveDefaultWithReplacedEntry(input: {
  previous: ServerConnection.Key
  next: ServerConnection.Key
  remove: (key: ServerConnection.Key) => void
  getDefault?: () => Promise<ServerConnection.Key | null>
  setDefault?: (key: ServerConnection.Key | null) => Promise<void> | void
  report: (error: unknown) => void
  current?: () => boolean
}) {
  input.remove(input.previous)
  const current = () => input.current?.() ?? true
  const read = input.getDefault?.()
  // A missing read is not a failure. A failed read does not say this entry was the default.
  if (!read) return
  let value: ServerConnection.Key | null
  try {
    value = await read
  } catch (error) {
    if (!current()) return
    console.error(error)
    input.report(error)
    return
  }
  if (!current() || value !== input.previous || !input.setDefault) return
  try {
    await input.setDefault(input.next)
  } catch (error) {
    if (!current()) return
    console.error(error)
    // The old entry is already gone. Leaving its URL stored opens a server the list no longer has.
    await clearRemovedDefault(input.setDefault)
    if (!current()) return
    input.report(error)
  }
}

async function clearRemovedDefault(setDefault: (key: ServerConnection.Key | null) => Promise<void> | void) {
  try {
    await setDefault(null)
  } catch (error) {
    console.error(error)
  }
}
