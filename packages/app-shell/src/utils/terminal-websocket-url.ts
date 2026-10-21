export function terminalWebSocketURL(input: {
  protocol?: "v2"
  url: string
  id: string
  directory: string
  cursor: number
  ticket?: string
  sameOrigin?: boolean
  username?: string
  password?: string
  authToken?: boolean
}) {
  const next = new URL(`${input.url}/api/pty/${input.id}/connect`)
  next.searchParams.set("location[directory]", input.directory)
  next.searchParams.set("cursor", String(input.cursor))
  next.protocol = next.protocol === "https:" ? "wss:" : "ws:"
  if (input.ticket) {
    next.searchParams.set("ticket", input.ticket)
    return next
  }
  return next
}
