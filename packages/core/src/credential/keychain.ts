export * as CredentialKeychain from "./keychain"

import { randomBytes } from "node:crypto"
import { mkdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { setTimeout } from "node:timers/promises"

// The OS entry is shared by every profile for this user, independent of XDG/data-directory settings.
export const identity = { file: path.join(os.homedir(), ".orchestra", "locks", "credential-key.sqlite") }

type Store = {
  get: () => Promise<string | null>
  set: (value: string) => Promise<unknown>
}

export async function load(input: {
  store: Store
  beforeCreate: () => Promise<void>
  signal?: AbortSignal
  dir?: string
  timeoutMs?: number
  onWait?: () => void | Promise<void>
}) {
  input.signal?.throwIfAborted()
  const file = input.dir ? path.join(input.dir, "credential-key.sqlite") : identity.file
  await mkdir(path.dirname(file), { recursive: true })
  // Lazy import preserves Node's existing file-key fallback; only Bun enters the OS-keychain path.
  const { Database } = await import("bun:sqlite")
  const db = new Database(file)
  let acquired = false
  try {
    db.exec("PRAGMA busy_timeout = 0")
    const deadline = performance.now() + (input.timeoutMs ?? 10_000)
    let delay = 10
    while (!acquired) {
      input.signal?.throwIfAborted()
      try {
        // SQLite's kernel locks cannot evict a paused live owner and are released on process death. No key or
        // credential is ever written to this database; the transaction exists solely as an OS-user-wide lease.
        db.exec("BEGIN EXCLUSIVE")
        acquired = true
      } catch (error) {
        if (!(error instanceof Error && "code" in error &&
          (error.code === "SQLITE_BUSY" || error.code === "SQLITE_LOCKED"))) throw error
        const remaining = deadline - performance.now()
        if (remaining <= 0) throw new Error("Timed out waiting for credential keychain lock")
        await input.onWait?.()
        await setTimeout(Math.min(delay, remaining), undefined, { signal: input.signal }).catch((error) => {
          input.signal?.throwIfAborted()
          throw error
        })
        delay = Math.min(100, delay * 2)
      }
    }
    input.signal?.throwIfAborted()
    const stored = await input.store.get()
    input.signal?.throwIfAborted()
    if (stored) return decode(stored)
    await input.beforeCreate()
    input.signal?.throwIfAborted()
    await input.store.set(randomBytes(32).toString("base64"))
    const created = await input.store.get()
    input.signal?.throwIfAborted()
    if (!created) throw new Error("The OS keychain did not keep the credential key")
    return decode(created)
  } finally {
    // Native keychain calls cannot be canceled. Keep the transaction until they settle, including after caller
    // timeout, so a late native set cannot replace a key selected by a subsequent initializer.
    try {
      if (acquired) db.exec("ROLLBACK")
    } finally {
      db.close()
    }
  }
}

function decode(text: string) {
  const key = Buffer.from(text.trim(), "base64")
  if (key.length !== 32) throw new Error("The credential key is not 32 bytes")
  return key
}
