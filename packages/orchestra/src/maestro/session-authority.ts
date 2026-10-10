import { SessionSchema } from "@orchestra/core/session/schema"
import { Effect, Schema } from "effect"

export class Denied extends Schema.TaggedErrorClass<Denied>()("SessionAuthorityDenied", {
  reason: Schema.String,
}) {}

type StoredSession = {
  readonly id: SessionSchema.ID
  readonly projectID: string
  readonly parentID?: SessionSchema.ID
}

export type Result<A extends StoredSession = StoredSession> = Readonly<{
  rootID: SessionSchema.ID
  execution: A
  /** Actual execution-to-root chain, including both ends. */
  ancestry: readonly SessionSchema.ID[]
}>

/** Share the same storage-backed traversal between V1 producers and consumers; neither supplies authority. */
export function make<A extends StoredSession, E>(lookup: (id: SessionSchema.ID) => Effect.Effect<A | undefined, E>) {
  const chain = Effect.fn("SessionAuthority.chain")(function* (
    id: SessionSchema.ID,
    projectID: string,
    seen: Set<string>,
  ): Effect.fn.Return<readonly [A, ...A[]], Denied> {
    if (seen.has(id)) return yield* new Denied({ reason: "session-parent-cycle" })
    seen.add(id)
    const session = yield* lookup(id).pipe(
      Effect.catchCause(() => Effect.fail(new Denied({ reason: "session-unreadable" }))),
    )
    if (!session) return yield* new Denied({ reason: "session-missing" })
    if (session.projectID !== projectID) return yield* new Denied({ reason: "session-project-mismatch" })
    return session.parentID ? [session, ...(yield* chain(session.parentID, projectID, seen))] : [session]
  })
  return Effect.fn("SessionAuthority.resolve")(function* (executionSessionID: string, projectID: string) {
    const id = yield* Schema.decodeUnknownEffect(SessionSchema.ID)(executionSessionID).pipe(
      Effect.mapError(() => new Denied({ reason: "session-id-invalid" })),
    )
    const sessions = yield* chain(id, projectID, new Set())
    const root = sessions.at(-1)
    if (!root) return yield* new Denied({ reason: "session-missing" })
    return Object.freeze({
      rootID: root.id,
      execution: sessions[0],
      ancestry: Object.freeze(sessions.map((session) => session.id)),
    } satisfies Result<A>)
  })
}

export * as SessionAuthority from "./session-authority"
