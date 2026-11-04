export * as FileReads from "./file-reads"

import { createHash } from "node:crypto"
import { Context, Effect, Layer } from "effect"
import { makeLocationNode } from "../effect/app-node"
import { FSUtil } from "../fs-util"

// A larger file is not hashed, so a write over it has no stale check; reading it whole would cost more than the guard saves.
const MAX_BYTES = 4 * 1024 * 1024
const MAX_SESSIONS = 200
const MAX_PATHS = 1_000

export interface Interface {
  /** Remembers the bytes the file holds now as what this Session last saw or wrote. Never fails. */
  readonly record: (sessionID: string, path: string) => Effect.Effect<void>
  /** A check on the bytes found at write time, or undefined when this Session has not read or written the file. */
  readonly unchanged: (
    sessionID: string,
    path: string,
  ) => Effect.Effect<((current: Uint8Array) => boolean) | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/FileReads") {}

/**
 * Which file contents each Session has seen: by `read`, or by its own `edit`, `write` and `apply_patch`. `write` replaces
 * a whole file, so it refuses when the file changed since then; a file the Session never read is overwritten as before.
 * Only a digest is kept, and both levels are bounded because Sessions come and go for the life of the process.
 */
const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const sessions = new Map<string, Map<string, string>>()

    const forget = (sessionID: string, path: string) => {
      sessions.get(sessionID)?.delete(path)
    }

    const remember = (sessionID: string, path: string, digest: string) => {
      const known = sessions.get(sessionID) ?? new Map<string, string>()
      // Re-inserting moves the entry to the newest end, which is what the bound evicts from.
      sessions.delete(sessionID)
      sessions.set(sessionID, known)
      known.delete(path)
      known.set(path, digest)
      if (known.size > MAX_PATHS) known.delete(known.keys().next().value!)
      if (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value!)
    }

    const record = Effect.fn("FileReads.record")(function* (sessionID: string, path: string) {
      const info = yield* fs.stat(path)
      if (info.type !== "File" || Number(info.size) > MAX_BYTES) {
        forget(sessionID, path)
        return
      }
      remember(sessionID, path, digest(yield* fs.readFile(path)))
    })

    return Service.of({
      record: (sessionID, path) =>
        record(sessionID, path).pipe(Effect.catch(() => Effect.sync(() => forget(sessionID, path)))),
      unchanged: (sessionID, path) =>
        Effect.sync(() => {
          const expected = sessions.get(sessionID)?.get(path)
          if (expected === undefined) return undefined
          return (current: Uint8Array) => digest(current) === expected
        }),
    })
  }),
)

function digest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex")
}

export const node = makeLocationNode({ service: Service, layer, deps: [FSUtil.node] })
