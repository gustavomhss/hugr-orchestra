// @atlas/adapter-io — src/surface/compose-with.ts  (the ratify token for one composed write)
//
// `composeRuntime` reads `ATLAS_RATIFY_TOKEN` from the environment once, synchronously, while it composes
// (compose.ts:175), and closes over it. A write that carries `token` sets the variable for exactly that one
// synchronous `composeRuntime` call and restores the previous value before anything else can run. Shared by
// ./index.ts (promote, draft, emit, link) and ./review.ts (decide).

import { composeRuntime } from "../compose.js"
import type { ComposedRuntime } from "../compose.js"

/** `composeRuntime`, with `ATLAS_RATIFY_TOKEN` set to `token` for that one synchronous call when a token is given. */
export function composeWith(repoPath: string, token: string | undefined): ComposedRuntime {
  if (token === undefined) return composeRuntime(repoPath)
  const prior = process.env.ATLAS_RATIFY_TOKEN
  process.env.ATLAS_RATIFY_TOKEN = token
  try {
    return composeRuntime(repoPath)
  } finally {
    restoreToken(prior)
  }
}

function restoreToken(prior: string | undefined): void {
  if (prior === undefined) {
    delete process.env.ATLAS_RATIFY_TOKEN
    return
  }
  process.env.ATLAS_RATIFY_TOKEN = prior
}
