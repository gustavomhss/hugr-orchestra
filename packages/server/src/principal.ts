export * as Principal from "./principal"

import os from "os"
import { Encoding, Result } from "effect"
import type { HttpServerRequest } from "effect/unstable/http"

/**
 * Who a request acts for, recorded on owner actions (publish, hook install and lifecycle; run release later). The
 * server has no per-person accounts: the signed-in principal is the username of the request's Basic credential, which
 * the Authorization middleware has already verified whenever the server requires a password. A request without one
 * reaches only a server that requires none, where the OS account running the server is the one acting. On such a
 * server a claimed username is not verified, like everything else it accepts.
 */
export function of(request: HttpServerRequest.HttpServerRequest) {
  return username(credential(request)) || account()
}

function credential(request: HttpServerRequest.HttpServerRequest) {
  const token = new URL(request.url, "http://localhost").searchParams.get("auth_token")
  if (token) return token
  return /^Basic\s+(.+)$/i.exec(request.headers.authorization ?? "")?.[1]
}

function username(encoded: string | undefined) {
  if (!encoded) return ""
  const decoded = Encoding.decodeBase64String(encoded)
  if (Result.isFailure(decoded)) return ""
  const separator = decoded.success.indexOf(":")
  return separator === -1 ? "" : decoded.success.slice(0, separator)
}

function account() {
  const user = Result.try(() => os.userInfo().username)
  return Result.isSuccess(user) && user.success ? user.success : "local"
}
