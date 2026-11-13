// A missing transcript is not an eviction. Only a session this store dropped stays out,
// and a pin, a live step, or a row already loaded still projects.
export function keepTranscript(
  dropped: ReadonlySet<string>,
  sessionID: string,
  status: "busy" | "idle" | undefined,
  protectedSession: boolean,
  loaded: boolean,
) {
  return !dropped.has(sessionID) || protectedSession || (status !== undefined && status !== "idle") || loaded
}
