export * as CredentialKeychain from "./keychain"

import { randomBytes } from "node:crypto"
import os from "node:os"
import path from "node:path"
import { Flock } from "../util/flock"

// The OS entry is shared by every profile for this user. XDG/data-directory locks would not serialize it.
export const identity = {
  key: "ai.hugr.orchestra:credential-key",
  dir: path.join(os.homedir(), ".orchestra", "locks"),
}

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
}) {
  const lease = await Flock.acquire(identity.key, {
    dir: input.dir ?? identity.dir,
    signal: input.signal,
    timeoutMs: input.timeoutMs ?? 10_000,
  })
  try {
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
    // Native keychain calls cannot be canceled. Keep ownership until they settle so a late set cannot overwrite
    // a subsequent initializer's key after its caller timed out.
    await lease.release()
  }
}

function decode(text: string) {
  const key = Buffer.from(text.trim(), "base64")
  if (key.length !== 32) throw new Error("The credential key is not 32 bytes")
  return key
}
