export * as Principal from "./principal"

import os from "os"
import { Result } from "effect"
import type { HttpServerRequest } from "effect/unstable/http"

/**
 * Who a request acts for, recorded on owner actions (publish, hook install and lifecycle; run release later). The
 * server has no per-person accounts: its Basic credential is one shared service identity (the desktop sidecar always
 * signs in with the same fixed username), so that name says nothing about who acted. The person is the OS account
 * running the server, which is the signed-in user of the machine.
 */
export function of(_request: HttpServerRequest.HttpServerRequest) {
  return account()
}

export function account() {
  const user = Result.try(() => os.userInfo().username)
  return Result.isSuccess(user) && user.success ? user.success : "local"
}
