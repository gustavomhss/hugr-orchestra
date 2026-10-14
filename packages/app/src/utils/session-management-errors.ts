export class SessionManagementUnsupported extends Error {
  override readonly name = "SessionManagementUnsupported"
}

/** Typed missing Sessions win over unsupported markers and unknown-route cause statuses. */
export function sessionManagementUnsupported(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const chain: object[] = []
  const seen = new Set<object>()
  let current: unknown = error
  while (current && typeof current === "object" && !seen.has(current)) {
    if ("_tag" in current && current._tag === "SessionNotFoundError") return false
    const body = "body" in current ? current.body : undefined
    if (body && typeof body === "object" && "_tag" in body && body._tag === "SessionNotFoundError") return false
    seen.add(current)
    chain.push(current)
    current = "cause" in current ? current.cause : undefined
  }
  return chain.some((item, index) =>
    item instanceof SessionManagementUnsupported ||
    (index > 0 && "status" in item && (item.status === 404 || item.status === 405 || item.status === 501)),
  )
}
