import { Option, Schema } from "effect"

// A claim records which slot of a task a tab is serving. Claims live in localStorage because every
// tab and window of this origin reads it synchronously; a Web Lock makes check-and-set atomic.
type Claim = { slot: number; at: number; state: "running" | "done" | "failed" }
type ClaimStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">
type Locks = { request: <T>(name: string, options: { ifAvailable?: boolean }, run: (lock: unknown) => T) => Promise<T> }

// A running claim older than this belongs to a tab that died mid-dispatch; the slot may be retried.
export const CLAIM_TTL = 120_000
const PREFIX = "opencode.orchestra.schedule.claim."
const decode = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)

export function createClaims(storage: ClaimStorage, locks: Locks | undefined) {
  const read = (taskID: string) => {
    const value = Option.getOrUndefined(decode(storage.getItem(PREFIX + taskID) ?? ""))
    return isClaim(value) ? value : undefined
  }
  const write = (taskID: string, claim: Claim | undefined) => {
    if (claim) return storage.setItem(PREFIX + taskID, JSON.stringify(claim))
    storage.removeItem(PREFIX + taskID)
  }

  // Forced claims (Run now) wait for the lock and may retry a slot whose last attempt failed.
  const take = (taskID: string, slot: number, now: number, forced: boolean) => {
    const set = () => {
      const current = read(taskID)
      if (current && current.slot > slot) return false
      if (current?.slot === slot) {
        if (current.state === "done") return false
        if (current.state === "running" && now - current.at < CLAIM_TTL) return false
        if (current.state === "failed" && !forced) return false
      }
      write(taskID, { slot, at: now, state: "running" })
      return true
    }
    if (!locks) return Promise.resolve(set())
    return locks.request(`${PREFIX}${taskID}`, forced ? {} : { ifAvailable: true }, (lock) => (lock ? set() : false))
  }

  // `undefined` releases the claim so the slot can be served again.
  const settle = (taskID: string, slot: number, state: "done" | "failed" | undefined) => {
    if (read(taskID)?.slot !== slot) return
    write(taskID, state ? { slot, at: Date.now(), state } : undefined)
  }

  return { take, settle, read, forget: (taskID: string) => write(taskID, undefined) }
}

// localStorage throws when site data is blocked; claims then hold for this page only.
export function claimStorage(): ClaimStorage {
  const memory = new Map<string, string>()
  const fallback = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key),
  }
  try {
    localStorage.setItem(`${PREFIX}probe`, "1")
    localStorage.removeItem(`${PREFIX}probe`)
    return localStorage
  } catch {
    return fallback
  }
}

function isClaim(value: unknown): value is Claim {
  if (typeof value !== "object" || value === null) return false
  const claim = value as Record<string, unknown>
  return (
    Number.isFinite(claim.slot) &&
    Number.isFinite(claim.at) &&
    (claim.state === "running" || claim.state === "done" || claim.state === "failed")
  )
}
