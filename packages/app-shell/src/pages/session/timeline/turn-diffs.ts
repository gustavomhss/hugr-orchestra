import type { SnapshotFileDiff } from "@/v2-wire"

import { createStore, produce } from "solid-js/store"

// Sessions whose turn diffs stay cached. Switching between chats keeps the recent ones warm; older ones are dropped.
const sessionLimit = 8

// Per-turn file diffs, kept outside the timeline so leaving a chat and coming back does not ask the server for every
// turn again. Each diff is a snapshot comparison on the server, so a long chat costs one per user message per mount.
export function createTurnDiffs(read: (sessionID: string, messageID: string) => Promise<SnapshotFileDiff[]>) {
  const [files, setFiles] = createStore<Record<string, SnapshotFileDiff[]>>({})
  // Turns fetched, or being fetched, whose diff is final.
  const settled = new Set<string>()
  // Least recently used first.
  const sessions = new Map<string, Set<string>>()

  return {
    files: (messageID: string): SnapshotFileDiff[] | undefined => files[messageID],
    sync(input: { sessionID: string; users: readonly { id: string }[]; running: boolean }) {
      const owned = touch(input.sessionID)
      const last = input.users.at(-1)?.id
      // The last turn keeps changing files while the Session runs, so it is fetched again once the Session goes idle.
      if (input.running && last) settled.delete(last)
      input.users.forEach((message) => {
        if ((input.running && message.id === last) || settled.has(message.id)) return
        settled.add(message.id)
        owned.add(message.id)
        read(input.sessionID, message.id).then(
          (diffs) => {
            // The session may have been evicted while the request was in flight.
            if (sessions.get(input.sessionID)?.has(message.id)) setFiles(message.id, diffs)
          },
          () => settled.delete(message.id),
        )
      })
    },
  }

  function touch(sessionID: string) {
    const owned = sessions.get(sessionID) ?? new Set<string>()
    sessions.delete(sessionID)
    sessions.set(sessionID, owned)
    while (sessions.size > sessionLimit) {
      const [oldest, ids] = sessions.entries().next().value!
      sessions.delete(oldest)
      ids.forEach((id) => settled.delete(id))
      setFiles(
        produce((draft) => {
          ids.forEach((id) => delete draft[id])
        }),
      )
    }
    return owned
  }
}

export type TurnDiffs = ReturnType<typeof createTurnDiffs>

const byOwner = new WeakMap<object, TurnDiffs>()

// One cache per server connection: the owner is the object that dies with the connection.
export function turnDiffsOf(owner: object, read: (sessionID: string, messageID: string) => Promise<SnapshotFileDiff[]>) {
  const existing = byOwner.get(owner)
  if (existing) return existing
  const created = createTurnDiffs(read)
  byOwner.set(owner, created)
  return created
}
