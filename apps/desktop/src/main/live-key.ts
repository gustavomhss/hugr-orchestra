import { safeStorage } from "electron"

import { getStore } from "./store"

// The live seat's speech-to-text key. It is stored encrypted with the OS keychain (safeStorage) in the desktop
// settings store and never leaves main: no IPC returns it. DEEPGRAM_API_KEY in the environment is the fallback for
// development. The server has no route that hands out provider keys, so the desktop keeps its own.

const KEY = "liveDeepgramKey"

export function readTranscriptionKey() {
  const stored = getStore().get(KEY)
  if (typeof stored === "string" && stored && safeStorage.isEncryptionAvailable())
    return safeStorage.decryptString(Buffer.from(stored, "base64"))
  return process.env.DEEPGRAM_API_KEY?.trim() || undefined
}

export function saveTranscriptionKey(key: string) {
  const value = key.trim()
  if (!value) return getStore().delete(KEY)
  if (!safeStorage.isEncryptionAvailable()) throw new Error("The system keychain is not available to store the key.")
  getStore().set(KEY, safeStorage.encryptString(value).toString("base64"))
}

export function hasTranscriptionKey() {
  return readTranscriptionKey() !== undefined
}
