import Store from "electron-store"
import electron from "electron"
import { rmSync } from "node:fs"
import { join } from "node:path"

import { SETTINGS_STORE } from "./store-keys"
import { deleteStoreFileIfEmpty } from "./store-cleanup"
import { createStoreWriteBuffer } from "./store-writes"

const cache = new Map<string, Store>()
const writes = createStoreWriteBuffer(openStore)

// Renderer writes are coalesced (see store-writes.ts); flushStoreWrites runs on quit so the last one is kept.
export const setStoreValue = writes.set
export const flushStoreWrites = writes.flush

// We cannot instantiate the electron-store at module load time because
// module import hoisting causes this to run before app.setPath("userData", ...)
// in index.ts has executed, which would result in files being written to the default directory
// (e.g. bad: %APPDATA%\@orchestra\desktop\orchestra.settings vs good: %APPDATA%\ai.hugr.orchestra.dev\orchestra.settings).
export function getStore(name = SETTINGS_STORE) {
  // Readers see buffered renderer writes: apply them before handing the store out.
  writes.flush(name)
  return openStore(name)
}

function openStore(name: string) {
  const cached = cache.get(name)
  if (cached) return cached
  const next = new Store({
    name,
    cwd: electron.app.getPath("userData"),
    fileExtension: "",
    accessPropertiesByDotNotation: false,
  })
  cache.set(name, next)
  return next
}

export async function removeStoreFileIfEmpty(name: string) {
  writes.flush(name)
  if (await deleteStoreFileIfEmpty(electron.app.getPath("userData"), name)) cache.delete(name)
}

export function removeStoreFile(name: string) {
  writes.flush(name)
  rmSync(join(electron.app.getPath("userData"), name), { force: true })
  cache.delete(name)
}
