import type { McpServer } from "../../compat/vendored-client-promise"

export async function toggleMcp(input: {
  status: McpServer["status"]["status"]
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  authenticate: () => Promise<void>
  refresh: () => Promise<void>
}) {
  if (input.status === "pending") return
  await {
    connected: input.disconnect,
    needs_auth: input.authenticate,
    disabled: input.connect,
    failed: input.connect,
    needs_client_registration: input.connect,
  }[input.status]()
  await input.refresh()
}

const SIGN_IN_TIMEOUT = 5 * 60_000

/**
 * The V2 sign-in: the server returns the authorization URL, the app opens it, and the server's local OAuth callback
 * finishes the sign-in and reconnects. Resolves once the server leaves `needs_auth`, or on cancel or timeout.
 */
export async function authenticateMcpV2(input: {
  start: () => Promise<{ authorizationUrl: string }>
  status: () => Promise<McpServer["status"]["status"] | undefined>
  open: (url: string) => void
  signal?: AbortSignal
}) {
  const started = await input.start()
  if (!started.authorizationUrl) return
  input.open(started.authorizationUrl)
  const deadline = Date.now() + SIGN_IN_TIMEOUT
  while (!input.signal?.aborted && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    if ((await input.status()) !== "needs_auth") return
  }
}
