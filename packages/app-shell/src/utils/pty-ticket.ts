import { authTokenFromCredentials } from "@/utils/server"

// Mirrors PTY_CONNECT_TOKEN_HEADER in @orchestra/protocol/groups/pty: the custom header forces a CORS preflight.
const TICKET_HEADER = "x-orchestra-ticket"

/**
 * A browser WebSocket cannot send an Authorization header, so a password-protected server admits the PTY connect only
 * with this short-lived single-use ticket (`POST /api/pty/:id/connect-token`).
 */
export async function fetchPtyTicket(input: {
  url: string
  ptyID: string
  directory: string
  username?: string
  password?: string
  fetch?: typeof globalThis.fetch
  signal?: AbortSignal
}) {
  const target = new URL(`${input.url}/api/pty/${encodeURIComponent(input.ptyID)}/connect-token`)
  target.searchParams.set("location[directory]", input.directory)
  const fetcher = input.fetch ?? globalThis.fetch
  const response = await fetcher(target, {
    method: "POST",
    signal: input.signal,
    headers: {
      [TICKET_HEADER]: "1",
      ...(input.password
        ? { Authorization: `Basic ${authTokenFromCredentials({ username: input.username, password: input.password })}` }
        : {}),
    },
  })
  if (!response.ok) throw new Error(`PTY connect token request failed (HTTP ${response.status})`)
  const body: unknown = await response.json()
  const ticket =
    typeof body === "object" && body !== null && "data" in body && typeof body.data === "object" && body.data !== null && "ticket" in body.data
      ? body.data.ticket
      : undefined
  if (typeof ticket !== "string" || !ticket) throw new Error("PTY connect token response had no ticket")
  return ticket
}
